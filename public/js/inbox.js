import { setupDmPush } from './push.js';
import { createCallController } from './call.js?v=3';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const TOKEN_KEY = 'dm_owner_session_token';

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
  conversations: [],
  filter: '',
  activeId: null,
  active: null,
  messages: new Map(),
  lastId: 0,
  lastDay: '',
  stream: null,
  pollTimer: null,
  readTimer: null,
  sending: false,
  side: 'owner'
};

const els = {
  auth: $('#inbox-auth'),
  app: $('#inbox-app'),
  passForm: $('#inbox-passcode-form'),
  passcode: $('#inbox-passcode'),
  authError: $('#inbox-auth-error'),
  unlock: $('#inbox-unlock'),
  setupNote: $('#inbox-setup-note'),
  list: $('#inbox-list'),
  count: $('#inbox-count'),
  search: $('#inbox-search'),
  lock: $('#inbox-lock'),
  shell: $('#inbox-app'),
  threadHead: $('#inbox-thread-head'),
  clientName: $('#inbox-client-name'),
  clientMeta: $('#inbox-client-meta'),
  clientAvatar: $('#inbox-client-avatar'),
  wa: $('#inbox-wa'),
  back: $('#inbox-back'),
  mainEmpty: $('#inbox-main-empty'),
  thread: $('#inbox-thread'),
  composer: $('#inbox-composer'),
  form: $('#inbox-form'),
  input: $('#inbox-input'),
  send: $('#inbox-send'),
  deleteBtn: $('#inbox-delete'),
  connection: $('#inbox-connection'),
  connectionText: $('#inbox-connection-text'),
  toast: $('#inbox-toast')
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
  role: 'owner',
  api,
  toast,
  basePath: '/api/dm/owner/calls/',
  startPath: (mode) => {
    const convId = state.activeId;
    if (!convId) return null;
    return { path: '/api/dm/owner/conversations/' + encodeURIComponent(convId) + '/call', body: { mode } };
  }
});

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
    if (icon) $('#inbox-favicon')?.setAttribute('href', icon);
  } catch {}
}

function showLock(message) {
  setHidden(els.auth, false);
  setHidden(els.app, true);
  els.shell?.classList.remove('thread-open');
  calls.stopWatching?.();
  disconnectStream();
  clearInterval(state.pollTimer);
  if (message) els.authError.textContent = message;
  setTimeout(() => els.passcode?.focus(), 80);
}

function showInbox() {
  setHidden(els.auth, true);
  setHidden(els.app, false);
}

async function checkConfigured() {
  try {
    const s = await api('/api/dm/owner/status');
    if (!s.configured) {
      if (els.setupNote) els.setupNote.hidden = false;
      if (els.unlock) els.unlock.disabled = true;
      if (els.passcode) els.passcode.disabled = true;
    }
  } catch {}
}

function toDate(value) {
  if (value instanceof Date) return value;
  let text = String(value || '');
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(text)) text = text.replace(' ', 'T') + 'Z';
  const d = new Date(text);
  return isNaN(d.getTime()) ? new Date(0) : d;
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
  if (status === 'pending') return 'Sent';
  if (status === 'accepted') return 'Accepted - awaiting payment';
  if (status === 'paid') return 'Paid';
  if (status === 'declined') return 'Declined';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'expired') return 'Expired';
  return status;
}

function startCall(mode) {
  if (!state.activeId) {
    toast('Select a conversation first.');
    return;
  }
  calls.start(mode);
}

function offerFormValues() {
  const extras = $$('.inbox-offer-extra-row').map((row) => ({
    label: row.querySelector('.offer-extra-label')?.value.trim() || '',
    price: row.querySelector('.offer-extra-price')?.value || ''
  })).filter((e) => e.label);
  return {
    description: $('#inbox-offer-description')?.value.trim() || '',
    amount: $('#inbox-offer-amount')?.value || '',
    delivery_days: $('#inbox-offer-delivery')?.value || '7',
    revisions: $('#inbox-offer-revisions')?.value || '1',
    extras,
    requirements_requested: $('#inbox-offer-requirements')?.checked ? 1 : 0,
    expires_in_days: $('#inbox-offer-expiry')?.value || '0'
  };
}

function fillOfferForm(template) {
  if (!template) return;
  const desc = $('#inbox-offer-description');
  if (desc) desc.value = template.description || '';
  const amount = $('#inbox-offer-amount');
  if (amount) amount.value = (Number(template.amount_cents || 0) / 100).toFixed(2);
  const delivery = $('#inbox-offer-delivery');
  if (delivery) delivery.value = String(template.delivery_days || 7);
  const revisions = $('#inbox-offer-revisions');
  if (revisions) revisions.value = template.revisions || '1';
  $$('.inbox-offer-extra-row').forEach((row, index) => {
    const extra = Array.isArray(template.extras) ? template.extras[index] : null;
    const label = row.querySelector('.offer-extra-label');
    const price = row.querySelector('.offer-extra-price');
    if (label) label.value = extra ? extra.label : '';
    if (price) price.value = extra ? (Number(extra.price_cents || 0) / 100).toFixed(2) : '';
  });
}

async function loadOfferTemplates(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const data = await api('/api/dm/owner/offer-templates');
    const templates = Array.isArray(data.templates) ? data.templates : [];
    select.innerHTML = '<option value="">Start from scratch</option>';
    templates.forEach((template) => {
      const option = document.createElement('option');
      option.value = String(template.id);
      option.textContent = template.name;
      option.dataset.template = JSON.stringify(template);
      select.appendChild(option);
    });
  } catch {}
}

function openOfferModal() {
  if (!state.activeId) return toast('Open a conversation first.');
  const modal = $('#inbox-offer-modal');
  if (!modal) return;
  const error = $('#inbox-offer-error');
  if (error) error.textContent = '';
  const form = $('#inbox-offer-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    $('#inbox-offer-template')?.addEventListener('change', (e) => {
      const option = e.target.selectedOptions[0];
      if (!option || !option.dataset.template) return;
      try { fillOfferForm(JSON.parse(option.dataset.template)); } catch {}
    });
    $('#inbox-offer-save-template')?.addEventListener('click', async () => {
      const values = offerFormValues();
      const name = prompt('Template name:', values.description.slice(0, 40) || 'My offer');
      if (!name) return;
      try {
        await api('/api/dm/owner/offer-templates', { method: 'POST', body: JSON.stringify({ ...values, name }) });
        await loadOfferTemplates('inbox-offer-template');
        toast('Template saved.');
      } catch (e) { toast(e.message); }
    });
  }
  loadOfferTemplates('inbox-offer-template');
  modal.classList.remove('dm-hidden');
  setTimeout(() => $('#inbox-offer-description')?.focus(), 80);
}

function closeOfferModal() {
  $('#inbox-offer-modal')?.classList.add('dm-hidden');
}

async function sendOffer() {
  const convId = state.activeId;
  if (!convId) return;
  const form = $('#inbox-offer-form');
  const error = $('#inbox-offer-error');
  const btn = $('#inbox-offer-send');
  if (!form) return;
  const values = offerFormValues();
  if (error) error.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    const data = await api('/api/dm/owner/conversations/' + encodeURIComponent(convId) + '/offers', {
      method: 'POST',
      body: JSON.stringify(values)
    });
    closeOfferModal();
    if (data.message && Number(state.activeId) === Number(convId)) addMessage(data.message, true);
    upsertConversation({
      ...(conversationById(convId) || {}),
      id: convId,
      last_message_at: new Date().toISOString(),
      last_message_preview: 'Custom offer - ' + (data.offer?.total_text || ''),
      last_sender: 'owner',
      owner_unread: 0
    });
    renderList();
    toast('Offer sent.');
    form.reset();
    $$('.inbox-offer-extra-row').forEach((row) => {
      row.querySelector('.offer-extra-label').value = '';
      row.querySelector('.offer-extra-price').value = '';
    });
  } catch (e) {
    if (error) error.textContent = e.message;
    else toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send offer';
  }
}

function offerElement(msg) {
  const offer = msg.offer;
  const status = offerStatus(offer);
  const extras = Array.isArray(offer.extras) ? offer.extras : [];
  const selected = new Set((offer.selected_extras || []).map(Number));

  const row = document.createElement('div');
  row.className = 'dm-row ' + (msg.sender === state.side ? 'mine' : 'theirs');
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
  price.textContent = money(offer.total_cents);
  const unit = document.createElement('small');
  unit.textContent = 'USD - one-time';
  price.appendChild(unit);

  const facts = document.createElement('div');
  facts.className = 'dm-offer-facts';
  const delivery = document.createElement('span');
  delivery.className = 'dm-offer-fact';
  delivery.textContent = (offer.delivery_days || 0) + ' day delivery';
  const revisions = document.createElement('span');
  revisions.className = 'dm-offer-fact';
  revisions.textContent = offer.revisions === 'unlimited' ? 'Unlimited revisions' : (offer.revisions || '0') + ' revision' + (Number(offer.revisions) === 1 ? '' : 's');
  facts.append(delivery, revisions);
  if (offer.expires_at && offer.status === 'pending') {
    const expires = document.createElement('span');
    expires.className = 'dm-offer-fact';
    expires.textContent = 'Expires ' + toDate(offer.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    facts.appendChild(expires);
  }
  if (offer.order_ref) {
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
      const item = document.createElement('div');
      item.className = 'dm-offer-extra';
      const check = document.createElement('span');
      check.className = 'dm-offer-check' + (selected.has(index) ? ' on' : '');
      check.textContent = selected.has(index) ? 'Yes' : 'No';
      const name = document.createElement('span');
      name.textContent = extra.label;
      const amount = document.createElement('b');
      amount.textContent = (extra.price_cents ? '+' : '') + money(extra.price_cents);
      item.append(check, name, amount);
      extraWrap.appendChild(item);
    });
    body.appendChild(extraWrap);
  }

  if (offer.requirements_text) {
    const req = document.createElement('div');
    req.className = 'dm-offer-requirements-saved';
    req.textContent = 'Client requirements: ' + offer.requirements_text;
    body.appendChild(req);
  }

  card.append(head, body);

  if (status === 'accepted') {
    const actions = document.createElement('div');
    actions.className = 'dm-offer-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'dm-btn dm-btn-ghost';
    copy.textContent = 'Copy payment link';
    copy.addEventListener('click', async () => {
      const link = location.origin + '/checkout?kind=dm&item=' + encodeURIComponent(offer.checkout_ref);
      try {
        await navigator.clipboard.writeText(link);
        toast('Payment link copied.');
      } catch {
        prompt('Copy this payment link:', link);
      }
    });
    actions.appendChild(copy);
    card.appendChild(actions);
  }

  if (status === 'pending' || status === 'accepted') {
    const actions = card.querySelector('.dm-offer-actions') || document.createElement('div');
    if (!actions.parentNode) {
      actions.className = 'dm-offer-actions';
      card.appendChild(actions);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dm-btn dm-btn-ghost dm-btn-danger';
    cancel.textContent = 'Cancel offer';
    cancel.addEventListener('click', async () => {
      if (!confirm('Cancel this custom offer? The client will be notified.')) return;
      cancel.disabled = true;
      try {
        const data = await api('/api/dm/offers/' + encodeURIComponent(offer.id) + '/cancel', { method: 'POST', body: '{}' });
        if (data.offer) applyOfferUpdate(data.offer);
        toast('Offer cancelled.');
      } catch (e) {
        toast(e.message);
        cancel.disabled = false;
      }
    });
    actions.appendChild(cancel);
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

function listTime(value) {
  const d = toDate(value);
  if (!d.getTime()) return '';
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return timeLabel(d);
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
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
  const mine = msg.sender === state.side;
  const row = document.createElement('div');
  row.className = 'dm-row ' + (mine ? 'mine' : 'theirs');
  row.dataset.msgId = String(msg.id);
  const bubble = document.createElement('div');
  bubble.className = 'dm-bubble';
  bubble.textContent = msg.body || '';
  row.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'dm-meta';
  const time = document.createElement('span');
  time.textContent = timeLabel(date);
  meta.appendChild(time);
  if (mine) {
    const ticks = document.createElement('span');
    ticks.className = 'dm-ticks' + (msg.read_at ? ' seen' : '');
    ticks.textContent = msg.read_at ? '✓✓' : '✓';
    ticks.title = msg.read_at ? 'Read' : 'Sent';
    meta.appendChild(ticks);
  }
  row.appendChild(meta);
  return row;
}

function markOwnMessagesSeen() {
  let changed = false;
  state.messages.forEach((msg) => {
    if (msg.sender === state.side && !msg.read_at) {
      msg.read_at = new Date().toISOString();
      changed = true;
    }
  });
  if (!changed) return;
  els.thread?.querySelectorAll('.dm-row.mine[data-msg-id]').forEach((row) => {
    const ticks = row.querySelector('.dm-ticks');
    if (ticks) {
      ticks.textContent = '✓✓';
      ticks.title = 'Read';
      ticks.classList.add('seen');
    }
  });
}

function addMessage(msg, forceScroll) {
  if (!msg || !msg.id || state.messages.has(msg.id)) return;
  state.messages.set(msg.id, msg);
  if (msg.id > state.lastId) state.lastId = msg.id;

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
  if (forceScroll || shouldStick || msg.sender === state.side) scrollBottom(true);
  if (msg.sender === 'user' && state.activeId) markOwnerRead(state.activeId);
}

function renderAll(rows) {
  els.thread.replaceChildren();
  state.messages.clear();
  state.lastId = 0;
  state.lastDay = '';
  rows.forEach((msg) => addMessage(msg, false));
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

function conversationById(id) {
  return state.conversations.find((c) => Number(c.id) === Number(id)) || null;
}

function upsertConversation(conv) {
  if (!conv || !conv.id) return;
  const idx = state.conversations.findIndex((c) => Number(c.id) === Number(conv.id));
  if (idx >= 0) {
    state.conversations[idx] = { ...state.conversations[idx], ...conv };
  } else {
    state.conversations.push(conv);
  }
  state.conversations.sort((a, b) => toDate(b.last_message_at || b.created_at) - toDate(a.last_message_at || a.created_at));
}

function unreadTotal() {
  return state.conversations.reduce((n, c) => n + (Number(c.owner_unread) || 0), 0);
}

function renderList() {
  if (!els.list) return;
  const query = state.filter.trim().toLowerCase();
  const rows = state.conversations.filter((c) => {
    if (!query) return true;
    return [c.name, c.email, c.whatsapp, c.last_message_preview].some((v) => String(v || '').toLowerCase().includes(query));
  });

  els.list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'inbox-empty-list';
    empty.textContent = state.conversations.length
      ? 'No conversations match your search.'
      : 'No client conversations yet. New messages will appear here automatically.';
    els.list.appendChild(empty);
  }

  rows.forEach((conv) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'inbox-item' + (Number(conv.id) === Number(state.activeId) ? ' active' : '');
    item.setAttribute('role', 'listitem');

    const avatar = document.createElement('span');
    avatar.className = 'inbox-avatar';
    avatar.textContent = initials(conv.name, conv.email);

    const main = document.createElement('span');
    main.className = 'inbox-item-main';

    const top = document.createElement('span');
    top.className = 'inbox-item-top';
    const name = document.createElement('b');
    name.textContent = conv.name || conv.email || 'Client';
    const time = document.createElement('span');
    time.className = 'inbox-item-time';
    time.textContent = listTime(conv.last_message_at || conv.created_at);
    top.append(name, time);

    const preview = document.createElement('span');
    preview.className = 'inbox-item-preview';
    const prefix = conv.last_sender === 'owner' ? 'You: ' : '';
    preview.textContent = prefix + (conv.last_message_preview || 'No messages yet');

    main.append(top, preview);
    item.append(avatar, main);

    const unread = Number(conv.owner_unread) || 0;
    if (unread > 0 && Number(conv.id) !== Number(state.activeId)) {
      const badge = document.createElement('span');
      badge.className = 'inbox-unread';
      badge.textContent = unread > 9 ? '9+' : String(unread);
      item.appendChild(badge);
    }

    item.addEventListener('click', () => openConversation(conv.id));
    els.list.appendChild(item);
  });

  const total = unreadTotal();
  if (els.count) {
    els.count.textContent = total
      ? `${total} unread · ${state.conversations.length} chat${state.conversations.length === 1 ? '' : 's'}`
      : `${state.conversations.length} chat${state.conversations.length === 1 ? '' : 's'}`;
  }
  document.title = total ? `(${total}) Nexatech Inbox` : 'Nexatech Inbox';
}

async function refreshConversations(silent) {
  try {
    const data = await api('/api/dm/owner/conversations');
    state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
    renderList();
    setOnline(true);
    return true;
  } catch (e) {
    if (e.status === 401) {
      showLock('Your inbox session expired - unlock again.');
    } else if (!silent) {
      toast(e.message);
    }
    setOnline(false);
    return false;
  }
}

function setHeader(conv) {
  if (!conv) return;
  const user = conv.user || conv;
  const name = user.name || user.email || 'Client';
  if (els.clientName) els.clientName.textContent = name;
  if (els.clientMeta) {
    els.clientMeta.textContent = [user.email, user.whatsapp].filter(Boolean).join(' · ');
  }
  if (els.clientAvatar) els.clientAvatar.textContent = initials(user.name, user.email);
  const digits = String(user.whatsapp || '').replace(/[^\d]/g, '');
  if (els.wa) {
    if (digits.length >= 7) {
      els.wa.href = 'https://wa.me/' + digits;
      els.wa.classList.remove('dm-hidden');
    } else {
      els.wa.classList.add('dm-hidden');
    }
  }
  const open = (conv.status || 'open') === 'open';
  if (els.input) {
    els.input.disabled = !open;
    els.input.placeholder = open ? 'Reply as Nexatech...' : 'This conversation is closed';
  }
  if (els.send) els.send.disabled = !open;
}

function showThreadPanels() {
  setHidden(els.threadHead, false);
  setHidden(els.mainEmpty, true);
  setHidden(els.thread, false);
  setHidden(els.composer, false);
  els.shell?.classList.add('thread-open');
}

function resetThreadView() {
  state.activeId = null;
  state.active = null;
  state.messages.clear();
  state.lastId = 0;
  state.lastDay = '';
  if (els.thread) els.thread.innerHTML = '';
  setHidden(els.threadHead, true);
  setHidden(els.thread, true);
  setHidden(els.composer, true);
  setHidden(els.mainEmpty, false);
  els.shell?.classList.remove('thread-open');
}

async function deleteClient() {
  const id = state.activeId;
  if (!id) return;
  const conv = conversationById(id) || {};
  const name = conv.name || (conv.user && conv.user.name) || conv.email || 'this client';
  if (!confirm('Delete ' + name + ' and all messages/offers in this chat? This cannot be undone.')) return;
  if (els.deleteBtn) els.deleteBtn.disabled = true;
  try {
    await api('/api/dm/owner/conversations/' + encodeURIComponent(id), { method: 'DELETE' });
    try { if (calls.isActive()) calls.hangup(); } catch {}
    state.conversations = state.conversations.filter((c) => Number(c.id) !== Number(id));
    resetThreadView();
    renderList();
    toast('Client and conversation deleted.');
  } catch (e) {
    toast(e.message);
  } finally {
    if (els.deleteBtn) els.deleteBtn.disabled = false;
  }
}

async function openConversation(id) {
  state.activeId = Number(id);
  const conv = conversationById(id);
  if (conv) setHeader(conv);
  renderList();
  showThreadPanels();
  if (els.thread) els.thread.innerHTML = '';
  state.messages.clear();
  state.lastId = 0;
  state.lastDay = '';

  try {
    const data = await api('/api/dm/owner/conversations/' + encodeURIComponent(id) + '/messages');
    if (Number(state.activeId) !== Number(id)) return;
    state.active = data.conversation;
    setHeader(data.conversation);
    renderAll(Array.isArray(data.messages) ? data.messages : []);
    upsertConversation({ ...(conv || {}), id, owner_unread: 0, user: data.conversation.user });
    renderList();
    setTimeout(() => els.input?.focus(), 100);
  } catch (e) {
    if (e.status === 401) return showLock('Your inbox session expired - unlock again.');
    toast(e.message);
  }
}

async function refreshActive(silent) {
  if (!state.activeId) return;
  try {
    const data = await api('/api/dm/owner/conversations/' + encodeURIComponent(state.activeId) + '/messages');
    state.active = data.conversation;
    setHeader(data.conversation);
    (data.messages || []).forEach((msg) => addMessage(msg));
    applyOfferUpdates(data.offers);
    upsertConversation({ ...(conversationById(state.activeId) || {}), id: state.activeId, owner_unread: 0, user: data.conversation.user });
    renderList();
    setOnline(true);
  } catch (e) {
    if (e.status === 401) showLock('Your inbox session expired - unlock again.');
    else if (!silent) toast(e.message);
    setOnline(false);
  }
}

function markOwnerRead(convId) {
  clearTimeout(state.readTimer);
  state.readTimer = setTimeout(async () => {
    try { await api('/api/dm/owner/conversations/' + encodeURIComponent(convId) + '/read', { method: 'POST', body: '{}' }); } catch {}
  }, 600);
}

async function sendReply() {
  const body = els.input.value.trim();
  const convId = state.activeId;
  if (!body || !convId || state.sending) return;
  state.sending = true;
  els.send.disabled = true;
  try {
    const data = await api('/api/dm/owner/conversations/' + encodeURIComponent(convId) + '/messages', {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    if (Number(state.activeId) === Number(convId)) {
      els.input.value = '';
      autoGrow();
      if (data.message) addMessage(data.message, true);
    }
    upsertConversation({
      ...(conversationById(convId) || {}),
      id: convId,
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 140),
      last_sender: 'owner',
      owner_unread: 0
    });
    renderList();
  } catch (e) {
    if (e.status === 401) return showLock('Your inbox session expired - unlock again.');
    toast(e.message);
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

function setOnline(ok) {
  if (els.connection) els.connection.classList.toggle('offline', !ok);
  if (els.connectionText) els.connectionText.textContent = ok ? 'Live' : 'Reconnecting...';
}

function connectStream() {
  disconnectStream();
  if (typeof EventSource === 'undefined') return;
  try {
    const token = savedToken();
    const es = new EventSource('/api/dm/owner/stream' + (token ? '?token=' + encodeURIComponent(token) : ''));
    state.stream = es;
    es.addEventListener('ready', () => {
      setOnline(true);
      refreshConversations(true);
      refreshActive(true);
    });
    es.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data) return;
        const convId = Number(data.conversation_id);
        if (data.conversation) {
          upsertConversation({ ...data.conversation, owner_unread: convId === Number(state.activeId) ? 0 : data.conversation.owner_unread });
        }
        if (convId === Number(state.activeId)) {
          if (data.message) addMessage(data.message);
          if (data.message && data.message.sender === 'user') markOwnerRead(convId);
        } else if (data.message && data.message.sender === 'user') {
          const name = (conversationById(convId) || {}).name || 'a client';
          toast('New message from ' + name);
        }
        renderList();
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
    es.addEventListener('read', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || Number(data.conversation_id) === Number(state.activeId)) markOwnMessagesSeen();
      } catch {}
      setOnline(true);
    });
    es.addEventListener('conversation_deleted', (event) => {
      try {
        const data = JSON.parse(event.data);
        const id = Number(data && data.conversation_id);
        if (!id) return;
        state.conversations = state.conversations.filter((c) => Number(c.id) !== id);
        if (Number(state.activeId) === id) resetThreadView();
        renderList();
        toast('A client conversation was deleted.');
      } catch {}
    });
    ['call_ring', 'call_answered', 'call_declined', 'call_missed', 'call_ended', 'call_signal'].forEach((name) => {
      es.addEventListener(name, (event) => {
        try { calls.onEvent(name, JSON.parse(event.data)); } catch {}
        if (name === 'call_missed' || name === 'call_ended' || name === 'call_declined') {
          setTimeout(() => {
            refreshConversations(true);
            if (state.activeId) refreshActive(true);
          }, 700);
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

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refreshConversations(true);
    refreshActive(true);
  }, 20000);
}

function syncViewport() {
  const vv = window.visualViewport;
  const height = Math.round((vv ? vv.height : window.innerHeight) || window.innerHeight || document.documentElement.clientHeight || 0);
  if (height > 0) document.documentElement.style.setProperty('--dm-vh', height + 'px');
}
function scheduleViewportSync() {
  requestAnimationFrame(syncViewport);
}

function bind() {
  $$('.dm-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
    });
  });

  els.passForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passcode = els.passcode.value;
    if (!passcode) return;
    els.authError.textContent = '';
    els.unlock.disabled = true;
    els.unlock.textContent = 'Unlocking...';
    try {
      const data = await api('/api/dm/owner/login', { method: 'POST', body: JSON.stringify({ passcode }) });
      if (data.token) saveToken(data.token);
      els.passForm.reset();
      showInbox();
      const ok = await refreshConversations();
      if (!ok) return;
      connectStream();
      startPolling();
      calls.startWatching?.();
    } catch (err) {
      els.authError.textContent = err.message;
      if (err.status === 409 && els.setupNote) els.setupNote.hidden = false;
    } finally {
      els.unlock.disabled = false;
      els.unlock.textContent = 'Unlock inbox';
    }
  });

  els.lock?.addEventListener('click', async () => {
    els.lock.disabled = true;
    try { await api('/api/dm/owner/logout', { method: 'POST', body: '{}' }); } catch {}
    clearToken();
    calls.stopWatching?.();
    location.replace('/inbox');
  });

  els.search?.addEventListener('input', () => {
    state.filter = els.search.value;
    renderList();
  });

  els.back?.addEventListener('click', () => {
    els.shell?.classList.remove('thread-open');
  });

  $('#inbox-offer-btn')?.addEventListener('click', openOfferModal);
  $('#inbox-offer-close')?.addEventListener('click', closeOfferModal);
  $('#inbox-offer-cancel')?.addEventListener('click', closeOfferModal);
  $('#inbox-offer-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'inbox-offer-modal') closeOfferModal();
  });
  $('#inbox-offer-form')?.addEventListener('submit', (e) => { e.preventDefault(); sendOffer(); });
  $('#inbox-call-btn')?.addEventListener('click', () => startCall('voice'));
  $('#inbox-video-btn')?.addEventListener('click', () => startCall('video'));
  els.deleteBtn?.addEventListener('click', deleteClient);

  els.form?.addEventListener('submit', (e) => { e.preventDefault(); sendReply(); });
  els.input?.addEventListener('focus', () => {
    syncViewport();
    setTimeout(() => els.input?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 120);
    setTimeout(syncViewport, 320);
  });
  els.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendReply();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.activeId) {
      refreshConversations(true);
      refreshActive(true);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOfferModal();
  });

  window.addEventListener('pagehide', (e) => { if (e.persisted) return; calls.destroy(); disconnectStream(); });
}

async function boot() {
  bind();
  loadBrand();
  try {
    const me = await api('/api/dm/owner/me');
    if (me && me.token) saveToken(me.token);
    showInbox();
    setupDmPush({ role:'owner', button:$('#inbox-push-btn'), toast });
    await refreshConversations();
    connectStream();
    startPolling();
    calls.startWatching?.();
  } catch {
    showLock();
    checkConfigured();
  }
}

boot();
syncViewport();
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleViewportSync);
  window.visualViewport.addEventListener('scroll', scheduleViewportSync);
}
window.addEventListener('resize', scheduleViewportSync);
window.addEventListener('orientationchange', scheduleViewportSync);
