// ============================================================
// Nexatech Custom Offers page - standalone listing.
// Same pricing as the homepage section, same secure checkout:
// /checkout?kind=offer&item=<slug>&currency=<cur>
// ============================================================
const $ = s => document.querySelector(s);
const FX_ZERO = ['XAF', 'XOF', 'RWF', 'UGX'];
let RATES = null, CURRENCIES = ['USD'], CUR = 'USD';
let OFFERS = [];

function sanitize(t){ const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
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
function offerPrice(o){
  if(!o || !(Number(o.price_cents) > 0)) return o.price_text || '';
  const c = fxConvertFrom(Number(o.price_cents), o.currency || 'USD', CUR);
  return fxFormat(c.amount_cents, c.currency);
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
  const el = $('#offers-fx');
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
    render();
  };
}
function render(){
  const grid = $('#offers-grid'), empty = $('#offers-empty'), loading = $('#offers-loading');
  if(loading) loading.classList.add('hidden');
  if(!grid) return;
  grid.innerHTML = '';
  if(!OFFERS.length){
    if(empty) empty.classList.remove('hidden');
    return;
  }
  if(empty) empty.classList.add('hidden');
  OFFERS.forEach(o => {
    const el = document.createElement('div');
    el.className = 'price-card';
    const disp = offerPrice(o);
    el.innerHTML = (o.image_url ? `<img src="${sanitize(o.image_url)}" alt="" loading="lazy" decoding="async" style="width:100%;border-radius:12px;margin-bottom:10px;aspect-ratio:16/9;object-fit:cover" onerror="this.style.display='none'">` : '')
      + `<div class="eyebrow" style="margin:0">${sanitize(o.title)}</div>`
      + `<div class="price" title="${sanitize(o.price_text || '')}">${sanitize(disp)}</div>`
      + (o.delivery_label ? `<div class="sub" style="margin:0 0 6px;font-size:12px">⏱ ${sanitize(o.delivery_label)}</div>` : '')
      + `<p class="sub" style="margin:0 0 10px;font-size:13px">${sanitize(o.description || '')}</p>`
      + `<a class="btn btn-primary btn-glow" href="/checkout?kind=offer&item=${encodeURIComponent(o.slug)}&currency=${encodeURIComponent(CUR)}" style="margin-top:auto">Order Now →</a>`;
    grid.appendChild(el);
  });
}
(async function init(){
  $('#offers-year').textContent = new Date().getFullYear();
  try{
    const [cR, fR, oR] = await Promise.all([
      fetch('/api/content').then(r => r.json()).catch(() => null),
      fetch('/api/fx/rates').then(r => r.json()).catch(() => null),
      fetch('/api/offers').then(r => r.json()).catch(() => []),
    ]);
    const c = (cR && cR.content) || {};
    if(c.offers_eyebrow) $('#offers-eyebrow').textContent = c.offers_eyebrow;
    if(c.offers_title) $('#offers-title').textContent = c.offers_title;
    if(c.offers_subtitle) $('#offers-subtitle').textContent = c.offers_subtitle;
    if(c.offers_empty) $('#offers-empty').textContent = c.offers_empty;
    if(c.logo_text) $('#offers-logo').textContent = c.logo_text;
    if(fR && fR.rates){ RATES = fR.rates; CURRENCIES = fR.currencies || ['USD']; }
    CUR = detectCurrency();
    fillFx();
    OFFERS = Array.isArray(oR) ? oR : [];
    const waNum = String(c.whatsapp_number || '').replace(/\D/g, '');
    if(waNum){
      const wa = $('#offers-wa');
      wa.href = 'https://wa.me/' + waNum + '?text=' + encodeURIComponent('Hi Nexatech! I need a custom offer. What options do you have?');
      $('#offers-help')?.classList.remove('hidden');
    }
  }catch{}
  render();
})();
