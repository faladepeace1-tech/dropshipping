(function(){
  var stage = document.getElementById('hero-stage');
  if(!stage) return;
  var tabs = Array.prototype.slice.call(stage.querySelectorAll('[data-hs-view]'));
  if(!tabs.length) return;
  var scenes = ['store', 'listing', 'live'];
  var labels = {
    store: { badge: 'Draft', foot: 'Ready to publish', pct: '0%' },
    listing: { badge: 'Publishing', foot: 'Publishing to store…', pct: '92%' },
    live: { badge: 'Published', foot: 'Live in your store', pct: '100%' }
  };
  var badge = stage.querySelector('.hs-listing-head>b');
  var foot = stage.querySelector('.hs-listing-foot span');
  var pct = stage.querySelector('.hs-listing-foot b');
  var windowEl = stage.querySelector('.hs-window');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var current = 0;
  var timer = null;
  var paused = false;
  var interacted = false;

  function paint(index, animate){
    current = (index + scenes.length) % scenes.length;
    var key = scenes[current];
    stage.dataset.scene = key;
    tabs.forEach(function(tab, i){
      var on = i === current;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    if(badge) badge.textContent = labels[key].badge;
    if(foot) foot.textContent = labels[key].foot;
    if(pct) pct.textContent = labels[key].pct;
    if(animate){
      stage.classList.remove('is-animating');
      void stage.offsetWidth;
      stage.classList.add('is-animating');
    }
  }

  function stopAuto(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  function startAuto(){
    stopAuto();
    if(interacted || (reduce && reduce.matches) || document.hidden) return;
    timer = setInterval(function(){
      if(!paused) paint(current + 1, true);
    }, 4200);
  }

  tabs.forEach(function(tab, i){
    tab.addEventListener('click', function(){
      interacted = true;
      paused = true;
      stopAuto();
      paint(i, true);
    });
    tab.addEventListener('keydown', function(e){
      if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      interacted = true;
      paused = true;
      stopAuto();
      var next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      paint(next, true);
      tabs[next].focus();
    });
  });

  stage.addEventListener('mouseenter', function(){ paused = true; });
  stage.addEventListener('mouseleave', function(){ paused = false; });
  stage.addEventListener('focusin', function(){ paused = true; });
  stage.addEventListener('focusout', function(e){
    if(!stage.contains(e.relatedTarget)) paused = false;
  });
  document.addEventListener('visibilitychange', function(){
    if(document.hidden) stopAuto();
    else startAuto();
  });

  if(windowEl && !(reduce && reduce.matches)){
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function frame(){
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      windowEl.style.setProperty('--hs-ry', (-4 + cx * 3).toFixed(2) + 'deg');
      windowEl.style.setProperty('--hs-rx', (1.4 + cy * 2.2).toFixed(2) + 'deg');
      if(Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(frame);
      else raf = 0;
    }
    stage.addEventListener('pointermove', function(e){
      var r = stage.getBoundingClientRect();
      if(!r.width || !r.height) return;
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if(!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
    stage.addEventListener('pointerleave', function(){
      tx = 0; ty = 0;
      if(!raf) raf = requestAnimationFrame(frame);
    });
  }

  paint(0, false);
  startAuto();
})();
