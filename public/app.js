/**
 * PHOTOBHOOH v6 — WebRTC + DataChannel (Phase 1+2)
 * Partner video + instant sync via peer-to-peer connection
 */
(function(){
  'use strict';

  const S = {
    code: null, userId: null, theme: 'classic', isHost: false,
    partnerConnected: false, currentPhoto: 0, totalPhotos: 4,
    photos: [null,null,null,null], myStream: null,
    capturing: false, sessionStarted: false,
    // WebRTC
    pc: null, dc: null, partnerStream: null,
    signalingTimer: null, connectionTimer: null,
  };

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const API = '/api/room';

  const E = {
    landing: $('#landing'), booth: $('#booth'),
    createBtn: $('#createRoomBtn'), joinBtn: $('#joinRoomBtn'),
    joinInput: $('#joinCodeInput'), error: $('#errorMessage'),
    codeDisplay: $('#roomCodeDisplay'), partnerStatus: $('#partnerStatus'),
    leaveBtn: $('#leaveRoomBtn'), themeSel: $('#themeSelector'),
    startBtn: $('#startSessionBtn'), camArea: $('#cameraArea'),
    myVideo: $('#myVideo'), myCanvas: $('#myCanvas'),
    partnerVideo: $('#partnerVideo'), partnerPlaceholder: $('#partnerPlaceholder'),
    countdown: $('#countdownOverlay'), countNum: $('#countdownNumber'),
    flash: $('#flashEffect'), captureBtn: $('#captureBtn'),
    captureHint: $('#captureHint'), progress: $('#photoProgress'),
    stripResult: $('#stripResult'), stripCanvas: $('#stripCanvas'),
    downloadBtn: $('#downloadBtn'), retakeBtn: $('#retakeBtn'),
    toast: $('#toast'), themePartnerStatus: $('#themePartnerStatus')
  };

  // ── INIT ─────────────────────────────────────
  function init(){
    E.createBtn.addEventListener('click', createRoom);
    E.joinBtn.addEventListener('click', joinRoom);
    E.joinInput.addEventListener('keypress', e => { if(e.key==='Enter') joinRoom(); });
    E.leaveBtn.addEventListener('click', leaveRoom);
    E.startBtn.addEventListener('click', startSession);
    E.captureBtn.addEventListener('click', capturePhoto);
    E.downloadBtn.addEventListener('click', downloadStrip);
    E.retakeBtn.addEventListener('click', retake);

    $$('.theme-card').forEach(c => c.addEventListener('click', () => {
      $$('.theme-card').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      S.theme = c.dataset.theme;
    }));

    S.userId = 'u_' + Math.random().toString(36).slice(2,10);

    const h = window.location.hash.slice(1);
    if(h && h.length >= 4){
      E.joinInput.value = h;
      E.joinInput.focus();
    }
  }

  // ── CAMERA (must be called from user gesture) ─
  async function requestCamera(){
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} },
        audio: true
      });
      S.myStream = stream;
      E.myVideo.srcObject = stream;
      return true;
    } catch(e){
      console.warn('Camera denied:', e);
      return false;
    }
  }

  // ── API ──────────────────────────────────────
  async function api(body, retries = 2){
    for(let attempt = 0; attempt <= retries; attempt++){
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 10000);
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: c.signal
        });
        clearTimeout(t);
        return await r.json();
      } catch(e) {
        if(attempt === retries) return { ok: false, error: 'Network error' };
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // ── CREATE ROOM ──────────────────────────────
  function createRoom(){
    hideError();
    setLoading(E.createBtn, 'Creating...');
    requestCamera().then(() => {
      return api({ action:'create', theme: S.theme, userId: S.userId });
    }).then(res => {
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.isHost = true;
      enterBooth();
      // Host starts signaling immediately
      startWebRTC();
    }).catch(e => {
      showError(e.message || 'Failed to create room');
      resetBtn(E.createBtn, 'Create a room');
    });
  }

  // ── JOIN ROOM ────────────────────────────────
  function joinRoom(){
    const code = E.joinInput.value.trim().toUpperCase();
    if(!code || code.length < 4){ showError('Enter a valid room code'); return; }
    hideError();
    setLoading(E.joinBtn, 'Joining...');
    requestCamera().then(() => {
      return api({ action:'join', code, userId: S.userId });
    }).then(res => {
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.theme = res.room.theme || 'classic';
      S.isHost = false;
      enterBooth();
      // Guest starts signaling immediately
      startWebRTC();
    }).catch(e => {
      showError(e.message || 'Could not join room');
      resetBtn(E.joinBtn, 'Join');
    });
  }

  // ── ENTER BOOTH ──────────────────────────────
  function enterBooth(){
    showPage('booth');
    E.codeDisplay.textContent = S.code;
    window.history.replaceState(null, '', '#' + S.code);

    if(S.isHost){
      E.themeSel.style.display = '';
      E.camArea.classList.add('hidden');
      if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Waiting for partner...';
      if(E.startBtn){
        E.startBtn.disabled = true;
        E.startBtn.innerHTML = 'Waiting for partner... <span class="btn-arrow">▷</span>';
      }
      updatePartnerStatus(false);
    } else {
      E.themeSel.style.display = 'none';
      E.camArea.classList.remove('hidden');
      E.captureHint.textContent = 'Connecting...';
      updatePartnerStatus(false);
    }

    $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === S.theme));

    if(!S.myStream && E.partnerPlaceholder){
      E.partnerPlaceholder.innerHTML = '<div style="text-align:center;padding:20px"><p style="color:#888;margin-bottom:12px">Camera needed</p><button onclick="window.retryCamera()" class="btn btn-primary btn-small">Enable Camera</button></div>';
    }
  }

  // ════════════════════════════════════════════
  // WEBRTC — Peer-to-peer video + data
  // ════════════════════════════════════════════

  // ICE servers (free Google STUN)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  function startWebRTC(){
    S.pc = new RTCPeerConnection(iceServers);

    // Add local stream tracks
    if(S.myStream){
      S.myStream.getTracks().forEach(track => S.pc.addTrack(track, S.myStream));
    }

    // Receive partner's stream
    S.pc.ontrack = (event) => {
      S.partnerStream = event.streams[0];
      E.partnerVideo.srcObject = event.streams[0];
      if(E.partnerPlaceholder) E.partnerPlaceholder.style.display = 'none';
      E.partnerVideo.style.display = 'block';
      partnerConnected();
    };

    // ICE candidate handling
    S.pc.onicecandidate = (event) => {
      if(event.candidate){
        api({
          action: 'signal',
          code: S.code,
          userId: S.userId,
          type: 'candidate',
          data: event.candidate
        });
      }
    };

    // DataChannel for commands
    if(S.isHost){
      S.dc = S.pc.createDataChannel('booth');
      setupDataChannel();
      createOffer();
    } else {
      S.pc.ondatachannel = (event) => {
        S.dc = event.channel;
        setupDataChannel();
      };
      pollForOffer(); // Guest polls for host's offer
    }

    // Start polling for signals
    pollForSignals();
  }

  // ── HOST: Create offer ──────────────────────
  async function createOffer(){
    try {
      const offer = await S.pc.createOffer();
      await S.pc.setLocalDescription(offer);
      await api({
        action: 'signal',
        code: S.code,
        userId: S.userId,
        type: 'offer',
        data: { sdp: offer.sdp, type: offer.type }
      });
    } catch(e){
      console.error('createOffer error:', e);
    }
  }

  // ── GUEST: Poll for offer ───────────────────
  async function pollForOffer(){
    const maxTries = 20;
    for(let i = 0; i < maxTries; i++){
      try {
        const res = await api({
          action: 'get-signals',
          code: S.code,
          otherUserId: getOtherUserId() // host's userId
        });
        if(res.ok && res.signals){
          const offer = res.signals.find(s => s.type === 'offer');
          if(offer && offer.data){
            await S.pc.setRemoteDescription(new RTCSessionDescription(offer.data));
            const answer = await S.pc.createAnswer();
            await S.pc.setLocalDescription(answer);
            await api({
              action: 'signal',
              code: S.code,
              userId: S.userId,
              type: 'answer',
              data: { sdp: answer.sdp, type: answer.type }
            });
            return;
          }
        }
      } catch(e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
    console.warn('WebRTC: No offer received from host');
  }

  // ── Poll for signals (room-level queue) ────
  let lastSignalCheck = 0;

  async function pollForSignals(){
    if(S.signalingTimer) clearInterval(S.signalingTimer);
    S.signalingTimer = setInterval(async () => {
      if(!S.code || !S.pc) return;
      try {
        const res = await api({ action: 'get-signals', code: S.code });
        if(!res.ok || !res.signals) return;

        // Filter to new signals NOT from us
        const newSignals = res.signals.filter(s => s.ts > lastSignalCheck && s.from !== S.userId);

        for(const sig of newSignals){
          if(sig.type === 'candidate' && sig.data && S.pc.remoteDescription && S.pc.connectionState !== 'closed'){
            try { await S.pc.addIceCandidate(new RTCIceCandidate(sig.data)); } catch(e) {}
          }
          if(sig.type === 'offer' && sig.data && !S.pc.remoteDescription && !S.isHost){
            try {
              await S.pc.setRemoteDescription(new RTCSessionDescription(sig.data));
              const answer = await S.pc.createAnswer();
              await S.pc.setLocalDescription(answer);
              await api({
                action: 'signal', code: S.code, userId: S.userId,
                type: 'answer', data: { sdp: answer.sdp, type: answer.type }
              });
            } catch(e) {}
          }
          if(sig.type === 'answer' && sig.data && S.pc.remoteDescription?.type === 'offer'){
            try { await S.pc.setRemoteDescription(new RTCSessionDescription(sig.data)); } catch(e) {}
          }
        }

        if(newSignals.length > 0){
          lastSignalCheck = Date.now();
        }
      } catch(e) {}
    }, 1500);
  }

  function getOtherUserId(){ return null; } // Not needed with room-level queue

  // ── DATACHANNEL SETUP ───────────────────────
  function setupDataChannel(){
    if(!S.dc) return;
    S.dc.onopen = () => {
      console.log('DataChannel open');
    };
    S.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleDataChannelMessage(msg);
      } catch(e) {}
    };
    S.dc.onclose = () => {
      console.log('DataChannel closed');
    };
  }

  function sendDC(msg){
    if(S.dc && S.dc.readyState === 'open'){
      S.dc.send(JSON.stringify(msg));
    }
  }

  function handleDataChannelMessage(msg){
    switch(msg.type){
      case 'partner-ready':
        partnerConnected();
        break;
      case 'start-countdown':
        if(!S.capturing) startCountdown(msg.photoIndex);
        break;
      case 'session-started':
        S.sessionStarted = true;
        S.theme = msg.theme || S.theme;
        E.themeSel.classList.add('hidden');
        E.camArea.classList.remove('hidden');
        E.captureBtn.disabled = true;
        E.captureHint.textContent = 'Session started! Tap to take a photo.';
        E.captureBtn.disabled = false;
        break;
      case 'photo-captured':
        // Partner captured a photo (just for info)
        break;
      case 'retake':
        doRetake();
        break;
    }
  }

  // ── Partner connected ───────────────────────
  function partnerConnected(){
    S.partnerConnected = true;
    updatePartnerStatus(true);
    showToast('🎀 Partner connected!');

    // Send ready signal
    setTimeout(() => sendDC({ type: 'partner-ready' }), 500);

    if(S.isHost){
      if(E.themePartnerStatus) E.themePartnerStatus.innerHTML = '<span class="status-connected">✓ Partner connected!</span>';
      if(E.startBtn){
        E.startBtn.disabled = false;
        E.startBtn.innerHTML = 'Start the session <span class="btn-arrow">▷</span>';
      }
      E.captureHint.textContent = 'Partner joined! Click start.';
    } else {
      E.captureBtn.disabled = false;
      E.captureHint.textContent = 'Connected! Tap to take a photo.';
    }
  }

  // ── START SESSION ────────────────────────────
  function startSession(){
    E.themeSel.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    S.sessionStarted = true;
    sendDC({ type: 'session-started', theme: S.theme });
    E.captureBtn.disabled = false;
    E.captureHint.textContent = 'Tap to take the first photo!';
  }

  // ── CAPTURE ──────────────────────────────────
  function capturePhoto(){
    if(S.capturing || !S.partnerConnected || S.currentPhoto >= S.totalPhotos) return;
    S.capturing = true;
    E.captureBtn.disabled = true;
    // Send countdown command via WebRTC
    sendDC({ type: 'start-countdown', photoIndex: S.currentPhoto });
    startCountdown(S.currentPhoto);
  }

  function startCountdown(idx){
    let count = 3;
    E.countdown.classList.remove('hidden');
    E.countNum.textContent = count;
    const animate = () => {
      E.countNum.style.animation = 'none';
      void E.countNum.offsetWidth;
      E.countNum.style.animation = 'countdown-pulse 0.5s ease-out';
    };
    animate();
    const iv = setInterval(() => {
      count--;
      if(count > 0){ E.countNum.textContent = count; animate(); }
      else {
        clearInterval(iv);
        E.countdown.classList.add('hidden');
        E.flash.classList.add('active');
        setTimeout(() => E.flash.classList.remove('active'), 150);
        doCapture(idx);
      }
    }, 1000);
  }

  function doCapture(idx){
    const v = E.myVideo, c = E.myCanvas;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const config = Assets.themes[S.theme];
    if(config && config.filter !== 'none'){
      ctx.filter = config.filter; ctx.drawImage(c, 0, 0); ctx.filter = 'none';
    }

    S.photos[idx] = c.toDataURL('image/jpeg', 0.85);
    updateProgress(idx);
    S.currentPhoto = idx + 1;
    S.capturing = false;
    sendDC({ type: 'photo-captured', photoIndex: idx });

    if(S.currentPhoto >= S.totalPhotos){
      setTimeout(showStrip, 800);
    } else {
      E.captureBtn.disabled = false;
      E.captureHint.textContent = `Photo ${S.currentPhoto + 1} of ${S.totalPhotos} — tap!`;
    }
  }

  function updateProgress(idx){
    const dots = E.progress.querySelectorAll('.progress-dot');
    dots.forEach((d, i) => {
      d.classList.remove('done', 'active');
      if(i <= idx) d.classList.add('done');
      else if(i === idx + 1) d.classList.add('active');
    });
  }

  // ── STRIP ────────────────────────────────────
  function showStrip(){
    E.camArea.classList.add('hidden');
    E.stripResult.classList.remove('hidden');
    E.captureBtn.disabled = true;
    const strip = Assets.generateStrip(S.photos, S.theme, {
      pw:280, ph:350, pad:16, gap:10, showLabel:true,
      labelText:'photobooth · 인생네컷', showStickers:true
    });
    E.stripCanvas.width = strip.width;
    E.stripCanvas.height = strip.height;
    E.stripCanvas.getContext('2d').drawImage(strip, 0, 0);
  }

  function downloadStrip(){
    const a = document.createElement('a');
    a.download = `photobooth-${S.theme}-${Date.now()}.png`;
    a.href = E.stripCanvas.toDataURL('image/png');
    a.click();
  }

  function retake(){
    S.currentPhoto = 0; S.photos = [null,null,null,null]; S.capturing = false;
    S.sessionStarted = true;
    sendDC({ type: 'retake' });
    doRetake();
  }

  function doRetake(){
    $$('.progress-dot').forEach((d, i) => { d.classList.remove('done','active'); if(i===0) d.classList.add('active'); });
    E.stripResult.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    E.captureBtn.disabled = false;
    E.captureHint.textContent = `Photo 1 of ${S.totalPhotos} — tap!`;
  }

  // ── LEAVE ────────────────────────────────────
  function leaveRoom(){
    if(S.signalingTimer) clearInterval(S.signalingTimer);
    if(S.pc){ S.pc.close(); S.pc = null; }
    if(S.myStream) S.myStream.getTracks().forEach(t => t.stop());
    api({ action:'leave', code:S.code, userId:S.userId });
    S.code = null; S.isHost = false; S.partnerConnected = false;
    S.currentPhoto = 0; S.photos = [null,null,null,null];
    S.capturing = false; S.sessionStarted = false;
    showPage('landing');
    window.history.replaceState(null, '', window.location.pathname);
    resetBtn(E.createBtn, 'Create a room');
    resetBtn(E.joinBtn, 'Join');
  }

  // ── UTILS ────────────────────────────────────
  function showPage(p){ $$('.page').forEach(x=>x.classList.remove('active')); $(`#${p}`).classList.add('active'); }
  function showError(m){ E.error.textContent = m; E.error.classList.remove('hidden'); }
  function hideError(){ E.error.classList.add('hidden'); }
  function updatePartnerStatus(ok){
    E.partnerStatus.textContent = ok ? '✓ Connected!' : 'Waiting for partner...';
    E.partnerStatus.className = 'partner-status ' + (ok ? 'connected' : 'waiting');
  }
  function showToast(msg, dur = 4000){
    if(!E.toast) return;
    E.toast.textContent = msg;
    E.toast.classList.add('show');
    setTimeout(() => E.toast.classList.remove('show'), dur);
  }
  function setLoading(btn, text){ btn.disabled = true; btn.textContent = text; }
  function resetBtn(btn, text){ btn.disabled = false; btn.innerHTML = text + ' <span class="btn-arrow">▷</span>'; }

  document.addEventListener('DOMContentLoaded', init);
})();

window.retryCamera = async function(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} },
      audio: true
    });
    document.querySelector('#myVideo').srcObject = stream;
    document.querySelector('#partnerPlaceholder').innerHTML = '<span>waiting for partner...</span>';
  } catch(e){
    alert('Camera access required. Allow camera in browser settings.');
  }
};
