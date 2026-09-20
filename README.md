# data-bot — Datasets diarios de tendencias de GitHub (cron + página estática)

Bot autónomo que cada día recolecta los repositorios de GitHub creados en la última semana con más estrellas, publica **datasets versionados (JSON + CSV)** y regenera una **página estática de tendencias**. Cero dependencias, cero secretos.

## Fuente de datos (verificada sin autenticación)

- **API:** `https://api.github.com/search/repositories?q=created:>FECHA&sort=stars&order=desc`
- **Auth:** ninguna. Funciona con el rate limit anónimo (60 req/hora); el script envía `User-Agent` (requerido por GitHub) y, si se agota la cuota, sale con aviso sin marcar error (el cron del día siguiente lo reintenta).
- Verificado en vivo el 2026-09-19: HTTP 200, 30 repos recolectados.

## Uso local

```bash
npm run collect     # solo recolecta: data/datasets/YYYY-MM-DD.{json,csv}, data/latest.json, data/history.csv
npm run build-page  # solo genera site/index.html (+ copia datasets a site/datasets/)
npm run run         # collect + build-page (lo que ejecuta el cron)
```

Vista previa de la página:

```bash
npm run run && npx --yes serve site -l 3000
# abre http://localhost:3000
```

## Automatización (GitHub Actions)

El workflow [`.github/workflows/daily.yml`](.github/workflows/daily.yml) corre `npm run run` **todos los días a las 06:00 UTC** y commitea los cambios con el `GITHUB_TOKEN` (sin secretos que configurar).

Para activarlo en tu repo:

1. Sube esta carpeta a un repositorio de GitHub.
2. Settings → Actions → General → *Workflow permissions* → **Read and write permissions** (para commitear los datasets).
3. (Opcional, para la web) Settings → Pages → Source: **GitHub Actions**, o despliega `site/` en Vercel/Netlify/Cloudflare Pages.

También puedes ejecutarlo manualmente desde la pestaña *Actions* → *daily-data-bot* → *Run workflow*.

## Estructura de los datasets

**`data/datasets/YYYY-MM-DD.json`** — snapshot del día:
```json
{ "generated_at": "...", "source": "...", "query": "created:>2026-09-13",
  "count": 30, "repos": [ { "date": "2026-09-20", "rank": 1, "full_name": "org/repo",
  "description": "...", "html_url": "...", "stars": 8594, "forks": 540,
  "open_issues": 56, "language": "Python", "created_at": "...", "pushed_at": "...",
  "owner": "org" } ] }
```

**`data/datasets/YYYY-MM-DD.csv`** — mismo snapshot en CSV (columnas: `date,rank,full_name,description,html_url,stars,forks,open_issues,language,created_at,pushed_at,owner`).

**`data/history.csv`** — serie histórica acumulada (una fila por repo y día), lista para análisis o gráficos.

**`site/index.html`** — ranking del día, top lenguajes, enlaces de descarga a todos los datasets y JSON-LD `Dataset` (schema.org) para SEO.

## Vías de monetización

1. **Dataset/API de pago:** el histórico acumulado (`history.csv`) gana valor con el tiempo. Empaquétalo como descarga premium (Gumroad/Lemon Squeezy) o sírvelo vía API con límite gratuito + plan de pago (RapidAPI, Stripe Metered Billing).
2. **Tráfico hacia otros activos:** la página de tendencias (contenido fresco diario = SEO) enlaza a tus otros proyectos; añade CTAs hacia el directorio del activo `directorio-seo`.
3. **Patrocinios/newsletter:** un ranking diario de "qué se está construyendo en GitHub" es material ideal para una newsletter técnica con sponsors.
4. **Contenido derivado:** cada snapshot puede alimentar hilos/posts automáticos (ver activo de growth).

## Notas

- Sin claves ni tokens: no hay nada que rotar ni que proteger.
- Si algún día necesitas más cuota, añade un `GITHUB_TOKEN` como header `Authorization` (5000 req/hora); el código actual no lo requiere.
- Los datos de GitHub son públicos; respeta sus [términos](https://docs.github.com/es/site-policy) al redistribuir.
