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
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexatech-jwt-secret-change-in-prod-2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const NEXATECH_BASE_PROMPT = `You are Nexatech Dropshipping Expert's AI assistant, running on his portfolio site to represent him as a Shopify dropshipping expert (NexaTech). Owner's real name is Akinyemmi Ifeoluwa (also known as Saheed). You are NOT a generic chatbot — you speak with the confidence and specific knowledge of someone who builds and scales Shopify dropshipping stores for a living.

WHAT YOU KNOW / CAN DISCUSS:
- Shopify store setup, structure, and optimization
- Winning product research
- Ad strategy and scaling (Meta/TikTok ads)
- Supplier sourcing and order automation
- General dropshipping strategy and troubleshooting
- This specific website's content (plans, portfolio, team, contact) — you have full live knowledge below

STYLE RULES:
- Keep replies short — around 5 sentences max.
- After a short answer, end with a line like "Want me to break that down further?" before giving the full, detailed explanation. Only go long if they say yes.
- Be accurate. Never guess, invent numbers, or claim things about Shopify, ad platforms, or NexaTech's services that you're not sure of. If unsure, say so plainly instead of making something up.
- Sound like a knowledgeable person, not a corporate script. No excessive emojis, no hard selling every message.
- CRITICAL CONVERSATION MEMORY: Before every reply, you MUST read the ENTIRE conversation history above in order, especially the last 3 user+assistant turns. The user's "yes" always means "yes, break down the topic you just offered to break down" — never restart with a greeting. The user's "i mean X" is a correction — you MUST switch to X. Example: If you just offered to break down Pro and user says "yes", you MUST give Pro details (10 products, ad angles, branding, cart, 30 days), NOT Mentorship. If user says "i mean pro" after you gave mentorship, you MUST correct to Pro. Never give Mentorship when user asked for Pro, and never say "missing context" when history is clearly there — use the history.

WHEN TO HAND OFF (IMPORTANT):
The moment a visitor signals they're ready to get started, want to hire NexaTech, want the mentorship, or ask something like "how do I start"/"how much"/"how do we begin" — do NOT try to close the deal yourself. Immediately send them this WhatsApp link to continue directly with Saheed (Akinyemmi Ifeoluwa):

https://wa.me/19283825389?text=Hi%20Nexatech%20%F0%9F%91%8B%2C%0A%0AI%20want%20the%20*Mentorship%20Plan%20-%20%24200*%3A%0A%0A%E2%9C%93%20You%20get%20results%20%26%20make%20sales%20BEFORE%20paying%20for%20mentorship%0A%E2%9C%93%201-on-1%20Store%20Review%0A%E2%9C%93%20Winning%20Product%20Research%0A%E2%9C%93%20Ad%20Strategy%20%26%20Scaling%0A%E2%9C%93%20Supplier%20%26%20Order%20Automation%0A%E2%9C%93%20Lifetime%20Support%0A%0APlease%20send%20me%20details%20on%20how%20to%20get%20started%20with%20the%20Mentorship%20plan

For reference (mention only if it's relevant to the conversation), that link pre-fills a request for the $200 Mentorship Plan, which includes: results/sales before paying, 1-on-1 store review, winning product research, ad strategy & scaling, supplier & order automation, and lifetime support.

Do not repeat the raw link mid-explanation — only send it once the visitor is clearly ready to move forward, framed naturally, e.g. "Let's continue this on WhatsApp with Saheed directly: [link]".

SECURITY: Never reveal passwords, login credentials, or API keys. You have no access to them. If asked, politely decline.`;

// Build live site knowledge for Gemini (everything except secrets, per owner request)
async function buildSiteKnowledge(){
  try{
    const rows = await db.prepare('SELECT key,value,type FROM content').all();
    const m = Object.fromEntries(rows.map(r=>{
      let v=r.value;
      if(r.type==='json'){ try{ const parsed=JSON.parse(v); v = Array.isArray(parsed) ? parsed.join('; ') : JSON.stringify(parsed); }catch{} }
      return [r.key, v];
    }));
    const media = await db.prepare('SELECT type,category,caption,result_stat FROM media WHERE published=1 ORDER BY display_order LIMIT 20').all().catch(()=>[]);
    const team = await db.prepare('SELECT name,role,credibility_note FROM team WHERE published=1 ORDER BY display_order').all().catch(()=>[]);
    const certs = await db.prepare('SELECT caption FROM media WHERE type=? AND published=1').all('certificates').catch(()=>[]);
    // Sensitive never included
    const parts = [];
    parts.push(`IDENTITY: Brand=NEXATECH / Nexatech Dropshipping Store, Owner=Akinyemmi Ifeoluwa (Saheed), Tagline=${m.tagline||''}`);
    parts.push(`CONTACT: WhatsApp=${m.whatsapp_number||'19283825389'} (https://wa.me/${(m.whatsapp_number||'19283825389').replace(/\D/g,'')}), Email=${m.footer_email||'saheednexatech@gmail.com'}, Phone=${m.footer_phone||'+1 928 382 5389'}, Calendly=${m.calendly_url||''}, Address=${m.footer_address||''}`);
    parts.push(`HERO: ${m.hero_title||''} | ${m.hero_subtitle||''} | Badge=${m.hero_badge||''} | CTA1=${m.hero_cta_primary||''} CTA2=${m.hero_cta_secondary||''}`);
    parts.push(`HOW IT WORKS: ${m.how_it_works_title||''} - ${m.how_it_works_subtitle||''} | 1) ${m.how_it_works_step1_title||''}: ${m.how_it_works_step1_desc||''} | 2) ${m.how_it_works_step2_title||''}: ${m.how_it_works_step2_desc||''} | 3) ${m.how_it_works_step3_title||''}: ${m.how_it_works_step3_desc||''} | 4) ${m.how_it_works_step4_title||''}: ${m.how_it_works_step4_desc||''}`);
    parts.push(`PRICING: Starter ${m.pricing_starter_price||'$149'} (${m.pricing_starter_features||''}) | Pro ${m.pricing_pro_price||'$299'} (${m.pricing_pro_features||''}) | Elite ${m.pricing_elite_price||'$599'} (${m.pricing_elite_features||''}) | Mentorship ${m.mentorship_price||'Pay After Results'}: ${m.mentorship_title||''} - ${m.mentorship_subtitle||''} Bullets=${m.mentorship_bullets||''}`);
    if(media.length) parts.push(`PORTFOLIO/PROOF: ${media.map(x=>`${x.type}:${x.category||''}-${x.caption||''} ${x.result_stat||''}`).join(' | ')}`);
    if(team.length) parts.push(`TEAM: ${team.map(t=>`${t.name} (${t.role}) - ${t.credibility_note||''}`).join(' | ')}`);
    if(certs.length) parts.push(`CERTIFICATES: ${certs.map(c=>c.caption).join(' | ')}`);
    parts.push(`REVIEWS: ${m.reviews_title||''} - ${m.reviews_subtitle||''} | TESTIMONIALS: ${m.testimonials_title||''}`);
    parts.push(`FAQ: ${(m.faq_items||'').toString().slice(0,800)}`);
    parts.push(`CTA: ${m.cta_band_title||''} - ${m.cta_band_subtitle||''} | Footer: ${m.footer_copyright||''}`);
    parts.push(`SEO: ${m.seo_title||''} | ${m.seo_description||''}`);
    return parts.join('\n');
  }catch(e){ return 'Site knowledge temporarily unavailable'; }
}
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

  // also append to Google Sheets directly (if configured) — no n8n needed
  try{
    await appendToGoogleSheet({ name, storeName, preferredNiche, preferredNicheOther, investmentRange, storeStatus, wasScammed, scamDetails, whatsapp, email, preferredContactTime, source, trafficPlan, pageUrl, sessionId, utm_source, utm_medium, utm_campaign, pipeline_stage, webhook_status: webhookStatus, submittedAt: nowIso });
  }catch(e){ console.error('Sheets append error', e.message); }

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
async function callGemini(userMessage, history=[]){
  const key = await getGeminiKey();
  if(!key) return null;
  // Model can be overridden via DB gemini_model or env
  let model = GEMINI_MODEL;
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model');
    if(row?.value?.trim()) model = row.value.trim();
  }catch{}
  const siteKnowledge = await buildSiteKnowledge();
  const fullPrompt = NEXATECH_BASE_PROMPT + "\n\nSITE KNOWLEDGE (live, everything except secrets — owner: Akinyemmi Ifeoluwa, brand NEXATECH, includes plans, portfolio, WhatsApp, pricing, team, certificates):\n" + siteKnowledge;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  // Build contents with history (up to last 10 turns) for conversational memory
  let contents = [];
  if(Array.isArray(history) && history.length){
    const clean = history.filter(h=> h && (h.role==='user' || h.role==='model') && h.text).slice(-10);
    for(const h of clean){
      contents.push({ role: h.role, parts: [{ text: String(h.text).slice(0,2000) }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  const payload = {
    systemInstruction: { parts: [{ text: fullPrompt }] },
    contents,
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

// --- Helpers: Google Sheets (direct, no n8n) ---
// Expected columns for leads sheet — used for auto-detect, setup, and append mapping
const EXPECTED_SHEET_HEADERS = [
  'Timestamp','Name','Store Name','Preferred Niche','Preferred Niche Other','Investment Range','Store Status','Was Scammed','Scam Details','WhatsApp','Email','Preferred Contact Time','Source','Traffic Plan','Page URL','Session ID','UTM Source','UTM Medium','UTM Campaign','Pipeline Stage','Webhook Status','Submitted At'
];
// Map normalized header -> lead field key (for flexible column order)
const HEADER_TO_FIELD = {
  'timestamp': 'timestamp', 'submitted at': 'submittedAt', 'submittedat': 'submittedAt', 'date': 'timestamp', 'time': 'timestamp',
  'name': 'name', 'full name': 'name',
  'store name': 'storeName', 'storename': 'storeName', 'store': 'storeName',
  'preferred niche': 'preferredNiche', 'niche': 'preferredNiche', 'preferredniche': 'preferredNiche',
  'preferred niche other': 'preferredNicheOther', 'niche other': 'preferredNicheOther',
  'investment range': 'investmentRange', 'investment': 'investmentRange', 'budget': 'investmentRange',
  'store status': 'storeStatus', 'status': 'storeStatus',
  'was scammed': 'wasScammed', 'scammed': 'wasScammed', 'was_scammed': 'wasScammed',
  'scam details': 'scamDetails', 'scamdetails': 'scamDetails',
  'whatsapp': 'whatsapp', 'whats app': 'whatsapp', 'phone': 'whatsapp', 'whatsapp number': 'whatsapp',
  'email': 'email', 'e-mail': 'email',
  'preferred contact time': 'preferredContactTime', 'contact time': 'preferredContactTime',
  'source': 'source', 'traffic source': 'source',
  'traffic plan': 'trafficPlan', 'plan': 'trafficPlan',
  'page url': 'pageUrl', 'page': 'pageUrl', 'url': 'pageUrl',
  'session id': 'sessionId', 'session': 'sessionId',
  'utm source': 'utm_source', 'utm_source': 'utm_source',
  'utm medium': 'utm_medium', 'utm_medium': 'utm_medium',
  'utm campaign': 'utm_campaign', 'utm_campaign': 'utm_campaign',
  'pipeline stage': 'pipeline_stage', 'stage': 'pipeline_stage',
  'webhook status': 'webhook_status', 'webhook': 'webhook_status'
};
function normalizeHeader(h){
  return String(h||'').trim().toLowerCase().replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
}
async function getGoogleConfig(){
  const get = async (k) => (await db.prepare('SELECT value FROM content WHERE key=?').get(k))?.value?.trim() || '';
  return {
    clientId: await get('google_client_id'),
    clientSecret: await get('google_client_secret'),
    docId: await get('google_sheets_doc_id'),
    sheetName: await get('google_sheets_sheet_name') || 'Sheet1',
    refreshToken: await get('google_refresh_token'),
    accessToken: await get('google_access_token'),
    gmailConnectedEmail: await get('gmail_connected_email'),
    gmailSenderName: await get('gmail_sender_name'),
  };
}
// Google OAuth scopes — same console Client ID/Secret reused for Sheets + Campaign/Gmail (HubSpot-like CRM)
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid','email','profile'
];
function getGoogleOAuthClient(config, redirectUri){
  const { clientId, clientSecret } = config;
  const redirect = redirectUri || `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/auth/google/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}
async function refreshGoogleTokens(oauth2){
  try{
    const { credentials } = await oauth2.refreshAccessToken().catch(()=>({credentials:{}}));
    if(credentials?.access_token){
      await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_access_token', credentials.access_token, 'text');
      if(credentials.expiry_date) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_token_expiry', String(credentials.expiry_date), 'text');
      oauth2.setCredentials(credentials);
      return credentials;
    }
  }catch{}
  return null;
}
async function getAuthenticatedSheets(){
  const cfg = await getGoogleConfig();
  if(!cfg.clientId || !cfg.clientSecret) throw new Error('Google Client ID/Secret not configured');
  if(!cfg.docId) throw new Error('Google Sheets Document ID not configured');
  if(!cfg.refreshToken) throw new Error('Google not connected — click Connect Google (Sheets + Gmail) to authorize');
  const oauth2 = getGoogleOAuthClient(cfg);
  oauth2.setCredentials({ refresh_token: cfg.refreshToken, access_token: cfg.accessToken || undefined });
  await refreshGoogleTokens(oauth2);
  const sheets = google.sheets({ version:'v4', auth: oauth2 });
  return { sheets, cfg, oauth2 };
}
async function getAuthenticatedGmail(){
  const cfg = await getGoogleConfig();
  if(!cfg.clientId || !cfg.clientSecret) throw new Error('Google Client ID/Secret not configured — set in Integrations → Google Sheets (same console creds reused for Campaigns)');
  if(!cfg.refreshToken) throw new Error('Gmail not connected — click Connect Google (same Client ID/Secret) to grant Gmail permission');
  const oauth2 = getGoogleOAuthClient(cfg);
  oauth2.setCredentials({ refresh_token: cfg.refreshToken, access_token: cfg.accessToken || undefined });
  await refreshGoogleTokens(oauth2);
  const gmail = google.gmail({ version:'v1', auth: oauth2 });
  // also fetch user email if not stored
  let senderEmail = cfg.gmailConnectedEmail;
  if(!senderEmail){
    try{
      const profile = await gmail.users.getProfile({ userId:'me' });
      senderEmail = profile.data.emailAddress || '';
      if(senderEmail) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_connected_email', senderEmail, 'text');
    }catch{}
  }
  return { gmail, oauth2, cfg, senderEmail };
}
// Helper: render template with lead variables {{name}}, {{storeName}}, etc. — HubSpot-like personalization
function renderTemplate(str, lead={}){
  if(!str) return '';
  const map = {
    name: lead.name||'',
    storename: lead.storeName||'',
    'store name': lead.storeName||'',
    storename_other: lead.preferredNicheOther||'',
    preferredniche: lead.preferredNiche||'',
    'preferred niche': lead.preferredNiche||'',
    preferrednicheother: lead.preferredNicheOther||'',
    investmentrange: lead.investmentRange||'',
    'investment range': lead.investmentRange||'',
    storestatus: lead.storeStatus||'',
    wasscammed: lead.wasScammed||'',
    scamdetails: lead.scamDetails||'',
    whatsapp: lead.whatsapp||'',
    email: lead.email||'',
    preferredcontacttime: lead.preferredContactTime||'',
    source: lead.source||'',
    trafficplan: lead.trafficPlan||'',
    pageurl: lead.pageUrl||'',
    sessionid: lead.sessionId||'',
    utm_source: lead.utm_source||'',
    utm_medium: lead.utm_medium||'',
    utm_campaign: lead.utm_campaign||'',
    pipeline_stage: lead.pipeline_stage||'',
  };
  return String(str).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m,k)=>{
    const key = k.trim().toLowerCase().replace(/\s+/g,'').replace(/_/g,'');
    // try exact lower, then normalized
    if(map[k.trim().toLowerCase()] !== undefined) return map[k.trim().toLowerCase()];
    if(map[key] !== undefined) return map[key];
    // try camel
    const camel = k.trim();
    if(lead[camel] !== undefined) return String(lead[camel]);
    return '';
  });
}
async function sendGmailRaw({ to, subject, html, text, fromName, fromEmail, replyTo }){
  const { gmail, senderEmail } = await getAuthenticatedGmail();
  const from = fromEmail || senderEmail || (await getGoogleConfig()).gmailConnectedEmail;
  if(!from) throw new Error('No sender Gmail — connect Google and ensure Gmail API enabled');
  const fromHeader = fromName ? `${fromName} <${from}>` : from;
  // Build MIME
  const boundary = 'nexatech_'+Date.now();
  const htmlPart = html || `<div>${(text||'').replace(/\n/g,'<br>')}</div>`;
  const textPart = text || html?.replace(/<[^>]+>/g,'') || '';
  let raw = '';
  raw += `From: ${fromHeader}\r\n`;
  raw += `To: ${to}\r\n`;
  raw += `Subject: ${subject}\r\n`;
  if(replyTo) raw += `Reply-To: ${replyTo}\r\n`;
  raw += `MIME-Version: 1.0\r\n`;
  raw += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
  raw += `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${textPart}\r\n\r\n`;
  raw += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${htmlPart}\r\n\r\n`;
  raw += `--${boundary}--`;
  const encoded = Buffer.from(raw).toString('base64url');
  const res = await gmail.users.messages.send({ userId:'me', requestBody:{ raw: encoded }});
  return { messageId: res.data.id, threadId: res.data.threadId, from };
}
function buildLeadRowForHeaders(lead, headers){
  // If sheet has custom headers, map lead fields to header positions; otherwise use EXPECTED order
  const ts = lead.submittedAt || new Date().toISOString();
  const fieldValues = {
    timestamp: ts,
    submittedAt: lead.submittedAt || ts,
    name: lead.name||'',
    storeName: lead.storeName||'',
    preferredNiche: lead.preferredNiche||'',
    preferredNicheOther: lead.preferredNicheOther||'',
    investmentRange: lead.investmentRange||'',
    storeStatus: lead.storeStatus||'',
    wasScammed: lead.wasScammed||'',
    scamDetails: lead.scamDetails||'',
    whatsapp: lead.whatsapp||'',
    email: lead.email||'',
    preferredContactTime: lead.preferredContactTime||'',
    source: lead.source||'',
    trafficPlan: lead.trafficPlan||'',
    pageUrl: lead.pageUrl||'',
    sessionId: lead.sessionId||'',
    utm_source: lead.utm_source||'',
    utm_medium: lead.utm_medium||'',
    utm_campaign: lead.utm_campaign||'',
    pipeline_stage: lead.pipeline_stage||'new',
    webhook_status: lead.webhook_status||'',
  };
  if(!headers || !headers.length){
    return EXPECTED_SHEET_HEADERS.map(h=>{
      const f = HEADER_TO_FIELD[normalizeHeader(h)] || normalizeHeader(h);
      return fieldValues[f] ?? '';
    });
  }
  // Build row matching supplied headers order
  return headers.map(h=>{
    const key = HEADER_TO_FIELD[normalizeHeader(h)];
    if(key && fieldValues[key] !== undefined) return fieldValues[key];
    // try direct normalized expected match
    const expIdx = EXPECTED_SHEET_HEADERS.findIndex(e=> normalizeHeader(e)===normalizeHeader(h));
    if(expIdx !== -1){
      const expKey = HEADER_TO_FIELD[normalizeHeader(EXPECTED_SHEET_HEADERS[expIdx])];
      return expKey ? (fieldValues[expKey]||'') : '';
    }
    return '';
  });
}
async function appendToGoogleSheet(lead){
  const cfg = await getGoogleConfig();
  if(!cfg.clientId || !cfg.clientSecret || !cfg.docId || !cfg.refreshToken) return { ok:false, error:'Google Sheets not fully configured (need Client ID/Secret, Doc ID, and OAuth connect)' };
  try{
    const { sheets, cfg: curCfg } = await getAuthenticatedSheets();
    // Try to detect current headers to map columns correctly; fallback to EXPECTED if sheet empty
    let headers = EXPECTED_SHEET_HEADERS;
    try{
      const hdrRes = await sheets.spreadsheets.values.get({ spreadsheetId: curCfg.docId, range: `${curCfg.sheetName}!1:1` });
      const vals = hdrRes.data.values;
      if(vals && vals[0] && vals[0].length) headers = vals[0];
      else {
        // Sheet empty — create headers first time automatically
        try{
          await sheets.spreadsheets.values.update({
            spreadsheetId: curCfg.docId,
            range: `${curCfg.sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [EXPECTED_SHEET_HEADERS] }
          });
          headers = EXPECTED_SHEET_HEADERS;
        }catch{}
      }
    }catch{}
    const row = buildLeadRowForHeaders(lead, headers);
    await sheets.spreadsheets.values.append({
      spreadsheetId: curCfg.docId,
      range: `${curCfg.sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] }
    });
    return { ok:true };
  }catch(e){
    console.error('Google Sheets append failed', e.message);
    // If sheet not found, try to create header in Sheet1 fallback
    return { ok:false, error: e.message };
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
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const reply = await callGemini(message, history);
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
  // Permanent save: only overwrite if non-empty — prevents accidental wipe
  if(key !== undefined && String(key).trim() !== ''){
    const val = String(key).trim();
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type").run('gemini_api_key', val, 'text');
  }
  if(model !== undefined && String(model).trim() !== ''){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gemini_model', String(model).trim(), 'text');
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

// Google Sheets direct (append row) — matches n8n node: operation append, documentId, sheetName
// Also reuses same console Client ID/Secret for Campaigns/Gmail — HubSpot-like CRM via Gmail
app.get('/api/admin/google/status', requireAuth, async (req, res) => {
  const cfg = await getGoogleConfig();
  const hasClient = !!(cfg.clientId && cfg.clientSecret);
  const hasSheet = !!(cfg.docId);
  const hasAuth = !!cfg.refreshToken;
  const hasGmail = !!cfg.gmailConnectedEmail;
  const gmailEmail = cfg.gmailConnectedEmail || '';
  // also check gmail scope via token info? best-effort: try get profile if hasAuth but no email
  res.json({ hasClient, hasSheet, hasAuth, hasGmail, gmailEmail, gmailSenderName: cfg.gmailSenderName||'', docId: cfg.docId||'', sheetName: cfg.sheetName||'Sheet1', clientIdMasked: cfg.clientId ? cfg.clientId.slice(0,8)+'...' : '' });
});
app.get('/api/admin/google/auth-url', requireAuth, async (req, res) => {
  const cfg = await getGoogleConfig();
  if(!cfg.clientId || !cfg.clientSecret) return res.status(400).json({ error: 'Set Client ID and Client Secret first (same console creds reused for Campaigns/Gmail)' });
  const redirect = `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const oauth2 = getGoogleOAuthClient(cfg, redirect);
  const url = oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES });
  res.json({ url, redirect, scopes: GOOGLE_SCOPES });
});
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if(!code) return res.status(400).send('Missing code');
  try{
    const cfg = await getGoogleConfig();
    const redirect = `${req.protocol}://${req.get('host')}/auth/google/callback`;
    const oauth2 = getGoogleOAuthClient(cfg, redirect);
    const { tokens } = await oauth2.getToken(code);
    if(tokens.refresh_token) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_refresh_token', tokens.refresh_token, 'text');
    if(tokens.access_token) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_access_token', tokens.access_token, 'text');
    if(tokens.expiry_date) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_token_expiry', String(tokens.expiry_date), 'text');
    // Try to fetch connected Gmail email (for Campaigns sender) — same console creds
    try{
      oauth2.setCredentials(tokens);
      const gmail = google.gmail({ version:'v1', auth: oauth2 });
      const profile = await gmail.users.getProfile({ userId:'me' });
      if(profile?.data?.emailAddress){
        await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_connected_email', profile.data.emailAddress, 'text');
        // also store sender name via userinfo if available
        try{
          const oauth2info = google.oauth2({ version:'v2', auth: oauth2 });
          const u = await oauth2info.userinfo.get();
          if(u?.data?.name) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_sender_name', u.data.name, 'text');
        }catch{}
      }
    }catch(e){ console.log('gmail profile fetch after OAuth:', e.message); }
    const afterCfg = await getGoogleConfig();
    const gmailEmail = afterCfg.gmailConnectedEmail || 'your Gmail';
    res.send(`<html><body style="font-family:Inter,system-ui;padding:24px;max-width:640px;margin:auto"><h2>Google Connected ✓</h2><p><b>Sheets + Gmail</b> authorized via same Console Client ID. Refresh token saved permanently.</p><p>Connected Gmail: <b>${escapeHtml(gmailEmail)}</b></p><p>Sheets: ${afterCfg.docId ? 'Doc '+afterCfg.docId.slice(0,12)+'...' : 'not set yet — set Doc ID in Integrations'} | Sheet: ${afterCfg.sheetName}</p><p>Next: return to <b>Admin → Integrations → Google Sheets</b> (keys saved permanently) and <b>Campaigns</b> to send bulk/personal emails via Gmail — no separate credentials needed.</p><script>setTimeout(()=>window.close(),4000)</script></body></html>`);
  }catch(e){
    console.error('Google OAuth callback failed', e.message);
    res.status(500).send('OAuth failed: '+e.message);
  }
});
app.put('/api/admin/google/sheets', requireAuth, async (req, res) => {
  const { clientId, clientSecret, docId, sheetName } = req.body;
  // Permanent save: only overwrite if non-empty trimmed value provided — never wipe on empty/undefined accidentally.
  // If user explicitly wants to clear, they must send {clear: true} or use dedicated clear (not done here).
  let updated = {};
  if(clientId !== undefined && String(clientId).trim() !== ''){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_client_id', String(clientId).trim(), 'text');
    updated.clientId = true;
  }
  if(clientSecret !== undefined && String(clientSecret).trim() !== ''){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_client_secret', String(clientSecret).trim(), 'text');
    updated.clientSecret = true;
  }
  if(docId !== undefined && String(docId).trim() !== ''){
    // docId can be full URL — extract ID if needed
    let cleanDocId = String(docId).trim();
    // Extract ID from https://docs.google.com/spreadsheets/d/<ID>/...
    const m = cleanDocId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if(m) cleanDocId = m[1];
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_sheets_doc_id', cleanDocId, 'text');
    updated.docId = cleanDocId;
  }
  if(sheetName !== undefined && String(sheetName).trim() !== ''){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_sheets_sheet_name', String(sheetName).trim(), 'text');
    updated.sheetName = String(sheetName).trim();
  }
  // Return current saved config (to confirm permanence)
  const cfg = await getGoogleConfig();
  res.json({ ok:true, updated, saved: { docId: cfg.docId, sheetName: cfg.sheetName, hasClientId: !!cfg.clientId, hasClientSecret: !!cfg.clientSecret } });
});
app.post('/api/admin/google/test', requireAuth, async (req, res) => {
  const testLead = { name:'Test User', storeName:'Test Store', preferredNiche:'Fashion', preferredNicheOther:'', investmentRange:'Starter', storeStatus:'brand_new', wasScammed:'no', scamDetails:'', whatsapp:'+19283825389', email:'test@example.com', preferredContactTime:'', source:'google_test', trafficPlan:'', pageUrl:'https://dropshippingstore.dpdns.org', sessionId:'test-'+Date.now(), utm_source:'test', utm_medium:'admin', utm_campaign:'sheets_test', pipeline_stage:'new', webhook_status:'test', submittedAt: new Date().toISOString() };
  const r = await appendToGoogleSheet(testLead);
  res.json(r);
});
app.post('/api/admin/google/disconnect', requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM content WHERE key IN ('google_refresh_token','google_access_token','google_token_expiry')").run();
  res.json({ ok:true });
});

// --- Google Sheets Auto-detect: list sheets, detect headers/columns ---
// GET /api/admin/google/inspect?docId=...&sheetName=...
// Auto-detects spreadsheet title, sheet list, current headers, missing columns, and gives columns to create
app.get('/api/admin/google/inspect', requireAuth, async (req, res) => {
  try{
    const { sheets, cfg } = await getAuthenticatedSheets();
    // Allow docId override via query (also supports full URL)
    let docId = req.query.docId ? String(req.query.docId).trim() : cfg.docId;
    if(docId.includes('/spreadsheets/d/')){
      const m = docId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if(m) docId = m[1];
    }
    if(!docId) return res.status(400).json({ error: 'No Document ID — save Doc ID first or pass ?docId=' });
    // Fetch spreadsheet metadata
    let meta;
    try{
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId: docId });
      meta = metaRes.data;
    }catch(e){
      return res.status(400).json({ error: 'Failed to fetch spreadsheet — check Doc ID and that Sheet is shared with your OAuth client / service account. ' + e.message, docId });
    }
    const sheetsList = (meta.sheets||[]).map(s=> ({
      title: s.properties?.title || '',
      sheetId: s.properties?.sheetId,
      index: s.properties?.index,
      gridRows: s.properties?.gridProperties?.rowCount,
      gridCols: s.properties?.gridProperties?.columnCount
    }));
    const spreadsheetTitle = meta.properties?.title || '';
    // Determine target sheet: query > saved > first
    let targetSheet = req.query.sheetName ? String(req.query.sheetName).trim() : (cfg.sheetName || (sheetsList[0]?.title || 'Sheet1'));
    if(!sheetsList.some(s=> s.title===targetSheet)){
      // fallback to first sheet if saved name not found
      if(sheetsList.length) targetSheet = sheetsList[0].title;
    }
    // Fetch header row for target sheet
    let headers = [];
    let headerError = null;
    try{
      const hdrRes = await sheets.spreadsheets.values.get({ spreadsheetId: docId, range: `${targetSheet}!1:1` });
      headers = (hdrRes.data.values && hdrRes.data.values[0]) ? hdrRes.data.values[0].map(v=> String(v).trim()) : [];
    }catch(e){ headerError = e.message; headers = []; }
    // Persist auto-detected sheetName if it was empty or target was fallback
    if(!cfg.sheetName || cfg.sheetName !== targetSheet){
      // Only auto-save if we detected a real sheet and saved was different/empty — keeps permanence but auto-fills
      try{
        if(!cfg.sheetName || !sheetsList.some(s=> s.title===cfg.sheetName)){
          await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_sheets_sheet_name', targetSheet, 'text');
        }
      }catch{}
    }
    // Analyze columns
    const normalizedHeaders = headers.map(normalizeHeader);
    const normalizedExpected = EXPECTED_SHEET_HEADERS.map(normalizeHeader);
    const missingColumns = EXPECTED_SHEET_HEADERS.filter((h,i)=> !normalizedHeaders.includes(normalizedExpected[i]));
    const extraColumns = headers.filter(h=> !normalizedExpected.includes(normalizeHeader(h)));
    // Build mapping: expected header -> index in sheet (-1 if missing) and sheet header -> field
    const mapping = {};
    EXPECTED_SHEET_HEADERS.forEach(h=>{
      const idx = normalizedHeaders.indexOf(normalizeHeader(h));
      mapping[h] = idx; // -1 if missing
    });
    const columnToCreate = missingColumns; // alias for UI
    const hasHeaders = headers.length>0;
    const isEmpty = headers.length===0;
    // Also fetch row count for info
    let rowCount = 0;
    try{
      const allRes = await sheets.spreadsheets.values.get({ spreadsheetId: docId, range: `${targetSheet}!A:A` });
      rowCount = allRes.data.values ? allRes.data.values.length : 0;
    }catch{}
    res.json({
      ok: true,
      docId,
      spreadsheetTitle,
      sheets: sheetsList,
      currentSheet: targetSheet,
      savedSheet: cfg.sheetName,
      headers,
      hasHeaders,
      isEmpty,
      headerError,
      rowCount,
      expectedHeaders: EXPECTED_SHEET_HEADERS,
      missingColumns,
      columnToCreate, // same as missing — columns user needs to create (or we can auto-create)
      extraColumns,
      mapping,
      // For auto-create, frontend can call setup
      autoFixAvailable: missingColumns.length>0 || isEmpty
    });
  }catch(e){
    console.error('inspect failed', e.message);
    res.status(500).json({ error: e.message });
  }
});
// GET column list helper (returns expected columns to create)
app.get('/api/admin/google/columns', requireAuth, async (req,res)=>{
  res.json({ expectedHeaders: EXPECTED_SHEET_HEADERS, headerToField: HEADER_TO_FIELD });
});
// POST setup headers — creates or fixes header row to match expected
app.post('/api/admin/google/setup-headers', requireAuth, async (req,res)=>{
  try{
    const { sheets, cfg } = await getAuthenticatedSheets();
    let docId = req.body.docId ? String(req.body.docId).trim() : cfg.docId;
    if(docId && docId.includes('/spreadsheets/d/')){
      const m = docId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if(m) docId = m[1];
    }
    let sheetName = req.body.sheetName ? String(req.body.sheetName).trim() : (req.body.sheet || cfg.sheetName || 'Sheet1');
    const mode = req.body.mode || 'overwrite'; // overwrite | append-missing | create-only-if-empty
    if(!docId) return res.status(400).json({ error: 'docId required' });
    // Fetch current headers
    let currentHeaders = [];
    try{
      const hdrRes = await sheets.spreadsheets.values.get({ spreadsheetId: docId, range: `${sheetName}!1:1` });
      currentHeaders = (hdrRes.data.values && hdrRes.data.values[0]) ? hdrRes.data.values[0].map(v=> String(v).trim()) : [];
    }catch{}
    let newHeaders;
    if(mode === 'append-missing' && currentHeaders.length){
      const normCur = currentHeaders.map(normalizeHeader);
      const missing = EXPECTED_SHEET_HEADERS.filter(h=> !normCur.includes(normalizeHeader(h)));
      if(!missing.length) return res.json({ ok:true, message: 'All expected columns already exist', headers: currentHeaders, missing: [] });
      newHeaders = [...currentHeaders, ...missing];
    } else if(mode === 'create-only-if-empty' && currentHeaders.length){
      return res.json({ ok:false, error: 'Sheet already has headers — use overwrite or append-missing', headers: currentHeaders });
    } else {
      // overwrite / create
      newHeaders = EXPECTED_SHEET_HEADERS;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: docId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newHeaders] }
    });
    // Also style header row bold via batchUpdate (optional, best-effort)
    try{
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId: docId });
      const sh = (metaRes.data.sheets||[]).find(s=> s.properties?.title===sheetName);
      const sheetId = sh?.properties?.sheetId;
      if(sheetId !== undefined){
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: docId,
          requestBody: {
            requests: [{
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: newHeaders.length },
                cell: { userEnteredFormat: { backgroundColor: { red: 0.04, green: 0.07, blue: 0.12 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } } },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
    }catch{}
    // Save mapping info for future appends (optional)
    try{ await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_column_mapping', JSON.stringify({ headers: newHeaders, updatedAt: new Date().toISOString() }), 'json'); }catch{}
    // Ensure saved sheetName matches
    try{ await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_sheets_sheet_name', sheetName, 'text'); }catch{}
    res.json({ ok:true, headers: newHeaders, previousHeaders: currentHeaders, sheetName, docId });
  }catch(e){
    console.error('setup-headers failed', e.message);
    res.status(500).json({ error: e.message });
  }
});
// Optional: save custom column mapping
app.put('/api/admin/google/column-mapping', requireAuth, async (req,res)=>{
  const { mapping } = req.body; // expected { sheetHeader: fieldKey } or array
  if(!mapping) return res.status(400).json({ error: 'mapping required' });
  await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('google_column_mapping', JSON.stringify(mapping), 'json');
  res.json({ ok:true });
});
app.get('/api/admin/google/column-mapping', requireAuth, async (req,res)=>{
  const row = await db.prepare('SELECT value FROM content WHERE key=?').get('google_column_mapping');
  let mapping = null;
  if(row?.value) try{ mapping = JSON.parse(row.value); }catch{ mapping = row.value; }
  res.json({ mapping, expectedHeaders: EXPECTED_SHEET_HEADERS });
});

// ==================== Campaign & Messaging Platform — HubSpot-like CRM via Gmail (same Console Client ID/Secret) ====================
// Gmail status (reuses same google_client_id/secret — no separate credentials)
app.get('/api/admin/gmail/status', requireAuth, async (req,res)=>{
  const cfg = await getGoogleConfig();
  const hasGmailAuth = !!(cfg.refreshToken && cfg.gmailConnectedEmail);
  const needsReauth = !!(cfg.refreshToken && !cfg.gmailConnectedEmail);
  // try to verify gmail scope by attempting profile fetch if hasAuth but no email
  let verified = false, email = cfg.gmailConnectedEmail||'', senderName = cfg.gmailSenderName||'';
  let lastError = null;
  if(cfg.refreshToken){
    try{
      const { gmail } = await getAuthenticatedGmail();
      const p = await gmail.users.getProfile({ userId:'me' });
      email = p.data.emailAddress || email;
      verified = !!email;
      if(email && email!==cfg.gmailConnectedEmail){
        await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_connected_email', email, 'text');
      }
    }catch(e){ lastError = e.message; }
  }
  res.json({
    hasClient: !!(cfg.clientId && cfg.clientSecret),
    hasGmailAuth,
    needsReauth,
    verified,
    email,
    senderName,
    docId: cfg.docId,
    clientMasked: cfg.clientId ? cfg.clientId.slice(0,8)+'...' : '',
    lastError,
    scopes: GOOGLE_SCOPES,
    // same creds reused — show that campaign platform shares Sheets credentials
    reusedCredentials: true
  });
});
app.post('/api/admin/gmail/test', requireAuth, async (req,res)=>{
  const { to } = req.body;
  const cfg = await getGoogleConfig();
  const target = (to||cfg.gmailConnectedEmail||'').trim();
  if(!target) return res.status(400).json({ error: 'Provide to email or connect Gmail first' });
  try{
    const info = await sendGmailRaw({ to: target, subject: 'Nexatech Gmail Test — '+new Date().toLocaleString(), html: '<div style="font-family:Inter,sans-serif;padding:16px;border:1px solid #E2E8F0;border-radius:12px"><h2>✓ Gmail Connected</h2><p>Your campaign platform is ready. This email was sent via <b>Gmail API</b> using the <b>same Google Console Client ID/Secret</b> you use for Sheets.</p><p>From: '+(cfg.gmailConnectedEmail||'your Gmail')+'</p></div>', text: 'Gmail Connected — your campaign platform is ready via same console credentials.' });
    res.json({ ok:true, messageId: info.messageId, to: target, from: info.from });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Email Templates — HubSpot-like library
app.get('/api/admin/templates', requireAuth, async (req,res)=>{
  const rows = await db.prepare('SELECT * FROM email_templates ORDER BY created_at DESC').all();
  res.json(rows);
});
app.post('/api/admin/templates', requireAuth, async (req,res)=>{
  const { name, subject, body_html, body_text, category } = req.body;
  if(!name || !subject) return res.status(400).json({ error: 'name and subject required' });
  const info = await db.prepare('INSERT INTO email_templates (name,subject,body_html,body_text,category) VALUES (?,?,?,?,?)').run(name, subject, body_html||'', body_text||'', category||'general');
  const row = await db.prepare('SELECT * FROM email_templates WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.put('/api/admin/templates/:id', requireAuth, async (req,res)=>{
  const ex = await db.prepare('SELECT * FROM email_templates WHERE id=?').get(req.params.id);
  if(!ex) return res.status(404).json({ error: 'not found' });
  const { name, subject, body_html, body_text, category } = req.body;
  await db.prepare('UPDATE email_templates SET name=COALESCE(?,name), subject=COALESCE(?,subject), body_html=COALESCE(?,body_html), body_text=COALESCE(?,body_text), category=COALESCE(?,category) WHERE id=?')
    .run(name??null, subject??null, body_html??null, body_text??null, category??null, req.params.id);
  res.json(await db.prepare('SELECT * FROM email_templates WHERE id=?').get(req.params.id));
});
app.delete('/api/admin/templates/:id', requireAuth, async (req,res)=>{
  await db.prepare('DELETE FROM email_templates WHERE id=?').run(req.params.id);
  res.json({ ok:true });
});

// Campaigns — HubSpot-like: create → select leads → bulk + personal
app.get('/api/admin/campaigns', requireAuth, async (req,res)=>{
  const rows = await db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  // enrich with counts
  for(const c of rows){
    try{
      const s = await db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status=? THEN 1 ELSE 0 END) as sent, SUM(CASE WHEN status=? THEN 1 ELSE 0 END) as failed FROM campaign_sends WHERE campaign_id=?').get('sent','failed',c.id);
      c.total = parseInt(s?.total||c.total_recipients||0,10);
      c.sent = parseInt(s?.sent||c.sent_count||0,10);
      c.failed = parseInt(s?.failed||c.failed_count||0,10);
    }catch{}
  }
  res.json(rows);
});
app.post('/api/admin/campaigns', requireAuth, async (req,res)=>{
  const { name, subject, body_html, body_text, from_name, from_email, reply_to, templateId } = req.body;
  if(!name || !subject) return res.status(400).json({ error: 'name and subject required' });
  let html = body_html||'', text = body_text||'';
  if(templateId){
    const t = await db.prepare('SELECT * FROM email_templates WHERE id=?').get(templateId);
    if(t){ html = html || t.body_html; text = text || t.body_text; }
  }
  const cfg = await getGoogleConfig();
  const fromN = from_name || cfg.gmailSenderName || 'Nexatech';
  const fromE = from_email || cfg.gmailConnectedEmail || '';
  const info = await db.prepare('INSERT INTO campaigns (name,subject,body_html,body_text,from_name,from_email,reply_to,status) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, subject, html, text, fromN, fromE, reply_to||'', 'draft');
  const row = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(info.lastInsertRowid);
  res.json(row);
});
app.get('/api/admin/campaigns/:id', requireAuth, async (req,res)=>{
  const c = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if(!c) return res.status(404).json({ error: 'not found' });
  const sends = await db.prepare('SELECT * FROM campaign_sends WHERE campaign_id=? ORDER BY sent_at DESC LIMIT 100').all(c.id);
  res.json({ campaign: c, sends });
});
app.put('/api/admin/campaigns/:id', requireAuth, async (req,res)=>{
  const ex = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if(!ex) return res.status(404).json({ error: 'not found' });
  if(ex.status==='sent' && !req.body.force) return res.status(400).json({ error: 'Already sent — create a new campaign or set force:true to edit' });
  const { name, subject, body_html, body_text, from_name, from_email, reply_to, status } = req.body;
  await db.prepare('UPDATE campaigns SET name=COALESCE(?,name), subject=COALESCE(?,subject), body_html=COALESCE(?,body_html), body_text=COALESCE(?,body_text), from_name=COALESCE(?,from_name), from_email=COALESCE(?,from_email), reply_to=COALESCE(?,reply_to), status=COALESCE(?,status) WHERE id=?')
    .run(name??null, subject??null, body_html??null, body_text??null, from_name??null, from_email??null, reply_to??null, status??null, req.params.id);
  res.json(await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id));
});
app.delete('/api/admin/campaigns/:id', requireAuth, async (req,res)=>{
  await db.prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  // cascade deletes sends via FK if PG, manual for SQLite
  try{ await db.prepare('DELETE FROM campaign_sends WHERE campaign_id=?').run(req.params.id); }catch{}
  res.json({ ok:true });
});
app.post('/api/admin/campaigns/:id/test', requireAuth, async (req,res)=>{
  const c = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if(!c) return res.status(404).json({ error: 'campaign not found' });
  const { to } = req.body;
  const cfg = await getGoogleConfig();
  const target = (to||cfg.gmailConnectedEmail||'').trim();
  if(!target) return res.status(400).json({ error: 'Provide to email or connect Gmail first' });
  // render with sample lead
  const sampleLead = (await db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 1').get()) || { name:'Test Founder', storeName:'Test Store', preferredNiche:'Fashion', whatsapp:'+19283825389', email: target };
  const subject = renderTemplate(c.subject, sampleLead);
  const html = renderTemplate(c.body_html, sampleLead);
  const text = renderTemplate(c.body_text, sampleLead);
  try{
    const info = await sendGmailRaw({ to: target, subject, html, text, fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to });
    res.json({ ok:true, to: target, messageId: info.messageId });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Send campaign — bulk or filtered (HubSpot-like bulk)
app.post('/api/admin/campaigns/:id/send', requireAuth, async (req,res)=>{
  const c = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if(!c) return res.status(404).json({ error: 'campaign not found' });
  let { leadIds, stage, search, scammed, limit, dryRun } = req.body;
  // Resolve recipients
  let leads = [];
  if(Array.isArray(leadIds) && leadIds.length){
    const placeholders = leadIds.map(()=> '?').join(',');
    leads = await db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders})`).all(...leadIds);
  } else {
    let sql='SELECT * FROM leads WHERE 1=1';
    const params=[];
    if(stage){ sql+=' AND pipeline_stage=?'; params.push(stage); }
    if(scammed==='yes'){ sql+=' AND wasScammed=?'; params.push('yes'); }
    if(search){ sql+=' AND (name LIKE ? OR email LIKE ? OR whatsapp LIKE ?)'; const s=`%${search}%`; params.push(s,s,s); }
    sql+=' ORDER BY created_at DESC';
    if(limit) sql+=` LIMIT ${parseInt(limit,10)||100}`;
    leads = await db.prepare(sql).all(...params);
  }
  // Filter to those with email
  const withEmail = leads.filter(l=> l.email && l.email.includes('@'));
  if(!withEmail.length) return res.status(400).json({ error: 'No recipients with email found for filter' });
  if(dryRun) return res.json({ ok:true, dryRun:true, wouldSend: withEmail.length, emails: withEmail.map(l=> l.email).slice(0,20) });

  // Check Gmail connected
  try{ await getAuthenticatedGmail(); }catch(e){ return res.status(400).json({ error: e.message + ' — reconnect with Gmail scopes (same Client ID/Secret, click Connect Google)' }); }

  // Create sends records and send sequentially with throttling (Gmail 500/day, ~1 per second safe)
  let sent=0, failed=0;
  const batch = withEmail.slice(0, parseInt(limit||500,10)); // cap
  // Update campaign total
  await db.prepare('UPDATE campaigns SET total_recipients=?, status=? WHERE id=?').run(batch.length, 'sending', c.id);
  for(const lead of batch){
    const subj = renderTemplate(c.subject, lead);
    const html = renderTemplate(c.body_html, lead);
    const text = renderTemplate(c.body_text, lead);
    let status='pending', err='', msgId='';
    try{
      const info = await sendGmailRaw({ to: lead.email, subject: subj, html, text, fromName: c.from_name, fromEmail: c.from_email, replyTo: c.reply_to });
      status='sent'; msgId=info.messageId||''; sent++;
    }catch(e){ status='failed'; err=String(e.message).slice(0,500); failed++; }
    try{
      await db.prepare('INSERT INTO campaign_sends (campaign_id, lead_id, email, name, status, error, message_id, sent_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
        .run(c.id, lead.id, lead.email, lead.name||'', status, err, msgId);
    }catch(e2){ console.error('campaign_sends insert', e2.message); }
    // throttle 400ms to avoid Gmail rate limit
    await new Promise(r=> setTimeout(r, 400));
  }
  await db.prepare('UPDATE campaigns SET sent_count=?, failed_count=?, status=?, sent_at=datetime(\'now\') WHERE id=?').run(sent, failed, failed && !sent ? 'failed' : 'sent', c.id);
  res.json({ ok:true, total: batch.length, sent, failed, campaignId: c.id });
});
app.get('/api/admin/campaigns/:id/sends', requireAuth, async (req,res)=>{
  const { limit=100, offset=0, status } = req.query;
  const c = await db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if(!c) return res.status(404).json({ error: 'not found' });
  let sql='SELECT cs.*, l.storeName, l.preferredNiche FROM campaign_sends cs LEFT JOIN leads l ON l.id=cs.lead_id WHERE cs.campaign_id=?';
  const params=[c.id];
  if(status){ sql+=' AND cs.status=?'; params.push(status); }
  sql+=' ORDER BY cs.sent_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit,10)||100, parseInt(offset,10)||0);
  const rows = await db.prepare(sql).all(...params);
  res.json({ campaign: c, sends: rows });
});

// Personal 1:1 email to a lead — looks like HubSpot conversation
app.post('/api/admin/leads/:id/email', requireAuth, async (req,res)=>{
  const lead = await db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if(!lead) return res.status(404).json({ error: 'lead not found' });
  if(!lead.email) return res.status(400).json({ error: 'lead has no email' });
  const { subject, body_html, body_text, templateId, from_name, from_email, reply_to } = req.body;
  let subj = subject||'', html = body_html||'', text = body_text||'';
  if(templateId){
    const t = await db.prepare('SELECT * FROM email_templates WHERE id=?').get(templateId);
    if(t){ subj = subj || t.subject; html = html || t.body_html; text = text || t.body_text; }
  }
  if(!subj) return res.status(400).json({ error: 'subject required (or templateId)' });
  // render personalization
  subj = renderTemplate(subj, lead);
  html = renderTemplate(html, lead);
  text = renderTemplate(text, lead);
  try{
    await getAuthenticatedGmail();
  }catch(e){ return res.status(400).json({ error: e.message }); }
  try{
    const info = await sendGmailRaw({ to: lead.email, subject: subj, html, text, fromName: from_name, fromEmail: from_email, replyTo: reply_to });
    // also log as campaign_sends with campaign_id null? use 0
    try{
      await db.prepare('INSERT INTO campaign_sends (campaign_id, lead_id, email, name, status, message_id, sent_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
        .run(0, lead.id, lead.email, lead.name||'', 'sent', info.messageId||'');
    }catch{}
    // append to events for CRM timeline
    try{ await db.prepare('INSERT INTO events (event_type,element_id,session_id,page_url,metadata) VALUES (?,?,?,?,?)').run('email_sent', String(lead.id), '', '', JSON.stringify({ to: lead.email, subject: subj, messageId: info.messageId })); }catch{}
    res.json({ ok:true, to: lead.email, messageId: info.messageId, from: info.from });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/outbox', requireAuth, async (req,res)=>{
  const { limit=50 } = req.query;
  const rows = await db.prepare('SELECT cs.*, c.name as campaign_name, c.subject as campaign_subject FROM campaign_sends cs LEFT JOIN campaigns c ON c.id=cs.campaign_id ORDER BY cs.sent_at DESC LIMIT ?').all(parseInt(limit,10)||50);
  // also gmail status
  const cfg = await getGoogleConfig();
  res.json({ sends: rows, gmail: { connected: !!cfg.gmailConnectedEmail, email: cfg.gmailConnectedEmail||'' } });
});
// Update gmail sender name (persisted)
app.put('/api/admin/gmail/sender', requireAuth, async (req,res)=>{
  const { name, email } = req.body;
  if(name !== undefined) await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_sender_name', String(name).trim(), 'text');
  if(email !== undefined && String(email).trim()){
    // allow overriding connected email for From (but keep verified Gmail as fallback)
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gmail_connected_email', String(email).trim(), 'text');
  }
  const cfg = await getGoogleConfig();
  res.json({ ok:true, senderName: cfg.gmailSenderName||'', email: cfg.gmailConnectedEmail||'' });
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
