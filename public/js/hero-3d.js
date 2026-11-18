export async function initHero3D({ canvas, stage } = {}){
  if(!canvas || !stage) return false;
  let THREE;
  try{ THREE = await import('three'); }
  catch{ return false; }
  try{
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    camera.position.set(0, 0.12, 7.4);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x101a3d, 1.25));
    const ambient = new THREE.AmbientLight(0xb9c6e8, 0.34);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(-4.2, 5.2, 5.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xA9BDFF, 1.8);
    fill.position.set(5.2, -1.4, 4.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 2.8);
    rim.position.set(0.6, 2.2, -5.2);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x1F4FD8,
      emissive: 0x1F4FD8,
      emissiveIntensity: 0.06,
      roughness: 0.52,
      metalness: 0.02,
      transparent: true,
      opacity: 0
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.56, 64, 64), sphereMat);
    sphere.position.y = 0.08;
    root.add(sphere);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xF3F6FF,
      roughness: 0.32,
      metalness: 0.22,
      transparent: true,
      opacity: 0
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.34, 0.02, 16, 220), ringMat);
    const baseTilt = 1.12;
    ring.rotation.x = baseTilt;
    ring.position.y = 0.08;
    const ringPivot = new THREE.Group();
    ringPivot.add(ring);
    root.add(ringPivot);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const ctx = shadowCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    gradient.addColorStop(0, 'rgba(3,8,25,.56)');
    gradient.addColorStop(0.5, 'rgba(3,8,25,.22)');
    gradient.addColorStop(1, 'rgba(3,8,25,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    shadowTexture.colorSpace = THREE.SRGBColorSpace;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.9, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.02;
    shadow.scale.y = 0.52;
    root.add(shadow);

    const gsap = window.gsap;
    if(gsap){
      sphere.scale.setScalar(0.9);
      ring.scale.setScalar(0.94);
      gsap.to(sphere.scale, { x: 1, y: 1, z: 1, duration: 1.2, ease: 'power3.out' });
      gsap.to(sphereMat, { opacity: 1, duration: 0.9, ease: 'power2.out' });
      gsap.to(ringMat, { opacity: 0.9, duration: 0.9, delay: 0.3, ease: 'power2.out' });
      gsap.to(ring.scale, { x: 1, y: 1, z: 1, duration: 1.1, delay: 0.3, ease: 'power3.out' });
    } else {
      sphereMat.opacity = 1;
      ringMat.opacity = 0.9;
      sphere.scale.setScalar(1);
      ring.scale.setScalar(1);
    }

    function resize(){
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if(!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    let resizeObserver = null;
    if('ResizeObserver' in window){
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    let targetTilt = baseTilt;
    let targetLift = 0;
    let currentTilt = baseTilt;
    let currentLift = 0;
    function onScroll(){
      const max = Math.max(1, window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      targetTilt = baseTilt + p * 0.44;
      targetLift = p * 0.16;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    let visible = true;
    let raf = 0;
    let last = performance.now();
    const io = new IntersectionObserver((entries) => {
      visible = entries.some(entry => entry.isIntersecting);
      if(visible && !document.hidden) start();
      else stop();
    }, { threshold: 0 });
    io.observe(stage);

    function start(){
      if(raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop(){
      if(raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function loop(now){
      raf = 0;
      if(!visible || document.hidden) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      sphere.rotation.y += dt * 0.05;
      ringPivot.rotation.y += dt * 0.25;
      currentTilt += (targetTilt - currentTilt) * 0.07;
      currentLift += (targetLift - currentLift) * 0.07;
      ring.rotation.x = currentTilt;
      root.position.y = currentLift * 3.1;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    function onVisibility(){
      if(document.hidden) stop();
      else if(visible) start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    stage.classList.add('is-ready');
    start();
    return true;
  } catch {
    stage.classList.remove('is-ready');
    return false;
  }
}
