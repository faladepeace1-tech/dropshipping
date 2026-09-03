# Nexatech Dropshipping Store

Done-for-you dropshipping storefront — layered motion hero, advanced portfolio, editable Admin Command Center.

**Live stack:** Node 24 (node:sqlite) + Express + Vanilla JS + SQLite (WAL)

## Quick Start Local

```bash
npm install
npm start # runs node --experimental-sqlite server.js
# http://localhost:3000
# http://localhost:3000/admin  admin / Nexatech2026!
```

## Deploy to Render

1. Push to GitHub (see below)
2. Render → New → Web Service → Connect repo
3. Build: `npm install`  Start: `npm start`
4. Node 24 — `render.yaml` already sets `NODE_VERSION=24.12.0`
5. Environment: `JWT_SECRET` auto-generated, `PORT=10000`
6. Health check: `/api/health`

SQLite (`data.sqlite`) is ephemeral on Render free tier. For persistence, attach a Render Disk at `/opt/render/project/src/data.sqlite` or migrate to Postgres (swap `db.js`).

## Admin Features
- Content & Theme (all sections, 2550×1650 reviews wall, logo/favicon upload `/api/admin/upload`)
- Media Manager (portfolio / sales_proof / testimonials / reviews)
- Team, Sections order/visibility, Leads CRM, Analytics
- Integrations: WhatsApp `+19283825389`, Email `saheednexatech@gmail.com`, separate Bot/Form webhooks, Calendly, theme colours (`:root`)

## Structure
```
server.js  -> Express API + static public/
db.js      -> node:sqlite (DatabaseSync) + seed + migrations (dollars, webhooks, privacy/terms, reviews)
public/
  index.html, privacy.html, terms.html
  css/style.css, admin.css
  js/app.js, admin.js
  uploads/
render.yaml, package.json
```

## Env Vars
- `PORT` (Render provides)
- `JWT_SECRET` (required in prod)
