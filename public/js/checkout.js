// ============================================================
// Nexatech Checkout — plans + themes, Cryptomus crypto payment
// Flow: item preview -> buyer details -> POST /api/checkout/create ->
// redirect to Cryptomus payment_url -> poll order -> success/download.
// ============================================================
const $ = s => document.querySelector(s);
let ITEM = null, ORDER_REF = '', POLL_N = 0, POLL_TIMER = null, WA_NUM = '19283825389';
const VIEWS = ['co-loading', 'co-form-view', 'co-redirect-view', 'co-pending-view', 'co-success-view', 'co-error-view'];

function show(id){
  VIEWS.forEach(v => $('#' + v)?.classList.toggle('hidden', v !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function waLink(msg){ return 'https://wa.me/' + String(WA_NUM).replace(/\D/g, '') + '?text=' + encodeURIComponent(msg || ''); }
// Safe JSON reader: if the server returns HTML (old server without the new
// API routes, or a proxy error page), throw a human message instead of
// "Unexpected token '<', "<!DOCTYPE "... is not valid JSON".
async function readJson(res, label){
  const text = await res.text();
  try{ return JSON.parse(text); }
  catch{
    const where = label ? ' while loading ' + label : '';
    if(!res.ok && res.status === 404) throw new Error('Checkout API not found (HTTP 404)' + where + '. The server is running old code — restart it (or wait for redeploy) and refresh.');
    throw new Error('Server returned an unexpected response' + where + ' (HTTP ' + res.status + '). It may still be updating — wait a minute and refresh.');
  }
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
// API fetch with one automatic retry on gateway/proxy hiccups (502/503/504)
// or network blips — free-tier hosts sleep and the first request can fail
// while the server wakes up.
async function apiFetch(url, options, label){
  let res;
  try{
    res = await fetch(url, options);
  }catch(e){
    await sleep(4000);
    try{ res = await fetch(url, options); }
    catch(e2){ throw new Error('Could not reach the server' + (label ? ' while loading ' + label : '') + '. Check your connection and refresh.'); }
  }
  if(!res.ok && [502, 503, 504].includes(res.status)){
    await sleep(4000);
    try{ res = await fetch(url, options); }catch{}
  }
  return res;
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
  $('#co-pay-amount').textContent = ITEM.price_text || '';
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
async function createOrder(){
  const msg = $('#co-form-msg');
  msg.textContent = '';
  if(!validate()) return;
  const btn = $('#co-pay-btn');
  btn.disabled = true; btn.textContent = 'Creating secure payment…';
  try{
    const res = await apiFetch('/api/checkout/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: ITEM.kind, ref: ITEM.ref,
        name: $('#co-name').value.trim(),
        email: $('#co-email').value.trim(),
        whatsapp: $('#co-whatsapp').value.trim()
      })
    }, 'payment start');
    const j = await readJson(res, 'payment start');
    if(!res.ok) throw new Error(j.error || 'Could not start payment.');
    ORDER_REF = j.order_ref;
    if(j.payment_url){
      $('#co-redirect-ref').textContent = ORDER_REF;
      $('#co-pay-link').href = j.payment_url;
      show('co-redirect-view');
      try{ window.open(j.payment_url, '_blank', 'noopener'); }catch{}
      startPolling(j.payment_url);
      setTimeout(()=>{ if(!$('#co-pending-view').classList.contains('hidden') || !$('#co-redirect-view').classList.contains('hidden')){ /* stay */ } }, 0);
    } else {
      // Gateway not connected — order saved, hand off to WhatsApp
      showError((j.message || 'Payment gateway not connected yet.') + ' Your order ' + ORDER_REF + ' is saved — tap below and we will complete it with you.');
      $('#co-error-wa').href = waLink('Hi Nexatech! I just created order ' + ORDER_REF + ' (' + ITEM.name + ' ' + ITEM.price_text + '). How do I pay?');
    }
  }catch(e){
    msg.textContent = e.message || 'Something went wrong. Please try again.';
  }finally{
    btn.disabled = false; btn.innerHTML = 'Pay <span id="co-pay-amount">' + (ITEM.price_text || '') + '</span> →';
  }
}
function startPolling(paymentUrl){
  stopPolling(); POLL_N = 0;
  if(paymentUrl) $('#co-pending-pay').href = paymentUrl;
  POLL_TIMER = setInterval(async ()=>{
    POLL_N++;
    if(POLL_N > 100){ stopPolling(); return; }
    try{
      const r = await fetch('/api/checkout/order/' + encodeURIComponent(ORDER_REF));
      if(!r.ok) return;
      const o = await readJson(r, 'order status');
      if(o.status === 'paid'){ stopPolling(); showSuccess(o); }
      else if(o.status === 'failed' || o.status === 'expired'){
        stopPolling();
        showError('This payment ' + o.status + '. No money was taken. Please create a new order or chat with us.');
        $('#co-error-wa').href = waLink('Hi Nexatech! My order ' + ORDER_REF + ' ' + o.status + '. Please help.');
      }
    }catch{}
  }, 6000);
}
function stopPolling(){ if(POLL_TIMER){ clearInterval(POLL_TIMER); POLL_TIMER = null; } }
function showSuccess(o){
  $('#co-success-ref').textContent = o.order_ref;
  $('#co-success-email').textContent = '';
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
async function resumeByRef(ref){
  try{
    const r = await apiFetch('/api/checkout/order/' + encodeURIComponent(ref), {}, 'order details');
    if(!r.ok) throw new Error('Order not found.');
    const o = await readJson(r, 'order details');
    ORDER_REF = o.order_ref;
    if(o.status === 'paid'){ showSuccess(o); return; }
    if(o.status === 'failed' || o.status === 'expired'){
      showError('This payment ' + o.status + '. Please start a new checkout from the site.');
      return;
    }
    $('#co-pending-ref').textContent = o.order_ref;
    if(o.payment_url) $('#co-pending-pay').href = o.payment_url;
    else $('#co-pending-pay').style.display = 'none';
    show('co-pending-view');
    startPolling(o.payment_url || '');
  }catch{
    showError('We could not find that order. It may have expired — please check out again.');
  }
}
function goPending(){
  $('#co-pending-ref').textContent = ORDER_REF;
  const url = $('#co-pay-link').href;
  if(url && url !== '#') $('#co-pending-pay').href = url;
  show('co-pending-view');
}
(async function init(){
  $('#co-year').textContent = new Date().getFullYear();
  await loadSiteMeta();
  try{ fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'pageview', element_id: 'checkout', session_id: '', page_url: location.href, utm: {}, metadata: {} }) }).catch(()=>{}); }catch{}
  const q = new URLSearchParams(location.search);
  const ref = (q.get('ref') || '').trim();
  if(ref){ await resumeByRef(ref); return; }
  const kind = (q.get('kind') || '').trim(), item = (q.get('item') || '').trim();
  if(!kind || !item){ showError('Choose a plan or theme first, then come back to pay.'); return; }
  try{
    const r = await apiFetch('/api/checkout/item?kind=' + encodeURIComponent(kind) + '&ref=' + encodeURIComponent(item), {}, 'item details');
    const j = await readJson(r, 'item details');
    if(!r.ok) throw new Error(j.error || 'Item not available.');
    ITEM = j;
    fillSummary();
    show('co-form-view');
  }catch(e){
    showError(e.message);
  }
  $('#co-form')?.addEventListener('submit', e => { e.preventDefault(); createOrder(); });
  $('#co-iredirect-check')?.addEventListener('click', goPending);
  $('#co-pending-check')?.addEventListener('click', async ()=>{
    if(!ORDER_REF) return;
    try{
      const r = await fetch('/api/checkout/order/' + encodeURIComponent(ORDER_REF));
      const o = await readJson(r, 'order status');
      if(o.status === 'paid'){ stopPolling(); showSuccess(o); }
      else alert('Still waiting for payment. If you paid, give the network a few minutes.');
    }catch{ alert('Could not check status — try again in a moment.'); }
  });
})();
