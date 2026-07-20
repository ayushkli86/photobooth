/**
 * PHOTOBHOOH — Main Application (Vercel-ready)
 * Uses API routes + polling instead of WebSocket
 */
(function(){
  'use strict';

  // ── STATE ────────────────────────────────────
  const S = {
    code: null, userId: null, theme: 'classic', isHost: false,
    partnerConnected: false, currentPhoto: 0, totalPhotos: 4,
    photos: [null,null,null,null], myStream: null,
    capturing: false, pollTimer: null, lastUpdate: 0
  };

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const API = '/api/room';

  // ── DOM ──────────────────────────────────────
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
    downloadBtn: $('#downloadBtn'), retakeBtn: $('#retakeBtn')
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

    // URL hash = room code
    const h = window.location.hash.slice(1);
    if(h && h.length>=4){
      E.joinInput.value = h;
      joinRoom();
    }

    // Generate unique userId
    S.userId = 'u_' + Math.random().toString(36).slice(2,10);
  }

  // ── API HELPER ───────────────────────────────
  async function api(body){
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await r.json();
  }

  // ── CREATE ROOM ──────────────────────────────
  async function createRoom(){
    try {
      hideError();
      E.createBtn.disabled = true;
      E.createBtn.innerHTML = 'Creating...';
      const res = await api({ action:'create', theme: S.theme, userId: S.userId });
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.isHost = true;
      enterBooth();
    } catch(e){
      showError(e.message || 'Failed to create room');
      E.createBtn.disabled = false;
      E.createBtn.innerHTML = 'Create a room <span class="btn-arrow">▷</span>';
    }
  }

  // ── JOIN ROOM ────────────────────────────────
  async function joinRoom(){
    const code = E.joinInput.value.trim().toUpperCase();
    if(!code || code.length<4){ showError('Enter a valid code'); return; }
    try {
      hideError();
      E.joinBtn.disabled = true;
      const res = await api({ action:'join', code, userId: S.userId });
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.theme = res.room.theme || 'classic';
      S.isHost = false;
      enterBooth();
    } catch(e){
      showError(e.message || 'Room not found');
      E.joinBtn.disabled = false;
    }
  }

  // ── ENTER BOOTH ──────────────────────────────
  async function enterBooth(){
    showPage('booth');
    E.codeDisplay.textContent = S.code;
    window.location.hash = S.code;

    // Theme selector only for host
    E.themeSel.style.display = S.isHost ? '' : 'none';
    $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme===S.theme));

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} }, audio:false
      });
      S.myStream = stream;
      E.myVideo.srcObject = stream;
    } catch(e){
      showError('Camera access required. Please allow camera and refresh.');
    }

    if(!S.isHost){
      // Guest waits for host to start
      E.captureHint.textContent = 'Waiting for host to start...';
    }
  }

  // ── START SESSION ────────────────────────────
  async function startSession(){
    E.themeSel.classList.add('hidden');
    E.camArea.classList.remove('hidden');

    if(S.isHost){
      await api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:0, userId:S.userId });
    }

    startPolling();
    E.captureBtn.disabled = false;
    E.captureHint.textContent = `Photo 1 of ${S.totalPhotos}`;
  }

  // ── POLLING ──────────────────────────────────
  function startPolling(){
    if(S.pollTimer) clearInterval(S.pollTimer);
    S.pollTimer = setInterval(pollRoom, 1500);
    pollRoom();
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
      if(S.partnerConnected !== wasConnected){
        updatePartnerStatus(S.partnerConnected);
        if(S.partnerConnected){
          E.captureBtn.disabled = false;
          E.captureHint.textContent = `Photo ${S.currentPhoto+1} of ${S.totalPhotos}`;
        }
      }

      // State changes
      if(room.state === 'shooting' && S.currentPhoto === 0 && !S.capturing){
        // Host started, trigger countdown for guest
        if(!S.isHost && S.partnerConnected){
          startCountdown(0);
        }
      }

      // Check if partner completed strip
      if(room.state === 'done' && S.currentPhoto < S.totalPhotos){
        // Both done
      }
    } catch(e){}
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
    E.countNum.style.animation='none';
    void E.countNum.offsetWidth;
    E.countNum.style.animation='countdown-pulse 0.5s ease-out';

    const iv = setInterval(async () => {
      count--;
      if(count > 0){
        E.countNum.textContent = count;
        E.countNum.style.animation='none';
        void E.countNum.offsetWidth;
        E.countNum.style.animation='countdown-pulse 0.5s ease-out';
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
    c.width = v.videoWidth||640; c.height = v.videoHeight||480;
    const ctx = c.getContext('2d');

    // Mirror selfie
    ctx.translate(c.width,0); ctx.scale(-1,1);
    ctx.drawImage(v,0,0,c.width,c.height);
    ctx.setTransform(1,0,0,1,0,0);

    // Apply theme filter
    const config = Assets.themes[S.theme];
    if(config && config.filter!=='none'){
      ctx.filter = config.filter;
      ctx.drawImage(c,0,0); ctx.filter='none';
    }

    const dataUrl = c.toDataURL('image/jpeg',0.92);
    S.photos[idx] = dataUrl;

    // Save to server
    api({ action:'save-photo', code:S.code, photoIndex:idx, imageData:dataUrl, userId:S.userId });

    updateProgress(idx);
    S.currentPhoto = idx + 1;
    S.capturing = false;

    if(S.currentPhoto >= S.totalPhotos){
      // Done!
      api({ action:'update-state', code:S.code, state:'done', userId:S.userId });
      setTimeout(showStrip, 800);
    } else {
      E.captureBtn.disabled = false;
      E.captureHint.textContent = `Photo ${S.currentPhoto+1} of ${S.totalPhotos}`;
    }
  }

  function updateProgress(idx){
    const dots = E.progress.querySelectorAll('.progress-dot');
    dots.forEach((d,i) => {
      d.classList.remove('done','active');
      if(i < idx) d.classList.add('done');
      else if(i === idx) d.classList.add('done');
      else if(i === idx+1) d.classList.add('active');
    });
  }

  // ── STRIP ────────────────────────────────────
  function showStrip(){
    E.camArea.classList.add('hidden');
    E.stripResult.classList.remove('hidden');

    const strip = Assets.generateStrip(S.photos, S.theme, {
      pw:280, ph:350, pad:16, gap:10, showLabel:true,
      labelText:'photobooth · 인생네컷', showStickers:true
    });

    E.stripCanvas.width = strip.width;
    E.stripCanvas.height = strip.height;
    E.stripCanvas.getContext('2d').drawImage(strip,0,0);
  }

  function downloadStrip(){
    const a = document.createElement('a');
    a.download = `photobooth-${S.theme}-${Date.now()}.png`;
    a.href = E.stripCanvas.toDataURL('image/png');
    a.click();
  }

  async function retake(){
    S.currentPhoto=0; S.photos=[null,null,null,null];
    S.capturing=false;
    $$('.progress-dot').forEach((d,i) => { d.classList.remove('done','active'); if(i===0) d.classList.add('active'); });
    E.stripResult.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    E.captureBtn.disabled = false;
    E.captureHint.textContent = `Photo 1 of ${S.totalPhotos}`;
    await api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:0, userId:S.userId });
  }

  // ── LEAVE ────────────────────────────────────
  async function leaveRoom(){
    if(S.pollTimer) clearInterval(S.pollTimer);
    if(S.myStream) S.myStream.getTracks().forEach(t=>t.stop());
    await api({ action:'leave', code:S.code, userId:S.userId });
    S.code=null; S.isHost=false; S.partnerConnected=false;
    S.currentPhoto=0; S.photos=[null,null,null,null];
    S.capturing=false;
    showPage('landing');
    window.location.hash='';
    E.createBtn.disabled=false;
    E.createBtn.innerHTML='Create a room <span class="btn-arrow">▷</span>';
    E.joinBtn.disabled=false;
  }

  // ── UTILS ────────────────────────────────────
  function showPage(p){ $$('.page').forEach(x=>x.classList.remove('active')); $(`#${p}`).classList.add('active'); }
  function showError(m){ E.error.textContent=m; E.error.classList.remove('hidden'); }
  function hideError(){ E.error.classList.add('hidden'); }
  function updatePartnerStatus(ok){
    E.partnerStatus.textContent = ok ? 'Connected!' : 'Waiting for partner...';
    E.partnerStatus.className = 'partner-status '+(ok?'connected':'waiting');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
