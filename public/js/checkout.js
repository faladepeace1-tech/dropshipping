// ============================================================
// Nexatech Checkout - plans + themes, Flutterwave INLINE card payment.
// Everything happens inside this page: details -> card form ->
// bank OTP/PIN (if required) -> success/download. No redirect, no popup.
// ============================================================
const $ = s => document.querySelector(s);
let ITEM = null, ORDER_REF = '', BUYER_EMAIL = '', OTP_MODE = 'otp', POLL_N = 0, POLL_TIMER = null, WA_NUM = '19283825389';
const VIEWS = ['co-loading', 'co-form-view', 'co-card-view', 'co-otp-view', 'co-redirect-view', 'co-pending-view', 'co-success-view', 'co-error-view'];

function show(id){
  VIEWS.forEach(v => $('#' + v)?.classList.toggle('hidden', v !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function waLink(msg){ return 'https://wa.me/' + String(WA_NUM).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg || ''); }
// Safe JSON reader: if the server returns HTML (proxy error page), throw a
// human message instead of "Unexpected token '<'...".
async function readJson(res, label){
  const text = await res.text();
  try{ return JSON.parse(text); }
  catch{
    const where = label ? ' while loading ' + label : '';
    if(!res.ok && res.status === 404) throw new Error('Checkout API not found (HTTP 404)' + where + '. The server is running old code - restart it (or wait for redeploy) and refresh.');
    throw new Error('Server returned an unexpected response' + where + ' (HTTP ' + res.status + '). It may still be updating - wait a minute and refresh.');
  }
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
// API fetch with 45s timeout + one retry on gateway hiccups.
async function apiFetch(url, options, label){
  options = options || {};
  async function once(timeoutMs){
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try{ return await fetch(url, { ...options, signal: ctl.signal }); }
    finally{ clearTimeout(t); }
  }
  let res;
  try{
    res = await once(45000);
  }catch(e){
    if(e && e.name === 'AbortError') throw new Error('The server took too long' + (label ? ' while loading ' + label : '') + ' (45s). It may be waking up - please refresh and try again.');
    await sleep(4000);
    try{ res = await once(45000); }
    catch(e2){
      if(e2 && e2.name === 'AbortError') throw new Error('The server took too long' + (label ? ' while loading ' + label : '') + ' (45s). Please refresh and try again.');
      throw new Error('Could not reach the server' + (label ? ' while loading ' + label : '') + '. Check your connection and refresh.');
    }
  }
  if(res && !res.ok && [502, 503, 504].includes(res.status)){
    await sleep(4000);
    try{ res = await once(45000); }catch{}
  }
  return res;
}
function postJson(url, body, label){
  return apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, label);
}
// Buyer currency: shared override with the homepage (nx_currency), else ?cc=
// test hook, else IP lookup, else browser locale, else USD. Server re-prices
// authoritatively - this only decides what we ASK for.
let BUY_CUR = 'USD';
const BUY_FX_COUNTRY = {NG:'NGN',US:'USD',GB:'GBP',UK:'GBP',GH:'GHS',KE:'KES',ZA:'ZAR',UG:'UGX',TZ:'TZS',RW:'RWF',CM:'XAF',CF:'XAF',TD:'XAF',CG:'XAF',GA:'XAF',GQ:'XAF',SN:'XOF',CI:'XOF',BF:'XOF',ML:'XOF',NE:'XOF',GW:'XOF',TG:'XOF',BJ:'XOF',MW:'MWK',EG:'EGP',SL:'SLE',ZM:'ZMW',CA:'CAD',IN:'INR',ET:'ETB',GN:'GNF',AU:'AUD',BR:'BRL',CO:'COP',MX:'MXN',PE:'PEN',SG:'SGD',AE:'AED',SA:'SAR',JP:'JPY',DE:'EUR',FR:'EUR',IT:'EUR',ES:'EUR',NL:'EUR',BE:'EUR',AT:'EUR',IE:'EUR',PT:'EUR',FI:'EUR',GR:'EUR',SK:'EUR',SI:'EUR',EE:'EUR',LV:'EUR',LT:'EUR',HR:'EUR',CY:'EUR',MT:'EUR',LU:'EUR'};
async function detectBuyCurrency(supported){
  const ok = c => c && supported && supported.includes(c);
  const qs = new URLSearchParams(location.search);
  // Explicit ?currency= from homepage links wins (same visit, same currency
  // the buyer just saw) and syncs the stored override.
  const cp = qs.get('currency');
  if(cp && ok(cp.toUpperCase())){
    try{ localStorage.setItem('nx_currency', cp.toUpperCase()); }catch{}
    return cp.toUpperCase();
  }
  try{ const s = String(localStorage.getItem('nx_currency') || '').toUpperCase(); if(ok(s)) return s; }catch{}
  const q = qs.get('cc');
  if(q && ok(q.toUpperCase())) return q.toUpperCase();
  try{
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('https://ipwho.is/', { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    if(j && j.success !== false && j.country_code){
      const c = BUY_FX_COUNTRY[String(j.country_code).toUpperCase()];
      if(ok(c)) return c;
    }
  }catch{}
  try{
    const m = String(navigator.language || '').match(/[-_]([A-Za-z]{2})$/);
    if(m){ const c = BUY_FX_COUNTRY[m[1].toUpperCase()]; if(ok(c)) return c; }
  }catch{}
  return 'USD';
}
async function buyCurrency(){
  let supported = null;
  try{
    const r = await fetch('/api/fx/rates');
    const j = await r.json();
    if(j && Array.isArray(j.currencies)) supported = j.currencies;
  }catch{}
  BUY_CUR = await detectBuyCurrency(supported || ['USD']);
  return BUY_CUR;
}
function setWaFallbacks(){
  $('#co-error-wa').href = waLink('Hi Nexatech! I need help with my checkout.');
}
async function loadSiteMeta(){
  try{
    const r = await fetch('/api/content');
    const j = await readJson(r, 'site info');
    if(j.content && j.content.whatsapp_number) WA_NUM = j.content.whatsapp_number;
  }catch{}
  setWaFallbacks();
}
function showError(msg){
  $('#co-error-msg').textContent = msg || 'Could not load this checkout.';
  show('co-error-view');
}
function fillSummary(){
  $('#co-item-kind').textContent = ITEM.kind === 'theme' ? 'Theme · Instant Download' : 'Launch Package';
  $('#co-item-name').textContent = ITEM.name || '';
  $('#co-item-desc').textContent = ITEM.description || '';
  $('#co-item-price').textContent = ITEM.price_text || '';
  const cn = $('#co-cur-note');
  if(cn) cn.textContent = 'One-time payment. No subscription.' + (ITEM.currency && ITEM.currency !== 'USD' ? ' You will be charged in ' + ITEM.currency + '.' : '');
  const img = $('#co-item-img');
  if(ITEM.preview_url){ img.src = ITEM.preview_url; img.alt = ITEM.name || ''; img.classList.remove('hidden'); }
  else img.classList.add('hidden');
  $('#co-title').textContent = ITEM.kind === 'theme' ? 'Get the "' + ITEM.name + '" Theme' : 'Get the ' + ITEM.name;
}
function validate(){
  let ok = true;
  const name = $('#co-name'), email = $('#co-email'), wa = $('#co-whatsapp');
  const mark = (el, valid) => { el.closest('.field')?.classList.toggle('invalid', !valid); if(!valid) ok = false; };
  mark(name, name.value.trim().length >= 2);
  mark(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
  mark(wa, /^\+?[0-9\s\-()]{7,20}$/.test(wa.value.trim()) && wa.value.replace(/\D/g, '').length >= 7);
  return ok;
}
// ---- Step 1: create the order, then show the inline card form ----
async function createOrder(){
  const msg = $('#co-form-msg');
  msg.textContent = '';
  if(!validate()) return;
  const btn = $('#co-pay-btn');
  btn.disabled = true; btn.textContent = 'Creating your order…';
  try{
    const res = await postJson('/api/checkout/create', {
      kind: ITEM.kind, ref: ITEM.ref, currency: BUY_CUR,
      name: $('#co-name').value.trim(),
      email: $('#co-email').value.trim(),
      whatsapp: $('#co-whatsapp').value.trim()
    }, 'order');
    const j = await readJson(res, 'order');
    if(!res.ok) throw new Error(j.error || 'Could not create order.');
    ORDER_REF = j.order_ref;
    BUYER_EMAIL = $('#co-email').value.trim();
    if(j.free){
      await finishPaid();
      return;
    }
    if(j.inline){
      showCardView();
    } else if(j.payment_url){
      $('#co-redirect-ref').textContent = ORDER_REF;
      $('#co-pay-link').href = j.payment_url;
      show('co-redirect-view');
      startPolling();
    } else {
      showError((j.message || 'Payment gateway not connected yet.') + ' Your order ' + ORDER_REF + ' is saved - tap below and we will complete it with you.');
      $('#co-error-wa').href = waLink((ITEM.wa_text || ('Hi Nexatech! I just created order ' + ORDER_REF + ' (' + ITEM.name + ' ' + ITEM.price_text + '). How do I pay?')) + ' [Order ' + ORDER_REF + ']');
    }
  }catch(e){
    msg.textContent = e.message || 'Something went wrong. Please try again.';
  }finally{
    btn.disabled = false; btn.textContent = 'Continue to Payment →';
  }
}
// ---- Step 2: inline card form ----
function showCardView(){
  $('#co-card-ref').textContent = ORDER_REF;
  $('#co-card-kind').textContent = ITEM.kind === 'theme' ? 'Theme · Instant Download' : 'Launch Package';
  $('#co-card-name').textContent = ITEM.name || '';
  $('#co-card-price').textContent = ITEM.price_text || '';
  const charge = ITEM.charge_text || ITEM.price_text || '';
  $('#co-card-amount').textContent = charge;
  const btn = $('#co-card-pay-btn');
  if(btn) btn.dataset.amount = charge;
  const fr = $('#co-frame');
  if(fr){ fr.src = 'about:blank'; delete fr.dataset.loaded; }
  switchPayTab('card');
  $('#co-card-msg').textContent = '';
  show('co-card-view');
}
function validateCard(){
  let ok = true;
  const num = $('#co-cc-num'), exp = $('#co-cc-exp'), cvc = $('#co-cc-cvc');
  const mark = (el, valid) => { el.closest('.field')?.classList.toggle('invalid', !valid); if(!valid) ok = false; };
  mark(num, num.value.replace(/\D/g, '').length >= 13 && num.value.replace(/\D/g, '').length <= 19);
  const d = exp.value.replace(/\D/g, '');
  const mm = d.slice(0, 2);
  mark(exp, /^(0[1-9]|1[0-2])$/.test(mm) && (d.length === 4 || d.length === 6));
  mark(cvc, /^\d{3,4}$/.test(cvc.value.trim()));
  return ok;
}
let LAST_CARD = null; // memory only: resent if the bank asks for PIN (never stored)
async function payWithCard(pin){
  const msg = $('#co-card-msg');
  msg.textContent = '';
  if(!pin && !validateCard()) return;
  const btn = $('#co-card-pay-btn');
  btn.disabled = true; btn.textContent = 'Processing payment…';
  try{
    const body = { order_ref: ORDER_REF };
    if(pin){ body.pin = pin; if(LAST_CARD) body.card = LAST_CARD; }
    else {
      body.card = { number: $('#co-cc-num').value, expiry: $('#co-cc-exp').value, cvc: $('#co-cc-cvc').value };
      LAST_CARD = body.card;
    }
    const res = await postJson('/api/checkout/flutterwave/charge', body, 'card payment');
    const j = await readJson(res, 'card payment');
    if(!res.ok) throw new Error(j.error || 'Card charge failed.');
    if(j.status === 'success'){
      await finishPaid();
    } else if(j.status === 'send_otp'){
      showOtpView('otp', j.message || 'Your bank sent a one-time code - enter it below to complete payment.');
    } else if(j.status === 'send_pin'){
      showOtpView('pin', j.message || 'Your card needs its PIN - enter it below to continue.');
    } else if(j.status === 'send_phone'){
      showError('Your bank needs phone verification. ' + (j.message || '') + ' Complete it, then return here and use “Check status”.');
    } else if(j.status === 'open_url' && j.url){
      $('#co-redirect-ref').textContent = ORDER_REF;
      $('#co-pay-link').href = j.url;
      show('co-redirect-view');
      try{ window.open(j.url, '_blank', 'noopener'); }catch{}
      startPolling();
    } else {
      const msgText = j.message || 'Card was declined. Try another card or contact your bank.';
      if(/rave v3/i.test(msgText)){
        // Direct card entry not enabled on this merchant - fall over to the
        // secure frame below, where the same card works today (same order).
        showWalletsFallback('Direct card entry is not enabled on this store yet - please complete with your card below instead (same order, same price).');
        return;
      }
      throw new Error(msgText);
    }
  }catch(e){
    msg.textContent = e.message || 'Payment failed. Please try again.';
  }finally{
    btn.disabled = false; btn.innerHTML = 'Pay <span id="co-card-amount">' + (btn.dataset.amount || ITEM.price_text || '') + '</span> →';
  }
}
// ---- Step 3 (if bank requires): OTP / PIN ----
function showOtpView(mode, desc){
  OTP_MODE = mode;
  $('#co-otp-spinner').style.display = 'none';
  if(mode === 'pin'){
    $('#co-otp-title').textContent = 'Enter your card PIN';
    $('#co-otp-label').textContent = 'Card PIN *';
    $('#co-otp-input').value = '';
    $('#co-otp-input').placeholder = '••••';
    $('#co-otp-input').maxLength = 12;
  } else {
    $('#co-otp-title').textContent = 'Enter your OTP';
    $('#co-otp-label').textContent = 'One-time code *';
    $('#co-otp-input').value = '';
    $('#co-otp-input').placeholder = '123456';
    $('#co-otp-input').maxLength = 12;
  }
  $('#co-otp-desc').textContent = desc;
  $('#co-otp-msg').textContent = '';
  show('co-otp-view');
  setTimeout(() => { try{ $('#co-otp-input').focus(); }catch{} }, 150);
}
async function submitOtp(){
  const msg = $('#co-otp-msg'), btn = $('#co-otp-btn'), input = $('#co-otp-input');
  const val = input.value.trim();
  if(!val){ msg.textContent = OTP_MODE === 'pin' ? 'Please enter your PIN.' : 'Please enter the code.'; return; }
  msg.textContent = '';
  btn.disabled = true; btn.textContent = 'Verifying…';
  $('#co-otp-spinner').style.display = 'block';
  try{
    const path = OTP_MODE === 'pin' ? '/api/checkout/flutterwave/pin' : '/api/checkout/flutterwave/otp';
    const key = OTP_MODE === 'pin' ? 'pin' : 'otp';
    const payload = { order_ref: ORDER_REF, [key]: val };
    if(OTP_MODE === 'pin' && LAST_CARD) payload.card = LAST_CARD; // FLW takes PIN with the charge
    const res = await postJson(path, payload, 'verification');
    const j = await readJson(res, 'verification');
    if(!res.ok) throw new Error(j.error || 'Verification failed.');
    if(j.status === 'success'){
      await finishPaid();
    } else if(j.status === 'send_otp'){
      showOtpView('otp', j.message || 'Enter the code your bank sent.');
    } else {
      throw new Error(j.message || 'Verification failed. Please try again.');
    }
  }catch(e){
    msg.textContent = e.message || 'Verification failed. Please try again.';
  }finally{
    btn.disabled = false; btn.textContent = 'Confirm Payment →';
    $('#co-otp-spinner').style.display = 'none';
  }
}
async function finishPaid(){
  const r = await apiFetch('/api/checkout/order/' + encodeURIComponent(ORDER_REF), {}, 'order status');
  const o = await readJson(r, 'order status');
  stopPolling();
  showSuccess(o);
}
// ---- Polling (3DS fallback / slow confirmations) ----
// Re-verifies LIVE with Flutterwave on every tick (not just our DB), so a
// completed bank-side payment flips to success even if the webhook is
// delayed or not configured yet.
function startPolling(){
  stopPolling(); POLL_N = 0;
  POLL_TIMER = setInterval(async ()=>{
    POLL_N++;
    if(POLL_N > 100){ stopPolling(); return; }
    try{
      let paid = false, failed = '', expired = false;
      try{
        const vr = await postJson('/api/checkout/flutterwave/verify', { order_ref: ORDER_REF }, 'payment check');
        const v = await readJson(vr, 'payment check');
        if(vr.ok && v.status === 'paid') paid = true;
      }catch{}
      const r = await fetch('/api/checkout/order/' + encodeURIComponent(ORDER_REF));
      if(!r.ok && !paid) return;
      const o = r.ok ? await readJson(r, 'order status') : null;
      if(paid || (o && o.status === 'paid')){
        stopPolling();
        showSuccess(o || { order_ref: ORDER_REF, kind: ITEM ? ITEM.kind : 'plan', item_name: ITEM ? ITEM.name : '' });
      }
      else if(o && (o.status === 'failed' || o.status === 'expired')){
        stopPolling();
        showError('This payment ' + o.status + '. No money was taken. Please create a new order or chat with us.');
        $('#co-error-wa').href = waLink('Hi Nexatech! My order ' + ORDER_REF + ' ' + o.status + '. Please help.');
      }
    }catch{}
  }, 8000);
}
function stopPolling(){ if(POLL_TIMER){ clearInterval(POLL_TIMER); POLL_TIMER = null; } }
function showSuccess(o){
  $('#co-success-ref').textContent = o.order_ref;
  $('#co-success-email').textContent = o.email || BUYER_EMAIL || '';
  if(o.kind === 'theme' && o.download_url){
    $('#co-download-wrap').classList.remove('hidden');
    $('#co-plan-wrap').classList.add('hidden');
    $('#co-download').href = o.download_url;
  } else {
    $('#co-plan-wrap').classList.remove('hidden');
    $('#co-download-wrap').classList.add('hidden');
    $('#co-plan-wa').href = waLink('Hi Nexatech! I just paid for the ' + o.item_name + ' (order ' + o.order_ref + '). What is the next step?');
  }
  show('co-success-view');
}
// ---- Resume: returning buyer re-checks live, or retries card ----
async function resumeByRef(ref){
  try{
    const vres = await postJson('/api/checkout/flutterwave/verify', { order_ref: ref }, 'payment check');
    const v = await readJson(vres, 'payment check');
    if(vres.ok && v.status === 'paid'){
      ORDER_REF = ref;
      const r = await apiFetch('/api/checkout/order/' + encodeURIComponent(ref), {}, 'order details');
      showSuccess(await readJson(r, 'order details'));
      return;
    }
  }catch{}
  try{
    const r = await apiFetch('/api/checkout/order/' + encodeURIComponent(ref), {}, 'order details');
    if(!r.ok) throw new Error('Order not found.');
    const o = await readJson(r, 'order details');
    ORDER_REF = o.order_ref;
    BUYER_EMAIL = o.email || '';
    if(o.status === 'paid'){ showSuccess(o); return; }
    if(o.status === 'failed' || o.status === 'expired'){
      showError('This payment ' + o.status + '. Please start a new checkout from the site.');
      return;
    }
    const ir = await apiFetch('/api/checkout/item?kind=' + encodeURIComponent(o.kind) + '&ref=' + encodeURIComponent(o.item_ref) + '&currency=' + encodeURIComponent(BUY_CUR), {}, 'item details');
    const ij = await readJson(ir, 'item details');
    if(!ir.ok) throw new Error(ij.error || 'Item not available.');
    ITEM = ij;
    showCardView();
  }catch{
    showError('We could not find that order. It may have expired - please check out again.');
  }
}
// ---- Payment method tabs: card | more (transfer, USSD, wallets in frame) ----
let PAY_TAB = 'card';
function switchPayTab(name){
  PAY_TAB = name;
  document.querySelectorAll('#co-pay-tabs .pill').forEach(p => p.classList.toggle('active', p.dataset.ptab === name));
  const panes = { card: '#co-card-form', more: '#co-pane-wallets' };
  ['#co-card-form', '#co-pane-wallets'].forEach(s => $(s)?.classList.add('hidden'));
  $(panes[name])?.classList.remove('hidden');
  if(name === 'more') loadPayFrame();
}
// Fallback target when a native channel is gated: show the all-channels
// frame with a contextual note (same order, same price).
function showWalletsFallback(note){
  switchPayTab('more');
  if(note) document.getElementById('co-wallet-note').textContent = note;
}
// Only genuine Flutterwave payment hosts may load in the frame - our own
// site (or anything else) is rejected so it can never nest inside itself.
function frameHostOk(u){
  try{
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)flutterwave\.com$/.test(x.hostname);
  }catch{ return false; }
}
// ---- All-channels embedded frame (Apple Pay, Google Pay, PayAttitude...) ----
async function loadPayFrame(){
  const msg = $('#co-frame-msg'), frame = $('#co-frame');
  if(!frame || !ORDER_REF) return;
  if(frame.dataset.loaded === ORDER_REF) return;
  msg.textContent = 'Loading secure options…';
  try{
    const res = await postJson('/api/checkout/flutterwave/link', { order_ref: ORDER_REF }, 'payment options');
    const j = await readJson(res, 'payment options');
    if(!res.ok) throw new Error(j.error || 'Could not load payment options.');
    if(j.paid){ await finishPaid(); return; }
    if(!frameHostOk(j.authorization_url)) throw new Error('Payment page unavailable - please use the card option or try again.');
    frame.src = j.authorization_url;
    frame.dataset.loaded = ORDER_REF;
    $('#co-frame-full').href = j.authorization_url;
    msg.textContent = '';
    startPolling(); // same order: webhook/verify flips us to success automatically
  }catch(e){
    msg.textContent = e.message || 'Could not load payment options.';
  }
}
function formatCardInputs(){
  const num = $('#co-cc-num');
  num?.addEventListener('input', ()=>{
    const d = num.value.replace(/\D/g, '').slice(0, 19);
    num.value = d.replace(/(.{4})/g, '$1 ').trim();
  });
  const exp = $('#co-cc-exp');
  exp?.addEventListener('input', ()=>{
    let d = exp.value.replace(/\D/g, '').slice(0, 6);
    exp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  });
  $('#co-cc-cvc')?.addEventListener('input', ()=>{
    const c = $('#co-cc-cvc');
    c.value = c.value.replace(/\D/g, '').slice(0, 4);
  });
  $('#co-otp-input')?.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); submitOtp(); } });
}
(async function init(){
  $('#co-year').textContent = new Date().getFullYear();
  await loadSiteMeta();
  try{ fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'pageview', element_id: 'checkout', session_id: '', page_url: location.href, utm: {}, metadata: {} }) }).catch(()=>{}); }catch{}
  formatCardInputs();
  $('#co-form')?.addEventListener('submit', e => { e.preventDefault(); createOrder(); });
  $('#co-card-form')?.addEventListener('submit', e => { e.preventDefault(); payWithCard(); });
  document.querySelectorAll('#co-pay-tabs .pill').forEach(p => p.addEventListener('click', () => switchPayTab(p.dataset.ptab)));
  $('#co-otp-btn')?.addEventListener('click', submitOtp);
  $('#co-iredirect-check')?.addEventListener('click', async ()=>{
    $('#co-pending-ref').textContent = ORDER_REF;
    show('co-pending-view');
    startPolling();
  });
  $('#co-pending-check')?.addEventListener('click', async ()=>{
    if(!ORDER_REF) return;
    try{
      const vres = await postJson('/api/checkout/flutterwave/verify', { order_ref: ORDER_REF }, 'payment check');
      const v = await readJson(vres, 'payment check');
      if(vres.ok && v.status === 'paid'){
        const r = await apiFetch('/api/checkout/order/' + encodeURIComponent(ORDER_REF), {}, 'order status');
        stopPolling(); showSuccess(await readJson(r, 'order status'));
      }
      else alert('Still waiting for payment. If you paid, give it a few minutes, then check again.');
    }catch{ alert('Could not check status - try again in a moment.'); }
  });
  const q = new URLSearchParams(location.search);
  await buyCurrency();
  const ref = (q.get('ref') || q.get('reference') || q.get('trxref') || '').trim();
  if(ref){ await resumeByRef(ref); return; }
  const kind = (q.get('kind') || '').trim(), item = (q.get('item') || '').trim();
  if(!kind || !item){ showError('Choose a plan or theme first, then come back to pay.'); return; }
  try{
    const r = await apiFetch('/api/checkout/item?kind=' + encodeURIComponent(kind) + '&ref=' + encodeURIComponent(item) + '&currency=' + encodeURIComponent(BUY_CUR), {}, 'item details');
    const j = await readJson(r, 'item details');
    if(!r.ok) throw new Error(j.error || 'Item not available.');
    ITEM = j;
    fillSummary();
    show('co-form-view');
  }catch(e){
    showError(e.message);
  }
})();
