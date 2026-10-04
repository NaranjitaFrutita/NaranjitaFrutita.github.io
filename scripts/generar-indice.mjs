// Recorre /banco, lee los datos de cada SVG y escribe banco/index.json
// Uso:  node scripts/generar-indice.mjs
//
// Datos que lee de cada SVG:
//   <title>        → título
//   <desc>         → descripción
//   <metadata>     → JSON con "etiquetas" (separadas por comas) y "autor"
// Si el SVG viene de Inkscape (Propiedades del documento › Metadatos) también
// entiende dc:title, dc:description, dc:creator y dc:subject.
// Las carpetas por las que pasa el archivo son su categoría.
// Los archivos o carpetas que empiezan con "_" se ignoran (ej. _plantilla.svg).

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";

const RAIZ = new URL("../banco/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SALIDA = join(RAIZ, "index.json");

const decodificar = (t = "") => t
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

const etiqueta = (src, tag) => {
  const m = src.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodificar(m[1]) : "";
};

const aListaEtiquetas = (v) => {
  const lista = Array.isArray(v) ? v : String(v || "").split(",");
  return [...new Set(lista.map(s => String(s).trim()).filter(Boolean))];
};

function leerSvg(ruta) {
  const src = readFileSync(ruta, "utf8");
  const avisos = [];
  let titulo = etiqueta(src, "title");
  let descripcion = etiqueta(src, "desc");
  let autor = "";
  let etiquetas = [];

  // 1) <metadata> con JSON propio
  const meta = etiqueta(src, "metadata");
  if (meta.startsWith("{")) {
    try {
      const j = JSON.parse(meta);
      autor = j.autor || j.author || "";
      etiquetas = aListaEtiquetas(j.etiquetas ?? j.tags);
    } catch { avisos.push("el JSON de <metadata> no es válido"); }
  } else if (meta) {
    // 2) formato RDF de Inkscape (dc:*)
    titulo = titulo || etiqueta(meta, "dc:title");
    descripcion = descripcion || etiqueta(meta, "dc:description");
    autor = etiqueta(meta, "dc:creator").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const subj = [...meta.matchAll(/<rdf:li>([\s\S]*?)<\/rdf:li>/g)].map(m => decodificar(m[1]));
    etiquetas = aListaEtiquetas(subj.length ? subj : etiqueta(meta, "dc:subject"));
  }

  if (!titulo) { titulo = basename(ruta, ".svg").replace(/[-_]+/g, " "); avisos.push("falta <title> (se usó el nombre del archivo)"); }
  if (!/viewBox\s*=/.test(src)) avisos.push("falta viewBox (no escalará bien en el editor)");
  if (!etiquetas.length) avisos.push("sin etiquetas");
  if (/<script[\s>]/i.test(src)) avisos.push("contiene <script> (se eliminará al insertarlo)");

  return { titulo, descripcion, etiquetas, autor, avisos };
}

function recorrer(dir, salida = []) {
  for (const nombre of readdirSync(dir).sort((a, b) => a.localeCompare(b, "es"))) {
    if (nombre.startsWith("_") || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
    else if (nombre.toLowerCase().endsWith(".svg")) salida.push(ruta);
  }
  return salida;
}

const archivos = recorrer(RAIZ);
const elementos = [];
let conAvisos = 0;

for (const archivo of archivos) {
  const partes = relative(RAIZ, archivo).split(sep);          // ["Ciencias","Plantas","girasol.svg"]
  const d = leerSvg(archivo);
  if (d.avisos.length) { conAvisos++; console.warn(`⚠ ${partes.join("/")}: ${d.avisos.join("; ")}`); }
  elementos.push({
    ruta: partes.join("/"),
    carpeta: partes.slice(0, -1),
    titulo: d.titulo,
    descripcion: d.descripcion,
    etiquetas: d.etiquetas,
    autor: d.autor,
  });
}

const carpetas = [...new Set(elementos.flatMap(e =>
  e.carpeta.map((_, i) => e.carpeta.slice(0, i + 1).join("/"))))].sort((a, b) => a.localeCompare(b, "es"));

writeFileSync(SALIDA, JSON.stringify({ version: 1, total: elementos.length, carpetas, elementos }, null, 2) + "\n", "utf8");
console.log(`✔ banco/index.json: ${elementos.length} SVG en ${carpetas.length} carpetas` + (conAvisos ? ` (${conAvisos} con avisos)` : ""));
