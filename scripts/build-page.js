#!/usr/bin/env node
/**
 * data-bot / scripts/build-page.js
 *
 * Lee data/latest.json + data/history.csv y genera una landing estatica premium
 * en site/index.html (hero 3D Three.js, animaciones GSAP, imagenes generadas),
 * copiando los datasets a site/datasets/ y generando robots.txt + sitemap.xml.
 *
 * La pagina es 100% estatica: sin dependencias npm en el output servido.
 * Las librerias (three, gsap) estan vendorizadas en site/assets/vendor/.
 *
 * Uso: node scripts/build-page.js
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");
const SITE_DATASETS = join(SITE, "datasets");
const CANONICAL = "https://datos.jdaudiovisual.online";

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

function fmt(n) { return Number(n || 0).toLocaleString("es"); }

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
  const fileMeta = files.map((f) => {
    const st = statSync(join(SITE_DATASETS, f));
    const isJson = f.endsWith(".json");
    const kb = st.size / 1024;
    const size = kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(kb)) + " KB";
    let rows = 30;
    try {
      if (isJson) {
        const j = JSON.parse(readFileSync(join(SITE_DATASETS, f), "utf8"));
        rows = (j.repos && j.repos.length) || j.count || rows;
      } else {
        rows = Math.max(0, readFileSync(join(SITE_DATASETS, f), "utf8").trim().split("\n").length - 1);
      }
    } catch (e) { /* conserva el valor por defecto */ }
    return { f, isJson, size, rows, date: f.slice(0, 10) };
  });

  // Top lenguajes del snapshot actual
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
  const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxLang = topLangs[0]?.[1] || 1;
  const totalStars = repos.reduce((a, r) => a + Number(r.stars || 0), 0);

  // Días con datos en el histórico
  const history = readHistory();
  const days = [...new Set(history.map((r) => r.date))].sort();

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Tendencias diarias de GitHub: repos nuevos más populares",
    description: "Snapshot diario de los repositorios de GitHub creados en los últimos 7 días con más estrellas. Datos abiertos en JSON y CSV.",
    url: CANONICAL + "/",
    license: "https://opensource.org/licenses/MIT",
    distribution: [
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: CANONICAL + "/datasets/" },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: CANONICAL + "/datasets/" },
    ],
    temporalCoverage: days.length ? `${days[0]}/${days[days.length - 1]}` : date,
    dateModified: latest.generated_at,
    inLanguage: "es",
  };

  const css = `
:root{
  --bg:#0b1220; --bg2:#0d1526; --card:#111d33; --line:#1e2c47;
  --ink:#e8eefb; --muted:#93a4c4;
  --cyan:#22d3ee; --indigo:#818cf8; --green:#34d399; --amber:#fbbf24;
  --radius:14px;
  --font-d:"Space Grotesk","Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-b:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
html.rm{scroll-behavior:auto}
body{font-family:var(--font-b);background:var(--bg);color:var(--ink);line-height:1.65;overflow-x:hidden;-webkit-font-smoothing:antialiased}
::selection{background:rgba(34,211,238,.28)}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem}
/* ---------- nav ---------- */
.nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  background:rgba(11,18,32,.72);border-bottom:1px solid var(--line)}
.nav-in{max-width:1080px;margin:0 auto;padding:.8rem 1.25rem;display:flex;align-items:center;gap:1.25rem}
.brand{display:flex;align-items:center;gap:.6rem;font-family:var(--font-d);font-weight:700;font-size:1.05rem;color:var(--ink);letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.brand-mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex:none;
  background:linear-gradient(135deg,var(--cyan),var(--indigo));box-shadow:0 8px 30px -8px rgba(34,211,238,.45)}
.brand-mark svg{width:18px;height:18px;stroke:#06121f}
.nav-links{display:flex;gap:1.1rem;margin-left:auto;font-size:.92rem}
.nav-links a{color:var(--muted)}
.nav-links a:hover{color:var(--ink);text-decoration:none}
.btn{display:inline-flex;align-items:center;gap:.5rem;font-weight:600;border-radius:999px;
  padding:.72rem 1.5rem;font-size:.95rem;min-height:44px;border:1px solid transparent;cursor:pointer;transition:transform .25s ease,box-shadow .25s ease}
.btn:hover{text-decoration:none;transform:translateY(-2px)}
.btn svg{width:18px;height:18px;flex:none}
.btn-primary{background:linear-gradient(90deg,var(--cyan),var(--indigo));color:#06121f;
  box-shadow:0 8px 30px -8px rgba(34,211,238,.4)}
.btn-ghost{border-color:var(--line);color:var(--ink);background:rgba(17,29,51,.5)}
.btn-sm{padding:.5rem 1.05rem;font-size:.85rem;min-height:40px}
.nav-cta{margin-left:.4rem}
/* ---------- hero ---------- */
.hero{position:relative;min-height:92vh;display:flex;align-items:center;overflow:hidden;
  background:radial-gradient(1200px 600px at 75% -10%,rgba(129,140,248,.14),transparent 60%),
             radial-gradient(900px 500px at 10% 110%,rgba(34,211,238,.10),transparent 60%),var(--bg)}
#bg3d{position:absolute;inset:0;width:100%;height:100%;display:block}
.hero-veil{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(11,18,32,.55) 0%,rgba(11,18,32,.15) 40%,rgba(11,18,32,.88) 100%)}
.hero-in{position:relative;z-index:2;width:100%;padding:5rem 0 4rem}
.eyebrow{display:inline-flex;align-items:center;gap:.55rem;font-size:.82rem;color:var(--cyan);
  border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.07);
  padding:.42rem 1rem;border-radius:999px;margin-bottom:1.4rem;font-weight:500}
.eyebrow .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
html.rm .eyebrow .dot{animation:none}
.hero h1{font-family:var(--font-d);font-weight:700;letter-spacing:-.03em;line-height:1.04;
  font-size:clamp(2.5rem,6.5vw,4.6rem);max-width:14ch;margin-bottom:1.25rem}
.grad{background:linear-gradient(92deg,var(--cyan) 10%,var(--indigo) 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.lead{font-size:clamp(1.02rem,2vw,1.25rem);color:var(--muted);max-width:56ch;margin-bottom:2rem}
.hero p.lead strong{color:var(--ink)}
.hero-ctas{display:flex;gap:.9rem;flex-wrap:wrap;margin-bottom:3rem}
.hero-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;max-width:860px}
.hstat{background:rgba(17,29,51,.62);border:1px solid var(--line);border-radius:var(--radius);
  padding:1rem 1.2rem;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,.45)}
.hstat b{display:block;font-family:var(--font-d);font-size:1.65rem;letter-spacing:-.02em;
  background:linear-gradient(92deg,#fff,var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent}
.hstat span{font-size:.8rem;color:var(--muted)}
.scroll-hint{position:absolute;left:50%;bottom:1.4rem;transform:translateX(-50%);z-index:2;color:var(--muted);
  font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;display:flex;flex-direction:column;align-items:center;gap:.4rem}
.scroll-hint::after{content:"";width:1px;height:34px;background:linear-gradient(var(--cyan),transparent);animation:drop 1.8s ease-in-out infinite}
@keyframes drop{0%{transform:scaleY(0);transform-origin:top}55%{transform:scaleY(1);transform-origin:top}56%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
html.rm .scroll-hint::after{animation:none}
/* ---------- marquee ---------- */
.ticker{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--bg2);overflow:hidden;padding:.85rem 0}
.ticker-track{display:flex;gap:2.5rem;width:max-content;animation:tick 36s linear infinite;font-size:.88rem;color:var(--muted);white-space:nowrap}
.ticker-track b{color:var(--cyan);font-weight:600}
@keyframes tick{to{transform:translateX(-50%)}}
html.rm .ticker-track{animation:none}
/* ---------- sections ---------- */
section.block{padding:5rem 0}
section.block.alt{background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.kicker{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:var(--cyan);font-weight:600;margin-bottom:.7rem}
h2.title{font-family:var(--font-d);font-weight:700;letter-spacing:-.02em;font-size:clamp(1.7rem,3.6vw,2.5rem);line-height:1.15;margin-bottom:.8rem}
p.sub{color:var(--muted);max-width:64ch;margin-bottom:2.4rem}
/* ---------- ranking cards ---------- */
.filterbar{display:flex;align-items:center;gap:.7rem;background:var(--card);border:1px solid var(--line);
  border-radius:999px;padding:.55rem 1.2rem;margin-bottom:1.8rem;max-width:520px}
.filterbar svg{width:18px;height:18px;stroke:var(--muted);flex:none}
.filterbar input{background:none;border:none;outline:none;color:var(--ink);font-size:.95rem;width:100%;font-family:inherit}
.filterbar input::placeholder{color:var(--muted)}
.repo-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:760px){.repo-grid{grid-template-columns:1fr}}
.repo{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1.25rem 1.35rem;
  display:flex;gap:1rem;transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.repo:hover{transform:translateY(-3px);border-color:rgba(34,211,238,.45);box-shadow:0 14px 34px -12px rgba(34,211,238,.25)}
.rank{font-family:var(--font-d);font-weight:700;font-size:1.5rem;flex:none;width:2.6rem;height:2.6rem;border-radius:12px;
  display:grid;place-items:center;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.25);color:var(--cyan)}
.repo:nth-child(1) .rank{background:linear-gradient(135deg,var(--amber),#f59e0b);color:#231303;border:none}
.repo:nth-child(2) .rank{background:linear-gradient(135deg,#cbd5e1,#94a3b8);color:#1e293b;border:none}
.repo:nth-child(3) .rank{background:linear-gradient(135deg,#d97706,#92400e);color:#fff7ed;border:none}
.repo-body{min-width:0;flex:1}
.repo-name{font-weight:600;font-size:1.02rem;line-height:1.35;overflow-wrap:anywhere}
.repo-name a{color:var(--ink)}
.repo-name a:hover{color:var(--cyan);text-decoration:none}
.repo-desc{color:var(--muted);font-size:.87rem;margin:.35rem 0 .7rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.repo-meta{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;font-size:.82rem;color:var(--muted)}
.pill{background:#1e2a45;border-radius:999px;padding:.18rem .75rem;font-size:.76rem;color:var(--ink);border:1px solid var(--line)}
.meta-item{display:inline-flex;align-items:center;gap:.32rem}
.meta-item svg{width:14px;height:14px;stroke:var(--amber)}
.meta-item.fork svg{stroke:var(--muted)}
.empty-msg{display:none;color:var(--muted);padding:2rem 0;text-align:center}
/* ---------- languages ---------- */
.lang-grid{display:grid;grid-template-columns:1fr 1fr;gap:2.2rem;align-items:start}
@media(max-width:760px){.lang-grid{grid-template-columns:1fr}}
.lang-row{margin-bottom:1.05rem}
.lang-top{display:flex;justify-content:space-between;font-size:.92rem;margin-bottom:.4rem}
.lang-top b{font-weight:600}
.lang-top span{color:var(--muted)}
.lang-track{height:12px;border-radius:999px;background:#1a2540;overflow:hidden}
.lang-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--cyan),var(--indigo));
  box-shadow:0 0 14px rgba(34,211,238,.35);width:0}
.lang-side{position:relative;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);min-height:320px;
  display:flex;align-items:flex-end;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.lang-side img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lang-side figcaption{position:relative;z-index:2;padding:1.2rem;background:linear-gradient(transparent,rgba(6,10,20,.92) 55%);width:100%;font-size:.88rem;color:var(--muted)}
.lang-side figcaption b{color:var(--ink);display:block;font-size:1rem;margin-bottom:.2rem}
/* ---------- datasets ---------- */
.ds-hero{position:relative;border-radius:calc(var(--radius) + 6px);overflow:hidden;border:1px solid var(--line);margin-bottom:2rem}
.ds-hero img{width:100%;height:230px;object-fit:cover;display:block}
.ds-hero .ov{position:absolute;inset:0;background:linear-gradient(100deg,rgba(6,10,20,.94) 20%,rgba(6,10,20,.45) 60%,rgba(6,10,20,.15));display:flex;align-items:center;padding:2rem}
.ds-hero h3{font-family:var(--font-d);font-size:clamp(1.4rem,3vw,2rem);letter-spacing:-.02em;margin-bottom:.4rem}
.ds-hero p{color:var(--muted);max-width:52ch}
.ds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:1.1rem;margin-bottom:1.6rem}
.ds{position:relative;background:linear-gradient(180deg,#13203a,#101b31);border:1px solid var(--line);border-radius:18px;
  padding:1.25rem 1.3rem 1.3rem;display:flex;flex-direction:column;gap:1.05rem;overflow:hidden;
  transition:transform .3s ease,border-color .3s ease,box-shadow .3s ease;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.ds::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent,var(--indigo))}
.ds.json{--accent:var(--green)}
.ds.csv{--accent:var(--amber)}
.ds:hover{transform:translateY(-4px)}
.ds.json:hover{border-color:rgba(52,211,153,.55);box-shadow:0 18px 40px -14px rgba(52,211,153,.30)}
.ds.csv:hover{border-color:rgba(251,191,36,.55);box-shadow:0 18px 40px -14px rgba(251,191,36,.30)}
.ds-head{display:flex;align-items:center;gap:.9rem}
.file-ico{width:52px;height:52px;flex:none;border-radius:14px;display:grid;place-items:center;
  background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.ds.csv .file-ico{background:rgba(251,191,36,.10);border-color:rgba(251,191,36,.38)}
.file-ico svg{width:32px;height:32px}
.ds.json .file-ico svg{color:var(--green)}
.ds.csv .file-ico svg{color:var(--amber)}
.ds-id{min-width:0;flex:1}
.ds-name{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.88rem;font-weight:600;overflow-wrap:anywhere}
.ds-meta{font-size:.78rem;color:var(--muted);margin-top:.18rem}
.new-badge{position:absolute;top:1.15rem;right:1.2rem;font-size:.66rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green);
  background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.42);border-radius:999px;padding:.3rem .72rem;
  display:inline-flex;align-items:center;gap:.4rem}
.ds.has-new .ds-head{padding-right:4.4rem}
.new-badge i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);font-style:normal}
.btn-dl{margin-top:auto;justify-content:center;background:linear-gradient(92deg,var(--cyan),var(--indigo));color:#06121f;
  border:none;font-weight:700;box-shadow:0 10px 26px -10px rgba(34,211,238,.5)}
.btn-dl:hover{color:#06121f;text-decoration:none;box-shadow:0 14px 34px -10px rgba(34,211,238,.65)}
.btn-dl svg{transition:transform .25s ease}
.btn-dl:hover svg{transform:translateY(2px)}
.schema{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;background:rgba(17,29,51,.62);border:1px solid var(--line);
  border-radius:var(--radius);padding:.95rem 1.25rem;margin-bottom:1.4rem}
.schema-label{font-size:.84rem;font-weight:600;color:var(--ink);white-space:nowrap}
.schema-label b{color:var(--cyan)}
.schema-chips{display:flex;gap:.45rem;flex-wrap:wrap}
.schema-chips span{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.74rem;color:var(--muted);
  background:#0d1730;border:1px solid var(--line);border-radius:6px;padding:.24rem .62rem}
.schema-chips span.hl{color:var(--cyan);border-color:rgba(34,211,238,.35)}
.note{color:var(--muted);font-size:.9rem;display:flex;gap:.6rem;align-items:flex-start}
.note svg{width:16px;height:16px;stroke:var(--cyan);flex:none;margin-top:.25rem}
/* ---------- features ---------- */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem}
@media(max-width:860px){.feat-grid{grid-template-columns:1fr}}
.feat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;
  transition:transform .25s ease,border-color .25s ease;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.feat:hover{transform:translateY(-4px);border-color:rgba(34,211,238,.4)}
.feat img{width:100%;height:190px;object-fit:cover;display:block}
.feat-body{padding:1.4rem}
.feat-ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;margin-bottom:.9rem;
  background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3)}
.feat-ico svg{width:20px;height:20px;stroke:var(--cyan)}
.feat h3{font-family:var(--font-d);font-size:1.15rem;margin-bottom:.5rem;letter-spacing:-.01em}
.feat p{color:var(--muted);font-size:.92rem}
/* ---------- footer ---------- */
footer{border-top:1px solid var(--line);padding:2.6rem 0 2rem;background:var(--bg2)}
.foot-grid{display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap;align-items:flex-start;margin-bottom:1.6rem}
.foot-note{color:var(--muted);font-size:.85rem;max-width:60ch}
.foot-base{border-top:1px solid var(--line);padding-top:1.3rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;
  color:var(--muted);font-size:.82rem}
@media(max-width:640px){
  .nav-links{display:none}
  .hero-stats{grid-template-columns:1fr 1fr}
  section.block{padding:3.4rem 0}
}
`;

// ---------- iconos SVG (estilo Lucide, trazo) ----------
const I = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><polyline points="7 10.5 12 15.5 17 10.5"/><path d="M4.5 16.5v2.7a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.7"/></svg>',
  fileJson: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="16.8" text-anchor="middle" font-size="5" font-weight="700" fill="currentColor" stroke="none" font-family="Space Grotesk,Inter,sans-serif" letter-spacing=".5">JSON</text></svg>',
  fileCsv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="16.8" text-anchor="middle" font-size="5.4" font-weight="700" fill="currentColor" stroke="none" font-family="Space Grotesk,Inter,sans-serif" letter-spacing=".8">CSV</text></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14a8 3 0 0 0 16 0V5"/><path d="M4 12a8 3 0 0 0 16 0"/></svg>',
};

const repoCards = repos.map((r, i) => `
    <article class="repo reveal" data-search="${esc((r.full_name + " " + (r.description || "") + " " + (r.language || "")).toLowerCase())}">
      <div class="rank">${i + 1}</div>
      <div class="repo-body">
        <div class="repo-name"><a href="${esc(r.html_url)}" target="_blank" rel="noopener">${esc(r.full_name)}</a></div>
        <p class="repo-desc">${esc(r.description || "Sin descripción")}</p>
        <div class="repo-meta">
          <span class="pill">${esc(r.language || "—")}</span>
          <span class="meta-item">${I.star} ${fmt(r.stars)}</span>
          <span class="meta-item fork">${I.fork} ${fmt(r.forks)}</span>
        </div>
      </div>
    </article>`).join("");

const langRows = topLangs.map(([l, n]) => `
      <div class="lang-row">
        <div class="lang-top"><b>${esc(l)}</b><span>${n} repo${n === 1 ? "" : "s"}</span></div>
        <div class="lang-track"><div class="lang-fill" data-w="${Math.round((n / maxLang) * 100)}"></div></div>
      </div>`).join("");

const dsCards = fileMeta.map((m) => `
    <div class="ds ${m.isJson ? "json" : "csv"} reveal${m.date === date ? " has-new" : ""}">
      <div class="ds-head">
        <span class="file-ico" aria-hidden="true">${m.isJson ? I.fileJson : I.fileCsv}</span>
        <div class="ds-id">
          <div class="ds-name">${esc(m.f)}</div>
          <div class="ds-meta">${esc(m.size)} · ${esc(m.date)} · ${m.rows} registros</div>
        </div>
        ${m.date === date ? '<span class="new-badge"><i></i>Hoy</span>' : ""}
      </div>
      <a class="btn btn-dl" href="datasets/${esc(m.f)}" download aria-label="Descargar ${esc(m.f)}">${I.download} Descargar ${m.isJson ? "JSON" : "CSV"}</a>
    </div>`).join("");

const tickerItems = repos.slice(0, 12).map((r, i) =>
  `<span><b>#${i + 1}</b> ${esc(r.full_name)} · ${fmt(r.stars)} ★</span>`).join("");

let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tendencias de GitHub hoy (${esc(date)}) — Datasets SEO diarios en JSON y CSV</title>
<meta name="description" content="Ranking diario de los repositorios de GitHub creados en la última semana con más estrellas. Datasets abiertos y versionados en JSON y CSV, actualizados cada día automáticamente.">
<link rel="canonical" href="${CANONICAL}/">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0b1220">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="DataBot — Tendencias de GitHub">
<meta property="og:title" content="Tendencias de GitHub hoy (${esc(date)}) — Datasets diarios">
<meta property="og:description" content="Los ${repos.length} repos nuevos más populares de GitHub, con datasets abiertos en JSON y CSV actualizados a diario.">
<meta property="og:url" content="${CANONICAL}/">
<meta property="og:image" content="${CANONICAL}/assets/img/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Tendencias de GitHub hoy (${esc(date)}) — Datasets diarios">
<meta name="twitter:description" content="Ranking diario + datasets abiertos en JSON y CSV.">
<meta name="twitter:image" content="${CANONICAL}/assets/img/og-cover.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%2322d3ee'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>${css}</style>
</head>
<body>
<nav class="nav" aria-label="Navegación principal">
  <div class="nav-in">
    <a class="brand" href="#top"><span class="brand-mark">${I.logo}</span> DataBot</a>
    <div class="nav-links">
      <a href="#ranking">Ranking</a>
      <a href="#lenguajes">Lenguajes</a>
      <a href="#datasets">Datasets</a>
      <a href="#como-funciona">Cómo funciona</a>
    </div>
    <a class="btn btn-primary btn-sm nav-cta" href="#datasets">${I.download} Datos abiertos</a>
  </div>
</nav>

<header class="hero" id="top">
  <canvas id="bg3d" aria-hidden="true"></canvas>
  <div class="hero-veil" aria-hidden="true"></div>
  <div class="wrap hero-in">
    <span class="eyebrow" data-hero><span class="dot"></span> Bot diario activo · Actualizado el ${esc(date)}</span>
    <h1 data-hero>El pulso de GitHub,<br><span class="grad">convertido en datos.</span></h1>
    <p class="lead" data-hero>Cada día rastreamos los <strong>${repos.length} repositorios nuevos más populares</strong> de GitHub y los publicamos como <strong>datasets abiertos</strong> en JSON y CSV. Tendencias, lenguajes y estadísticas, listos para tus análisis SEO y de mercado.</p>
    <div class="hero-ctas" data-hero>
      <a class="btn btn-primary" href="#ranking">${I.trend} Ver ranking de hoy</a>
      <a class="btn btn-ghost" href="#datasets">${I.download} Descargar datasets</a>
    </div>
    <div class="hero-stats" data-hero>
      <div class="hstat"><b><span class="count" data-count="${repos.length}">0</span></b><span>repos rastreados hoy</span></div>
      <div class="hstat"><b><span class="count" data-count="${days.length}">0</span></b><span>días de histórico</span></div>
      <div class="hstat"><b><span class="count" data-count="${repos[0] ? repos[0].stars : 0}">0</span></b><span>estrellas del nº 1</span></div>
      <div class="hstat"><b><span class="count" data-count="${files.length}">0</span></b><span>datasets publicados</span></div>
    </div>
  </div>
  <div class="scroll-hint" aria-hidden="true">Desliza</div>
</header>

<div class="ticker" aria-hidden="true"><div class="ticker-track">${tickerItems}<span aria-hidden="true">${tickerItems}</span></div></div>
`;
html += `
<main>
<section class="block" id="ranking">
  <div class="wrap">
    <p class="kicker reveal">Ranking diario</p>
    <h2 class="title reveal">Los ${repos.length} repos nuevos<br>más populares de hoy</h2>
    <p class="sub reveal">Repositorios creados en los últimos 7 días, ordenados por estrellas. Actualizado el ${esc(date)} con la API pública de GitHub.</p>
    <div class="filterbar reveal">
      ${I.search}
      <input type="search" id="repoFilter" placeholder="Filtrar por nombre, descripción o lenguaje…" aria-label="Filtrar repositorios">
    </div>
    <div class="repo-grid" id="repoGrid">${repoCards}</div>
    <p class="empty-msg" id="emptyMsg">Sin resultados para ese filtro. Prueba con otro término.</p>
  </div>
</section>

<section class="block alt" id="lenguajes">
  <div class="wrap">
    <p class="kicker reveal">Lenguajes en tendencia</p>
    <h2 class="title reveal">Qué se está programando<br>esta semana</h2>
    <p class="sub reveal">Distribución de lenguajes entre los ${repos.length} repositorios del ranking de hoy (${esc(date)}).</p>
    <div class="lang-grid">
      <div class="reveal">${langRows}</div>
      <figure class="lang-side reveal">
        <img src="assets/img/feature-tendencias.jpg" alt="Visualización de red de tendencias de código" loading="lazy" width="800" height="600">
        <figcaption><b>Señal, no ruido</b>Solo repos creados en los últimos 7 días: lo que despega ahora, no lo de siempre.</figcaption>
      </figure>
    </div>
  </div>
</section>

<section class="block" id="datasets">
  <div class="wrap">
    <p class="kicker reveal">Datos abiertos</p>
    <h2 class="title reveal">Descarga los datasets</h2>
    <p class="sub reveal">Snapshots diarios versionados por fecha: 30 repos por archivo, listos para tus análisis, dashboards y estudios SEO. Licencia MIT (uso comercial permitido), sin registro. Formatos JSON y CSV.</p>
    <div class="ds-hero reveal">
      <img src="assets/img/datasets-banner.jpg" alt="Archivo digital de datasets" loading="lazy" width="1600" height="460">
      <div class="ov"><div>
        <h3>Un archivo que crece cada día</h3>
        <p>Cada mañana un nuevo snapshot se suma al histórico. Sin registro, sin API keys, sin límites: descarga directa.</p>
      </div></div>
    </div>
    <div class="schema reveal">
      <span class="schema-label">Cada snapshot trae <b>30 repos</b> con</span>
      <div class="schema-chips"><span>rank</span><span>repo</span><span>descripción</span><span class="hl">★ estrellas</span><span>forks</span><span>issues</span><span>lenguaje</span><span>url</span><span>owner</span><span>fechas</span></div>
    </div>
    <div class="ds-grid">${dsCards}</div>
    <p class="note reveal">${I.check}<span>También puedes explorar la <a href="datasets/">carpeta completa de datasets</a> o automatizar descargas enlazando directamente a cada archivo versionado.</span></p>
  </div>
</section>

<section class="block alt" id="como-funciona">
  <div class="wrap">
    <p class="kicker reveal">Cómo funciona</p>
    <h2 class="title reveal">Un bot que nunca duerme</h2>
    <p class="sub reveal">Infraestructura 100% automática y transparente: el mismo pipeline abierto que genera esta página.</p>
    <div class="feat-grid">
      <article class="feat reveal">
        <img src="assets/img/feature-recoleccion.jpg" alt="Recolección automática de datos en servidores" loading="lazy" width="800" height="480">
        <div class="feat-body">
          <div class="feat-ico">${I.zap}</div>
          <h3>Recolección diaria automática</h3>
          <p>Cada día a las 06:00 UTC un GitHub Action consulta la API pública de GitHub, detecta los repos nuevos con más tracción y genera un snapshot con fecha.</p>
        </div>
      </article>
      <article class="feat reveal">
        <img src="assets/img/feature-datos-abiertos.jpg" alt="Datos abiertos listos para analizar" loading="lazy" width="800" height="480">
        <div class="feat-body">
          <div class="feat-ico">${I.database}</div>
          <h3>Datos abiertos y versionados</h3>
          <p>Cada snapshot se publica en JSON y CSV con su fecha. El histórico acumulado permite ver cómo evolucionan las tendencias semana a semana.</p>
        </div>
      </article>
      <article class="feat reveal">
        <img src="assets/img/feature-tendencias.jpg" alt="Detección de tendencias de desarrollo" loading="lazy" width="800" height="480">
        <div class="feat-body">
          <div class="feat-ico">${I.globe}</div>
          <h3>Señal para SEO y mercado</h3>
          <p>Detecta qué tecnologías despegan antes que nadie: insumo directo para contenidos, herramientas y decisiones de producto.</p>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="block" id="metodologia">
  <div class="wrap">
    <p class="kicker reveal">Transparencia</p>
    <h2 class="title reveal">Metodología</h2>
    <div class="feat-grid">
      <article class="feat reveal"><div class="feat-body">
        <div class="feat-ico">${I.layers}</div>
        <h3>Fuente</h3><p>GitHub REST API pública, sin autenticación. Búsqueda de repositorios creados en los últimos 7 días, ordenados por estrellas.</p>
      </div></article>
      <article class="feat reveal"><div class="feat-body">
        <div class="feat-ico">${I.calendar}</div>
        <h3>Frecuencia</h3><p>Un snapshot nuevo cada día a las 06:00 UTC, generado y publicado automáticamente con GitHub Actions. Esta página se regenera con cada snapshot.</p>
      </div></article>
      <article class="feat reveal"><div class="feat-body">
        <div class="feat-ico">${I.check}</div>
        <h3>Licencia</h3><p>Datasets bajo licencia MIT: úsalos libremente en proyectos personales y comerciales, con atribución a la fuente original (GitHub).</p>
      </div></article>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <a class="brand" href="#top"><span class="brand-mark">${I.logo}</span> DataBot</a>
      <p class="foot-note">Datos: GitHub REST API (pública, sin autenticación). Generado automáticamente cada día con GitHub Actions. Los datasets son snapshots de datos públicos de GitHub bajo licencia MIT.</p>
    </div>
    <div class="foot-base">
      <span>© ${esc(date.slice(0, 4))} DataBot · Tendencias de GitHub en datos abiertos</span>
      <span><a href="datasets/">Carpeta de datasets</a> · <a href="#top">Volver arriba</a></span>
    </div>
  </div>
</footer>
`;
html += `
<script src="assets/vendor/three.min.js" defer></script>
<script src="assets/vendor/gsap.min.js" defer></script>
<script src="assets/vendor/ScrollTrigger.min.js" defer></script>
<script defer>
(function(){
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) document.documentElement.classList.add("rm");

  /* ---------- Filtro del ranking ---------- */
  var input = document.getElementById("repoFilter");
  if (input) {
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var cards = document.querySelectorAll("#repoGrid .repo");
      var visible = 0;
      for (var i = 0; i < cards.length; i++) {
        var hit = !q || (cards[i].getAttribute("data-search") || "").indexOf(q) !== -1;
        cards[i].style.display = hit ? "" : "none";
        if (hit) visible++;
      }
      document.getElementById("emptyMsg").style.display = visible ? "none" : "block";
    });
  }

  /* ---------- Escena 3D del hero: red de datos + streams ---------- */
  var hero = document.querySelector(".hero");
  var canvas = document.getElementById("bg3d");
  var started3D = false;

  function initHero3D() {
    if (started3D || !window.THREE || !canvas) return;
    started3D = true;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    camera.position.set(0, 0, 15);

    var group = new THREE.Group();
    scene.add(group);

    // Nube de nodos (particulas)
    var COUNT = 230, pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
    var cCyan = new THREE.Color(0x22d3ee), cInd = new THREE.Color(0x818cf8), cGrn = new THREE.Color(0x34d399);
    var pts = [];
    for (var i = 0; i < COUNT; i++) {
      var r = 4 + Math.random() * 7;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      var x = r * Math.sin(ph) * Math.cos(th);
      var y = r * Math.sin(ph) * Math.sin(th) * 0.62;
      var z = r * Math.cos(ph) * 0.7 - 3;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      pts.push([x, y, z]);
      var c = Math.random() < 0.62 ? cCyan : (Math.random() < 0.6 ? cInd : cGrn);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var pMat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false });
    group.add(new THREE.Points(pGeo, pMat));

    // Conexiones entre nodos cercanos
    var linePos = [], MAXL = 420, added = 0;
    outer:
    for (var a = 0; a < COUNT; a++) {
      for (var b = a + 1; b < COUNT; b++) {
        var dx = pts[a][0] - pts[b][0], dy = pts[a][1] - pts[b][1], dz = pts[a][2] - pts[b][2];
        if (dx * dx + dy * dy + dz * dz < 7.2) {
          linePos.push(pts[a][0], pts[a][1], pts[a][2], pts[b][0], pts[b][1], pts[b][2]);
          if (++added >= MAXL) break outer;
        }
      }
    }
    var lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
    group.add(new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.22, depthWrite: false })));

    // Streams de datos ascendentes
    var SC = 130, spos = new Float32Array(SC * 3), sspd = new Float32Array(SC);
    for (var s = 0; s < SC; s++) {
      spos[s * 3] = (Math.random() - 0.5) * 26;
      spos[s * 3 + 1] = (Math.random() - 0.5) * 14;
      spos[s * 3 + 2] = -4 - Math.random() * 8;
      sspd[s] = 0.9 + Math.random() * 1.8;
    }
    var sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    var streams = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0x22d3ee, size: 0.07, transparent: true, opacity: 0.65, depthWrite: false }));
    scene.add(streams);

    function size() {
      var w = hero.clientWidth || window.innerWidth, h = hero.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    size();
    window.addEventListener("resize", size);

    // Parallax con el mouse
    var mx = 0, my = 0;
    window.addEventListener("pointermove", function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    var running = true, t0 = performance.now();
    function frame(now) {
      if (!running) return;
      var t = (now - t0) / 1000;
      group.rotation.y = t * 0.05 + mx * 0.12;
      group.rotation.x = my * 0.08;
      var arr = sGeo.attributes.position.array;
      for (var k = 0; k < SC; k++) {
        arr[k * 3 + 1] += sspd[k] * 0.016;
        if (arr[k * 3 + 1] > 8) arr[k * 3 + 1] = -8;
      }
      sGeo.attributes.position.needsUpdate = true;
      camera.position.x += ((mx * 1.1) - camera.position.x) * 0.04;
      camera.position.y += ((-my * 0.7) - camera.position.y) * 0.04;
      camera.lookAt(0, 0, -2);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }

    if (reduced) {
      renderer.render(scene, camera); // un solo frame estatico
      return;
    }
    // Pausar cuando el hero no es visible o la pestana esta oculta
    var visible = true;
    new IntersectionObserver(function (en) {
      var nowVis = en[0].isIntersecting;
      if (nowVis && !visible) { visible = true; t0 = performance.now() - (t0 ? 0 : 0); requestAnimationFrame(frame); }
      else if (!nowVis) { visible = false; }
      running = nowVis && !document.hidden;
      if (running) requestAnimationFrame(frame);
    }).observe(hero);
    document.addEventListener("visibilitychange", function () {
      running = visible && !document.hidden;
      if (running) requestAnimationFrame(frame);
    });
    requestAnimationFrame(frame);
  }

  // Lazy-load: iniciar el canvas 3D solo cuando el hero entra en vista
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en, obs) {
      if (en[0].isIntersecting) { initHero3D(); obs.disconnect(); }
    }, { rootMargin: "200px" }).observe(hero);
  } else {
    initHero3D();
  }

  /* ---------- Animaciones GSAP ---------- */
  if (window.gsap && !reduced) {
    gsap.registerPlugin(ScrollTrigger);

    gsap.from("[data-hero]", { y: 36, opacity: 0, duration: 1.05, stagger: 0.13, ease: "expo.out", delay: 0.15, clearProps: "all" });

    gsap.utils.toArray(".reveal").forEach(function (el) {
      gsap.from(el, {
        y: 38, opacity: 0, duration: 0.9, ease: "expo.out", clearProps: "transform,opacity",
        scrollTrigger: { trigger: el, start: "top 88%", once: true }
      });
    });

    document.querySelectorAll(".count").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      ScrollTrigger.create({
        trigger: el, start: "top 94%", once: true,
        onEnter: function () {
          var o = { v: 0 };
          gsap.to(o, {
            v: target, duration: 1.8, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(o.v).toLocaleString("es"); }
          });
        }
      });
    });

    document.querySelectorAll(".lang-fill").forEach(function (el) {
      gsap.to(el, {
        width: el.getAttribute("data-w") + "%", duration: 1.3, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true }
      });
    });
  } else {
    // Sin GSAP o con reduced-motion: barras y contadores en estado final
    document.querySelectorAll(".lang-fill").forEach(function (el) { el.style.width = el.getAttribute("data-w") + "%"; });
    document.querySelectorAll(".count").forEach(function (el) {
      el.textContent = (parseInt(el.getAttribute("data-count"), 10) || 0).toLocaleString("es");
    });
  }
})();
</script>
</body>
</html>`;

  mkdirSync(SITE, { recursive: true });
  writeFileSync(join(SITE, "index.html"), html);

  // ---------- Página de la carpeta de datasets (/datasets/) ----------
  // Evita el 404 de los enlaces "Carpeta de datasets": lista todos los
  // snapshots agrupados por fecha. Se regenera a diario junto a index.html.
  const byDate = {};
  for (const m of fileMeta) (byDate[m.date] = byDate[m.date] || []).push(m);
  const datesDesc = Object.keys(byDate).sort().reverse();
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechaLarga = (d) => {
    const p = d.split("-");
    return `${parseInt(p[2], 10)} de ${MESES[parseInt(p[1], 10) - 1]} de ${p[0]}`;
  };
  const folderCard = (m) => `
    <div class="ds ${m.isJson ? "json" : "csv"}${m.date === date ? " has-new" : ""}">
      <div class="ds-head">
        <span class="file-ico" aria-hidden="true">${m.isJson ? I.fileJson : I.fileCsv}</span>
        <div class="ds-id">
          <div class="ds-name">${esc(m.f)}</div>
          <div class="ds-meta">${esc(m.size)} · ${m.rows} registros</div>
        </div>
        ${m.date === date ? '<span class="new-badge"><i></i>Hoy</span>' : ""}
      </div>
      <a class="btn btn-dl" href="${esc(m.f)}" download aria-label="Descargar ${esc(m.f)}">${I.download} Descargar ${m.isJson ? "JSON" : "CSV"}</a>
    </div>`;
  const folderGroups = datesDesc.map((d) => `
    <section class="ds-day" data-date="${esc(d)}">
      <div class="ds-day-head">
        <h2 class="day-title">${d === date ? '<span class="grad">Hoy</span> · ' : ""}${esc(fechaLarga(d))}</h2>
        <span class="day-count">${byDate[d].length} archivo${byDate[d].length === 1 ? "" : "s"}</span>
      </div>
      <div class="ds-grid">${byDate[d].map(folderCard).join("")}</div>
    </section>`).join("");
  const cssFolder = `
/* ---------- carpeta de datasets ---------- */
.folder-top{padding:4.5rem 0 1rem}
.folder-top h1{font-family:var(--font-d);font-weight:700;letter-spacing:-.02em;font-size:clamp(2rem,5vw,3.2rem);line-height:1.08;margin-bottom:.9rem}
.ds-day{margin:2.6rem 0 0}
.ds-day-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.2rem;
  padding-bottom:.8rem;border-bottom:1px solid var(--line)}
.day-title{font-family:var(--font-d);font-size:1.35rem;letter-spacing:-.01em}
.day-count{font-size:.82rem;color:var(--muted);background:#0d1730;border:1px solid var(--line);border-radius:999px;padding:.28rem .9rem}
.codebox{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.8rem;background:#0d1730;border:1px solid var(--line);
  border-radius:10px;padding:.85rem 1.1rem;color:var(--muted);overflow-x:auto;white-space:nowrap;margin-top:1rem}
.codebox b{color:var(--cyan);font-weight:600}`;
  const folderHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Carpeta de datasets — DataBot | Snapshots diarios de GitHub en JSON y CSV</title>
<meta name="description" content="Archivo completo de datasets diarios de tendencias de GitHub: snapshots versionados por fecha en JSON y CSV, licencia MIT, descarga directa sin registro.">
<link rel="canonical" href="${CANONICAL}/datasets/">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0b1220">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="DataBot — Tendencias de GitHub">
<meta property="og:title" content="Carpeta de datasets — DataBot">
<meta property="og:description" content="Todos los snapshots diarios de tendencias de GitHub en JSON y CSV. Datos abiertos, licencia MIT.">
<meta property="og:url" content="${CANONICAL}/datasets/">
<meta property="og:image" content="${CANONICAL}/assets/img/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Carpeta de datasets — DataBot">
<meta name="twitter:description" content="Archivo completo de snapshots diarios en JSON y CSV.">
<meta name="twitter:image" content="${CANONICAL}/assets/img/og-cover.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%2322d3ee'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>${css}${cssFolder}</style>
</head>
<body>
<nav class="nav" aria-label="Navegación principal">
  <div class="nav-in">
    <a class="brand" href="../"><span class="brand-mark">${I.logo}</span> DataBot</a>
    <div class="nav-links">
      <a href="../#ranking">Ranking</a>
      <a href="../#lenguajes">Lenguajes</a>
      <a href="../#datasets">Datasets</a>
      <a href="../#como-funciona">Cómo funciona</a>
    </div>
    <a class="btn btn-primary btn-sm nav-cta" href="../#datasets">${I.download} Datos abiertos</a>
  </div>
</nav>

<main class="wrap">
  <div class="folder-top">
    <p class="kicker">Archivo abierto</p>
    <h1>Carpeta de <span class="grad">datasets</span></h1>
    <p class="sub">Todos los snapshots diarios de tendencias de GitHub, versionados por fecha. ${fileMeta.length} archivos publicados · Licencia MIT (uso comercial permitido) · Sin registro.</p>
    <div class="filterbar">
      ${I.search}
      <input type="search" id="dsFilter" placeholder="Filtrar por fecha o formato… (ej: 2026-09-21, csv)" aria-label="Filtrar datasets">
    </div>
  </div>
  ${folderGroups}
  <p class="note" style="margin:2.6rem 0 0">${I.check}<span>Automatiza tus descargas enlazando directamente a cada archivo versionado:</span></p>
  <div class="codebox"><b>curl -O</b> ${CANONICAL}/datasets/${esc(datesDesc[0] || date)}.csv</div>
</main>

<footer style="margin-top:4rem">
  <div class="wrap">
    <div class="foot-grid">
      <a class="brand" href="../"><span class="brand-mark">${I.logo}</span> DataBot</a>
      <p class="foot-note">Datos: GitHub REST API (pública, sin autenticación). Generado automáticamente cada día con GitHub Actions. Los datasets son snapshots de datos públicos de GitHub bajo licencia MIT.</p>
    </div>
    <div class="foot-base">
      <span>© ${esc(date.slice(0, 4))} DataBot · Tendencias de GitHub en datos abiertos</span>
      <span><a href="../#datasets">Volver a datasets</a> · <a href="../#top">Volver arriba</a></span>
    </div>
  </div>
</footer>
<script>
(function(){
  "use strict";
  var input = document.getElementById("dsFilter");
  if (!input) return;
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    document.querySelectorAll(".ds-day").forEach(function (sec) {
      var vis = 0;
      sec.querySelectorAll(".ds").forEach(function (c) {
        var name = c.querySelector(".ds-name").textContent.toLowerCase();
        var hit = !q || name.indexOf(q) !== -1;
        c.style.display = hit ? "" : "none";
        if (hit) vis++;
      });
      sec.style.display = vis ? "" : "none";
    });
  });
})();
</script>
</body>
</html>`;
  writeFileSync(join(SITE_DATASETS, "index.html"), folderHtml);

  // robots.txt + sitemap.xml
  writeFileSync(join(SITE, "robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: " + CANONICAL + "/sitemap.xml\n");
  const sm = [`<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url><loc>${CANONICAL}/</loc><lastmod>${date}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${CANONICAL}/datasets/</loc><lastmod>${date}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`];
  for (const m of fileMeta) {
    sm.push(`  <url><loc>${CANONICAL}/datasets/${esc(m.f)}</loc><lastmod>${esc(m.date)}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`);
  }
  sm.push(`</urlset>`);
  writeFileSync(join(SITE, "sitemap.xml"), sm.join("\n") + "\n");

  console.log(`✔ Página generada: site/index.html (${repos.length} repos, ${files.length} datasets enlazados)`);
}

main();
