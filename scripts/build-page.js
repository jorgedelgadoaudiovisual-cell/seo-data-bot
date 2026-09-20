#!/usr/bin/env node
/**
 * data-bot / scripts/build-page.js
 *
 * Lee data/latest.json + data/history.csv y genera una pagina estatica
 * de tendencias en site/index.html, copiando los datasets a
 * site/datasets/ para que GitHub Pages los sirva como descargas.
 *
 * Uso: node scripts/build-page.js
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");
const SITE_DATASETS = join(SITE, "datasets");

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function readHistory() {
  const f = join(ROOT, "data", "history.csv");
  if (!existsSync(f)) return [];
  const lines = readFileSync(f, "utf8").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((ln) => {
    // parseo CSV simple que respeta comillas
    const cols = [];
    let cur = "", inQ = false;
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i];
      if (inQ) {
        if (ch === '"' && ln[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    return Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
  });
}

function main() {
  const latestPath = join(ROOT, "data", "latest.json");
  if (!existsSync(latestPath)) {
    throw new Error("No existe data/latest.json. Ejecuta primero: node scripts/collect.js");
  }
  const latest = JSON.parse(readFileSync(latestPath, "utf8"));
  const repos = latest.repos || [];
  const date = latest.generated_at.slice(0, 10);

  // Copiar datasets a site/datasets/
  mkdirSync(SITE_DATASETS, { recursive: true });
  const files = existsSync(join(ROOT, "data", "datasets"))
    ? readdirSync(join(ROOT, "data", "datasets")).filter((f) => f.endsWith(".json") || f.endsWith(".csv")).sort()
    : [];
  for (const f of files) copyFileSync(join(ROOT, "data", "datasets", f), join(SITE_DATASETS, f));

  // Top lenguajes del snapshot actual
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
  const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxLang = topLangs[0]?.[1] || 1;

  // Días con datos en el histórico
  const history = readHistory();
  const days = [...new Set(history.map((r) => r.date))].sort();

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Tendencias diarias de GitHub: repos nuevos más populares",
    description: "Snapshot diario de los repositorios de GitHub creados en los últimos 7 días con más estrellas. Datos abiertos en JSON y CSV.",
    url: "https://ejemplo.github.io/data-bot/",
    license: "https://opensource.org/licenses/MIT",
    distribution: [
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "./datasets/" },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: "./datasets/" },
    ],
    temporalCoverage: days.length ? `${days[0]}/${days[days.length - 1]}` : date,
    dateModified: latest.generated_at,
  };

  const rows = repos.map((r) => `
      <tr>
        <td>${r.rank}</td>
        <td><a href="${esc(r.html_url)}" target="_blank" rel="noopener"><strong>${esc(r.full_name)}</strong></a><br>
            <span class="desc">${esc(r.description || "Sin descripción")}</span></td>
        <td><span class="pill">${esc(r.language || "—")}</span></td>
        <td class="num">⭐ ${Number(r.stars).toLocaleString("es")}</td>
        <td class="num">${Number(r.forks).toLocaleString("es")}</td>
      </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tendencias de GitHub hoy (${esc(date)}) — Repos nuevos más populares</title>
<meta name="description" content="Ranking diario de los repositorios de GitHub creados en la última semana con más estrellas. Datos abiertos en JSON y CSV.">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
:root{--bg:#0b1220;--card:#141d33;--ink:#e6edf7;--muted:#8fa0b8;--acc:#4ade80}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}
a{color:#7dd3fc}.wrap{max-width:1000px;margin:0 auto;padding:0 1.25rem}
header{padding:2.5rem 0 1.5rem;text-align:center}
header h1{font-size:2rem;margin-bottom:.5rem}header p{color:var(--muted)}
.stats{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin:1.5rem 0}
.stat{background:var(--card);border:1px solid #243356;border-radius:.7rem;padding:.8rem 1.4rem;text-align:center}
.stat b{font-size:1.4rem;color:var(--acc)}.stat span{display:block;font-size:.8rem;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:.93rem}
th,td{border-bottom:1px solid #1e2a45;padding:.7rem .5rem;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:.8rem;text-transform:uppercase}
.num{text-align:right;white-space:nowrap}.desc{color:var(--muted);font-size:.85rem}
.pill{background:#1e2a45;border-radius:99px;padding:.15rem .7rem;font-size:.78rem}
.bars{margin:1rem 0}.bar{display:flex;align-items:center;gap:.7rem;margin:.4rem 0;font-size:.9rem}
.bar .lbl{width:130px;text-align:right;color:var(--muted)}
.bar .fill{background:linear-gradient(90deg,#4ade80,#22d3ee);height:14px;border-radius:99px;min-width:4px}
section{margin:2.5rem 0}h2{margin-bottom:.8rem;font-size:1.35rem}
ul.dl{list-style:none;columns:2}ul.dl li{margin:.35rem 0;font-size:.9rem}
footer{border-top:1px solid #1e2a45;margin-top:3rem;padding:1.5rem 0;color:var(--muted);font-size:.85rem;text-align:center}
@media(max-width:640px){ul.dl{columns:1}.bar .lbl{width:90px}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>📈 Tendencias de GitHub</h1>
<p>Los <strong>${repos.length}</strong> repositorios creados en los últimos 7 días con más estrellas · Actualizado el ${esc(date)}</p>
</header>

<div class="stats">
<div class="stat"><b>${repos.length}</b><span>repos rastreados</span></div>
<div class="stat"><b>${days.length}</b><span>días de histórico</span></div>
<div class="stat"><b>${Number(repos[0]?.stars || 0).toLocaleString("es")}</b><span>⭐ del top 1</span></div>
</div>

<section>
<h2>🏆 Ranking de hoy</h2>
<table>
<thead><tr><th>#</th><th>Repositorio</th><th>Lenguaje</th><th style="text-align:right">Estrellas</th><th style="text-align:right">Forks</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>

<section>
<h2>💻 Lenguajes en tendencia</h2>
<div class="bars">
${topLangs.map(([l, n]) => `<div class="bar"><span class="lbl">${esc(l)}</span><div class="fill" style="width:${Math.round((n / maxLang) * 320)}px"></div><span>${n}</span></div>`).join("")}
</div>
</section>

<section>
<h2>📦 Descargar datasets</h2>
<p style="color:var(--muted)">Snapshots diarios versionados, libres para usar (JSON y CSV):</p>
<ul class="dl">
${files.map((f) => `<li>⬇️ <a href="datasets/${esc(f)}">${esc(f)}</a></li>`).join("")}
</ul>
</section>

<footer>
Datos: GitHub REST API (pública, sin autenticación) · Generado automáticamente cada día con GitHub Actions.<br>
<a href="datasets/">Ver carpeta de datasets</a>
</footer>
</div>
</body>
</html>`;

  mkdirSync(SITE, { recursive: true });
  writeFileSync(join(SITE, "index.html"), html);
  console.log(`✔ Página generada: site/index.html (${repos.length} repos, ${files.length} datasets enlazados)`);
}

main();
