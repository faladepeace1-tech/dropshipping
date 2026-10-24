// Shared header/footer content for static content pages. Home keeps its richer
// app.js bindings; this script keeps every other public page in sync with
// Admin -> Content & Theme -> Navbar / Footer / General.
(function(){
  const $ = s => document.querySelector(s);
  const T = (c, key, fallback) => {
    const v = c[key];
    if(v === undefined || v === null) return fallback;
    const s = String(v);
    return s.trim() === '' && fallback ? fallback : s;
  };
  const waLink = (num, msg) => 'https://wa.me/' + String(num || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(msg || '');
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }
  function setLink(scope, hrefs, label){
    if(!scope || !label) return;
    const list = Array.isArray(hrefs) ? hrefs : [hrefs];
    for(const href of list){
      const a = scope.querySelector('a[href="' + href + '"]');
      if(a){ a.textContent = label; return; }
    }
  }
  function bindDrawer(){
    const drawer = $('#drawer');
    if(!drawer) return;
    $('#hamburger')?.addEventListener('click', () => drawer.classList.add('open'));
    $('#drawer-close')?.addEventListener('click', () => drawer.classList.remove('open'));
    drawer.addEventListener('click', e => { if(e.target === drawer) drawer.classList.remove('open'); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape') drawer.classList.remove('open'); });
  }
  function fillCurrency(rates, currencies){
    const els = [...document.querySelectorAll('#fx-select, #fx-select-drawer')];
    if(!els.length) return;
    const allowed = (currencies && currencies.length) ? currencies : ['USD'];
    let cur = 'USD';
    try{
      const q = new URLSearchParams(location.search).get('currency');
      const saved = localStorage.getItem('nx_currency');
      cur = String(q || saved || 'USD').toUpperCase();
    }catch{}
    if(!allowed.includes(cur)) cur = 'USD';
    els.forEach(el => {
      el.innerHTML = '';
      allowed.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        if(c === cur) o.selected = true;
        el.appendChild(o);
      });
      el.onchange = () => {
        const v = el.value;
        try{ localStorage.setItem('nx_currency', v); }catch{}
        els.forEach(x => x.value = v);
        document.dispatchEvent(new CustomEvent('nx:currency', { detail: { currency: v, rates } }));
      };
    });
  }
  async function run(){
    let c = {}, rates = null, currencies = ['USD'];
    try{
      const [cr, fr] = await Promise.all([
        fetch('/api/content', {cache:'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/fx/rates', {cache:'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if(cr) c = cr.content || {};
      if(fr && fr.rates){ rates = fr.rates; currencies = fr.currencies || ['USD']; }
    }catch{}
    const logo = $('.nx-site-logo') || $('.nx-logo');
    const textEl = document.getElementById('logo-text');
    if(logo && textEl){
      textEl.textContent = T(c, 'logo_text', T(c, 'site_name', 'NEXATECH'));
      const url = String(c.logo_url || '').trim();
      let img = logo.querySelector('.logo-img');
      if(url){
        if(!img){ img = document.createElement('img'); img.className = 'logo-img'; img.alt = T(c, 'site_name', 'Nexatech'); logo.insertBefore(img, textEl); }
        if(img.getAttribute('src') !== url) img.src = url;
      } else if(img){ img.remove(); }
    }
    const nav = $('.nx-site-nav') || $('.nx-nav');
    if(nav){
      setLink(nav, ['/#portfolio', '#portfolio'], T(c, 'nav_link_portfolio', 'Portfolio'));
      setLink(nav, ['/#proof', '#proof'], T(c, 'nav_link_proof', 'Proof'));
      setLink(nav, '/pricing', T(c, 'nav_link_pricing', 'Pricing'));
      setLink(nav, '/offers', T(c, 'nav_link_offers', 'Offers'));
      setLink(nav, '/messages', T(c, 'nav_link_messages', 'Messages'));
      setLink(nav, '/themes', T(c, 'nav_link_themes', 'Themes'));
      setLink(nav, '/faq', T(c, 'nav_link_faq', 'FAQ'));
      setLink(nav, '/blog', T(c, 'nav_link_blog', 'Blog'));
    }
    const waNum = T(c, 'whatsapp_number', '447411200927');
    const waMsg = 'Hi Nexatech! Quick question about your store packages.';
    const wa = waLink(waNum, waMsg);
    ['nav-whatsapp', 'drawer-wa'].forEach(id => { const el = document.getElementById(id); if(el) el.href = wa; });
    setText('nav-book', T(c, 'nav_book_label', 'Start a Chat'));
    setText('drawer-book', T(c, 'nav_book_label', 'Start a Chat'));
    const foot = $('.nx-foot-inner');
    if(foot){
      const copy = foot.querySelector('span');
      if(copy){
        const year = new Date().getFullYear();
        const base = T(c, 'footer_copyright', 'Nexatech Dropshipping Store. All rights reserved.');
        copy.textContent = '© ' + year + ' ' + base;
      }
      setLink(foot, '/privacy.html', T(c, 'privacy_link_label', 'Privacy'));
      setLink(foot, '/terms.html', T(c, 'terms_link_label', 'Terms'));
      setLink(foot, '/pricing', T(c, 'nav_link_pricing', 'Pricing'));
      setLink(foot, '/themes', T(c, 'nav_link_themes', 'Themes'));
      setLink(foot, '/faq', T(c, 'nav_link_faq', 'FAQ'));
      setLink(foot, '/blog', T(c, 'nav_link_blog', 'Blog'));
      setLink(foot, '/rss.xml', T(c, 'footer_rss_label', 'RSS'));
    }
    const favicon = String(c.favicon_url || '').trim();
    if(favicon){
      document.querySelectorAll('link[rel="icon"]').forEach(el => el.href = favicon);
      document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(el => el.href = favicon);
    }
    const og = String(c.og_image || '').trim();
    if(og) document.querySelectorAll('meta[property="og:image"]').forEach(el => el.content = og);
    bindDrawer();
    fillCurrency(rates, currencies);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
