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
import crypto from 'crypto';
import { initDb, getDb, reseedDefaults, usePg } from './db.js';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nexatech-jwt-secret-change-in-prod-2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const NEXATECH_BASE_PROMPT = `You are Nexatech Dropshipping Expert's AI assistant, running on his portfolio site to represent him as a Shopify dropshipping expert (NexaTech). Owner's real name is Akinyemmi Ifeoluwa. You are NOT a generic chatbot — you speak with the confidence and specific knowledge of someone who builds and scales Shopify dropshipping stores for a living.

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
The moment a visitor signals they're ready to get started, want to hire NexaTech, want the mentorship, or ask something like "how do I start"/"how much"/"how do we begin" — do NOT try to close the deal yourself. Do NOT send a raw https://wa.me link yourself. Instead, end your reply naturally with one short line like: "Let's continue this on WhatsApp with Ifeoluwa directly — tap the button below." The website frontend will automatically render a WhatsApp button that includes the user's last message as the prefilled text (e.g. if user asked "how do i get started", the button will open WhatsApp with "Hi Nexatech 👋, how do i get started").
Never include a raw wa.me URL in your reply. Never hardcode the Mentorship plan text into the link — the button text is dynamic from what the client asked.

For reference (mention only if it's relevant to the conversation), the $200 Mentorship Plan includes: results/sales before paying, 1-on-1 store review, winning product research, ad strategy & scaling, supplier & order automation, and lifetime support — but do NOT auto-send it unless the user explicitly asks for Mentorship.

Do not repeat a link mid-explanation — only signal handoff once, with the short line above. The button UI handles the link.

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
    parts.push(`IDENTITY: Brand=NEXATECH / Nexatech Dropshipping Store, Owner=Akinyemmi Ifeoluwa, Tagline=${m.tagline||''}`);
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

// Seed the editable chatbot brain on first boot only: if the admin has never saved
// chatbot_system_prompt, store the built-in prompt so it is visible/editable in
// Admin -> Content & Theme -> Chatbot. Never overwrites an admin edit.
try {
  const ex = await db.prepare('SELECT value FROM content WHERE key=?').get('chatbot_system_prompt');
  if(!ex || !String(ex.value || '').trim()){
    await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')").run('chatbot_system_prompt', NEXATECH_BASE_PROMPT, 'text');
    console.log('Seeded editable chatbot_system_prompt');
  }
} catch(e){ console.error('chatbot prompt seed error', e.message); }

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
// Asset versioning: every deploy gets a new ?v= hash on JS/CSS + HTML pages, so
// browsers and CDNs can never serve stale code after you publish backend edits.
const ASSET_VER = (()=>{ try{
  const h = crypto.createHash('md5');
  for(const f of ['public/js/app.js','public/js/admin.js','public/css/style.css','public/css/admin.css','public/index.html','public/admin.html']){
    try{ const st = fs.statSync(path.join(__dirname, f)); h.update(f + ':' + st.mtimeMs + ':' + st.size); }catch{}
  }
  return h.digest('hex').slice(0,8);
}catch{ return 'dev'; } })();
function versionedHtml(file){
  let html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  html = html.split('/js/app.js').join('/js/app.js?v='+ASSET_VER)
             .split('/js/admin.js').join('/js/admin.js?v='+ASSET_VER)
             .split('/css/style.css').join('/css/style.css?v='+ASSET_VER)
             .split('/css/admin.css').join('/css/admin.css?v='+ASSET_VER);
  return html;
}
app.use((req, res, next)=>{ if(req.query && req.query.v) res.set('Cache-Control','public, max-age=31536000, immutable'); next(); });
app.get(['/', '/index.html'], (req, res)=> res.type('html').send(versionedHtml('index.html')));
app.get('/admin', (req, res)=> res.type('html').send(versionedHtml('admin.html')));
app.get(['/privacy.html', '/terms.html'], (req, res)=> res.type('html').send(versionedHtml(String(req.path).slice(1))));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
// DB media store (Postgres): files uploaded while DATABASE_URL is set live in media_blobs,
// so images survive redeploys with no disk. Checked before disk files.
app.get('/uploads/:name', async (req, res, next) => {
  try{
    if(!usePg) return next();
    const fname = path.basename(String(req.params.name||''));
    if(!fname) return next();
    const row = await db.prepare('SELECT mime, data FROM media_blobs WHERE filename=?').get(fname);
    if(!row || !row.data) return next();
    let mime = row.mime || '';
    if(/\.ico$/i.test(fname) && !/^image\//.test(mime)) mime = 'image/x-icon';
    if(mime) res.contentType(mime);
    res.setHeader('Cache-Control','public, max-age=86400');
    return res.send(Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data));
  }catch(e){ return next(); }
});

// Persist an uploaded file: Postgres -> media_blobs (returns same /uploads/ URL shape),
// otherwise keep the disk file. Always returns the public URL.
async function persistUpload(file){
  const url = `/uploads/${file.filename}`;
  if(!usePg) return url;
  try{
    const buf = fs.readFileSync(file.path);
    await db.prepare("INSERT INTO media_blobs (filename,mime,data) VALUES (?,?,?) ON CONFLICT(filename) DO UPDATE SET mime=excluded.mime, data=excluded.data").run(file.filename, file.mimetype||'', buf);
    try{ fs.unlinkSync(file.path); }catch{}
  }catch(e){ console.error('media_blobs persist failed, keeping disk file:', e.message); }
  return url;
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}
// FormData sends booleans as '1'/'0' strings ('0' is truthy!) — parse explicitly
function parseBool(v){
  if(v === true || v === 1) return 1;
  if(v === false || v === 0) return 0;
  const s = String(v ?? '').trim().toLowerCase();
  return (s === '1' || s === 'true' || s === 'yes' || s === 'on') ? 1 : 0;
}
// Email subjects must stay plain ASCII. Some inboxes render raw UTF-8 in the Subject
// header as garbled text, so we normalize subjects and RFC2047-encode the header.
function cleanSubject(str, fallback) {
  if (fallback === undefined) fallback = 'A message from Nexatech';
  let s = String(str == null ? '' : str);
  const pairs = [['\u2014','-'],['\u2013','-'],['\u2015','-'],['\u2212','-'],['\u2019',"'"],['\u2018',"'"],['\u201A',"'"],['\u201C','"'],['\u201D','"'],['\u201E','"'],['\u2026','...'],['\u2022','-'],['\u00B7','-'],['\u2192','->'],['\u2190','<-'],['\u21D2','=>']];
  for (const pair of pairs) s = s.split(pair[0]).join(pair[1]);
  s = s.replace(/[^\x20-\x7E]/g, '');
  s = s.replace(/\s+/g, ' ').trim().slice(0, 78);
  return s || fallback;
}
function encodeSubjectHeader(subject) {
  const s = String(subject == null ? '' : subject);
  if (!/[^\x00-\x7F]/.test(s)) return s;
  return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
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
    // Accept images/video by mimetype, plus .ico/.svg by extension (some browsers
    // send favicons as application/octet-stream, which the regex above rejects)
    if (/^(image|video)\//.test(file.mimetype || '')) cb(null, true);
    else if (/\.(ico|svg|png|jpe?g|webp|gif)$/i.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Only image/video allowed'));
  }
});

// --- API: Health ---
app.get('/api/health', async (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- API: Content ---
app.get('/api/content', async (req, res) => {
  const rows = await db.prepare('SELECT key,value,type FROM content').all();
  const obj = {};
  // Never expose credentials/tokens publicly (admin reads them via authed endpoints)
  const SENSITIVE = new Set(['gemini_api_key', 'gemini_api_key_2', 'gemini_api_key_3', 'ai_api_key', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']);
  rows.forEach(r => {
    if (SENSITIVE.has(r.key)) return; // hide secrets from public
    if (r.key.startsWith('google_') || r.key.startsWith('gmail_')) return; // OAuth tokens + connected Gmail
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
  await autoBackupContent('single:'+key);
  const exists = await db.prepare('SELECT key FROM content WHERE key=?').get(key);
  if (!exists) await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now'))").run(key, value, type);
  else await db.prepare("UPDATE content SET value=?, type=?, updated_at=datetime('now') WHERE key=?").run(value, type, key);
  res.json({ ok: true, key, value });
});

// Auto-backup previous content before every save (so Revert actually works). Keeps last 20.
async function autoBackupContent(label){
  try{
    const rows = await db.prepare('SELECT key,value,type FROM content').all();
    const snap = JSON.stringify(rows);
    const lbl = String(label||'auto').slice(0,120);
    await db.prepare('INSERT INTO content_revisions (snapshot, label) VALUES (?,?)').run(snap, lbl);
    // prune: keep last 20
    const cnt = await db.prepare('SELECT COUNT(*) as c FROM content_revisions').get();
    const n = parseInt(cnt?.c||0,10)||0;
    if(n > 20){
      const extra = n - 20;
      // delete oldest (PG + SQLite compatible: ORDER BY id ASC LIMIT extra — PG needs ctid workaround, so fetch ids)
      const olds = await db.prepare('SELECT id FROM content_revisions ORDER BY id ASC LIMIT ?').all(extra);
      for(const o of olds){ try{ await db.prepare('DELETE FROM content_revisions WHERE id=?').run(o.id); }catch{} }
    }
  }catch(e){ console.error('autoBackup failed', e.message); }
}

// Batch update
app.put('/api/content', requireAuth, async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'object required' });
  await autoBackupContent('save:'+Object.keys(updates).slice(0,5).join(','));
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

// --- API: Content revisions (auto-backup previous save) ---
app.get('/api/admin/content-revisions', requireAuth, async (req, res) => {
  try{
    const rows = await db.prepare('SELECT id, label, created_at, LENGTH(snapshot) as size FROM content_revisions ORDER BY id DESC LIMIT 20').all();
    res.json({ revisions: rows, count: rows.length });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/content-revisions/:id/restore', requireAuth, async (req, res) => {
  try{
    const rev = await db.prepare('SELECT * FROM content_revisions WHERE id=?').get(req.params.id);
    if(!rev) return res.status(404).json({ error: 'revision not found' });
    // backup current before restoring (so restore itself is reversible)
    await autoBackupContent('pre-restore');
    const rows = JSON.parse(rev.snapshot);
    const stmt = await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')");
    for(const r of rows){ await stmt.run(r.key, r.value, r.type||'text'); }
    res.json({ ok: true, restored: req.params.id, keys: rows.length });
  }catch(e){ res.status(500).json({ error: e.message }); }
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
  if (req.file) finalUrl = await persistUpload(req.file);
  if (!finalUrl) return res.status(400).json({ error: 'url or file required' });
  if (!type) return res.status(400).json({ error: 'type required (portfolio|sales_proof|testimonials)' });
  const _orderRow = await db.prepare('SELECT COALESCE(MAX(display_order),0)+1 as n FROM media WHERE type=?').get(type);
  const order = _orderRow ? _orderRow.n : 1;
  const info = await db.prepare('INSERT INTO media (type,category,url,caption,alt_text,tags,result_stat,case_study_text,display_order,published) VALUES (?,?,?,?,?,?,?,?,?,1)').run(type, category||'', finalUrl, caption||'', alt_text||'', tags||'', result_stat||'', case_study_text||'', order);
  const row = await db.prepare('SELECT * FROM media WHERE id=?').get(info.lastInsertRowid);
  // Hero uploads go live instantly
  if(type==='hero' && finalUrl){
    try{ await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')").run('hero_image_url', finalUrl, 'text'); }catch{}
  }
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
  if (req.file) url = await persistUpload(req.file);
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
    published: req.body.published !== undefined ? parseBool(req.body.published) : existing.published
  };
  await db.prepare('UPDATE media SET type=?,category=?,url=?,caption=?,alt_text=?,tags=?,result_stat=?,case_study_text=?,display_order=?,published=? WHERE id=?')
    .run(fields.type, fields.category, fields.url, fields.caption, fields.alt_text, fields.tags, fields.result_stat, fields.case_study_text, fields.display_order, fields.published, id);
  const row = await db.prepare('SELECT * FROM media WHERE id=?').get(id);
  res.json(row);
});

app.delete('/api/media/:id', requireAuth, async (req, res) => {
  try{
    const ex = await db.prepare('SELECT url FROM media WHERE id=?').get(req.params.id);
    if(ex?.url?.startsWith('/uploads/')){ try{ await db.prepare('DELETE FROM media_blobs WHERE filename=?').run(path.basename(ex.url)); }catch{} }
  }catch{}
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

// Set a Media Manager image as the live homepage hero image (one click, instant)
app.post('/api/admin/media/:id/set-hero', requireAuth, async (req, res) => {
  const item = await db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if(!item) return res.status(404).json({ error: 'media not found' });
  if(!item.url) return res.status(400).json({ error: 'media has no url' });
  await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')")
    .run('hero_image_url', item.url, 'text');
  res.json({ ok: true, hero_image_url: item.url });
});

// Generic admin file upload (logo, favicon, etc.)
app.post('/api/admin/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const url = await persistUpload(req.file);
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
  if (req.file) finalPhoto = await persistUpload(req.file);
  const _teamOrder = await db.prepare('SELECT COALESCE(MAX(display_order),0)+1 as n FROM team').get();
  const order = _teamOrder ? _teamOrder.n : 1;
  const info = await db.prepare('INSERT INTO team (name,role,credibility_note,photo_url,social_url,display_order,published) VALUES (?,?,?,?,?,?,1)').run(name, role||'', credibility_note||'', finalPhoto||'', social_url||'', order);
  res.json(await db.prepare('SELECT * FROM team WHERE id=?').get(info.lastInsertRowid));
});
app.patch('/api/team/:id', requireAuth, upload.single('photo'), async (req, res) => {
  const ex = await db.prepare('SELECT * FROM team WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'not found' });
  let photo_url = req.body.photo_url ?? ex.photo_url;
  if (req.file) photo_url = await persistUpload(req.file);
  const fields = {
    name: req.body.name ?? ex.name,
    role: req.body.role ?? ex.role,
    credibility_note: req.body.credibility_note ?? ex.credibility_note,
    photo_url,
    social_url: req.body.social_url ?? ex.social_url,
    display_order: req.body.display_order ?? ex.display_order,
    published: req.body.published !== undefined ? parseBool(req.body.published) : ex.published
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

  // Instant AI follow-up email (HTML + WhatsApp + opt-out, logged to CRM) — fire-and-forget so response stays instant
  try{
    const leadForMail = { id: leadId, name, storeName, preferredNiche, preferredNicheOther, investmentRange, storeStatus, wasScammed, scamDetails, whatsapp, email, preferredContactTime, source, trafficPlan };
    const baseUrl = getBaseUrl(req);
    setImmediate(async ()=>{
      try{ await ensureFollowupTables(); await sendFollowupEmail({ to: email, name, lead: leadForMail, leadId, sessionId: sessionId||'', kind:'form_instant', dayNumber: 1, transcript:'', baseUrl }); }
      catch(e){ console.error('instant form followup failed', e.message); }
    });
  }catch(e){ console.error('instant form followup schedule failed', e.message); }

  res.json({
    ok: true,
    leadId,
    webhook_status: webhookStatus,
    whatsappFallback,
    message: "Application received — we'll message you on email shortly. Please check your inbox (and spam folder)."
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

// Delete a lead + its linked CRM rows (campaign sends, follow-up logs) so it disappears everywhere
app.delete('/api/admin/leads/:id', requireAuth, async (req, res) => {
  const ex = await db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'not found' });
  try{ await db.prepare('DELETE FROM campaign_sends WHERE lead_id=?').run(req.params.id); }catch{}
  try{ await db.prepare('DELETE FROM followup_logs WHERE lead_id=?').run(req.params.id); }catch{}
  await db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  res.json({ ok:true, deleted: req.params.id });
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

// --- Helpers: Gemini — DB keys take precedence over env; extra keys rotate on quota errors
// Free tier is ~20 generate requests/day per key/project, shared by chatbot,
// follow-ups and tests — so up to 3 keys (different Google projects) fail over.
function geminiFingerprint(key){ const k=String(key||''); return k.slice(0,8)+'...'+k.slice(-4); }
const geminiCooldowns = new Map(); // fingerprint -> retry-after epoch ms
async function getGeminiKeys(){
  const keys = [];
  try{
    for(const k of ['gemini_api_key', 'gemini_api_key_2', 'gemini_api_key_3']){
      const row = await db.prepare('SELECT value FROM content WHERE key=?').get(k);
      const v = row?.value?.trim() || '';
      if(v && !keys.includes(v)) keys.push(v);
    }
  }catch{}
  if(GEMINI_API_KEY && GEMINI_API_KEY.trim() && !keys.includes(GEMINI_API_KEY.trim())) keys.push(GEMINI_API_KEY.trim());
  return keys;
}
async function getGeminiKey(){
  const ks = await getGeminiKeys();
  return ks[0] || '';
}
function geminiQuotaDelayMs(data){
  try{
    const det = data?.error?.details || [];
    for(const d of det){
      const t = d && d['@type'];
      if(t && t.indexOf('RetryInfo') !== -1 && d.retryDelay){
        const m = String(d.retryDelay).match(/([\d.]+)s/);
        if(m) return Math.ceil(parseFloat(m[1]) * 1000);
      }
    }
  }catch{}
  return 60000;
}
// One Gemini call with automatic failover to the next saved key on quota errors.
// Returns { text, keyUsed }. Throws Error with .quota=true when all keys are exhausted.
async function geminiGenerate({ model, systemText, contents, genConfig, timeoutMs=12000 }){
  const keys = await getGeminiKeys();
  if(!keys.length){
    const e = new Error('No Gemini API key saved');
    e.quota = false; e.tried = 0;
    throw e;
  }
  const now = Date.now();
  const usable = keys.filter(k => (geminiCooldowns.get(geminiFingerprint(k)) || 0) <= now);
  const pool = (usable.length ? usable : keys).slice();
  pool.sort((a,b)=> (geminiCooldowns.get(geminiFingerprint(a))||0) - (geminiCooldowns.get(geminiFingerprint(b))||0));
  let lastErr = null;
  for(const key of pool){
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), timeoutMs);
    try{
      const resp = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body: JSON.stringify({ ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}), contents, generationConfig: genConfig }),
        signal: controller.signal
      });
      const data = await resp.json().catch(()=> ({}));
      if(!resp.ok){
        const msg = data?.error?.message || data?.error?.status || ('Gemini error ' + resp.status + ' ' + resp.statusText);
        const isQuota = resp.status===429 || /quota|RESOURCE_EXHAUSTED|exceed/i.test(String(msg));
        if(isQuota) geminiCooldowns.set(geminiFingerprint(key), Date.now() + geminiQuotaDelayMs(data));
        const hint = key.startsWith('AQ.') ? ' (AQ. key — ensure it is a Google AI API key, not OAuth token; try AIza... key from aistudio.google.com)' : '';
        const err = new Error(msg + hint);
        err.quota = isQuota; err.status = resp.status;
        throw err;
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || (data?.candidates?.[0]?.content?.parts || []).map(p=>p.text).join('\n') || '';
      if(!text.trim()){
        const err = new Error('Empty reply from Gemini');
        err.quota = false;
        throw err;
      }
      geminiCooldowns.delete(geminiFingerprint(key));
      clearTimeout(t);
      return { text: text.trim(), keyUsed: geminiFingerprint(key) };
    }catch(e){
      clearTimeout(t);
      if(e && e.name === 'AbortError'){
        const err = new Error('Gemini timed out');
        err.quota = false;
        lastErr = err;
        break;
      }
      lastErr = e;
      if(!(e && e.quota)) break; // non-quota error: fail over makes no sense
    }
  }
  const out = new Error((lastErr && lastErr.message) || 'Gemini failed');
  out.quota = !!(lastErr && lastErr.quota);
  out.tried = pool.length;
  throw out;
}

// --- AI providers: Gemini plus any OpenAI-compatible API (Groq, OpenRouter,
// Together, Hugging Face, Mistral, Pollinations, custom). The chatbot, follow-up
// emails and subject suggestions all go through aiGenerate(), so switching
// provider changes everything at once. Nothing here is unlimited: every free
// API has daily/rate limits — Gemini ~20/day/key, others per their own docs.
const AI_PRESETS = {
  gemini:       { label: 'Gemini (Google)', baseUrl: '', model: '', needsKey: true },
  groq:         { label: 'Groq (generous free tier)', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', needsKey: true },
  openrouter:   { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'z-ai/glm-5.2:free', needsKey: true },
  together:     { label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: '', needsKey: true },
  huggingface:  { label: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', model: '', needsKey: true },
  mistral:      { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', needsKey: true },
  custom:       { label: 'Custom OpenAI-compatible', baseUrl: '', model: '', needsKey: true }
};
async function getAIConfig(){
  const g = async (k)=>{ try{ return (await db.prepare('SELECT value FROM content WHERE key=?').get(k))?.value?.trim() || ''; }catch{ return ''; } };
  let provider = (await g('ai_provider') || 'gemini').toLowerCase();
  if(!AI_PRESETS[provider]) provider = 'gemini';
  const preset = AI_PRESETS[provider];
  return { provider, preset, apiKey: await g('ai_api_key'), baseUrl: await g('ai_base_url') || preset.baseUrl, model: await g('ai_model') || preset.model };
}
async function aiReady(){
  const cfg = await getAIConfig().catch(()=> null);
  if(!cfg || cfg.provider === 'gemini'){
    const ks = await getGeminiKeys().catch(()=> []);
    if(!ks.length) return { ready:false, reason:'No Gemini API key saved' };
    return { ready:true };
  }
  if(cfg.preset.needsKey && !cfg.apiKey) return { ready:false, reason:'Set the API key for ' + cfg.preset.label };
  if(!cfg.model) return { ready:false, reason:'Set a model for ' + cfg.preset.label };
  if(!cfg.baseUrl) return { ready:false, reason:'Set the API base URL for the custom provider' };
  return { ready:true };
}
async function openAIChat({ baseUrl, apiKey, model, messages, temperature, maxTokens, timeoutMs=25000 }){
  const url = String(baseUrl || '').replace(/\/$/,'') + '/chat/completions';
  const headers = { 'Content-Type':'application/json' };
  if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify({ model, messages, temperature: temperature ?? 0.7, max_tokens: maxTokens || 600 }), signal: controller.signal });
    const data = await resp.json().catch(()=> ({}));
    if(!resp.ok){
      const msg = (data && data.error && (data.error.message || data.error.code)) || ('HTTP ' + resp.status);
      const err = new Error(String(msg).slice(0,300));
      err.status = resp.status;
      err.quota = resp.status===429 || /quota|rate.?limit|insufficient|credit/i.test(String(msg));
      throw err;
    }
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if(!String(text).trim()){
      const e = new Error('Empty reply from AI provider');
      e.quota = false;
      throw e;
    }
    return { text: String(text).trim() };
  }catch(e){
    if(e && e.name==='AbortError'){
      const x = new Error('AI provider timed out');
      x.quota = false;
      throw x;
    }
    throw e;
  }finally{ clearTimeout(t); }
}
// Single entry point for ALL AI text: picks the configured provider.
async function aiGenerate({ systemText='', contents=[], genConfig=null, timeoutMs=25000 }){
  const cfg = await getAIConfig();
  const gc = genConfig || await getChatbotGenConfig().catch(()=> ({ temperature:0.7, maxOutputTokens:600 }));
  if(cfg.provider === 'gemini'){
    let model = GEMINI_MODEL;
    try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(r?.value?.trim()) model = r.value.trim(); }catch{}
    const r = await geminiGenerate({ model, systemText, contents, genConfig: gc, timeoutMs });
    return { text: r.text, via: 'gemini:' + model };
  }
  if(cfg.preset.needsKey && !cfg.apiKey){
    const e = new Error('Set the API key for ' + cfg.preset.label + ' in Admin → Integrations → AI Provider');
    e.quota = false;
    throw e;
  }
  if(!cfg.model){
    const e = new Error('Set a model for ' + cfg.preset.label + ' in Admin → Integrations → AI Provider');
    e.quota = false;
    throw e;
  }
  if(!cfg.baseUrl){
    const e = new Error('Set the API base URL for the custom provider');
    e.quota = false;
    throw e;
  }
  const messages = [];
  if(systemText) messages.push({ role:'system', content: systemText });
  for(const c of (contents || [])){
    const txt = ((c.parts || []).map(p=>p.text || '').join('\n') || '').slice(0,4000);
    if(!txt.trim()) continue;
    messages.push({ role: c.role==='model' ? 'assistant' : 'user', content: txt });
  }
  const r = await openAIChat({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature: gc.temperature ?? 0.7, maxTokens: gc.maxOutputTokens || 600, timeoutMs });
  return { text: r.text, via: cfg.provider + ':' + cfg.model };
}
async function getGeminiKeySource(){
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_api_key');
    if(row?.value?.trim()) return 'db';
  }catch{}
  if (GEMINI_API_KEY && GEMINI_API_KEY.trim()) return 'env';
  return 'none';
}
// Chatbot brain — editable in Admin -> Content & Theme -> Chatbot. Falls back to built-in.
async function getChatbotPrompt(){
  try{
    const row = await db.prepare('SELECT value FROM content WHERE key=?').get('chatbot_system_prompt');
    const v = row?.value?.trim() || '';
    if(v) return v;
  }catch{}
  return NEXATECH_BASE_PROMPT;
}
async function getChatbotGenConfig(){
  let temperature = 0.7, maxOutputTokens = 600;
  try{
    const t = await db.prepare('SELECT value FROM content WHERE key=?').get('chatbot_temperature');
    const tv = parseFloat(t?.value);
    if(!isNaN(tv)) temperature = Math.min(1.5, Math.max(0, tv));
  }catch{}
  try{
    const m = await db.prepare('SELECT value FROM content WHERE key=?').get('chatbot_max_tokens');
    const mv = parseInt(m?.value, 10);
    if(!isNaN(mv)) maxOutputTokens = Math.min(2000, Math.max(100, mv));
  }catch{}
  return { temperature, maxOutputTokens, topP: 0.9 };
}
async function callGemini(userMessage, history=[]){
  const ready = await aiReady().catch(()=> ({ ready:false }));
  if(!ready.ready) return null;
  const siteKnowledge = await buildSiteKnowledge();
  const basePrompt = await getChatbotPrompt();
  const genCfg = await getChatbotGenConfig();
  const fullPrompt = basePrompt + "\n\nSITE KNOWLEDGE (live, everything except secrets — owner: Akinyemmi Ifeoluwa, brand NEXATECH, includes plans, portfolio, WhatsApp, pricing, team, certificates):\n" + siteKnowledge;
  // Build contents with history (up to last 10 turns) for conversational memory.
  // Gemini rejects consecutive same-role turns, so merge them; first turn must be user.
  let contents = [];
  if(Array.isArray(history) && history.length){
    const clean = history.filter(h=> h && (h.role==='user' || h.role==='model') && h.text).slice(-10);
    for(const h of clean){
      const txt = String(h.text).slice(0,2000);
      const prev = contents[contents.length-1];
      if(prev && prev.role===h.role) prev.parts[0].text = (prev.parts[0].text + '\n' + txt).slice(0,4000);
      else contents.push({ role: h.role, parts: [{ text: txt }] });
    }
  }
  while(contents.length && contents[0].role!=='user') contents.shift();
  const tail = contents[contents.length-1];
  if(tail && tail.role==='user') tail.parts[0].text = (tail.parts[0].text + '\n' + String(userMessage)).slice(0,4000);
  else contents.push({ role: 'user', parts: [{ text: userMessage }] });
  try{
    const r = await aiGenerate({ systemText: fullPrompt, contents, genConfig: genCfg, timeoutMs: 20000 });
    try{ globalThis.__lastGeminiCode = 'ok'; }catch{}
    return r.text;
  }catch(e){
    // One retry on pure timeouts (slow model/cold path) before giving up
    if(e && (e.name === 'AbortError' || /timed out/i.test(e.message || ''))){
      try{
        const r2 = await aiGenerate({ systemText: fullPrompt, contents, genConfig: genCfg, timeoutMs: 25000 });
        try{ globalThis.__lastGeminiCode = 'ok'; }catch{}
        return r2.text;
      }catch(e2){ e = e2; }
    }
    console.error('Gemini call failed', e.message);
    // Failure category for the chat endpoint so the frontend can explain itself
    let code = 'error';
    if(e && e.quota) code = 'quota';
    else if(/timed out|abort/i.test(e?.message || '')) code = 'timeout';
    else if(/no .*key saved/i.test(e?.message || '')) code = 'config';
    try{ globalThis.__lastGeminiError = e.message; globalThis.__lastGeminiCode = code; }catch{}
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
  raw += `Subject: ${encodeSubjectHeader(subject)}\r\n`;
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

// ==================== Auto AI Follow-ups — instant (form + chat) + daily, via same Gmail Client ID/Secret ====================
// Requirements covered:
// - After name+email from form OR chatbot, send AI-generated follow-up based on their request / chat transcript
// - Every day send follow-up via same Gmail OAuth (google_client_id/secret)
// - All sends appear in CRM backend (followup_logs + campaign_sends + events)
// - Opt-out (unsubscribe) link in every email
// - WhatsApp CTA in every email, HTML-designed, first message sent instantly
async function ensureFollowupTables(){
  try{
    await db.exec(`
      CREATE TABLE IF NOT EXISTS followup_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        lead_id INTEGER,
        session_id TEXT DEFAULT '',
        kind TEXT DEFAULT 'form_instant',
        day_number INTEGER DEFAULT 0,
        subject TEXT DEFAULT '',
        body_html TEXT DEFAULT '',
        body_text TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        error TEXT DEFAULT '',
        message_id TEXT DEFAULT '',
        sent_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_followup_email ON followup_logs(email);
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        reason TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }catch(e){ console.error('ensureFollowupTables', e.message); }
  // Migration for existing DBs: link column to the mirrored CRM send row
  try{ await db.prepare('ALTER TABLE followup_logs ADD COLUMN send_id INTEGER DEFAULT 0').run(); }catch{}
}
async function getFollowupSettings(){
  const get = async (k, fb) => {
    try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get(k); const v = r?.value?.trim(); return v === undefined || v === '' ? fb : v; }catch{ return fb; }
  };
  const bool = (v) => String(v).toLowerCase() === 'true' || v === true || v === '1';
  const enabled = bool(await get('followup_enabled','true'));
  const instantEnabled = bool(await get('followup_instant_enabled','true'));
  const dailyEnabled = bool(await get('followup_daily_enabled','true'));
  const maxDays = Math.min(30, Math.max(1, parseInt(await get('followup_max_days','7'),10) || 7));
  const chatIdleMinutes = Math.min(120, Math.max(2, parseInt(await get('followup_chat_idle_minutes','10'),10) || 10));
  const fromName = await get('followup_from_name','') || (await getGoogleConfig().then(c=>c.gmailSenderName).catch(()=>'')) || 'Nexatech';
  return { enabled, instantEnabled, dailyEnabled, maxDays, chatIdleMinutes, fromName };
}
async function isEmailUnsubscribed(email){
  if(!email) return false;
  try{
    const row = await db.prepare('SELECT email FROM email_unsubscribes WHERE email=?').get(String(email).toLowerCase().trim());
    return !!row;
  }catch{ return false; }
}
function getUnsubscribeToken(email){
  return crypto.createHmac('sha256', JWT_SECRET).update(String(email||'').toLowerCase().trim()).digest('hex').slice(0,32);
}
function getBaseUrl(req){
  if(process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/,'');
  if(req) return `${req.protocol}://${req.get('host')}`;
  return `http://localhost:${PORT}`;
}
function getUnsubscribeUrl(email, baseUrl){
  const b = (baseUrl||process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
  return `${b}/unsubscribe?email=${encodeURIComponent(email)}&token=${getUnsubscribeToken(email)}`;
}
async function getOwnerContact(){
  const get = async (k, fb) => { try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get(k); return r?.value?.trim() || fb; }catch{ return fb; } };
  const whatsapp_number = await get('whatsapp_number','19283825389');
  const footer_email = await get('footer_email','saheednexatech@gmail.com');
  const footer_phone = await get('footer_phone','+1 928 382 5389');
  return { whatsapp_number, footer_email, footer_phone };
}
// AI-generated subject + inner HTML based on lead request or chat transcript. Falls back to templates if Gemini unavailable.
async function generateFollowupAI({ lead={}, transcript='', kind='form_instant', dayNumber=0 }){
  const name = (lead.name||'there').split(' ')[0];
  const niche = lead.preferredNiche || lead.niche || '';
  const store = lead.storeName || '';
  const fallbackSubject = kind === 'form_instant'
    ? cleanSubject('Thanks ' + name + ' - your ' + (store ? store + ' ' : '') + 'store request is in', 'Thanks ' + name + ' - your store request is in')
    : kind === 'chat_instant'
      ? cleanSubject('Great chatting, ' + name + ' - next step for your' + (niche ? ' ' + niche : '') + ' store', 'Great chatting, ' + name + ' - next step for your store')
      : cleanSubject(name + ', quick check-in (Day ' + (dayNumber || '') + ') - your store slot', 'Quick check-in - your store slot');
  const fallbackInner = kind === 'form_instant'
    ? `<p>Hi ${escapeHtml(name)},</p><p>Thanks for applying for your <b>${escapeHtml(store||'dropshipping store')}</b>${niche?` in the <b>${escapeHtml(niche)}</b> niche`:''}. We have received your request and our team will reach out on WhatsApp within 24 hours.</p><p>While you wait: every store we build includes winning-product research, supplier automation and 100% ownership in your account — launched in 7 to 14 days.</p>`
    : kind === 'chat_instant'
      ? `<p>Hi ${escapeHtml(name)},</p><p>Thanks for chatting with us${transcript ? ' about <b>'+escapeHtml(transcript.slice(0,120))+'…</b>' : ''}. Based on what you asked, the best next step is a quick WhatsApp chat with Ifeoluwa so we can map your niche, timeline and package.</p><p>Reply to this email or tap WhatsApp below — we usually reply within hours.</p>`
      : `<p>Hi ${escapeHtml(name)},</p><p>Just checking in${store?` on <b>${escapeHtml(store)}</b>`:''}${niche?` (${escapeHtml(niche)})`:''} — your build slot is still open. Many founders start with a free strategy call to lock timeline and package.</p><p>Want us to hold your slot for this week? Tap WhatsApp below or reply “YES”.</p>`;
  const keys = await getGeminiKeys().catch(()=> []);
  const cfg = await getAIConfig().catch(()=> ({ provider:'gemini' }));
  if(cfg.provider === 'gemini' && !keys.length) return { subject: fallbackSubject, htmlInner: fallbackInner, textInner: fallbackInner.replace(/<[^>]+>/g,''), ai: false };
  let model = GEMINI_MODEL;
  try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(r?.value?.trim()) model = r.value.trim(); }catch{}
  const ctxSummary = [
    `Name: ${lead.name||''}`, `Store: ${lead.storeName||''}`, `Niche: ${lead.preferredNiche||''} ${lead.preferredNicheOther||''}`,
    `Investment: ${lead.investmentRange||''}`, `Status: ${lead.storeStatus||''}`, `WasScammed: ${lead.wasScammed||''}`,
    lead.scamDetails ? `ScamDetails: ${lead.scamDetails}` : '', `TrafficPlan: ${lead.trafficPlan||''}`, `Source: ${lead.source||''}`
  ].filter(Boolean).join(' | ').slice(0,1200);
  const cleanTranscript = String(transcript||'').slice(0,2500);
  const dayAngle = kind.startsWith('daily') ? `This is Day ${dayNumber} follow-up (angles rotate: Day2 reminder+social proof, Day3 FAQ/objection handling incl. scam-trust, Day4 urgency/slot scarcity, Day5+ mentorship pay-after-results). Keep it fresh, never repeat verbatim.` : 'This is the FIRST instant follow-up (thank them, confirm next step within 24h on WhatsApp).';
  const prompt = `You are Nexatech email copywriter. Write a short personalized follow-up email.\n${dayAngle}\nLEAD CONTEXT: ${ctxSummary || '(chat-only contact)'}\nCHAT TRANSCRIPT (if any): ${cleanTranscript || '(none — form lead)'}\nRULES:\n- Friendly, human, 120-180 words, 2-3 short paragraphs. Address by first name.\n- Reference their niche/store/request specifically. If scammed=yes, show empathy + trust (100% ownership, video proof).\n- Never invent prices beyond Starter $149 / Pro $299 / Elite $599 / Mentorship pay-after-results.\n- No raw URLs (WhatsApp button + unsubscribe are added separately). No emojis overload (max 1).\n- SUBJECT RULE: include the person's first name plus their store or niche, plain ASCII text only (letters, numbers, basic punctuation - no emoji, no special dashes, no curly quotes). Example: Thanks Ada - your GlowLab fashion store request is in.\n- Return ONLY valid JSON: {"subject":"...","html_inner":"<p>...</p><p>...</p>","text_inner":"..."}`;
  try{
    const r = await aiGenerate({ contents: [{ role:'user', parts:[{ text: prompt }] }], genConfig: { temperature: 0.8, maxOutputTokens: 700, topP: 0.9 }, timeoutMs: 15000 });
    let text = r.text.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('no JSON');
    const parsed = JSON.parse(m[0]);
    const subject = cleanSubject(parsed.subject, fallbackSubject);
    let htmlInner = String(parsed.html_inner||parsed.html||'').slice(0,4000) || fallbackInner;
    // basic sanitization: strip scripts, allow p/b/i/ul/li/br/strong/em
    htmlInner = htmlInner.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/on\w+="[^"]*"/gi,'').slice(0,4000);
    if(!/<p|</.test(htmlInner)) htmlInner = `<p>${escapeHtml(htmlInner).replace(/\n/g,'<br>')}</p>`;
    const textInner = String(parsed.text_inner||parsed.text||'').slice(0,3000) || htmlInner.replace(/<[^>]+>/g,'');
    return { subject, htmlInner, textInner, ai: true };
  }catch(e){
    console.error('followup AI failed, using fallback:', e.message);
    return { subject: fallbackSubject, htmlInner: fallbackInner, textInner: fallbackInner.replace(/<[^>]+>/g,''), ai: false };
  }
}
function buildFollowupHtml({ innerHtml, leadName='', whatsappNumber='', whatsappUrl='', unsubscribeUrl='', preheader='' }){
  const waNum = (whatsappNumber||'19283825389').replace(/\D/g,'');
  const waUrl = whatsappUrl || `https://wa.me/${waNum}?text=${encodeURIComponent('Hi Nexatech! Following up on my store request.')}`;
  const safeInner = innerHtml || '<p>Thanks for reaching out — we will be in touch shortly.</p>';
  const pre = preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader).slice(0,140)}</div>` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,system-ui,-apple-system,sans-serif;color:#0B1220">`
  + pre
  + `<div style="max-width:600px;margin:0 auto;padding:24px 16px">`
  + `<div style="background:linear-gradient(135deg,#0B1220,#132238);border-radius:16px 16px 0 0;padding:22px 24px;text-align:center"><div style="display:inline-block;background:linear-gradient(135deg,#00D1FF,#7C3AED);color:#fff;font-weight:900;width:40px;height:40px;line-height:40px;border-radius:12px;font-size:20px">N</div><div style="color:#fff;font-weight:900;letter-spacing:2px;margin-top:8px">NEXATECH</div><div style="color:#94A3B8;font-size:12px;margin-top:2px">Done-for-you dropshipping stores • 7–14 day launch</div></div>`
  + `<div style="background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 16px 16px;padding:26px 24px;line-height:1.65;font-size:14px">${safeInner}`
  + `<div style="text-align:center;margin:22px 0 6px"><a href="${waUrl}" style="display:inline-block;background:#25D366;color:#fff;font-weight:800;font-size:14px;text-decoration:none;padding:13px 26px;border-radius:999px">💬 Chat on WhatsApp →</a><div style="font-size:11px;color:#64748B;margin-top:6px">Fastest reply • usually within hours • ${escapeHtml(waNum)}</div></div>`
  + `</div>`
  + `<div style="text-align:center;font-size:11px;color:#94A3B8;margin-top:14px;line-height:1.6">You received this because you contacted Nexatech${leadName?` as ${escapeHtml(leadName)}`:''}.<br><a href="${unsubscribeUrl}" style="color:#7C3AED">Unsubscribe / opt out</a> • Reply STOP to opt out • saheednexatech@gmail.com<br>Serving clients worldwide</div>`
  + `</div></body></html>`;
}
async function ensureAutoCampaign(){
  try{
    let row = await db.prepare('SELECT * FROM campaigns WHERE name=?').get('Auto AI Follow-ups');
    if(row) return row.id;
    const info = await db.prepare('INSERT INTO campaigns (name,subject,body_html,body_text,from_name,status) VALUES (?,?,?,?,?,?)')
      .run('Auto AI Follow-ups','Auto follow-up','Auto AI follow-up body','Auto AI follow-up', 'Nexatech', 'auto');
    return info.lastInsertRowid || (await db.prepare('SELECT * FROM campaigns WHERE name=?').get('Auto AI Follow-ups'))?.id || 0;
  }catch{ return 0; }
}
async function hasFollowupBeenSent({ email, kind, sessionId='', dayNumber=0 }){
  try{
    const em = String(email||'').toLowerCase().trim();
    if(!em) return true;
    if(kind === 'form_instant' || kind === 'chat_instant'){
      if(sessionId){
        const r = await db.prepare("SELECT id FROM followup_logs WHERE session_id=? AND kind=? AND status=? LIMIT 1").get(sessionId, kind, 'sent');
        if(r) return true;
      }
      const r2 = await db.prepare("SELECT id FROM followup_logs WHERE email=? AND kind=? AND status=? LIMIT 1").get(em, kind, 'sent');
      if(r2) return true;
      return false;
    }
    // daily: same kind+day already sent?
    const r = await db.prepare("SELECT id FROM followup_logs WHERE email=? AND kind=? AND day_number=? AND status=? LIMIT 1").get(em, kind, dayNumber, 'sent');
    if(r) return true;
    // also max 1 followup per day per email
    const today = await db.prepare("SELECT id FROM followup_logs WHERE email=? AND date(sent_at)=date('now') AND status=? LIMIT 1").get(em, 'sent');
    if(today) return true;
    return false;
  }catch{ return false; }
}
async function logFollowup({ email, name='', leadId=null, sessionId='', kind='', dayNumber=0, subject='', body_html='', body_text='', status='sent', error='', messageId='' }){
  const em = String(email||'').toLowerCase().trim();
  // Mirror into CRM first so we can link the follow-up row to its outbox row
  let sendId = 0;
  try{
    const campId = await ensureAutoCampaign();
    const si = await db.prepare('INSERT INTO campaign_sends (campaign_id, lead_id, email, name, status, error, message_id, sent_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
      .run(campId || 0, leadId, em, name||'', status, String(error||'').slice(0,500), messageId||'');
    sendId = si.lastInsertRowid || 0;
  }catch(e){ console.error('followup campaign_sends mirror failed', e.message); }
  let logId = null;
  try{
    const info = await db.prepare('INSERT INTO followup_logs (email,lead_id,session_id,kind,day_number,subject,body_html,body_text,status,error,message_id,send_id,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))')
      .run(em, leadId, sessionId||'', kind, dayNumber||0, subject||'', body_html||'', body_text||'', status, String(error||'').slice(0,500), messageId||'', sendId||0);
    logId = info.lastInsertRowid || null;
  }catch(e){
    // Older DBs without send_id column (migration not yet applied) — retry without it
    try{
      const info2 = await db.prepare('INSERT INTO followup_logs (email,lead_id,session_id,kind,day_number,subject,body_html,body_text,status,error,message_id,sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))')
        .run(em, leadId, sessionId||'', kind, dayNumber||0, subject||'', body_html||'', body_text||'', status, String(error||'').slice(0,500), messageId||'');
      logId = info2.lastInsertRowid || null;
    }catch(e2){ console.error('followup log failed', e2.message); }
  }
  try{
    await db.prepare('INSERT INTO events (event_type,element_id,session_id,page_url,metadata) VALUES (?,?,?,?,?)')
      .run('email_sent', String(leadId||sessionId||em), sessionId||'', '', JSON.stringify({ kind, dayNumber, to: em, subject, messageId, logId }));
  }catch{}
  return logId;
}
// Central sender — checks opt-out + settings + dedup, generates AI HTML, sends via same Gmail Client ID/Secret, logs to CRM
async function sendFollowupEmail({ to, name='', lead=null, leadId=null, sessionId='', kind='form_instant', dayNumber=0, transcript='', baseUrl='' }){
  const email = String(to||lead?.email||'').toLowerCase().trim();
  if(!email || !email.includes('@')) return { ok:false, skipped:'invalid email' };
  const displayName = name || lead?.name || '';
  if(await isEmailUnsubscribed(email)){
    await logFollowup({ email, name: displayName, leadId: leadId ?? lead?.id ?? null, sessionId, kind, dayNumber, subject:'(skipped — unsubscribed)', status:'skipped', error:'unsubscribed' });
    return { ok:false, skipped:'unsubscribed' };
  }
  const settings = await getFollowupSettings().catch(()=> ({ enabled:true, instantEnabled:true, dailyEnabled:true }));
  if(!settings.enabled) return { ok:false, skipped:'followups disabled' };
  if(kind.includes('instant') && !settings.instantEnabled) return { ok:false, skipped:'instant disabled' };
  if(kind.startsWith('daily') && !settings.dailyEnabled) return { ok:false, skipped:'daily disabled' };
  if(await hasFollowupBeenSent({ email, kind, sessionId, dayNumber })) return { ok:false, skipped:'already sent' };
  const owner = await getOwnerContact().catch(()=> ({ whatsapp_number:'19283825389', footer_email:'saheednexatech@gmail.com', footer_phone:'+1 928 382 5389' }));
  const unsubUrl = getUnsubscribeUrl(email, baseUrl);
  const gen = await generateFollowupAI({ lead: lead||{ name: displayName, email }, transcript, kind, dayNumber });
  const waPrefill = `Hi Nexatech! ${displayName?displayName.split(' ')[0]+' here — ':''}following up on my store request${lead?.preferredNiche?` (${lead.preferredNiche})`:''}.`;
  const waUrl = `https://wa.me/${owner.whatsapp_number.replace(/\D/g,'')}?text=${encodeURIComponent(waPrefill)}`;
  const html = buildFollowupHtml({ innerHtml: gen.htmlInner, leadName: displayName, whatsappNumber: owner.whatsapp_number, whatsappUrl: waUrl, unsubscribeUrl: unsubUrl, preheader: gen.textInner.slice(0,120) });
  const text = `${gen.textInner}\n\nChat on WhatsApp: ${waUrl}\n\nTo opt out: ${unsubUrl}`;
  // Gmail send via same Client ID/Secret
  try{
    await getAuthenticatedGmail();
  }catch(e){
    await logFollowup({ email, name: displayName, leadId: leadId ?? lead?.id ?? null, sessionId, kind, dayNumber, subject: gen.subject, body_html: html, body_text: text, status:'failed', error: e.message });
    return { ok:false, error: e.message };
  }
  try{
    const cfg = await getGoogleConfig().catch(()=> ({}));
    const info = await sendGmailRaw({ to: email, subject: gen.subject, html, text, fromName: settings.fromName || cfg.gmailSenderName || 'Nexatech', replyTo: owner.footer_email });
    await logFollowup({ email, name: displayName, leadId: leadId ?? lead?.id ?? null, sessionId, kind, dayNumber, subject: gen.subject, body_html: html, body_text: text, status:'sent', messageId: info.messageId||'' });
    return { ok:true, messageId: info.messageId, subject: gen.subject, ai: gen.ai };
  }catch(e){
    await logFollowup({ email, name: displayName, leadId: leadId ?? lead?.id ?? null, sessionId, kind, dayNumber, subject: gen.subject, body_html: html, body_text: text, status:'failed', error: e.message });
    return { ok:false, error: e.message };
  }
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

// --- API: Chat (logged to chat_messages for Admin → Chatbot panel) ---
async function logChatMessage(sessionId, role, text, pageUrl){
  try{
    const sid = String(sessionId || 'anon').slice(0,120);
    const t = String(text || '').slice(0,4000);
    if(!t) return;
    await db.prepare('INSERT INTO chat_messages (session_id, role, text, page_url) VALUES (?,?,?,?)').run(sid, role, t, String(pageUrl||'').slice(0,500));
  }catch(e){ console.error('chat log failed', e.message); }
}
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const name = String(req.body.name || '').trim().slice(0,120);
  const email = String(req.body.email || '').trim().slice(0,160);
  if (name.length < 2) return res.status(400).json({ error: 'Please provide your name before chatting.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please provide a valid email before chatting.' });
  const sid = String(sessionId || ('anon-'+Date.now())).slice(0,120);
  const pageUrl = String(req.body.pageUrl || req.headers.referer || '').slice(0,500);
  // Upsert visitor identity for Admin → Chatbot → People
  try{
    await db.prepare("INSERT INTO chat_sessions (session_id, name, email, updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name, email=excluded.email, updated_at=datetime('now')").run(sid, name, email);
  }catch(e){ console.error('chat session upsert failed', e.message); }
  // Log user message immediately (so count works even if AI fails)
  await logChatMessage(sid, 'user', message, pageUrl);
  // AI provider check (Gemini by default, or any configured provider)
  const ready = await aiReady().catch(()=> ({ ready:false }));
  if(!ready.ready){
    await logChatMessage(sid, 'model', 'Chatbot not configured — ' + (ready.reason || 'set an AI provider') + '.', pageUrl);
    return res.status(503).json({ error: 'Chatbot not configured — ' + (ready.reason || 'set an AI provider in Admin → Integrations → AI Provider'), code: 'config', fallback: 'Please chat on WhatsApp instead.' });
  }
  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const reply = await callGemini(message, history);
  if(reply){
    await logChatMessage(sid, 'model', reply, pageUrl);
    // fetch model for response
    let model = GEMINI_MODEL;
    try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(r?.value?.trim()) model = r.value.trim(); }catch{}
    return res.json({ reply, source: 'gemini', model });
  }
  await logChatMessage(sid, 'model', 'Gemini failed — check API key/model.', pageUrl);
  let failCode = 'error';
  let failDetail = '';
  try{ failCode = globalThis.__lastGeminiCode || 'error'; }catch{}
  try{ failDetail = String(globalThis.__lastGeminiError || '').slice(0, 220); }catch{}
  const failHints = {
    quota: 'AI daily limit reached — try again shortly',
    timeout: 'AI took too long — try again',
    config: 'Chatbot not configured — set Gemini API key in Admin → Integrations → Gemini Direct',
    error: 'Gemini failed — check API key/model'
  };
  return res.status(503).json({ error: failHints[failCode] || failHints.error, code: failCode, detail: failDetail, fallback: 'Please chat on WhatsApp instead.' });
});

// Chat finished — instant AI follow-up after name+email + conversation ends (frontend calls after idle / close / New Chat; cron also auto-detects idle)
app.post('/api/chat/finish', async (req, res) => {
  try{
    const sid = String(req.body?.sessionId || '').slice(0,120);
    if(!sid) return res.status(400).json({ error: 'sessionId required' });
    await ensureFollowupTables();
    let session = null;
    try{ session = await db.prepare('SELECT session_id, name, email FROM chat_sessions WHERE session_id=?').get(sid); }catch{}
    if(!session || !session.email || !session.email.includes('@')) return res.status(400).json({ error: 'No email for this chat session yet — name+email required before follow-up' });
    if(await hasFollowupBeenSent({ email: session.email, kind:'chat_instant', sessionId: sid })) return res.json({ ok:true, already:true, message:'Follow-up already sent for this chat' });
    // Build transcript from recent messages
    let transcript = '';
    try{
      const msgs = await db.prepare('SELECT role, text FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 30').all(sid);
      transcript = (msgs||[]).map(m=> `${m.role==='user'?'Visitor':'Assistant'}: ${m.text}`).join('\n').slice(0,2500);
    }catch{}
    if(!transcript) return res.status(400).json({ error: 'No conversation yet' });
    const baseUrl = getBaseUrl(req);
    // Try to link to lead if same email exists
    let lead = null, leadId = null;
    try{ lead = await db.prepare('SELECT * FROM leads WHERE email=? ORDER BY created_at DESC LIMIT 1').get(String(session.email).toLowerCase().trim()) || await db.prepare('SELECT * FROM leads WHERE email=? ORDER BY created_at DESC LIMIT 1').get(session.email); leadId = lead?.id ?? null; }catch{}
    const r = await sendFollowupEmail({ to: session.email, name: session.name||lead?.name||'', lead: lead || { name: session.name, email: session.email }, leadId, sessionId: sid, kind:'chat_instant', dayNumber: 1, transcript, baseUrl });
    if(r.ok) return res.json({ ok:true, messageId: r.messageId, subject: r.subject });
    if(r.skipped) return res.json({ ok:true, skipped: r.skipped });
    return res.status(502).json({ error: r.error || 'Follow-up failed — check Gmail connection' });
  }catch(e){ return res.status(500).json({ error: e.message }); }
});

// Public opt-out (one-click from every email) + resubscribe
app.get('/unsubscribe', async (req, res) => {
  const email = String(req.query.email||'').toLowerCase().trim();
  const token = String(req.query.token||'');
  if(!email || !email.includes('@')) return res.status(400).send('<h2>Invalid link</h2><p>Missing email.</p>');
  if(token !== getUnsubscribeToken(email)) return res.status(403).send('<h2>Invalid link</h2><p>This unsubscribe link is invalid. Please use the link from your email.</p>');
  try{
    await ensureFollowupTables();
    await db.prepare("INSERT INTO email_unsubscribes (email, reason) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason").run(email, 'one-click');
  }catch(e){ return res.status(500).send('Failed: '+escapeHtml(e.message)); }
  res.send(`<html><body style="font-family:Inter,system-ui;padding:32px;max-width:560px;margin:auto;text-align:center"><h2>Unsubscribed ✓</h2><p><b>${escapeHtml(email)}</b> will no longer receive follow-up emails from Nexatech.</p><p style="color:#64748B;font-size:13px">Changed your mind? <a href="/resubscribe?email=${encodeURIComponent(email)}&token=${getUnsubscribeToken(email)}">Resubscribe</a></p></body></html>`);
});
app.get('/resubscribe', async (req, res) => {
  const email = String(req.query.email||'').toLowerCase().trim();
  const token = String(req.query.token||'');
  if(!email || token !== getUnsubscribeToken(email)) return res.status(403).send('Invalid link');
  try{ await db.prepare('DELETE FROM email_unsubscribes WHERE email=?').run(email); }catch{}
  res.send(`<html><body style="font-family:Inter,system-ui;padding:32px;max-width:560px;margin:auto;text-align:center"><h2>Resubscribed ✓</h2><p><b>${escapeHtml(email)}</b> will receive follow-ups again.</p><a href="/">Back to site</a></body></html>`);
});
app.post('/api/unsubscribe', async (req, res) => {
  const email = String(req.body?.email||'').toLowerCase().trim();
  if(!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });
  try{
    await ensureFollowupTables();
    await db.prepare("INSERT INTO email_unsubscribes (email, reason) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason").run(email, String(req.body?.reason||'api').slice(0,120));
    res.json({ ok:true, email });
  }catch(e){ res.status(500).json({ error: e.message }); }
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
app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if(!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if(newPassword !== confirmPassword) return res.status(400).json({ error: 'New passwords do not match' });
  if(String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const username = req.user?.username || 'admin';
  const userRow = await db.prepare('SELECT * FROM admin_users WHERE username=?').get(username);
  let target = userRow;
  if(!target && username==='admin') target = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin_alt');
  if(!target) return res.status(404).json({ error: 'User not found' });
  const ok = bcrypt.compareSync(currentPassword, target.password_hash);
  if(!ok) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = bcrypt.hashSync(newPassword, 10);
  await db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(newHash, target.id);
  // also keep admin and admin_alt in sync if main admin
  try{
    if(target.username==='admin'){
      const alt = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin_alt');
      if(alt) await db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(newHash, alt.id);
    }
    if(target.username==='admin_alt'){
      const main = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin');
      if(main) await db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(newHash, main.id);
    }
  }catch{}
  res.json({ ok:true, message: 'Password changed successfully' });
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

// Gemini API key management (chatbot direct, not n8n) — owner pasted key AQ.Ab8RN6... — saved permanently in backend content table
app.get('/api/admin/gemini-key', requireAuth, async (req, res) => {
  const envHas = !!(GEMINI_API_KEY && GEMINI_API_KEY.trim());
  const keys = [];
  for(const k of ['gemini_api_key', 'gemini_api_key_2', 'gemini_api_key_3']){
    try{
      const row = await db.prepare('SELECT value FROM content WHERE key=?').get(k);
      const v = row?.value?.trim() || '';
      if(v) keys.push({ slot: keys.length + 1, keyName: k, masked: v.slice(0,6) + '...' + v.slice(-4), source: 'db' });
    }catch{}
  }
  if(envHas) keys.push({ slot: keys.length + 1, keyName: 'env', masked: 'env...key', source: 'env' });
  let dbModel='';
  try{
    const mr = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model');
    dbModel = mr?.value?.trim() || GEMINI_MODEL;
  }catch{ dbModel=GEMINI_MODEL; }
  const effectiveModel = dbModel || GEMINI_MODEL;
  const first = keys[0] || null;
  res.json({ envHas, dbHas: keys.some(k=>k.source==='db'), masked: first?.masked || '', keys, keyCount: keys.length, model: effectiveModel, dbModel, envModel: GEMINI_MODEL, source: first?.source || 'none', savedPermanently: keys.some(k=>k.source==='db') });
});
app.put('/api/admin/gemini-key', requireAuth, async (req, res) => {
  const { key, key2, key3, model, clear2, clear3 } = req.body;
  let savedKey=false, savedModel=false, saved2=false, saved3=false;
  // Permanent save in backend content table — never wiped unless you edit again (PROTECTED_KEYS)
  if(key !== undefined && String(key).trim() !== ''){
    const val = String(key).trim();
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type").run('gemini_api_key', val, 'text');
    savedKey=true;
  }
  const saveExtra = async (slotKey, val) => {
    const v = String(val).trim();
    if(!v) return false;
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type").run(slotKey, v, 'text');
    return true;
  };
  if(key2 !== undefined) saved2 = await saveExtra('gemini_api_key_2', key2);
  if(key3 !== undefined) saved3 = await saveExtra('gemini_api_key_3', key3);
  if(clear2){ try{ await db.prepare("DELETE FROM content WHERE key='gemini_api_key_2'").run(); }catch{} }
  if(clear3){ try{ await db.prepare("DELETE FROM content WHERE key='gemini_api_key_3'").run(); }catch{} }
  if(model !== undefined && String(model).trim() !== ''){
    const mval = String(model).trim();
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('gemini_model', mval, 'text');
    savedModel=true;
  }
  // Return fresh status to confirm permanent save
  const keys = await getGeminiKeys().catch(()=> []);
  res.json({ ok: true, savedKey, saved2, saved3, savedModel, keyCount: keys.length, keys: keys.map(k=> geminiFingerprint(k)), model, message: keys.length ? ('Saved permanently in backend (' + keys.length + ' key' + (keys.length>1?'s':'') + ' rotate on quota)') : 'No key saved — paste a key and Save' });
});
// AI provider selection (Gemini or any OpenAI-compatible API) — saved permanently
app.get('/api/admin/ai/provider', requireAuth, async (req, res) => {
  const cfg = await getAIConfig();
  const mask = (v)=> v ? (String(v).slice(0,4) + '...' + String(v).slice(-3)) : '';
  res.json({
    provider: cfg.provider,
    apiKeyMasked: mask(cfg.apiKey),
    hasKey: !!cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    presets: Object.fromEntries(Object.entries(AI_PRESETS).map(([k,p])=> [k, { label: p.label, baseUrl: p.baseUrl, model: p.model, needsKey: p.needsKey }]))
  });
});
app.put('/api/admin/ai/provider', requireAuth, async (req, res) => {
  const { provider, api_key, base_url, model, clearKey } = req.body || {};
  const updated = {};
  if(provider !== undefined){
    const p = String(provider).toLowerCase();
    if(!AI_PRESETS[p]) return res.status(400).json({ error: 'Unknown provider' });
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('ai_provider', p, 'text');
    updated.provider = p;
  }
  if(api_key !== undefined && String(api_key).trim() !== ''){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('ai_api_key', String(api_key).trim(), 'text');
    updated.api_key = true;
  }
  if(clearKey){ try{ await db.prepare("DELETE FROM content WHERE key='ai_api_key'").run(); updated.clearedKey = true; }catch{} }
  if(base_url !== undefined){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('ai_base_url', String(base_url).trim(), 'text');
    updated.base_url = String(base_url).trim();
  }
  if(model !== undefined){
    await db.prepare("INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('ai_model', String(model).trim(), 'text');
    updated.model = String(model).trim();
  }
  const cfg = await getAIConfig();
  res.json({ ok:true, updated, provider: cfg.provider, hasKey: !!cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
});
app.post('/api/admin/gemini-test', requireAuth, async (req, res) => {
  const { message } = req.body;
  const testMsg = message || 'Hello, what is NexaTech mentorship?';
  const cfg = await getAIConfig().catch(()=> ({ provider:'gemini' }));
  const siteKnowledge = await buildSiteKnowledge();
  const fullPrompt = (await getChatbotPrompt()) + "\n\nSITE KNOWLEDGE:\n" + siteKnowledge;
  const genConfig = await getChatbotGenConfig();
  const contents = [{ role:'user', parts:[{ text: testMsg }] }];
  // Non-Gemini provider: single test through the router
  if(cfg.provider !== 'gemini'){
    try{
      const r = await aiGenerate({ systemText: fullPrompt, contents, genConfig, timeoutMs: 25000 });
      return res.json({ ok:true, reply: r.text.slice(0,500), provider: cfg.provider, model: cfg.model, via: r.via });
    }catch(e){
      return res.status(500).json({ ok:false, error: e.message, provider: cfg.provider, model: cfg.model, quota: !!e.quota,
        hint: e.quota ? 'Rate/quota limit on ' + cfg.preset.label + ' — wait a bit or check your plan.' : 'Check base URL, key and model for ' + cfg.preset.label + '.' });
    }
  }
  const keys = await getGeminiKeys();
  const source = await getGeminiKeySource();
  let model = GEMINI_MODEL;
  try{ const mr=await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(mr?.value?.trim()) model=mr.value.trim(); }catch{}
  if(!keys.length) return res.status(500).json({ ok:false, error: 'No Gemini API key saved — paste a key in DB and Save', source, model, provider: 'gemini' });
  // Test every saved key individually so you can see which one is quota-exhausted
  const perKey = [];
  for(const k of keys){
    const masked = geminiFingerprint(k);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(k)}`;
    try{
      const controller=new AbortController(); const t=setTimeout(()=>controller.abort(),12000);
      const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({ systemInstruction: { parts: [{ text: fullPrompt }] }, contents: [{ role:'user', parts:[{ text: testMsg }] }], generationConfig: genConfig }),signal:controller.signal});
      clearTimeout(t);
      const data=await resp.json().catch(()=>({}));
      if(!resp.ok){
        const gErr=data?.error?.message||`Gemini API ${resp.status} ${resp.statusText}`;
        perKey.push({ masked, ok:false, error: gErr, quota: resp.status===429 });
      } else {
        const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text).join('\n')||'';
        if(!text.trim()) perKey.push({ masked, ok:false, error:'Empty reply from Gemini', quota:false });
        else perKey.push({ masked, ok:true, reply:text.trim().slice(0,500) });
      }
    }catch(e){ perKey.push({ masked, ok:false, error: e.message, quota:false }); }
    await new Promise(r=> setTimeout(r, 300));
  }
  const good = perKey.find(p=> p.ok);
  if(good) return res.json({ ok:true, reply: good.reply, model, source, masked: good.masked, perKey, keyCount: keys.length, provider: 'gemini' });
  const anyQuota = perKey.some(p=> p.quota);
  console.error('Gemini test failed all keys', perKey.map(p=> p.masked+': '+p.error).join(' | '));
  return res.status(500).json({ ok:false, error: perKey[0]?.error || 'All keys failed', perKey, keyCount: keys.length, model, source, masked: perKey[0]?.masked, hint: anyQuota ? 'All keys quota-exhausted (free tier ~20/day each) - add another key from a different Google project, or wait for reset.' : 'If key is AQ.Ab8... verify it is a valid Google AI API key (AIza...) and model gemini-3.6-flash is enabled for your project. Try a current model name from ai.google.dev/gemini-api/docs/models.' });
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

// ==================== Chatbot analytics — how many used chatbot + full conversations (clean UI) ====================
app.get('/api/admin/chats/summary', requireAuth, async (req,res)=>{
  try{
    const totalSessionsRow = await db.prepare('SELECT COUNT(DISTINCT session_id) as c FROM chat_messages').get();
    const totalMessagesRow = await db.prepare('SELECT COUNT(*) as c FROM chat_messages').get();
    const userMessagesRow = await db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE role='user'").get();
    const botMessagesRow = await db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE role='model'").get();
    // Fallback: also count legacy events chat_message (before chat_messages existed)
    let legacySessions = 0, legacyMessages = 0;
    try{
      const lr = await db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM events WHERE event_type='chat_message'").get();
      legacySessions = parseInt(lr?.c||0,10)||0;
      const lm = await db.prepare("SELECT COUNT(*) as c FROM events WHERE event_type='chat_message'").get();
      legacyMessages = parseInt(lm?.c||0,10)||0;
    }catch{}
    const totalSessions = parseInt(totalSessionsRow?.c||0,10)||0;
    const totalMessages = parseInt(totalMessagesRow?.c||0,10)||0;
    // Today (SQLite datetime vs PG NOW() — wrapper converts, use date(created_at)=date('now'))
    let todaySessions = 0, todayMessages = 0;
    try{
      const t1 = await db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM chat_messages WHERE date(created_at)=date('now')").get();
      todaySessions = parseInt(t1?.c||0,10)||0;
      const t2 = await db.prepare("SELECT COUNT(*) as c FROM chat_messages WHERE date(created_at)=date('now')").get();
      todayMessages = parseInt(t2?.c||0,10)||0;
    }catch{}
    // Last 7 days trend
    let daily = [];
    try{
      daily = await db.prepare("SELECT date(created_at) as d, COUNT(DISTINCT session_id) as sessions, COUNT(*) as messages FROM chat_messages WHERE created_at >= date('now','-7 days') GROUP BY d ORDER BY d").all();
    }catch{ daily = []; }
    res.json({
      totalSessions, totalMessages,
      userMessages: parseInt(userMessagesRow?.c||0,10)||0,
      botMessages: parseInt(botMessagesRow?.c||0,10)||0,
      legacySessions, legacyMessages,
      combinedSessions: totalSessions + (totalSessions===0 ? legacySessions : 0),
      todaySessions, todayMessages, daily
    });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/chats', requireAuth, async (req,res)=>{
  try{
    const { search='', limit='50', offset='0' } = req.query;
    const lim = Math.min(parseInt(limit,10)||50, 200);
    const off = parseInt(offset,10)||0;
    // One row per session: counts, first/last, previews + visitor identity
    let rows = await db.prepare(
      `SELECT m.session_id, COUNT(*) as message_count,
        SUM(CASE WHEN m.role='user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN m.role='model' THEN 1 ELSE 0 END) as bot_count,
        MIN(m.created_at) as first_seen, MAX(m.created_at) as last_seen,
        MAX(s.name) as name, MAX(s.email) as email
       FROM chat_messages m LEFT JOIN chat_sessions s ON s.session_id=m.session_id GROUP BY m.session_id ORDER BY last_seen DESC LIMIT ? OFFSET ?`
    ).all(lim, off);
    // Enrich with first user message + last message preview
    for(const r of rows){
      try{
        const first = await db.prepare("SELECT text FROM chat_messages WHERE session_id=? AND role='user' ORDER BY created_at ASC LIMIT 1").get(r.session_id);
        r.preview = first?.text ? String(first.text).slice(0,120) : '';
        const last = await db.prepare("SELECT text, role FROM chat_messages WHERE session_id=? ORDER BY created_at DESC LIMIT 1").get(r.session_id);
        r.last_text = last?.text ? String(last.text).slice(0,120) : '';
        r.last_role = last?.role || '';
      }catch{ r.preview=''; r.last_text=''; }
    }
    if(search){
      const s = String(search).toLowerCase();
      rows = rows.filter(r=> (r.session_id||'').toLowerCase().includes(s) || (r.preview||'').toLowerCase().includes(s) || (r.last_text||'').toLowerCase().includes(s) || (r.name||'').toLowerCase().includes(s) || (r.email||'').toLowerCase().includes(s));
    }
    const totalRow = await db.prepare('SELECT COUNT(DISTINCT session_id) as c FROM chat_messages').get();
    res.json({ sessions: rows, total: parseInt(totalRow?.c||0,10)||0, limit: lim, offset: off });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/chats/export.csv', requireAuth, async (req,res)=>{
  try{
    const rows = await db.prepare('SELECT m.session_id, s.name, s.email, m.role, m.text, m.page_url, m.created_at FROM chat_messages m LEFT JOIN chat_sessions s ON s.session_id=m.session_id ORDER BY m.created_at DESC LIMIT 2000').all();
    const header = ['session_id','name','email','role','text','page_url','created_at'];
    let csv = header.join(',')+'\n';
    for(const r of rows) csv += header.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(',')+'\n';
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="chats.csv"');
    res.send(csv);
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/chats/:sessionId', requireAuth, async (req,res)=>{
  try{
    const sid = String(req.params.sessionId||'').slice(0,120);
    const msgs = await db.prepare('SELECT id, session_id, role, text, page_url, created_at FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 500').all(sid);
    let session = null;
    try{ session = await db.prepare('SELECT session_id, name, email, created_at FROM chat_sessions WHERE session_id=?').get(sid); }catch{}
    res.json({ session_id: sid, messages: msgs, count: msgs.length, name: session?.name||'', email: session?.email||'' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/chats/:sessionId', requireAuth, async (req,res)=>{
  try{
    await db.prepare('DELETE FROM chat_messages WHERE session_id=?').run(String(req.params.sessionId||'').slice(0,120));
    try{ await db.prepare('DELETE FROM chat_sessions WHERE session_id=?').run(String(req.params.sessionId||'').slice(0,120)); }catch{}
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// ==================== Follow-ups Admin CRM — every send appears here ====================
app.get('/api/admin/followups/status', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const settings = await getFollowupSettings();
    const gmail = await getGoogleConfig();
    let total=0, today=0, failed=0, unsub=0;
    try{ total = parseInt((await db.prepare('SELECT COUNT(*) as c FROM followup_logs WHERE status=?').get('sent'))?.c||0,10)||0; }catch{}
    try{ today = parseInt((await db.prepare("SELECT COUNT(*) as c FROM followup_logs WHERE status=? AND date(sent_at)=date('now')").get('sent'))?.c||0,10)||0; }catch{}
    try{ failed = parseInt((await db.prepare('SELECT COUNT(*) as c FROM followup_logs WHERE status=?').get('failed'))?.c||0,10)||0; }catch{}
    try{ unsub = parseInt((await db.prepare('SELECT COUNT(*) as c FROM email_unsubscribes').get())?.c||0,10)||0; }catch{}
    res.json({ settings, gmail: { connected: !!gmail.gmailConnectedEmail, email: gmail.gmailConnectedEmail||'', hasClient: !!(gmail.clientId&&gmail.clientSecret), hasRefresh: !!gmail.refreshToken }, counts: { totalSent: total, todaySent: today, failed, unsubscribed: unsub } });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.put('/api/admin/followups/settings', requireAuth, async (req, res) => {
  const { followup_enabled, followup_instant_enabled, followup_daily_enabled, followup_max_days, followup_chat_idle_minutes, followup_from_name } = req.body || {};
  const payload = {};
  if(followup_enabled !== undefined) payload.followup_enabled = String(!!followup_enabled && followup_enabled !== 'false');
  if(followup_instant_enabled !== undefined) payload.followup_instant_enabled = String(!!followup_instant_enabled && followup_instant_enabled !== 'false');
  if(followup_daily_enabled !== undefined) payload.followup_daily_enabled = String(!!followup_daily_enabled && followup_daily_enabled !== 'false');
  if(followup_max_days !== undefined) payload.followup_max_days = String(Math.min(30, Math.max(1, parseInt(followup_max_days,10)||7)));
  if(followup_chat_idle_minutes !== undefined) payload.followup_chat_idle_minutes = String(Math.min(120, Math.max(2, parseInt(followup_chat_idle_minutes,10)||10)));
  if(followup_from_name !== undefined) payload.followup_from_name = String(followup_from_name||'').slice(0,80);
  if(!Object.keys(payload).length) return res.status(400).json({ error: 'nothing to update' });
  const stmt = await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')");
  for(const [k,v] of Object.entries(payload)) await stmt.run(k, v, k==='followup_max_days'||k==='followup_chat_idle_minutes'?'number':(k==='followup_from_name'?'text':'boolean'));
  res.json({ ok:true, updated: payload, settings: await getFollowupSettings() });
});
app.get('/api/admin/followups/logs', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const lim = Math.min(parseInt(req.query.limit,10)||50, 200);
    const off = parseInt(req.query.offset,10)||0;
    const { kind='', search='' } = req.query;
    let sql = 'SELECT * FROM followup_logs WHERE 1=1';
    const params = [];
    if(kind){ sql+=' AND kind=?'; params.push(kind); }
    if(search){ sql+=' AND (email LIKE ? OR subject LIKE ? OR session_id LIKE ?)'; const s=`%${search}%`; params.push(s,s,s); }
    sql+=' ORDER BY sent_at DESC LIMIT ? OFFSET ?';
    params.push(lim, off);
    const rows = await db.prepare(sql).all(...params);
    const totalRow = await db.prepare('SELECT COUNT(*) as c FROM followup_logs').get();
    res.json({ logs: rows, total: parseInt(totalRow?.c||0,10)||0, limit: lim, offset: off });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/followups/unsubscribes', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const rows = await db.prepare('SELECT * FROM email_unsubscribes ORDER BY created_at DESC LIMIT 500').all();
    res.json(rows);
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/followups/unsubscribes/:email', requireAuth, async (req, res) => {
  try{ await db.prepare('DELETE FROM email_unsubscribes WHERE email=?').run(String(req.params.email||'').toLowerCase().trim()); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ error: e.message }); }
});
// Delete one follow-up log row + its mirrored outbox row (real delete from the database)
app.delete('/api/admin/followups/logs/:id', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const ex = await db.prepare('SELECT * FROM followup_logs WHERE id=?').get(req.params.id);
    if(!ex) return res.status(404).json({ error: 'not found' });
    try{
      if(ex.send_id) await db.prepare('DELETE FROM campaign_sends WHERE id=?').run(ex.send_id);
      else if(ex.message_id) await db.prepare('DELETE FROM campaign_sends WHERE message_id=? AND email=?').run(ex.message_id, ex.email);
    }catch{}
    await db.prepare('DELETE FROM followup_logs WHERE id=?').run(req.params.id);
    res.json({ ok:true, deleted: req.params.id });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Clear follow-up logs (optional ?kind=form_instant|chat_instant|daily) + their mirrored outbox rows
app.delete('/api/admin/followups/logs', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const { kind='' } = req.query;
    let logIds = [];
    if(kind){
      logIds = await db.prepare('SELECT id, send_id, message_id, email FROM followup_logs WHERE kind=?').all(kind);
      await db.prepare('DELETE FROM followup_logs WHERE kind=?').run(kind);
    } else {
      logIds = await db.prepare('SELECT id, send_id, message_id, email FROM followup_logs').all();
      await db.prepare('DELETE FROM followup_logs').run();
    }
    let unlinked = 0;
    for(const l of (logIds||[])){
      try{
        if(l.send_id){ await db.prepare('DELETE FROM campaign_sends WHERE id=?').run(l.send_id); unlinked++; }
        else if(l.message_id){ const d = await db.prepare('DELETE FROM campaign_sends WHERE message_id=?').run(l.message_id); if(d.changes) unlinked++; }
      }catch{}
    }
    res.json({ ok:true, cleared: (logIds||[]).length, outboxUnlinked: unlinked });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Delete one outbox row (campaign_sends) from the database
app.delete('/api/admin/outbox/:id', requireAuth, async (req, res) => {
  try{
    const ex = await db.prepare('SELECT * FROM campaign_sends WHERE id=?').get(req.params.id);
    if(!ex) return res.status(404).json({ error: 'not found' });
    await db.prepare('DELETE FROM campaign_sends WHERE id=?').run(req.params.id);
    res.json({ ok:true, deleted: req.params.id });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Clear the whole outbox (all campaign_sends rows) from the database
app.delete('/api/admin/outbox', requireAuth, async (req, res) => {
  try{
    const c = await db.prepare('SELECT COUNT(*) as c FROM campaign_sends').get();
    await db.prepare('DELETE FROM campaign_sends').run();
    res.json({ ok:true, cleared: parseInt(c?.c||0,10)||0 });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/followups/test', requireAuth, async (req, res) => {
  try{
    await ensureFollowupTables();
    const cfg = await getGoogleConfig();
    const to = (req.body?.to || cfg.gmailConnectedEmail || '').trim();
    if(!to) return res.status(400).json({ error: 'Provide to email or connect Gmail first' });
    const sampleLead = (await db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 1').get()) || { name:'Test Founder', storeName:'Test Store', preferredNiche:'Fashion', investmentRange:'Pro', email: to, whatsapp:'+19283825389' };
    const r = await sendFollowupEmail({ to, name: sampleLead.name||'Founder', lead: { ...sampleLead, email: to }, leadId: sampleLead.id??null, sessionId:'test-'+Date.now(), kind:'form_instant', dayNumber:1, transcript:'', baseUrl: getBaseUrl(req) });
    // test should not be blocked by dedup — if skipped as already sent, force with unique session
    if(r.ok) return res.json({ ok:true, to, subject: r.subject, ai: r.ai });
    return res.status(500).json({ error: r.error || r.skipped || 'send failed' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/followups/run-daily', requireAuth, async (req, res) => {
  try{
    const { dryRun=false, limit=50 } = req.body || {};
    const r = await runDailyFollowups({ manual:true, dryRun: !!dryRun, limit: Math.min(parseInt(limit,10)||50,200), baseUrl: getBaseUrl(req) });
    res.json({ ok:true, ...r });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// AI subject-line suggestions for campaign/personal emails (uses same Gemini key; template fallback if unset)
app.post('/api/admin/ai/suggest-subject', requireAuth, async (req, res) => {
  try{
    const { context='', topic='', count=3 } = req.body || {};
    const n = Math.min(5, Math.max(1, parseInt(count,10)||3));
    const ctx = String(context||topic||'').slice(0,600);
    let sampleLead = {};
    try{ sampleLead = await db.prepare('SELECT name, storeName, preferredNiche FROM leads ORDER BY created_at DESC LIMIT 1').get() || {}; }catch{ sampleLead = {}; }
    const fallbacks = [
      `{{name}}, your ${sampleLead.storeName||'store'} plan is ready`,
      `Quick one, {{name}} - your ${sampleLead.preferredNiche||'niche'} store slot`,
      `{{name}}, lets get your store launched in 7-14 days`,
      `Your Nexatech application - next step, {{name}}`,
      `{{name}}, still want your ${sampleLead.preferredNiche||''} store?`.trim()
    ].slice(0, n);
    const ready = await aiReady().catch(()=> ({ ready:false }));
    if(!ready.ready) return res.json({ ok:true, ai:false, subjects: fallbacks, hint: (ready.reason || 'AI not configured') + ' (showing template suggestions)' });
    let model = GEMINI_MODEL;
    try{ const r = await db.prepare('SELECT value FROM content WHERE key=?').get('gemini_model'); if(r?.value?.trim()) model = r.value.trim(); }catch{}
    const prompt = `Write ${n} short email subject lines for a Nexatech dropshipping store email${ctx?` about: ${ctx}`:''}. Audience: aspiring store founders${sampleLead.preferredNiche?` (e.g. ${sampleLead.preferredNiche} niche)`:''}. Rules: under 60 chars each, no clickbait, include the {{name}} token in each subject, plain ASCII text only (no emoji, no special dashes). Return ONLY a JSON array of strings.`;
    try{
      const r = await aiGenerate({ contents: [{ role:'user', parts:[{ text: prompt }] }], genConfig: { temperature: 0.9, maxOutputTokens: 300 }, timeoutMs: 15000 });
      const text = r.text;
      const m = text.match(/\[[\s\S]*\]/);
      if(!m) throw new Error('no JSON array');
      const arr = JSON.parse(m[0]);
      const subjects = (Array.isArray(arr)?arr:[]).map(s=> cleanSubject(s, '')).filter(Boolean).slice(0,n);
      if(!subjects.length) throw new Error('empty');
      return res.json({ ok:true, ai:true, subjects });
    }catch(e){
      console.error('suggest-subject AI failed:', e.message);
      return res.json({ ok:true, ai:false, subjects: fallbacks, hint: 'AI failed ('+String(e.message).slice(0,100)+') - showing template suggestions' });
    }
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// ==================== Backup & Restore — server-side saves visible from ANY browser ====================
// Why saves seemed missing in another browser:
// 1) Render free tier wipes data.sqlite on every deploy (now fixed via disk + DATA_DIR in render.yaml).
// 2) Secrets (Client Secret, API keys) are never sent back to the browser — new browser shows empty field + status pill.
// This section adds: full JSON export/import, file snapshots on disk, daily auto-snapshot, and status APIs
// so any browser can verify what is saved.
const BACKUP_DIR = process.env.BACKUP_DIR && process.env.BACKUP_DIR.trim()
  ? process.env.BACKUP_DIR.trim()
  : path.join(process.env.DATA_DIR && process.env.DATA_DIR.trim() ? process.env.DATA_DIR.trim() : __dirname, 'backups');
try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch(e){ console.error('backup dir', e.message); }
const BACKUP_TABLES = ['content','sections','media','team','leads','events','stats_cache','campaigns','campaign_sends','email_templates','chat_messages','content_revisions','chat_sessions','followup_logs','email_unsubscribes'];
async function collectBackup(){
  const dump = { version: 1, exportedAt: new Date().toISOString(), tables: {} };
  for(const t of BACKUP_TABLES){
    try{ dump.tables[t] = await db.prepare(`SELECT * FROM ${t}`).all(); }
    catch(e){ dump.tables[t] = { __error: e.message }; }
  }
  try{ dump.tables.admin_users = (await db.prepare('SELECT id, username, last_login FROM admin_users').all()); }catch{}
  return dump;
}
async function restoreBackup(dump){
  if(!dump || typeof dump !== 'object' || !dump.tables) throw new Error('Invalid backup file (missing tables)');
  // Safety: auto-backup current content first (reversible)
  try{ await autoBackupContent('pre-restore-backup'); }catch{}
  try{
    const snap = JSON.stringify({ tables: { content: dump.tables.content || [] } });
    await db.prepare('INSERT INTO content_revisions (snapshot, label) VALUES (?,?)').run(snap.slice(0,500000), 'pre-full-restore');
  }catch{}
  // Restore content + sections (upsert, never delete protected secrets unless backup has non-empty value)
  const PROTECTED_RESTORE = new Set(['google_client_id','google_client_secret','google_sheets_doc_id','google_sheets_sheet_name','google_refresh_token','google_access_token','google_token_expiry','google_column_mapping','gmail_connected_email','gmail_sender_name','gemini_api_key','gemini_api_key_2','gemini_api_key_3','gemini_model','ai_provider','ai_api_key','ai_base_url','ai_model']);
  if(Array.isArray(dump.tables.content)){
    const stmt = await db.prepare("INSERT INTO content (key,value,type,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')");
    for(const r of dump.tables.content){
      if(!r || !r.key) continue;
      if(PROTECTED_RESTORE.has(r.key) && (!r.value || !String(r.value).trim())){
        // Never wipe a live secret with an empty backup value
        try{ const cur = await db.prepare('SELECT value FROM content WHERE key=?').get(r.key); if(cur?.value?.trim()) continue; }catch{}
      }
      await stmt.run(r.key, String(r.value ?? ''), r.type || 'text');
    }
  }
  if(Array.isArray(dump.tables.sections)){
    for(const s of dump.tables.sections){
      if(!s || !s.key) continue;
      try{ await db.prepare("INSERT INTO sections (key,visible,display_order,animation_enabled) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET visible=excluded.visible, display_order=excluded.display_order, animation_enabled=excluded.animation_enabled").run(s.key, s.visible?1:0, s.display_order??0, s.animation_enabled?1:0); }catch{}
    }
  }
  // Append-only restores for operational tables (never wipe leads/chats): insert rows missing by id.
  // Explicit ids are preserved so cross-references (campaign_sends.lead_id) survive a SQLite -> Postgres move.
  const appendMissing = async (table, cols, extraSkip) => {
    const rows = dump.tables[table];
    if(!Array.isArray(rows)) return 0;
    let n = 0;
    for(const r of rows){
      try{
        if(r.id !== undefined && r.id !== null){
          const exists = await db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(r.id);
          if(exists) continue;
        }
        if(extraSkip && await extraSkip(r)) continue;
        const vals = cols.map(c => r[c] ?? null);
        const ph = cols.map(()=> '?').join(',');
        await db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`).run(...vals);
        n++;
      }catch{}
    }
    return n;
  };
  const emailExists = async (r) => {
    if(!r.email) return false;
    try{ const hit = await db.prepare('SELECT id FROM email_unsubscribes WHERE email=?').get(String(r.email).toLowerCase().trim()); return !!hit; }catch{ return false; }
  };
  const added = {};
  added.media = await appendMissing('media', ['id','type','category','url','caption','alt_text','tags','result_stat','case_study_text','display_order','published']);
  added.team = await appendMissing('team', ['id','name','role','credibility_note','photo_url','social_url','display_order','published']);
  added.email_templates = await appendMissing('email_templates', ['id','name','subject','body_html','body_text','category']);
  added.leads = await appendMissing('leads', ['id','name','storeName','preferredNiche','preferredNicheOther','investmentRange','storeStatus','wasScammed','scamDetails','whatsapp','email','preferredContactTime','source','trafficPlan','consent','submittedAt','pageUrl','sessionId','utm_source','utm_medium','utm_campaign','webhook_status','webhook_attempts','pipeline_stage','created_at']);
  added.events = await appendMissing('events', ['id','event_type','element_id','session_id','timestamp','page_url','utm_source','utm_medium','utm_campaign','metadata']);
  added.campaigns = await appendMissing('campaigns', ['id','name','subject','body_html','body_text','from_name','from_email','reply_to','status','created_by','total_recipients','sent_count','failed_count','open_count','created_at','sent_at']);
  added.campaign_sends = await appendMissing('campaign_sends', ['id','campaign_id','lead_id','email','name','status','error','message_id','sent_at','opened_at']);
  added.chat_messages = await appendMissing('chat_messages', ['id','session_id','role','text','page_url','created_at']);
  added.followup_logs = await appendMissing('followup_logs', ['id','email','lead_id','session_id','kind','day_number','subject','body_html','body_text','status','error','message_id','sent_at']);
  added.email_unsubscribes = await appendMissing('email_unsubscribes', ['id','email','reason','created_at'], emailExists);
  added.content_revisions = await appendMissing('content_revisions', ['id','snapshot','label','created_at']);
  // stats_cache + chat_sessions: upsert by natural key
  if(Array.isArray(dump.tables.stats_cache)){
    for(const s of dump.tables.stats_cache){
      if(!s || !s.metric) continue;
      try{ await db.prepare("INSERT INTO stats_cache (metric,value,computed_at) VALUES (?,?,datetime('now')) ON CONFLICT(metric) DO UPDATE SET value=excluded.value, computed_at=datetime('now')").run(s.metric, String(s.value ?? '')); }catch{}
    }
  }
  if(Array.isArray(dump.tables.chat_sessions)){
    for(const s of dump.tables.chat_sessions){
      if(!s || !s.session_id) continue;
      try{ await db.prepare("INSERT INTO chat_sessions (session_id,name,email,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name, email=excluded.email, updated_at=datetime('now')").run(s.session_id, s.name||'', s.email||''); }catch{}
    }
  }
  // Postgres: explicit-id inserts don't advance SERIAL sequences — fix them so future inserts don't collide
  if(usePg){
    for(const t of ['media','team','leads','events','campaigns','campaign_sends','email_templates','chat_messages','content_revisions','followup_logs','email_unsubscribes','media_blobs','backup_snapshots']){
      try{ await db.prepare(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`).get(); }catch{}
    }
  }
  return { ok:true, added };
}
async function writeFileBackup(name){
  const dump = await collectBackup();
  const base = (name || ('backup-' + new Date().toISOString().replace(/[:.]/g,'-').slice(0,19))).replace(/[^a-zA-Z0-9-_]/g,'').slice(0,60) || ('backup-' + Date.now());
  const fp = path.join(BACKUP_DIR, base + '.json');
  try{ fs.writeFileSync(fp, JSON.stringify(dump)); }catch(e){ console.error('disk snapshot failed (ok on Postgres):', e.message); }
  // Always keep a copy in the DATABASE itself (survives redeploys with no disk). Keep newest 5.
  try{
    await db.prepare("INSERT INTO backup_snapshots (name,dump) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET dump=excluded.dump, created_at=datetime('now')").run(base, JSON.stringify(dump));
    const olds = await db.prepare('SELECT id FROM backup_snapshots ORDER BY id DESC LIMIT 100 OFFSET 5').all();
    for(const o of (olds||[])){ try{ await db.prepare('DELETE FROM backup_snapshots WHERE id=?').run(o.id); }catch{} }
  }catch(e){ console.error('db snapshot failed:', e.message); }
  try{
    const files = fs.readdirSync(BACKUP_DIR).filter(f=> f.endsWith('.json')).map(f=> ({ f, t: fs.statSync(path.join(BACKUP_DIR,f)).mtimeMs })).sort((a,b)=> b.t-a.t);
    for(const extra of files.slice(20)){ try{ fs.unlinkSync(path.join(BACKUP_DIR, extra.f)); }catch{} }
  }catch{}
  return { file: base + '.json', exportedAt: dump.exportedAt, store: usePg ? 'db' : 'disk+db' };
}
async function listSnapshots(){
  const out = [];
  try{
    const files = fs.readdirSync(BACKUP_DIR).filter(f=> f.endsWith('.json')).map(f=>{
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, size: st.size, modified: st.mtime.toISOString(), store: 'disk' };
    });
    out.push(...files);
  }catch{}
  try{
    const rows = await db.prepare('SELECT name, LENGTH(dump) as size, created_at FROM backup_snapshots ORDER BY id DESC LIMIT 10').all();
    const diskNames = new Set(out.map(f=> f.file));
    for(const r of (rows||[])){
      const fname = r.name + '.json';
      if(diskNames.has(fname)) continue; // disk copy already listed
      out.push({ file: fname, size: parseInt(r.size||0,10)||0, modified: r.created_at, store: 'db' });
    }
  }catch{}
  out.sort((a,b)=> String(b.modified||'').localeCompare(String(a.modified||'')));
  return out;
}
async function readSnapshot(fname){
  const safe = path.basename(String(fname||''));
  // DB copy first (works with no disk), disk fallback
  try{
    const base = safe.replace(/\.json$/i,'');
    const row = await db.prepare('SELECT dump FROM backup_snapshots WHERE name=?').get(base);
    if(row?.dump) return JSON.parse(row.dump);
  }catch{}
  const fp = path.join(BACKUP_DIR, safe);
  if(!fs.existsSync(fp)) throw new Error('backup not found');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}
async function deleteSnapshot(fname){
  const safe = path.basename(String(fname||''));
  const base = safe.replace(/\.json$/i,'');
  try{ await db.prepare('DELETE FROM backup_snapshots WHERE name=?').run(base); }catch{}
  try{ fs.unlinkSync(path.join(BACKUP_DIR, safe)); }catch{}
}
// Export full backup (any browser can download + verify saves)
app.get('/api/admin/backup/export', requireAuth, async (req, res) => {
  try{
    const dump = await collectBackup();
    res.setHeader('Content-Type','application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexatech-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.send(JSON.stringify(dump));
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// Import backup (merge; secrets never wiped by empty values)
app.post('/api/admin/backup/import', requireAuth, async (req, res) => {
  try{
    const dump = req.body;
    if(!dump || !dump.tables) return res.status(400).json({ error: 'Upload a backup JSON with {tables} (from Export)' });
    const r = await restoreBackup(dump);
    res.json({ ok:true, ...r });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// File snapshots on server disk (survive restarts via Render disk)
// Snapshots live in the DATABASE (+ disk copy when available) — no disk needed
app.get('/api/admin/backup/files', requireAuth, async (req, res) => {
  try{
    const files = await listSnapshots();
    res.json({ files, usePg: !!process.env.DATABASE_URL, dataDir: process.env.DATA_DIR || '(project dir)' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/backup/files', requireAuth, async (req, res) => {
  try{
    const r = await writeFileBackup(req.body?.name || '');
    res.json({ ok:true, ...r });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/backup/files/:file/restore', requireAuth, async (req, res) => {
  try{
    const dump = await readSnapshot(req.params.file);
    const r = await restoreBackup(dump);
    res.json({ ok:true, file: path.basename(String(req.params.file||'')), ...r });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/backup/files/:file', requireAuth, async (req, res) => {
  try{ await deleteSnapshot(req.params.file); res.json({ ok:true }); }
  catch(e){ res.status(500).json({ error: e.message }); }
});
// Saved-state summary — any browser can confirm what is stored WITHOUT seeing secrets
app.get('/api/admin/backup/status', requireAuth, async (req, res) => {
  try{
    const counts = {};
    for(const t of BACKUP_TABLES){ try{ counts[t] = parseInt((await db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get())?.c||0,10)||0; }catch{ counts[t]=-1; } }
    const secretKeys = ['google_client_id','google_client_secret','google_sheets_doc_id','google_refresh_token','gmail_connected_email','gemini_api_key','gemini_api_key_2','gemini_api_key_3'];
    const secrets = {};
    for(const k of secretKeys){
      try{ const v = (await db.prepare('SELECT value FROM content WHERE key=?').get(k))?.value || ''; secrets[k] = v ? ('saved ✓ ' + String(v).slice(0,4) + '...' + String(v).slice(-3)) : 'not set'; }
      catch{ secrets[k]='error'; }
    }
    let files = [];
    try{ files = fs.readdirSync(BACKUP_DIR).filter(f=> f.endsWith('.json')).sort().slice(-5); }catch{}
    res.json({ counts, secrets, fileBackups: files, dataDir: process.env.DATA_DIR || '(project dir)', usePg: !!process.env.DATABASE_URL, time: new Date().toISOString() });
  }catch(e){ res.status(500).json({ error: e.message }); }
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

// Cron: nightly stats at 02:00, retry every 5 min, idle-chat followups every 5 min, daily AI followups 09:00
cron.schedule('0 2 * * *', refreshStats);
cron.schedule('*/5 * * * *', retryWebhooks);
cron.schedule('*/5 * * * *', processIdleChatFollowups);
cron.schedule('0 9 * * *', ()=> runDailyFollowups({}).catch(e=> console.error('daily followups cron', e.message)));
cron.schedule('30 3 * * *', async ()=>{ try{ const r = await writeFileBackup('auto-'+new Date().toISOString().slice(0,10)); console.log('auto backup', r.file); }catch(e){ console.error('auto backup', e.message); } });

// Idle chats: session updated > chatIdleMinutes ago, has email+messages, no chat_instant sent yet -> send instant AI follow-up
async function processIdleChatFollowups(){
  try{
    await ensureFollowupTables();
    const settings = await getFollowupSettings().catch(()=> ({ enabled:true, instantEnabled:true, chatIdleMinutes:10 }));
    if(!settings.enabled || !settings.instantEnabled) return;
    const idleMin = settings.chatIdleMinutes || 10;
    const cutoff = Date.now() - idleMin*60*1000;
    let sessions = [];
    try{ sessions = await db.prepare('SELECT session_id, name, email, updated_at FROM chat_sessions WHERE email IS NOT NULL ORDER BY updated_at DESC LIMIT 100').all(); }catch{ return; }
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    for(const s of sessions){
      try{
        const em = String(s.email||'').trim();
        if(!em || !em.includes('@')) continue;
        if(await isEmailUnsubscribed(em)) continue;
        const updatedMs = new Date(s.updated_at).getTime();
        if(isNaN(updatedMs) || updatedMs > cutoff) continue; // only idle
        if(await hasFollowupBeenSent({ email: em, kind:'chat_instant', sessionId: s.session_id })) continue;
        const msgs = await db.prepare('SELECT role, text FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 30').all(s.session_id).catch(()=>[]);
        if(!msgs || !msgs.length) continue;
        const hasUser = msgs.some(m=> m.role==='user');
        if(!hasUser) continue;
        const transcript = msgs.map(m=> `${m.role==='user'?'Visitor':'Assistant'}: ${m.text}`).join('\n').slice(0,2500);
        let lead=null, leadId=null;
        try{ lead = await db.prepare('SELECT * FROM leads WHERE email=? ORDER BY created_at DESC LIMIT 1').get(em.toLowerCase()) || await db.prepare('SELECT * FROM leads WHERE email=? ORDER BY created_at DESC LIMIT 1').get(em); leadId = lead?.id ?? null; }catch{}
        await sendFollowupEmail({ to: em, name: s.name||lead?.name||'', lead: lead || { name: s.name, email: em }, leadId, sessionId: s.session_id, kind:'chat_instant', dayNumber:1, transcript, baseUrl });
        await new Promise(r=> setTimeout(r, 400));
      }catch(e){ console.error('idle chat followup session', s?.session_id, e.message); }
    }
  }catch(e){ console.error('processIdleChatFollowups', e.message); }
}

// Daily AI follow-ups: leads from last maxDays (day 2..maxDays) + chat-only contacts, one per email per day, AI-personalized
async function runDailyFollowups({ manual=false, dryRun=false, limit=200, baseUrl='' }={}){
  await ensureFollowupTables();
  const settings = await getFollowupSettings().catch(()=> ({ enabled:true, dailyEnabled:true, maxDays:7 }));
  if(!settings.enabled) return { ok:false, skipped:'followups disabled' };
  if(!settings.dailyEnabled) return { ok:false, skipped:'daily disabled' };
  const maxDays = settings.maxDays || 7;
  const base = baseUrl || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const now = Date.now();
  const dayMs = 86400*1000;
  let leads = [];
  try{ leads = await db.prepare('SELECT * FROM leads WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 500').all(); }catch(e){ return { ok:false, error:e.message }; }
  let chatSessions = [];
  try{ chatSessions = await db.prepare('SELECT session_id, name, email, created_at, updated_at FROM chat_sessions WHERE email IS NOT NULL ORDER BY updated_at DESC LIMIT 500').all(); }catch{}
  const leadEmails = new Set(leads.map(l=> String(l.email||'').toLowerCase().trim()).filter(Boolean));
  const candidates = [];
  for(const l of leads){
    const em = String(l.email||'').toLowerCase().trim();
    if(!em || !em.includes('@')) continue;
    if(['closed','archived'].includes(String(l.pipeline_stage||'').toLowerCase())) continue;
    const createdMs = new Date(l.created_at || l.submittedAt || Date.now()).getTime();
    if(isNaN(createdMs)) continue;
    const dayNumber = Math.floor((now - createdMs)/dayMs) + 1;
    if(dayNumber < 2 || dayNumber > maxDays) continue; // day1 = instant already sent; daily starts day2
    candidates.push({ email: em, name: l.name||'', lead: l, leadId: l.id, sessionId: l.sessionId||'', kind:'daily', dayNumber, source:'lead' });
  }
  for(const s of chatSessions){
    const em = String(s.email||'').toLowerCase().trim();
    if(!em || !em.includes('@')) continue;
    if(leadEmails.has(em)) continue; // avoid double-send when same email is already a lead
    const createdMs = new Date(s.created_at || s.updated_at || Date.now()).getTime();
    if(isNaN(createdMs)) continue;
    const dayNumber = Math.floor((now - createdMs)/dayMs) + 1;
    if(dayNumber < 2 || dayNumber > maxDays) continue;
    candidates.push({ email: em, name: s.name||'', lead: { name: s.name, email: em }, leadId: null, sessionId: s.session_id, kind:'daily', dayNumber, source:'chat' });
  }
  // Filter unsubscribed + already-sent-today/day
  const filtered = [];
  for(const c of candidates){
    if(await isEmailUnsubscribed(c.email)) continue;
    if(await hasFollowupBeenSent({ email: c.email, kind:'daily', dayNumber: c.dayNumber })) continue;
    filtered.push(c);
  }
  const batch = filtered.slice(0, limit);
  if(dryRun) return { ok:true, dryRun:true, wouldSend: batch.length, maxDays, emails: batch.map(b=> ({ email:b.email, day:b.dayNumber, source:b.source })).slice(0,30) };
  let sent=0, failed=0, skipped=0;
  for(const c of batch){
    try{
      let transcript='';
      if(c.sessionId){
        try{
          const msgs = await db.prepare('SELECT role, text FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 20').all(c.sessionId);
          transcript = (msgs||[]).map(m=> `${m.role==='user'?'Visitor':'Assistant'}: ${m.text}`).join('\n').slice(0,2000);
        }catch{}
      }
      const r = await sendFollowupEmail({ to: c.email, name: c.name, lead: c.lead, leadId: c.leadId, sessionId: c.sessionId||'', kind:'daily', dayNumber: c.dayNumber, transcript, baseUrl: base });
      if(r.ok) sent++; else if(r.skipped) skipped++; else failed++;
    }catch{ failed++; }
    await new Promise(r=> setTimeout(r, 400)); // Gmail throttle
  }
  console.log(`Daily followups ${manual?'(manual) ':''}sent=${sent} failed=${failed} skipped=${skipped} candidates=${candidates.length}`);
  return { ok:true, total: batch.length, sent, failed, skipped, maxDays };
}

// (Root, /admin and legal pages are served versioned near the top so deploys refresh instantly)

app.listen(PORT, () => {
  console.log(`Nexatech server running at http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin  (admin / 123450000)`);
});

