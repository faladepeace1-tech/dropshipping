function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function clearDmPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {}
}

export async function setupDmPush({ role = 'user', button, toast = () => {} } = {}) {
  if (!button) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    button.classList.add('dm-hidden');
    return;
  }

  let registration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  } catch {
    button.classList.add('dm-hidden');
    return;
  }

  let publicKey = '';
  try {
    const res = await fetch('/api/dm/push/public-key', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || !data.key) throw new Error(data.error || 'Notifications are not ready.');
    publicKey = data.key;
  } catch {
    button.classList.add('dm-hidden');
    return;
  }

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const endpoint = role === 'owner' ? '/api/dm/owner/push/subscribe' : '/api/dm/push/subscribe';

  async function subscribe() {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'Could not enable notifications.');
    button.classList.add('is-on');
    button.setAttribute('aria-pressed', 'true');
    button.title = 'Message notifications are on';
    return subscription;
  }

  button.classList.remove('dm-hidden');
  if (Notification.permission === 'granted') {
    try { await subscribe(); } catch {}
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked in your browser settings.');
      }
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notifications were not enabled.');
      }
      await subscribe();
      toast('Message alerts are on.');
    } catch (e) {
      toast(e.message || 'Could not enable notifications.');
    } finally {
      button.disabled = false;
    }
  });
}
