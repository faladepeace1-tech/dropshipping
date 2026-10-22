import { setupDmPush, clearDmPush } from './push.js';
import { createCallController } from './call.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const TOKEN_KEY = 'dm_session_token';

function savedToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function saveToken(token) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

const state = {
  me: null,
  conversation: null,
  messages: new Map(),
  lastId: 0,
  lastDay: '',
  stream: null,
  pollTimer: null,
  readTimer: null,
  sending: false
};

const els = {
  auth: $('#dm-auth'),
  chat: $('#dm-chat'),
  emailForm: $('#dm-email-form'),
  emailInput: $('#dm-email'),
  emailError: $('#dm-email-error'),
  emailSubmit: $('#dm-email-submit'),
  thread: $('#dm-thread'),
  empty: $('#dm-empty'),
  form: $('#dm-form'),
  input: $('#dm-input'),
  send: $('#dm-send'),
  logout: $('#dm-logout'),
  connection: $('#dm-connection'),
  connectionText: $('#dm-connection-text'),
  toast: $('#dm-toast')
};

function toast(text) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove('show'), 3200);
}

let payOverlay = null;

function closePayment() {
  if (payOverlay) {
    try { payOverlay.remove(); } catch {}
    payOverlay = null;
  }
  document.body.classList.remove('dm-pay-open');
}

function openPayment(url) {
  if (!url) return;
  closePayment();
  const overlay = document.createElement('div');
  overlay.className = 'dm-pay-overlay';
  overlay.id = 'dm-pay-overlay';
  const head = document.createElement('div');
  head.className = 'dm-pay-head';
  const copy = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = 'Secure payment';
  const sub = document.createElement('small');
  sub.textContent = 'Card, bank transfer, USSD and wallets';
  copy.append(title, sub);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dm-pay-close';
  close.textContent = 'Close';
  close.addEventListener('click', closePayment);
  head.append(copy, close);
  const frame = document.createElement('iframe');
  frame.className = 'dm-pay-frame';
  frame.title = 'Secure payment';
  frame.allow = 'payment *; fullscreen *';
  frame.setAttribute('allowfullscreen', '');
  frame.src = url + (url.includes('?') ? '&' : '?') + 'embed=1';
  overlay.append(head, frame);
  document.body.appendChild(overlay);
  document.body.classList.add('dm-pay-open');
  payOverlay = overlay;
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data || {};
  if (data.type !== 'nexatech:paid') return;
  closePayment();
  toast('Payment received - thank you!');
  if (state.me) poll().then(() => markRead());
});

async function api(path, opts = {}) {
  let res;
  const token = savedToken();
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
      ...opts
    });
  } catch {
    throw new Error('Network error - check your connection and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function setHidden(el, hidden) {
  if (el) el.classList.toggle('dm-hidden', hidden);
}

const calls = createCallController({
  role: 'user',
  api,
  toast,
  basePath: '/api/dm/calls/',
  startPath: (mode) => ({ path: '/api/dm/call', body: { mode } })
});

function showAuth(message) {
  state.me = null;
  setHidden(els.auth, false);
  setHidden(els.chat, true);
  calls.stopWatching();
  disconnectStream();
  clearInterval(state.pollTimer);
  if (message && els.emailError) els.emailError.textContent = message;
  const saved = localStorage.getItem('dm_user_email') || '';
  if (els.emailInput && !els.emailInput.value) els.emailInput.value = saved;
}

async function loadBrand() {
  try {
    const b = await api('/api/brand');
    const name = String(b.logo_text || b.site_name || 'NEXATECH').trim();
    $$('[data-brand-name]').forEach((el) => { el.textContent = name.toUpperCase(); });
    $$('[data-brand-fallback]').forEach((el) => { el.textContent = (name[0] || 'N').toUpperCase(); });
    $$('[data-brand-logo]').forEach((img) => {
      const fallback = img.nextElementSibling;
      if (!b.logo_url) return;
      img.onload = () => { img.classList.remove('dm-hidden'); if (fallback) fallback.classList.add('dm-hidden'); };
      img.onerror = () => { img.classList.add('dm-hidden'); if (fallback) fallback.classList.remove('dm-hidden'); };
      img.src = b.logo_url;
    });
    const icon = b.favicon_url || b.logo_url;
    if (icon) $('#dm-favicon')?.setAttribute('href', icon);
    const wa = String(b.whatsapp_number || '').replace(/[^\d]/g, '');
    const waLink = $('#dm-wa-link');
    if (wa && waLink) {
      waLink.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Nexatech, I need help with my Messages account');
    }
  } catch {}
}

function showChat(user) {
  state.me = user;
  setHidden(els.auth, true);
  setHidden(els.chat, false);
  if (els.input) setTimeout(() => els.input.focus(), 80);
}

async function startChat() {
  await loadMessages();
  connectStream();
  startPolling();
  markRead();
}

async function enterChat(data) {
  if (data.token) saveToken(data.token);
  state.messages.clear();
  state.lastId = 0;
  state.lastDay = '';
  showChat(data.user);
  await startChat();
  calls.startWatching();
  setupDmPush({ role:'user', button:$('#dm-push-btn'), toast });
}

async function submitEmail() {
  const email = String(els.emailInput?.value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    els.emailError.textContent = 'Please enter a valid email address.';
    els.emailInput?.focus();
    return;
  }
  els.emailError.textContent = '';
  els.emailSubmit.disabled = true;
  els.emailSubmit.textContent = 'Opening chat...';
  try {
    const data = await api('/api/dm/email', { method: 'POST', body: JSON.stringify({ email }) });
    localStorage.setItem('dm_user_email', email);
    await enterChat(data);
  } catch (e) {
    els.emailError.textContent = e.message;
  } finally {
    els.emailSubmit.disabled = false;
    els.emailSubmit.textContent = 'Continue to chat';
  }
}

function toDate(value) {
  if (value instanceof Date) return value;
  let text = String(value || '');
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(text)) text = text.replace(' ', 'T') + 'Z';
  const d = new Date(text);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dayKey(date) {
  return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function money(cents) {
  return '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function offerStatus(offer) {
  if (offer.status === 'pending' && offer.expired) return 'expired';
  return offer.status || 'pending';
}

function offerStatusText(status) {
  if (status === 'accepted') return 'Accepted - pay to start';
  if (status === 'paid') return 'Paid';
  if (status === 'declined') return 'Declined';
  if (status === 'expired') return 'Expired';
  return 'Awaiting your response';
}

function startCall(mode) {
  if (!state.me) {
    toast('Enter your email to start chatting first.');
    return;
  }
  calls.start(mode);
}

function offerElement(msg) {
  const offer = msg.offer;
  const status = offerStatus(offer);
  const extras = Array.isArray(offer.extras) ? offer.extras : [];
  const selected = new Set((offer.selected_extras || []).map(Number));

  const row = document.createElement('div');
  row.className = 'dm-row ' + (msg.sender === 'user' ? 'mine' : 'theirs');
  row.dataset.offerId = String(offer.id);

  const card = document.createElement('div');
  card.className = 'dm-offer';

  const head = document.createElement('div');
  head.className = 'dm-offer-head';
  const title = document.createElement('b');
  title.textContent = 'Custom offer';
  const badge = document.createElement('span');
  badge.className = 'dm-offer-status ' + status;
  badge.textContent = offerStatusText(status);
  head.append(title, badge);

  const body = document.createElement('div');
  body.className = 'dm-offer-body';

  const description = document.createElement('div');
  description.className = 'dm-offer-desc';
  description.textContent = offer.description || '';

  const price = document.createElement('div');
  price.className = 'dm-offer-price';
  function paintPrice() {
    const total = Number(offer.amount_cents || 0) + [...selected].reduce((sum, i) => sum + (Number(extras[i]?.price_cents) || 0), 0);
    price.textContent = money(total);
    const unit = document.createElement('small');
    unit.textContent = 'USD - one-time';
    price.appendChild(unit);
  }
  paintPrice();

  const facts = document.createElement('div');
  facts.className = 'dm-offer-facts';
  const delivery = document.createElement('span');
  delivery.className = 'dm-offer-fact';
  delivery.textContent = (offer.delivery_days || 0) + ' day delivery';
  const revisions = document.createElement('span');
  revisions.className = 'dm-offer-fact';
  revisions.textContent = offer.revisions === 'unlimited' ? 'Unlimited revisions' : (offer.revisions || '0') + ' revision' + (Number(offer.revisions) === 1 ? '' : 's');
  facts.append(delivery, revisions);
  if (offer.expires_at && status === 'pending') {
    const expires = document.createElement('span');
    expires.className = 'dm-offer-fact';
    expires.textContent = 'Expires ' + toDate(offer.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    facts.appendChild(expires);
  }
  if (offer.status === 'paid' && offer.order_ref) {
    const order = document.createElement('span');
    order.className = 'dm-offer-fact';
    order.textContent = 'Order ' + offer.order_ref;
    facts.appendChild(order);
  }

  body.append(description, price, facts);

  if (extras.length) {
    const extraWrap = document.createElement('div');
    extraWrap.className = 'dm-offer-extras';
    extras.forEach((extra, index) => {
      const label = document.createElement('label');
      label.className = 'dm-offer-extra';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(index);
      check.disabled = status !== 'pending';
      check.addEventListener('change', () => {
        if (check.checked) selected.add(index); else selected.delete(index);
        paintPrice();
      });
      const name = document.createElement('span');
      name.textContent = extra.label;
      const amount = document.createElement('b');
      amount.textContent = (extra.price_cents ? '+' : '') + money(extra.price_cents);
      label.append(check, name, amount);
      extraWrap.appendChild(label);
    });
    body.appendChild(extraWrap);
  }

  let requirements = null;
  if (offer.requirements_requested && status === 'pending') {
    requirements = document.createElement('textarea');
    requirements.className = 'dm-offer-requirements';
    requirements.placeholder = 'Tell Nexatech what you need before you pay...';
    requirements.maxLength = 4000;
    requirements.rows = 3;
    const reqLabel = document.createElement('label');
    reqLabel.className = 'dm-offer-req-label';
    reqLabel.textContent = 'Project requirements';
    body.append(reqLabel, requirements);
  } else if (offer.requirements_text) {
    const req = document.createElement('div');
    req.className = 'dm-offer-requirements-saved';
    req.textContent = 'Your requirements: ' + offer.requirements_text;
    body.appendChild(req);
  }

  card.append(head, body);

  if (status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'dm-offer-actions';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'dm-btn dm-btn-primary';
    accept.textContent = 'Accept & pay';
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'dm-btn dm-btn-ghost';
    decline.textContent = 'Decline';
    accept.addEventListener('click', async () => {
      if (offer.requirements_requested && (!requirements || requirements.value.trim().length < 2)) {
        toast('Add your requirements before accepting.');
        requirements?.focus();
        return;
      }
      accept.disabled = true;
      decline.disabled = true;
      accept.textContent = 'Accepting...';
      try {
        const data = await api('/api/dm/offers/' + encodeURIComponent(offer.id) + '/accept', {
          method: 'POST',
          body: JSON.stringify({
            selected_extras: [...selected],
            requirements_text: requirements ? requirements.value.trim() : ''
          })
        });
        if (data.checkout_url) openPayment(data.checkout_url);
      } catch (e) {
        toast(e.message);
        accept.disabled = false;
        decline.disabled = false;
        accept.textContent = 'Accept & pay';
      }
    });
    decline.addEventListener('click', async () => {
      if (!confirm('Decline this offer?')) return;
      decline.disabled = true;
      try {
        const data = await api('/api/dm/offers/' + encodeURIComponent(offer.id) + '/decline', { method: 'POST', body: '{}' });
        if (data.offer) applyOfferUpdate(data.offer);
      } catch (e) {
        toast(e.message);
        decline.disabled = false;
      }
    });
    actions.append(accept, decline);
    card.appendChild(actions);
  } else if (status === 'accepted') {
    const actions = document.createElement('div');
    actions.className = 'dm-offer-actions';
    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = 'dm-btn dm-btn-primary';
    pay.textContent = 'Complete payment';
    pay.addEventListener('click', () => openPayment('/checkout?kind=dm&item=' + encodeURIComponent(offer.checkout_ref)));
    actions.appendChild(pay);
    card.appendChild(actions);
  }

  const meta = document.createElement('div');
  meta.className = 'dm-meta';
  meta.textContent = timeLabel(toDate(msg.created_at));
  row.append(card, meta);
  return row;
}

function callElement(msg) {
  const line = document.createElement('div');
  line.className = 'dm-system dm-call-note';
  const status = msg.meta && msg.meta.status;
  if (status === 'missed') line.classList.add('dm-call-note-missed');
  line.textContent = msg.body || 'Call';
  return line;
}

function nearBottom() {
  if (!els.thread) return true;
  return els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 140;
}

function scrollBottom(force) {
  if (!els.thread) return;
  if (force || nearBottom()) {
    requestAnimationFrame(() => { els.thread.scrollTop = els.thread.scrollHeight; });
  }
}

function messageElement(msg) {
  const date = toDate(msg.created_at);
  if (msg.kind === 'system') {
    const system = document.createElement('div');
    system.className = 'dm-system';
    system.textContent = msg.body || '';
    return system;
  }
  if (msg.kind === 'offer' && msg.offer) return offerElement(msg);
  if (msg.kind === 'call') return callElement(msg);
  const row = document.createElement('div');
  row.className = 'dm-row ' + (msg.sender === 'user' ? 'mine' : 'theirs');
  const bubble = document.createElement('div');
  bubble.className = 'dm-bubble';
  bubble.textContent = msg.body || '';
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'dm-meta';
  const time = document.createElement('span');
  time.textContent = timeLabel(date);
  meta.appendChild(time);
  if (msg.sender === 'user') {
    const ticks = document.createElement('span');
    ticks.textContent = msg.read_at ? '✓✓' : '✓';
    ticks.title = msg.read_at ? 'Read' : 'Delivered';
    meta.appendChild(ticks);
  }
  row.appendChild(meta);
  return row;
}

function addMessage(msg, forceScroll) {
  if (!msg || !msg.id || state.messages.has(msg.id)) return;
  state.messages.set(msg.id, msg);
  if (msg.id > state.lastId) state.lastId = msg.id;
  if (els.empty) els.empty.classList.add('dm-hidden');

  const date = toDate(msg.created_at);
  const key = dayKey(date);
  const shouldStick = nearBottom();
  if (key !== state.lastDay) {
    state.lastDay = key;
    const sep = document.createElement('div');
    sep.className = 'dm-day';
    sep.textContent = dayLabel(date);
    els.thread.appendChild(sep);
  }
  els.thread.appendChild(messageElement(msg));

  if (forceScroll || shouldStick || msg.sender === 'user') scrollBottom(true);
  if (msg.sender === 'owner' && document.visibilityState === 'visible') markRead();
}

function renderAll(rows) {
  els.thread.replaceChildren();
  if (els.empty) els.thread.appendChild(els.empty);
  state.messages.clear();
  state.lastId = 0;
  state.lastDay = '';
  rows.forEach((msg) => addMessage(msg, false));
  if (els.empty) els.empty.classList.toggle('dm-hidden', rows.length > 0);
  scrollBottom(true);
}

function applyOfferUpdate(offer) {
  applyOfferUpdates([offer]);
}

function applyOfferUpdates(offers) {
  if (!Array.isArray(offers) || !offers.length) return;
  const byId = new Map(offers.filter((o) => o && o.id).map((o) => [Number(o.id), o]));
  if (!byId.size) return;
  let changed = false;
  state.messages.forEach((msg) => {
    const oid = msg.offer && Number(msg.offer.id);
    if (oid && byId.has(oid)) {
      msg.offer = byId.get(oid);
      changed = true;
    }
  });
  if (changed) renderAll([...state.messages.values()]);
}

async function loadMessages() {
  const data = await api('/api/dm/messages');
  state.conversation = data.conversation || null;
  renderAll(Array.isArray(data.messages) ? data.messages : []);
  applyOfferUpdates(data.offers);
}

async function poll() {
  if (!state.me) return;
  try {
    const data = await api('/api/dm/messages?after=' + state.lastId);
    applyOfferUpdates(data.offers);
    (data.messages || []).forEach((msg) => addMessage(msg));
    setOnline(true);
  } catch (e) {
    if (e.status === 401) {
      disconnectStream();
      showAuth('Your session expired - please log in again.');
    } else {
      setOnline(false);
    }
  }
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') poll();
  }, 15000);
}

function setOnline(ok) {
  if (!els.connection || !els.connectionText) return;
  els.connection.classList.toggle('offline', !ok);
  els.connectionText.textContent = ok ? 'Connected' : 'Reconnecting...';
}

function connectStream() {
  disconnectStream();
  if (typeof EventSource === 'undefined') return;
  try {
    const token = savedToken();
    const es = new EventSource('/api/dm/stream' + (token ? '?token=' + encodeURIComponent(token) : ''));
    state.stream = es;
    es.addEventListener('ready', () => setOnline(true));
    es.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.message) addMessage(data.message);
        setOnline(true);
      } catch {}
    });
    es.addEventListener('offer', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.offer) applyOfferUpdate(data.offer);
        setOnline(true);
      } catch {}
    });
    ['call_ring', 'call_answered', 'call_declined', 'call_missed', 'call_ended', 'call_signal'].forEach((name) => {
      es.addEventListener(name, (event) => {
        try { calls.onEvent(name, JSON.parse(event.data)); } catch {}
        if (name === 'call_missed' || name === 'call_ended' || name === 'call_declined') {
          setTimeout(() => { if (state.me) poll(); }, 700);
        }
      });
    });
    es.onerror = () => setOnline(false);
  } catch {}
}

function disconnectStream() {
  if (state.stream) {
    try { state.stream.close(); } catch {}
    state.stream = null;
  }
}

function markRead() {
  clearTimeout(state.readTimer);
  state.readTimer = setTimeout(async () => {
    try { await api('/api/dm/messages/read', { method: 'POST', body: '{}' }); } catch {}
  }, 700);
}

async function sendMessage() {
  const body = els.input.value.trim();
  if (!body || state.sending) return;
  state.sending = true;
  els.send.disabled = true;
  try {
    const data = await api('/api/dm/messages', { method: 'POST', body: JSON.stringify({ body }) });
    els.input.value = '';
    autoGrow();
    if (data.message) addMessage(data.message, true);
    markRead();
  } catch (e) {
    if (e.status === 401) {
      showAuth('Your session expired - please log in again.');
    } else {
      toast(e.message);
    }
  } finally {
    state.sending = false;
    els.send.disabled = false;
    els.input.focus();
  }
}

function autoGrow() {
  if (!els.input) return;
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 132) + 'px';
}

function bind() {
  els.emailForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitEmail();
  });

  $('#dm-call-btn')?.addEventListener('click', () => startCall('voice'));
  $('#dm-video-btn')?.addEventListener('click', () => startCall('video'));

  els.form?.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
  els.input?.addEventListener('input', autoGrow);
  els.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.logout?.addEventListener('click', async () => {
    els.logout.disabled = true;
    try { await api('/api/dm/logout', { method: 'POST', body: '{}' }); } catch {}
    await clearDmPush();
    clearToken();
    try { localStorage.removeItem('dm_user_email'); } catch {}
    calls.stopWatching();
    closePayment();
    disconnectStream();
    clearInterval(state.pollTimer);
    location.replace('/messages');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.me) {
      poll();
      markRead();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && payOverlay) {
      e.preventDefault();
      closePayment();
    }
  });

  window.addEventListener('pagehide', (e) => { if (e.persisted) return; calls.destroy(); closePayment(); disconnectStream(); });
}

async function boot() {
  bind();
  loadBrand();
  const savedEmail = localStorage.getItem('dm_user_email') || '';
  if (els.emailInput && savedEmail) els.emailInput.value = savedEmail;
  try {
    const data = await api('/api/dm/me');
    await enterChat(data);
    return;
  } catch (e) {
    if (e.status === 401 && savedEmail) {
      try {
        const data = await api('/api/dm/email', { method: 'POST', body: JSON.stringify({ email: savedEmail }) });
        await enterChat(data);
        return;
      } catch {}
    }
    showAuth();
    if (e.status && e.status !== 401) toast(e.message);
  }
}

boot();
