// Nexatech Frontend App
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let CONTENT={}, STATS={}, SCARCITY={}, SECTIONS=[];
let PORTFOLIO=[], MODAL_INDEX=0, MODAL_ITEMS=[];
// T: editable micro-copy from backend (Admin edits) with hardcoded fallback — every visible string flows through here
function T(key, fb){ const v=CONTENT[key]; if(v===undefined||v===null) return fb; const s=String(v); return s.trim()===''&&typeof fb==='string'&&fb!=='' ? fb : s; }
let sessionId = localStorage.getItem('nexatech_sid') || (localStorage.setItem('nexatech_sid', Math.random().toString(36).slice(2)+Date.now().toString(36)), localStorage.getItem('nexatech_sid'));
function getUTM(){
  const p=new URLSearchParams(location.search);
  return {source:p.get('utm_source')||'',medium:p.get('utm_medium')||'',campaign:p.get('utm_campaign')||''};
}
function sanitize(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function whatsappLink(num, msg){ const n=(num||'').replace(/\D/g,''); return `https://wa.me/${n}?text=${encodeURIComponent(msg||'')}`; }
function track(event_type, element_id, metadata={}){
  const payload={event_type,element_id,session_id:sessionId,page_url:location.href,utm:getUTM(),metadata};
  try{navigator.sendBeacon&&navigator.sendBeacon('/api/events', JSON.stringify(payload));}catch{}
  fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
}

// Theme apply
function applyTheme(c){
  const r=document.documentElement;
  const map={color_primary:'--primary',color_primary_light:'--primary-light',color_accent:'--accent',color_accent_2:'--accent-2',color_bg:'--bg',color_bg_alt:'--bg-alt',color_text:'--text',color_text_muted:'--text-muted',color_border:'--border',color_success:'--success'};
  for(const [k,css] of Object.entries(map)) if(c[k]) r.style.setProperty(css,c[k]);
  if(c.font_family) r.style.setProperty('--font',c.font_family);
  if(c.logo_text) $('#logo-text').textContent=c.logo_text;
  // Logo image replaces the N mark (logo-mark), not logo-text — per owner request, brand name at front of logo, backend only
  const mark = document.querySelector('.logo-mark');
  if(c.logo_url && c.logo_url.trim()){
    if(mark) mark.innerHTML=`<img src="${c.logo_url}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
  } else {
    if(mark && mark.querySelector('img')) mark.innerHTML='N';
  }
  // Brand order: logo mark FIRST then brand name -> (logo) NEXATECH (default logo_first)
  try{
    const logo = document.querySelector('.logo');
    const textEl = document.getElementById('logo-text');
    if(logo && mark && textEl){
      const pos = (c.logo_position || c.brand_position || 'logo_first');
      if(pos === 'brand_first'){
        // Legacy option: Brand + Mark
        if(logo.firstElementChild !== textEl) logo.insertBefore(textEl, mark);
      } else {
        // Default: Logo + Brand -> (logo) NEXATECH
        if(logo.firstElementChild !== mark) logo.insertBefore(mark, textEl);
      }
    }
  }catch{}
  if(c.favicon_url && c.favicon_url.trim()) $('#favicon').href=c.favicon_url;
  if(c.seo_title) {$('#seo-title').textContent=c.seo_title; document.title=c.seo_title;}
  if(c.seo_description) $('#seo-desc').content=c.seo_description;
  if(c.og_image) $('#og-image').content=c.og_image;
  // reduced motion
  if(c.reduced_motion===true || c.reduced_motion==='true') document.body.classList.add('reduced');
  else document.body.classList.remove('reduced');
  // hero texts
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
  applyMicroCopy();
}

// Every user-visible micro-string, editable in Admin backend. Falls back to current defaults.
function setText(id, txt){ const el=document.getElementById(id); if(el) el.textContent=txt; }
function applyMicroCopy(){
  // Navbar + drawer + footer links
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
  // Trust badges
  const trust=(id,b,t)=>{ const el=document.getElementById(id); if(el) el.innerHTML='✔ <b>'+sanitize(b)+'</b> '+sanitize(t); };
  trust('trust-1', T('trust_1_bold','7 to 14 Day'), T('trust_1_text','Delivery'));
  trust('trust-2', T('trust_2_bold','100%'), T('trust_2_text','Ownership'));
  trust('trust-3', T('trust_3_bold','Real Sales'), T('trust_3_text','Proof'));
  // Hero visual
  setText('hero-visual-domain', T('hero_visual_domain','nexatech.store'));
  setText('chip-1-t', T('chip_1_title','New Sale $450'));
  setText('chip-1-s', T('chip_1_sub','Elegance Mode - just now'));
  setText('chip-2-t', T('chip_2_title','Order #1029 Shipped'));
  setText('chip-2-s', T('chip_2_sub','GlowLab - 2m ago'));
  setText('chip-3-t', T('chip_3_title','3.2% Conversion Rate'));
  setText('chip-3-s', T('chip_3_sub','TechNest - today'));
  // Eyebrows
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
  // Filter pills (labels editable, data-filter matching untouched)
  const fmap={All:'filter_all',Fashion:'filter_fashion',Beauty:'filter_beauty','Tech Gadgets':'filter_gadgets',Fitness:'filter_fitness',Home:'filter_home','Eco Friendly':'filter_eco'};
  $$('#filter-bar .pill').forEach(p=>{ const k=fmap[p.dataset.filter]; if(k) p.textContent=T(k,p.dataset.filter); });
  // Team + mentorship + CTA buttons
  setText('view-full-team', T('team_view_all','View full team')+' →');
  setText('mentorship-wa', T('mentorship_cta','Chat about Mentorship')+' →');
  setText('cta-wa', T('cta_whatsapp_label','Chat on WhatsApp'));
  setText('cta-book', T('cta_book_label','Book a Free Call')+' →');
  // Footer
  setText('footer-tagline', T('footer_tagline','We engineer high-converting storefronts backed by real, current sales proof.'));
  setText('footer-quick-links', T('footer_quick_links','Quick Links'));
  setText('footer-contact-h', T('footer_contact','Contact'));
  setText('footer-legal-h', T('footer_legal','Legal'));
  setText('privacy-link', T('privacy_link_label','Privacy Policy'));
  setText('terms-link', T('terms_link_label','Terms of Service'));
  setText('footer-built-note', T('footer_built_note','Built with honesty all proof numbers are live from our database.'));
  const socmap={'soc-instagram':'social_instagram_url','soc-x':'social_x_url','soc-tiktok':'social_tiktok_url','soc-linkedin':'social_linkedin_url','soc-facebook':'social_facebook_url','soc-youtube':'social_youtube_url'};
  for(const [id,key] of Object.entries(socmap)){
    const el=document.getElementById(id); if(!el) continue;
    const url=(CONTENT[key]||'').trim();
    if(url){ el.href=url; el.style.display=''; } else { el.style.display='none'; }
  }
  // Lead form copy
  setText('f-label-name', T('form_label_name','Full Name *'));
  setText('f-label-store', T('form_label_store','Desired Brand / Niche Name *'));
  setText('f-label-niche', T('form_label_niche','Preferred Niche *'));
  setText('f-label-niche-other', T('form_label_niche_other','Other niche tell us'));
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
  // Chatbot chrome
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
  // scarcity badge
  const badgeText = SCARCITY.text || CONTENT.hero_badge || 'Only 5 build slots left this month';
  $('#hero-badge-text').textContent=badgeText;
  // CTAs — Book buttons always respond: use saved Calendly URL, fallback to WhatsApp so click never dead-ends on '#'
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
  // click tracking
  for(const id of ['nav-whatsapp','nav-book','hero-wa','hero-book','cta-wa','cta-book','mentorship-wa']){
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',()=>track('cta_click',id,{href:el.href}));
  }
  // sections visibility/order
  const sRes=await fetch('/api/sections'); SECTIONS=await sRes.json();
  applySections();
  // Also render pricing with content pricing keys
  renderPricing();
  renderMentorship();
  renderFAQ();
}
function applySections(){
  // sort by display_order and hide where visible=0; also handle animation_enabled
  SECTIONS.sort((a,b)=>a.display_order-b.display_order);
  // For simplicity we don't reorder DOM physically for now, but hide
  for(const sec of SECTIONS){
    const el=document.querySelector(`[data-section="${sec.key}"]`);
    if(!el) continue;
    el.style.display = sec.visible ? '' : 'none';
    if(sec.animation_enabled===0) el.classList.add('no-anim');
    else el.classList.remove('no-anim');
  }
  // Reduced motion already handled globally
}

// Marquee
function renderMarquee(){
  const marquee=$('#marquee');
  const items=[
    {label:T('stat_stores_label','Stores Launched'), value: parseInt(STATS.stores_launched||47,10), kind:'n'},
    {label:T('stat_sales_label','Verified Sales'), value: parseInt(STATS.verified_sales||38200000,10), fmt:v=>'$'+(v/1000000).toFixed(1)+'M', kind:'m'},
    {label:T('stat_clients_label','Happy Clients'), value: parseInt(STATS.happy_clients||41,10), kind:'n'},
    {label:T('stat_launch_label','Avg Launch'), value: parseInt(STATS.avg_launch_days||11,10), fmt:v=>v+' days', kind:'d'},
  ];
  function makeStat(it){
    const d=document.createElement('div'); d.className='stat';
    const fmt = it.fmt ? it.fmt(it.value) : String(it.value);
    d.innerHTML=`<strong data-count="${it.value}" data-fmt="${it.fmt?'1':'0'}" data-kind="${it.kind}">${it.fmt?it.fmt(0):0}</strong><span>${it.label}<br><small style="text-transform:none;letter-spacing:0;color:var(--text-muted)">${fmt}</small></span>`;
    return d;
  }
  const row=document.createElement('div'); row.style.display='flex';
  items.forEach(it=>row.appendChild(makeStat(it)));
  const row2=row.cloneNode(true);
  marquee.appendChild(row); marquee.appendChild(row2);
  // count up observer
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
              // kind-based formatting (labels are admin-editable, so never match on label text)
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
  const grid=$('#portfolio-grid'); grid.innerHTML='';
  const filtered = filter==='All'? PORTFOLIO : PORTFOLIO.filter(p=> (p.category||'').toLowerCase()===filter.toLowerCase() || (p.tags||'').toLowerCase().includes(filter.toLowerCase()));
  if(filtered.length===0){
    grid.innerHTML='<p class="sub">'+sanitize(T('portfolio_empty','No stores in this category yet check back soon or view All.'))+'</p>';
    return;
  }
  filtered.forEach((item, idx)=>{
    const card=document.createElement('div'); card.className='card';
    card.style.animationDelay=(idx*60)+'ms';
    // detect video?
    const isVideo = item.url.match(/\.(mp4|webm|mov)$/i) || item.url.includes('video');
    const media = isVideo ? `<video src="${item.url}" muted loop playsinline poster=""></video><span style="position:absolute;right:10px;top:10px;background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:999px;font-size:10px">VIDEO</span>` : `<img src="${item.url}" alt="${sanitize(item.alt_text||item.caption)}" loading="lazy">`;
    card.innerHTML=`<div class="card-media">${media}<div class="overlay"><span class="tag">${sanitize(item.category||'Store')}</span><div class="result">${sanitize(item.result_stat||'')}</div><div style="font-size:13px;font-weight:700;margin-top:4px">${sanitize(item.caption||'')}</div><div class="view">${sanitize(T('modal_view_case','View Case Study'))} →</div></div></div>`;
    // stagger in
    requestAnimationFrame(()=> setTimeout(()=>card.classList.add('in'), 30+idx*40));
    card.addEventListener('click', ()=> openModal(item, filtered));
    // video hover autoplay
    if(isVideo){
      const v=card.querySelector('video');
      card.addEventListener('mouseenter', ()=> v.play().catch(()=>{}));
      card.addEventListener('mouseleave', ()=> {v.pause(); v.currentTime=0;});
      // mobile: autoplay when in view
      const io=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting) v.play().catch(()=>{}); else v.pause(); })},{threshold:.6});
      io.observe(card);
    }
    // reveal on scroll unless reduced
    if(!document.body.classList.contains('reduced')){
      const io2=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting) card.classList.add('in'); })},{threshold:.15});
      io2.observe(card);
    } else card.classList.add('in');
    grid.appendChild(card);
  });
}
// Filter bar
$$('#filter-bar .pill').forEach? null:null; // placeholder
document.addEventListener('click', e=>{
  if(e.target.matches('.pill')){
    $$('.pill').forEach(p=>p.classList.remove('active'));
    e.target.classList.add('active');
    const f=e.target.dataset.filter;
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
  const img=$('#modal-img');
  // If video, swap to video element? Simplify: show image/video as img src (video will not play in img tag, so handle)
  const isVid=item.url.match(/\.(mp4|webm)$/i);
  if(isVid){
    // replace img with video
    let v=document.getElementById('modal-video');
    if(!v){
      v=document.createElement('video'); v.id='modal-video'; v.controls=true; v.autoplay=true; v.muted=true; v.loop=true; v.style.width='100%'; v.style.height='100%'; v.style.objectFit='cover';
      img.replaceWith(v);
    }
    v.src=item.url;
    v.play().catch(()=>{});
  } else {
    let v=document.getElementById('modal-video');
    if(v){
      const newImg=document.createElement('img'); newImg.id='modal-img'; newImg.alt=''; newImg.style.width='100%'; newImg.style.height='100%'; newImg.style.objectFit='cover';
      v.replaceWith(newImg);
    }
    $('#modal-img').src=item.url;
    $('#modal-img').alt=item.alt_text||item.caption;
  }
  $('#modal-tag').textContent=item.category||'Store';
  $('#modal-title').textContent=item.caption||'Store';
  $('#modal-result').textContent=item.result_stat||'';
  $('#modal-desc').textContent=item.case_study_text||T('modal_fallback_desc','A fully-configured dropshipping store built for conversions premium theme, winning products, and automated fulfillment.');
  const waNum=CONTENT.whatsapp_number||'2348123456789';
  $('#modal-cta').textContent=T('modal_cta','Start a Store Like This')+' →';
  $('#modal-cta').href=whatsappLink(waNum, `Hi Nexatech! I love the ${item.category||''} store "${item.caption||''}" I want a store like this. How do we start?`);
  $('#modal-cta').onclick=()=>track('cta_click','modal-cta',{store:item.caption});
}
function closeModal(){
  $('#portfolio-modal').classList.remove('open');
  document.body.style.overflow='';
}
$('#modal-close').addEventListener('click', closeModal);
$('#portfolio-modal').addEventListener('click', e=>{ if(e.target.id==='portfolio-modal') closeModal(); });
$('#modal-prev').addEventListener('click', e=>{ e.stopPropagation(); MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal(); });
$('#modal-next').addEventListener('click', e=>{ e.stopPropagation(); MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal(); });
document.addEventListener('keydown', e=>{
  if(!$('#portfolio-modal').classList.contains('open')) return;
  if(e.key==='Escape') closeModal();
  if(e.key==='ArrowLeft') {MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal();}
  if(e.key==='ArrowRight') {MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal();}
});
// swipe
let sx=0;
$('#modal-media').addEventListener('touchstart', e=> sx=e.touches[0].clientX, {passive:true});
$('#modal-media').addEventListener('touchend', e=>{
  const dx=e.changedTouches[0].clientX - sx;
  if(Math.abs(dx)>40){
    if(dx<0) {MODAL_INDEX=(MODAL_INDEX+1)%MODAL_ITEMS.length; updateModal();}
    else {MODAL_INDEX=(MODAL_INDEX-1+MODAL_ITEMS.length)%MODAL_ITEMS.length; updateModal();}
  }
});

// Proof & Testimonials & Team & Reviews Wall (2550×1650)
async function loadMedia(){
  const proofR=await fetch('/api/media?type=sales_proof'); const proof=await proofR.json();
  const pGrid=$('#proof-grid'); pGrid.innerHTML='';
  proof.forEach(item=>{
    const c=document.createElement('div'); c.className='proof-card reveal';
    c.innerHTML=`<img src="${item.url}" alt="${sanitize(item.alt_text||'proof')}" loading="lazy"><p>${sanitize(item.caption||T('proof_caption_fallback','Verified sales proof'))}</p>`;
    pGrid.appendChild(c);
  });
  const testiR=await fetch('/api/media?type=testimonials'); const testi=await testiR.json();
  const tGrid=$('#testi-grid'); tGrid.innerHTML='';
  testi.forEach(item=>{
    const isVideo=item.url.match(/\.(mp4|webm)$/i);
    const media=isVideo?`<video src="${item.url}" muted loop playsinline style="width:40px;height:40px;border-radius:50%;object-fit:cover"></video>`:`<img src="${item.url}" alt="">`;
    const el=document.createElement('div'); el.className='testi reveal';
    el.innerHTML=`<q>${sanitize(item.caption||T('testi_fallback','Great experience with Nexatech.'))}</q><div class="who">${media}<div><b>${sanitize(item.alt_text||'Client')}</b><br><small style="color:var(--text-muted)">${sanitize(item.result_stat||T('testi_role_fallback','Verified buyer'))}</small></div></div>`;
    if(isVideo){ const v=el.querySelector('video'); if(v) v.play().catch(()=>{}); }
    tGrid.appendChild(el);
  });
  // Reviews wall uniform 2550×1650 landscape screenshots & videos
  try{
    const revR=await fetch('/api/media?type=reviews'); const reviews=await revR.json();
    const rGrid=$('#reviews-grid'); const empty=$('#reviews-empty');
    if(rGrid){
      rGrid.innerHTML='';
      if(reviews.length===0){
        if(empty) { empty.textContent=T('reviews_empty','No reviews uploaded yet add them in Admin - Media Manager - Review Screenshots.'); empty.classList.remove('hidden'); }
      } else {
        if(empty) empty.classList.add('hidden');
        reviews.forEach((item, idx)=>{
          const isVideo=item.url.match(/\.(mp4|webm|mov)$/i);
          const card=document.createElement('div'); card.className='reviews-card reveal';
          card.style.transitionDelay=(idx*50)+'ms';
          card.innerHTML = isVideo
            ? `<video src="${item.url}" muted loop playsinline preload="metadata" poster=""></video><div class="play-badge"><span>▶</span></div><div class="caption">${sanitize(item.caption||T('review_video_label','Video Review'))}</div>`
            : `<img src="${item.url}" alt="${sanitize(item.alt_text||item.caption||T('review_caption_fallback','Customer Review'))}" loading="lazy"><div class="caption">${sanitize(item.caption||T('review_caption_fallback','Customer Review'))}</div>`;
          card.addEventListener('click', ()=>{
            // open in modal lightbox (reuse portfolio modal)
            MODAL_ITEMS=reviews; MODAL_INDEX=reviews.findIndex(x=>x.id===item.id);
            updateModal();
            $('#portfolio-modal').classList.add('open');
            document.body.style.overflow='hidden';
            track('reviews_view', String(item.id), {type: isVideo?'video':'image'});
          });
          // video hover preview
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
  // Certificates & Awards — image upload grid
  try{
    const certR=await fetch('/api/media?type=certificates'); const certs=await certR.json();
    const cGrid=$('#certs-grid'); const cEmpty=$('#certs-empty');
    if(cGrid){
      cGrid.innerHTML='';
      if(certs.length===0){
        if(cEmpty) { cEmpty.textContent=T('certs_empty','No certificates uploaded yet - add them in Admin - Media Manager - Certificates & Awards.'); cEmpty.classList.remove('hidden'); }
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
  // team
  const teamR=await fetch('/api/team'); const team=await teamR.json();
  const tGrid2=$('#team-grid'); tGrid2.innerHTML='';
  team.slice(0,4).forEach((m,idx)=>{
    const card=document.createElement('div'); card.className='team-card';
    card.style.transitionDelay=(idx*80)+'ms';
    card.innerHTML=`<img src="${m.photo_url||'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200'}" alt="${sanitize(m.name)}"><div><h4>${sanitize(m.name)}</h4><small>${sanitize(m.role)}</small><p>${sanitize(m.credibility_note)}</p>${m.social_url?`<a href="${m.social_url}" target="_blank" style="font-size:12px;color:var(--accent-2)">LinkedIn →</a>`:''}</div>`;
    tGrid2.appendChild(card);
    setTimeout(()=>card.classList.add('in'), 200+idx*120);
  });
  if(team.length>4) {$('#view-full-team').classList.remove('hidden'); $('#view-full-team').href='/team.html';}
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
    const el=document.createElement('div'); el.className='price-card'+(t.popular?' popular':'');
    el.innerHTML=`${t.popular?'<span class="popular-badge">'+sanitize(T('pricing_popular_badge','Most Popular'))+'</span>':''}<div class="eyebrow" style="margin:0">${sanitize(t.name)}</div><div class="price">${sanitize(t.price)}</div><ul>${t.features.map(f=>`<li>${sanitize(f)}</li>`).join('')}</ul><a class="btn ${t.popular?'btn-primary':'btn-ghost'}" href="${whatsappLink(waNum, t.wa)}" target="_blank" style="margin-top:auto">${sanitize(T('pricing_cta_template','Choose {name}').replace('{name}', t.name))} →</a>`;
    const a=el.querySelector('a'); a.addEventListener('click',()=>track('cta_click','pricing-'+t.key,{price:t.price}));
    grid.appendChild(el);
  });
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

// Lead Form multi-step — FIX: scope to #lead-form so How It Works 4 steps never vanish
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
  const labels=[T('form_step_1','Step 1 of 3 Vision'),T('form_step_2','Step 2 of 3 Qualification'),T('form_step_3','Step 3 of 3 Contact & Delivery')];
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
    // hide if conditional not needed
    if(field) field.classList.toggle('invalid', !valid);
    if(!valid) ok=false;
  });
  return ok;
}
$('#btn-next').addEventListener('click', ()=>{
  if(!validateStep(currentStep)) return;
  if(currentStep<totalSteps) { track('form_next', 'step'+currentStep); showStep(currentStep+1); }
});
$('#btn-prev').addEventListener('click', ()=> showStep(currentStep-1));
// conditional fields
$('select[name="preferredNiche"]').addEventListener('change', e=>{
  $('#other-niche-field').classList.toggle('hidden', e.target.value!=='Other');
});
$('select[name="wasScammed"]').addEventListener('change', e=>{
  $('#scam-details-field').classList.toggle('hidden', e.target.value!=='yes');
});
document.addEventListener('DOMContentLoaded', ()=>{
  // track form start on first focus
  let started=false;
  $('#lead-form').addEventListener('focusin', ()=>{
    if(!started){ started=true; track('form_start','lead_form'); }
  });
});
$('#lead-form').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!validateStep(3)) return;
  const fd=new FormData(e.target);
  const wa_code=fd.get('wa_code')||'+234';
  const wa_raw=fd.get('whatsapp')||'';
  const fullWA = wa_raw.startsWith('+')? wa_raw : wa_code + wa_raw.replace(/^0+/,'');
  const payload={
    name: fd.get('name')?.trim(),
    storeName: fd.get('storeName')?.trim(),
    preferredNiche: fd.get('preferredNiche'),
    preferredNicheOther: fd.get('preferredNicheOther')||'',
    investmentRange: fd.get('investmentRange'),
    storeStatus: fd.get('storeStatus'),
    wasScammed: fd.get('wasScammed'),
    scamDetails: fd.get('scamDetails')||'',
    whatsapp: fullWA.trim(),
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
  // client validation already done
  const btn=$('#btn-submit');
  const msg=$('#form-msg');
  btn.disabled=true; btn.textContent=T('form_submitting','Submitting...'); msg.textContent='';
  try{
    const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await res.json();
    if(!res.ok) throw new Error(j.error||'Submission failed');
    msg.style.color='var(--success)';
    const emailEcho = payload.email ? ' '+T('form_success_email_note',"We've sent details to {email} - please check your inbox (and spam folder).").replace('{email}', payload.email) : '';
    msg.textContent=(j.message||'Application received.') + emailEcho;
    e.target.reset(); showStep(1);
    track('form_complete','lead_form',{leadId:j.leadId});
    // optional: redirect to calendly after 1.5s?
    // setTimeout(()=>{ if(CONTENT.calendly_url) location.href=CONTENT.calendly_url; }, 1800);
  }catch(err){
    msg.style.color='#EF4444'; msg.textContent=err.message || 'Something went wrong. Please try again or chat on WhatsApp.';
  }finally{
    btn.disabled=false; btn.textContent=T('form_submit','Submit Application & Book Strategy Call');
  }
});

// Hero particles lightweight network dots
function initParticles(){
  const canvas=$('#hero-particles'); if(!canvas) return;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced');
  if(prefersReduced) { canvas.style.display='none'; return; }
  const ctx=canvas.getContext('2d');
  const dpr=Math.min(window.devicePixelRatio||1, 2);
  let w,h, particles=[], raf, hidden=false;
  const isMobile = window.innerWidth<=768;
  const count = isMobile? 18 : 36;
  function resize(){
    w=canvas.clientWidth; h=canvas.clientHeight;
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
  canvas.addEventListener? null:null;
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
  // scroll parallax
  let scrollY=0;
  window.addEventListener('scroll', ()=>{ scrollY=window.scrollY; }, {passive:true});
  function loop(){
    if(hidden) return;
    ctx.clearRect(0,0,w,h);
    const parX= mouse.active ? mouse.x*6 : 0;
    const parY= mouse.active ? mouse.y*6 : 0;
    const sPar= Math.min(scrollY*0.04, 12);
    // draw lines between close particles
    for(let i=0;i<particles.length;i++){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
      // parallax offset
      const px=p.x + parX * (0.5 + (p.r/2));
      const py=p.y + parY * (0.5 + (p.r/2)) - sPar*0.2;
      // connections
      for(let j=i+1;j<particles.length;j++){
        const q=particles[j];
        const qx=q.x + parX*0.5, qy=q.y + parY*0.5 - sPar*0.2;
        const dx=px-qx, dy=py-qy; const dist=Math.hypot(dx,dy);
        if(dist<110){
          ctx.strokeStyle=`rgba(0,209,255,${(1-dist/110)*0.14})`;
          ctx.lineWidth=0.7;
          ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(qx,qy); ctx.stroke();
        }
      }
    }
    // draw dots
    particles.forEach(p=>{
      const px=p.x + parX*0.8, py=p.y + parY*0.8 - sPar*0.15;
      ctx.beginPath(); ctx.arc(px,py,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(124,58,237,0.55)'; // accent-2
      ctx.fill();
      // inner bright
      ctx.beginPath(); ctx.arc(px,py,p.r*0.45,0,Math.PI*2); ctx.fillStyle='rgba(0,209,255,0.9)'; ctx.fill();
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

// Header scroll + parallax for gradient
function initHeader(){
  const h=$('#header');
  const hero=$('#hero');
  window.addEventListener('scroll', ()=>{
    h.classList.toggle('scrolled', window.scrollY>16);
    const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced');
    if(prefersReduced) return;
    const y=window.scrollY;
    if(hero){
      const aur=hero.querySelector('.aurora');
      if(aur) aur.style.transform=`translateY(${y*0.06}px)`;
    }
  }, {passive:true});
  // drawer
  $('#hamburger').addEventListener('click', ()=> $('#drawer').classList.add('open'));
  $('#drawer-close').addEventListener('click', ()=> $('#drawer').classList.remove('open'));
  $('#drawer').addEventListener('click', e=>{ if(e.target.id==='drawer') e.currentTarget.classList.remove('open'); });
}

// Reveal observer — ensure all steps/process show everything (per owner request) — FIX: steps never vanish
function initReveal(){
  // FIX: How It Works must always show all 4 steps — process bar at 100% immediately, never hide 2,3,4
  const stepsEls = document.querySelectorAll('.step');
  stepsEls.forEach(s=> s.classList.add('in'));
  const plInit = $('#progress-line');
  if(plInit){ plInit.style.transform='scaleX(1)'; plInit.classList.add('on'); }
  // Ensure steps grid is visible
  const stepsContainer = document.querySelector('.steps');
  if(stepsContainer){ stepsContainer.style.opacity='1'; stepsContainer.style.visibility='visible'; }

  const els=$$('.reveal, .proof-card, .testi, .team-card');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduced')){
    els.forEach(el=>el.classList.add('in'));
    return;
  }
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('in');
      }
    });
  },{threshold:.18});
  els.forEach(el=>io.observe(el));
  // Fallback: show everything after 1.2s even if not intersecting
  setTimeout(()=>{
    // Re-assert steps never vanish — even if observer failed
    document.querySelectorAll('.step').forEach(s=>s.classList.add('in'));
    const pl = $('#progress-line');
    if(pl){ pl.style.transform='scaleX(1)'; pl.classList.add('on'); }
    $$('.reveal, .proof-card, .testi, .team-card').forEach(el=>{
      if(!el.classList.contains('in')) el.classList.add('in');
    });
  }, 1200);
  // Safety: re-assert every 2s that all 4 remain visible (prevents 2,3,4 vanish on some browsers)
  setInterval(()=>{
    const s = document.querySelectorAll('.step');
    let missing=false;
    s.forEach(el=>{ if(!el.classList.contains('in')) missing=true; el.classList.add('in'); });
    if(missing){ const p=$('#progress-line'); if(p){ p.style.transform='scaleX(1)'; p.classList.add('on'); } }
  }, 2000);
}

// Chatbot — persists reload (sessionStorage), new tab fresh, with New/Recent/WhatsApp + reads history before reply
function initChat(){
  const btn=$('#chat-btn'), win=$('#chat-win'), close=$('#chat-close'), input=$('#chat-input'), send=$('#chat-send'), body=$('#chat-body');
  const newBtn=$('#chat-new'), recentBtn=$('#chat-recent'), recentList=$('#chat-recent-list');
  const CHAT_KEY = 'nexatech_chat_history';
  const RECENT_KEY = 'nexatech_recent_chats';
  function saveHistory(){
    try{
      const msgs=[...body.querySelectorAll('.msg')].map(el=>({cls:el.className, html:el.innerHTML, text:el.textContent}));
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
    }catch{}
  }
  function loadHistory(){
    try{
      const raw=sessionStorage.getItem(CHAT_KEY);
      if(!raw) return false;
      const arr=JSON.parse(raw);
      if(!Array.isArray(arr) || arr.length===0) return false;
      body.innerHTML='';
      arr.forEach(m=>{
        const d=document.createElement('div'); d.className=m.cls; d.innerHTML=m.html;
        // re-bind quick buttons if needed (they are outside body)
        body.appendChild(d);
      });
      body.scrollTop=body.scrollHeight;
      return true;
    }catch{ return false; }
  }
  function getRecents(){ try{ return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); }catch{ return []; } }
  function saveRecents(list){ try{ localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0,10))); }catch{} }
  function archiveCurrent(){
    try{
      const msgs=[...body.querySelectorAll('.msg')].map(el=>({cls:el.className, html:el.innerHTML, text:el.textContent}));
      // don't archive if only greeting
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
    if(recents.length===0){ recentList.innerHTML='<div style="padding:8px;font-size:12px;color:#94A3B8">'+sanitize(T('chat_no_recent','No recent chats yet - start a conversation first.'))+'</div>'; return; }
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
  // Identity gate — visitors must provide name + email before chatting (shown in Admin → Chatbot → People)
  const IDENTITY_KEY = 'nexatech_chat_identity';
  function getIdentity(){ try{ const o=JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null'); if(o && o.name && o.email) return o; }catch{} return null; }
  function setIdentity(name,email){ try{ localStorage.setItem(IDENTITY_KEY, JSON.stringify({name, email})); }catch{} }
  function clearIdentity(){ try{ localStorage.removeItem(IDENTITY_KEY); }catch{} }
  function escId(s){ const d=document.createElement('div'); d.textContent=String(s||''); return d.innerHTML; }
  function setChatEnabled(on){
    try{ input.disabled=!on; send.disabled=!on; }catch{}
  }
  function bindQuick(){
    body.querySelectorAll('.quick button').forEach(b=> b.addEventListener('click', ()=>{ input.value=b.dataset.q; sendMsg(); }));
  }
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
    const greet=T('chat_greeting','Hi {name}! I am the Nexatech assistant. Ask me about packages, timelines, or proof or tap a quick question below.').replace('{name}', first);
    body.innerHTML=`<div class="msg bot">${sanitize(greet)}</div>`+quickHtml()+`<div style="font-size:10px;color:#94A3B8;padding:2px 4px">${sanitize(T('chat_chatting_as','Chatting as'))} <b>${id?escId(id.name):''}</b>${id?' ('+escId(id.email)+')':''} <button id="chat-switch-id" style="border:none;background:none;color:#7C3AED;cursor:pointer;font-size:10px;text-decoration:underline">${sanitize(T('chat_switch','switch'))}</button></div>`;
    bindQuick();
    body.querySelector('#chat-switch-id')?.addEventListener('click', ()=>{ clearIdentity(); showGate(); });
    setChatEnabled(true);
    saveHistory();
  }
  function showGate(){
    setChatEnabled(false);
    body.innerHTML=`<div class="msg bot">${T('chat_gate_intro','Hi! Before we start, please tell us your name and email so we can follow up.')}</div>
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
  // Per owner request: +New Chat OR reload starts fresh (recent kept in localStorage, not current)
  sessionStorage.removeItem(CHAT_KEY);
  const hadHistory = false;
  // don't restore — always start fresh on load/reload; recent is via localStorage
  // Gate: identity required before chat
  if(getIdentity()) showGreeting(); else showGate();
  btn.addEventListener('click', ()=> win.classList.toggle('open'));
  close.addEventListener('click', ()=> win.classList.remove('open'));
  // New Chat — archive current then reset (identity kept, so no re-ask)
  newBtn?.addEventListener('click', ()=>{
    archiveCurrent();
    sessionStorage.removeItem(CHAT_KEY);
    if(getIdentity()) showGreeting(); else showGate();
    body.scrollTop=0;
  });
  // Recent toggle
  recentBtn?.addEventListener('click', ()=>{
    const isOpen = recentList.style.display!=='none';
    if(isOpen){ recentList.style.display='none'; }
    else { renderRecent(); recentList.style.display='block'; }
  });
  // WhatsApp link already points to https://wa.me/19283825389 — ensure it uses current CONTENT if loaded
  const waLink = $('#chat-whatsapp');
  if(waLink){
    // update after content loads
    const updWa = ()=>{ if(CONTENT.whatsapp_number) waLink.href=whatsappLink(CONTENT.whatsapp_number, 'Hi Nexatech!'); };
    // delay until content loaded
    setTimeout(updWa, 1500);
  }
  // Helper: create WhatsApp button that stays inside chat frame
  function createWhatsAppButton(userText){
    const waNum = CONTENT.whatsapp_number || '19283825389';
    // Use exactly what client asked as custom prefill — e.g. "how do i get started"
    const customMsg = `Hi Nexatech 👋, ${userText}`.slice(0,800);
    const url = whatsappLink(waNum, customMsg);
    const a=document.createElement('a');
    a.href=url; a.target='_blank'; a.rel='noopener';
    a.className='chat-wa-btn';
    a.textContent=T('chat_wa_continue','Continue on WhatsApp')+' →';
    a.setAttribute('aria-label',T('chat_wa_continue','Continue on WhatsApp'));
    // Inline ensure no overflow (also in CSS)
    a.style.cssText='display:inline-flex;align-items:center;justify-content:center;max-width:100%;box-sizing:border-box;word-break:break-word;white-space:normal;overflow-wrap:anywhere;margin-top:8px;padding:10px 14px;border-radius:999px;background:var(--primary);color:#fff;font-weight:700;font-size:13px;text-decoration:none;box-shadow:0 6px 14px rgba(11,18,32,.12);';
    return a;
  }
  function shouldShowWhatsAppButton(replyText, userText, apiJson){
    if(apiJson && apiJson.fallback) return true;
    // If backend still accidentally returned raw wa.me link, we will show button anyway and strip link
    if(/wa\.me/i.test(replyText||'') || /https?:\/\/wa\.me/i.test(apiJson?.reply||'')) return true;
    // Handoff phrases from prompt — support both Ifeoluwa and legacy Saheed
    if(/continue on whatsapp|tap the button below|whatsapp with (ifeoluwa|saheed)|tap below/i.test(replyText||'')) return true;
    // User intent handoff — always show button for these, even if reply doesn't mention WhatsApp yet
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
    const userQuestion = text; // keep for WhatsApp custom prefill
    // Build history from existing msgs BEFORE appending new user msg (so bot reads previous messages before reply)
    const history = [...body.querySelectorAll('.msg')].slice(-12).map(el=>{
      const isUser = el.classList.contains('user');
      // Skip quick buttons container text
      if(el.classList.contains('quick')) return null;
      const t = el.textContent.trim();
      if(!t) return null;
      return { role: isUser ? 'user' : 'model', text: t.slice(0,2000) };
    }).filter(Boolean).slice(-10);
    const u=document.createElement('div'); u.className='msg user'; u.textContent=text; body.appendChild(u);
    input.value=''; body.scrollTop=body.scrollHeight;
    saveHistory();
    track('chat_message','chat', {text});
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text, sessionId, history, pageUrl: location.href, name: id.name, email: id.email})});
      const j=await r.json();
      const bot=document.createElement('div'); bot.className='msg bot';
      let replyText = j.reply || j.error || T('chat_offline','Not available right now - tap below to chat on WhatsApp.');
      // Strip any raw wa.me URLs Gemini might still emit — we render as button instead so link never overflows frame
      replyText = replyText.replace(/https?:\/\/wa\.me[^\s"'\)]+/gi, '').replace(/https?:\/\/wa\.me[^\s]*/gi, '').replace(/\[WHATSAPP[^\]]*\]/gi, '').trim();
      // Collapse double spaces left by stripping
      replyText = replyText.replace(/\s{2,}/g,' ').trim();
      bot.textContent = replyText || T('chat_offline','Not available right now - tap below to chat on WhatsApp.');
      if(shouldShowWhatsAppButton(replyText, userQuestion, j)){
        const btn = createWhatsAppButton(userQuestion);
        bot.appendChild(document.createElement('br'));
        bot.appendChild(btn);
      } else if(j.fallback){
        // Fallback also uses custom user text, not static plan
        const btn = createWhatsAppButton(userQuestion);
        bot.appendChild(document.createElement('br'));
        bot.appendChild(btn);
      }
      body.appendChild(bot);
    }catch{
      const bot=document.createElement('div'); bot.className='msg bot'; bot.textContent=T('chat_offline','Not available right now - tap below to chat on WhatsApp.');
      const btn = createWhatsAppButton(userQuestion);
      bot.appendChild(document.createElement('br'));
      bot.appendChild(btn);
      body.appendChild(bot);
    } finally {
      isSending=false; send.disabled=false; input.disabled=false; try{ input.focus(); }catch{}
    }
    body.scrollTop=body.scrollHeight;
    saveHistory();
  }
  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMsg(); } });
  // if no history, keep initial bot greeting and save it
  if(!hadHistory) saveHistory();
  // Auto follow-up: after name+email + chat ends, send instant AI email (HTML + WhatsApp + opt-out, logged to CRM)
  // Triggers: idle 3 min after last message, New Chat, or page hide — backend dedups + cron also catches idle
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
  const _origSendMsg = sendMsg;
  // wrap to reset idle after each send (monkey-patch via event)
  send.addEventListener('click', resetIdleTimer);
  input.addEventListener('keydown', ()=>{ try{ if(idleTimer) clearTimeout(idleTimer); }catch{} });
  // reset after bot reply completes — poll: observe body changes
  try{
    const obs = new MutationObserver(()=> resetIdleTimer());
    obs.observe(body, { childList:true });
  }catch{}
  resetIdleTimer();
  // Auto-archive on page hide/reload for recent + notify finish
  window.addEventListener('beforeunload', ()=>{ try{ archiveCurrent(); }catch{} try{ notifyChatFinished('hide'); }catch{} });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) try{ notifyChatFinished('hide'); }catch{} });
  newBtn?.addEventListener('click', ()=>{ try{ notifyChatFinished('new'); }catch{} try{ if(idleTimer) clearTimeout(idleTimer); }catch{} try{ sessionStorage.removeItem(FINISH_KEY + sessionId); }catch{} resetIdleTimer(); }, true);
}

// Init all
(async function init(){
  try{ await loadContent(); }catch(e){ console.error('content load failed',e); }
  renderMarquee();
  try{ await loadPortfolio(); }catch(e){ console.error(e); }
  try{ await loadMedia(); }catch(e){ console.error(e); }
  initParticles();
  initChips();
  initHeader();
  initReveal();
  initChat();
  showStep(1);
  // pageview
  track('pageview','landing');
  // respect prefers-reduced-motion live changes
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e=>{
    if(e.matches) document.body.classList.add('reduced');
    else if(CONTENT.reduced_motion!=='true') document.body.classList.remove('reduced');
  });
})();