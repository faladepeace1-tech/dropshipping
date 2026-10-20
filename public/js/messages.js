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

  window.addEventListener('pagehide', disconnectStream);

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
