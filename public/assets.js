/**
 * PHOTOBHOOH ASSET LIBRARY
 * All stickers, themes, backgrounds, strip generator
 */
const Assets = {
  stickers: {
    heart(ctx, x, y, size, color = '#FF4B6E') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      const s = size / 20;
      ctx.beginPath();
      ctx.moveTo(0, 4*s);
      ctx.bezierCurveTo(-10*s,-4*s,-18*s,2*s,0,14*s);
      ctx.bezierCurveTo(18*s,2*s,10*s,-4*s,0,4*s);
      ctx.fill(); ctx.restore();
    },
    sparkle(ctx, x, y, size, color = '#FFD700') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      ctx.beginPath();
      for(let i=0;i<4;i++){
        const a=(i*Math.PI)/2;
        ctx.lineTo(Math.cos(a)*size/2,Math.sin(a)*size/2);
        const m=a+Math.PI/4;
        ctx.lineTo(Math.cos(m)*size/6,Math.sin(m)*size/6);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    star(ctx, x, y, size, color = '#FFD700') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      ctx.beginPath();
      for(let i=0;i<5;i++){
        const o=(i*2*Math.PI)/5-Math.PI/2;
        const m=o+Math.PI/5;
        ctx.lineTo(Math.cos(o)*size/2,Math.sin(o)*size/2);
        ctx.lineTo(Math.cos(m)*size/5,Math.sin(m)*size/5);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    cloud(ctx, x, y, size, color = '#FFFFFF') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.globalAlpha = 0.85;
      const s = size/40;
      ctx.beginPath();
      ctx.arc(-10*s,0,12*s,0,Math.PI*2);
      ctx.arc(5*s,-5*s,14*s,0,Math.PI*2);
      ctx.arc(18*s,2*s,10*s,0,Math.PI*2);
      ctx.fill(); ctx.restore();
    },
    crown(ctx, x, y, size, color = '#FFD700') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      const s = size/30;
      ctx.beginPath();
      ctx.moveTo(-15*s,10*s); ctx.lineTo(-15*s,-5*s); ctx.lineTo(-7*s,2*s);
      ctx.lineTo(0,-10*s); ctx.lineTo(7*s,2*s); ctx.lineTo(15*s,-5*s); ctx.lineTo(15*s,10*s);
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    musicNote(ctx, x, y, size, color = '#FF00FF') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color;
      const s = size/30;
      ctx.beginPath(); ctx.arc(-3*s,8*s,5*s,0,Math.PI*2); ctx.fill();
      ctx.lineWidth = 2*s;
      ctx.beginPath(); ctx.moveTo(2*s,8*s); ctx.lineTo(2*s,-10*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2*s,-10*s); ctx.quadraticCurveTo(10*s,-8*s,8*s,-2*s); ctx.stroke();
      ctx.restore();
    },
    lips(ctx, x, y, size, color = '#FF4B6E') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
      const s = size/24;
      ctx.beginPath();
      ctx.moveTo(0,-2*s); ctx.bezierCurveTo(-8*s,-8*s,-12*s,-2*s,0,2*s);
      ctx.bezierCurveTo(12*s,-2*s,8*s,-8*s,0,-2*s); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0,2*s); ctx.bezierCurveTo(-10*s,8*s,0,12*s,0,12*s);
      ctx.bezierCurveTo(0,12*s,10*s,8*s,0,2*s); ctx.fill();
      ctx.restore();
    },
    flower(ctx, x, y, size, color = '#FF69B4') {
      ctx.save(); ctx.translate(x, y);
      const s = size/24;
      ctx.fillStyle = color;
      for(let i=0;i<5;i++){
        const a=(i*2*Math.PI)/5-Math.PI/2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a)*6*s,Math.sin(a)*6*s,5*s,3*s,a,0,Math.PI*2);
        ctx.fill();
      }
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(0,0,3*s,0,Math.PI*2); ctx.fill();
      ctx.restore();
    },
    bubble(ctx, x, y, size) {
      ctx.save(); ctx.translate(x, y);
      const r = size/2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.3,r*0.2,r*0.15,-0.5,0,Math.PI*2); ctx.fill();
      ctx.restore();
    },
    moon(ctx, x, y, size, color = '#FFE4B5') {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0,0,size/2,0,Math.PI*2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(size/4,-size/6,size/2.5,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  },

  themes: {
    classic:    { name:'Classic',    stripBg:'#FFFFFF', stripBorder:'#F0F0F0', textColor:'#333', accentColor:'#FF6B9D', photoBg:'#F8F8F8', labelFont:'Inter', labelSize:14, borderWidth:2, borderRadius:8, filter:'none',          overlayColor:null,                    stickers:['heart','sparkle','star'],       gradient:['#FFFFFF','#FFF5F8'] },
    vintage:    { name:'Vintage',    stripBg:'#F5E6D0', stripBorder:'#D4B896', textColor:'#5C4033', accentColor:'#8B4513', photoBg:'#E8D5B7', labelFont:'Georgia', labelSize:13, borderWidth:3, borderRadius:4, filter:'sepia(0.4) contrast(1.1) brightness(0.95)', overlayColor:'rgba(139,69,19,0.08)', stickers:['star','moon','flower'],          gradient:['#F5E6D0','#E8D5B7'] },
    meme:       { name:'Meme',       stripBg:'#1A1A2E', stripBorder:'#16213E', textColor:'#FFF', accentColor:'#E94560', photoBg:'#0F3460', labelFont:'Impact', labelSize:16, borderWidth:3, borderRadius:0, filter:'contrast(1.2) saturate(1.1)',       overlayColor:null,                    stickers:['star','sparkle'],              gradient:['#1A1A2E','#16213E'] },
    laundry:    { name:'Laundry',    stripBg:'#2C3E50', stripBorder:'#34495E', textColor:'#ECF0F1', accentColor:'#F39C12', photoBg:'#1A252F', labelFont:'Inter', labelSize:13, borderWidth:2, borderRadius:6, filter:'brightness(0.9) contrast(1.05)',    overlayColor:'rgba(243,156,18,0.05)', stickers:['bubble','sparkle','star'],      gradient:['#2C3E50','#1A252F'] },
    prison:     { name:'Prison',     stripBg:'#D5D5D5', stripBorder:'#AAAAAA', textColor:'#333', accentColor:'#C0392B', photoBg:'#BDC3C7', labelFont:'Courier New', labelSize:14, borderWidth:2, borderRadius:0, filter:'grayscale(0.3) contrast(1.1)',     overlayColor:'rgba(0,0,0,0.03)',        stickers:['star'],                       gradient:['#D5D5D5','#BDC3C7'] },
    subway:     { name:'Subway',     stripBg:'#1B1B2F', stripBorder:'#162447', textColor:'#E8E8E8', accentColor:'#E43F5A', photoBg:'#0F0F1A', labelFont:'Inter', labelSize:13, borderWidth:2, borderRadius:10, filter:'brightness(0.85) contrast(1.15)',   overlayColor:'rgba(228,63,90,0.05)',  stickers:['moon','sparkle','star'],       gradient:['#1B1B2F','#162447'] },
    airplane:   { name:'Airplane',   stripBg:'#87CEEB', stripBorder:'#5DADE2', textColor:'#2C3E50', accentColor:'#2980B9', photoBg:'#AED6F1', labelFont:'Inter', labelSize:13, borderWidth:2, borderRadius:12, filter:'brightness(1.05) saturate(1.1)',    overlayColor:'rgba(255,255,255,0.05)', stickers:['cloud','moon','sparkle'],      gradient:['#87CEEB','#AED6F1'] },
    karaoke:    { name:'Karaoke',    stripBg:'#2D1B69', stripBorder:'#5B2C8E', textColor:'#FFF', accentColor:'#FF00FF', photoBg:'#1A0F3C', labelFont:'Inter', labelSize:14, borderWidth:3, borderRadius:8, filter:'saturate(1.3) contrast(1.05)',       overlayColor:'rgba(255,0,255,0.06)',   stickers:['musicNote','crown','star'],    gradient:['#2D1B69','#1A0F3C'] }
  },

  generateStrip(photos, theme = 'classic', opts = {}) {
    const c = this.themes[theme] || this.themes.classic;
    const { pw=280, ph=350, pad=16, gap=10, labelH=50, showLabel=true, labelText='photobooth · 인생네컷', showStickers=true } = opts;
    const W = pw + pad*2;
    const H = ph*4 + gap*3 + pad*2 + (showLabel?labelH:0);

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Background gradient
    const gr = ctx.createLinearGradient(0,0,0,H);
    gr.addColorStop(0, c.gradient[0]); gr.addColorStop(1, c.gradient[1]);
    ctx.fillStyle = gr;
    this._rr(ctx,0,0,W,H,c.borderRadius+4); ctx.fill();

    // Border
    ctx.strokeStyle = c.stripBorder; ctx.lineWidth = c.borderWidth;
    this._rr(ctx,0,0,W,H,c.borderRadius+4); ctx.stroke();

    // Draw photos
    photos.forEach((photo, i) => {
      const x = pad, y = pad + i*(ph+gap);
      ctx.fillStyle = c.photoBg;
      this._rr(ctx,x,y,pw,ph,c.borderRadius); ctx.fill();

      if (photo) {
        ctx.save();
        this._rr(ctx,x,y,pw,ph,c.borderRadius); ctx.clip();
        const img = new Image();
        img.src = photo;
        const ir = img.width/img.height, sr = pw/ph;
        let sx,sy,sw,sh;
        if(ir>sr){ sh=img.height; sw=sh*sr; sx=(img.width-sw)/2; sy=0; }
        else { sw=img.width; sh=sw/sr; sx=0; sy=(img.height-sh)/2; }
        try { ctx.drawImage(img,sx,sy,sw,sh,x,y,pw,ph); } catch(e){}
        if(c.filter!=='none'){ ctx.filter=c.filter; ctx.drawImage(cv,x,y,pw,ph,x,y,pw,ph); ctx.filter='none'; }
        if(c.overlayColor){ ctx.fillStyle=c.overlayColor; ctx.fillRect(x,y,pw,ph); }
        ctx.restore();

        // Photo number
        ctx.fillStyle=c.accentColor; ctx.globalAlpha=0.85;
        this._rr(ctx,x+pw-32,y+8,24,24,12); ctx.fill();
        ctx.globalAlpha=1; ctx.fillStyle='#FFF';
        ctx.font=`bold 12px ${c.labelFont}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(String(i+1),x+pw-20,y+20);
      } else {
        ctx.fillStyle=c.textColor; ctx.globalAlpha=0.15;
        ctx.font=`400 ${ph/4}px ${c.labelFont}`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(String(i+1),x+pw/2,y+ph/2); ctx.globalAlpha=1;
      }
    });

    // Label
    if(showLabel){
      ctx.fillStyle=c.textColor; ctx.font=`500 ${c.labelSize}px ${c.labelFont}`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(labelText,W/2,H-labelH+labelH/2);
    }

    // Stickers
    if(showStickers){
      const pool = c.stickers||['heart','sparkle'];
      for(let i=0;i<8;i++){
        const sn=pool[i%pool.length], fn=this.stickers[sn];
        if(fn){
          ctx.globalAlpha=0.6+Math.random()*0.3;
          fn(ctx,pad+Math.random()*(pw-20), pad+Math.random()*(H-pad*2-labelH), 12+Math.random()*16, c.accentColor);
          ctx.globalAlpha=1;
        }
      }
    }
    return cv;
  },

  _rr(ctx,x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }
};
