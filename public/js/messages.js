const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
  signupForm: $('#dm-signup-form'),
  loginForm: $('#dm-login-form'),
  signupError: $('#dm-signup-error'),
  loginError: $('#dm-login-error'),
  tabSignup: $('#dm-tab-signup'),
  tabLogin: $('#dm-tab-login'),
  switchWrap: $('#dm-auth-switch'),
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

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
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

function setTab(which) {
  const login = which === 'login';
  els.tabSignup.classList.toggle('active', !login);
  els.tabLogin.classList.toggle('active', login);
  els.tabSignup.setAttribute('aria-selected', String(!login));
  els.tabLogin.setAttribute('aria-selected', String(login));
  setHidden(els.signupForm, login);
  setHidden(els.loginForm, !login);
  els.signupError.textContent = '';
  els.loginError.textContent = '';
  if (els.switchWrap) {
    if (login) {
      els.switchWrap.innerHTML = 'New to Nexatech? <a href="/messages" id="dm-switch-signup">Create an account</a>';
      const link = $('#dm-switch-signup');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setTab('signup'); });
    } else {
      els.switchWrap.innerHTML = 'Already have an account? <a href="/messages?login=1" id="dm-switch-login">Log in</a>';
      const link = $('#dm-switch-login');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setTab('login'); });
    }
  }
  const focus = login ? $('#dm-li-email') : $('#dm-su-name');
  if (focus) setTimeout(() => focus.focus(), 60);
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

function showAuth(message) {
  state.me = null;
  setHidden(els.auth, false);
  setHidden(els.chat, true);
  disconnectStream();
  clearInterval(state.pollTimer);
  if (message) {
    setTab('login');
    els.loginError.textContent = message;
  }
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

async function submitAuth(kind, form, errorEl) {
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = kind === 'signup' ? 'Creating account...' : 'Logging in...';
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const data = await api(kind === 'signup' ? '/api/dm/signup' : '/api/dm/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    state.messages.clear();
    state.lastId = 0;
    state.lastDay = '';
    showChat(data.user);
    await startChat();
  } catch (e) {
    errorEl.textContent = e.message;
    if (e.status === 409 && kind === 'signup') {
      const email = $('#dm-li-email');
      if (email) email.value = payload.email || '';
      setTab('login');
      els.loginError.textContent = e.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
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

function jitsiUrl(room, mode) {
  const safe = encodeURIComponent('nexatech-' + String(room || '').replace(/[^a-z0-9]/gi, ''));
  return 'https://meet.jit.si/' + safe + '#config.prejoinPageEnabled=false&config.disableDeepLinking=true'
    + '&config.startWithAudioMuted=false&config.startWithVideoMuted=' + (mode === 'voice' ? 'true' : 'false')
    + '&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_BRAND_WATERMARK=false';
}

function closeCallOverlay() {
  const overlay = $('#dm-call-overlay');
  if (!overlay) return;
  const frame = overlay.querySelector('iframe');
  if (frame) frame.src = 'about:blank';
  overlay.remove();
}

function openCallOverlay(mode, room) {
  closeCallOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'dm-call-overlay';
  overlay.id = 'dm-call-overlay';

  const bar = document.createElement('div');
  bar.className = 'dm-call-bar';
  const text = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = mode === 'voice' ? 'Voice call' : 'Video call';
  const sub = document.createElement('small');
  sub.textContent = 'Nexatech private call';
  text.append(title, sub);
  const end = document.createElement('button');
  end.type = 'button';
  end.className = 'dm-btn dm-btn-ghost';
  end.textContent = 'End call';
  end.addEventListener('click', closeCallOverlay);
  bar.append(text, end);

  const frame = document.createElement('iframe');
  frame.src = jitsiUrl(room, mode);
  frame.allow = 'camera; microphone; display-capture; autoplay; clipboard-write; fullscreen';
  frame.setAttribute('allowfullscreen', '');
  frame.title = title.textContent;

  overlay.append(bar, frame);
  document.body.appendChild(overlay);
}

async function startCall(mode) {
  if (!state.me) return;
  try {
    const data = await api('/api/dm/call', { method: 'POST', body: JSON.stringify({ mode }) });
    if (data.message) addMessage(data.message, true);
    openCallOverlay(data.mode || mode, data.room);
  } catch (e) {
    toast(e.message);
  }
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
    requirements.placeholder = 'Tell Ifeoluwa what you need before you pay...';
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
        if (data.checkout_url) location.href = data.checkout_url;
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
    const pay = document.createElement('a');
    pay.className = 'dm-btn dm-btn-primary';
    pay.href = '/checkout?kind=dm&item=' + encodeURIComponent(offer.checkout_ref);
    pay.textContent = 'Complete payment';
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
  const meta = msg.meta || {};
  const mode = meta.mode === 'voice' ? 'voice' : 'video';
  const row = document.createElement('div');
  row.className = 'dm-row ' + (msg.sender === 'user' ? 'mine' : 'theirs');
  const card = document.createElement('div');
  card.className = 'dm-call-card';
  const icon = document.createElement('span');
  icon.className = 'dm-call-icon';
  icon.innerHTML = mode === 'voice'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 11 6-4v10l-6-4"/></svg>';
  const text = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = mode === 'voice' ? 'Voice call started' : 'Video call started';
  const sub = document.createElement('small');
  sub.textContent = 'Tap join to enter the private room';
  text.append(title, sub);
  const join = document.createElement('button');
  join.type = 'button';
  join.className = 'dm-btn dm-btn-primary';
  join.textContent = 'Join';
  join.disabled = !meta.room;
  join.addEventListener('click', () => openCallOverlay(mode, meta.room));
  card.append(icon, text, join);
  const metaEl = document.createElement('div');
  metaEl.className = 'dm-meta';
  metaEl.textContent = timeLabel(toDate(msg.created_at));
  row.append(card, metaEl);
  return row;
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
  if (!offer || !offer.id) return;
  let changed = false;
  state.messages.forEach((msg) => {
    if (msg.offer && Number(msg.offer.id) === Number(offer.id)) {
      msg.offer = offer;
      changed = true;
    }
  });
  if (changed) renderAll([...state.messages.values()]);
}

async function loadMessages() {
  const data = await api('/api/dm/messages');
  state.conversation = data.conversation || null;
  renderAll(Array.isArray(data.messages) ? data.messages : []);
}

async function poll() {
  if (!state.me) return;
  try {
    const data = await api('/api/dm/messages?after=' + state.lastId);
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
    const es = new EventSource('/api/dm/stream');
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
  els.tabSignup?.addEventListener('click', () => setTab('signup'));
  els.tabLogin?.addEventListener('click', () => setTab('login'));

  $$('.dm-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  els.signupForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth('signup', els.signupForm, els.signupError);
  });
  els.loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth('login', els.loginForm, els.loginError);
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

  window.addEventListener('pagehide', () => { closeCallOverlay(); disconnectStream(); });

  const login = new URLSearchParams(location.search).get('login');
  setTab(login ? 'login' : 'signup');
}

async function boot() {
  bind();
  loadBrand();
  try {
    const data = await api('/api/dm/me');
    showChat(data.user);
    await startChat();
  } catch (e) {
    showAuth();
    if (e.status && e.status !== 401) toast(e.message);
  }
}

boot();
