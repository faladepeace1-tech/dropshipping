const stage = document.getElementById('hero-stage');
const canvas = document.getElementById('hero-webgl');

function canRender3D(){
  if(!stage || !canvas) return false;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if(document.body.classList.contains('reduced')) return false;
  const conn = navigator.connection;
  if(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return false;
  return true;
}

function load3D(){
  if(!canRender3D()) return;
  import('/js/hero-3d.js')
    .then(mod => mod.initHero3D({ canvas, stage }))
    .catch(() => {});
}

let started = false;
function schedule3D(){
  if(started || !canRender3D()) return;
  started = true;
  const start = () => load3D();
  if('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2200 });
  else setTimeout(start, 1100);
}

if(stage && canvas){
  const io = new IntersectionObserver((entries) => {
    if(entries.some(entry => entry.isIntersecting)) schedule3D();
  }, { rootMargin: '240px' });
  io.observe(stage);
}
