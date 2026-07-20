/**
 * PHOTOBHOOH — v4 WebSocket-powered (no polling)
 * Socket.io for real-time sync, no cold start issues
 */
(function(){
  'use strict';

  const S = {
    code: null, userId: null, theme: 'classic', isHost: false,
    partnerConnected: false, currentPhoto: 0, totalPhotos: 4,
    photos: [null,null,null,null], myStream: null,
    capturing: false, sessionStarted: false, socket: null
  };

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

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
    toast: $('#toast'), themePartnerStatus: $('#themePartnerStatus')
  };

  // ── CONNECT SOCKET.IO ────────────────────────
  function connectSocket(){
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = window.location.origin;

      S.socket = io(url, {
        path: '/api/ws',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      S.socket.on('connect', () => {
        console.log('[ws] Connected:', S.socket.id);
        resolve();
      });

      S.socket.on('connect_error', (err) => {
        console.error('[ws] Connection error:', err.message);
      });

      S.socket.on('disconnect', (reason) => {
        console.log('[ws] Disconnected:', reason);
        showToast('Connection lost. Reconnecting...');
      });

      S.socket.on('reconnect', () => {
        console.log('[ws] Reconnected');
        showToast('Reconnected!');
        // Re-join room if we have a code
        if(S.code && S.userId){
          if(S.isHost){
            S.socket.emit('create-room', { code:S.code, userId:S.userId, theme:S.theme }, ()=>{});
          } else {
            S.socket.emit('join-room', { code:S.code, userId:S.userId }, ()=>{});
          }
        }
      });

      // ── REAL-TIME EVENTS ──────────────────────
      S.socket.on('partner-joined', ({ userId }) => {
        S.partnerConnected = true;
        updatePartnerStatus(true);
        showToast('🎀 Partner connected!');
        E.captureBtn.disabled = false;

        if(S.isHost){
          if(E.themePartnerStatus) E.themePartnerStatus.innerHTML = '<span class="status-connected">✓ Partner connected!</span>';
          if(E.startBtn){
            E.startBtn.disabled = false;
            E.startBtn.innerHTML = 'Start the session <span class="btn-arrow">▷</span>';
          }
          E.captureHint.textContent = 'Partner joined! Click start.';
        } else {
          E.captureHint.textContent = 'Connected! Waiting for host to start...';
        }
      });

      S.socket.on('partner-left', () => {
        S.partnerConnected = false;
        updatePartnerStatus(false);
        showToast('Partner disconnected');
        E.captureBtn.disabled = true;
        if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Partner left. Waiting...';
        E.captureHint.textContent = 'Partner disconnected...';
      });

      S.socket.on('room-state', ({ state, currentPhoto, theme, isHost }) => {
        S.theme = theme;
        if(currentPhoto !== undefined) S.currentPhoto = currentPhoto;
      });

      S.socket.on('session-started', ({ theme }) => {
        S.sessionStarted = true;
        S.theme = theme;
        E.themeSel.classList.add('hidden');
        E.camArea.classList.remove('hidden');
        E.captureBtn.disabled = false;
        E.captureHint.textContent = 'Session started! Tap to take a photo.';
      });

      S.socket.on('countdown', ({ photoIndex }) => {
        // Partner triggered countdown — both do it
        if(!S.capturing){
          startCountdown(photoIndex);
        }
      });

      S.socket.on('retake', () => {
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
        E.captureHint.textContent = 'Photo 1 of 4 — tap!';
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  // ── INIT ─────────────────────────────────────
  async function init(){
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

    // Connect WebSocket first
    try {
      await connectSocket();
    } catch(e) {
      console.error('Failed to connect:', e);
      showError('Could not connect to server. Please refresh.');
      return;
    }

    // Auto-join from URL hash
    const h = window.location.hash.slice(1);
    if(h && h.length >= 4){
      E.joinInput.value = h;
      joinRoom();
    }
  }

  // ── CREATE ROOM ──────────────────────────────
  async function createRoom(){
    try {
      hideError();
      setLoading(E.createBtn, 'Creating...');
      const code = generateCode();

      await new Promise((resolve, reject) => {
        S.socket.emit('create-room', { code, userId:S.userId, theme:S.theme }, (res) => {
          if(!res.ok) reject(new Error(res.error));
          else resolve(res);
        });
      });

      S.code = code;
      S.isHost = true;
      enterBooth();
    } catch(e){
      showError(e.message || 'Failed to create room');
      resetBtn(E.createBtn, 'Create a room');
    }
  }

  function generateCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for(let i=0; i<5; i++) code += chars[Math.floor(Math.random()*chars.length)];
    return code;
  }

  // ── JOIN ROOM ────────────────────────────────
  async function joinRoom(){
    const code = E.joinInput.value.trim().toUpperCase();
    if(!code || code.length < 4){ showError('Enter a valid room code'); return; }

    try {
      hideError();
      setLoading(E.joinBtn, 'Joining...');

      await new Promise((resolve, reject) => {
        S.socket.emit('join-room', { code, userId:S.userId }, (res) => {
          if(!res.ok) reject(new Error(res.error));
          else resolve(res);
        });
      });

      S.code = code;
      S.isHost = false;
      S.partnerConnected = true; // Host exists
      enterBooth();
    } catch(e){
      showError(e.message || 'Room not found');
      resetBtn(E.joinBtn, 'Join');
    }
  }

  // ── ENTER BOOTH ──────────────────────────────
  async function enterBooth(){
    showPage('booth');
    E.codeDisplay.textContent = S.code;
    window.history.replaceState(null, '', '#' + S.code);

    if(S.isHost){
      E.themeSel.style.display = '';
      E.camArea.classList.add('hidden');
      if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Waiting for partner to join...';
      if(E.startBtn){
        E.startBtn.disabled = true;
        E.startBtn.innerHTML = 'Waiting for partner... <span class="btn-arrow">▷</span>';
      }
      updatePartnerStatus(false);
    } else {
      E.themeSel.style.display = 'none';
      E.camArea.classList.remove('hidden');
      E.captureHint.textContent = 'Connected! Waiting for host to start...';
      updatePartnerStatus(true);
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
      showError('Camera access required. Please allow camera and refresh.');
    }
  }

  // ── START SESSION (host) ─────────────────────
  function startSession(){
    E.themeSel.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    S.sessionStarted = true;
    S.socket.emit('start-session', { code:S.code, theme:S.theme });
    E.captureBtn.disabled = false;
    E.captureHint.textContent = 'Tap to take the first photo!';
  }

  // ── CAPTURE ──────────────────────────────────
  function capturePhoto(){
    if(S.capturing || !S.partnerConnected || S.currentPhoto >= S.totalPhotos) return;
    S.capturing = true;
    E.captureBtn.disabled = true;

    // Both sides trigger countdown simultaneously
    S.socket.emit('start-countdown', { code:S.code, photoIndex:S.currentPhoto });
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
      if(count > 0){
        E.countNum.textContent = count;
        animate();
      } else {
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

    if(S.currentPhoto >= S.totalPhotos){
      S.socket.emit('strip-complete', { code:S.code });
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
    S.currentPhoto = 0;
    S.photos = [null,null,null,null];
    S.capturing = false;
    S.socket.emit('retake', { code:S.code });
  }

  // ── LEAVE ────────────────────────────────────
  function leaveRoom(){
    if(S.myStream) S.myStream.getTracks().forEach(t => t.stop());
    if(S.socket) S.socket.disconnect();
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
