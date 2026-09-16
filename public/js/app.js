// ============================================================
// Nexatech 3D Frontend — business logic (APIs intact) + 3D engine
// Preserves ALL backend contracts: /api/content, /api/sections,
// /api/media, /api/team, /api/leads, /api/chat, /api/events
// 3D layer: Three.js hero + tilt + GSAP reveals + Lenis + cursor
// ============================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let CONTENT={}, STATS={}, SCARCITY={}, SECTIONS=[];
let PORTFOLIO=[], MODAL_INDEX=0, MODAL_ITEMS=[];
function T(key, fb){ const v=CONTENT[key]; if(v===undefined||v===null) return fb; const s=String(v); return s.trim()===''&&typeof fb==='string'&&fb!=='' ? fb : s; }
let sessionId = localStorage.getItem('nexatech_sid') || (localStorage.setItem('nexatech_sid', Math.random().toString(36).slice(2)+Date.now().toString(36)), localStorage.getItem('nexatech_sid'));
function getUTM(){
  const p=new URLSearchParams(location.search);
  return {source:p.get('utm_source')||'',medium:p.get('utm_medium')||'',campaign:p.get('utm_campaign')||''};
}
function sanitize(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function whatsappLink(num, msg){ const n=(num||'').replace(/\D/g,''); return `https://wa.me/${n}?text=${encodeURIComponent(msg||'')}`; }
function reducedMotion(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced'); }
// ---- Media helpers ----
function stripUrlParams(u){ return String(u||'').split('?')[0].split('#')[0]; }
function isVideoFile(u){ return /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv|3gp)$/i.test(stripUrlParams(u).trim()); }
function youTubeId(u){
  try{
    const s=String(u||'').trim();
    let m=s.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i);
    if(m) return m[1];
  }catch{}
  return '';
}
function vimeoId(u){
  try{
    const m=String(u||'').match(/vimeo\.com\/(?:video\/)?(\d{5,})/i);
    if(m) return m[1];
  }catch{}
  return '';
}
function driveId(u){
  try{
    const m=String(u||'').match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i);
    if(m) return m[1];
  }catch{}
  return '';
}
function mediaKind(u){
  if(!u) return 'image';
  if(youTubeId(u)) return 'youtube';
  if(vimeoId(u)) return 'vimeo';
  if(driveId(u)) return 'drive';
  if(isVideoFile(u)) return 'video';
  if(/video/i.test(String(u)) && /\.(mp4|webm|mov|m4v|ogg)/i.test(String(u))) return 'video';
  return 'image';
}
function youTubeEmbed(u){ return 'https://www.youtube.com/embed/'+youTubeId(u)+'?rel=0'; }
function vimeoEmbed(u){ return 'https://player.vimeo.com/video/'+vimeoId(u); }
function driveEmbed(u){ return 'https://drive.google.com/file/d/'+driveId(u)+'/preview'; }
function track(event_type, element_id, metadata={}){
  const payload={event_type,element_id,session_id:sessionId,page_url:location.href,utm:getUTM(),metadata};
  try{
    if(navigator.sendBeacon){
      const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
      if(navigator.sendBeacon('/api/events', blob)) return;
    }
  }catch{}
  fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
}

// ================= 3D CHROME: cursor / progress =================
function initCursor(){
  if(window.matchMedia('(hover: none)').matches) return;
  const dot=$('#cursor-dot'), ring=$('#cursor-ring');
  if(!dot||!ring) return;
  let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
  addEventListener('mousemove', e=>{
    mx=e.clientX; my=e.clientY;
    dot.style.transform=`translate(${mx}px,${my}px) translate(-50%,-50%)`;
  }, {passive:true});
  (function loop(){
    rx+=(mx-rx)*.16; ry+=(my-ry)*.16;
    ring.style.transform=`translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
  document.querySelectorAll('a,.btn,.pill,.card,.faq-q').forEach(el=>{
    el.addEventListener('mouseenter', ()=>{ ring.style.width='56px'; ring.style.height='56px'; ring.style.borderColor='rgba(124,58,237,.9)'; });
    el.addEventListener('mouseleave', ()=>{ ring.style.width='36px'; ring.style.height='36px'; ring.style.borderColor='rgba(0,209,255,.7)'; });
  });
}
function initScrollProgress(){
  const fill=$('#scroll-progress-fill');
  const orbs=document.querySelector('.ambient-orbs');
  const onScroll=()=>{
    const h=document.documentElement;
    const max=h.scrollHeight-h.clientHeight;
    if(fill) fill.style.width=(max>0? (h.scrollTop/max)*100 : 0)+'%';
    if(orbs && !reducedMotion()) orbs.style.transform=`translateY(${h.scrollTop*.06}px)`;
  };
  addEventListener('scroll', onScroll, {passive:true}); onScroll();
}
function initMagnetic(){
  if(reducedMotion() || window.matchMedia('(hover: none)').matches) return;
  $$('.magnetic').forEach(el=>{
    el.addEventListener('mousemove', e=>{
      const r=el.getBoundingClientRect();
      const x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2;
      el.style.transform=`translate(${x*.12}px,${y*.18}px)`;
    });
    el.addEventListener('mouseleave', ()=>{ el.style.transform=''; });
  });
}
// 3D tilt on [data-tilt] cards — pointer-driven rotateX/rotateY with glare-safe limits
function initTilt(){
  if(reducedMotion()) return;
  const els=$$('[data-tilt]');
  const fine=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  els.forEach(el=>{
    const max=parseFloat(el.dataset.tiltMax||'8');
    let raf=null;
    function apply(rx,ry){
      el.style.transform=`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    }
    if(!fine){
      // touch: subtle idle float handled by CSS; skip listeners
      return;
    }
    el.addEventListener('pointermove', e=>{
      const r=el.getBoundingClientRect();
      const px=(e.clientX-r.left)/r.width-.5, py=(e.clientY-r.top)/r.height-.5;
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=> apply((-py*max).toFixed(2), (px*max).toFixed(2)));
    });
    el.addEventListener('pointerleave', ()=>{
      if(raf) cancelAnimationFrame(raf);
      el.style.transition='transform .5s cubic-bezier(.2,.8,.2,1)';
      apply(0,0);
      setTimeout(()=>{ el.style.transition=''; }, 500);
    });
  });
}
// Lenis smooth scroll synced to GSAP ticker (best-practice 2026 stack)
function initSmoothScroll(){
  try{
    if(reducedMotion()) return;
    const LenisCtor=window.Lenis;
    if(!LenisCtor) return;
    const lenis=new LenisCtor({ lerp:.1, smoothWheel:true });
    window.__lenis=lenis;
    if(window.gsap){
      lenis.on('scroll', ()=>{ try{ window.ScrollTrigger?.update(); }catch{} });
      window.gsap.ticker.add(t=> lenis.raf(t*1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const raf=t=>{ lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    // anchor links through lenis
    $$('a[href^="#"]').forEach(a=>{
      a.addEventListener('click', e=>{
        const id=a.getAttribute('href');
        if(id.length>1){
          const target=document.querySelector(id);
          if(target){ e.preventDefault(); lenis.scrollTo(target, {offset:-70}); $('#drawer')?.classList.remove('open'); }
        }
      });
    });
  }catch(e){ console.warn('smooth scroll off', e.message); }
}
function initGsapReveals(){
  try{
    if(!window.gsap || !window.ScrollTrigger) return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    if(reducedMotion()) return;
    // Hero copy stagger
    window.gsap.fromTo('.hero-copy > *', {y:26,opacity:0}, {y:0,opacity:1,duration:.9,stagger:.1,ease:'power3.out',delay:.15,
      onComplete(){ try{ window.gsap.set('.hero-copy > *',{clearProps:'transform'}); }catch{} }});
    // --- 3D FLY-THROUGH: each section is a camera stop ---
    // Entrance: flies in from deep (z, rotationX, blur) like camera arriving.
    // Exit (scrub): tilts/pans away as camera departs to next stop.
    $$('[data-reveal]').forEach(sec=>{
      window.gsap.set(sec, {transformPerspective:1400, transformOrigin:'50% 0%'});
      window.gsap.fromTo(sec,
        {y:110, z:-220, rotationX:9, scale:.94, opacity:0, filter:'blur(10px)'},
        {y:0, z:0, rotationX:0, scale:1, opacity:1, filter:'blur(0px)',
         duration:1.15, ease:'power3.out',
         scrollTrigger:{trigger:sec, start:'top 88%', once:true},
         onComplete(){ try{ window.gsap.set(sec, {clearProps:'filter'}); }catch{} }});
      // Continuous departure tilt while scrolling past (camera leaving the stop)
      window.gsap.to(sec, {y:-46, rotationX:-5, scale:.985, ease:'none',
        scrollTrigger:{trigger:sec, start:'top 45%', end:'bottom top', scrub:1.2}});
      // Inner content drifts slightly slower = depth parallax inside the stop
      const inner=sec.querySelector('.container');
      if(inner){
        window.gsap.fromTo(inner, {y:26}, {y:-26, ease:'none',
          scrollTrigger:{trigger:sec, start:'top bottom', end:'bottom top', scrub:1.4}});
      }
    });
    // Stagger cards inside each stop so they pop in 3D as camera arrives
    $$('.masonry .card, .proof-grid .proof-card, .pricing .price-card, .testi-grid .testi').forEach((el, i)=>{
      window.gsap.fromTo(el, {z:-120, y:34, opacity:0}, {z:0, y:0, opacity:1, duration:.8, ease:'power3.out',
        scrollTrigger:{trigger:el, start:'top 92%', once:true}});
    });
    // Parallax on hero visual
    window.gsap.to('#hero-visual', {y:-40,ease:'none',scrollTrigger:{trigger:'#hero',start:'top top',end:'bottom top',scrub:1}});
    // Progress line scrub
    const pl=$('#progress-line');
    if(pl){ window.gsap.fromTo(pl,{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{trigger:'#how-it-works',start:'top 80%',end:'bottom 60%',scrub:1}}); }
  }catch(e){ console.warn('gsap reveals off', e.message); }
}

// ================= THREE.JS HERO (dynamic import, gated render loop) =================
async function initHeroWebGL(){
  const canvas=$('#hero-webgl');
  if(!canvas || reducedMotion()){ if(canvas) canvas.style.display='none'; return; }
  let THREE;
  try{ THREE=await import('three'); }
  catch(e){ console.warn('three.js unavailable, hero falls back to CSS/2D', e.message); canvas.style.display='none'; return; }
  try{
    const isMobile=innerWidth<=768;
    const renderer=new THREE.WebGLRenderer({canvas, alpha:true, antialias:!isMobile, powerPreference:'high-performance'});
    const DPR=Math.min(devicePixelRatio||1, isMobile?1.5:2);
    renderer.setPixelRatio(DPR);
    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x05070f, 0.055);
    const camera=new THREE.PerspectiveCamera(55, 1, .1, 100);
    camera.position.set(0, .4, 11);
    // Lights
    scene.add(new THREE.AmbientLight(0x8899ff, .7));
    const key=new THREE.DirectionalLight(0x00d1ff, 1.6); key.position.set(5,6,6); scene.add(key);
    const rim=new THREE.DirectionalLight(0x7c3aed, 1.4); rim.position.set(-6,-2,4); scene.add(rim);
    // Core group: torus knot (store "engine") + orbiting icosahedrons + particle field
    const group=new THREE.Group(); scene.add(group);
    const knot=new THREE.Mesh(
      new THREE.TorusKnotGeometry(2.1, .55, isMobile?90:160, isMobile?12:22),
      new THREE.MeshStandardMaterial({color:0x0e1a33, metalness:.85, roughness:.25, emissive:0x0a2540, emissiveIntensity:.6, wireframe:false})
    );
    group.add(knot);
    const wire=new THREE.Mesh(
      new THREE.TorusKnotGeometry(2.1, .55, isMobile?60:120, 10),
      new THREE.MeshBasicMaterial({color:0x00d1ff, wireframe:true, transparent:true, opacity:.22})
    );
    wire.scale.setScalar(1.002); group.add(wire);
    const satGeo=new THREE.IcosahedronGeometry(.5, 1);
    const sats=[];
    const satCols=[0x00d1ff,0x7c3aed,0x38bdf8,0x10b981];
    for(let i=0;i<(isMobile?5:8);i++){
      const m=new THREE.Mesh(satGeo, new THREE.MeshStandardMaterial({color:satCols[i%satCols.length], metalness:.7, roughness:.3, emissive:satCols[i%satCols.length], emissiveIntensity:.35}));
      const a=(i/(isMobile?5:8))*Math.PI*2;
      m.userData={a, r:3.6+Math.random()*1.4, s:.5+Math.random()*.9, y:(Math.random()-.5)*3};
      group.add(m); sats.push(m);
    }
    // Starfield particles
    const N=isMobile?500:1400;
    const pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-.5)*30; pos[i*3+1]=(Math.random()-.5)*18; pos[i*3+2]=(Math.random()-.5)*20-2; }
    const pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(pGeo, new THREE.PointsMaterial({color:0x7dd3fc,size:.045,transparent:true,opacity:.8}));
    scene.add(pts);
    // Tron-style 3D floor grid
    const grid=new THREE.GridHelper(46, 46, 0x00d1ff, 0x7c3aed);
    grid.position.y=-3.6;
    grid.material.transparent=true; grid.material.opacity=.22;
    scene.add(grid);
    // Floating holographic sale labels (canvas sprites orbiting the engine)
    function makeLabel(text, accent){
      const cv=document.createElement('canvas'); cv.width=512; cv.height=144;
      const g=cv.getContext('2d');
      g.fillStyle='rgba(6,12,26,.85)';
      if(g.roundRect){ g.beginPath(); g.roundRect(8,8,496,128,44); g.fill(); }
      else g.fillRect(8,8,496,128);
      g.strokeStyle=accent; g.lineWidth=6;
      if(g.roundRect){ g.beginPath(); g.roundRect(8,8,496,128,44); g.stroke(); }
      else g.strokeRect(8,8,496,128);
      g.fillStyle=accent; g.beginPath(); g.arc(52,72,16,0,Math.PI*2); g.fill();
      g.fillStyle='#fff'; g.font='700 46px Inter, sans-serif'; g.textBaseline='middle';
      g.fillText(text, 84, 76);
      const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4; return tex;
    }
    const holos=[];
    [['$450 New Sale','#00d1ff'],['Order #1029 Shipped','#10b981'],['3.2% Conversion','#a78bfa']].forEach(([txt,col],i)=>{
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:makeLabel(txt,col), transparent:true, depthWrite:false}));
      sp.scale.set(3.2,.9,1);
      sp.userData={a:i*2.15, r:4.7+i*.55, y:.9-i*1.25, s:.5+i*.22};
      scene.add(sp); holos.push(sp);
    });
    group.position.x=isMobile?0:2.6;
    // Mouse parallax
    let tx=0, ty=0;
    addEventListener('pointermove', e=>{
      tx=(e.clientX/innerWidth-.5); ty=(e.clientY/innerHeight-.5);
    }, {passive:true});
    function resize(){
      const hero=$('#hero');
      const w=hero?.clientWidth||innerWidth, h=hero?.clientHeight||innerHeight*.8;
      renderer.setSize(w,h,false);
      camera.aspect=w/h; camera.updateProjectionMatrix();
    }
    resize(); addEventListener('resize', resize);
    // Render only while hero visible (perf best-practice)
    let visible=true, raf=0;
    new IntersectionObserver(es=>{ es.forEach(e=>{ visible=e.isIntersecting; if(visible) loop(); }); }, {threshold:.02}).observe($('#hero'));
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && visible) loop(); else cancelAnimationFrame(raf); });
    const clock=new THREE.Clock();
    let scrollY=0;
    addEventListener('scroll', ()=>{ scrollY=window.scrollY; }, {passive:true});
    function loop(){
      if(!visible || document.hidden) return;
      raf=requestAnimationFrame(loop);
      const t=clock.getElapsedTime();
      knot.rotation.x=t*.18; knot.rotation.y=t*.24;
      wire.rotation.x=t*.18; wire.rotation.y=t*.24;
      group.rotation.y+=((tx*.5 + scrollY*.0006)-group.rotation.y)*.04;
      group.rotation.x+=((ty*.35)-group.rotation.x)*.04;
      group.position.y=Math.sin(t*.6)*.25 - Math.min(scrollY*.002, 2.2);
      sats.forEach((m,i)=>{
        const u=m.userData; u.a+=.003*u.s;
        m.position.set(Math.cos(u.a)*u.r, u.y+Math.sin(t*u.s+i)*.5, Math.sin(u.a)*u.r*.6);
        m.rotation.x+=.01; m.rotation.y+=.012;
      });
      pts.rotation.y=t*.015;
      grid.position.z=(t*.15)%2;
      holos.forEach((sp,i)=>{
        const u=sp.userData; u.a+=.0024*u.s*3;
        sp.position.set(group.position.x+Math.cos(u.a)*u.r, u.y+Math.sin(t*.7+i*1.3)*.35, Math.sin(u.a)*u.r*.5);
      });
      camera.position.x+=(tx*1.2-camera.position.x)*.03;
      camera.position.y+=((.4-ty*.9)-camera.position.y)*.03;
      camera.position.z+=((11+Math.min(scrollY*.008,5.5))-camera.position.z)*.05;
      camera.lookAt(group.position.x*.6, 0, 0);
      renderer.render(scene,camera);
    }
    loop();
  }catch(e){ console.warn('hero webgl failed, CSS fallback active', e.message); canvas.style.display='none'; }
}
// Cheap ambient 2D drift fallback (used when WebGL/three is unavailable)
function initFixedBackground2D(){
  const c=$('#webgl-fixed');
  if(!c || reducedMotion()){ if(c) c.style.display='none'; return; }
  const ctx=c.getContext('2d');
  const DPR=Math.min(devicePixelRatio||1, 1.5);
  let w,h, dots=[];
  function resize(){ w=c.clientWidth||innerWidth; h=c.clientHeight||innerHeight; c.width=w*DPR; c.height=h*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
  function seed(){
    dots=[];
    const n=innerWidth<=768?26:60;
    for(let i=0;i<n;i++) dots.push({x:Math.random()*w,y:Math.random()*h,r:1+Math.random()*2.2,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,hue:Math.random()>.5});
  }
  resize(); seed(); addEventListener('resize', ()=>{ resize(); seed(); });
  let vis=true;
  new IntersectionObserver(es=>{ es.forEach(e=>{ vis=e.isIntersecting; }); }).observe(document.body);
  (function loop(){
    requestAnimationFrame(loop);
    if(document.hidden) return;
    ctx.clearRect(0,0,w,h);
    dots.forEach(d=>{
      d.x+=d.vx; d.y+=d.vy;
      if(d.x<0||d.x>w) d.vx*=-1;
      if(d.y<0||d.y>h) d.vy*=-1;
      ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
      ctx.fillStyle=d.hue?'rgba(0,209,255,.20)':'rgba(124,58,237,.20)';
      ctx.fill();
    });
  })();
}

// 3D spotlight: card glow follows the cursor (cheap CSS-var driven)
function initSpotlight(){
  if(reducedMotion() || window.matchMedia('(hover: none)').matches) return;
  let queued=false;
  document.addEventListener('pointermove', e=>{
    const x=e.clientX, y=e.clientY;
    if(!queued){ queued=true; requestAnimationFrame(()=>{
      queued=false;
      $$('.spotlight').forEach(el=>{
        const r=el.getBoundingClientRect();
        if(x<r.left||x>r.right||y<r.top||y>r.bottom) return;
        el.style.setProperty('--mx', ((x-r.left)/r.width*100).toFixed(1)+'%');
        el.style.setProperty('--my', ((y-r.top)/r.height*100).toFixed(1)+'%');
      });
    });}
  }, {passive:true});
}

// ================= CINEMATIC CAMERA JOURNEY =================
// Fixed WebGL tunnel: every page section owns a camera stop.
// Scrolling flies the camera from one location to the next
// (dolly + weave + FOV kick + roll), rings/particles rush past.
async function initAmbientWebGL(){
  const c=$('#webgl-fixed');
  if(!c || reducedMotion()){ if(c) c.style.display='none'; $('#cam-hud')?.style.setProperty('display','none'); return; }
  let THREE;
  try{ THREE=await import('three'); }
  catch{ initFixedBackground2D(); return; }
  try{
    const isMobile=innerWidth<=768;
    const renderer=new THREE.WebGLRenderer({canvas:c, alpha:true, antialias:false, powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1, isMobile?1:1.5));
    const scene=new THREE.Scene();
    scene.fog=new THREE.FogExp2(0x0b1230, 0.026);
    const camera=new THREE.PerspectiveCamera(62, 1, .1, 140);
    camera.position.set(0, .5, 14);
    scene.add(new THREE.AmbientLight(0x88aaff, 1.0));
    const dl=new THREE.DirectionalLight(0x00d1ff, 1.2); dl.position.set(4,6,6); scene.add(dl);
    const dl2=new THREE.DirectionalLight(0x7c3aed, 1.0); dl2.position.set(-5,-3,4); scene.add(dl2);
    const head=new THREE.PointLight(0x9fd8ff, 12, 30); scene.add(head);

    // --- Stops: one per visible page section, in DOM order ---
    function collectStops(){
      const els=[...document.querySelectorAll('main section[data-section], footer[data-section]')]
        .filter(el=>el.offsetParent!==null);
      const list=els.length?els:[...document.querySelectorAll('main section[id]')];
      return list.map((el,i)=>{
        const key=el.id||el.dataset.section||('stop-'+i);
        const weave=Math.sin(i*1.25)*3.1;
        const y=-i*5.2;
        const z=Math.max(7.2, 14-i*.55);
        return {
          id: key,
          label: (el.querySelector('.eyebrow')?.textContent||key.replace(/_/g,' ')||('Stop '+(i+1))).trim().slice(0,18),
          el,
          cam:new THREE.Vector3(weave, y+.5, z),
          look:new THREE.Vector3(weave*.25, y-.4, -4),
        };
      });
    }
    let stops=collectStops();
    const corridorLen=stops.length*5.2+18;

    // --- Shape per stop (camera passes each one) ---
    const geoMakers=[
      ()=>new THREE.IcosahedronGeometry(1.5, 0),
      ()=>new THREE.TorusGeometry(1.15, .3, 10, 26),
      ()=>new THREE.OctahedronGeometry(1.4, 0),
      ()=>new THREE.TorusKnotGeometry(.85, .26, 64, 10),
      ()=>new THREE.IcosahedronGeometry(1.0, 1),
      ()=>new THREE.TetrahedronGeometry(1.4, 0),
    ];
    const cols=[0x00d1ff,0x7c3aed,0x38bdf8,0x10b981,0xa78bfa,0x00d1ff];
    const shapes=stops.map((s,i)=>{
      const m=new THREE.Mesh(
        geoMakers[i%geoMakers.length](),
        new THREE.MeshStandardMaterial({color:cols[i%cols.length], wireframe:true, transparent:true, opacity:.3})
      );
      const side=(i%2===0?-1:1);
      m.position.set(side*(3.4+Math.random()*1.4), s.cam.y-.6, -3-(i%3));
      m.userData={sx:.0016+(i%5)*.0007, sy:.0022+(i%4)*.0005, y0:m.position.y, ph:i*1.7, base:1};
      scene.add(m); return m;
    });

    // --- Tunnel rings rushing past ---
    const ringGeo=new THREE.TorusGeometry(7.5, .035, 8, 64);
    const ringMat=new THREE.MeshBasicMaterial({color:0x00d1ff, transparent:true, opacity:.16});
    const ringMat2=new THREE.MeshBasicMaterial({color:0x7c3aed, transparent:true, opacity:.14});
    const rings=[];
    for(let i=0;i<Math.ceil(corridorLen/3.4);i++){
      const r=new THREE.Mesh(ringGeo, i%2?ringMat:ringMat2);
      r.position.set(Math.sin(i*.8)*1.2, 4-i*3.4, -4);
      scene.add(r); rings.push(r);
    }

    // --- Dust particles along the whole flight path ---
    const N=isMobile?600:1300;
    const pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      pos[i*3]=(Math.random()-.5)*30;
      pos[i*3+1]=5-Math.random()*corridorLen;
      pos[i*3+2]=(Math.random()-.5)*18-3;
    }
    const pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(pGeo, new THREE.PointsMaterial({color:0x7dd3fc,size:.07,transparent:true,opacity:.75}));
    scene.add(pts);

    // --- ADVANCED DRESSING: nebulae, flight ribbon, warp streaks, grids, beacon ---
    function glowTexture(inner, outer){
      const cv=document.createElement('canvas'); cv.width=cv.height=256;
      const g=cv.getContext('2d');
      const gr=g.createRadialGradient(128,128,0,128,128,128);
      gr.addColorStop(0, inner); gr.addColorStop(.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle=gr; g.fillRect(0,0,256,256);
      const tx=new THREE.CanvasTexture(cv); return tx;
    }
    // Nebula clouds: big soft additive sprites drifting along the corridor
    const nebCols=[
      ['rgba(0,209,255,.55)','rgba(0,209,255,.12)'],
      ['rgba(124,58,237,.55)','rgba(124,58,237,.12)'],
      ['rgba(56,189,248,.5)','rgba(56,189,248,.10)'],
      ['rgba(16,185,129,.42)','rgba(16,185,129,.10)'],
    ];
    const nebs=[];
    const nebCount=isMobile?4:7;
    for(let i=0;i<nebCount;i++){
      const [a,b]=nebCols[i%nebCols.length];
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(a,b), transparent:true, opacity:.5, depthWrite:false, blending:THREE.AdditiveBlending}));
      const s=14+Math.random()*16;
      sp.scale.set(s, s*.7, 1);
      sp.position.set((Math.random()-.5)*22, 4-Math.random()*corridorLen, -9-Math.random()*6);
      sp.userData={ph:Math.random()*6.28, drift:.2+Math.random()*.4, x0:sp.position.x};
      scene.add(sp); nebs.push(sp);
    }
    // Flight-path ribbon: glowing route threading every camera stop
    try{
      const pathPts=stops.map(s=>new THREE.Vector3(s.cam.x*.55, s.cam.y-.5, -5.5));
      const curve=new THREE.CatmullRomCurve3(pathPts);
      const tube=new THREE.Mesh(
        new THREE.TubeGeometry(curve, 120, .05, 6, false),
        new THREE.MeshBasicMaterial({color:0x00d1ff, transparent:true, opacity:.22, blending:THREE.AdditiveBlending, depthWrite:false})
      );
      scene.add(tube);
      const tube2=new THREE.Mesh(
        new THREE.TubeGeometry(curve, 120, .12, 6, false),
        new THREE.MeshBasicMaterial({color:0x7c3aed, transparent:true, opacity:.08, blending:THREE.AdditiveBlending, depthWrite:false})
      );
      scene.add(tube2);
    }catch(e){ console.warn('ribbon off', e.message); }
    // Warp streaks: vertical light rain that accelerates with scroll velocity
    const WN=isMobile?120:260;
    const wpos=new Float32Array(WN*3);
    const wspd=new Float32Array(WN);
    for(let i=0;i<WN;i++){
      wpos[i*3]=(Math.random()-.5)*26;
      wpos[i*3+1]=5-Math.random()*corridorLen;
      wpos[i*3+2]=(Math.random()-.5)*14-2;
      wspd[i]=.6+Math.random()*1.6;
    }
    const wGeo=new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wpos,3));
    const warp=new THREE.Points(wGeo, new THREE.PointsMaterial({color:0xbfe9ff,size:.11,transparent:true,opacity:.0}));
    scene.add(warp);
    // Twinkle layer: second star field pulsing out of phase
    const TN=isMobile?150:350;
    const tpos=new Float32Array(TN*3);
    for(let i=0;i<TN;i++){
      tpos[i*3]=(Math.random()-.5)*30;
      tpos[i*3+1]=5-Math.random()*corridorLen;
      tpos[i*3+2]=(Math.random()-.5)*16-4;
    }
    const tGeo=new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(tpos,3));
    const twk=new THREE.Points(tGeo, new THREE.PointsMaterial({color:0xffffff,size:.09,transparent:true,opacity:.5}));
    scene.add(twk);
    // Tron grid decks: perspective floors spaced down the flight
    const grids=[];
    for(let i=0;i<3;i++){
      const gr=new THREE.GridHelper(40, 28, 0x00d1ff, 0x7c3aed);
      gr.position.set(0, 2.5-i*(corridorLen/2.4), -6);
      gr.material.transparent=true; gr.material.opacity=.13;
      scene.add(gr); grids.push(gr);
    }
    // Satellites: tiny orbiters around each stop shape
    const satGeo=new THREE.TetrahedronGeometry(.22, 0);
    const sats=shapes.map((m,i)=>{
      const s=new THREE.Mesh(satGeo, new THREE.MeshBasicMaterial({color:cols[(i+2)%cols.length], transparent:true, opacity:.85}));
      s.userData={a:Math.random()*6.28, r:2.1+Math.random()*.7, s:.6+Math.random()*.8, parent:m};
      scene.add(s); return s;
    });
    // Beacon: glowing marker + light that hops to the active stop
    const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture('rgba(255,255,255,.9)','rgba(0,209,255,.25)'), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
    beacon.scale.set(3.4,3.4,1);
    scene.add(beacon);
    const beaconLight=new THREE.PointLight(0x00d1ff, 20, 14);
    scene.add(beaconLight);
    const _bv=new THREE.Vector3();
    // Shooting star: occasional dart across the view
    const shoot=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture('rgba(255,255,255,.95)','rgba(124,58,237,.3)'), transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending}));
    shoot.scale.set(2.6,.7,1);
    scene.add(shoot);
    let shootT=4+Math.random()*4, shootLife=-1;
    const _s0=new THREE.Vector3(), _s1=new THREE.Vector3();

    function resize(){
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    }
    resize(); addEventListener('resize', ()=>{ resize(); stops=collectStops(); buildHud(); cacheTops(); });

    // --- Scroll tracking: map viewport center to a float stop index ---
    let tops=[];
    function cacheTops(){
      tops=stops.map(s=>{
        const r=s.el.getBoundingClientRect();
        return (window.scrollY+r.top);
      });
    }
    cacheTops();
    setTimeout(cacheTops, 1200);
    addEventListener('load', cacheTops);
    let scrollY=window.scrollY, lastY=scrollY, smoothVel=0;
    addEventListener('scroll', ()=>{ scrollY=window.scrollY; }, {passive:true});

    function targetProgress(){
      const center=scrollY+innerHeight*.5;
      if(!tops.length) return 0;
      if(center<=tops[0]) return 0;
      for(let i=0;i<tops.length-1;i++){
        if(center>=tops[i]&&center<tops[i+1]){
          const span=Math.max(1, tops[i+1]-tops[i]);
          const f=Math.min(1, Math.max(0, (center-tops[i])/span));
          const sm=f*f*(3-2*f); // smoothstep between locations
          return i+sm;
        }
      }
      return tops.length-1;
    }

    // --- Camera HUD (location dots) ---
    const hud=$('#cam-hud');
    let hudBtns=[];
    function buildHud(){
      if(!hud) return;
      hud.innerHTML='';
      hudBtns=stops.map((s,i)=>{
        const b=document.createElement('button');
        b.setAttribute('aria-label','Fly to '+s.label);
        b.innerHTML=`<span>${s.label}</span>`;
        b.addEventListener('click', ()=>{
          const y=s.el.getBoundingClientRect().top+window.scrollY-70;
          try{
            if(window.__lenis) window.__lenis.scrollTo(y, {duration:1.6});
            else window.scrollTo({top:y, behavior:'smooth'});
          }catch{ window.scrollTo({top:y, behavior:'smooth'}); }
        });
        hud.appendChild(b); return b;
      });
      markHud(0);
    }
    function markHud(idx){
      hudBtns.forEach((b,i)=>b.classList.toggle('on', i===idx));
    }
    buildHud();

    // --- Mouse parallax (look-around while flying) ---
    let tx=0, ty=0;
    addEventListener('pointermove', e=>{
      tx=(e.clientX/innerWidth-.5); ty=(e.clientY/innerHeight-.5);
    }, {passive:true});

    const clock=new THREE.Clock();
    const _cp=new THREE.Vector3(), _lk=new THREE.Vector3();
    const fogA=new THREE.Color(0x0b1230), fogB=new THREE.Color(0x1b1140), _fog=new THREE.Color();
    const vignette=$('#cam-vignette');
    let prog=0, lastActive=-1, fovCur=62;

    // expose lenis for HUD clicks
    try{
      const LenisCtor=window.Lenis;
      if(LenisCtor && !window.__lenis){
        // initSmoothScroll creates its own; HUD falls back to native smooth scroll — fine
      }
    }catch{}

    (function loop(){
      requestAnimationFrame(loop);
      if(document.hidden) return;
      const dt=Math.min(.05, clock.getDelta()||.016);
      const t=clock.getElapsedTime();
      const target=targetProgress();
      prog+=(target-prog)*.055; // damped fly — never snaps
      const vel=(scrollY-lastY)/Math.max(dt, .001); lastY=scrollY;
      smoothVel+=(vel-smoothVel)*.08;
      const speed=Math.min(Math.abs(smoothVel), 4000);

      // interpolate camera + lookAt between surrounding stops
      const i0=Math.max(0, Math.min(stops.length-1, Math.floor(prog)));
      const i1=Math.max(0, Math.min(stops.length-1, i0+1));
      const f=Math.min(1, Math.max(0, prog-i0));
      const A=stops[i0], B=stops[i1];
      if(A&&B){
        _cp.copy(A.cam).lerp(B.cam, f);
        _lk.copy(A.look).lerp(B.look, f);
        camera.position.x+=((_cp.x+tx*1.4)-camera.position.x)*.06;
        camera.position.y+=((_cp.y-ty*.9)-camera.position.y)*.06;
        camera.position.z+=((_cp.z)-camera.position.z)*.06;
        camera.lookAt(_lk.x+tx*.8, _lk.y-ty*.5, _lk.z);
        // roll into motion + fog shift per location
        camera.rotation.z+=THREE.MathUtils.clamp(-smoothVel*.00004-tx*.05, -.14, .14)*.1;
        _fog.copy(fogA).lerp(fogB, prog/Math.max(1, stops.length-1));
        scene.fog.color.copy(_fog);
        scene.background=null;
      }
      head.position.copy(camera.position);

      // FOV kick with scroll speed = rushing forward
      const fovT=62+Math.min(speed*.006, 13);
      fovCur+=(fovT-fovCur)*.08;
      if(Math.abs(fovCur-camera.fov)>.05){ camera.fov=fovCur; camera.updateProjectionMatrix(); }
      if(vignette) vignette.style.opacity=Math.min(speed*.00045, .9).toFixed(2);

      // life: shapes bob/spin, active stop's shape flares
      const active=Math.round(prog);
      shapes.forEach((m,i)=>{
        m.rotation.x+=m.userData.sx*(1+speed*.0006);
        m.rotation.y+=m.userData.sy*(1+speed*.0006);
        m.position.y=m.userData.y0+Math.sin(t*.5+m.userData.ph)*.35;
        const on=(i===active);
        const sT=on?1.35:1;
        m.userData.base+=(sT-m.userData.base)*.08;
        m.scale.setScalar(m.userData.base);
        m.material.opacity+=(((on?.62:.26))-m.material.opacity)*.08;
      });
      rings.forEach((r,i)=>{ r.rotation.z+=.0009+i*.00004+speed*.0000009; });
      pts.rotation.y=t*.012;
      pts.position.y=Math.sin(t*.2)*.4;
      // advanced life: nebulae breathe + drift, twinkles pulse
      nebs.forEach((n,i)=>{
        n.position.x=n.userData.x0+Math.sin(t*.12*n.userData.drift+n.userData.ph)*1.6;
        n.position.y+=Math.sin(t*.1+n.userData.ph)*.004;
        n.material.opacity=.38+Math.sin(t*.35+n.userData.ph)*.14;
      });
      twk.material.opacity=.32+Math.sin(t*1.4)*.2;
      twk.rotation.y=-t*.008;
      // warp streaks fall faster the quicker you scroll
      {
        const arr=wGeo.attributes.position.array;
        const fall=(2.2+speed*.012);
        for(let i=0;i<WN;i++){
          arr[i*3+1]-=wspd[i]*fall*dt*3;
          if(arr[i*3+1]<6-corridorLen){ arr[i*3+1]=6; arr[i*3]=(Math.random()-.5)*26; }
        }
        wGeo.attributes.position.needsUpdate=true;
        const warpT=Math.min(.85, speed*.0004);
        warp.material.opacity+=(warpT-warp.material.opacity)*.06;
        warp.position.y=Math.sin(t*.3)*.3;
      }
      // grids shimmer + slow march for depth reference
      grids.forEach((gr,i)=>{ gr.position.z=-6+Math.sin(t*.25+i*2)*.5; gr.material.opacity=.10+Math.sin(t*.5+i)*.04; });
      // satellites orbit their stop shapes
      sats.forEach((s,i)=>{
        const u=s.userData, p=u.parent;
        u.a+=.008*u.s*(1+speed*.0004);
        s.position.set(p.position.x+Math.cos(u.a)*u.r, p.position.y+Math.sin(u.a*1.3)*.9, p.position.z+Math.sin(u.a)*u.r*.5);
        s.rotation.x+=.02; s.rotation.y+=.025;
      });
      // beacon glides to the active stop and pulses
      {
        const am=shapes[active]||shapes[0];
        if(am){
          _bv.set(am.position.x, am.position.y, am.position.z+1.2);
          beacon.position.lerp(_bv, .07);
          beaconLight.position.copy(beacon.position);
          const pulse=1+Math.sin(t*3)*.12;
          beacon.scale.set(3.4*pulse, 3.4*pulse, 1);
          beaconLight.intensity=16+Math.sin(t*3)*6+Math.min(speed*.01, 20);
        }
      }
      // shooting star every few seconds
      shootT-=dt;
      if(shootT<=0 && shootLife<0){
        shootLife=0;
        _s0.set((Math.random()-.5)*16, camera.position.y+4+Math.random()*4, -6);
        _s1.set(_s0.x+(Math.random()>.5?8:-8), _s0.y-7-Math.random()*3, -6);
        shootT=6+Math.random()*7;
      }
      if(shootLife>=0){
        shootLife+=dt*1.4;
        if(shootLife>=1){ shootLife=-1; shoot.material.opacity=0; }
        else{
          shoot.position.lerpVectors(_s0, _s1, shootLife);
          shoot.material.opacity=Math.sin(shootLife*Math.PI)*.9;
        }
      }

      if(active!==lastActive){ lastActive=active; markHud(active); }
      renderer.render(scene, camera);
    })();
  }catch{ initFixedBackground2D(); }
}

// ================= THEME / CONTENT =================
function applyTheme(c){
  const r=document.documentElement;
  const map={color_primary:'--primary',color_primary_light:'--primary-light',color_accent:'--accent',color_accent_2:'--accent-2',color_bg:'--bg',color_bg_alt:'--bg-alt',color_text:'--text',color_text_muted:'--text-muted',color_border:'--border',color_success:'--success'};
  for(const [k,css] of Object.entries(map)) if(c[k]) r.style.setProperty(css,c[k]);
  if(c.font_family) r.style.setProperty('--font',c.font_family);
  if(c.logo_text) $('#logo-text').textContent=c.logo_text;
  // Logo image (uploaded in Admin) renders before the brand name; no default mark
  try{
    const logo = document.querySelector('.logo');
    const textEl = document.getElementById('logo-text');
    const lu = (c.logo_url||'').trim();
    if(logo && textEl){
      let img = logo.querySelector('.logo-img');
      if(lu){
        if(!img){ img=document.createElement('img'); img.className='logo-img'; img.alt='logo'; logo.insertBefore(img, textEl); }
        if(img.getAttribute('src')!==lu) img.src=lu;
      } else if(img){ img.remove(); }
      const pos = (c.logo_position || c.brand_position || 'logo_first');
      if(pos === 'brand_first'){
        if(logo.firstElementChild !== textEl) logo.insertBefore(textEl, logo.firstElementChild);
      } else if(img){
        if(logo.firstElementChild !== img) logo.insertBefore(img, textEl);
      }
    }
  }catch{}
  if(c.favicon_url && c.favicon_url.trim()){
    const furl=String(c.favicon_url).trim();
    let v=0; for(const ch of furl) v=(v*31+ch.charCodeAt(0))>>>0;
    $('#favicon').href=furl+(furl.includes('?')?'&':'?')+'v='+v.toString(36);
  }
  if(c.seo_title) {$('#seo-title').textContent=c.seo_title; document.title=c.seo_title;}
  if(c.seo_description) $('#seo-desc').content=c.seo_description;
  if(c.og_image) $('#og-image').content=c.og_image;
  if(c.reduced_motion===true || c.reduced_motion==='true') document.body.classList.add('reduced');
  else document.body.classList.remove('reduced');
  if(c.hero_title) $('#hero-title').innerHTML = c.hero_title.includes('<')? c.hero_title : c.hero_title.replace('Ready to Sell','<span>Ready to Sell</span>').replace('Built, Launched & Ready to Sell','Built, Launched & <span>Ready to Sell</span>');
  if(c.hero_subtitle) $('#hero-subtitle').textContent=c.hero_subtitle;
  if(c.portfolio_title) $('#portfolio-title').textContent=c.portfolio_title;
  if(c.portfolio_subtitle) $('#portfolio-subtitle').textContent=c.portfolio_subtitle;
  if(c.sales_proof_title) $('#sales-proof-title').textContent=c.sales_proof_title;
  if(c.sales_proof_subtitle) $('#sales-proof-subtitle').textContent=c.sales_proof_subtitle;
  if(c.experts_title) $('#experts-title').textContent=c.experts_title;
  if(c.experts_subtitle) $('#experts-subtitle').textContent=c.experts_subtitle;
  if(c.how_it_works_title) $('#how-title').textContent=c.how_it_works_title;
  if(c.how_it_works_subtitle) $('#how-subtitle').textContent=c.how_it_works_subtitle;
  if(c.how_it_works_step1_title) $('#step1-title').textContent=c.how_it_works_step1_title;
  if(c.how_it_works_step1_desc) $('#step1-desc').textContent=c.how_it_works_step1_desc;
  if(c.how_it_works_step2_title) $('#step2-title').textContent=c.how_it_works_step2_title;
  if(c.how_it_works_step2_desc) $('#step2-desc').textContent=c.how_it_works_step2_desc;
  if(c.how_it_works_step3_title) $('#step3-title').textContent=c.how_it_works_step3_title;
  if(c.how_it_works_step3_desc) $('#step3-desc').textContent=c.how_it_works_step3_desc;
  if(c.how_it_works_step4_title) $('#step4-title').textContent=c.how_it_works_step4_title;
  if(c.how_it_works_step4_desc) $('#step4-desc').textContent=c.how_it_works_step4_desc;
  if(c.pricing_title) $('#pricing-title').textContent=c.pricing_title;
  if(c.pricing_subtitle) $('#pricing-subtitle').textContent=c.pricing_subtitle;
  if(c.mentorship_title) $('#mentorship-title').textContent=c.mentorship_title;
  if(c.mentorship_subtitle) $('#mentorship-subtitle').textContent=c.mentorship_subtitle;
  if(c.mentorship_price) $('#mentorship-price').textContent=c.mentorship_price;
  if(c.testimonials_title) $('#testimonials-title').textContent=c.testimonials_title;
  if(c.testimonials_subtitle) $('#testimonials-subtitle').textContent=c.testimonials_subtitle;
  if(c.faq_title) $('#faq-title').textContent=c.faq_title;
  if(c.faq_subtitle) $('#faq-subtitle').textContent=c.faq_subtitle;
  if(c.reviews_title) { const el=$('#reviews-title'); if(el) el.textContent=c.reviews_title; }
  if(c.reviews_subtitle) { const el=$('#reviews-subtitle'); if(el) el.textContent=c.reviews_subtitle; }
  if(c.certificates_title) { const el=$('#certificates-title'); if(el) el.textContent=c.certificates_title; }
  if(c.certificates_subtitle) { const el=$('#certificates-subtitle'); if(el) el.textContent=c.certificates_subtitle; }
  if(c.lead_form_title) $('#lead-form-title').textContent=c.lead_form_title;
  if(c.lead_form_subtitle) $('#lead-form-subtitle').textContent=c.lead_form_subtitle;
  if(c.cta_band_title) $('#cta-band-title').textContent=c.cta_band_title;
  if(c.cta_band_subtitle) $('#cta-band-subtitle').textContent=c.cta_band_subtitle;
  if(c.footer_email) $('#footer-email').textContent=c.footer_email;
  if(c.footer_phone) $('#footer-phone').textContent=c.footer_phone;
  if(c.footer_address) $('#footer-address').textContent=c.footer_address;
  if(c.footer_copyright) $('#footer-copyright').textContent=c.footer_copyright + ` ${new Date().getFullYear()}`;
  else $('#footer-copyright').textContent=`© ${new Date().getFullYear()} Nexatech Dropshipping Store. All rights reserved.`;
  try{ applyMicroCopy(); }catch(e){ console.error('microcopy failed (theme still applied)', e); }
}
function setText(id, txt){ const el=document.getElementById(id); if(el) el.textContent=txt; }
function applyMicroCopy(){
  const heroImg=document.getElementById('hero-mock-img');
  const heroUrl=T('hero_image_url','').trim();
  if(heroImg && heroUrl) heroImg.src=heroUrl;
  setText('nav-link-portfolio', T('nav_link_portfolio','Portfolio'));
  setText('nav-link-proof', T('nav_link_proof','Proof'));
  setText('nav-link-pricing', T('nav_link_pricing','Pricing'));
  setText('nav-link-faq', T('nav_link_faq','FAQ'));
  setText('drawer-link-portfolio', T('nav_link_portfolio','Portfolio'));
  setText('drawer-link-proof', T('nav_link_proof','Proof'));
  setText('drawer-link-pricing', T('nav_link_pricing','Pricing'));
  setText('drawer-link-faq', T('nav_link_faq','FAQ'));
  setText('nav-whatsapp', T('nav_whatsapp_label','WhatsApp Us'));
  setText('nav-book', T('nav_book_label','Book a Call'));
  setText('drawer-wa', T('nav_whatsapp_label','WhatsApp Us'));
  setText('drawer-book', T('nav_book_label','Book a Call'));
  setText('footer-link-portfolio', T('nav_link_portfolio','Portfolio'));
  setText('footer-link-proof', T('nav_link_proof','Proof'));
  setText('footer-link-pricing', T('nav_link_pricing','Pricing'));
  setText('footer-link-faq', T('nav_link_faq','FAQ'));
  const trust=(id,b,t)=>{ const el=document.getElementById(id); if(el) el.innerHTML='✔ <b>'+sanitize(b)+'</b> '+sanitize(t); };
  trust('trust-1', T('trust_1_bold','7 to 14 Day'), T('trust_1_text','Delivery'));
  trust('trust-2', T('trust_2_bold','100%'), T('trust_2_text','Ownership'));
  trust('trust-3', T('trust_3_bold','Real Sales'), T('trust_3_text','Proof'));
  setText('hero-visual-domain', T('hero_visual_domain','nexatech.store'));
  setText('chip-1-t', T('chip_1_title','New Sale $450'));
  setText('chip-1-s', T('chip_1_sub','Elegance Mode - just now'));
  setText('chip-2-t', T('chip_2_title','Order #1029 Shipped'));
  setText('chip-2-s', T('chip_2_sub','GlowLab - 2m ago'));
  setText('chip-3-t', T('chip_3_title','3.2% Conversion Rate'));
  setText('chip-3-s', T('chip_3_sub','TechNest - today'));
  setText('portfolio-eyebrow', T('portfolio_eyebrow','Portfolio'));
  setText('proof-eyebrow', T('proof_eyebrow','Proof'));
  setText('experts-eyebrow', T('experts_eyebrow','Team'));
  setText('how-eyebrow', T('how_eyebrow','Process'));
  setText('pricing-eyebrow', T('pricing_eyebrow','Pricing'));
  setText('mentorship-eyebrow', T('mentorship_eyebrow','Mentorship'));
  setText('testimonials-eyebrow', T('testimonials_eyebrow','Testimonials'));
  setText('reviews-eyebrow', T('reviews_eyebrow','Customer Reviews'));
  setText('certs-eyebrow', T('certs_eyebrow','Awards'));
  setText('faq-eyebrow', T('faq_eyebrow','FAQ'));
  const fmap={All:'filter_all',Fashion:'filter_fashion',Beauty:'filter_beauty','Tech Gadgets':'filter_gadgets',Fitness:'filter_fitness',Home:'filter_home','Eco Friendly':'filter_eco'};
  $$('#filter-bar .pill').forEach(p=>{ const k=fmap[p.dataset.filter]; if(k) p.textContent=T(k,p.dataset.filter); });
  setText('view-full-team', T('team_view_all','View full team')+' →');
  setText('mentorship-wa', T('mentorship_cta','Chat about Mentorship')+' →');
  setText('cta-wa', T('cta_whatsapp_label','Chat on WhatsApp'));
  setText('cta-book', T('cta_book_label','Book a Free Call')+' →');
  setText('footer-tagline', T('footer_tagline','We engineer high-converting storefronts backed by real, current sales proof.'));
  setText('footer-quick-links', T('footer_quick_links','Quick Links'));
  setText('footer-contact-h', T('footer_contact','Contact'));
  setText('footer-legal-h', T('footer_legal','Legal'));
  setText('privacy-link', T('privacy_link_label','Privacy Policy'));
  setText('terms-link', T('terms_link_label','Terms of Service'));
  setText('footer-built-note', T('footer_built_note','Built with honesty — all proof numbers are live from our database.'));
  const socmap={'soc-instagram':'social_instagram_url','soc-x':'social_x_url','soc-tiktok':'social_tiktok_url','soc-linkedin':'social_linkedin_url','soc-facebook':'social_facebook_url','soc-youtube':'social_youtube_url'};
  for(const [id,key] of Object.entries(socmap)){
    const el=document.getElementById(id); if(!el) continue;
    const url=(CONTENT[key]||'').trim();
    if(url){ el.href=url; el.style.display=''; } else { el.style.display='none'; }
  }
  setText('f-label-name', T('form_label_name','Full Name *'));
  setText('f-label-store', T('form_label_store','Desired Brand / Niche Name *'));
  setText('f-label-niche', T('form_label_niche','Preferred Niche *'));
  setText('f-label-niche-other', T('form_label_niche_other','Other niche — tell us'));
  setText('f-label-investment', T('form_label_investment','Investment Range *'));
  setText('f-label-status', T('form_label_status','Current Status *'));
  setText('f-label-scammed', T('form_label_scammed','Previously lost money to a fake mentor/agency? *'));
  setText('f-label-scam-details', T('form_label_scam_details','What happened? (so we can help better)'));
  setText('f-label-whatsapp', T('form_label_whatsapp','WhatsApp number *'));
  setText('f-label-email', T('form_label_email','Business Email *'));
  setText('f-label-contact-time', T('form_label_contact_time','Preferred contact time / timezone'));
  setText('f-label-source', T('form_label_source','How did you hear about us?'));
  setText('f-label-traffic', T('form_label_traffic','Traffic-source plan'));
  setText('f-consent-text', T('form_consent_text','I agree to be contacted via WhatsApp/Email about my application. *'));
  ['f-req-1','f-req-2','f-req-3','f-req-4','f-req-5','f-req-6'].forEach(id=> setText(id, T('form_required','Required')));
  setText('f-wa-invalid', T('form_wa_invalid','Enter a valid WhatsApp number'));
  setText('f-email-invalid', T('form_email_invalid','Enter a valid email'));
  setText('f-consent-required', T('form_consent_required','Consent required'));
  const ph=(name,key,fb)=>{ const el=document.querySelector(`#lead-form [name="${name}"]`); if(el) el.placeholder=T(key,fb); };
  ph('name','form_ph_name','Ada Lovelace'); ph('storeName','form_ph_store','GlowLab');
  ph('preferredNicheOther','form_ph_niche_other','e.g. Eco-friendly baby products');
  ph('scamDetails','form_ph_scam_details','Briefly describe...');
  ph('whatsapp','form_ph_whatsapp','812 345 6789'); ph('email','form_ph_email','you@example.com');
  ph('preferredContactTime','form_ph_contact_time','e.g. Evenings WAT');
  setText('btn-prev', '← '+T('form_back','Back'));
  setText('btn-next', T('form_continue','Continue')+' →');
  setText('btn-submit', T('form_submit','Submit Application & Book Strategy Call'));
  setText('chat-title', T('chat_title','Nexatech Assistant'));
  setText('chat-new', T('chat_new','+ New Chat'));
  setText('chat-recent', T('chat_recent','Recent')+' ▾');
  setText('chat-whatsapp', T('chat_whatsapp_btn','WhatsApp Us'));
  const ci=$('#chat-input'); if(ci) ci.placeholder=T('chat_placeholder','Type a message...');
  setText('chat-send', T('chat_send','Send'));
}

// Fetch content
async function loadContent(){
  const r=await fetch('/api/content'); const j=await r.json();
  CONTENT=j.content; STATS=j.stats; SCARCITY=j.scarcity;
  applyTheme(CONTENT);
  const badgeText = SCARCITY.text || CONTENT.hero_badge || 'Only 5 build slots left this month';
  $('#hero-badge-text').textContent=badgeText;
  const waNum=CONTENT.whatsapp_number||'2348123456789';
  let calRaw=(CONTENT.calendly_url||'').trim();
  if(calRaw && !/^https?:\/\//i.test(calRaw) && !calRaw.startsWith('/')) calRaw='https://'+calRaw;
  const calendly=calRaw || whatsappLink(waNum, `Hi Nexatech! I'd like to book a free strategy call.`);
  const heroWA = CONTENT.hero_cta_secondary || 'Chat on WhatsApp';
  const heroBook = CONTENT.hero_cta_primary || 'Book a Free Strategy Call';
  $('#hero-wa').textContent=heroWA; $('#hero-wa').href=whatsappLink(waNum, `Hi Nexatech! I'm interested in a dropshipping store can we talk?`);
  $('#hero-book').textContent=heroBook+' →'; $('#hero-book').href=calendly;
  $('#nav-whatsapp').href=whatsappLink(waNum, `Hi Nexatech! Quick question about your store packages.`);
  $('#nav-book').href=calendly;
  $('#drawer-wa').href=whatsappLink(waNum, `Hi Nexatech! Quick question about your store packages.`);
  $('#drawer-book').href=calendly;
  $('#cta-wa').href=whatsappLink(waNum, `Hi Nexatech! I'm ready to own a store that sells what's the next step?`);
  $('#cta-book').href=calendly;
  for(const id of ['nav-whatsapp','nav-book','hero-wa','hero-book','cta-wa','cta-book','mentorship-wa']){
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',()=>track('cta_click',id,{href:el.href}));
  }
  const sRes=await fetch('/api/sections'); SECTIONS=await sRes.json();
  applySections();
  renderPricing();
  renderMentorship();
  renderFAQ();
}
function applySections(){
  SECTIONS.sort((a,b)=>a.display_order-b.display_order);
  for(const sec of SECTIONS){
    const el=document.querySelector(`[data-section="${sec.key}"]`);
    if(!el) continue;
    el.style.display = sec.visible ? '' : 'none';
    if(sec.animation_enabled===0) el.classList.add('no-anim');
    else el.classList.remove('no-anim');
  }
}

// Marquee
function renderMarquee(){
  const marquee=$('#marquee');
  if(!marquee) return;
  const items=[
    {label:T('stat_stores_label','Stores Launched'), value: parseInt(STATS.stores_launched||47,10), kind:'n'},
    {label:T('stat_sales_label','Verified Sales'), value: parseInt(STATS.verified_sales||38200000,10), fmt:v=>'$'+(v/1000000).toFixed(1)+'M', kind:'m'},
    {label:T('stat_clients_label','Happy Clients'), value: parseInt(STATS.happy_clients||41,10), kind:'n'},
    {label:T('stat_launch_label','Avg Launch'), value: parseInt(STATS.avg_launch_days||11,10), fmt:v=>v+' days', kind:'d'},
  ];
  function makeStat(it){
    const d=document.createElement('div'); d.className='stat';
    const fmt = it.fmt ? it.fmt(it.value) : String(it.value);
    d.innerHTML=`<strong data-count="${it.value}" data-fmt="${it.fmt?'1':'0'}" data-kind="${it.kind}">${it.fmt?it.fmt(0):0}</strong><span>${sanitize(it.label)}<br><small style="text-transform:none;letter-spacing:0;color:var(--text-muted)">${sanitize(fmt)}</small></span>`;
    return d;
  }
  const row=document.createElement('div'); row.style.display='flex';
  items.forEach(it=>row.appendChild(makeStat(it)));
  const row2=row.cloneNode(true);
  marquee.appendChild(row); marquee.appendChild(row2);
  const strongs=marquee.querySelectorAll('strong');
  const obs=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        strongs.forEach(s=>{
          const target=parseInt(s.dataset.count,10);
          const isFmt=s.dataset.fmt==='1';
          let cur=0; const step=Math.ceil(target/60);
          const iv=setInterval(()=>{
            cur=Math.min(target, cur+step);
            if(isFmt){
              const kind=s.dataset.kind||'';
              if(kind==='m') s.textContent='$'+(cur/1000000).toFixed(1)+'M';
              else if(kind==='d') s.textContent=cur+' days';
              else s.textContent=cur;
            } else s.textContent=cur;
            if(cur>=target) clearInterval(iv);
          },20);
        });
        obs.disconnect();
      }
    });
  },{threshold:.3});
  obs.observe(marquee);
}

// Portfolio
async function loadPortfolio(){
  const r=await fetch('/api/media?type=portfolio'); PORTFOLIO=await r.json();
  renderPortfolio('All');
}
function renderPortfolio(filter){
  const grid=$('#portfolio-grid'); if(!grid) return; grid.innerHTML='';
  const filtered = filter==='All'? PORTFOLIO : PORTFOLIO.filter(p=> (p.category||'').toLowerCase()===filter.toLowerCase() || (p.tags||'').toLowerCase().includes(filter.toLowerCase()));
  if(filtered.length===0){
    grid.innerHTML='<p class="sub">'+sanitize(T('portfolio_empty','No stores in this category yet — check back soon or view All.'))+'</p>';
    return;
  }
  filtered.forEach((item, idx)=>{
    const card=document.createElement('div'); card.className='card spotlight'; card.setAttribute('data-tilt',''); card.dataset.tiltMax='6';
    card.style.animationDelay=(idx*60)+'ms';
    const kind = mediaKind(item.url);
    const isVideo = kind==='video';
    const isEmbed = kind==='youtube'||kind==='vimeo'||kind==='drive';
    const embedSrc = kind==='youtube'?youTubeEmbed(item.url):kind==='vimeo'?vimeoEmbed(item.url):kind==='drive'?driveEmbed(item.url):'';
    const media = isEmbed
      ? `<iframe src="${embedSrc}" style="width:100%;height:100%;border:0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><span style="position:absolute;right:10px;top:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:999px;font-size:10px">VIDEO</span>`
      : isVideo
        ? `<video src="${item.url}" muted loop playsinline preload="metadata" poster=""></video><span style="position:absolute;right:10px;top:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:999px;font-size:10px">VIDEO</span>`
        : `<img src="${item.url}" alt="${sanitize(item.alt_text||item.caption)}" loading="lazy" onerror="this.style.opacity=.25">`;
    card.innerHTML=`<div class="card-media">${media}<div class="overlay"><span class="tag">${sanitize(item.category||'Store')}</span><div class="result">${sanitize(item.result_stat||'')}</div><div style="font-size:13px;font-weight:700;margin-top:4px">${sanitize(item.caption||'')}</div><div class="view">${sanitize(T('modal_view_case','View Case Study'))} →</div></div></div>`;
    requestAnimationFrame(()=> setTimeout(()=>card.classList.add('in'), 30+idx*40));
    card.addEventListener('click', ()=> openModal(item, filtered));
    if(isVideo){
      const v=card.querySelector('video');
      card.addEventListener('mouseenter', ()=> v.play().catch(()=>{}));
      card.addEventListener('mouseleave', ()=> {v.pause(); v.currentTime=0;});
      const io=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting) v.play().catch(()=>{}); else v.pause(); })},{threshold:.6});
      io.observe(card);
    }
    if(!reducedMotion()){
      const io2=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting) card.classList.add('in'); })},{threshold:.15});
      io2.observe(card);
    } else card.classList.add('in');
    grid.appendChild(card);
  });
  initTilt();
}
document.addEventListener('click', e=>{
  const pill=e.target?.closest?.('.pill');
  if(pill && pill.dataset && pill.dataset.filter){
    $$('.pill').forEach(p=>p.classList.remove('active'));
    pill.classList.add('active');
    const f=pill.dataset.filter;
    renderPortfolio(f);
    track('portfolio_filter', f);
  }
});

// Modal
function openModal(item, list){
  MODAL_ITEMS=list; MODAL_INDEX=list.findIndex(x=>x.id===item.id);
  updateModal();
  $('#portfolio-modal').classList.add('open');
  document.body.style.overflow='hidden';
  track('portfolio_view', String(item.id), {category:item.category});
}
function updateModal(){
  const item=MODAL_ITEMS[MODAL_INDEX];
  if(!item) return;
  const mediaBox=$('#modal-media');
  const kind=mediaKind(item.url);
  if(mediaBox){
    mediaBox.innerHTML='';
    const closeBtn=document.createElement('button'); closeBtn.className='close-x'; closeBtn.id='modal-close'; closeBtn.textContent='✕';
    closeBtn.addEventListener('click', closeModal);
    const prev=document.createElement('button'); prev.className='carousel-btn prev'; prev.id='modal-prev'; prev.textContent='‹';
    prev.addEventListener('click', e=>{ e.stopPropagation(); MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal(); });
    const next=document.createElement('button'); next.className='carousel-btn next'; next.id='modal-next'; next.textContent='›';
    next.addEventListener('click', e=>{ e.stopPropagation(); MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal(); });
    if(kind==='youtube'||kind==='vimeo'||kind==='drive'){
      const src=kind==='youtube'?youTubeEmbed(item.url):kind==='vimeo'?vimeoEmbed(item.url):driveEmbed(item.url);
      const f=document.createElement('iframe');
      f.src=src; f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen=true; f.style.cssText='width:100%;height:100%;border:0;background:#05070f;position:absolute;inset:0';
      mediaBox.appendChild(f);
    } else if(kind==='video'){
      const v=document.createElement('video');
      v.id='modal-video'; v.controls=true; v.autoplay=true; v.muted=true; v.loop=true; v.playsInline=true;
      v.preload='auto'; v.style.cssText='width:100%;height:100%;object-fit:cover;background:#05070f';
      v.onloadedmetadata=()=>{ try{ if(v.videoHeight>v.videoWidth){ v.style.objectFit='contain'; } }catch{} };
      v.onerror=()=>{ const p=document.createElement('div'); p.style.cssText='color:#F87171;padding:24px;text-align:center;font-size:13px'; p.textContent='Video failed to load — check the URL or re-upload the file.'; mediaBox.appendChild(p); };
      const s=document.createElement('source'); s.src=item.url;
      const ext=stripUrlParams(item.url).split('.').pop().toLowerCase();
      s.type=ext==='webm'?'video/webm':ext==='mov'?'video/quicktime':ext==='m4v'?'video/x-m4v':ext==='ogv'||ext==='ogg'?'video/ogg':'video/mp4';
      v.appendChild(s);
      mediaBox.appendChild(v);
      v.play().catch(()=>{});
    } else {
      const im=document.createElement('img');
      im.id='modal-img'; im.alt=item.alt_text||item.caption||''; im.style.cssText='width:100%;height:100%;object-fit:cover';
      im.onerror=()=>{ im.style.opacity=.25; };
      im.src=item.url;
      mediaBox.appendChild(im);
    }
    mediaBox.appendChild(closeBtn); mediaBox.appendChild(prev); mediaBox.appendChild(next);
  }
  $('#modal-tag').textContent=item.category||'Store';
  $('#modal-title').textContent=item.caption||'Store';
  $('#modal-result').textContent=item.result_stat||'';
  $('#modal-desc').textContent=item.case_study_text||T('modal_fallback_desc','A fully-configured dropshipping store built for conversions — premium theme, winning products, and automated fulfillment.');
  const waNum=CONTENT.whatsapp_number||'2348123456789';
  $('#modal-cta').textContent=T('modal_cta','Start a Store Like This')+' →';
  $('#modal-cta').href=whatsappLink(waNum, `Hi Nexatech! I love the ${item.category||''} store "${item.caption||''}" I want a store like this. How do we start?`);
  $('#modal-cta').onclick=()=>track('cta_click','modal-cta',{store:item.caption});
}
function closeModal(){
  $('#portfolio-modal').classList.remove('open');
  document.body.style.overflow='';
}
document.addEventListener('click', e=>{
  if(e.target?.id==='modal-close' || e.target?.closest?.('#modal-close')) closeModal();
  if(e.target?.id==='portfolio-modal') closeModal();
  if(e.target?.id==='modal-prev' || e.target?.closest?.('#modal-prev')){ MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal(); }
  if(e.target?.id==='modal-next' || e.target?.closest?.('#modal-next')){ MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal(); }
});
document.addEventListener('keydown', e=>{
  if(!$('#portfolio-modal').classList.contains('open')) return;
  if(e.key==='Escape') closeModal();
  if(e.key==='ArrowLeft') {MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal();}
  if(e.key==='ArrowRight') {MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal();}
});
let sx=0;
document.addEventListener('touchstart', e=>{ if(e.target?.closest?.('#modal-media')) sx=e.touches[0].clientX; }, {passive:true});
document.addEventListener('touchend', e=>{
  if(!e.target?.closest?.('#modal-media')) return;
  const dx=e.changedTouches[0].clientX - sx;
  if(Math.abs(dx)>40){
    if(dx<0) {MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal();}
    else {MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal();}
  }
});

// Proof & Testimonials & Team & Reviews & Certificates
async function loadMedia(){
  const proofR=await fetch('/api/media?type=sales_proof'); const proof=await proofR.json();
  const pGrid=$('#proof-grid'); if(pGrid){ pGrid.innerHTML='';
  proof.forEach(item=>{
    const c=document.createElement('div'); c.className='proof-card reveal spotlight'; c.setAttribute('data-tilt','');
    const k=mediaKind(item.url);
    if(k==='youtube') c.innerHTML=`<iframe src="${youTubeEmbed(item.url)}" style="width:100%;aspect-ratio:16/10;border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    else if(k==='vimeo') c.innerHTML=`<iframe src="${vimeoEmbed(item.url)}" style="width:100%;aspect-ratio:16/10;border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    else if(k==='drive') c.innerHTML=`<iframe src="${driveEmbed(item.url)}" style="width:100%;aspect-ratio:16/10;border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    else if(k==='video') c.innerHTML=`<video src="${item.url}" controls muted loop playsinline preload="metadata" style="width:100%;border-radius:12px;background:#05070f"></video><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    else c.innerHTML=`<img src="${item.url}" alt="${sanitize(item.alt_text||'proof')}" loading="lazy" onerror="this.style.opacity=.25"><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    pGrid.appendChild(c);
  });}
  const testiR=await fetch('/api/media?type=testimonials'); const testi=await testiR.json();
  const tGrid=$('#testi-grid'); if(tGrid){ tGrid.innerHTML='';
  testi.forEach(item=>{
    const k=mediaKind(item.url);
    const isVideo=k==='video';
    const isEmbed=k==='youtube'||k==='vimeo'||k==='drive';
    const media=isEmbed?`<div style="width:42px;height:42px;border-radius:50%;background:#0B1220;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px">▶</div>`:(isVideo?`<video src="${item.url}" muted loop playsinline preload="metadata" style="width:42px;height:42px;border-radius:50%;object-fit:cover"></video>`:`<img src="${item.url}" alt="" onerror="this.style.opacity=.25">`);
    const el=document.createElement('div'); el.className='testi reveal spotlight';
    el.innerHTML=`<q>${sanitize(item.caption||T('testi_fallback','Great experience with Nexatech.'))}</q><div class="who">${media}<div><b>${sanitize(item.alt_text||'Client')}</b><br><small style="color:var(--text-muted)">${sanitize(item.result_stat||T('testi_role_fallback','Verified buyer'))}</small></div></div>`;
    if(isVideo){ const v=el.querySelector('video'); if(v) v.play().catch(()=>{}); }
    tGrid.appendChild(el);
  });
  try{ initTestiCarousel(); }catch(e){ console.warn('testi carousel', e.message); }
  }
  try{
    const revR=await fetch('/api/media?type=reviews'); const reviews=await revR.json();
    const rGrid=$('#reviews-grid'); const empty=$('#reviews-empty');
    if(rGrid){
      rGrid.innerHTML='';
      if(reviews.length===0){
        if(empty) { empty.textContent=T('reviews_empty','No reviews uploaded yet — add them in Admin → Media Manager → Review Screenshots.'); empty.classList.remove('hidden'); }
      } else {
        if(empty) empty.classList.add('hidden');
        reviews.forEach((item, idx)=>{
          const kind=mediaKind(item.url);
          const isVideo=kind==='video';
          const isEmbed=kind==='youtube'||kind==='vimeo'||kind==='drive';
          const embedSrc=isEmbed?(kind==='youtube'?youTubeEmbed(item.url):kind==='vimeo'?vimeoEmbed(item.url):driveEmbed(item.url)):'';
          const card=document.createElement('div'); card.className='reviews-card reveal' + (isVideo ? ' portrait' : '');
          card.style.transitionDelay=(idx*50)+'ms';
          card.innerHTML = isEmbed
            ? `<iframe src="${embedSrc}" style="width:100%;aspect-ratio:16/10;border:0" loading="lazy" allowfullscreen></iframe><div class="play-badge"><span>▶</span></div><div class="caption">${sanitize(item.caption||T('review_video_label','Video Review'))}</div>`
            : isVideo
            ? `<video src="${item.url}" muted loop playsinline preload="metadata" poster=""></video><div class="play-badge"><span>▶</span></div><div class="caption">${sanitize(item.caption||T('review_video_label','Video Review'))}</div>`
            : `<img src="${item.url}" alt="${sanitize(item.alt_text||item.caption||T('review_caption_fallback','Customer Review'))}" loading="lazy" onerror="this.style.opacity=.25"><div class="caption">${sanitize(item.caption||T('review_caption_fallback','Customer Review'))}</div>`;
          card.addEventListener('click', ()=>{
            MODAL_ITEMS=reviews; MODAL_INDEX=reviews.findIndex(x=>x.id===item.id);
            updateModal();
            $('#portfolio-modal').classList.add('open');
            document.body.style.overflow='hidden';
            track('reviews_view', String(item.id), {type: (isVideo||isEmbed)?'video':'image'});
          });
          if(isVideo){
            const v=card.querySelector('video');
            card.addEventListener('mouseenter', ()=> v.play().catch(()=>{}));
            card.addEventListener('mouseleave', ()=> {v.pause(); v.currentTime=0;});
          }
          rGrid.appendChild(card);
          setTimeout(()=> card.classList.add('in'), 80+idx*60);
        });
      }
    }
  }catch(e){ console.error('reviews load',e); }
  try{
    const certR=await fetch('/api/media?type=certificates'); const certs=await certR.json();
    const cGrid=$('#certs-grid'); const cEmpty=$('#certs-empty');
    if(cGrid){
      cGrid.innerHTML='';
      if(certs.length===0){
        if(cEmpty) { cEmpty.textContent=T('certs_empty','No certificates uploaded yet — add them in Admin → Media Manager → Certificates & Awards.'); cEmpty.classList.remove('hidden'); }
      } else {
        if(cEmpty) cEmpty.classList.add('hidden');
        certs.forEach((item, idx)=>{
          const card=document.createElement('div'); card.className='certs-card reveal';
          card.style.transitionDelay=(idx*50)+'ms';
          card.innerHTML=`<img src="${item.url}" alt="${sanitize(item.alt_text||item.caption||T('cert_caption_fallback','Certificate'))}" loading="lazy"><div class="caption">${sanitize(item.caption||T('cert_caption_fallback','Certificate'))}</div>`;
          card.addEventListener('click', ()=>{
            MODAL_ITEMS=certs; MODAL_INDEX=certs.findIndex(x=>x.id===item.id);
            updateModal();
            $('#portfolio-modal').classList.add('open');
            document.body.style.overflow='hidden';
            track('certificate_view', String(item.id));
          });
          cGrid.appendChild(card);
          setTimeout(()=> card.classList.add('in'), 80+idx*60);
        });
      }
    }
  }catch(e){ console.error('certs load',e); }
  const teamR=await fetch('/api/team'); const team=await teamR.json();
  const tGrid2=$('#team-grid'); if(tGrid2){ tGrid2.innerHTML='';
  let teamExpanded=false;
  function renderTeamList(){
    tGrid2.innerHTML='';
    const vis=teamExpanded?team:team.slice(0,4);
    vis.forEach((m,idx)=>{
      const card=document.createElement('div'); card.className='team-card in spotlight';
      card.style.transitionDelay=(idx*80)+'ms';
      card.innerHTML=`<img src="${m.photo_url||'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200'}" alt="${sanitize(m.name)}"><div><h4>${sanitize(m.name)}</h4><small>${sanitize(m.role)}</small><p>${sanitize(m.credibility_note)}</p>${m.social_url?`<a href="${m.social_url}" target="_blank" style="font-size:12px;color:var(--accent-2)">LinkedIn →</a>`:''}</div>`;
      tGrid2.appendChild(card);
      setTimeout(()=>card.classList.add('in'), 200+idx*120);
    });
    const more=$('#view-full-team');
    if(more){
      if(team.length>4){
        more.classList.remove('hidden');
        more.textContent=(teamExpanded ? 'Show less' : T('team_view_all','View full team')+' →');
      } else more.classList.add('hidden');
    }
  }
  renderTeamList();
  $('#view-full-team')?.addEventListener('click', e=>{ e.preventDefault(); teamExpanded=!teamExpanded; renderTeamList(); document.getElementById('experts')?.scrollIntoView({behavior:'smooth'}); });
  }
  initTilt();
}

// Pricing
function renderPricing(){
  const grid=$('#pricing-grid'); if(!grid) return;
  const tiers=[
    {key:'starter', name:CONTENT.pricing_starter_name||'Starter', price:CONTENT.pricing_starter_price||'$149', features:parseJSON(CONTENT.pricing_starter_features, ["1 Niche Store (Premium Theme)","5 Winning Products Researched","Supplier & Fulfillment Setup","Payment Gateway Integration","Basic Support (14 days)"]), wa:CONTENT.pricing_starter_whatsapp||'', popular:false},
    {key:'pro', name:CONTENT.pricing_pro_name||'Pro', price:CONTENT.pricing_pro_price||'$299', features:parseJSON(CONTENT.pricing_pro_features, ["Everything in Starter","10 Winning Products + Ad Angles","Custom Branding & Logo","Abandoned Cart Automation","Priority Support (30 days)"]), wa:CONTENT.pricing_pro_whatsapp||'', popular:true},
    {key:'elite', name:CONTENT.pricing_elite_name||'Elite', price:CONTENT.pricing_elite_price||'$599', features:parseJSON(CONTENT.pricing_elite_features, ["Everything in Pro","20 Winning Products + Creatives","3 Custom Ad Creatives","1-on-1 Growth Call (60 min)","Extended Support (60 days)"]), wa:CONTENT.pricing_elite_whatsapp||'', popular:false},
  ];
  grid.innerHTML='';
  const waNum=CONTENT.whatsapp_number||'2348123456789';
  tiers.forEach(t=>{
    const el=document.createElement('div'); el.className='price-card spotlight'+(t.popular?' popular':''); el.setAttribute('data-tilt','');
    el.innerHTML=`${t.popular?'<span class="popular-badge">'+sanitize(T('pricing_popular_badge','Most Popular'))+'</span>':''}<div class="eyebrow" style="margin:0">${sanitize(t.name)}</div><div class="price">${sanitize(t.price)}</div><ul>${t.features.map(f=>`<li>${sanitize(f)}</li>`).join('')}</ul><a class="btn ${t.popular?'btn-primary btn-glow':'btn-ghost'}" href="${whatsappLink(waNum, t.wa||('Hi Nexatech! I want the '+t.name+' plan ('+t.price+').'))}" target="_blank" style="margin-top:auto">${sanitize(T('pricing_cta_template','Choose {name}').replace('{name}', t.name))} →</a>`;
    const a=el.querySelector('a'); a.addEventListener('click',()=>track('cta_click','pricing-'+t.key,{price:t.price}));
    grid.appendChild(el);
  });
  initTilt();
}
function renderMentorship(){
  const bullets=parseJSON(CONTENT.mentorship_bullets, ["Weekly 1:1 strategy calls until first sale","Ad account setup & first campaign launch together","Product testing framework & kill/scale rules","Store CRO audits & A/B tests"]);
  const ul=$('#mentorship-bullets'); if(!ul) return; ul.innerHTML='';
  bullets.forEach(b=>{ const li=document.createElement('li'); li.textContent=b; ul.appendChild(li); });
  const waNum=CONTENT.whatsapp_number||'2348123456789';
  const waMsg=CONTENT.pricing_mentorship_whatsapp||'Hi Nexatech! Tell me about the Mentorship (Results Before Payment).';
  const a=$('#mentorship-wa'); if(a){ a.href=whatsappLink(waNum, waMsg); a.addEventListener('click',()=>track('cta_click','mentorship-wa')); }
}
function renderFAQ(){
  const items=parseJSON(CONTENT.faq_items, []);
  const list=$('#faq-list'); if(!list) return; list.innerHTML='';
  items.forEach((it, idx)=>{
    const div=document.createElement('div'); div.className='faq-item'+(idx===0?' open':'');
    div.innerHTML=`<button class="faq-q" aria-expanded="${idx===0}"><span>${sanitize(it.q)}</span><span class="chev">⌄</span></button><div class="faq-a"><div style="color:var(--text-muted);font-size:14px">${sanitize(it.a)}</div></div>`;
    const btn=div.querySelector('button');
    btn.addEventListener('click',()=>{
      const open=div.classList.contains('open');
      $$('.faq-item').forEach(d=>d.classList.remove('open'));
      $$('.faq-q').forEach(b=>b.setAttribute('aria-expanded','false'));
      if(!open){ div.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
    });
    list.appendChild(div);
  });
}
function parseJSON(v, fallback){
  if(Array.isArray(v)) return v;
  if(typeof v==='string'){ try{const p=JSON.parse(v); return Array.isArray(p)?p:fallback;}catch{return fallback;}}
  return fallback;
}

// Lead Form multi-step
let currentStep=1;
const totalSteps=3;
function showStep(n){
  currentStep=n;
  $$('#lead-form [data-step]').forEach(el=>{
    const s=parseInt(el.dataset.step,10);
    el.classList.toggle('hidden', s!==n);
  });
  $('#bar1').classList.toggle('on', n>=1);
  $('#bar2').classList.toggle('on', n>=2);
  $('#bar3').classList.toggle('on', n>=3);
  const labels=[T('form_step_1','Step 1 of 3 — Vision'),T('form_step_2','Step 2 of 3 — Qualification'),T('form_step_3','Step 3 of 3 — Contact & Delivery')];
  $('#step-indicator').textContent=labels[n-1];
  $('#btn-prev').classList.toggle('hidden', n===1);
  $('#btn-next').classList.toggle('hidden', n===totalSteps);
  $('#btn-submit').classList.toggle('hidden', n!==totalSteps);
}
function validateStep(n){
  let ok=true;
  const container=document.querySelector(`#lead-form [data-step="${n}"]`);
  if(!container) return true;
  const fields=container.querySelectorAll('[required]');
  fields.forEach(inp=>{
    const field=inp.closest('.field');
    let valid=true;
    if(inp.type==='checkbox') valid=inp.checked;
    else if(inp.type==='email') valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value.trim());
    else if(inp.name==='whatsapp') valid=/^\+?[0-9\s\-()]{7,20}$/.test(inp.value.trim()) && inp.value.replace(/\D/g,'').length>=7;
    else valid=inp.value.trim()!=='';
    if(field) field.classList.toggle('invalid', !valid);
    if(!valid) ok=false;
  });
  return ok;
}
function initLeadForm(){
  $('#btn-next')?.addEventListener('click', ()=>{
    if(!validateStep(currentStep)) return;
    if(currentStep<totalSteps) { track('form_next', 'step'+currentStep); showStep(currentStep+1); }
  });
  $('#btn-prev')?.addEventListener('click', ()=> showStep(currentStep-1));
  document.querySelector('select[name="preferredNiche"]')?.addEventListener('change', e=>{
    $('#other-niche-field').classList.toggle('hidden', e.target.value!=='Other');
  });
  document.querySelector('select[name="wasScammed"]')?.addEventListener('change', e=>{
    $('#scam-details-field').classList.toggle('hidden', e.target.value!=='yes');
  });
  let started=false;
  $('#lead-form')?.addEventListener('focusin', ()=>{
    if(!started){ started=true; track('form_start','lead_form'); }
  });
  $('#lead-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    if(!validateStep(3)) return;
    const fd=new FormData(e.target);
    const wa_code=fd.get('wa_code')||'+234';
    const wa_raw=fd.get('whatsapp')||'';
    const fullWA = String(wa_raw).startsWith('+')? wa_raw : wa_code + String(wa_raw).replace(/^0+/,'');
    const payload={
      name: fd.get('name')?.trim(),
      storeName: fd.get('storeName')?.trim(),
      preferredNiche: fd.get('preferredNiche'),
      preferredNicheOther: fd.get('preferredNicheOther')||'',
      investmentRange: fd.get('investmentRange'),
      storeStatus: fd.get('storeStatus'),
      wasScammed: fd.get('wasScammed'),
      scamDetails: fd.get('scamDetails')||'',
      whatsapp: String(fullWA).trim(),
      email: fd.get('email')?.trim(),
      preferredContactTime: fd.get('preferredContactTime')||'',
      source: fd.get('source')||'',
      trafficPlan: fd.get('trafficPlan')||'',
      consent: fd.get('consent')==='on' || fd.get('consent')==='true' || !!fd.get('consent'),
      submittedAt: new Date().toISOString(),
      pageUrl: location.href,
      sessionId,
      utm: getUTM(),
      honeypot: fd.get('honeypot')||''
    };
    const btn=$('#btn-submit');
    const msg=$('#form-msg');
    btn.disabled=true; btn.textContent=T('form_submitting','Submitting...'); msg.textContent='';
    try{
      const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const j=await res.json();
      if(!res.ok) throw new Error(j.error||'Submission failed');
      msg.style.color='var(--success)';
      const emailEcho = payload.email ? ' '+T('form_success_email_note',"We've sent details to {email} — please check your inbox (and spam folder).").replace('{email}', payload.email) : '';
      msg.textContent=(j.message||'Application received.') + emailEcho;
      e.target.reset(); showStep(1);
      track('form_complete','lead_form',{leadId:j.leadId});
    }catch(err){
      msg.style.color='#EF4444'; msg.textContent=err.message || 'Something went wrong. Please try again or chat on WhatsApp.';
    }finally{
      btn.disabled=false; btn.textContent=T('form_submit','Submit Application & Book Strategy Call');
    }
  });
  showStep(1);
}

// Hero 2D particle network (kept as depth layer under WebGL)
function initParticles(){
  const canvas=$('#hero-particles'); if(!canvas) return;
  if(reducedMotion()) { canvas.style.display='none'; return; }
  const ctx=canvas.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1, 2);
  let w,h, particles=[], raf, hidden=false;
  const isMobile = window.innerWidth<=768;
  const count = isMobile? 16 : 34;
  function resize(){
    w=canvas.clientWidth||canvas.parentElement.clientWidth; h=canvas.clientHeight||canvas.parentElement.clientHeight;
    canvas.width=w*dpr; canvas.height=h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function rand(a,b){return a+Math.random()*(b-a);}
  function init(){
    particles=[];
    for(let i=0;i<count;i++){
      particles.push({x:rand(0,w), y:rand(0,h), vx:rand(-.25,.25), vy:rand(-.25,.25), r:rand(1.2,2.2)});
    }
  }
  let mouse={x:.5,y:.5, active:false};
  document.addEventListener('mousemove', e=>{
    if(window.innerWidth<=768) return;
    const rect=canvas.getBoundingClientRect();
    mouse.x=(e.clientX-rect.left)/rect.width - .5;
    mouse.y=(e.clientY-rect.top)/rect.height - .5;
    mouse.active=true;
  });
  document.addEventListener('visibilitychange', ()=>{
    hidden=document.hidden;
    if(hidden) cancelAnimationFrame(raf);
    else if(!hidden) loop();
  });
  let scrollY=0;
  window.addEventListener('scroll', ()=>{ scrollY=window.scrollY; }, {passive:true});
  function loop(){
    if(hidden) return;
    ctx.clearRect(0,0,w,h);
    const parX= mouse.active ? mouse.x*6 : 0;
    const parY= mouse.active ? mouse.y*6 : 0;
    const sPar= Math.min(scrollY*0.04, 12);
    for(let i=0;i<particles.length;i++){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
      const px=p.x + parX * (0.5 + (p.r/2));
      const py=p.y + parY * (0.5 + (p.r/2)) - sPar*0.2;
      for(let j=i+1;j<particles.length;j++){
        const q=particles[j];
        const qx=q.x + parX*0.5, qy=q.y + parY*0.5 - sPar*0.2;
        const dx=px-qx, dy=py-qy; const dist=Math.hypot(dx,dy);
        if(dist<110){
          ctx.strokeStyle=`rgba(0,209,255,${(1-dist/110)*0.20})`;
          ctx.lineWidth=0.7;
          ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(qx,qy); ctx.stroke();
        }
      }
    }
    particles.forEach(p=>{
      const px=p.x + parX*0.8, py=p.y + parY*0.8 - sPar*0.15;
      ctx.beginPath(); ctx.arc(px,py,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(124,58,237,0.6)';
      ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,p.r*0.45,0,Math.PI*2); ctx.fillStyle='rgba(0,209,255,0.95)'; ctx.fill();
    });
    raf=requestAnimationFrame(loop);
  }
  resize(); init(); loop();
  window.addEventListener('resize', ()=>{ resize(); init(); });
}

// Chips loop
function initChips(){
  const chips=[$('#chip-1'),$('#chip-2'),$('#chip-3')];
  let idx=0;
  function show(){
    chips.forEach(c=>c && c.classList.remove('show'));
    const cur=chips[idx];
    if(cur){ cur.classList.add('show'); }
    idx=(idx+1)%chips.length;
  }
  show(); setInterval(show, 3200);
}

// Testimonials infinite conveyor — slides 1 card left every 3.4s,
// then sends that card to the back to fetch the next one (seamless loop).
// Shows 3-up desktop / 2 tablet / 1 mobile. Pause on hover/touch/offscreen.
let __testiTimer=null, __testiIdx=0;
function initTestiCarousel(){
  const track=$('#testi-grid');
  const viewport=$('#testi-viewport');
  const dotsBox=$('#testi-dots');
  if(!track||!viewport) return;
  // cleanup previous run (re-render)
  if(__testiTimer){ clearInterval(__testiTimer); __testiTimer=null; }
  track.style.transform='';
  function perView(){ return innerWidth<=640?1:innerWidth<=1024?2:3; }
  // Always loop: duplicate cards when admin only added 1-2 items (default seed has 2)
  let originals=[...track.children];
  if(originals.length===0) return;
  if(originals.length<=perView()){
    const need=perView()+2-originals.length;
    for(let i=0;i<need;i++){
      const clone=originals[i%originals.length].cloneNode(true);
      clone.classList.add('in');
      track.appendChild(clone);
    }
  }
  const cards=[...track.children];
  track.classList.add('testi-track');
  $('#testi-prev')?.style.setProperty('display','');
  $('#testi-next')?.style.setProperty('display','');
  cards.forEach(c=>{ c.classList.add('in'); c.classList.remove('reveal'); });
  const total=cards.length;
  const dotsTotal=originals.length;
  __testiIdx=0;
  function stepW(){
    const first=track.children[0];
    if(!first) return 300;
    const gap=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||'16')||16;
    return first.getBoundingClientRect().width+gap;
  }
  function renderDots(){
    if(!dotsBox) return;
    dotsBox.innerHTML='';
    for(let i=0;i<dotsTotal;i++){
      const d=document.createElement('i');
      if(i===__testiIdx%dotsTotal) d.classList.add('on');
      d.addEventListener('click', ()=>{ goTo(i); });
      dotsBox.appendChild(d);
    }
  }
  renderDots();
  let animating=false, inView=true, hovering=false;
  new IntersectionObserver(es=>{ es.forEach(e=>{ inView=e.isIntersecting; }); },{threshold:.1}).observe($('#testimonials'));
  function slideNext(){
    if(animating||document.hidden||!inView||hovering||reducedMotion()) return;
    animating=true;
    const w=stepW();
    track.style.transition='transform .6s cubic-bezier(.2,.8,.2,1)';
    track.style.transform=`translateX(${-w}px)`;
    setTimeout(()=>{
      // send front card to back to get next one
      track.appendChild(track.children[0]);
      track.style.transition='none';
      track.style.transform='translateX(0)';
      void track.offsetWidth; // reflow
      track.style.transition='';
      __testiIdx=(__testiIdx+1)%dotsTotal;
      renderDots();
      animating=false;
    }, 620);
  }
  function slidePrev(){
    if(animating) return;
    animating=true;
    const w=stepW();
    // pull last card to front instantly, then slide back to 0
    track.insertBefore(track.children[track.children.length-1], track.children[0]);
    track.style.transition='none';
    track.style.transform=`translateX(${-w}px)`;
    void track.offsetWidth;
    requestAnimationFrame(()=>{
      track.style.transition='transform .6s cubic-bezier(.2,.8,.2,1)';
      track.style.transform='translateX(0)';
      setTimeout(()=>{
        __testiIdx=(__testiIdx-1+dotsTotal)%dotsTotal;
        renderDots();
        animating=false;
      }, 620);
    });
  }
  function goTo(i){
    if(animating) return;
    let diff=(i-__testiIdx+dotsTotal)%dotsTotal;
    if(diff===0) return;
    // step forward diff times with quick chaining
    (function step(){
      if(diff--<=0) return;
      slideNext();
      setTimeout(()=>{ if(diff>0) step(); }, 680);
    })();
  }
  const prevBtn=$('#testi-prev'), nextBtn=$('#testi-next');
  if(prevBtn) prevBtn.onclick=()=>{ slidePrev(); restart(); };
  if(nextBtn) nextBtn.onclick=()=>{ slideNext(); restart(); };
  viewport.onmouseenter=()=>{ hovering=true; };
  viewport.onmouseleave=()=>{ hovering=false; };
  viewport.ontouchstart=()=>{ hovering=true; };
  viewport.ontouchend=()=>{ setTimeout(()=>{ hovering=false; }, 2000); };
  // swipe
  let sx=null;
  viewport.addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; }, {passive:true});
  viewport.addEventListener('touchend', e=>{
    if(sx===null) return;
    const dx=e.changedTouches[0].clientX-sx;
    if(Math.abs(dx)>40){ dx<0?slideNext():slidePrev(); restart(); }
    sx=null;
  }, {passive:true});
  function restart(){
    if(__testiTimer) clearInterval(__testiTimer);
    if(!reducedMotion()) __testiTimer=setInterval(slideNext, 3400);
  }
  restart();
  addEventListener('resize', ()=>{
    track.style.transition='none';
    track.style.transform='translateX(0)';
    void track.offsetWidth;
    track.style.transition='';
  });
}

// Header scroll + drawer + progress
function initHeader(){
  const h=$('#header');
  const hero=$('#hero');
  window.addEventListener('scroll', ()=>{
    h.classList.toggle('scrolled', window.scrollY>16);
    if(reducedMotion()) return;
    const y=window.scrollY;
    if(hero){
      const aur=hero.querySelector('.aurora');
      if(aur) aur.style.transform=`translateY(${y*0.06}px)`;
    }
  }, {passive:true});
  $('#hamburger')?.addEventListener('click', ()=> $('#drawer').classList.add('open'));
  $('#drawer-close')?.addEventListener('click', ()=> $('#drawer').classList.remove('open'));
  $('#drawer')?.addEventListener('click', e=>{ if(e.target.id==='drawer') e.currentTarget.classList.remove('open'); });
}

// Reveal observer — steps always visible; CSS/GSAP enhance the rest
function initReveal(){
  const stepsEls = document.querySelectorAll('.step');
  stepsEls.forEach(s=> s.classList.add('in'));
  const plInit = $('#progress-line');
  if(plInit){ plInit.style.transform='scaleX(1)'; plInit.classList.add('on'); }
  const stepsContainer = document.querySelector('.steps');
  if(stepsContainer){ stepsContainer.style.opacity='1'; stepsContainer.style.visibility='visible'; }
  const els=$$('.reveal, .proof-card, .testi, .team-card');
  if(reducedMotion()){
    els.forEach(el=>el.classList.add('in'));
    return;
  }
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('in'); });
  },{threshold:.18});
  els.forEach(el=>io.observe(el));
  setTimeout(()=>{
    document.querySelectorAll('.step').forEach(s=>s.classList.add('in'));
    const pl = $('#progress-line');
    if(pl){ pl.style.transform='scaleX(1)'; pl.classList.add('on'); }
    $$('.reveal, .proof-card, .testi, .team-card').forEach(el=>{
      if(!el.classList.contains('in')) el.classList.add('in');
    });
  }, 1200);
  setInterval(()=>{
    const s = document.querySelectorAll('.step');
    let missing=false;
    s.forEach(el=>{ if(!el.classList.contains('in')) missing=true; el.classList.add('in'); });
    if(missing){ const p=$('#progress-line'); if(p){ p.style.transform='scaleX(1)'; p.classList.add('on'); } }
  }, 2000);
}

// Chatbot — persists reload (sessionStorage), new tab fresh, with New/Recent/WhatsApp
function initChat(){
  const btn=$('#chat-btn'), win=$('#chat-win'), close=$('#chat-close'), input=$('#chat-input'), send=$('#chat-send'), body=$('#chat-body');
  if(!btn||!win||!input||!send||!body) return;
  const newBtn=$('#chat-new'), recentBtn=$('#chat-recent'), recentList=$('#chat-recent-list');
  const CHAT_KEY = 'nexatech_chat_history';
  const RECENT_KEY = 'nexatech_recent_chats';
  function saveHistory(){
    try{
      const msgs=[...body.querySelectorAll('.msg')].map(el=>({cls:el.className, html:el.innerHTML, text:el.textContent}));
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
    }catch{}
  }
  function getRecents(){ try{ return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); }catch{ return []; } }
  function saveRecents(list){ try{ localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0,10))); }catch{} }
  function archiveCurrent(){
    try{
      const msgs=[...body.querySelectorAll('.msg')].map(el=>({cls:el.className, html:el.innerHTML, text:el.textContent}));
      const hasUser = msgs.some(m=>m.cls.includes('user'));
      if(!hasUser) return;
      const title = (msgs.find(m=>m.cls.includes('user'))?.text || 'Chat').slice(0,36);
      const recents=getRecents();
      recents.unshift({id:Date.now(), title, msgs, time:new Date().toLocaleString()});
      saveRecents(recents);
    }catch{}
  }
  function renderRecent(){
    if(!recentList) return;
    const recents=getRecents();
    if(recents.length===0){ recentList.innerHTML='<div style="padding:8px;font-size:12px;color:#94A3B8">'+sanitize(T('chat_no_recent','No recent chats yet — start a conversation first.'))+'</div>'; return; }
    recentList.innerHTML='';
    recents.forEach(r=>{
      const div=document.createElement('div');
      div.style.cssText='padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px';
      div.innerHTML=`<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sanitize(r.title)}</div><div style="font-size:10px;color:#94A3B8">${sanitize(r.time)}</div></div><button style="font-size:10px;padding:4px 8px;border-radius:999px;border:1px solid #E2E8F0;background:#fff;cursor:pointer" data-load="${r.id}">Load</button><button style="font-size:10px;padding:4px 6px;border:none;background:transparent;color:#F87171;cursor:pointer" data-del="${r.id}">✕</button>`;
      div.querySelector('[data-load]')?.addEventListener('click', ()=>{
        body.innerHTML='';
        r.msgs.forEach(m=>{ const d=document.createElement('div'); d.className=m.cls; d.innerHTML=m.html; body.appendChild(d); });
        body.scrollTop=body.scrollHeight;
        saveHistory();
        recentList.style.display='none';
        win.classList.add('open');
      });
      div.querySelector('[data-del]')?.addEventListener('click', (e)=>{
        e.stopPropagation();
        const filtered=getRecents().filter(x=>String(x.id)!==String(r.id));
        saveRecents(filtered);
        renderRecent();
      });
      recentList.appendChild(div);
    });
  }
  const IDENTITY_KEY = 'nexatech_chat_identity';
  function getIdentity(){ try{ const o=JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null'); if(o && o.name && o.email) return o; }catch{} return null; }
  function setIdentity(name,email){ try{ localStorage.setItem(IDENTITY_KEY, JSON.stringify({name, email})); }catch{} }
  function clearIdentity(){ try{ localStorage.removeItem(IDENTITY_KEY); }catch{} }
  function escId(s){ const d=document.createElement('div'); d.textContent=String(s||''); return d.innerHTML; }
  function setChatEnabled(on){ try{ input.disabled=!on; send.disabled=!on; }catch{} }
  function bindQuick(){ body.querySelectorAll('.quick button').forEach(b=> b.addEventListener('click', ()=>{ input.value=b.dataset.q; sendMsg(); })); }
  function chatQs(){
    return [
      T('chat_quick_1','What is included in Pro?'),
      T('chat_quick_2','How long to launch?'),
      T('chat_quick_3','Do I own the store?')
    ];
  }
  function quickHtml(){
    return '<div class="quick">'+chatQs().map(q=>`<button data-q="${sanitize(q)}">${sanitize(q)}</button>`).join('')+'</div>';
  }
  function showGreeting(){
    const id=getIdentity();
    const first=id ? escId(String(id.name).split(' ')[0]) : 'there';
    const greet=T('chat_greeting','Hi {name}! I am the Nexatech assistant. Ask me about packages, timelines, or proof — or tap a quick question below.').replace('{name}', first);
    body.innerHTML=`<div class="msg bot">${sanitize(greet)}</div>`+quickHtml()+`<div style="font-size:10px;color:#94A3B8;padding:2px 4px">${sanitize(T('chat_chatting_as','Chatting as'))} <b>${id?escId(id.name):''}</b>${id?' ('+escId(id.email)+')':''} <button id="chat-switch-id" style="border:none;background:none;color:#7C3AED;cursor:pointer;font-size:10px;text-decoration:underline">${sanitize(T('chat_switch','switch'))}</button></div>`;
    bindQuick();
    body.querySelector('#chat-switch-id')?.addEventListener('click', ()=>{ clearIdentity(); showGate(); });
    setChatEnabled(true);
    saveHistory();
  }
  function showGate(){
    setChatEnabled(false);
    body.innerHTML=`<div class="msg bot">${sanitize(T('chat_gate_intro','Hi! Before we start, please tell us your name and email so we can follow up.'))}</div>
    <div id="chat-gate" style="display:grid;gap:8px;background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px">
      <label style="display:grid;gap:4px;font-size:11px;font-weight:700;color:var(--text-muted)">${sanitize(T('chat_gate_name_label','YOUR NAME'))}<input id="chat-gate-name" placeholder="${sanitize(T('form_ph_name','Ada Lovelace'))}" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;outline:none"></label>
      <label style="display:grid;gap:4px;font-size:11px;font-weight:700;color:var(--text-muted)">${sanitize(T('chat_gate_email_label','EMAIL'))}<input id="chat-gate-email" type="email" placeholder="${sanitize(T('form_ph_email','you@example.com'))}" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;outline:none"></label>
      <div id="chat-gate-err" style="font-size:11px;color:#EF4444;min-height:14px"></div>
      <button id="chat-gate-start" class="btn btn-primary" style="justify-content:center">${sanitize(T('chat_gate_start','Start Chat'))} →</button>
    </div>`;
    const start=()=>{
      const n=body.querySelector('#chat-gate-name')?.value?.trim()||'';
      const e=body.querySelector('#chat-gate-email')?.value?.trim()||'';
      const err=body.querySelector('#chat-gate-err');
      if(n.length<2){ if(err) err.textContent=T('chat_gate_err_name','Please enter your name.'); return; }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){ if(err) err.textContent=T('chat_gate_err_email','Please enter a valid email.'); return; }
      setIdentity(n,e);
      showGreeting();
      try{ win.classList.add('open'); }catch{}
    };
    body.querySelector('#chat-gate-start')?.addEventListener('click', start);
    body.querySelector('#chat-gate-email')?.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); start(); } });
    body.querySelector('#chat-gate-name')?.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); body.querySelector('#chat-gate-email')?.focus(); } });
    try{ setTimeout(()=> body.querySelector('#chat-gate-name')?.focus(), 100); }catch{}
  }
  sessionStorage.removeItem(CHAT_KEY);
  if(getIdentity()) showGreeting(); else showGate();
  btn.addEventListener('click', ()=> win.classList.toggle('open'));
  close.addEventListener('click', ()=> win.classList.remove('open'));
  newBtn?.addEventListener('click', ()=>{
    archiveCurrent();
    sessionStorage.removeItem(CHAT_KEY);
    if(getIdentity()) showGreeting(); else showGate();
    body.scrollTop=0;
  });
  recentBtn?.addEventListener('click', ()=>{
    const isOpen = recentList.style.display!=='none';
    if(isOpen){ recentList.style.display='none'; }
    else { renderRecent(); recentList.style.display='block'; }
  });
  const waLink = $('#chat-whatsapp');
  if(waLink){
    const updWa = ()=>{ if(CONTENT.whatsapp_number) waLink.href=whatsappLink(CONTENT.whatsapp_number, 'Hi Nexatech!'); };
    setTimeout(updWa, 1500);
  }
  function createWhatsAppButton(userText){
    const waNum = CONTENT.whatsapp_number || '19283825389';
    const customMsg = `Hi Nexatech 👋, ${userText}`.slice(0,800);
    const url = whatsappLink(waNum, customMsg);
    const a=document.createElement('a');
    a.href=url; a.target='_blank'; a.rel='noopener';
    a.className='chat-wa-btn';
    a.textContent=T('chat_wa_continue','Continue on WhatsApp')+' →';
    a.setAttribute('aria-label',T('chat_wa_continue','Continue on WhatsApp'));
    a.style.cssText='display:inline-flex;align-items:center;justify-content:center;max-width:100%;box-sizing:border-box;word-break:break-word;white-space:normal;overflow-wrap:anywhere;margin-top:8px;padding:10px 14px;border-radius:999px;background:var(--primary);color:#fff;font-weight:700;font-size:13px;text-decoration:none;box-shadow:0 6px 14px rgba(11,18,32,.12);';
    return a;
  }
  function shouldShowWhatsAppButton(replyText, userText, apiJson){
    if(apiJson && apiJson.fallback) return true;
    if(/wa\.me/i.test(replyText||'') || /https?:\/\/wa\.me/i.test(apiJson?.reply||'')) return true;
    if(/continue on whatsapp|tap the button below|whatsapp with (ifeoluwa|saheed)|tap below/i.test(replyText||'')) return true;
    if(/how (do|to) (i )?(get )?started|how much|want.*mentorship|hire|get started|how do we begin|want to start/i.test(userText||'')) return true;
    return false;
  }
  let isSending=false;
  async function sendMsg(){
    const id=getIdentity();
    if(!id){ showGate(); return; }
    if(isSending) return;
    const text=input.value.trim(); if(!text) return;
    isSending=true; send.disabled=true; input.disabled=true;
    const userQuestion = text;
    const history = [...body.querySelectorAll('.msg')].slice(-12).map(el=>{
      const isUser = el.classList.contains('user');
      if(el.classList.contains('quick')) return null;
      const t = el.textContent.trim();
      if(!t) return null;
      return { role: isUser ? 'user' : 'model', text: t.slice(0,2000) };
    }).filter(Boolean).slice(-10);
    const u=document.createElement('div'); u.className='msg user'; u.textContent=text; body.appendChild(u);
    input.value=''; body.scrollTop=body.scrollHeight;
    saveHistory();
    track('chat_message','chat', {text});
    const typing=document.createElement('div'); typing.className='msg bot typing-bubble';
    typing.innerHTML='<span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>';
    body.appendChild(typing); body.scrollTop=body.scrollHeight;
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text, sessionId, history, pageUrl: location.href, name: id.name, email: id.email})});
      const j=await r.json();
      const bot=document.createElement('div'); bot.className='msg bot';
      let replyText = j.reply || j.error || T('chat_offline','Not available right now — tap below to chat on WhatsApp.');
      replyText = replyText.replace(/https?:\/\/wa\.me[^\s"'\)]+/gi, '').replace(/https?:\/\/wa\.me[^\s]*/gi, '').replace(/\[WHATSAPP[^\]]*\]/gi, '').trim();
      replyText = replyText.replace(/\s{2,}/g,' ').trim();
      bot.textContent = replyText || T('chat_offline','Not available right now — tap below to chat on WhatsApp.');
      if(shouldShowWhatsAppButton(replyText, userQuestion, j) || j.fallback){
        const b2 = createWhatsAppButton(userQuestion);
        bot.appendChild(document.createElement('br'));
        bot.appendChild(b2);
      }
      body.appendChild(bot);
    }catch{
      const bot=document.createElement('div'); bot.className='msg bot'; bot.textContent=T('chat_offline','Not available right now — tap below to chat on WhatsApp.');
      const b2 = createWhatsAppButton(userQuestion);
      bot.appendChild(document.createElement('br'));
      bot.appendChild(b2);
      body.appendChild(bot);
    } finally {
      try{ typing.remove(); }catch{}
      isSending=false; send.disabled=false; input.disabled=false; try{ input.focus(); }catch{}
    }
    body.scrollTop=body.scrollHeight;
    saveHistory();
  }
  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMsg(); } });
  saveHistory();
  const FINISH_KEY = 'nexatech_chat_followup_sent_';
  function followupSentFlag(){ try{ return sessionStorage.getItem(FINISH_KEY + sessionId) === '1'; }catch{ return false; } }
  function markFollowupSent(){ try{ sessionStorage.setItem(FINISH_KEY + sessionId, '1'); }catch{} }
  let idleTimer = null;
  function notifyChatFinished(reason){
    try{
      if(followupSentFlag()) return;
      const id = getIdentity();
      if(!id || !id.email) return;
      const hasUser = !!body.querySelector('.msg.user');
      if(!hasUser) return;
      markFollowupSent();
      const payload = JSON.stringify({ sessionId });
      if(reason === 'hide' && navigator.sendBeacon){
        try{ navigator.sendBeacon('/api/chat/finish', new Blob([payload], {type:'application/json'})); return; }catch{}
      }
      fetch('/api/chat/finish', { method:'POST', headers:{'Content-Type':'application/json'}, body: payload }).catch(()=>{});
    }catch{}
  }
  function resetIdleTimer(){
    try{ if(idleTimer) clearTimeout(idleTimer); }catch{}
    idleTimer = setTimeout(()=> notifyChatFinished('idle'), 3*60*1000);
  }
  send.addEventListener('click', resetIdleTimer);
  input.addEventListener('keydown', ()=>{ try{ if(idleTimer) clearTimeout(idleTimer); }catch{} });
  try{
    const obs = new MutationObserver(()=> resetIdleTimer());
    obs.observe(body, { childList:true });
  }catch{}
  resetIdleTimer();
  window.addEventListener('beforeunload', ()=>{ try{ archiveCurrent(); }catch{} try{ notifyChatFinished('hide'); }catch{} });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) try{ notifyChatFinished('hide'); }catch{} });
  newBtn?.addEventListener('click', ()=>{ try{ notifyChatFinished('new'); }catch{} try{ if(idleTimer) clearTimeout(idleTimer); }catch{} try{ sessionStorage.removeItem(FINISH_KEY + sessionId); }catch{} resetIdleTimer(); }, true);
}

// Init all
(async function init(){
  initCursor();
  initScrollProgress();
  initAmbientWebGL();
  try{ await loadContent(); }catch(e){ console.error('content load failed',e); }
  renderMarquee();
  try{ await loadPortfolio(); }catch(e){ console.error(e); }
  try{ await loadMedia(); }catch(e){ console.error(e); }
  initLeadForm();
  initParticles();
  initHeroWebGL();
  initChips();
  initHeader();
  initReveal();
  initChat();
  initTilt();
  initSpotlight();
  initMagnetic();
  initSmoothScroll();
  initGsapReveals();
  setTimeout(()=>{ try{ window.dispatchEvent(new Event('resize')); window.ScrollTrigger?.refresh(); }catch{} }, 900);
  track('pageview','landing');
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e=>{
    if(e.matches) document.body.classList.add('reduced');
    else if(CONTENT.reduced_motion!=='true') document.body.classList.remove('reduced');
  });
})();
