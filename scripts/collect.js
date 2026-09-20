#!/usr/bin/env node
/**
 * data-bot / scripts/collect.js
 *
 * Recolecta repos de GitHub creados en los ultimos 7 dias (API publica,
 * SIN autenticacion: api.github.com permite 60 req/hora anonimas) y
 * publica datasets versionados en JSON + CSV.
 *
 * Salidas:
 *   data/datasets/YYYY-MM-DD.json   snapshot normalizado del dia
 *   data/datasets/YYYY-MM-DD.csv    mismo snapshot en CSV
 *   data/latest.json                ultimo snapshot (para la pagina web)
 *   data/history.csv                serie historica (una fila por repo y dia)
 *
 * Uso: node scripts/collect.js
 * Sin secretos ni tokens: funciona tal cual en GitHub Actions.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATASETS = join(ROOT, "data", "datasets");
const LATEST = join(ROOT, "data", "latest.json");
const HISTORY = join(ROOT, "data", "history.csv");

const UA = "data-bot/1.0 (daily-github-trends; contact: none)";
const PER_PAGE = 30;
const DAYS_BACK = 7;

const CSV_HEADER = "date,rank,full_name,description,html_url,stars,forks,open_issues,language,created_at,pushed_at,owner";

function csvEscape(v) {
  const s = String(v ?? "").replaceAll('"', '""').replaceAll(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s}"` : s;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } });
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (res.status === 403 || res.status === 429) {
    const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : "desconocido";
    console.warn(`⚠️  Límite de la API alcanzado (remaining=${remaining}). Reintento sugerido tras: ${resetAt}`);
    console.warn("⚠️  Se omite la actualización de hoy sin marcar error (el cron de mañana lo intentará de nuevo).");
    process.exit(0); // salida limpia: no es un fallo del código, es cuota anónima
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  console.log(`ℹ️  Cuota anónima restante: ${remaining}`);
  return res.json();
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - DAYS_BACK * 86400000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`created:>${since}`);
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_PAGE}`;

  console.log(`📥 Consultando: repos creados desde ${since} (top ${PER_PAGE} por estrellas)`);
  const data = await fetchJson(url);
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) throw new Error("La API devolvió 0 resultados: respuesta inesperada.");

  const rows = items.map((r, i) => ({
    date: today,
    rank: i + 1,
    full_name: r.full_name,
    description: r.description,
    html_url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    open_issues: r.open_issues_count,
    language: r.language,
    created_at: r.created_at,
    pushed_at: r.pushed_at,
    owner: r.owner?.login,
  }));

  mkdirSync(DATASETS, { recursive: true });

  // 1) Snapshot del día en JSON
  const snapshot = {
    generated_at: new Date().toISOString(),
    source: "https://api.github.com/search/repositories",
    query: `created:>${since}`,
    count: rows.length,
    repos: rows,
  };
  writeFileSync(join(DATASETS, `${today}.json`), JSON.stringify(snapshot, null, 2) + "\n");

  // 2) Snapshot del día en CSV
  const csv = [CSV_HEADER, ...rows.map((r) =>
    [r.date, r.rank, r.full_name, r.description, r.html_url, r.stars, r.forks, r.open_issues, r.language, r.created_at, r.pushed_at, r.owner]
      .map(csvEscape).join(",")
  )].join("\n") + "\n";
  writeFileSync(join(DATASETS, `${today}.csv`), csv);

  // 3) latest.json para la página web
  writeFileSync(LATEST, JSON.stringify(snapshot, null, 2) + "\n");

  // 4) Serie histórica: añade filas (crea cabecera si no existe)
  if (!existsSync(HISTORY)) writeFileSync(HISTORY, CSV_HEADER + "\n");
  else {
    const head = readFileSync(HISTORY, "utf8").split("\n")[0].trim();
    if (head !== CSV_HEADER) throw new Error("history.csv tiene una cabecera inesperada; revisa el archivo.");
  }
  appendFileSync(HISTORY, rows.map((r) =>
    [r.date, r.rank, r.full_name, r.description, r.html_url, r.stars, r.forks, r.open_issues, r.language, r.created_at, r.pushed_at, r.owner]
      .map(csvEscape).join(",")
  ).join("\n") + "\n");

  console.log(`✔ Datasets escritos: ${rows.length} repos (${today}.json, ${today}.csv, latest.json, history.csv)`);
}

main().catch((err) => {
  console.error("✖ Error en collect.js:", err.message);
  process.exit(1);
});
