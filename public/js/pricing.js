// ============================================================
// Nexatech Pricing page - standalone: packages + mentorship.
// Same data and same secure checkout as the storefront:
// /checkout?kind=plan&item=<tier>&currency=<cur>
// ============================================================
const $ = s => document.querySelector(s);
const FX_ZERO = ['XAF', 'XOF', 'RWF', 'UGX'];
let RATES = null, CURRENCIES = ['USD'], CUR = 'USD';
let CONTENT = {};

function sanitize(t){ const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
function T(key, fb){ const v = CONTENT[key]; if(v === undefined || v === null) return fb; const s = String(v); return s.trim() === '' && typeof fb === 'string' && fb !== '' ? fb : s; }
function parseJSON(v, fallback){
  if(Array.isArray(v)) return v;
  if(typeof v === 'string'){ try{ const p = JSON.parse(v); return Array.isArray(p) ? p : fallback; }catch{ return fallback; } }
  return fallback;
}
function waLink(num, msg){ const n = String(num || '').replace(/\D/g, ''); return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg || ''); }
function fxUsdCentsFromText(t){
  const n = parseFloat(String(t == null ? '' : t).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function fxConvertFrom(amountMinor, fromCur, toCur){
  const from = String(fromCur || 'USD').toUpperCase(), to = String(toCur || 'USD').toUpperCase();
  const R = RATES || {};
  const rFrom = from === 'USD' ? 1 : Number(R[from]), rTo = to === 'USD' ? 1 : Number(R[to]);
  if(!Number.isFinite(rFrom) || rFrom <= 0 || !Number.isFinite(rTo) || rTo <= 0) return { amount_cents: Math.round(Number(amountMinor) || 0), currency: from };
  const usd = ((Number(amountMinor) || 0) / (FX_ZERO.includes(from) ? 1 : 100)) / rFrom;
  const units = usd * rTo;
  return { amount_cents: FX_ZERO.includes(to) ? Math.round(units) : Math.round(units * 100), currency: to };
}
function fxFormat(cents, cur){
  const c = String(cur || 'USD').toUpperCase();
  try{
    const div = FX_ZERO.includes(c) ? 1 : 100;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format((Number(cents) || 0) / div);
  }catch{ return (c === 'USD' ? '$' : c + ' ') + (((Number(cents) || 0) / 100).toLocaleString('en-US')); }
}
function detectCurrency(){
  const q = new URLSearchParams(location.search).get('currency');
  if(q && CURRENCIES.includes(q.toUpperCase())) return q.toUpperCase();
  try{
    const s = String(localStorage.getItem('nx_currency') || '').toUpperCase();
    if(s && CURRENCIES.includes(s)) return s;
  }catch{}
  return 'USD';
}
document.addEventListener('nx:currency', e => {
  const c = String(e.detail && e.detail.currency || '').toUpperCase();
  if(c && CURRENCIES.includes(c)){ CUR = c; renderPricing(); }
});
function applyTexts(){
  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  set('pricing-logo', T('logo_text', 'NEXATECH'));
  set('pricing-eyebrow', T('pricing_eyebrow', 'Pricing'));
  set('pricing-title', T('pricing_title', 'Packages'));
  set('pricing-subtitle', T('pricing_subtitle', 'Choose your launch tier. Every plan: you own the store 100%.'));
  set('mentorship-eyebrow', T('mentorship_eyebrow', 'Mentorship'));
  set('mentorship-title', T('mentorship_title', 'Mentorship - Results Before Payment'));
  set('mentorship-subtitle', T('mentorship_subtitle', 'Make sales before paying for mentorship. We prove it first.'));
  set('mentorship-price', T('mentorship_price', 'Pay After Results'));
}
function renderPricing(){
  const grid = $('#pricing-grid'), loading = $('#pricing-loading');
  if(loading) loading.classList.add('hidden');
  if(!grid) return;
  const tiers = [
    { key: 'starter', name: T('pricing_starter_name', 'Starter'), price: T('pricing_starter_price', '$149'), features: parseJSON(CONTENT.pricing_starter_features, ["1 Niche Store (Premium Theme)", "5 Winning Products Researched", "Supplier & Fulfillment Setup", "Payment Gateway Integration", "Basic Support (14 days)"]), popular: false },
    { key: 'pro', name: T('pricing_pro_name', 'Pro'), price: T('pricing_pro_price', '$299'), features: parseJSON(CONTENT.pricing_pro_features, ["Everything in Starter", "10 Winning Products + Ad Angles", "Custom Branding & Logo", "Abandoned Cart Automation", "Priority Support (30 days)"]), popular: true },
    { key: 'elite', name: T('pricing_elite_name', 'Elite'), price: T('pricing_elite_price', '$599'), features: parseJSON(CONTENT.pricing_elite_features, ["Everything in Pro", "20 Winning Products + Creatives", "3 Custom Ad Creatives", "1-on-1 Growth Call (60 min)", "Extended Support (60 days)"]), popular: false },
  ];
  grid.innerHTML = '';
  tiers.forEach(t => {
    const el = document.createElement('div'); el.className = 'price-card' + (t.popular ? ' popular' : '');
    const c = fxConvertFrom(fxUsdCentsFromText(t.price), 'USD', CUR);
    const disp = fxFormat(c.amount_cents, c.currency);
    el.innerHTML = `${t.popular ? '<span class="popular-badge">' + sanitize(T('pricing_popular_badge', 'Most Popular')) + '</span>' : ''}`
      + `<div class="eyebrow" style="margin:0">${sanitize(t.name)}</div>`
      + `<div class="price" title="${sanitize(t.price)} USD">${sanitize(disp)}</div>`
      + `<ul>${t.features.map(f => `<li>${sanitize(f)}</li>`).join('')}</ul>`
      + `<a class="btn ${t.popular ? 'btn-primary btn-glow' : 'btn-ghost'}" href="/checkout?kind=plan&item=${encodeURIComponent(t.key)}&currency=${encodeURIComponent(CUR)}" style="margin-top:auto">${sanitize(T('pricing_cta_template', 'Choose {name}').replace('{name}', t.name))} →</a>`;
    grid.appendChild(el);
  });
}
function renderMentorship(){
  const bullets = parseJSON(CONTENT.mentorship_bullets, ["Weekly 1:1 strategy calls until first sale", "Ad account setup & first campaign launch together", "Product testing framework & kill/scale rules", "Store CRO audits & A/B tests"]);
  const ul = $('#mentorship-bullets'); if(!ul) return; ul.innerHTML = '';
  bullets.forEach(b => { const li = document.createElement('li'); li.textContent = b; ul.appendChild(li); });
  const waNum = CONTENT.whatsapp_number || '447411200927';
  const waMsg = CONTENT.pricing_mentorship_whatsapp || 'Hi Nexatech! Tell me about the Mentorship (Results Before Payment).';
  const a = $('#mentorship-wa'); if(a) a.href = waLink(waNum, waMsg);
}
document.addEventListener('click', e => {
  const q = e.target.closest('.faq-q');
  if(!q) return;
  const item = q.closest('.faq-item');
  if(!item) return;
  const open = item.classList.toggle('open');
  q.setAttribute('aria-expanded', open ? 'true' : 'false');
});
(async function init(){
  $('#pricing-year').textContent = new Date().getFullYear();
  try{
    const [cR, fR] = await Promise.all([
      fetch('/api/content').then(r => r.json()).catch(() => null),
      fetch('/api/fx/rates').then(r => r.json()).catch(() => null),
    ]);
    if(cR && cR.content) CONTENT = cR.content;
    if(fR && fR.rates){ RATES = fR.rates; CURRENCIES = fR.currencies || ['USD']; }
    CUR = detectCurrency();
    applyTexts();
    renderPricing();
    renderMentorship();
    const waNum = CONTENT.whatsapp_number || '447411200927';
    const wa = $('#pricing-wa');
    if(wa) wa.href = waLink(waNum, 'Hi Nexatech! Not sure which package fits me - can you advise?');
  }catch{ renderPricing(); }
})();
