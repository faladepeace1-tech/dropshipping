// ============================================================
// Nexatech Pricing page - standalone: packages + mentorship + themes.
// Same data and same secure checkout as the storefront:
// /checkout?kind=plan&item=<tier>&currency=<cur>
// /checkout?kind=theme&item=<slug>&currency=<cur>
// ============================================================
const $ = s => document.querySelector(s);
const FX_ZERO = ['XAF', 'XOF', 'RWF', 'UGX'];
let RATES = null, CURRENCIES = ['USD'], CUR = 'USD';
let CONTENT = {}, THEMES = [];

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
function fillFx(){
  const el = $('#pricing-fx');
  if(!el) return;
  el.innerHTML = '';
  CURRENCIES.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if(c === CUR) o.selected = true;
    el.appendChild(o);
  });
  el.onchange = () => {
    CUR = el.value;
    try{ localStorage.setItem('nx_currency', CUR); }catch{}
    renderPricing();
    renderThemes();
  };
}
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
  set('themes-eyebrow', T('themes_eyebrow', 'Theme Store'));
  set('themes-title', T('themes_title', 'Premium Store Themes'));
  set('themes-subtitle', T('themes_subtitle', 'Ready-made, high-converting themes. Buy once, download instantly, own forever.'));
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
function fxThemePrice(th){
  if(!th || !(Number(th.price_cents) > 0)) return th.price_text || '';
  const c = fxConvertFrom(Number(th.price_cents), th.currency || 'USD', CUR);
  return fxFormat(c.amount_cents, c.currency);
}
function renderThemes(){
  const grid = $('#themes-grid'), empty = $('#themes-empty');
  if(!grid) return;
  grid.innerHTML = '';
  if(!THEMES.length){
    if(empty){ empty.textContent = T('themes_empty', 'No themes available yet - check back soon.'); empty.classList.remove('hidden'); }
    return;
  }
  if(empty) empty.classList.add('hidden');
  const frag = document.createDocumentFragment();
  THEMES.forEach(th => {
    const card = document.createElement('div'); card.className = 'card in theme-card';
    const badge = T('theme_badge', 'Instant Download');
    card.innerHTML = `<div class="card-media">`
      + (th.preview_url
        ? `<img src="${sanitize(th.preview_url)}" alt="${sanitize(th.name)}" loading="lazy" decoding="async" onerror="this.style.opacity=.25">`
        : `<div style="display:grid;place-items:center;height:100%;color:var(--text-muted);font-weight:700">No preview</div>`)
      + `<div class="overlay"><span class="tag">${sanitize(badge)}</span>`
      + `<div style="font-size:15px;font-weight:800;margin-top:6px">${sanitize(th.name)}</div>`
      + `<div class="result" style="font-size:15px">${sanitize(fxThemePrice(th))}</div></div></div>`
      + `<div class="theme-body"><p class="theme-desc">${sanitize((th.description || '').slice(0, 120))}</p>`
      + `<div class="theme-actions">`
      + `<button class="btn btn-ghost theme-preview-btn" type="button">${sanitize(T('theme_preview_label', 'Preview'))}</button>`
      + `<a class="btn btn-primary" href="/checkout?kind=theme&item=${encodeURIComponent(th.slug)}&currency=${encodeURIComponent(CUR)}">${sanitize(T('theme_buy_label', 'Buy Now'))} →</a>`
      + `</div></div>`;
    card.querySelector('.theme-preview-btn').addEventListener('click', e => { e.stopPropagation(); openTheme(th); });
    card.addEventListener('click', () => openTheme(th));
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}
function openTheme(th){
  const img = $('#theme-modal-img');
  img.style.display = th.preview_url ? '' : 'none';
  if(th.preview_url) img.src = th.preview_url;
  $('#theme-modal-title').textContent = th.name || '';
  $('#theme-modal-desc').textContent = th.description || '';
  $('#theme-modal-buy').href = '/checkout?kind=theme&item=' + encodeURIComponent(th.slug) + '&currency=' + encodeURIComponent(CUR);
  $('#theme-modal').classList.add('open');
}
function closeTheme(){ $('#theme-modal')?.classList.remove('open'); }
function renderMentorship(){
  const bullets = parseJSON(CONTENT.mentorship_bullets, ["Weekly 1:1 strategy calls until first sale", "Ad account setup & first campaign launch together", "Product testing framework & kill/scale rules", "Store CRO audits & A/B tests"]);
  const ul = $('#mentorship-bullets'); if(!ul) return; ul.innerHTML = '';
  bullets.forEach(b => { const li = document.createElement('li'); li.textContent = b; ul.appendChild(li); });
  const waNum = CONTENT.whatsapp_number || '447411200927';
  const waMsg = CONTENT.pricing_mentorship_whatsapp || 'Hi Nexatech! Tell me about the Mentorship (Results Before Payment).';
  const a = $('#mentorship-wa'); if(a) a.href = waLink(waNum, waMsg);
}
(async function init(){
  $('#pricing-year').textContent = new Date().getFullYear();
  $('#theme-modal-close').addEventListener('click', closeTheme);
  $('#theme-modal').addEventListener('click', e => { if(e.target === $('#theme-modal')) closeTheme(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeTheme(); });
  try{
    const [cR, fR, tR] = await Promise.all([
      fetch('/api/content').then(r => r.json()).catch(() => null),
      fetch('/api/fx/rates').then(r => r.json()).catch(() => null),
      fetch('/api/themes').then(r => r.json()).catch(() => []),
    ]);
    if(cR && cR.content) CONTENT = cR.content;
    if(fR && fR.rates){ RATES = fR.rates; CURRENCIES = fR.currencies || ['USD']; }
    CUR = detectCurrency();
    fillFx();
    THEMES = Array.isArray(tR) ? tR : [];
    applyTexts();
    renderPricing();
    renderThemes();
    renderMentorship();
    const waNum = CONTENT.whatsapp_number || '447411200927';
    const wa = $('#pricing-wa');
    if(wa) wa.href = waLink(waNum, 'Hi Nexatech! Not sure which package fits me - can you advise?');
  }catch{ renderPricing(); }
})();
