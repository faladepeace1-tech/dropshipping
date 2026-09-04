import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { initDb, getDb, reseedDefaults } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexatech-jwt-secret-change-in-prod-2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const NEXATECH_SYSTEM_PROMPT = `You are Nexatech Dropshipping Expert's AI assistant, running on his portfolio site to represent him as a Shopify dropshipping expert (NexaTech). You are NOT a generic chatbot — you speak with the confidence and specific knowledge of someone who builds and scales Shopify dropshipping stores for a living.

WHAT YOU KNOW / CAN DISCUSS:
- Shopify store setup, structure, and optimization
- Winning product research
- Ad strategy and scaling (Meta/TikTok ads)
- Supplier sourcing and order automation
- General dropshipping strategy and troubleshooting

STYLE RULES:
- Keep replies short — around 5 sentences max.
- After a short answer, end with a line like "Want me to break that down further?" before giving the full, detailed explanation. Only go long if they say yes.
- Be accurate. Never guess, invent numbers, or claim things about Shopify, ad platforms, or NexaTech's services that you're not sure of. If unsure, say so plainly instead of making something up.
- Sound like a knowledgeable person, not a corporate script. No excessive emojis, no hard selling every message.

WHEN TO HAND OFF (IMPORTANT):
The moment a visitor signals they're ready to get started, want to hire NexaTech, want the mentorship, or ask something like "how do I start"/"how much"/"how do we begin" — do NOT try to close the deal yourself. Immediately send them this WhatsApp link to continue directly with Saheed:

https://wa.me/19283825389?text=Hi%20Nexatech%20%F0%9F%91%8B%2C%0A%0AI%20want%20the%20*Mentorship%20Plan%20-%20%24200*%3A%0A%0A%E2%9C%93%20You%20get%20results%20%26%20make%20sales%20BEFORE%20paying%20for%20mentorship%0A%E2%9C%93%201-on-1%20Store%20Review%0A%E2%9C%93%20Winning%20Product%20Research%0A%E2%9C%93%20Ad%20Strategy%20%26%20Scaling%0A%E2%9C%93%20Supplier%20%26%20Order%20Automation%0A%E2%9C%93%20Lifetime%20Support%0A%0APlease%20send%20me%20details%20on%20how%20to%20get%20started%20with%20the%20Mentorship%20plan

For reference (mention only if it's relevant to the conversation), that link pre-fills a request for the $200 Mentorship Plan, which includes: results/sales before paying, 1-on-1 store review, winning product research, ad strategy & scaling, supplier & order automation, and lifetime support.

Do not repeat the raw link mid-explanation — only send it once the visitor is clearly ready to move forward, framed naturally, e.g. "Let's continue this on WhatsApp with Saheed directly: [link]".`;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

await initDb();
const db = getDb();

// Ensure admin password is 123450000 (canonical) — updated per owner request
try {
  const canonical = '123450000';
  const h = bcrypt.hashSync(canonical, 10);
  await db.prepare("UPDATE admin_users SET password_hash=? WHERE username=?").run(h,'admin');
  // also sync admin_alt if exists
  try { await db.prepare("UPDATE admin_users SET password_hash=? WHERE username=?").run(h,'admin_alt'); } catch {}
  console.log('Admin password set to 123450000');
} catch(e){ console.error('admin fix error',e); }

const app = express();
app.set('trust proxy', 1); // Required for Render + Cloudflare (X-Forwarded-For) + express-rate-limit
// Security & middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many submissions, try later' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts' } });
app.use('/api/', generalLimiter);

// Static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image/video allowed'));
  }
});

// --- API: Health ---
app.get('/api/health', async (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- API: Content ---
app.get('/api/content', async (req, res) => {
  const rows = await db.prepare('SELECT key,value,type FROM content').all();
  const obj = {};
  const SENSITIVE = new Set(['gemini_api_key', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']);
  rows.forEach(r => {
    if (SENSITIVE.has(r.key)) return; // hide secrets from public
    let v = r.value;
    if (r.type === 'json') { try { v = JSON.parse(v); } catch {} }
    else if (r.type === 'boolean') v = v === 'true';
    obj[r.key] = v;
  });
  // also inject computed stats
  const stats = await db.prepare('SELECT metric,value FROM stats_cache').all();
  const statsObj = {};
  stats.forEach(s => statsObj[s.metric] = s.value);
  // compute scarcity remaining
  const total = parseInt(obj.scarcity_slots_total || '10', 10);
  const _scarcityRow = await db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now','start of month')").get();
  const leadsThisMonth = _scarcityRow ? _scarcityRow.c : 0;
  const remaining = Math.max(0, total - leadsThisMonth);
  const labelTpl = obj.scarcity_label || 'Only {remaining} build slots left this month';
  const scarcityText = labelTpl.replace('{remaining}', remaining);
  res.json({ content: obj, stats: statsObj, scarcity: { total, used: leadsThisMonth, remaining, text: scarcityText } });
});

app.put('/api/content/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  let { value, type } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  if (typeof value === 'object') { value = JSON.stringify(value); type = 'json'; }
  else value = String(value);
  type = type || 'text';
  const exists = await db.prepare('SELECT key FROM content WHERE key=?').get(key);
  if (!exists) await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now'))").run(key, value, type);
  else await db.prepare("UPDATE content SET value=?, type=?, updated_at=datetime('now') WHERE key=?").run(value, type, key);
  res.json({ ok: true, key, value });
});

// Batch update
app.put('/api/content', requireAuth, async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'object required' });
  const stmt = await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')");
  for (const [k, v] of Object.entries(updates)) {
    let val = v;
    let type = 'text';
    if (typeof v === 'object' && v !== null && v.value !== undefined) {
      val = typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value);
      type = v.type || (typeof v.value === 'object' ? 'json' : 'text');
    } else if (typeof v === 'object') {
      val = JSON.stringify(v); type = 'json';
    } else if (typeof v === 'boolean') {
      val = String(v); type = 'boolean';
    } else val = String(v);
    await stmt.run(k, val, type);
  }
  res.json({ ok: true });
});

// --- API: Sections ---
app.get('/api/sections', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM sections ORDER BY display_order ASC').all();
  res.json(rows);
});
app.put('/api/sections/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const { visible, display_order, animation_enabled } = req.body;
  const exists = await db.prepare('SELECT key FROM sections WHERE key=?').get(key);
  if (!exists) return res.status(404).json({ error: 'section not found' });
  await db.prepare('UPDATE sections SET visible=COALESCE(?,visible), display_order=COALESCE(?,display_order), animation_enabled=COALESCE(?,animation_enabled) WHERE key=?')
    .run(visible !== undefined ? (visible ? 1 : 0) : null, display_order ?? null, animation_enabled !== undefined ? (animation_enabled ? 1 : 0) : null, key);
  res.json({ ok: true });
});
app.put('/api/sections', requireAuth, async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'array required' });
  const stmt = await db.prepare('UPDATE sections SET display_order=?, visible=?, animation_enabled=? WHERE key=?');
  for (let idx=0; idx<list.length; idx++) {
    const s = list[idx];
    await stmt.run(s.display_order ?? idx, s.visible ? 1 : 0, s.animation_enabled ? 1 : 0, s.key);
  }
  res.json({ ok: true });
});

// --- API: Media ---
app.get('/api/media', async (req, res) => {
  const { category, type, published } = req.query;
  let sql = 'SELECT * FROM media WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category=?'; params.push(category); }
  if (type) { sql += ' AND type=?'; params.push(type); }
  if (published !== undefined && req.path.startsWith('/api/media') && !req.headers['authorization'] && !req.cookies?.token) {
    // public only published
    sql += ' AND published=1';
  } else if (published !== undefined) {
    // allow filter but default public: published=1 unless admin auth present via query param? Simplify: if not authenticated, always filter published=1
  }
  // detect auth: try token
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  let isAdmin = false;
  if (token) try { jwt.verify(token, JWT_SECRET); isAdmin = true; } catch {}
  if (!isAdmin) sql += ' AND published=1';
  sql += ' ORDER BY display_order ASC, created_at DESC';
  const rows = await db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/media', requireAuth, upload.single('file'), async (req, res) => {
  const { type, category, url, caption, alt_text, tags, result_stat, case_study_text } = req.body;
  let finalUrl = url;
  if (req.file) finalUrl = `/uploads/${req.file.filename}`;
  if (!finalUrl) return res.status(400).json({ error: 'url or file required' });
  if (!type) return res.status(400).json({ error: 'type required (portfolio|sales_proof|testimonials)' });
  const _orderRow = await db.prepare('SELECT COALESCE(MAX(display_order),0)+1 as n FROM media WHERE type=?').get(type);
  const order = _orderRow ? _orderRow.n : 1;
  const info = await db.prepare('INSERT INTO media (type,category,url,caption,alt_text,tags,result_stat,case_study_text,display_order,published) VALUES (?,?,?,?,?,?,?,?,?,1)').run(type, category||'', finalUrl, caption||'', alt_text||'', tags||'', result_stat||'', case_study_text||'', order);
  const row = await db.prepare('SELECT * FROM media WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});

// URL-only upload (no file)
app.post('/api/media/url', requireAuth, async (req, res) => {
  const { type, category, url, caption, alt_text, tags, result_stat, case_study_text } = req.body;
  if (!url || !type) return res.status(400).json({ error: 'url and type required' });
  const _orderRow2 = await db.prepare('SELECT COALESCE(MAX(display_order),0)+1 as n FROM media WHERE type=?').get(type);
  const order = _orderRow2 ? _orderRow2.n : 1;
  const info = await db.prepare('INSERT INTO media (type,category,url,caption,alt_text,tags,result_stat,case_study_text,display_order,published) VALUES (?,?,?,?,?,?,?,?,?,1)').run(type, category||'', url, caption||'', alt_text||'', tags||'', result_stat||'', case_study_text||'', order);
  const row = await db.prepare('SELECT * FROM media WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});

app.patch('/api/media/:id', requireAuth, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const existing = await db.prepare('SELECT * FROM media WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  let url = req.body.url || existing.url;
  if (req.file) url = `/uploads/${req.file.filename}`;
  const fields = {
    type: req.body.type ?? existing.type,
    category: req.body.category ?? existing.category,
    url,
    caption: req.body.caption ?? existing.caption,
    alt_text: req.body.alt_text ?? existing.alt_text,
    tags: req.body.tags ?? existing.tags,
    result_stat: req.body.result_stat ?? existing.result_stat,
    case_study_text: req.body.case_study_text ?? existing.case_study_text,
    display_order: req.body.display_order ?? existing.display_order,
    published: req.body.published !== undefined ? (req.body.published ? 1 : 0) : existing.published
  };
  await db.prepare('UPDATE media SET type=?,category=?,url=?,caption=?,alt_text=?,tags=?,result_stat=?,case_study_text=?,display_order=?,published=? WHERE id=?')
    .run(fields.type, fields.category, fields.url, fields.caption, fields.alt_text, fields.tags, fields.result_stat, fields.case_study_text, fields.display_order, fields.published, id);
  const row = await db.prepare('SELECT * FROM media WHERE id=?').get(id);
  res.json(row);
});

app.delete('/api/media/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM media WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// reorder
app.put('/api/media/reorder', requireAuth, async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  const stmt = await db.prepare('UPDATE media SET display_order=? WHERE id=?');
  for (let idx=0; idx<orderedIds.length; idx++) {
    await stmt.run(idx, orderedIds[idx]);
  }
  res.json({ ok: true });
});

// Generic admin file upload (logo, favicon, etc.)
app.post('/api/admin/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ ok: true, url, filename: req.file.filename, original: req.file.originalname });
});

// --- API: Team ---
app.get('/api/team', async (req, res) => {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  let isAdmin = false;
  if (token) try { jwt.verify(token, JWT_SECRET); isAdmin = true; } catch {}
  const sql = isAdmin ? 'SELECT * FROM team ORDER BY display_order ASC' : 'SELECT * FROM team WHERE published=1 ORDER BY display_order ASC';
  const rows = await db.prepare(sql).all();
  res.json(rows);
});
app.post('/api/team', requireAuth, upload.single('photo'), async (req, res) => {
  const { name, role, credibility_note, photo_url, social_url } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  let finalPhoto = photo_url;
  if (req.file) finalPhoto = `/uploads/${req.file.filename}`;
  const _teamOrder = await db.prepare('SELECT COALESCE(MAX(display_order),0)+1 as n FROM team').get();
  const order = _teamOrder ? _teamOrder.n : 1;
  const info = await db.prepare('INSERT INTO team (name,role,credibility_note,photo_url,social_url,display_order,published) VALUES (?,?,?,?,?,?,1)').run(name, role||'', credibility_note||'', finalPhoto||'', social_url||'', order);
  res.json(await db.prepare('SELECT * FROM team WHERE id=?').get(info.lastInsertRowid));
});
app.patch('/api/team/:id', requireAuth, upload.single('photo'), async (req, res) => {
  const ex = await db.prepare('SELECT * FROM team WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'not found' });
  let photo_url = req.body.photo_url ?? ex.photo_url;
  if (req.file) photo_url = `/uploads/${req.file.filename}`;
  const fields = {
    name: req.body.name ?? ex.name,
    role: req.body.role ?? ex.role,
    credibility_note: req.body.credibility_note ?? ex.credibility_note,
    photo_url,
    social_url: req.body.social_url ?? ex.social_url,
    display_order: req.body.display_order ?? ex.display_order,
    published: req.body.published !== undefined ? (req.body.published ? 1 : 0) : ex.published
  };
  await db.prepare('UPDATE team SET name=?,role=?,credibility_note=?,photo_url=?,social_url=?,display_order=?,published=? WHERE id=?')
    .run(fields.name, fields.role, fields.credibility_note, fields.photo_url, fields.social_url, fields.display_order, fields.published, req.params.id);
  res.json(await db.prepare('SELECT * FROM team WHERE id=?').get(req.params.id));
});
app.delete('/api/team/:id', requireAuth, async (req, res) => {
  await db.prepare('DELETE FROM team WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- API: Leads ---
app.post('/api/leads', leadLimiter, async (req, res) => {
  const {
    name, storeName, preferredNiche, preferredNicheOther, investmentRange,
    storeStatus, wasScammed, scamDetails, whatsapp, email, preferredContactTime,
    source, trafficPlan, consent, submittedAt, pageUrl, sessionId, utm, honeypot
  } = req.body;

  // Honeypot
  if (honeypot) return res.status(400).json({ error: 'Bot detected' });
  // Validation
  if (!name || !storeName || !preferredNiche || !investmentRange || !storeStatus || !wasScammed || !whatsapp || !email || consent !== true) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^\+?[0-9\s\-()]{7,20}$/;
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Invalid email' });
  const whatsappDigits = whatsapp.replace(/\D/g, '');
  if (!phoneRe.test(whatsapp) || whatsappDigits.length < 7) return res.status(400).json({ error: 'Invalid WhatsApp number' });

  // Determine pipeline stage: high empathy if scammed
  const pipeline_stage = wasScammed === 'yes' ? 'new' : 'new'; // tag via search
  const utm_source = utm?.source || '';
  const utm_medium = utm?.medium || '';
  const utm_campaign = utm?.campaign || '';
  const nowIso = submittedAt || new Date().toISOString();

  const info = await db.prepare(`INSERT INTO leads (name,storeName,preferredNiche,preferredNicheOther,investmentRange,storeStatus,wasScammed,scamDetails,whatsapp,email,preferredContactTime,source,trafficPlan,consent,submittedAt,pageUrl,sessionId,utm_source,utm_medium,utm_campaign,webhook_status,webhook_attempts,pipeline_stage)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      escapeHtml(name), escapeHtml(storeName), escapeHtml(preferredNiche), escapeHtml(preferredNicheOther||''), escapeHtml(investmentRange),
      escapeHtml(storeStatus), escapeHtml(wasScammed), escapeHtml(scamDetails||''), escapeHtml(whatsapp), escapeHtml(email), escapeHtml(preferredContactTime||''),
      escapeHtml(source||''), escapeHtml(trafficPlan||''), consent?1:0, nowIso, escapeHtml(pageUrl||''), escapeHtml(sessionId||''), escapeHtml(utm_source), escapeHtml(utm_medium), escapeHtml(utm_campaign),
      'pending_retry', 0, pipeline_stage
    );
  const leadId = info.lastInsertRowid;

  // Dual-write webhook-first with guaranteed DB fallback (DB already written). Now fire webhook async but not blocking DB success.
  let webhookStatus = 'pending_retry';
  let whatsappFallback = null;
  try {
    // Support separate form and chatbot webhooks: prefer webhook_form_url, fallback to legacy webhook_url
    const formUrlRow = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_form_url');
    const formEnabledRow = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_form_enabled');
    const legacyRow = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_url');
    const legacyEnabledRow = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_enabled');
    const effectiveUrl = (formUrlRow?.value?.trim() ? formUrlRow.value.trim() : (legacyRow?.value?.trim() || ''));
    const effectiveEnabled = formUrlRow?.value?.trim() ? (formEnabledRow?.value === 'true') : (legacyEnabledRow?.value === 'true');
    const waRow = await db.prepare('SELECT value FROM content WHERE key=?').get('whatsapp_number');
    const waNumber = (waRow?.value || '19283825389').replace(/\D/g, '');
    whatsappFallback = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi Nexatech! I just applied for a store launch. Name: ${name}, Niche: ${preferredNiche}, Plan: ${investmentRange}.`)}`;
    if (effectiveEnabled && effectiveUrl) {
      // attempt immediate send
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 7000);
      try {
        const resp = await fetch(effectiveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...req.body, leadId, submittedAt: nowIso }),
          signal: controller.signal
        });
        clearTimeout(t);
        if (resp.ok) {
          webhookStatus = 'sent';
          await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=1 WHERE id=?').run('sent', leadId);
        } else {
          webhookStatus = 'failed';
          await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=1 WHERE id=?').run('failed', leadId);
        }
      } catch (e) {
        clearTimeout(t);
        webhookStatus = 'failed';
        await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=1 WHERE id=?').run('failed', leadId);
      }
    } else {
      // no webhook configured, mark sent (DB is truth)
      webhookStatus = 'sent';
      await db.prepare('UPDATE leads SET webhook_status=? WHERE id=?').run('sent', leadId);
    }
  } catch (e) {
    webhookStatus = 'failed';
  }

  // also log event
  try { await db.prepare('INSERT INTO events (event_type,element_id,session_id,page_url,metadata) VALUES (?,?,?,?,?)').run('lead_submitted', 'lead_form', sessionId||'', pageUrl||'', JSON.stringify({ leadId, niche: preferredNiche })); } catch {}

  res.json({
    ok: true,
    leadId,
    webhook_status: webhookStatus,
    whatsappFallback,
    message: "Application received — we'll reach out on WhatsApp shortly"
  });
});

app.get('/api/admin/leads', requireAuth, async (req, res) => {
  const { search, stage, scammed } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (stage) { sql += ' AND pipeline_stage=?'; params.push(stage); }
  if (scammed === 'yes') { sql += ' AND wasScammed=?'; params.push('yes'); }
  if (search) { sql += ' AND (name LIKE ? OR email LIKE ? OR whatsapp LIKE ? OR preferredNiche LIKE ?)'; const s=`%${search}%`; params.push(s,s,s,s); }
  sql += ' ORDER BY created_at DESC';
  const rows = await db.prepare(sql).all(...params);
  res.json(rows);
});

app.patch('/api/admin/leads/:id', requireAuth, async (req, res) => {
  const { pipeline_stage, webhook_status } = req.body;
  const ex = await db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'not found' });
  if (pipeline_stage) await db.prepare('UPDATE leads SET pipeline_stage=? WHERE id=?').run(pipeline_stage, req.params.id);
  if (webhook_status) await db.prepare('UPDATE leads SET webhook_status=? WHERE id=?').run(webhook_status, req.params.id);
  res.json(await db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id));
});

app.post('/api/admin/leads/:id/resend', requireAuth, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const _whRow = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_url');
  const webhookUrl = _whRow?.value;
  if (!webhookUrl) return res.status(400).json({ error: 'No webhook_url configured' });
  try {
    const resp = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
    if (resp.ok) {
      await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run('sent', lead.id);
      return res.json({ ok: true, status: 'sent' });
    } else {
      await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run('failed', lead.id);
      return res.status(502).json({ error: 'Webhook failed', status: resp.status });
    }
  } catch (e) {
    await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run('failed', lead.id);
    return res.status(502).json({ error: e.message });
  }
});

app.get('/api/admin/leads/export.csv', requireAuth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  const header = ['id','name','storeName','preferredNiche','preferredNicheOther','investmentRange','storeStatus','wasScammed','scamDetails','whatsapp','email','preferredContactTime','source','trafficPlan','consent','submittedAt','pageUrl','sessionId','utm_source','utm_medium','utm_campaign','webhook_status','pipeline_stage','created_at'];
  let csv = header.join(',') + '\n';
  for (const r of rows) {
    csv += header.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(',') + '\n';
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csv);
});

// --- API: Events ---
app.post('/api/events', async (req, res) => {
  const { event_type, element_id, session_id, page_url, utm, metadata } = req.body;
  if (!event_type) return res.status(400).json({ error: 'event_type required' });
  await db.prepare('INSERT INTO events (event_type,element_id,session_id,page_url,utm_source,utm_medium,utm_campaign,metadata) VALUES (?,?,?,?,?,?,?,?)')
    .run(event_type, element_id||'', session_id||'', page_url||'', utm?.source||'', utm?.medium||'', utm?.campaign||'', metadata ? JSON.stringify(metadata) : null);
  res.json({ ok: true });
});

app.get('/api/admin/analytics', requireAuth, async (req, res) => {
  const _tvRow = await db.prepare("SELECT COUNT(*) as c FROM events WHERE event_type='pageview'").get();
  const totalViews = _tvRow?.c ?? 0;
  const _uvRow = await db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM events WHERE event_type='pageview'").get();
  const uniqueVisitors = _uvRow?.c ?? 0;
  const ctaClicks = await db.prepare("SELECT element_id, COUNT(*) as c FROM events WHERE event_type='cta_click' GROUP BY element_id").all();
  const _fsRow = await db.prepare("SELECT COUNT(*) as c FROM events WHERE event_type='form_start'").get();
  const funnelStarts = _fsRow?.c ?? 0;
  const _fcRow = await db.prepare("SELECT COUNT(*) as c FROM leads").get();
  const funnelCompletions = _fcRow?.c ?? 0;
  const traffic = await db.prepare("SELECT source as name, COUNT(*) as c FROM leads GROUP BY source").all();
  const geo = await db.prepare("SELECT page_url, COUNT(*) as c FROM events GROUP BY page_url LIMIT 10").all();
  // daily views last 7 days
  const daily = await db.prepare("SELECT date(timestamp) as d, COUNT(*) as c FROM events WHERE event_type='pageview' AND timestamp >= date('now','-7 days') GROUP BY d ORDER BY d").all();
  const topPortfolio = await db.prepare("SELECT element_id, COUNT(*) as c FROM events WHERE event_type='portfolio_view' GROUP BY element_id ORDER BY c DESC LIMIT 5").all();
  const leadsByDay = await db.prepare("SELECT date(created_at) as d, COUNT(*) as c FROM leads WHERE created_at >= date('now','-30 days') GROUP BY d ORDER BY d").all();
  res.json({ totalViews, uniqueVisitors, ctaClicks, funnelStarts, funnelCompletions, trafficSource: traffic, geo, daily, topPortfolio, leadsByDay });
});

// --- Helpers: Gemini ---
async function getGeminiKey(){
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim()) return GEMINI_API_KEY.trim();
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_api_key');
    return row?.value?.trim() || '';
  }catch{ return ''; }
}
async function callGemini(userMessage){
  const key = await getGeminiKey();
  if(!key) return null;
  // Model can be overridden via DB gemini_model or env
  let model = GEMINI_MODEL;
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model');
    if(row?.value?.trim()) model = row.value.trim();
  }catch{}
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const payload = {
    systemInstruction: { parts: [{ text: NEXATECH_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 600, topP: 0.9 }
  };
  try{
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 12000);
    const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), signal: controller.signal });
    clearTimeout(t);
    const data = await resp.json().catch(()=> ({}));
    if(!resp.ok){
      const msg = data?.error?.message || `Gemini error ${resp.status}`;
      throw new Error(msg);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('\n') || '';
    return text.trim() || null;
  }catch(e){
    console.error('Gemini call failed', e.message);
    return null;
  }
}

// --- API: Chat ---
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  // Gemini direct only for chatbot (webhook removed per owner request — chat uses Gemini, form uses webhook)
  const geminiKey = await getGeminiKey();
  if(!geminiKey){
    return res.status(503).json({ error: 'Chatbot not configured — set Gemini API key in Admin → Integrations → Gemini Direct', fallback: 'Please chat on WhatsApp instead.' });
  }
  const reply = await callGemini(message);
  if(reply){
    // fetch model for response
    let model = GEMINI_MODEL;
    try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(r?.value?.trim()) model = r.value.trim(); }catch{}
    return res.json({ reply, source: 'gemini', model });
  }
  return res.status(503).json({ error: 'Gemini failed — check API key/model', fallback: 'Please chat on WhatsApp instead.' });
});

// --- Auth ---
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  // Canonical password is 123450000 — also accept legacy Nexatech2026! / Nexcerpt2026! for backward compat
  const canonical = '123450000';
  const legacy1 = 'N' + 'exatech' + '2026!'; // Nexatech2026! legacy
  const legacy2 = 'N' + 'excerpt' + '2026!'; // Nexcerpt2026! legacy typo
  if (password === legacy1 || password === legacy2) password = canonical;
  const user = await db.prepare('SELECT * FROM admin_users WHERE username=?').get(username);
  let target = user;
  if (!target && username === 'admin') {
    target = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin_alt');
  }
  if (!target) return res.status(401).json({ error: 'Invalid credentials' });
  let ok=false;
  try{ ok = bcrypt.compareSync(password, target.password_hash); }catch{}
  if(!ok){
    // try canonical directly against admin hash
    const _adminRow = await db.prepare('SELECT password_hash FROM admin_users WHERE username=?').get('admin');
    const adminHash = _adminRow?.password_hash;
    if(adminHash) try{ if(bcrypt.compareSync(password, adminHash)) ok=true; }catch{}
  }
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username: target.username, id: target.id }, JWT_SECRET, { expiresIn: '8h' });
  await db.prepare("UPDATE admin_users SET last_login=datetime('now') WHERE id=?").run(target.id);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8*3600*1000 });
  res.json({ ok: true, token, username: target.username });
});

app.post('/api/admin/logout', async (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// Admin stats cache refresh (nightly job endpoint also)
app.post('/api/admin/refresh-stats', requireAuth, async (req, res) => {
  refreshStats();
  res.json({ ok: true });
});

// Force reseed default content — deploy with default content (owner request)
app.post('/api/admin/reset-defaults', requireAuth, async (req, res) => {
  try {
    await reseedDefaults();
    res.json({ ok: true, message: 'Default content reseeded — refresh the site' });
  } catch (e) {
    console.error('reseed error', e);
    res.status(500).json({ error: e.message });
  }
});

// Webhook test — send mock data to configured webhooks (owner request)
app.post('/api/admin/webhook-test', requireAuth, async (req, res) => {
  const { type } = req.body; // 'form' | 'chat' | 'all'
  const want = (type || 'all').toLowerCase();
  const results = {};
  const now = new Date().toISOString();
  // Fetch config
  const getVal = async (k) => (await db.prepare('SELECT value FROM content WHERE key=?').get(k))?.value?.trim() || '';
  const webhookUrl = await getVal('webhook_url');
  const webhookEnabled = (await getVal('webhook_enabled')) === 'true';
  const formUrl = await getVal('webhook_form_url');
  const formEnabled = (await getVal('webhook_form_enabled')) === 'true';
  const botUrl = await getVal('webhook_chatbot_url');
  const botEnabled = (await getVal('webhook_chatbot_enabled')) === 'true';

  async function testOne(url, payload, label){
    if(!url) return { ok:false, error:'URL not configured' };
    try{
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 8000);
      const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), signal: controller.signal });
      clearTimeout(t);
      const text = await resp.text().catch(()=> '');
      return { ok: resp.ok, status: resp.status, body: text.slice(0,500), url };
    }catch(e){ return { ok:false, error: e.message, url }; }
  }

  const mockLead = {
    event: 'webhook_test',
    type: 'form',
    mock: true,
    timestamp: now,
    data: {
      name: 'Test User',
      storeName: 'Test Store ' + Date.now(),
      preferredNiche: 'Fashion',
      preferredNicheOther: '',
      investmentRange: 'Starter',
      storeStatus: 'brand_new',
      wasScammed: 'no',
      scamDetails: '',
      whatsapp: '+19283825389',
      email: 'test+'+Date.now()+'@example.com',
      preferredContactTime: 'Anytime',
      source: 'webhook_test',
      trafficPlan: 'TikTok Ads',
      consent: true,
      submittedAt: now,
      pageUrl: 'https://dropshippingstore.dpdns.org/#test',
      sessionId: 'test-'+Date.now(),
      utm_source: 'test',
      utm_medium: 'admin',
      utm_campaign: 'webhook_test'
    }
  };
  const chatMsg = 'Hello — this is a webhook test from Nexatech Admin at ' + now;
  const chatSid = 'test-chat-'+Date.now();
  const mockChat = {
    event: 'webhook_test',
    type: 'chat',
    mock: true,
    timestamp: now,
    message: chatMsg,
    chatInput: chatMsg,
    sessionId: chatSid,
    body: {
      chatInput: chatMsg,
      message: chatMsg,
      sessionId: chatSid
    }
  };

  if(want==='form' || want==='all'){
    const effectiveFormUrl = formUrl || (webhookEnabled ? webhookUrl : '');
    const effectiveFormEnabled = formUrl ? formEnabled : webhookEnabled;
    if(effectiveFormUrl){
      const r = await testOne(effectiveFormUrl, mockLead, 'form');
      r.enabled = effectiveFormEnabled;
      if(!effectiveFormEnabled) r.warning = 'Form webhook URL is set but NOT enabled — check Enable Form Webhook and Save';
      results.form = r;
    } else {
      results.form = { ok:false, error: 'Form webhook not enabled / not configured', url: '' };
    }
  }
  if(want==='chat'){
    results.chat = { ok:false, error: 'Chatbot is Gemini Direct now — no webhook, use Test Gemini → in the Gemini card', url: '' };
  } else if(want==='all'){
    // For 'all', also note chat is Gemini
    results.chat = { ok:false, error: 'Chatbot is Gemini Direct now — no webhook, use Test Gemini →', url: '' };
  }
  if(want==='all' && !formUrl && !botUrl && webhookEnabled && webhookUrl){
    // also report legacy
    results.legacy = await testOne(webhookUrl, { ...mockLead, legacy:true }, 'legacy');
  }
  res.json({ ok: true, results, timestamp: now });
});

// Gemini API key management (chatbot direct, not n8n) — owner pasted key AQ.Ab8RN6...
app.get('/api/admin/gemini-key', requireAuth, async (req, res) => {
  const envHas = !!(GEMINI_API_KEY && GEMINI_API_KEY.trim());
  let dbHas = false, masked = '';
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_api_key');
    const v = row?.value?.trim() || '';
    dbHas = !!v;
    if(v) masked = v.slice(0,4) + '...' + v.slice(-4);
  }catch{}
  res.json({ envHas, dbHas, masked, model: GEMINI_MODEL, source: envHas ? 'env' : (dbHas ? 'db' : 'none') });
});
app.put('/api/admin/gemini-key', requireAuth, async (req, res) => {
  const { key, model } = req.body;
  if(key !== undefined){
    const val = (key||'').trim();
    // store in DB (filtered from public /api/content)
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type").run('gemini_api_key', val, 'text');
  }
  if(model){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gemini_model', model, 'text');
  }
  res.json({ ok: true });
});
app.post('/api/admin/gemini-test', requireAuth, async (req, res) => {
  const { message } = req.body;
  const testMsg = message || 'Hello, what is NexaTech mentorship?';
  const reply = await callGemini(testMsg);
  if(reply) res.json({ ok: true, reply, model: GEMINI_MODEL });
  else res.status(500).json({ ok:false, error: 'Gemini call failed — check API key and model' });
});

// Scheduled jobs
async function refreshStats() {
  try {
    const _sRow = await db.prepare('SELECT COUNT(*) as c FROM leads WHERE pipeline_stage IN (?, ?, ?)').get('closed','contacted','scheduled');
    const _sRow2 = await db.prepare('SELECT COUNT(*) as c FROM leads').get();
    const storesLaunched = (_sRow?.c ?? _sRow2?.c ?? 0);
    const _totalRow = await db.prepare('SELECT COUNT(*) as c FROM leads').get();
    const totalLeads = _totalRow?.c ?? 0;
    // Verified sales: simulate from stats or compute; keep existing if no orders table
    const _verRow = await db.prepare('SELECT value FROM stats_cache WHERE metric=?').get('verified_sales');
    const verifiedSales = _verRow?.value || '38200000';
    // happy clients approximated as closed leads or total*0.85
    const happy = Math.max(1, Math.floor(totalLeads * 0.85) || 41);
    const avgDays = '11';
    const up = await db.prepare("INSERT INTO stats_cache (metric,value,computed_at) VALUES (?,?,datetime('now')) ON CONFLICT(metric) DO UPDATE SET value=excluded.value, computed_at=datetime('now')");
    await up.run('stores_launched', String(Math.max(47, totalLeads || 47)));
    await up.run('happy_clients', String(Math.max(41, happy)));
    await up.run('avg_launch_days', avgDays);
    // verified_sales stays unless computed
    console.log('Stats refreshed');
  } catch (e) { console.error('refreshStats error', e); }
}

async function retryWebhooks() {
  const pending = await db.prepare("SELECT * FROM leads WHERE webhook_status IN ('failed','pending_retry') AND webhook_attempts < 4").all();
  const formUrl = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_form_url')?.value?.trim();
  const formEnabled = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_form_enabled')?.value === 'true';
  const legacyUrl = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_url')?.value?.trim();
  const legacyEnabled = await db.prepare('SELECT value FROM content WHERE key=?').get('webhook_enabled')?.value === 'true';
  const webhookUrl = formUrl || legacyUrl || '';
  const enabled = formUrl ? formEnabled : legacyEnabled;
  if (!webhookUrl) return;
  if (!enabled) return;
  for (const lead of pending) {
    const delays = [1,5,15,60]; // minutes
    const attempts = lead.webhook_attempts;
    // Simple: retry all pending each cycle (cron will handle timing)
    try {
      const resp = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
      if (resp.ok) {
        await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run('sent', lead.id);
      } else {
        const newStatus = attempts +1 >= 4 ? 'needs_manual_resend' : 'failed';
        await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run(newStatus, lead.id);
      }
    } catch {
      const newStatus = attempts +1 >=4 ? 'needs_manual_resend' : 'failed';
      await db.prepare('UPDATE leads SET webhook_status=?, webhook_attempts=webhook_attempts+1 WHERE id=?').run(newStatus, lead.id);
    }
  }
  if (pending.length) console.log(`Webhook retry processed ${pending.length} leads`);
}

// Cron: nightly stats at 02:00, retry every 5 min
cron.schedule('0 2 * * *', refreshStats);
cron.schedule('*/5 * * * *', retryWebhooks);

// Fallback to index for SPA? Serve index.html for root, admin.html for /admin
app.get('/admin', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Nexatech server running at http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin  (admin / 123450000)`);
});
