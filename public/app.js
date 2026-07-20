/**
 * PHOTOBHOOH v9 — WebRTC video + Socket.io signaling
 *
 * Features:
 * - Live peer-to-peer video (no audio) via WebRTC
 * - Socket.io signaling via Render server
 * - Host-controlled capture (only host triggers countdown)
 * - Both users capture photos simultaneously
 * - Polling fallback if Socket.io unavailable
 * - Async Socket.io loading (no page blocking)
 */
(function(){
  'use strict';

  // ── CONFIG ──────────────────────────────────
  const SIGNALING_URL = 'https://photobooth-signaling.onrender.com';

  const S = {
    code: null, userId: null, theme: 'classic', isHost: false,
    partnerConnected: false, currentPhoto: 0, totalPhotos: 4,
    photos: [null,null,null,null], // MY photos
    partnerPhotos: [null,null,null,null], // PARTNER's photos via DataChannel
    myStream: null, partnerStream: null,
    partnerPhotosReceived: 0,
    capturing: false, sessionStarted: false,
    socket: null, pollTimer: null,
    // WebRTC
    pc: null, dc: null, webrtcConnected: false,
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
      if(S.socket?.connected && S.isHost) S.socket.emit('set-theme', { code: S.code, theme: S.theme });
    }));

    S.userId = 'u_' + Math.random().toString(36).slice(2,10);

    const h = window.location.hash.slice(1);
    if(h && h.length >= 4){ E.joinInput.value = h; E.joinInput.focus(); }
  }

  // ── CAMERA (video only, no audio) ───────────
  async function requestCamera(){
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ideal:640}, height:{ideal:480} }
        // No audio constraint — video only!
      });
      S.myStream = stream;
      E.myVideo.srcObject = stream;
      return true;
    } catch(e){ console.warn('Camera denied:', e); return false; }
  }

  // ── API ──────────────────────────────────────
  async function api(body, retries = 2){
    for(let attempt = 0; attempt <= retries; attempt++){
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 15000);
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

  // ════════════════════════════════════════════
  // SOCKET.IO — Real-time via Render
  // ════════════════════════════════════════════

  function loadSocketIO(){
    return new Promise((resolve) => {
      // Wait for Socket.io lib to load (injected via HTML <script>)
      const check = () => {
        if(typeof io !== 'undefined') resolve(true);
        else setTimeout(check, 100);
      };
      setTimeout(() => resolve(false), 8000); // 8s timeout
      check();
    });
  }

  async function connectSocket(){
    const libLoaded = await loadSocketIO();
    if(!libLoaded){ console.warn('[ws] Socket.io lib not loaded'); return false; }

    try {
      S.socket = io(SIGNALING_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      S.socket.on('connect', () => {
        console.log('[ws] Connected to signaling');
        // Join room channel
        if(S.code){
          S.socket.emit('join-room', { code: S.code, userId: S.userId }, () => {});
        }
      });

      S.socket.on('connect_error', (err) => {
        console.warn('[ws] Connection error:', err.message);
      });

      S.socket.on('partner-joined', () => {
        if(!S.partnerConnected) partnerConnected();
        // Start WebRTC when partner arrives
        if(S.isHost) startWebRTC();
      });

      S.socket.on('partner-left', () => {
        S.partnerConnected = false;
        updatePartnerStatus(false);
        showToast('Partner disconnected');
        E.captureBtn.disabled = true;
        if(E.themePartnerStatus) E.themePartnerStatus.textContent = 'Partner left. Waiting...';
        E.captureHint.textContent = 'Partner disconnected...';
        // Close WebRTC
        if(S.pc) S.pc.close();
        S.webrtcConnected = false;
      });

      S.socket.on('session-started', ({ theme }) => {
        S.sessionStarted = true;
        S.currentPhoto = 0;
        if(theme) S.theme = theme;
        E.themeSel.classList.add('hidden');
        E.camArea.classList.remove('hidden');
        E.captureBtn.disabled = false;
        E.captureHint.textContent = 'Session started! Say cheese!';
      });

      S.socket.on('countdown', ({ photoIndex }) => {
        // Guest receives countdown from host
        if(!S.isHost && !S.capturing) startCountdown(photoIndex);
      });

      S.socket.on('retake', () => { doRetake(); });

      S.socket.on('theme-changed', ({ theme }) => {
        S.theme = theme;
        $$('.theme-card').forEach(c=>c.classList.toggle('active',c.dataset.theme===theme));
      });

      // ════════════════════════════════════════
      // WebRTC Signaling relay
      // ════════════════════════════════════════
      S.socket.on('webrtc-offer', async ({ sdp }) => {
        if(!S.isHost && sdp && !S.pc?.remoteDescription){
          try {
            if(!S.pc) createPeerConnection();
            await S.pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await S.pc.createAnswer({ offerToReceiveVideo: true });
            await S.pc.setLocalDescription(answer);
            S.socket.emit('webrtc-answer', { code: S.code, sdp: answer });
          } catch(e){ console.error('WebRTC offer error:', e); }
        }
      });

      S.socket.on('webrtc-answer', async ({ sdp }) => {
        if(S.isHost && sdp && S.pc?.remoteDescription?.type === 'offer'){
          try {
            await S.pc.setRemoteDescription(new RTCSessionDescription(sdp));
          } catch(e){ console.error('WebRTC answer error:', e); }
        }
      });

      S.socket.on('webrtc-ice', async ({ candidate }) => {
        if(candidate && S.pc?.remoteDescription){
          try {
            await S.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch(e){}
        }
      });

      // Wait up to 5s for connection
      return new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), 5000);
        S.socket.on('connect', () => { clearTimeout(timeout); resolve(true); });
      });

    } catch(e){ console.error('[ws] Error:', e); return false; }
  }

  // ════════════════════════════════════════════
  // WebRTC — Peer-to-peer video (no audio)
  // ════════════════════════════════════════════

  function createPeerConnection(){
    if(S.pc) S.pc.close();

    S.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    });

    // Add local video track (NO audio)
    if(S.myStream){
      S.myStream.getVideoTracks().forEach(track => {
        S.pc.addTrack(track, S.myStream);
      });
    }

    // Receive partner's video
    S.pc.ontrack = (event) => {
      if(event.streams[0]){
        S.partnerStream = event.streams[0];
        E.partnerVideo.srcObject = event.streams[0];
        E.partnerVideo.style.display = 'block';
        if(E.partnerPlaceholder) E.partnerPlaceholder.style.display = 'none';
        S.webrtcConnected = true;
        showToast('📹 Partner video connected!');
        // Start DataChannel for photo sharing
        setupDataChannel();
      }
    };

    // Relay ICE candidates
    S.pc.onicecandidate = (event) => {
      if(event.candidate && S.socket?.connected){
        S.socket.emit('webrtc-ice', { code: S.code, candidate: event.candidate });
      }
    };

    // Host creates the DataChannel
    if(S.isHost){
      S.dc = S.pc.createDataChannel('photos', { ordered: true });
    }
  }

  // ════════════════════════════════════════════
  // DataChannel — Photo sharing peer-to-peer
  // ════════════════════════════════════════════

  function setupDataChannel(){
    // If guest, listen for host's DataChannel
    if(!S.isHost){
      S.pc.ondatachannel = (event) => {
        S.dc = event.channel;
        setupDCHandler();
      };
    } else {
      // Host already has dc from createPeerConnection
      setupDCHandler();
    }
  }

  function setupDCHandler(){
    if(!S.dc) return;

    S.dc.onopen = () => console.log('[dc] DataChannel open');

    S.dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if(msg.type === 'photo' && S.isHost){
          // Guest sent their photo to host
          const idx = msg.photoIndex;
          S.partnerPhotos[idx] = msg.data;
          S.partnerPhotosReceived++;
          showToast(`📸 Received partner's photo ${idx + 1}!`);
          // Check if both have all photos
          checkStripReady();
        }
        if(msg.type === 'request-photo' && !S.isHost){
          // Host is requesting guest's photo (resend)
        }
      } catch(e){}
    };

    S.dc.onclose = () => console.log('[dc] DataChannel closed');
  }

  function sendPhotoToHost(photoIndex, dataUrl){
    if(S.dc?.readyState === 'open' && !S.isHost){
      S.dc.send(JSON.stringify({ type: 'photo', photoIndex, data: dataUrl }));
      console.log(`[dc] Sent photo ${photoIndex} to host`);
    }
  }

  function checkStripReady(){
    // Check if both users have all 4 photos
    const myComplete = S.photos.every(p => p !== null);
    const partnerComplete = S.partnerPhotos.every(p => p !== null);
    if(myComplete && partnerComplete){
      // Use combined function
      showCombinedStrip();
    }
  }

  function startWebRTC(){
    createPeerConnection();

    if(S.isHost){
      // Host creates offer
      S.pc.createOffer({ offerToReceiveVideo: true })
        .then(offer => S.pc.setLocalDescription(offer))
        .then(() => {
          if(S.socket?.connected){
            S.socket.emit('webrtc-offer', { code: S.code, sdp: S.pc.localDescription });
          }
        })
        .catch(e => console.error('Create offer error:', e));
    }
  }

  // ── CREATE ROOM ──────────────────────────────
  function createRoom(){
    hideError();
    setLoading(E.createBtn, 'Creating...');
    requestCamera().then(() => {
      return api({ action:'create', theme: S.theme, userId: S.userId });
    }).then(async (res) => {
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.isHost = true;
      await connectSocket();
      enterBooth();
      startPolling();
    }).catch(e => {
      showError(e.message || 'Failed to create room');
      resetBtn(E.createBtn, 'Create a room');
    });
  }

  // ── JOIN ROOM ────────────────────────────────
  function joinRoom(){
    const code = E.joinInput.value.trim().toUpperCase();
    if(!code || code.length < 4){ showError('Enter a valid code'); return; }
    hideError();
    setLoading(E.joinBtn, 'Joining...');
    requestCamera().then(() => {
      return api({ action:'join', code, userId: S.userId });
    }).then(async (res) => {
      if(!res.ok) throw new Error(res.error);
      S.code = res.code;
      S.theme = res.room.theme || 'classic';
      S.isHost = false;
      await connectSocket();
      enterBooth();
      startPolling();
    }).catch(e => {
      showError(e.message || 'Room not found');
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
      if(E.startBtn){ E.startBtn.disabled = true; E.startBtn.innerHTML = 'Waiting for partner... <span class="btn-arrow">▷</span>'; }
      updatePartnerStatus(false);
      E.captureHint.textContent = 'Share the code with your partner';
    } else {
      E.themeSel.style.display = 'none';
      E.camArea.classList.remove('hidden');
      E.captureHint.textContent = 'Connecting... Waiting for host';
      updatePartnerStatus(false);
    }

    $$('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === S.theme));

    if(!S.myStream && E.partnerPlaceholder){
      E.partnerPlaceholder.innerHTML = '<div style="text-align:center;padding:20px"><p style="color:#888;margin-bottom:12px">Camera needed</p><button onclick="window.retryCamera()" class="btn btn-primary btn-small">Enable Camera</button></div>';
    }

    resetBtn(E.createBtn, 'Create a room');
    resetBtn(E.joinBtn, 'Join');
  }

  // ── POLLING (fallback) ──────────────────────
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
      const wasConnected = S.partnerConnected;
      S.partnerConnected = !!room.guest;

      if(S.partnerConnected && !wasConnected) partnerConnected();
      if(!S.partnerConnected && wasConnected){
        S.partnerConnected = false; updatePartnerStatus(false);
        showToast('Partner disconnected'); E.captureBtn.disabled = true;
        if(E.themePartnerStatus) E.themePartnerStatus.textContent='Partner left. Waiting...';
        E.captureHint.textContent = 'Partner disconnected...';
      }
      if(room.state === 'shooting' && !S.sessionStarted && !S.isHost){
        S.sessionStarted = true; S.currentPhoto = room.currentPhoto || 0;
        E.camArea.classList.remove('hidden'); E.captureBtn.disabled = false;
        E.captureHint.textContent = `Photo ${S.currentPhoto+1} of ${S.totalPhotos}`;
      }
    } catch(e){}
  }

  // ── Partner Connected ───────────────────────
  function partnerConnected(){
    S.partnerConnected = true;
    updatePartnerStatus(true);
    showToast('🎀 Partner connected!');

    if(S.isHost){
      if(E.themePartnerStatus) E.themePartnerStatus.innerHTML = '<span class="status-connected">✓ Partner connected!</span>';
      if(E.startBtn){ E.startBtn.disabled = false; E.startBtn.innerHTML = 'Start the session <span class="btn-arrow">▷</span>'; }
      E.captureHint.textContent = 'Partner joined! Click start.';
      // Host starts WebRTC after partner connects
      if(!S.webrtcConnected) startWebRTC();
    } else {
      E.captureHint.textContent = 'Connected! Waiting for host to start...';
    }
  }

  // ── START SESSION (host only) ───────────────
  function startSession(){
    if(!S.isHost) return; // Only host can start
    E.themeSel.classList.add('hidden');
    E.camArea.classList.remove('hidden');
    S.sessionStarted = true;
    S.currentPhoto = 0;

    // Notify via Socket.io or polling fallback
    if(S.socket?.connected){
      S.socket.emit('start-session', { code: S.code, theme: S.theme });
    } else {
      api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:0, userId:S.userId });
    }

    E.captureBtn.disabled = false;
    E.captureHint.textContent = 'You control the shutter! Tap to capture.';
  }

  // ── CAPTURE (host only triggers) ────────────
  function capturePhoto(){
    if(!S.isHost) return;  // Only HOST can capture!
    if(S.capturing || !S.partnerConnected || S.currentPhoto >= S.totalPhotos) return;
    S.capturing = true;
    E.captureBtn.disabled = true;

    // Send countdown command to partner
    if(S.socket?.connected){
      S.socket.emit('countdown', { code: S.code, photoIndex: S.currentPhoto });
    }
    // Host starts countdown too
    startCountdown(S.currentPhoto);
  }

  function startCountdown(idx){
    let count = 3;
    E.countdown.classList.remove('hidden');
    E.countNum.textContent = count;
    const animate = () => { E.countNum.style.animation='none'; void E.countNum.offsetWidth; E.countNum.style.animation='countdown-pulse 0.5s ease-out'; };
    animate();
    const iv = setInterval(() => {
      count--;
      if(count > 0){ E.countNum.textContent = count; animate(); }
      else {
        clearInterval(iv); E.countdown.classList.add('hidden');
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
    if(config && config.filter !== 'none'){ ctx.filter = config.filter; ctx.drawImage(c, 0, 0); ctx.filter = 'none'; }
    const imageData = c.toDataURL('image/jpeg', 0.85);
    S.photos[idx] = imageData;

    // Guest sends photo to host via DataChannel
    if(!S.isHost) sendPhotoToHost(idx, imageData);

    updateProgress(idx);
    S.currentPhoto = idx + 1; S.capturing = false;

    // Update state
    api({ action:'update-state', code:S.code, state:'shooting', currentPhoto:S.currentPhoto, userId:S.userId });

    if(S.currentPhoto >= S.totalPhotos){
      setTimeout(showStrip, 800);
    } else {
      if(S.isHost) E.captureBtn.disabled = false;
      E.captureHint.textContent = `Photo ${S.currentPhoto + 1} of ${S.totalPhotos}`;
    }
  }

  function updateProgress(idx){
    const dots = E.progress.querySelectorAll('.progress-dot');
    dots.forEach((d, i) => { d.classList.remove('done','active'); if(i<=idx) d.classList.add('done'); else if(i===idx+1) d.classList.add('active'); });
  }

  // ── STRIP ────────────────────────────────────
  function showStrip(){
    E.camArea.classList.add('hidden'); E.stripResult.classList.remove('hidden'); E.captureBtn.disabled = true;
    const strip = Assets.generateCombinedStrip(S.photos, S.partnerPhotos, S.theme, { pw:280, ph:350, pad:16, gap:10, showLabel:true, labelText:'photobooth · 인생네컷', showStickers:true });
    E.stripCanvas.width = strip.width; E.stripCanvas.height = strip.height;
    E.stripCanvas.getContext('2d').drawImage(strip, 0, 0);
  }

  function showCombinedStrip(){
    showStrip();
  }

  function downloadStrip(){
    const a = document.createElement('a');
    a.download = `photobooth-${S.theme}-${Date.now()}.png`;
    a.href = E.stripCanvas.toDataURL('image/png'); a.click();
  }

  function retake(){
    S.currentPhoto = 0; S.photos = [null,null,null,null]; S.capturing = false;
    S.sessionStarted = true;
    if(S.socket?.connected) S.socket.emit('retake', { code: S.code });
    doRetake();
  }

  function doRetake(){
    $$('.progress-dot').forEach((d,i)=>{ d.classList.remove('done','active'); if(i===0) d.classList.add('active'); });
    E.stripResult.classList.add('hidden'); E.camArea.classList.remove('hidden');
    if(S.isHost){ E.captureBtn.disabled = false; E.captureHint.textContent = 'Photo 1 of 4 — tap!'; }
  }

  // ── LEAVE ────────────────────────────────────
  function leaveRoom(){
    if(S.pollTimer) clearInterval(S.pollTimer);
    if(S.socket) S.socket.disconnect();
    if(S.pc) S.pc.close();
    if(S.myStream) S.myStream.getTracks().forEach(t=>t.stop());
    api({ action:'leave', code:S.code, userId:S.userId });
    S.code=null; S.isHost=false; S.partnerConnected=false; S.currentPhoto=0;
    S.photos=[null,null,null,null]; S.capturing=false; S.sessionStarted=false; S.webrtcConnected=false;
    showPage('landing');
    window.history.replaceState(null, '', window.location.pathname);
    resetBtn(E.createBtn, 'Create a room'); resetBtn(E.joinBtn, 'Join');
  }

  // ── UTILS ────────────────────────────────────
  function showPage(p){ $$('.page').forEach(x=>x.classList.remove('active')); $(`#${p}`).classList.add('active'); }
  function showError(m){ E.error.textContent=m; E.error.classList.remove('hidden'); }
  function hideError(){ E.error.classList.add('hidden'); }
  function updatePartnerStatus(ok){ E.partnerStatus.textContent=ok?'✓ Connected!':'Waiting for partner...'; E.partnerStatus.className='partner-status '+(ok?'connected':'waiting'); }
  function showToast(msg,dur=4000){ if(!E.toast) return; E.toast.textContent=msg; E.toast.classList.add('show'); setTimeout(()=>E.toast.classList.remove('show'),dur); }
  function setLoading(btn,text){ btn.disabled=true; btn.textContent=text; }
  function resetBtn(btn,text){ btn.disabled=false; btn.innerHTML=text+' <span class="btn-arrow">▷</span>'; }

  document.addEventListener('DOMContentLoaded', init);
})();

window.retryCamera = async function(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'user',width:{ideal:640},height:{ideal:480}} });
    document.querySelector('#myVideo').srcObject = stream;
    document.querySelector('#partnerPlaceholder').innerHTML = '<span>waiting for partner...</span>';
  } catch(e){ alert('Camera access required.'); }
};
