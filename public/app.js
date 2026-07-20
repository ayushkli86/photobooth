/**
 * PHOTOBHOOH — Main Application (v3 — connection visibility fixed)
 *
 * All v2 fixes plus:
 * - Big toast notification when partner connects
 * - Partner status visible on theme selector page
 * - Mobile-friendly status indicators
 * - Host sees clear "Partner joined!" + can start session
 * - Guest sees big "Connected!" indicator
 */
(function(){
  'use strict';

  const S = {
    code: null, userId: null, theme: 'classic', isHost: false,
    partnerConnected: false, currentPhoto: 0, totalPhotos: 4,
    photos: [null,null,null,null], myStream: null,
    capturing: false, pollTimer: null, sessionStarted: false
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
    partnerPlaceholder: $('#partnerPlaceholder'),
    countdown: $('#countdownOverlay'), countNum: $('#countdownNumber'),
    flash: $('#flashEffect'), captureBtn: $('#captureBtn'),
    captureHint: $('#captureHint'), progress: $('#photoProgress'),
    stripResult: $('#stripResult'), stripCanvas: $('#stripCanvas'),
    downloadBtn: $('#downloadBtn'), retakeBtn: $('#retakeBtn'),
    // NEW elements
    toast: $('#toast'),
    themePartnerStatus: $('#themePartnerStatus')
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

    // Auto-join from URL hash
    const h = window.location.hash.slice(1);
    if(h && h.length >= 4){
      E.joinInput.value = h;
      joinRoom();
    }
  }

  // ── TOAST NOTIFICATION ───────────────────────
  function showToast(message, duration = 4000){
    if(!E.toast) return;
    E.toast.textContent = message;
    E.toast.classList.add('show');
    setTimeout(() => E.toast.classList.remove('show'), duration);
  }

  // ── API HELPER with retry ────────────────────
  async function api(body, retries = 2){
    for(let attempt = 0; attempt <= retries; attempt++){
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeout);
        return await r.json();
      } catch(e) {
        if(attempt === retries) {
          console.error('API failed:', e);
          return { ok: false, error: 'Network error' };
        }
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // ── CREATE ROOM ──────────────────────────────
  async function createRoom(){
    try {
      hideError();
      setLoading(E.createBtn, 'Creating...');
      const res = await api({ action:'create', theme: S.theme, userId: S.userId });
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.isHost = true;
      enterBooth();
    } catch(e){
      showError(e.message || 'Failed to create room');
      resetBtn(E.createBtn, 'Create a room');
    }
  }

  // ── JOIN ROOM ────────────────────────────────
  async function joinRoom(){
    const code = E.joinInput.value.trim().toUpperCase();
    if(!code || code.length < 4){ showError('Enter a valid room code'); return; }
    try {
      hideError();
      setLoading(E.joinBtn, 'Joining...');
      const res = await api({ action:'join', code, userId: S.userId });
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.theme = res.room.theme || 'classic';
      S.isHost = false;
      enterBooth();
    } catch(e){
      showError(e.message || 'Could not join room');
      resetBtn(E.joinBtn, 'Join');
    }
  }

  // ── ENTER BOOTH ──────────────────────────────
  async function enterBooth(){
    showPage('booth');
    E.codeDisplay.textContent = S.code;
    window.history.replaceState(null, '', '#' + S.code);

    if(S.isHost){
      // Host: show theme selector, hide camera for now
      E.themeSel.style.display = '';
      E.camArea.classList.add('hidden');
      // Show partner status on theme selector
      if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Waiting for partner to join...';
      if(E.startBtn) E.startBtn.disabled = true;
    } else {
      // Guest: skip theme selector, go straight to camera
      E.themeSel.style.display = 'none';
      E.camArea.classList.remove('hidden');
      E.captureHint.textContent = 'Connecting...';
    }

    $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === S.theme));

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} },
        audio: false
      });
      S.myStream = stream;
      E.myVideo.srcObject = stream;
    } catch(e){
      console.warn('Camera denied:', e);
      showError('Camera access is required. Please allow camera and refresh.');
    }

    // Start polling IMMEDIATELY
    startPolling();
  }

  // ── START SESSION (host clicks "Start") ──────
  async function startSession(){
    E.themeSel.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    S.sessionStarted = true;
    await api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:0, userId:S.userId });
    E.captureBtn.disabled = false;
    E.captureHint.textContent = 'Tap to take the first photo!';
  }

  // ── POLLING ──────────────────────────────────
  function startPolling(){
    if(S.pollTimer) clearInterval(S.pollTimer);
    pollRoom();
    S.pollTimer = setInterval(pollRoom, 3000);
  }

  async function pollRoom(){
    if(!S.code) return;
    try {
      const res = await api({ action:'get', code:S.code });
      if(!res.ok) return;
      const room = res.room;

      // Partner status
      const wasConnected = S.partnerConnected;
      S.partnerConnected = !!room.guest;

      if(S.partnerConnected && !wasConnected){
        // PARTNER JUST JOINED — big notification!
        updatePartnerStatus(true);
        showToast('🎀 Partner connected!');

        if(S.isHost){
          // Host: enable start button
          if(E.themePartnerStatus) E.themePartnerStatus.innerHTML = '<span class="status-connected">✓ Partner connected!</span>';
          if(E.startBtn){
            E.startBtn.disabled = false;
            E.startBtn.innerHTML = 'Start the session <span class="btn-arrow">▷</span>';
          }
          // If host already started session, enable capture
          if(S.sessionStarted){
            E.captureBtn.disabled = false;
            E.captureHint.textContent = 'Partner joined! Tap to take a photo.';
          }
        } else {
          // Guest: show connected status
          E.captureBtn.disabled = false;
          E.captureHint.textContent = 'Connected! Tap to take a photo.';
        }
      }

      // Host: detect if partner left
      if(!S.partnerConnected && wasConnected){
        updatePartnerStatus(false);
        showToast('Partner disconnected');
        E.captureBtn.disabled = true;
        if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Partner left. Waiting for new partner...';
        E.captureHint.textContent = 'Partner disconnected...';
      }

      // Guest: sync state from host
      if(room.state === 'shooting' && !S.sessionStarted && !S.isHost){
        S.sessionStarted = true;
        S.currentPhoto = room.currentPhoto || 0;
        E.camArea.classList.remove('hidden');
        E.captureBtn.disabled = false;
        E.captureHint.textContent = `Photo ${S.currentPhoto + 1} of ${S.totalPhotos}`;
      }

    } catch(e){
      // Silent fail for polling
    }
  }

  // ── CAPTURE ──────────────────────────────────
  function capturePhoto(){
    if(S.capturing || !S.partnerConnected || S.currentPhoto >= S.totalPhotos) return;
    S.capturing = true;
    E.captureBtn.disabled = true;

    if(S.isHost){
      api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:S.currentPhoto, userId:S.userId });
    }
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

    const iv = setInterval(async () => {
      count--;
      if(count > 0){
        E.countNum.textContent = count;
        animate();
      } else {
        clearInterval(iv);
        E.countdown.classList.add('hidden');
        E.flash.classList.add('active');
        setTimeout(() => E.flash.classList.remove('active'), 150);
        await doCapture(idx);
      }
    }, 1000);
  }

  async function doCapture(idx){
    const v = E.myVideo, c = E.myCanvas;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d');

    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const config = Assets.themes[S.theme];
    if(config && config.filter !== 'none'){
      ctx.filter = config.filter;
      ctx.drawImage(c, 0, 0);
      ctx.filter = 'none';
    }

    S.photos[idx] = c.toDataURL('image/jpeg', 0.85);
    updateProgress(idx);
    S.currentPhoto = idx + 1;
    S.capturing = false;

    api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:S.currentPhoto, userId:S.userId });

    if(S.currentPhoto >= S.totalPhotos){
      api({ action:'update-state', code:S.code, state:'done', userId:S.userId });
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

  async function retake(){
    S.currentPhoto = 0;
    S.photos = [null,null,null,null];
    S.capturing = false;
    S.sessionStarted = true;
    $$('.progress-dot').forEach((d, i) => {
      d.classList.remove('done', 'active');
      if(i === 0) d.classList.add('active');
    });
    E.stripResult.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    E.captureBtn.disabled = false;
    E.captureHint.textContent = `Photo 1 of ${S.totalPhotos} — tap!`;
    await api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:0, userId:S.userId });
  }

  // ── LEAVE ────────────────────────────────────
  async function leaveRoom(){
    if(S.pollTimer) clearInterval(S.pollTimer);
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
  function showPage(p){
    $$('.page').forEach(x => x.classList.remove('active'));
    $(`#${p}`).classList.add('active');
  }
  function showError(m){
    E.error.textContent = m;
    E.error.classList.remove('hidden');
  }
  function hideError(){ E.error.classList.add('hidden'); }
  function updatePartnerStatus(ok){
    E.partnerStatus.textContent = ok ? '✓ Connected!' : 'Waiting for partner...';
    E.partnerStatus.className = 'partner-status ' + (ok ? 'connected' : 'waiting');
  }
  function setLoading(btn, text){ btn.disabled = true; btn.textContent = text; }
  function resetBtn(btn, text){ btn.disabled = false; btn.innerHTML = text + ' <span class="btn-arrow">▷</span>'; }

  document.addEventListener('DOMContentLoaded', init);
})();
