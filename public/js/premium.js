(function(){
  const doc = document;
  const body = doc.body;
  if(!body || body.classList.contains('dm-page') || doc.getElementById('app')) return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if(!reduce) doc.documentElement.classList.add('nx-motion');

  function el(tag, attrs){
    const node = doc.createElement(tag);
    if(attrs){
      for(const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    }
    return node;
  }

  const progress = el('div', { id:'nx-progress', 'aria-hidden':'true' });
  const progressBar = el('span');
  progress.appendChild(progressBar);
  body.appendChild(progress);

  const top = el('button', { id:'nx-top', type:'button', 'aria-label':'Back to top' });
  top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  body.appendChild(top);
  top.addEventListener('click', () => window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' }));

  let raf = 0;
  function paintScroll(){
    raf = 0;
    const max = Math.max(0, doc.documentElement.scrollHeight - window.innerHeight);
    const pct = max ? Math.min(1, window.scrollY / max) : 0;
    progressBar.style.width = (pct * 100).toFixed(2) + '%';
    top.classList.toggle('show', window.scrollY > 640);
    doc.querySelectorAll('.nx-site-head, .co-header, .header').forEach(header => {
      header.classList.toggle('scrolled', window.scrollY > 18);
    });
  }
  window.addEventListener('scroll', () => { if(!raf) raf = requestAnimationFrame(paintScroll); }, { passive:true });
  paintScroll();

  if(fine && !reduce){
    const spot = el('div', { class:'nx-spotlight', 'aria-hidden':'true' });
    body.appendChild(spot);
    let pointerRaf = 0;
    let mx = 70, my = 20;
    window.addEventListener('pointermove', event => {
      mx = event.clientX;
      my = event.clientY;
      spot.classList.add('on');
      if(pointerRaf) return;
      pointerRaf = requestAnimationFrame(() => {
        pointerRaf = 0;
        spot.style.setProperty('--nx-mx', mx + 'px');
        spot.style.setProperty('--nx-my', my + 'px');
      });
    }, { passive:true });
  }

  if('IntersectionObserver' in window && !reduce){
    const selector = [
      '.nx-page .nx-main > .container > .nx-breadcrumbs',
      '.nx-page .nx-main > .container > .nx-kicker',
      '.nx-page .nx-main > .container > .nx-h1',
      '.nx-page .nx-main > .container > .nx-lead',
      '.nx-page .nx-main > .container > .nx-card',
      '.nx-page .nx-main > .container > .nx-grid > *',
      '.nx-page .nx-main > .container > .nx-faq > details',
      '.nx-page .nx-main > .container > .nx-h2',
      '.nx-page .nx-main > .container > .nx-table',
      '.nx-page .nx-post > h2',
      '.nx-page .nx-post > blockquote',
      '#pricing-main .price-card',
      '#offers-main .price-card',
      '#pricing-main .mentorship',
      '#pricing-main .faq-item',
      '#offers-main .ds-step',
      '.co-wrap > .eyebrow',
      '.co-wrap > .h2',
      '.co-wrap > .sub',
      '.co-wrap .co-card',
      '.legal-wrap > h1',
      '.legal-wrap > small',
      '.legal-wrap .legal-content'
    ].join(',');

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold:.08, rootMargin:'0px 0px -8% 0px' });

    const seen = new WeakSet();
    function reveal(root){
      const scope = root && root.querySelectorAll ? root : doc;
      const nodes = [];
      if(scope.matches && scope.matches(selector)) nodes.push(scope);
      scope.querySelectorAll(selector).forEach(node => nodes.push(node));
      const counts = new Map();
      nodes.forEach(node => {
        if(seen.has(node)) return;
        seen.add(node);
        const parent = node.parentElement || doc.body;
        const index = counts.get(parent) || 0;
        counts.set(parent, index + 1);
        if(index > 0 && index < 6) node.setAttribute('data-nx-delay', String(index));
        node.classList.add('nx-reveal');
        io.observe(node);
      });
    }

    reveal(doc);
    let refreshTimer = 0;
    const mo = new MutationObserver(records => {
      if(refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = 0;
        records.forEach(record => record.addedNodes.forEach(node => {
          if(node.nodeType === 1) reveal(node);
        }));
      }, 80);
    });
    if(body) mo.observe(body, { childList:true, subtree:true });
    setTimeout(() => {
      doc.querySelectorAll('.nx-reveal:not(.is-in)').forEach(node => {
        const rect = node.getBoundingClientRect();
        if(rect.top < window.innerHeight && rect.bottom > 0) node.classList.add('is-in');
      });
    }, 2200);
  }

  if(fine && !reduce){
    doc.querySelectorAll('#pricing-main .price-card, #offers-main .price-card, .nx-page .nx-main > .container > .nx-card').forEach(card => {
      card.addEventListener('pointermove', event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = 'perspective(900px) rotateX(' + (-y * 2.2).toFixed(2) + 'deg) rotateY(' + (x * 2.2).toFixed(2) + 'deg) translateY(-3px)';
      }, { passive:true });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }
})();
