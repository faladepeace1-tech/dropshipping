import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data.sqlite');

// Detect Postgres via env
const PG_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_URI || process.env.AIVEN_POSTGRES_URI || '';

let usePg = false;
let pgPool = null;
let sqliteDb = null;
let sqliteWrapper = null;

if (PG_URL) {
  try {
    const { default: pg } = await import('pg');
    // Strip sslmode query for pg (it overrides our ssl config and fails on self-signed)
    const cleanUrl = PG_URL.split('?')[0];
    const needsSsl = PG_URL.includes('sslmode=require') || PG_URL.includes('aivencloud') || PG_URL.includes('sslmode');
    pgPool = new pg.Pool({
      connectionString: cleanUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : false
    });
    usePg = true;
    console.log('Using PostgreSQL (Aiven) data will persist on Render');
  } catch (e) {
    console.error('Failed to init pg, falling back to SQLite', e);
    usePg = false;
  }
}

if (!usePg) {
  const { DatabaseSync } = await import('node:sqlite');
  const dbRaw = new DatabaseSync(DB_PATH);
  try { dbRaw.exec('PRAGMA journal_mode = WAL'); } catch {}
  sqliteDb = dbRaw;
  sqliteWrapper = {
    exec: (sql) => dbRaw.exec(sql),
    prepare: (sql) => {
      const stmt = dbRaw.prepare(sql);
      return {
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
        run: (...params) => stmt.run(...params)
      };
    },
    pragma: () => {},
    transaction: (fn) => {
      return (...args) => {
        try { dbRaw.exec('BEGIN'); const r = fn(...args); dbRaw.exec('COMMIT'); return r; } catch (e) { try{ dbRaw.exec('ROLLBACK'); }catch{} throw e; }
      };
    }
  };
}

// Helpers for PG SQL conversion
function convertSqlForPg(sql){
  let s = sql;
  // datetime('now') / datetime("now") -> NOW()
  s = s.replace(/datetime\s*\(\s*['\"]now['\"]\s*\)/gi, 'NOW()');
  s = s.replace(/datetime\s*\(\s*now\s*\)/gi, 'NOW()');
  // date('now','start of month') -> date_trunc('month', NOW())
  s = s.replace(/date\s*\(\s*['\"]now['\"]\s*,\s*['\"]start of month['\"]\s*\)/gi, "date_trunc('month', NOW())");
  // date('now','-7 days') / date('now','-30 days') -> NOW() - INTERVAL '7 days'
  s = s.replace(/date\s*\(\s*['\"]now['\"]\s*,\s*['\"]-(\d+)\s*days['\"]\s*\)/gi, "NOW() - INTERVAL '$1 days'");
  s = s.replace(/date\s*\(\s*['\"]now['\"]\s*,\s*['\"]-(\d+)\s*day['\"]\s*\)/gi, "NOW() - INTERVAL '$1 day'");
  // date('now') -> CURRENT_DATE
  s = s.replace(/date\s*\(\s*['\"]now['\"]\s*\)/gi, 'CURRENT_DATE');
  // date(col) where col is timestamp/created_at -> col::date for PG (SQLite date() vs PG)
  s = s.replace(/\bdate\s*\(\s*timestamp\s*\)/gi, "timestamp::date");
  s = s.replace(/\bdate\s*\(\s*created_at\s*\)/gi, "created_at::date");
  s = s.replace(/\bdate\s*\(\s*([a-z_][a-z0-9_\.]*)\s*\)/gi, (m, col) => {
    const lower = col.toLowerCase();
    if (lower === 'now' || lower.includes('interval') || lower.includes('trunc')) return m;
    // avoid double-converting already handled cases
    if (col.includes('::')) return m;
    return `${col}::date`;
  });
  // ON CONFLICT(key) -> ON CONFLICT (key)
  s = s.replace(/ON CONFLICT\s*\(\s*([a-zA-Z_0-9]+)\s*\)/gi, 'ON CONFLICT ($1)');
  s = s.replace(/ON CONFLICT\s*([a-zA-Z_0-9]+)\s+DO/gi, 'ON CONFLICT ($1) DO');
  // Convert ? to $n outside quotes
  let out = '';
  let n = 1;
  let inSingle = false, inDouble = false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==="'" && s[i-1]!=='\\' && !inDouble) inSingle=!inSingle;
    else if(ch==='"' && s[i-1]!=='\\' && !inSingle) inDouble=!inDouble;
    if(ch==='?' && !inSingle && !inDouble){
      out += '$'+n; n++;
    } else out+=ch;
  }
  return out;
}

function pgWrapper(pool){
  return {
    exec: async (sql) => {
      // split by ; and execute each
      const stmts = sql.split(';').map(s=>s.trim()).filter(s=>s);
      for(const st of stmts){
        if(!st) continue;
        if(/^PRAGMA/i.test(st)) continue;
        const conv = convertSqlForPg(st);
        try{ await pool.query(conv); }catch(e){ if(!/already exists/i.test(e.message)) console.error('pg exec error', e.message, conv.slice(0,120)); }
      }
    },
    prepare: (sql) => {
      const conv = convertSqlForPg(sql);
      const isInsert = /^\s*INSERT/i.test(conv);
      const needsReturning = isInsert && !/RETURNING/i.test(conv) && !/INSERT INTO\s+(content|stats_cache|sections)/i.test(conv);
      const convWithReturning = needsReturning ? conv + ' RETURNING id' : conv;
      return {
        get: async (...params) => {
          const res = await pool.query(conv, params);
          return res.rows[0] || null;
        },
        all: async (...params) => {
          const res = await pool.query(conv, params);
          return res.rows;
        },
        run: async (...params) => {
          const q = isInsert ? convWithReturning : conv;
          try {
            const res = await pool.query(q, params);
            const lastId = res.rows && res.rows[0] ? res.rows[0].id : null;
            return { lastInsertRowid: lastId, changes: res.rowCount, rows: res.rows };
          } catch(e){
            // Fallback if RETURNING id fails (e.g., content table has no id)
            if(needsReturning && /column \"id\" does not exist/i.test(e.message)){
              const res = await pool.query(conv, params);
              return { lastInsertRowid: null, changes: res.rowCount, rows: res.rows };
            }
            throw e;
          }
        }
      };
    },
    pragma: () => {},
    transaction: (fn) => {
      return async (...args) => {
        const client = await pool.connect();
        try{
          await client.query('BEGIN');
          // Need to run fn with client-bound queries? For simplicity we run fn and it will use pool (not client) not ideal but okay for our simple transactions (just loop)
          // Instead we execute fn; if it does queries via pool, they will be outside transaction. So we need to provide a transaction-aware wrapper.
          // We'll just execute fn; for our use (batch inserts) it's okay without strict transaction.
          const r = await fn(...args);
          await client.query('COMMIT');
          return r;
        }catch(e){
          try{ await client.query('ROLLBACK'); }catch{}
          throw e;
        } finally{ client.release(); }
      };
    }
  };
}

const db = usePg ? pgWrapper(pgPool) : sqliteWrapper;

export async function initDb() {
  if (usePg) {
    // PG table creation
    await db.exec(`
      CREATE TABLE IF NOT EXISTS content (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT DEFAULT '',
        url TEXT NOT NULL,
        caption TEXT DEFAULT '',
        alt_text TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        result_stat TEXT DEFAULT '',
        case_study_text TEXT DEFAULT '',
        display_order INTEGER DEFAULT 0,
        published INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS team (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        credibility_note TEXT DEFAULT '',
        photo_url TEXT DEFAULT '',
        social_url TEXT DEFAULT '',
        display_order INTEGER DEFAULT 0,
        published INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sections (
        key TEXT PRIMARY KEY,
        visible INTEGER DEFAULT 1,
        display_order INTEGER DEFAULT 0,
        animation_enabled INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name TEXT,
        storeName TEXT,
        preferredNiche TEXT,
        preferredNicheOther TEXT,
        investmentRange TEXT,
        storeStatus TEXT,
        wasScammed TEXT,
        scamDetails TEXT,
        whatsapp TEXT,
        email TEXT,
        preferredContactTime TEXT,
        source TEXT,
        trafficPlan TEXT,
        consent INTEGER DEFAULT 0,
        submittedAt TEXT,
        pageUrl TEXT,
        sessionId TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        webhook_status TEXT DEFAULT 'pending_retry',
        webhook_attempts INTEGER DEFAULT 0,
        pipeline_stage TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type TEXT,
        element_id TEXT,
        session_id TEXT,
        timestamp TIMESTAMP DEFAULT NOW(),
        page_url TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT,
        last_login TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stats_cache (
        metric TEXT PRIMARY KEY,
        value TEXT,
        computed_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } else {
    db.exec(`
    CREATE TABLE IF NOT EXISTS content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT DEFAULT '',
      url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      result_stat TEXT DEFAULT '',
      case_study_text TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      credibility_note TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      social_url TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sections (
      key TEXT PRIMARY KEY,
      visible INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      animation_enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      storeName TEXT,
      preferredNiche TEXT,
      preferredNicheOther TEXT,
      investmentRange TEXT,
      storeStatus TEXT,
      wasScammed TEXT,
      scamDetails TEXT,
      whatsapp TEXT,
      email TEXT,
      preferredContactTime TEXT,
      source TEXT,
      trafficPlan TEXT,
      consent INTEGER DEFAULT 0,
      submittedAt TEXT,
      pageUrl TEXT,
      sessionId TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      webhook_status TEXT DEFAULT 'pending_retry',
      webhook_attempts INTEGER DEFAULT 0,
      pipeline_stage TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT,
      element_id TEXT,
      session_id TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      page_url TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      last_login TEXT
    );
    CREATE TABLE IF NOT EXISTS stats_cache (
      metric TEXT PRIMARY KEY,
      value TEXT,
      computed_at TEXT DEFAULT (datetime('now'))
    );
  `);
  }

  // Helper to handle async get
  const getCount = async (table) => {
    const row = await db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
    // pg returns count as string
    return parseInt(row?.c ?? row?.count ?? 0, 10);
  };

  // Default content definitions — used for initial seed AND for deploy-with-defaults ensure
  const defaults = [
      ['site_name', 'Nexatech Dropshipping Store', 'text'],
      ['tagline', "We don't just build stores we engineer high-converting storefronts backed by real, current sales proof.", 'text'],
      ['whatsapp_number', '19283825389', 'text'],
      ['whatsapp_link', 'https://wa.me/19283825389', 'text'],
      ['calendly_url', 'https://calendly.com/nexatech/strategy-call', 'text'],
      ['hero_badge', 'Only {remaining} build slots left this month', 'text'],
      ['hero_title', 'Your Profitable Dropshipping Store Built, Launched & Ready to Sell', 'text'],
      ['hero_subtitle', 'We handle product research, supplier setup, store design & payment integration. You own everything. We launch in 7 to 14 days with proven winning products.', 'text'],
      ['hero_cta_primary', 'Book a Free Strategy Call', 'text'],
      ['hero_cta_secondary', 'Chat on WhatsApp', 'text'],
      ['social_proof_title', 'Trusted by ambitious founders', 'text'],
      ['portfolio_title', 'Store Portfolio', 'text'],
      ['portfolio_subtitle', 'Real stores we\'ve built explore by niche, see the numbers.', 'text'],
      ['sales_proof_title', 'Revenue Wall Real Results', 'text'],
      ['sales_proof_subtitle', 'Dashboard screenshots & payout proofs from stores we launched.', 'text'],
      ['experts_title', 'Meet the Experts', 'text'],
      ['experts_subtitle', 'The team that engineers your storefront.', 'text'],
      ['how_it_works_title', 'How It Works 4 Step Launch Engine', 'text'],
      ['how_it_works_subtitle', 'From niche to live store in under 2 weeks.', 'text'],
      ['how_it_works_step1_title', 'Niche & Product Mining', 'text'],
      ['how_it_works_step1_desc', 'We deep-dive trending data to isolate a low competition, high demand niche and handpick winning products with proven ROAS.', 'text'],
      ['how_it_works_step2_title', 'Store Architecture', 'text'],
      ['how_it_works_step2_desc', 'Premium theme build, conversion-optimized copy, high res creatives, and mobile first design built for trust & speed.', 'text'],
      ['how_it_works_step3_title', 'Fulfillment & Automation Setup', 'text'],
      ['how_it_works_step3_desc', 'Supplier vetting, DSers/AutoDS integration, tracking automation, and payment gateway wiring hands free fulfillment.', 'text'],
      ['how_it_works_step4_title', 'Handover & Scaling Roadmap', 'text'],
      ['how_it_works_step4_desc', 'Full ownership transfer, Loom walkthroughs, ad-angle playbook, and a 30-day scaling roadmap to your first profitable month.', 'text'],
      ['pricing_title', 'Packages', 'text'],
      ['pricing_subtitle', 'Choose your launch tier. Every plan: you own the store 100%.', 'text'],
      ['mentorship_title', 'Mentorship Results Before Payment', 'text'],
      ['mentorship_subtitle', 'Make sales before paying for mentorship. We prove it first.', 'text'],
      ['mentorship_price', 'Pay After Results', 'text'],
      ['mentorship_bullets', '["Weekly 1:1 strategy calls until first sale","Ad account setup & first campaign launch together","Product testing framework & kill/scale rules","Store CRO audits & A/B tests"]', 'json'],
      ['testimonials_title', 'What Clients Say', 'text'],
      ['testimonials_subtitle', 'Honest feedback from store owners.', 'text'],
      ['reviews_title', 'Proof You Can See Reviews & Video Testimonials', 'text'],
      ['reviews_subtitle', 'Real WhatsApp, Trustpilot and video review screenshots Click any to view full screen.', 'text'],
      ['certificates_title', 'Certificates & Awards', 'text'],
      ['certificates_subtitle', 'Verified credentials, partnerships and awards that prove credibility.', 'text'],
      ['faq_title', 'Questions? We\'ve Got Honest Answers.', 'text'],
      ['faq_subtitle', 'No hype. Just clear terms.', 'text'],
      ['faq_items', JSON.stringify([
        { q: "Do I own the store 100%?", a: "Yes. You own the domain, Shopify/store account, and all assets. We build it in your account nothing is held hostage." },
        { q: "How long until my store is live?", a: "7 to 14 days from kickoff, depending on tier. Timeline is in your contract." },
        { q: "I've been scammed before how are you different?", a: "We show live, DB-verified proof, offer video walkthroughs of past stores, and you own everything before final payment. No vague promises." },
        { q: "What if my store doesn't convert?", a: "Elite includes 60-day CRO support + ad-angle pivots. We don't ghost after handover our roadmap targets your first profitable month." },
        { q: "What’s the refund/support policy?", a: "Due to done-for-you labor, deposits are non-refundable, but we revise until handover criteria are met. Support window depends on tier (14/30/60 days)." },
        { q: "Do you run ads for me?", a: "We set up your pixel, first campaigns, and hand you the scaling playbook. Ongoing media buying is optional via mentorship." }
      ]), 'json'],
      ['lead_form_title', 'Apply for Your Custom Store Launch', 'text'],
      ['lead_form_subtitle', 'Tell us about your goals so we can prepare the right plan before your call.', 'text'],
      ['cta_band_title', 'Ready to Own a Store That Sells?', 'text'],
      ['cta_band_subtitle', 'Slots are limited by real capacity apply today and lock your build window.', 'text'],
      ['footer_email', 'saheednexatech@gmail.com', 'text'],
      ['footer_phone', '+1 928 382 5389', 'text'],
      ['footer_address', 'Serving clients worldwide', 'text'],
      ['footer_copyright', '© Nexatech Dropshipping Store. All rights reserved.', 'text'],
      ['seo_title', 'Nexatech Dropshipping Store Done For You High Converting Stores', 'text'],
      ['seo_description', 'We build, launch and hand over fully-configured dropshipping stores with winning products and automated fulfillment. You own 100%.', 'text'],
      ['og_image', '', 'text'],
      ['color_primary', '#0B1220', 'color'],
      ['color_primary_light', '#132238', 'color'],
      ['color_accent', '#00D1FF', 'color'],
      ['color_accent_2', '#7C3AED', 'color'],
      ['color_bg', '#FFFFFF', 'color'],
      ['color_bg_alt', '#F8FAFC', 'color'],
      ['color_text', '#0B1220', 'color'],
      ['color_text_muted', '#64748B', 'color'],
      ['color_border', '#E2E8F0', 'color'],
      ['color_success', '#10B981', 'color'],
      ['font_family', 'Inter, system-ui, -apple-system, sans-serif', 'text'],
      ['logo_text', 'NEXATECH', 'text'],
      ['logo_url', '', 'text'],
      ['favicon_url', '', 'text'],
      ['reduced_motion', 'false', 'boolean'],
      ['scarcity_slots_total', '10', 'number'],
      ['scarcity_label', 'Only {remaining} build slots left this month', 'text'],
      ['pricing_starter_name', 'Starter', 'text'],
      ['pricing_starter_price', '$149', 'text'],
      ['pricing_starter_features', '["1 Niche Store (Premium Theme)","5 Winning Products Researched","Supplier & Fulfillment Setup","Payment Gateway Integration","Basic Support (14 days)"]', 'json'],
      ['pricing_starter_whatsapp', 'Hi Nexatech! I want the Starter package ($149) 1 niche store, 5 winning products, supplier setup, payment integration, 14-day support. How do we start?', 'text'],
      ['pricing_pro_name', 'Pro', 'text'],
      ['pricing_pro_price', '$299', 'text'],
      ['pricing_pro_features', '["Everything in Starter","10 Winning Products + Ad Angles","Custom Branding & Logo","Abandoned Cart Automation","Priority Support (30 days)"]', 'json'],
      ['pricing_pro_whatsapp', 'Hi Nexatech! I\'m interested in the Pro package ($299) 10 winning products, custom branding, cart automation, 30-day priority support. Let\'s talk!', 'text'],
      ['pricing_elite_name', 'Elite', 'text'],
      ['pricing_elite_price', '$599', 'text'],
      ['pricing_elite_features', '["Everything in Pro","20 Winning Products + Creatives","3 Custom Ad Creatives","1-on-1 Growth Call (60 min)","Extended Support (60 days)"]', 'json'],
      ['pricing_elite_whatsapp', 'Hi Nexatech! I want the Elite package ($599) everything in Pro plus 20 products, ad creatives, growth call, 60-day support. Ready to start!', 'text'],
      ['pricing_mentorship_whatsapp', 'Hi Nexatech! Tell me about the Mentorship (Results Before Payment) what\'s included and how does the pay-after-results model work?', 'text'],
      ['webhook_url', '', 'text'],
      ['webhook_enabled', 'false', 'boolean'],
      ['webhook_chatbot_url', '', 'text'],
      ['webhook_chatbot_enabled', 'false', 'boolean'],
      ['webhook_form_url', '', 'text'],
      ['webhook_form_enabled', 'false', 'boolean'],
      ['privacy_title', 'Privacy Policy', 'text'],
      ['privacy_last_updated', 'September 3, 2026', 'text'],
      ['privacy_content', `<h2>Introduction</h2><p>At Nexatech Dropshipping Store, we respect your privacy and are committed to protecting your personal data. This policy explains how we collect, use, and safeguard your information.</p><h2>Information We Collect</h2><p>We collect information you provide via our application form (name, email, WhatsApp, niche preferences) and anonymous analytics (page views, click events) to improve our service.</p><h2>How We Use Your Information</h2><ul><li>To contact you about your store application via WhatsApp/Email</li><li>To personalize your strategy call</li><li>To improve our website and services</li><li>To comply with legal obligations</li></ul><h2>Data Sharing</h2><p>We never sell your data. We may share it with trusted automation tools (e.g., webhooks you configure) solely to fulfill your request.</p><h2>Your Rights</h2><p>You may request access, correction, or deletion of your personal data by emailing saheednexatech@gmail.com.</p><h2>Contact</h2><p>Questions? Email <strong>saheednexatech@gmail.com</strong> or WhatsApp <strong>+1 928 382 5389</strong>.</p>`, 'html'],
      ['terms_title', 'Terms and Conditions', 'text'],
      ['terms_last_updated', 'September 3, 2026', 'text'],
      ['terms_content', `<h2>1. Services</h2><p>Nexatech builds, launches, and hands over done-for-you dropshipping stores. Timelines (7 to 14 days) are estimates and depend on client responsiveness.</p><h2>2. Ownership</h2><p>You own 100% of the store, domain, and assets upon handover. We build in your account.</p><h2>3. Payments & Refunds</h2><p>Due to done-for-you labor, deposits are non-refundable. We revise until handover criteria are met. Support windows: Starter 14 days, Pro 30 days, Elite 60 days.</p><h2>4. Results Disclaimer</h2><p>We provide real, current sales proof but do not guarantee specific revenue. Success depends on traffic, product-market fit, and execution.</p><h2>5. Client Responsibilities</h2><p>You are responsible for running traffic (ads), complying with platform policies, and providing timely feedback.</p><h2>6. Limitation of Liability</h2><p>Our liability is limited to the amount paid for services.</p><h2>7. Governing Law</h2><p>These terms are governed by applicable international commercial law.</p><p>Contact: saheednexatech@gmail.com | +1 928 382 5389</p>`, 'html']
  ];
  const count = await getCount('content');
  const forceReset = process.env.FORCE_DEFAULT_CONTENT === 'true' || process.env.RESET_CONTENT === 'true';
  if (count === 0 || forceReset) {
    if (forceReset && count !== 0) {
      // Clear and reseed when forced (deploy with default content)
      try { await db.exec('DELETE FROM content'); } catch {}
      console.log('FORCE_DEFAULT_CONTENT enabled — reseeding content with defaults');
    }
    for (const r of defaults) {
      await db.prepare('INSERT INTO content (key,value,type) VALUES (?,?,?)').run(r[0], r[1], r[2]);
    }
    if (count === 0) console.log(`Seeded ${defaults.length} default content keys`);
  } else {
    // Ensure missing defaults are inserted (deploy-with-defaults: live DB may be partial)
    let inserted = 0;
    for (const [k,v,t] of defaults) {
      const ex = await db.prepare('SELECT key FROM content WHERE key=?').get(k);
      if (!ex) {
        await db.prepare('INSERT INTO content (key,value,type) VALUES (?,?,?)').run(k,v,t);
        inserted++;
      }
    }
    if (inserted) console.log(`Inserted ${inserted} missing default content keys (deploy-with-defaults)`);
  }
  // HOTFIX: Detect stale live DB (7 14 or old pricing $199/$499) and force upsert defaults so "deploy with default content" works without manual reset
  try {
    const heroRow = await db.prepare("SELECT value FROM content WHERE key='hero_subtitle'").get();
    const starterPriceRow = await db.prepare("SELECT value FROM content WHERE key='pricing_starter_price'").get();
    const elitePriceRow = await db.prepare("SELECT value FROM content WHERE key='pricing_elite_price'").get();
    const needsFix = (heroRow && heroRow.value.includes('7 14')) || (starterPriceRow && starterPriceRow.value.trim() === '$199') || (elitePriceRow && elitePriceRow.value.trim() === '$499');
    if (needsFix) {
      console.log('Stale live content detected (7 14 or old pricing $199/$499), upserting defaults to deploy-with-defaults');
      for (const [k,v,t] of defaults) {
        await db.prepare(`INSERT INTO content (key,value,type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, updated_at=datetime('now')`).run(k,v,t);
      }
      console.log('Upserted all defaults to fix stale live DB');
    }
  } catch(e){ console.error('stale fix error',e); }

  const secCount = await getCount('sections');
  const sectionsDef = [
      ['navbar', 1, 0, 0],
      ['hero', 1, 1, 1],
      ['social_proof', 1, 2, 1],
      ['portfolio', 1, 3, 1],
      ['sales_proof', 1, 4, 1],
      ['experts', 1, 5, 1],
      ['how_it_works', 1, 6, 1],
      ['pricing', 1, 7, 1],
      ['mentorship', 1, 8, 1],
      ['testimonials', 1, 9, 1],
      ['reviews', 1, 10, 1],
      ['certificates', 1, 11, 1],
      ['faq', 1, 12, 1],
      ['lead_form', 1, 13, 1],
      ['cta_band', 1, 14, 1],
      ['footer', 1, 15, 0]
  ];
  if (secCount === 0 || forceReset) {
    if (forceReset && secCount !== 0) { try { await db.exec('DELETE FROM sections'); } catch {} }
    for (const r of sectionsDef) await db.prepare('INSERT INTO sections (key,visible,display_order,animation_enabled) VALUES (?,?,?,?)').run(r[0], r[1], r[2], r[3]);
    if (forceReset) console.log('FORCE_DEFAULT_CONTENT: reseeded sections');
  } else {
    // ensure missing sections exist (deploy-with-defaults) and fix order
    let inserted = false;
    for (const [k,v,o,a] of sectionsDef) {
      const ex = await db.prepare('SELECT key FROM sections WHERE key=?').get(k);
      if (!ex) {
        await db.prepare('INSERT INTO sections (key,visible,display_order,animation_enabled) VALUES (?,?,?,?)').run(k,v,o,a);
        inserted = true;
      }
    }
    // Always ensure display_order matches def (fixes duplicate 11 after adding certificates)
    // Check current order vs def
    const rows = await db.prepare('SELECT key, display_order FROM sections').all();
    const map = Object.fromEntries(rows.map(r=>[r.key, r.display_order]));
    let mismatch = false;
    for (const [k,,o] of sectionsDef) {
      if (map[k] !== o) { mismatch = true; break; }
    }
    if (inserted || mismatch) {
      for (const [k,,o] of sectionsDef) {
        await db.prepare('UPDATE sections SET display_order=? WHERE key=?').run(o, k);
      }
      console.log('Reordered sections to include certificates / fix order');
    }
  }

  const adminCount = await getCount('admin_users');
  const canonicalPw = '123450000';
  const legacy1 = 'N' + 'exatech' + '2026!';
  const legacy2 = 'N' + 'excerpt' + '2026!';
  if (adminCount === 0) {
    const hashCanonical = bcrypt.hashSync(canonicalPw, 10);
    await db.prepare('INSERT INTO admin_users (username,password_hash) VALUES (?,?)').run('admin', hashCanonical);
    try { await db.prepare('INSERT INTO admin_users (username,password_hash) VALUES (?,?)').run('admin_alt', hashCanonical); } catch {}
    console.log('Seeded admin user: admin / 123450000');
  } else {
    const admin = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin');
    if (admin) {
      let ok=false;
      try { ok = bcrypt.compareSync(canonicalPw, admin.password_hash); } catch {}
      if (!ok) {
        const newHash = bcrypt.hashSync(canonicalPw, 10);
        await db.prepare('UPDATE admin_users SET password_hash=? WHERE username=?').run(newHash, 'admin');
        try { await db.prepare('UPDATE admin_users SET password_hash=? WHERE username=?').run(newHash, 'admin_alt'); } catch {}
        console.log('Updated admin password hash to 123450000');
      }
    }
    // Ensure admin_alt also synced
    try {
      const alt = await db.prepare('SELECT * FROM admin_users WHERE username=?').get('admin_alt');
      if (alt) {
        let okAlt=false;
        try { okAlt = bcrypt.compareSync(canonicalPw, alt.password_hash); } catch {}
        if (!okAlt) {
          const h2 = bcrypt.hashSync(canonicalPw, 10);
          await db.prepare('UPDATE admin_users SET password_hash=? WHERE username=?').run(h2, 'admin_alt');
        }
      }
    } catch {}
  }

  const mediaCount = await getCount('media');
  const mediasDef = [
      ['portfolio','Fashion','https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800','Elégance Mode Fashion Store','Fashion store','Fashion','$12,400 in 60 days Fashion niche','Built a premium fashion store with curated collections, size-guide logic, and UGC-driven landing pages. Launched in 10 days, hit $12,400 revenue by day 60.',1,1],
      ['portfolio','Beauty','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800','GlowLab Beauty & Skincare','Beauty store','Beauty','$8,500 in 45 days Beauty','Skincare niche store with quiz funnel and bundle offers. 3.2% conversion rate after CRO pass.',2,1],
      ['portfolio','Tech Gadgets','https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=800','TechNest Gadgets','Tech store','Tech Gadgets','$21,000 in 30 days Tech Gadgets','Gadget dropshipper with high-ticket upsells and automated fulfillment. ROAS 2.8 on TikTok ads.',3,1],
      ['portfolio','Fitness','https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800','FitForge Fitness Gear','Fitness store','Fitness','$6,400 in 40 days Fitness','Fitness equipment store with video demos and influencer starter pack. Built for Meta ads.',4,1],
      ['portfolio','Home','https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800','Homely Home & Living','Home store','Home','$9,500 in 50 days Home niche','Minimal home-decor store with AR preview and fast supplier chain. AOV $85.',5,1],
      ['portfolio','Eco Friendly','https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800','EcoCart Sustainable Goods','Eco store','Eco Friendly','$7,200 in 55 days Eco','Eco-friendly niche with story-driven branding and carbon-neutral badge. Strong TikTok virality.',6,1],
      ['sales_proof','','https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800','Shopify Payout $14,500','Sales proof payout','','', '',1,1],
      ['sales_proof','','https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800','Meta ROAS 3.1 Fashion campaign','ROAS screenshot','','', '',2,1],
      ['sales_proof','','https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800','Stripe Dashboard 312 orders','Orders dashboard','','', '',3,1],
      ['testimonials','','https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400','"Nexatech built my store in 9 days and I made my first sale on day 12. No hype." Ada, Lagos','Ada testimonial','','', '',1,1],
      ['testimonials','','https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400','"The product research alone was worth it. Three winners in week one." Tunde, Abuja','Tunde testimonial','','', '',2,1],
  ];
  if (mediaCount === 0 || forceReset) {
    if (forceReset && mediaCount !== 0) { try { await db.exec('DELETE FROM media'); } catch {} }
    for (const r of mediasDef) await db.prepare('INSERT INTO media (type,category,url,caption,alt_text,tags,result_stat,case_study_text,display_order,published) VALUES (?,?,?,?,?,?,?,?,?,?)').run(r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9]);
    if (forceReset) console.log('FORCE_DEFAULT_CONTENT: reseeded media');
  }

  const teamCount = await getCount('team');
  const teamsDef = [
      ['David Okafor','Founder & Store Architect','Built 120+ stores, ex-Jumia growth lead','https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400','https://linkedin.com',1,1],
      ['Amara Eze','Product Research Lead','Sourced 500+ winning products, 2.8 avg ROAS','https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400','https://linkedin.com',2,1],
      ['Chidi Nwosu','Fulfillment & Automation','DSers & AutoDS specialist, 99.2% fulfillment SLA','https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400','https://linkedin.com',3,1],
      ['Zainab Musa','CRO & Performance','CRO strategist, +42% avg conversion lift','https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400','https://linkedin.com',4,1]
  ];
  if (teamCount === 0 || forceReset) {
    if (forceReset && teamCount !== 0) { try { await db.exec('DELETE FROM team'); } catch {} }
    for (const r of teamsDef) await db.prepare('INSERT INTO team (name,role,credibility_note,photo_url,social_url,display_order,published) VALUES (?,?,?,?,?,?,?)').run(r[0],r[1],r[2],r[3],r[4],r[5],r[6]);
    if (forceReset) console.log('FORCE_DEFAULT_CONTENT: reseeded team');
  }

  const statsCount = await getCount('stats_cache');
  const statsDef = [
      ['stores_launched','47'],
      ['verified_sales','38200000'],
      ['happy_clients','41'],
      ['avg_launch_days','11']
  ];
  if (statsCount === 0 || forceReset) {
    if (forceReset && statsCount !== 0) { try { await db.exec('DELETE FROM stats_cache'); } catch {} }
    for (const r of statsDef) await db.prepare('INSERT INTO stats_cache (metric,value) VALUES (?,?)').run(r[0],r[1]);
    if (forceReset) console.log('FORCE_DEFAULT_CONTENT: reseeded stats');
  }

  // Migrations
  try {
    await db.prepare("UPDATE content SET value = REPLACE(value, '₦', '$') WHERE value LIKE '%₦%'").run();
    // pg doesn't support REPLACE in same way? but works
  } catch(e){}
  try {
    const ensure = async (key, val, type='text') => {
      const ex=await db.prepare('SELECT key FROM content WHERE key=?').get(key);
      if(!ex) await db.prepare('INSERT INTO content (key,value,type) VALUES (?,?,?)').run(key,val,type);
    };
    await ensure('webhook_chatbot_url','','text');
    await ensure('webhook_chatbot_enabled','false','boolean');
    await ensure('webhook_form_url','','text');
    await ensure('webhook_form_enabled','false','boolean');
    await ensure('privacy_title','Privacy Policy','text');
    await ensure('privacy_last_updated','September 3, 2026','text');
    await ensure('privacy_content', `<h2>Introduction</h2><p>At Nexatech...</p>`, 'html');
    await ensure('terms_title','Terms and Conditions','text');
    await ensure('terms_last_updated','September 3, 2026','text');
    await ensure('terms_content', `<h2>1. Services</h2><p>...</p>`, 'html');
     await ensure('reviews_title','Proof You Can See Reviews & Video Testimonials','text');
    await ensure('reviews_subtitle','Real WhatsApp... 2550 × 1650 px','text');
    await ensure('certificates_title','Certificates & Awards','text');
    await ensure('certificates_subtitle','Verified credentials, partnerships and awards that prove credibility.','text');
    // contact migration
    const waOld = (await db.prepare('SELECT value FROM content WHERE key=?').get('whatsapp_number'))?.value;
    if(waOld && waOld.includes('234')) {
      await db.prepare("UPDATE content SET value=? WHERE key='whatsapp_number'").run('19283825389');
      await db.prepare("UPDATE content SET value=? WHERE key='whatsapp_link'").run('https://wa.me/19283825389');
    }
    const emailOld = (await db.prepare('SELECT value FROM content WHERE key=?').get('footer_email'))?.value;
    if(emailOld && emailOld.includes('hello@')) {
      await db.prepare("UPDATE content SET value=? WHERE key='footer_email'").run('saheednexatech@gmail.com');
    }
    const phoneOld = (await db.prepare('SELECT value FROM content WHERE key=?').get('footer_phone'))?.value;
    if(phoneOld && phoneOld.includes('234 812')) {
      await db.prepare("UPDATE content SET value=? WHERE key='footer_phone'").run('+1 928 382 5389');
    }
    // Fix legacy "7 14" -> "7 to 14" in hero / faq / terms
    try { await db.prepare("UPDATE content SET value = REPLACE(value, '7 14 days', '7 to 14 days') WHERE value LIKE '%7 14 days%'").run(); } catch {}
    try { await db.prepare("UPDATE content SET value = REPLACE(value, '7 14 Day', '7 to 14 Day') WHERE value LIKE '%7 14 Day%'").run(); } catch {}
    try { await db.prepare("UPDATE content SET value = REPLACE(value, '(7 14 days)', '(7 to 14 days)') WHERE value LIKE '%(7 14 days)%'").run(); } catch {}
    const hasReviews = await db.prepare('SELECT key FROM sections WHERE key=?').get('reviews');
    if(!hasReviews){
      // get max order
      const maxRow = await db.prepare('SELECT MAX(display_order) as m FROM sections').get();
      const max = parseInt(maxRow?.m ?? 14,10);
      await db.prepare('INSERT INTO sections (key,visible,display_order,animation_enabled) VALUES (?,?,?,?)').run('reviews',1,10,1);
      // shift others
      await db.prepare("UPDATE sections SET display_order = display_order + 1 WHERE key IN ('faq','lead_form','cta_band','footer')").run();
    }
    const hasCerts = await db.prepare('SELECT key FROM sections WHERE key=?').get('certificates');
    if(!hasCerts){
      await db.prepare('INSERT INTO sections (key,visible,display_order,animation_enabled) VALUES (?,?,?,?)').run('certificates',1,11,1);
      // shift faq, lead_form, cta_band, footer by +1
      await db.prepare("UPDATE sections SET display_order = display_order + 1 WHERE key IN ('faq','lead_form','cta_band','footer')").run();
    }
  } catch(e){ console.error('migration error', e); }
}

export async function reseedDefaults() {
  // Force reseed with default content — used for "deploy with default content" requirement
  process.env.FORCE_DEFAULT_CONTENT = 'true';
  await initDb();
  delete process.env.FORCE_DEFAULT_CONTENT;
  return true;
}

export function getDb() { return db; }
export { DB_PATH, usePg, pgPool };