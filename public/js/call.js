const $ = (sel, root = document) => root.querySelector(sel);

const RING_MS = 120000;
const POLL_MS = 1500;

export function createCallController({ role, api, toast, startPath, basePath }) {
  let call = null;
  let overlay = null;
  let els = null;
  let audioCtx = null;
  let ringTimer = null;
  let iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  let iceLoaded = false;

  function ensureAudioCtx() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch {
      return null;
    }
    return audioCtx;
  }
  document.addEventListener('pointerdown', ensureAudioCtx, { passive: true });

  function beep(kind) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      if (kind === 'ring') {
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(660, t + 0.18);
      } else {
        osc.frequency.setValueAtTime(440, t);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(kind === 'ring' ? 0.22 : 0.06, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ring' ? 0.5 : 0.6));
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    } catch {}
  }
  function startRingtone(kind) {
    stopRingtone();
    beep(kind);
    ringTimer = setInterval(() => beep(kind), kind === 'ring' ? 2200 : 3000);
  }
  function stopRingtone() {
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
  }
  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || [320, 180, 320]);
    } catch {}
  }

  function initialsOf(name) {
    const clean = String(name || 'Nexatech').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  function closeOverlay() {
    if (overlay) {
      try { overlay.remove(); } catch {}
      overlay = null;
    }
    els = null;
    document.body.classList.remove('dm-call-open');
  }

  function controlButton(label, kind, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dm-call-btn dm-call-btn-' + kind;
    btn.textContent = label;
    btn.addEventListener('click', handler);
    return btn;
  }

  function renderControls() {
    if (!els || !els.controls) return;
    const c = call;
    els.controls.replaceChildren();
    if (!c) return;
    if (c.status === 'ringing') {
      if (c.from === role) {
        els.controls.appendChild(controlButton('Cancel', 'end', () => hangup('Call cancelled')));
      } else {
        els.controls.appendChild(controlButton('Decline', 'decline', () => decline()));
        els.controls.appendChild(controlButton('Accept', 'accept', () => accept()));
      }
      return;
    }
    els.controls.appendChild(controlButton(c.muted ? 'Unmute' : 'Mute', 'mute', toggleMute));
    if (c.mode === 'video') {
      els.controls.appendChild(controlButton(c.cameraOff ? 'Camera on' : 'Camera off', 'camera', toggleCamera));
    }
    els.controls.appendChild(controlButton('End call', 'end', () => hangup()));
  }

  function buildOverlay(c) {
    closeOverlay();
    overlay = document.createElement('div');
    overlay.className = 'dm-call-overlay dm-call-native';
    overlay.id = 'dm-call-overlay';

    const stage = document.createElement('div');
    stage.className = 'dm-call-stage';

    const remote = document.createElement('div');
    remote.className = 'dm-call-remote';
    const remoteVideo = document.createElement('video');
    remoteVideo.className = 'dm-call-remote-video';
    remoteVideo.autoplay = true;
    remoteVideo.muted = true;
    remoteVideo.playsInline = true;
    const remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    const avatar = document.createElement('div');
    avatar.className = 'dm-call-avatar';
    const pulse = document.createElement('div');
    pulse.className = 'dm-call-pulse';
    const initials = document.createElement('span');
    initials.textContent = initialsOf(c.from === role ? (role === 'owner' ? 'Client' : 'Nexatech') : c.fromName);
    avatar.append(pulse, initials);
    remote.append(remoteVideo, remoteAudio, avatar);

    const top = document.createElement('div');
    top.className = 'dm-call-top';
    const name = document.createElement('b');
    name.className = 'dm-call-peer-name';
    name.textContent = c.from === role ? (role === 'owner' ? 'Client' : 'Nexatech') : (c.fromName || 'Nexatech');
    const status = document.createElement('span');
    status.className = 'dm-call-status';
    const timer = document.createElement('span');
    timer.className = 'dm-call-timer dm-hidden';
    timer.textContent = '00:00';
    top.append(name, status, timer);

    const self = document.createElement('div');
    self.className = 'dm-call-self';
    const localVideo = document.createElement('video');
    localVideo.className = 'dm-call-local-video';
    localVideo.autoplay = true;
    localVideo.playsInline = true;
    localVideo.muted = true;
    self.appendChild(localVideo);

    const controls = document.createElement('div');
    controls.className = 'dm-call-controls';

    stage.append(remote, top, self, controls);
    overlay.appendChild(stage);
    document.body.appendChild(overlay);
    document.body.classList.add('dm-call-open');

    els = { status, timer, controls, remoteVideo, remoteAudio, localVideo, avatar, self };
    renderControls();
    if (c.from === role) name.textContent = role === 'owner' ? 'Client' : 'Nexatech';
  }

  function setStatus(text) {
    if (els && els.status) els.status.textContent = text;
  }

  function startDuration(c) {
    if (!c || c.durationTimer || c.startedAt) return;
    c.startedAt = Date.now();
    if (els && els.timer) els.timer.classList.remove('dm-hidden');
    const tick = () => {
      if (!call || call !== c) return;
      const secs = Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000));
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      if (els && els.timer) els.timer.textContent = mm + ':' + ss;
    };
    tick();
    c.durationTimer = setInterval(tick, 1000);
  }

  function toggleMute() {
    const c = call;
    if (!c || !c.localStream) return;
    c.muted = !c.muted;
    c.localStream.getAudioTracks().forEach((t) => { t.enabled = !c.muted; });
    renderControls();
    toast(c.muted ? 'Microphone muted' : 'Microphone on');
  }

  function toggleCamera() {
    const c = call;
    if (!c || !c.localStream) return;
    c.cameraOff = !c.cameraOff;
    c.localStream.getVideoTracks().forEach((t) => { t.enabled = !c.cameraOff; });
    if (els && els.self) els.self.classList.toggle('dm-call-camera-off', c.cameraOff);
    renderControls();
  }

  async function getUserMedia(mode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Calling is not supported in this browser.');
    }
    const constraints = { audio: true, video: mode === 'video' ? { facingMode: 'user' } : false };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function loadIce() {
    if (iceLoaded) return;
    iceLoaded = true;
    try {
      const data = await api('/api/dm/ice');
      if (Array.isArray(data.iceServers) && data.iceServers.length) iceServers = data.iceServers;
    } catch {}
  }

  async function sendSignal(c, type, data) {
    try {
      await api(basePath + c.id + '/signal', { method: 'POST', body: JSON.stringify({ type, data }) });
    } catch {}
  }

  function attachLocalVideo(c) {
    if (els && els.localVideo && c.localStream) {
      els.localVideo.srcObject = c.localStream;
      if (c.mode === 'video') {
        els.localVideo.play().catch(() => {});
        if (overlay) overlay.classList.add('dm-call-video');
      }
    }
  }

  function playRemote() {
    if (els && els.remoteAudio) els.remoteAudio.play().catch(() => {});
    if (els && els.remoteVideo) els.remoteVideo.play().catch(() => {});
  }

  async function flushIce(c) {
    if (!c.pc) return;
    const pending = c.pendingIce.splice(0);
    for (const ice of pending) {
      try { await c.pc.addIceCandidate(new RTCIceCandidate(ice)); } catch {}
    }
  }

  function ensurePeer(c) {
    if (c.pc) return c.pc;
    const pc = new RTCPeerConnection({ iceServers });
    c.pc = pc;
    const stream = c.localStream || new MediaStream();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      if (event.streams && event.streams.length) {
        c.remoteStream = event.streams[0];
      } else {
        if (!c.remoteStream) c.remoteStream = new MediaStream();
        c.remoteStream.addTrack(event.track);
      }
      if (els && els.remoteVideo) els.remoteVideo.srcObject = c.remoteStream;
      if (els && els.remoteAudio) els.remoteAudio.srcObject = c.remoteStream;
      if (overlay && c.mode === 'video') overlay.classList.add('dm-call-video');
      playRemote();
      if (call === c) {
        setStatus('In call');
        startDuration(c);
      }
      stopRingtone();
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(c, 'ice', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
    };
    pc.onconnectionstatechange = () => {
      if (!call || call !== c) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        setStatus('In call');
        startDuration(c);
      } else if (state === 'failed') {
        toast('Call connection failed. Please try again.');
        hangup();
      } else if (state === 'disconnected') {
        setStatus('Reconnecting…');
      }
    };
    return pc;
  }

  async function makeOffer(c) {
    try {
      const pc = ensurePeer(c);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(c, 'offer', { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    } catch (e) {
      toast('Could not connect the call. Please try again.');
      hangup();
    }
  }

  async function handleSignal(packet) {
    const c = call;
    if (!c || !packet) return;
    if (packet.call && String(packet.call.id) !== String(c.id)) return;
    if (packet.from === role) return;
    if (packet.seq) {
      if (c.seen.has(packet.seq)) return;
      c.seen.add(packet.seq);
      if (packet.seq > c.seq) c.seq = packet.seq;
    }
    try {
      if (packet.type === 'offer') {
        const pc = ensurePeer(c);
        await pc.setRemoteDescription(new RTCSessionDescription(packet.data));
        await flushIce(c);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(c, 'answer', { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
        setStatus('Connecting…');
      } else if (packet.type === 'answer') {
        if (c.pc) {
          await c.pc.setRemoteDescription(new RTCSessionDescription(packet.data));
          await flushIce(c);
        }
      } else if (packet.type === 'ice') {
        if (c.pc && c.pc.remoteDescription) {
          try { await c.pc.addIceCandidate(new RTCIceCandidate(packet.data)); } catch {}
        } else {
          c.pendingIce.push(packet.data);
        }
      }
    } catch (e) {
      console.error('call signal failed', e);
    }
  }

  function applyRemoteStatus(info) {
    if (!call || !info) return;
    if (info.status === 'accepted' && call.status === 'ringing') {
      handleAnswered(info);
    } else if (info.status === 'declined') {
      endLocal('Call declined');
    } else if (info.status === 'missed') {
      endLocal('No answer');
    } else if (info.status === 'ended') {
      endLocal('Call ended');
    }
  }

  function endLocal(message) {
    const c = call;
    if (!c) return;
    call = null;
    stopRingtone();
    clearTimeout(c.ringTimer);
    clearInterval(c.durationTimer);
    clearInterval(c.pollTimer);
    try { if (c.pc) c.pc.close(); } catch {}
    (c.localStream ? c.localStream.getTracks() : []).forEach((track) => { try { track.stop(); } catch {} });
    (c.remoteStream ? c.remoteStream.getTracks() : []).forEach((track) => { try { track.stop(); } catch {} });
    closeOverlay();
    if (message) toast(message);
  }

  async function start(mode) {
    if (call) {
      toast('You are already in a call.');
      return;
    }
    const spec = typeof startPath === 'function' ? startPath(mode) : startPath;
    if (!spec) {
      toast('Select a conversation first.');
      return;
    }
    const want = mode === 'voice' ? 'voice' : 'video';
    let stream;
    try {
      stream = await getUserMedia(want);
    } catch {
      toast('Allow microphone' + (want === 'video' ? ' and camera' : '') + ' access to make a call.');
      return;
    }
    await loadIce();
    let data;
    try {
      data = await api(spec.path, { method: 'POST', body: JSON.stringify(spec.body || { mode: want }) });
    } catch (e) {
      stream.getTracks().forEach((track) => track.stop());
      toast(e.message);
      return;
    }
    const info = data.call || {};
    call = {
      id: info.id,
      mode: info.mode || want,
      from: info.from || role,
      fromName: info.from_name,
      status: 'ringing',
      incoming: false,
      localStream: stream,
      remoteStream: null,
      pc: null,
      seq: 0,
      seen: new Set(),
      pendingIce: [],
      durationTimer: null,
      pollTimer: null,
      ringTimer: null,
      startedAt: 0,
      muted: false,
      cameraOff: false
    };
    buildOverlay(call);
    attachLocalVideo(call);
    setStatus('Ringing…');
    startRingtone('ringback');
    startPolling();
    call.ringTimer = setTimeout(() => {
      if (call && call.status === 'ringing') hangup('No answer');
    }, RING_MS + 5000);
  }

  function beginIncoming(info) {
    call = {
      id: info.id,
      mode: info.mode || 'video',
      from: info.from,
      fromName: info.from_name,
      status: 'ringing',
      incoming: true,
      localStream: null,
      remoteStream: null,
      pc: null,
      seq: 0,
      seen: new Set(),
      pendingIce: [],
      durationTimer: null,
      pollTimer: null,
      ringTimer: null,
      startedAt: 0,
      muted: false,
      cameraOff: false
    };
    buildOverlay(call);
    setStatus('Incoming ' + (call.mode === 'voice' ? 'voice' : 'video') + ' call');
    startRingtone('ring');
    vibrate();
    startPolling();
    call.ringTimer = setTimeout(() => {
      if (call && call.status === 'ringing') decline('No answer');
    }, RING_MS + 3000);
  }

  async function accept() {
    const c = call;
    if (!c || c.status !== 'ringing' || c.from === role) return;
    let stream;
    try {
      stream = await getUserMedia(c.mode);
    } catch {
      toast('Allow microphone' + (c.mode === 'video' ? ' and camera' : '') + ' access to answer the call.');
      decline();
      return;
    }
    if (call !== c) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    c.localStream = stream;
    stopRingtone();
    vibrate(0);
    setStatus('Connecting…');
    attachLocalVideo(c);
    try {
      await loadIce();
      await api(basePath + c.id + '/answer', { method: 'POST', body: '{}' });
      c.status = 'accepted';
      clearTimeout(c.ringTimer);
      c.ringTimer = null;
      renderControls();
    } catch (e) {
      toast(e.message);
      endLocal(null);
    }
  }

  async function decline(message) {
    const c = call;
    if (!c) return;
    stopRingtone();
    vibrate(0);
    try { await api(basePath + c.id + '/decline', { method: 'POST', body: '{}' }); } catch {}
    endLocal(typeof message === 'string' ? message : null);
  }

  async function hangup(message) {
    const c = call;
    if (!c) return;
    stopRingtone();
    vibrate(0);
    try { await api(basePath + c.id + '/hangup', { method: 'POST', body: '{}' }); } catch {}
    endLocal(typeof message === 'string' ? message : (c.status === 'ringing' ? 'Call cancelled' : null));
  }

  function handleAnswered() {
    const c = call;
    if (!c) return;
    if (c.status === 'ringing') {
      c.status = 'accepted';
      clearTimeout(c.ringTimer);
      c.ringTimer = null;
      stopRingtone();
      setStatus('Connecting…');
      renderControls();
    }
    if (c.from === role && !c.offerStarted) {
      c.offerStarted = true;
      makeOffer(c);
    }
  }

  function startPolling() {
    const c = call;
    if (!c) return;
    clearInterval(c.pollTimer);
    const tick = async () => {
      if (!call || call !== c) return;
      try {
        const data = await api(basePath + c.id + '/events?after=' + c.seq);
        if (!call || call !== c) return;
        (data.signals || []).forEach(handleSignal);
        if (data.call) applyRemoteStatus(data.call);
      } catch (e) {
        if (e.status === 404) endLocal('Call ended');
      }
    };
    c.pollTimer = setInterval(tick, POLL_MS);
    tick();
  }

  function onEvent(event, data) {
    if (!data || !data.call) return;
    const info = data.call;
    if (event === 'call_ring') {
      if (info.from === role) return;
      if (!call) beginIncoming(info);
      else if (call.id !== info.id) {
        api(basePath + info.id + '/decline', { method: 'POST', body: '{}' }).catch(() => {});
      }
      return;
    }
    if (!call || String(call.id) !== String(info.id)) return;
    if (event === 'call_answered') handleAnswered();
    else if (event === 'call_signal') handleSignal(data);
    else if (event === 'call_declined') endLocal('Call declined');
    else if (event === 'call_missed') endLocal('No answer');
    else if (event === 'call_ended') endLocal('Call ended');
  }

  function destroy() {
    const c = call;
    if (!c) return;
    try {
      fetch(basePath + c.id + '/hangup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true
      }).catch(() => {});
    } catch {}
    endLocal(null);
  }

  return {
    start,
    onEvent,
    accept,
    decline,
    hangup,
    destroy,
    isActive: () => !!call
  };
}
