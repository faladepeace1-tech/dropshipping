// Admin App
const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];
// Attribute-safe escaping for value="..." interpolations (names/quotes must not break editing)
function escAttr(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Shared media helpers (mirror app.js): query-string-safe video check + YouTube/Vimeo/Drive embeds
function stripUrlParamsA(u){ return String(u||'').split('?')[0].split('#')[0]; }
function isVideoFileA(u){ return /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv|3gp)$/i.test(stripUrlParamsA(u).trim()); }
function ytIdA(u){ try{ const m=String(u||'').match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i); if(m) return m[1]; }catch{} return ''; }
function vimeoIdA(u){ try{ const m=String(u||'').match(/vimeo\.com\/(?:video\/)?(\d{5,})/i); if(m) return m[1]; }catch{} return ''; }
function driveIdA(u){ try{ const m=String(u||'').match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i); if(m) return m[1]; }catch{} return ''; }
function mediaKindA(u){ if(!u) return 'image'; if(ytIdA(u)) return 'youtube'; if(vimeoIdA(u)) return 'vimeo'; if(driveIdA(u)) return 'drive'; if(isVideoFileA(u)) return 'video'; return 'image'; }
function fmtSize(b){ if(!b && b!==0) return ''; if(b>=1048576) return (b/1048576).toFixed(1)+' MB'; return (b/1024).toFixed(1)+' KB'; }
// ---- Chunked upload (large videos): 4MB pieces with per-piece retry ----
// Single-shot uploads of 30MB+ get killed by proxies with an HTML error page,
// so files over CHUNK_THRESHOLD go up piece by piece instead.
const CHUNK_THRESHOLD = 6 * 1024 * 1024;
const CHUNK_SIZE = 4 * 1024 * 1024;
async function chunkedUploadMedia(file, meta, onProgress){
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const initR = await fetch('/api/media/chunk-init', {method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify({filename: file.name, totalSize: file.size, totalChunks, mime: file.type||'', ...meta})});
  const initJ = await initR.json().catch(()=>({}));
  if(!initR.ok) throw new Error(initJ.error || ('Init failed (HTTP '+initR.status+')'));
  if(initR.status===401 || initJ.error==='Unauthorized' || initJ.error==='Invalid token') throw new Error('Session expired — log out and log back in, then retry.');
  const uploadId = initJ.uploadId;
  if(!uploadId) throw new Error('Init failed (no upload id)');
  for(let i=0;i<totalChunks;i++){
    const start = i*CHUNK_SIZE, end = Math.min(file.size, start+CHUNK_SIZE);
    const blob = file.slice(start, end);
    let attempt = 0, lastErr = '';
    for(;;){
      try{
        const ctl = new AbortController();
        const timer = setTimeout(()=> ctl.abort(), 90000);
        const fd = new FormData();
        fd.append('uploadId', uploadId);
        fd.append('index', String(i));
        fd.append('chunk', blob, file.name + '.part' + i);
        let r, j;
        try{ r = await fetch('/api/media/chunk', {method:'POST', headers: authHeaders(), body: fd, signal: ctl.signal}); }
        finally{ clearTimeout(timer); }
        j = await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(j.error || ('Piece '+(i+1)+' failed (HTTP '+r.status+')'));
        break;
      }catch(e){
        attempt++; lastErr = (e && e.name==='AbortError') ? 'timed out' : e.message;
        if(attempt>=4) throw new Error('Piece '+(i+1)+'/'+totalChunks+' failed after retries: '+lastErr);
        await new Promise(res=> setTimeout(res, 800*attempt));
      }
    }
    if(onProgress) onProgress(end / file.size, i+1, totalChunks);
  }
  const cR = await fetch('/api/media/chunk-complete', {method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify({uploadId})});
  const cJ = await cR.json().catch(()=>({}));
  if(!cR.ok) throw new Error(cJ.error || ('Assemble failed (HTTP '+cR.status+')'));
  return cJ;
}
let token = localStorage.getItem('nexatech_admin_token') || '';
let CONTENT={}, SECTIONS=[], MEDIA=[], TEAM=[], LEADS=[], ANALYTICS=null;
let lastPublishedContent=null;

function authHeaders(extra={}){ return token? {Authorization:'Bearer '+token, ...extra} : extra; }

async function checkAuth(){
  if(!token) return false;
  const r=await fetch('/api/admin/me', {headers: authHeaders()});
  if(r.ok){ const j=await r.json(); $('#auth-user').textContent=j.user.username; return true; }
  return false;
}
async function login(u,p){
  const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const j=await r.json();
  if(!r.ok) throw new Error(j.error||'Login failed');
  token=j.token; localStorage.setItem('nexatech_admin_token', token);
  document.cookie=`token=${token}; path=/; SameSite=Lax`;
}

function showApp(show){
  $('#login-view').classList.toggle('hidden', show);
  $('#app').classList.toggle('hidden', !show);
}

$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const u=fd.get('username'), p=fd.get('password');
  $('#login-msg').textContent='';
  try{ await login(u,p); if(await checkAuth()){ showApp(true); await loadAll(); } }catch(err){ $('#login-msg').textContent=err.message; }
});
$('#btn-logout').addEventListener('click', async()=>{
  await fetch('/api/admin/logout',{method:'POST'});
  localStorage.removeItem('nexatech_admin_token'); token=''; showApp(false);
});
$('#btn-preview').addEventListener('click', ()=> window.open('/', '_blank'));
$('#btn-preview-booking')?.addEventListener('click', ()=> window.open('/', '_blank'));


// Tabs
$$('.side-nav button').forEach(b=> b.addEventListener('click', ()=>{
  $$('.side-nav button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  const tab=b.dataset.tab;
  $('#tab-title').textContent=b.textContent;
  $$('[data-panel]').forEach(p=> p.classList.toggle('hidden', p.dataset.panel!==tab));
  if(tab==='analytics') loadAnalytics();
  if(tab==='leads') loadLeads();
  if(tab==='brand') loadBrand();
  if(tab==='team') loadTeam();
  if(tab==='media') loadMedia();
  if(tab==='sections') loadSections();
  if(tab==='campaigns'){ loadCampaigns(); loadTemplates(); loadGmailStatus(); loadOutbox(); }
  if(tab==='chats') loadChats();
  if(tab==='overview') loadOverview();
}));
$$('[data-tab-jump]').forEach(b=> b.addEventListener('click', ()=>{
  const t=b.dataset.tabJump;
  document.querySelector(`.side-nav button[data-tab="${t}"]`)?.click();
}));

// Content definitions organized by section
const CONTENT_SCHEMA = {
  general: [
    {key:'site_name', label:'Site Name'},
    {key:'tagline', label:'Tagline', type:'textarea'},
    {key:'seo_title', label:'SEO Title'},
    {key:'seo_description', label:'SEO Description', type:'textarea'},
    {key:'og_image', label:'OG Image URL', type:'image_upload'},
    {key:'color_primary', label:'Primary Color', type:'color'},
    {key:'color_primary_light', label:'Primary Light', type:'color'},
    {key:'color_accent', label:'Accent Color', type:'color'},
    {key:'color_accent_2', label:'Accent 2', type:'color'},
    {key:'color_bg', label:'Background', type:'color'},
    {key:'color_bg_alt', label:'Background Alt', type:'color'},
    {key:'color_text', label:'Text Color', type:'color'},
    {key:'color_text_muted', label:'Text Muted', type:'color'},
    {key:'color_border', label:'Border Color', type:'color'},
    {key:'color_success', label:'Success Color', type:'color'},
    {key:'font_family', label:'Font Family (CSS)'},
    {key:'logo_text', label:'Logo Text'},
    {key:'logo_url', label:'Logo Image (upload or URL)', type:'image_upload'},
    {key:'favicon_url', label:'Favicon (upload or URL, .ico/.png)', type:'image_upload'},
    {key:'reduced_motion', label:'Global Reduced Motion (true/false)', type:'select', options:['true','false']},
  ],
  navbar: [
    {key:'logo_text', label:'Logo Text (shown if no logo image)'},
    {key:'whatsapp_number', label:'WhatsApp Number'},
    {key:'calendly_url', label:'Calendly / Booking URL'},
    {key:'nav_link_portfolio', label:'Nav Link: Portfolio'},
    {key:'nav_link_proof', label:'Nav Link: Proof'},
    {key:'nav_link_pricing', label:'Nav Link: Pricing'},
    {key:'nav_link_faq', label:'Nav Link: FAQ'},
    {key:'nav_whatsapp_label', label:'Nav WhatsApp Button Label'},
    {key:'nav_book_label', label:'Nav Book Button Label'},
  ],
  hero: [
    {key:'hero_title', label:'Hero Title'},
    {key:'hero_subtitle', label:'Hero Subtitle', type:'textarea'},
    {key:'hero_cta_primary', label:'Hero CTA Primary'},
    {key:'hero_cta_secondary', label:'Hero CTA Secondary'},
    {key:'hero_badge', label:'Hero Badge (template with {remaining})'},
    {key:'hero_image_url', label:'Hero Mockup Image (upload or URL)', type:'image_upload'},
    {key:'trust_1_bold', label:'Trust Badge 1 (bold part)'},
    {key:'trust_1_text', label:'Trust Badge 1 (rest)'},
    {key:'trust_2_bold', label:'Trust Badge 2 (bold part)'},
    {key:'trust_2_text', label:'Trust Badge 2 (rest)'},
    {key:'trust_3_bold', label:'Trust Badge 3 (bold part)'},
    {key:'trust_3_text', label:'Trust Badge 3 (rest)'},
    {key:'hero_visual_domain', label:'Hero Browser Mockup Domain'},
    {key:'chip_1_title', label:'Floating Card 1 Title'},
    {key:'chip_1_sub', label:'Floating Card 1 Subtitle'},
    {key:'chip_2_title', label:'Floating Card 2 Title'},
    {key:'chip_2_sub', label:'Floating Card 2 Subtitle'},
    {key:'chip_3_title', label:'Floating Card 3 Title'},
    {key:'chip_3_sub', label:'Floating Card 3 Subtitle'},
  ],
  social: [
    {key:'social_proof_title', label:'Social Proof Title'},
    {key:'stat_stores_label', label:'Stat 1 Label (Stores)'},
    {key:'stat_sales_label', label:'Stat 2 Label (Sales)'},
    {key:'stat_clients_label', label:'Stat 3 Label (Clients)'},
    {key:'stat_launch_label', label:'Stat 4 Label (Launch time)'},
  ],
  portfolio: [
    {key:'portfolio_title', label:'Portfolio Title'},
    {key:'portfolio_subtitle', label:'Portfolio Subtitle', type:'textarea'},
    {key:'portfolio_eyebrow', label:'Portfolio Eyebrow'},
    {key:'filter_all', label:'Filter: All'},
    {key:'filter_fashion', label:'Filter: Fashion'},
    {key:'filter_beauty', label:'Filter: Beauty'},
    {key:'filter_gadgets', label:'Filter: Tech Gadgets'},
    {key:'filter_fitness', label:'Filter: Fitness'},
    {key:'filter_home', label:'Filter: Home'},
    {key:'filter_eco', label:'Filter: Eco Friendly'},
    {key:'portfolio_empty', label:'Empty Category Message', type:'textarea'},
    {key:'modal_view_case', label:'Card Overlay Button'},
    {key:'modal_cta', label:'Case Study Popup Button'},
    {key:'modal_fallback_desc', label:'Popup Fallback Description', type:'textarea'},
  ],
  proof: [
    {key:'sales_proof_title', label:'Sales Proof Title'},
    {key:'sales_proof_subtitle', label:'Sales Proof Subtitle', type:'textarea'},
    {key:'proof_eyebrow', label:'Proof Eyebrow'},
    {key:'proof_caption_fallback', label:'Fallback Caption (no caption uploaded)'},
  ],
  experts: [
    {key:'experts_title', label:'Experts Title'},
    {key:'experts_subtitle', label:'Experts Subtitle', type:'textarea'},
    {key:'experts_eyebrow', label:'Experts Eyebrow'},
    {key:'team_view_all', label:'View Full Team Link'},
  ],
  how: [
    {key:'how_it_works_title', label:'How It Works Title'},
    {key:'how_it_works_subtitle', label:'How It Works Subtitle', type:'textarea'},
    {key:'how_it_works_step1_title', label:'Step 1 Title'},
    {key:'how_it_works_step1_desc', label:'Step 1 Desc', type:'textarea'},
    {key:'how_it_works_step2_title', label:'Step 2 Title'},
    {key:'how_it_works_step2_desc', label:'Step 2 Desc', type:'textarea'},
    {key:'how_it_works_step3_title', label:'Step 3 Title'},
    {key:'how_it_works_step3_desc', label:'Step 3 Desc', type:'textarea'},
    {key:'how_it_works_step4_title', label:'Step 4 Title'},
    {key:'how_it_works_step4_desc', label:'Step 4 Desc', type:'textarea'},
  ],
  pricing: [
    {key:'pricing_title', label:'Pricing Title'},
    {key:'pricing_subtitle', label:'Pricing Subtitle', type:'textarea'},
    {key:'pricing_eyebrow', label:'Pricing Eyebrow'},
    {key:'pricing_popular_badge', label:'Most Popular Badge'},
    {key:'pricing_cta_template', label:'Plan Button Template (use {name})'},
    {key:'pricing_starter_name', label:'Starter Name'},
    {key:'pricing_starter_price', label:'Starter Price'},
    {key:'pricing_starter_features', label:'Starter Features (one per line, text format)', type:'textarea'},
    {key:'pricing_starter_whatsapp', label:'Starter WhatsApp Message', type:'textarea'},
    {key:'pricing_pro_name', label:'Pro Name'},
    {key:'pricing_pro_price', label:'Pro Price'},
    {key:'pricing_pro_features', label:'Pro Features (one per line, text format)', type:'textarea'},
    {key:'pricing_pro_whatsapp', label:'Pro WhatsApp Message', type:'textarea'},
    {key:'pricing_elite_name', label:'Elite Name'},
    {key:'pricing_elite_price', label:'Elite Price'},
    {key:'pricing_elite_features', label:'Elite Features (one per line, text format)', type:'textarea'},
    {key:'pricing_elite_whatsapp', label:'Elite WhatsApp Message', type:'textarea'},
    {key:'mentorship_title', label:'Mentorship Title'},
    {key:'mentorship_subtitle', label:'Mentorship Subtitle', type:'textarea'},
    {key:'mentorship_eyebrow', label:'Mentorship Eyebrow'},
    {key:'mentorship_cta', label:'Mentorship Button'},
    {key:'mentorship_price', label:'Mentorship Price'},
    {key:'mentorship_bullets', label:'Mentorship Bullets (one per line, text format)', type:'textarea'},
    {key:'pricing_mentorship_whatsapp', label:'Mentorship WhatsApp Message', type:'textarea'},
  ],
  testimonials: [
    {key:'testimonials_title', label:'Testimonials Title'},
    {key:'testimonials_subtitle', label:'Testimonials Subtitle', type:'textarea'},
    {key:'testimonials_eyebrow', label:'Testimonials Eyebrow'},
    {key:'testi_fallback', label:'Fallback Quote (no caption)', type:'textarea'},
    {key:'testi_role_fallback', label:'Fallback Role Line'},
  ],
  reviews: [
    {key:'reviews_title', label:'Reviews Wall Title'},
    {key:'reviews_subtitle', label:'Reviews Wall Subtitle (include 2550×1650 note)', type:'textarea'},
    {key:'reviews_eyebrow', label:'Reviews Eyebrow'},
    {key:'reviews_empty', label:'Empty Wall Message', type:'textarea'},
    {key:'review_caption_fallback', label:'Fallback Caption'},
    {key:'review_video_label', label:'Video Review Label'},
  ],
  certificates: [
    {key:'certificates_title', label:'Certificates & Awards Title'},
    {key:'certificates_subtitle', label:'Certificates Subtitle', type:'textarea'},
    {key:'certs_eyebrow', label:'Certificates Eyebrow'},
    {key:'certs_empty', label:'Empty Wall Message', type:'textarea'},
    {key:'cert_caption_fallback', label:'Fallback Caption'},
  ],
  faq: [
    {key:'faq_title', label:'FAQ Title'},
    {key:'faq_subtitle', label:'FAQ Subtitle', type:'textarea'},
    {key:'faq_eyebrow', label:'FAQ Eyebrow'},
    {key:'faq_items', label:'FAQ Items (JSON array of {q,a})', type:'textarea'},
  ],
  cta: [
    {key:'cta_band_title', label:'CTA Band Title'},
    {key:'cta_band_subtitle', label:'CTA Band Subtitle', type:'textarea'},
    {key:'cta_whatsapp_label', label:'WhatsApp Button Label'},
    {key:'cta_book_label', label:'Book Button Label'},
  ],
  footer: [
    {key:'footer_email', label:'Footer Email'},
    {key:'footer_phone', label:'Footer Phone'},
    {key:'footer_address', label:'Footer Address'},
    {key:'footer_copyright', label:'Footer Copyright'},
    {key:'footer_tagline', label:'Footer Tagline', type:'textarea'},
    {key:'footer_quick_links', label:'Quick Links Heading'},
    {key:'footer_contact', label:'Contact Heading'},
    {key:'footer_legal', label:'Legal Heading'},
    {key:'footer_built_note', label:'Bottom Honesty Note'},
    {key:'privacy_link_label', label:'Privacy Link Label'},
    {key:'terms_link_label', label:'Terms Link Label'},
    {key:'social_instagram_url', label:'Instagram URL (empty = hidden)'},
    {key:'social_x_url', label:'X (Twitter) URL (empty = hidden)'},
    {key:'social_tiktok_url', label:'TikTok URL (empty = hidden)'},
    {key:'social_linkedin_url', label:'LinkedIn URL (empty = hidden)'},
    {key:'social_facebook_url', label:'Facebook URL (empty = hidden)'},
    {key:'social_youtube_url', label:'YouTube URL (empty = hidden)'},
  ],
  leadform: [
    {key:'form_step_1', label:'Step Indicator 1'},
    {key:'form_step_2', label:'Step Indicator 2'},
    {key:'form_step_3', label:'Step Indicator 3'},
    {key:'form_back', label:'Back Button'},
    {key:'form_continue', label:'Continue Button'},
    {key:'form_submit', label:'Submit Button'},
    {key:'form_submitting', label:'Submitting... Text'},
    {key:'form_required', label:'"Required" Hint'},
    {key:'form_email_invalid', label:'Invalid Email Hint'},
    {key:'form_wa_invalid', label:'Invalid WhatsApp Hint'},
    {key:'form_consent_required', label:'Consent Hint'},
    {key:'form_consent_text', label:'Consent Checkbox Text', type:'textarea'},
    {key:'form_success_email_note', label:'Success Note (use {email})', type:'textarea'},
    {key:'form_label_name', label:'Label: Full Name'},
    {key:'form_ph_name', label:'Placeholder: Name'},
    {key:'form_label_store', label:'Label: Brand/Niche Name'},
    {key:'form_ph_store', label:'Placeholder: Brand'},
    {key:'form_label_niche', label:'Label: Niche'},
    {key:'form_label_niche_other', label:'Label: Other Niche'},
    {key:'form_ph_niche_other', label:'Placeholder: Other Niche'},
    {key:'form_label_investment', label:'Label: Investment'},
    {key:'form_label_status', label:'Label: Status'},
    {key:'form_label_scammed', label:'Label: Scammed?'},
    {key:'form_label_scam_details', label:'Label: Scam Details'},
    {key:'form_ph_scam_details', label:'Placeholder: Scam Details'},
    {key:'form_label_whatsapp', label:'Label: WhatsApp'},
    {key:'form_ph_whatsapp', label:'Placeholder: WhatsApp'},
    {key:'form_label_email', label:'Label: Email'},
    {key:'form_ph_email', label:'Placeholder: Email'},
    {key:'form_label_contact_time', label:'Label: Contact Time'},
    {key:'form_ph_contact_time', label:'Placeholder: Contact Time'},
    {key:'form_label_source', label:'Label: Source'},
    {key:'form_label_traffic', label:'Label: Traffic Plan'},
  ],
  chatbot: [
    {key:'chatbot_system_prompt', label:'AI Brain — System Prompt (persona, knowledge, style, handoff rules). Site knowledge auto-appends.', type:'textarea', rows:16},
    {key:'chatbot_temperature', label:'Creativity 0–1.5 (lower = strict, higher = chatty)'},
    {key:'chatbot_max_tokens', label:'Max Reply Length (tokens, 100–2000)'},
    {key:'chat_title', label:'Chat Header Name'},
    {key:'chat_new', label:'New Chat Button'},
    {key:'chat_recent', label:'Recent Button'},
    {key:'chat_whatsapp_btn', label:'WhatsApp Button'},
    {key:'chat_no_recent', label:'No Recent Message'},
    {key:'chat_greeting', label:'Greeting (use {name})', type:'textarea'},
    {key:'chat_quick_1', label:'Quick Question 1'},
    {key:'chat_quick_2', label:'Quick Question 2'},
    {key:'chat_quick_3', label:'Quick Question 3'},
    {key:'chat_placeholder', label:'Input Placeholder'},
    {key:'chat_send', label:'Send Button'},
    {key:'chat_gate_intro', label:'Gate Intro', type:'textarea'},
    {key:'chat_gate_name_label', label:'Gate Name Label'},
    {key:'chat_gate_email_label', label:'Gate Email Label'},
    {key:'chat_gate_start', label:'Gate Start Button'},
    {key:'chat_gate_err_name', label:'Gate Name Error'},
    {key:'chat_gate_err_email', label:'Gate Email Error'},
    {key:'chat_chatting_as', label:'"Chatting as" Line'},
    {key:'chat_switch', label:'Switch Link'},
    {key:'chat_offline', label:'Offline Fallback', type:'textarea'},
    {key:'chat_wa_continue', label:'Continue-on-WhatsApp Button'},
  ],
  legal: [
    {key:'scarcity_slots_total', label:'Scarcity Total Slots (number)', type:'number'},
    {key:'scarcity_label', label:'Scarcity Label Template (use {remaining})'},
    {key:'privacy_title', label:'Privacy Policy Title'},
    {key:'privacy_last_updated', label:'Privacy Last Updated (e.g. September 3, 2026)'},
    {key:'privacy_content', label:'Privacy Content (HTML allowed)', type:'textarea'},
    {key:'terms_title', label:'Terms & Conditions Title'},
    {key:'terms_last_updated', label:'Terms Last Updated'},
    {key:'terms_content', label:'Terms Content (HTML allowed)', type:'textarea'},
  ],
  theme: [
    {key:'color_primary', label:'Primary Color', type:'color'},
    {key:'color_primary_light', label:'Primary Light', type:'color'},
    {key:'color_accent', label:'Accent Color', type:'color'},
    {key:'color_accent_2', label:'Accent 2', type:'color'},
    {key:'color_bg', label:'Background', type:'color'},
    {key:'color_bg_alt', label:'Background Alt', type:'color'},
    {key:'color_text', label:'Text Color', type:'color'},
    {key:'color_text_muted', label:'Text Muted', type:'color'},
    {key:'color_border', label:'Border Color', type:'color'},
    {key:'color_success', label:'Success Color', type:'color'},
    {key:'font_family', label:'Font Family (CSS)'},
    {key:'logo_url', label:'Logo Image (upload or URL)', type:'image_upload'},
    {key:'favicon_url', label:'Favicon (upload or URL, .ico/.png)', type:'image_upload'},
    {key:'og_image', label:'Open Graph Image (upload or URL)', type:'image_upload'},
    {key:'reduced_motion', label:'Global Reduced Motion (true/false)', type:'select', options:['true','false']},
  ]
};

let currentCTab='general';
function renderContentForms(){
  const wrap=$('#content-forms'); wrap.innerHTML='';
  const schema=CONTENT_SCHEMA[currentCTab]||[];
  const listKeys = ['pricing_starter_features','pricing_pro_features','pricing_elite_features','mentorship_bullets'];
  schema.forEach(field=>{
   try{
    const val=CONTENT[field.key]??'';
    let displayVal = typeof val==='object' ? JSON.stringify(val, null, 2) : String(val);
    // For list fields, show as one per line text format (not raw JSON) per owner request
    if(listKeys.includes(field.key)){
      try{
        const arr = typeof val === 'string' ? JSON.parse(val) : val;
        if(Array.isArray(arr)) displayVal = arr.join('\n');
      }catch{}
    }
    const label=document.createElement('label');
    label.textContent=field.label + `   ${field.key}`;
    let input;
    if(field.type==='textarea'){
      input=document.createElement('textarea'); input.rows=field.rows||4; input.value=displayVal;
      if(listKeys.includes(field.key)) input.placeholder = 'One item per line — text format';
    } else if(field.type==='image_upload'){
      // preview
      const preview=document.createElement('div');
      preview.style.cssText='display:flex;gap:10px;align-items:center;margin:6px 0';
      if(displayVal){
        const img=document.createElement('img');
        img.src=displayVal; img.style.cssText='max-height:48px;max-width:160px;border-radius:8px;border:1px solid var(--border);background:#0B1220;padding:4px';
        img.onerror=()=> img.style.display='none';
        preview.appendChild(img);
        const link=document.createElement('a');
        link.href=displayVal; link.target='_blank'; link.textContent='View current'; link.style.fontSize='11px';
        preview.appendChild(link);
      } else {
        const none=document.createElement('small'); none.textContent='No image set'; none.style.color='#94A3B8';
        preview.appendChild(none);
      }
      label.appendChild(preview);
      // URL text input
      input=document.createElement('input'); input.value=displayVal; input.placeholder='https://... or /uploads/...';
      input.dataset.key=field.key;
      input.dataset.type='text';
      // file input
      const file=document.createElement('input'); file.type='file'; file.accept='image/*,.ico,.svg'; file.style.marginTop='6px';
      const hint=document.createElement('small'); hint.textContent='Upload file to auto-fill URL above. Supports PNG, SVG, ICO, JPG.'; hint.style.color='#94A3B8';
      const status=document.createElement('small'); status.style.color='#34D399'; status.style.display='none';
      file.addEventListener('change', async()=>{
        const f=file.files[0]; if(!f) return;
        status.style.display='block'; status.textContent='Uploading...';
        const fd=new FormData(); fd.append('file', f);
        try{
          const r=await fetch('/api/admin/upload',{method:'POST', headers: authHeaders(), body: fd});
          const j=await r.json();
          if(!r.ok) throw new Error(j.error||'Upload failed');
          input.value=j.url;
          status.textContent='Uploaded: '+j.url;
          // update preview
          preview.innerHTML='';
          const img=document.createElement('img'); img.src=j.url; img.style.cssText='max-height:48px;max-width:160px;border-radius:8px;border:1px solid var(--border);background:#0B1220;padding:4px';
          preview.appendChild(img);
        }catch(e){ status.textContent='Error: '+e.message; status.style.color='#F87171'; }
      });
      label.appendChild(input);
      label.appendChild(file);
      label.appendChild(hint);
      label.appendChild(status);
      wrap.appendChild(label);
      return;
    } else if(field.type==='color'){
      input=document.createElement('input'); input.type='color'; // color picker
      // if value not color hex, fallback
      try{ input.value= displayVal.startsWith('#')? displayVal : '#0B1220'; }catch{ input.value='#0B1220'; }
      // also show text input for hex
      const text=document.createElement('input'); text.value=displayVal; text.placeholder='#000000'; text.style.marginTop='6px';
      text.dataset.key=field.key;
      text.addEventListener('input', ()=>{ if(/^#([0-9A-F]{3}){1,2}$/i.test(text.value)) input.value=text.value; });
      input.addEventListener('input', ()=> text.value=input.value);
      label.appendChild(input); label.appendChild(text); wrap.appendChild(label); return;
    } else if(field.type==='select'){
      input=document.createElement('select'); field.options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o; opt.textContent=o; if(String(val)===o) opt.selected=true; input.appendChild(opt); });
    } else {
      input=document.createElement('input'); input.value=displayVal; if(field.type==='number') input.type='number';
    }
    input.dataset.key=field.key;
    input.dataset.type=field.type||'text';
    label.appendChild(input);
    wrap.appendChild(label);
   }catch(err){ console.error('render field failed', field && field.key, err); }
  });
}
$('#content-tabs').addEventListener('click', e=>{
  const btn=e.target?.closest?.('[data-ctab]');
  if(btn && btn.dataset.ctab){
    $$('#content-tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentCTab=btn.dataset.ctab;
    renderContentForms();
  }
});

async function loadContent(){
  const r=await fetch('/api/content'); const j=await r.json();
  CONTENT=j.content;
  lastPublishedContent=JSON.parse(JSON.stringify(CONTENT));
  // scarcity
  const scTotal=$('#scarcity-total'); if(scTotal) scTotal.value=CONTENT.scarcity_slots_total||10;
  const scLabel=$('#scarcity-label'); if(scLabel) scLabel.value=CONTENT.scarcity_label||'Only {remaining} build slots left this month';
  const waEl=$('#int-wa'); if(waEl) waEl.value=CONTENT.whatsapp_number||'';
  const emailEl=$('#int-email'); if(emailEl) emailEl.value=CONTENT.footer_email||'';
  const phoneEl=$('#int-phone'); if(phoneEl) phoneEl.value=CONTENT.footer_phone||'';
  const calEl=$('#int-calendly'); if(calEl) calEl.value=CONTENT.calendly_url||'';
  // Legacy webhook fields (optional — only if present in DOM)
  const whEl=$('#int-webhook'); if(whEl) whEl.value=CONTENT.webhook_url||'';
  const whEn=$('#int-webhook-enabled'); if(whEn) whEn.checked=String(CONTENT.webhook_enabled)==='true';
  const formEl=$('#int-webhook-form'); if(formEl) formEl.value=CONTENT.webhook_form_url||'';
  const formEn=$('#int-webhook-form-enabled'); if(formEn) formEn.checked=String(CONTENT.webhook_form_enabled)==='true';
  const botEl=$('#int-webhook-bot'); if(botEl) botEl.value=CONTENT.webhook_chatbot_url||'';
  const botEn=$('#int-webhook-bot-enabled'); if(botEn) botEn.checked=String(CONTENT.webhook_chatbot_enabled)==='true';
  renderContentForms();
}
$('#btn-save-content').addEventListener('click', async()=>{
  const btn=$('#btn-save-content'); const msg=$('#content-msg');
  if(btn) { btn.disabled=true; btn.textContent='Saving...'; }
  if(msg) msg.textContent='';
  try{
    const inputs=$$('#content-forms [data-key]');
    const payload={};
    const listKeysSave = ['pricing_starter_features','pricing_pro_features','pricing_elite_features','mentorship_bullets'];
    inputs.forEach(inp=>{
      let v=inp.value;
      // For list keys, convert text lines to JSON array string (text format per owner request) — also accepts raw JSON for backward compat
      if(listKeysSave.includes(inp.dataset.key)){
        let lines;
        const trimmed = v.trim();
        if(trimmed.startsWith('[')){
          try{ const parsed = JSON.parse(trimmed); if(Array.isArray(parsed)) lines = parsed; else lines = trimmed.split('\n').map(s=>s.trim()).filter(Boolean); }catch{ lines = v.split('\n').map(s=>s.trim()).filter(Boolean); }
        } else {
          lines = v.split('\n').map(s=>s.trim()).filter(Boolean);
        }
        v = JSON.stringify(lines);
      } else if(inp.dataset.key.includes('features') || inp.dataset.key.includes('bullets') || inp.dataset.key==='faq_items'){
        // keep as string; server will store as json if valid
        try{ JSON.parse(v); }catch{ /* allow raw */ }
      }
      payload[inp.dataset.key]=v;
    });
    if(!Object.keys(payload).length){ if(msg) msg.textContent='Nothing to save'; return; }
    const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(r.status===401){ if(msg) msg.textContent='Session expired — please log out and log back in, then Save again.'; if(msg) msg.style.color='#F87171'; return; }
    if(msg) msg.textContent = r.ok ? 'Saved ✓ preview updates instantly.' : (j.error||('Save failed (HTTP '+r.status+')'));
    if(msg) msg.style.color = r.ok ? '#10B981' : '#F87171';
    if(r.ok) await loadContent();
  }catch(e){ if(msg){ msg.textContent='Error: '+e.message; msg.style.color='#F87171'; } }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Save Content'; } }
});
$('#btn-save-scarcity').addEventListener('click', async()=>{
  const btn=$('#btn-save-scarcity');
  if(btn){ btn.disabled=true; btn.textContent='Saving...'; }
  try{
    const total=$('#scarcity-total')?.value || '10';
    const label=$('#scarcity-label')?.value || 'Only {remaining} build slots left this month';
    const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({scarcity_slots_total:total, scarcity_label:label})});
    const j=await r.json().catch(()=>({}));
    if(r.ok){ alert('Scarcity saved ✓'); await loadContent(); }
    else alert(j.error||'Save failed');
  }catch(e){ alert('Error: '+e.message); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Save'; } }
});
$('#btn-save-integrations').addEventListener('click', async()=>{
  const btn=$('#btn-save-integrations'); const msg=$('#int-msg');
  if(btn){ btn.disabled=true; btn.textContent='Saving...'; }
  if(msg){ msg.textContent='Saving...'; msg.style.color='#64748B'; }
  try{
    const waVal=$('#int-wa')?.value?.trim() || '';
    const emailVal=$('#int-email')?.value?.trim() || '';
    const phoneVal=$('#int-phone')?.value?.trim() || '';
    let calVal=$('#int-calendly')?.value?.trim() || '';
    // Normalize Calendly URL: prepend https:// if missing protocol (so frontend button always responds)
    if(calVal && !/^https?:\/\//i.test(calVal) && !calVal.startsWith('/')) calVal='https://'+calVal;
    const payload={
      whatsapp_number: waVal,
      footer_email: emailVal || CONTENT.footer_email || '',
      footer_phone: phoneVal || CONTENT.footer_phone || '',
      calendly_url: calVal,
    };
    // Optional legacy webhook fields — only include if inputs exist in DOM
    if($('#int-webhook')) payload.webhook_url=$('#int-webhook').value?.trim()||'';
    if($('#int-webhook-enabled')) payload.webhook_enabled=String($('#int-webhook-enabled').checked);
    if($('#int-webhook-form')) payload.webhook_form_url=$('#int-webhook-form').value?.trim()||'';
    if($('#int-webhook-form-enabled')) payload.webhook_form_enabled=String($('#int-webhook-form-enabled').checked||false);
    if($('#int-webhook-bot')) payload.webhook_chatbot_url=$('#int-webhook-bot').value?.trim()||'';
    if($('#int-webhook-bot-enabled')) payload.webhook_chatbot_enabled=String($('#int-webhook-bot-enabled').checked||false);
    // sync whatsapp_link automatically
    if(payload.whatsapp_number) payload.whatsapp_link = 'https://wa.me/' + payload.whatsapp_number.replace(/\D/g,'');
    const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Save failed');
    if(msg){ msg.textContent='Saved ✓ — WhatsApp, Email, Phone & Calendly updated. Frontend Book buttons now use: '+(calVal||'(WhatsApp fallback)'); msg.style.color='#10B981'; }
    await loadContent();
  }catch(e){ if(msg){ msg.textContent='Error: '+e.message; msg.style.color='#F87171'; } }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Save Contact & Booking'; } }
});
// Webhook test — form only (chat now via Gemini, per owner request)
async function testWebhook(type){
  const btn = document.getElementById('btn-test-webhook-form');
  const out = $('#webhook-test-result');
  if(btn){ btn.disabled=true; btn.textContent='Testing...'; out.style.display='block'; out.textContent='Sending mock '+type+' payload...'; }
  try{
    const r=await fetch('/api/admin/webhook-test',{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({type:'form'})});
    const j=await r.json();
    if(out){ out.style.display='block'; out.textContent = JSON.stringify(j, null, 2); }
    if(!r.ok) $('#int-msg').textContent = j.error||'Webhook test failed';
    else $('#int-msg').textContent = 'Webhook test sent — see result below';
  }catch(e){ if(out){ out.style.display='block'; out.textContent='Error: '+e.message; } }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Test Form Webhook →'; } }
}
$('#btn-test-webhook-form')?.addEventListener('click', ()=> testWebhook('form'));
// Gemini direct — saved permanently in backend content table (PROTECTED_KEYS, never wiped) — collapsed unless Edit
async function loadGeminiStatus(){
  try{
    const r=await fetch('/api/admin/gemini-key',{headers:authHeaders()});
    const j=await r.json();
    const el=$('#gemini-key-status');
    const n=j.keyCount||(j.dbHas?1:0);
    if(el){
      if(n>0) el.textContent = `${n} key${n>1?'s':''} set ✓ ${(j.keys||[]).map(k=>k.masked).join(' + ')} (saved permanently), model: ${j.model} — rotates on quota`;
      else if(j.envHas) el.textContent = `Key set (${j.masked||'env'} via env, model: ${j.model}) — also save in DB to persist`;
      else el.textContent = 'No key set — chatbot disabled, paste Gemini key above (AQ.Ab8... or AIza...)';
      el.style.color = n>0 ? '#10B981' : (j.envHas ? '#64748B' : '#F87171');
    }
    const sumEl=$('#gemini-summary-status');
    if(sumEl){
      if(n>0) { sumEl.textContent=`${n} key${n>1?'s':''} ✓ saved permanently`; sumEl.style.color='#10B981'; }
      else if(j.envHas) { sumEl.textContent='env only — save to persist'; sumEl.style.color='#F59E0B'; }
      else { sumEl.textContent='not set'; sumEl.style.color='#F87171'; }
    }
    const modelEl=$('#int-gemini-model');
    if(modelEl){
      modelEl.placeholder = j.model || 'gemini-3.6-flash';
      if(j.dbModel) modelEl.value = '';
    }
  }catch{}
}
// Integrations accordion — only one open at a time, closed by default (backend only, save & close)
(function(){
  const ids=['details-password','details-contact','details-google','details-gemini','details-theme'];
  function closeAll(except){
    ids.forEach(id=>{
      const d=document.getElementById(id);
      if(d && d!==except) d.open=false;
    });
  }
  ids.forEach(id=>{
    const d=document.getElementById(id);
    if(!d) return;
    d.addEventListener('toggle', ()=>{
      if(d.open) closeAll(d);
    });
  });
  // start closed
  ids.forEach(id=>{ const d=document.getElementById(id); if(d) d.open=false; });
})();
// Password helpers — show current user in settings
async function refreshPasswordUser(){
  try{
    const r=await fetch('/api/admin/me',{headers:authHeaders()});
    if(r.ok){
      const j=await r.json();
      const u=j.user?.username||'admin';
      const a=$('#password-user'); if(a) a.textContent=u;
      const b=$('#password-current-user'); if(b) b.textContent=u;
    }
  }catch{}
}
// hook into checkAuth success
const _origCheckAuth = checkAuth;
checkAuth = async function(){
  const ok = await _origCheckAuth();
  if(ok) refreshPasswordUser();
  return ok;
};
$('#btn-show-gemini-key')?.addEventListener('click', ()=>{
  const inp=$('#int-gemini-key');
  if(inp) inp.type = inp.type==='password' ? 'text' : 'password';
});
$('#btn-save-gemini')?.addEventListener('click', async()=>{
  const key=$('#int-gemini-key')?.value || '';
  const key2=$('#int-gemini-key2')?.value || '';
  const key3=$('#int-gemini-key3')?.value || '';
  const model=$('#int-gemini-model')?.value || '';
  if(!key.trim() && !key2.trim() && !key3.trim() && !model.trim()){ $('#gemini-msg').textContent='Paste a key (AQ.Ab8... or AIza...) or model first'; return; }
  const btn=$('#btn-save-gemini'); if(btn) btn.disabled=true;
  $('#gemini-msg').textContent='Saving...';
  try{
    const r=await fetch('/api/admin/gemini-key',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({key, key2, key3, model})});
    const j=await r.json();
    if(r.ok){
      $('#gemini-msg').innerHTML = j.keyCount ? `<span style="color:#10B981">✓ Saved permanently — ${j.keyCount} key${j.keyCount>1?'s':''} will rotate on quota. Closed until you click Edit again</span>` : (j.message||'Saved');
      $('#int-gemini-key').value='';
      const k2=$('#int-gemini-key2'); if(k2) k2.value='';
      const k3=$('#int-gemini-key3'); if(k3) k3.value='';
      if(model) $('#int-gemini-model').value='';
      await loadGeminiStatus();
      // auto-close details — stays closed until Edit clicked
      const d=document.getElementById('details-gemini'); if(d) d.open=false;
    } else {
      $('#gemini-msg').textContent = j.error||'Save failed';
    }
  }catch(e){ $('#gemini-msg').textContent='Error: '+e.message; }
  finally{ if(btn) btn.disabled=false; }
});
$('#btn-test-gemini')?.addEventListener('click', async()=>{
  const out=$('#gemini-test-result');
  const btn=$('#btn-test-gemini');
  if(btn){ btn.disabled=true; btn.textContent='Testing...'; }
  if(out){ out.style.display='block'; out.textContent='Testing Gemini with: Hello, what is NexaTech mentorship?'; }
  try{
    const r=await fetch('/api/admin/gemini-test',{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({message:'Hello, what is NexaTech mentorship?'})});
    const j=await r.json();
    if(out) out.textContent = JSON.stringify(j, null, 2);
    if(r.ok){
      $('#gemini-msg').innerHTML = `<span style="color:#10B981">Gemini test succeeded via ${j.masked||'key'} (${j.perKey?.filter(p=>p.ok).length||1}/${j.keyCount||1} keys OK)</span>`;
    } else {
      const qs = (j.perKey||[]).map(p=>`${p.masked}: ${p.quota?'QUOTA EXHAUSTED':p.error}`).join(' | ');
      $('#gemini-msg').innerHTML = `<span style="color:#F87171">Gemini test failed — ${j.error||''}${qs?'<br><small>'+qs+'</small>':''}${j.hint?'<br><small>'+j.hint+'</small>':''}</span>`;
    }
  }catch(e){ if(out) out.textContent='Error: '+e.message; }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Test Gemini →'; } }
});
loadGeminiStatus();
// Change Password — backend only, collapsed until Edit
$('#btn-show-pwd')?.addEventListener('click', ()=>{
  const a=$('#pwd-current'), b=$('#pwd-new'), c=$('#pwd-confirm');
  const t = a.type==='password' ? 'text' : 'password';
  [a,b,c].forEach(i=>{ if(i) i.type=t; });
  const btn=$('#btn-show-pwd'); if(btn) btn.textContent = t==='text' ? 'Hide' : 'Show';
});
$('#btn-change-password')?.addEventListener('click', async()=>{
  const cur=$('#pwd-current')?.value||'';
  const nw=$('#pwd-new')?.value||'';
  const cf=$('#pwd-confirm')?.value||'';
  const msg=$('#pwd-msg');
  const sum=$('#password-summary-status');
  if(!cur || !nw || !cf){ if(msg) msg.innerHTML='<span style="color:#F87171">All fields required</span>'; return; }
  if(nw !== cf){ if(msg) msg.innerHTML='<span style="color:#F87171">New passwords do not match</span>'; return; }
  if(nw.length < 6){ if(msg) msg.innerHTML='<span style="color:#F87171">New password must be at least 6 characters</span>'; return; }
  const btn=$('#btn-change-password'); if(btn) btn.disabled=true;
  if(msg) msg.textContent='Changing...';
  try{
    const r=await fetch('/api/admin/change-password',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({currentPassword:cur, newPassword:nw, confirmPassword:cf})});
    const j=await r.json();
    if(r.ok){
      if(msg) msg.innerHTML='<span style="color:#10B981">✓ Password changed successfully — saved permanently. Use new password next login. Closing...</span>';
      if(sum) { sum.textContent='changed ✓'; sum.style.color='#10B981'; }
      $('#pwd-current').value=''; $('#pwd-new').value=''; $('#pwd-confirm').value='';
      // auto-close details — stays closed until Edit
      setTimeout(()=>{ const d=document.getElementById('details-password'); if(d) d.open=false; if(msg) msg.textContent=''; }, 1200);
    } else {
      if(msg) msg.innerHTML=`<span style="color:#F87171">${j.error||'Failed'}</span>`;
      if(sum) { sum.textContent='error'; sum.style.color='#F87171'; }
    }
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
  finally{ if(btn) btn.disabled=false; }
});
// refresh user on load
refreshPasswordUser();
// Google Sheets direct — permanent save + auto-detect
async function loadGoogleStatus(){
  try{
    const r=await fetch('/api/admin/google/status',{headers:authHeaders()});
    const j=await r.json();
    const el=$('#google-client-status');
    if(el){
      if(j.hasAuth) el.textContent=`Connected ✓ Doc: ${j.docId||'(none)'} Sheet: ${j.sheetName} | Client: ${j.clientIdMasked||'set'} — keys saved permanently`;
      else if(j.hasClient && j.hasSheet) el.textContent=`Client+Sheet saved (permanent) — not yet connected → click Connect`;
      else if(j.hasClient) el.textContent=`Client saved permanently, set Doc ID + Sheet`;
      else el.textContent='Not configured — add Client ID/Secret + Doc ID (will be saved permanently)';
      el.style.color = j.hasAuth ? '#10B981' : '#94A3B8';
    }
    const sumEl=$('#google-summary-status');
    if(sumEl){
      if(j.hasAuth) { sumEl.textContent='connected ✓ saved permanently'; sumEl.style.color='#10B981'; }
      else if(j.hasClient) { sumEl.textContent='saved permanently — not yet connected'; sumEl.style.color='#F59E0B'; }
      else { sumEl.textContent='not set'; sumEl.style.color='#F87171'; }
    }
    const docEl=$('#int-google-doc-id'); if(docEl && j.docId){ docEl.placeholder=j.docId; docEl.value = docEl.value || ''; }
    const sheetEl=$('#int-google-sheet-name'); if(sheetEl && j.sheetName) sheetEl.placeholder=j.sheetName;
    // Auto-detect if we have doc + auth but sheet empty? try silently
    if(j.hasAuth && j.docId){
      // show hint that auto-detect available
      const hint = $('#google-msg');
      if(hint && !$('#google-detect-wrap')?.style.display || $('#google-detect-wrap').style.display==='none'){
        // don't auto-run to avoid API quota, just hint
      }
    }
  }catch{}
}
$('#btn-show-google-secret')?.addEventListener('click', ()=>{
  const inp=$('#int-google-client-secret');
  if(inp) inp.type = inp.type==='password' ? 'text' : 'password';
});
$('#btn-save-google-sheets')?.addEventListener('click', async()=>{
  const clientId=$('#int-google-client-id')?.value || '';
  const clientSecret=$('#int-google-client-secret')?.value || '';
  const docId=$('#int-google-doc-id')?.value || '';
  const sheetName=$('#int-google-sheet-name')?.value || '';
  // Permanent save: backend only overwrites non-empty — empty keeps old value. This ensures keys never wiped accidentally.
  const body={clientId, clientSecret, docId, sheetName};
  const btn=$('#btn-save-google-sheets');
  if(btn){ btn.disabled=true; btn.textContent='Saving...'; }
  const r=await fetch('/api/admin/google/sheets',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(btn){ btn.disabled=false; btn.textContent='Save Google Sheets'; }
  $('#google-msg').textContent = r.ok ? `Saved permanently ✓ ${j.saved ? `Doc: ${j.saved.docId||'(unchanged)'} Sheet: ${j.saved.sheetName}` : ''} — closed until you click Edit again` : (j.error||'Save failed');
  if(r.ok){
    if(clientId) $('#int-google-client-id').value='';
    if(clientSecret) $('#int-google-client-secret').value='';
    if(docId) $('#int-google-doc-id').value='';
    if(sheetName) $('#int-google-sheet-name').value='';
    await loadGoogleStatus();
    // close details — stays closed until Edit
    const d=document.getElementById('details-google'); if(d) d.open=false;
    // Auto-run detect after save if we have doc (will reopen if needed)
    if(j.saved?.docId){
      setTimeout(()=> detectGoogleSheet(), 300);
    }
  }
});
$('#btn-connect-google')?.addEventListener('click', async()=>{
  const r=await fetch('/api/admin/google/auth-url',{headers:authHeaders()});
  const j=await r.json();
  if(!r.ok){ $('#google-msg').textContent=j.error||'Connect failed — set Client ID/Secret first'; return; }
  window.open(j.url, '_blank', 'width=600,height=700');
  $('#google-msg').textContent='Opened Google consent — approve and return here, then Test Append / Auto-Detect';
});
$('#btn-test-google-sheets')?.addEventListener('click', async()=>{
  const out=$('#google-test-result'); const btn=$('#btn-test-google-sheets');
  if(btn){ btn.disabled=true; btn.textContent='Testing...'; }
  if(out){ out.style.display='block'; out.textContent='Appending test row...'; }
  try{
    const r=await fetch('/api/admin/google/test',{method:'POST',headers:authHeaders()});
    const j=await r.json();
    if(out) out.textContent=JSON.stringify(j,null,2);
    $('#google-msg').textContent = j.ok ? 'Test row appended ✓ Check your sheet (mapped to detected headers if any)' : (j.error||'Test failed — check Doc ID/Sheet + Connect or Run Auto-Detect');
    if(j.ok) loadGoogleStatus();
  }catch(e){ if(out) out.textContent='Error: '+e.message; }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Test Append Row →'; } }
});
$('#btn-disconnect-google')?.addEventListener('click', async()=>{
  if(!confirm('Disconnect Google Sheets? This clears refresh token (keeps Client ID/Secret/Doc ID).')) return;
  const r=await fetch('/api/admin/google/disconnect',{method:'POST',headers:authHeaders()});
  $('#google-msg').textContent = r.ok ? 'Disconnected (tokens cleared, keys kept)' : 'Failed';
  if(r.ok) loadGoogleStatus();
});
// --- Auto-Detect Sheet & Columns ---
let lastDetectData = null;
async function detectGoogleSheet(){
  const wrap=$('#google-detect-wrap');
  const out=$('#google-detect-result');
  const btn=$('#btn-detect-google');
  const info=$('#google-columns-info');
  const preview=$('#google-headers-preview');
  const missingWrap=$('#google-missing-wrap');
  const picker=$('#google-sheet-picker');
  const custom=$('#google-sheet-picker-custom');
  const titleEl=$('#google-detect-title');
  if(btn){ btn.disabled=true; btn.textContent='Detecting...'; }
  if(wrap) wrap.style.display='block';
  if(info) info.textContent='Detecting Google Sheet — listing sheets & reading header row...';
  if(preview) preview.innerHTML='';
  if(missingWrap) missingWrap.innerHTML='';
  try{
    // Use current input Doc ID if typed but not saved yet? Prefer saved, but allow override
    const typedDoc = $('#int-google-doc-id')?.value?.trim();
    const typedSheet = $('#int-google-sheet-name')?.value?.trim() || $('#google-sheet-picker-custom')?.value?.trim();
    let qs = '';
    if(typedDoc) qs += `docId=${encodeURIComponent(typedDoc)}&`;
    if(typedSheet) qs += `sheetName=${encodeURIComponent(typedSheet)}&`;
    const r=await fetch('/api/admin/google/inspect?'+qs, {headers: authHeaders()});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Detect failed');
    lastDetectData = j;
    if(titleEl) titleEl.textContent = `${j.spreadsheetTitle||''} • Doc: ${j.docId.slice(0,12)}... • Sheets: ${j.sheets.length} • Rows: ${j.rowCount}`;
    // Fill picker
    if(picker){
      picker.innerHTML='';
      j.sheets.forEach(s=>{
        const opt=document.createElement('option');
        opt.value=s.title; opt.textContent=`${s.title} (${s.gridRows} rows)`;
        if(s.title===j.currentSheet) opt.selected=true;
        picker.appendChild(opt);
      });
      picker.onchange = ()=> {
        if(custom) custom.value = picker.value;
        // re-detect with new sheet
        detectGoogleSheetWithSheet(picker.value);
      };
    }
    if(custom) custom.value = j.currentSheet;
    // Show headers
    if(preview){
      if(j.isEmpty){
        preview.innerHTML=`<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px;color:#991B1B;font-size:11px">Sheet <b>${j.currentSheet}</b> has <b>no header row</b> (empty). Click <b>Create / Overwrite Headers</b> to create the 22 columns.</div>`;
      } else {
        let html = `<div style="font-size:11px;color:#94A3B8;margin-bottom:4px">Headers in <b>${j.currentSheet}</b> — row 1 (${j.headers.length} cols):</div><div style="display:flex;gap:4px;flex-wrap:wrap">`;
        j.headers.forEach((h,idx)=>{
          const isExpected = j.expectedHeaders.map(x=>x.toLowerCase().replace(/\s/g,'')).includes(h.toLowerCase().replace(/\s/g,''));
          const mapped = j.mapping && Object.values(j.mapping).includes(idx);
          html += `<span style="background:${isExpected?'#10B981':'#334155'};color:#fff;padding:4px 8px;border-radius:999px;font-size:11px">${idx+1}. ${h||'<empty>'}</span>`;
        });
        html += `</div>`;
        if(j.extraColumns.length) html += `<div style="margin-top:6px;font-size:11px;color:#F59E0B">Extra (not in expected): ${j.extraColumns.join(', ')}</div>`;
        preview.innerHTML = html;
      }
    }
    // Show missing / columns to create
    if(missingWrap){
      if(j.missingColumns && j.missingColumns.length){
        let html = `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px">`;
        html += `<div style="font-size:12px;font-weight:700;color:#92400E">Columns to Create (${j.missingColumns.length} missing):</div>`;
        html += `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">`;
        j.missingColumns.forEach(c=> html+=`<span style="background:#F59E0B;color:#fff;padding:4px 8px;border-radius:999px;font-size:11px">${c}</span>`);
        html += `</div>`;
        html += `<div style="font-size:11px;color:#92400E;margin-top:6px">These will be created by <b>Create / Overwrite Headers</b> (22 cols) or <b>Append Missing</b> (keeps existing + adds missing).</div>`;
        html += `</div>`;
        missingWrap.innerHTML = html;
      } else if(j.isEmpty){
        missingWrap.innerHTML = `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:10px;font-size:12px;color:#991B1B">Sheet empty — <b>22 columns</b> will be created: ${j.expectedHeaders.join(', ')}</div>`;
      } else {
        missingWrap.innerHTML = `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:10px;font-size:12px;color:#065F46">✓ All 22 expected columns present — sheet is correctly configured. Test Append will map to these headers.</div>`;
      }
    }
    if(info){
      if(j.isEmpty) info.innerHTML=`<span style="color:#F87171">Sheet empty — no headers found.</span> <span style="color:#94A3B8">Row count: ${j.rowCount}. Use Create Headers below.</span>`;
      else if(j.missingColumns.length) info.innerHTML=`<span style="color:#F59E0B">${j.missingColumns.length} columns missing</span> • ${j.headers.length} present • Row count: ${j.rowCount} — see columns to create below`;
      else info.innerHTML=`<span style="color:#10B981">✓ All columns matched</span> • ${j.headers.length} headers • ${j.rowCount} rows • Mapping will align lead fields to these positions automatically`;
    }
    if(out){ out.style.display='block'; out.textContent = JSON.stringify(j, null, 2); }
    $('#google-msg').textContent = j.isEmpty ? 'Detected: sheet empty — create headers' : (j.missingColumns.length ? `Detected: ${j.missingColumns.length} columns to create` : 'Detected: sheet ready ✓');
  }catch(e){
    if(info) info.innerHTML=`<span style="color:#F87171">Detect failed: ${e.message}</span>`;
    if(out){ out.style.display='block'; out.textContent='Error: '+e.message; }
    $('#google-msg').textContent='Detect failed: '+e.message;
  } finally{ if(btn){ btn.disabled=false; btn.textContent='Auto-Detect Sheet & Columns →'; } }
}
async function detectGoogleSheetWithSheet(sheetName){
  const typedDoc = $('#int-google-doc-id')?.value?.trim();
  let qs = `sheetName=${encodeURIComponent(sheetName)}&`;
  if(typedDoc) qs += `docId=${encodeURIComponent(typedDoc)}&`;
  const r=await fetch('/api/admin/google/inspect?'+qs, {headers: authHeaders()});
  const j=await r.json();
  if(r.ok) {
    // re-render quickly without full detect
    lastDetectData = j;
    // update info
    $('#google-columns-info').innerHTML = j.isEmpty ? 'Empty sheet' : (j.missingColumns.length ? `${j.missingColumns.length} missing` : 'All columns present');
    $('#google-headers-preview').innerHTML = j.headers.length ? j.headers.map((h,i)=> `<span style="background:#334155;color:#fff;padding:3px 6px;border-radius:999px;font-size:10px">${i+1}.${h}</span>`).join(' ') : 'Empty';
    // update missing
    const miss=$('#google-missing-wrap');
    if(miss) miss.innerHTML = j.missingColumns.length ? `Missing: ${j.missingColumns.join(', ')}` : 'All good';
    $('#google-detect-result').textContent = JSON.stringify(j,null,2);
  }
}
$('#btn-detect-google')?.addEventListener('click', detectGoogleSheet);
$('#btn-refresh-detect')?.addEventListener('click', detectGoogleSheet);
$('#google-sheet-picker-custom')?.addEventListener('change', (e)=>{
  const v=e.target.value.trim();
  if(v && lastDetectData && v!==lastDetectData.currentSheet){
    // save sheet name permanently
    fetch('/api/admin/google/sheets',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({sheetName:v})}).then(()=> loadGoogleStatus());
  }
});
async function setupHeaders(mode){
  const sheetName = $('#google-sheet-picker-custom')?.value?.trim() || $('#google-sheet-picker')?.value || lastDetectData?.currentSheet || $('#int-google-sheet-name')?.value?.trim() || 'Sheet1';
  const docId = $('#int-google-doc-id')?.value?.trim() || lastDetectData?.docId || '';
  const btnId = mode==='append-missing' ? 'btn-append-missing' : 'btn-create-headers';
  const btn=$(`#${btnId}`);
  if(btn){ btn.disabled=true; btn.textContent='Working...'; }
  try{
    const r=await fetch('/api/admin/google/setup-headers',{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({docId, sheetName, mode})});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Setup failed');
    $('#google-msg').textContent = `Headers ${mode==='append-missing' ? 'appended' : 'created'} ✓ Sheet: ${sheetName} — ${j.headers.length} cols`;
    $('#google-detect-result').style.display='block';
    $('#google-detect-result').textContent = JSON.stringify(j,null,2);
    // auto re-detect
    setTimeout(detectGoogleSheet, 800);
  }catch(e){
    $('#google-msg').textContent='Setup failed: '+e.message;
    $('#google-detect-result').style.display='block';
    $('#google-detect-result').textContent='Error: '+e.message;
  } finally{ if(btn){ btn.disabled=false; btn.textContent = mode==='append-missing' ? 'Append Missing Columns Only' : 'Create / Overwrite Headers (22 cols) →'; } }
}
$('#btn-create-headers')?.addEventListener('click', ()=> setupHeaders('overwrite'));
$('#btn-append-missing')?.addEventListener('click', ()=> setupHeaders('append-missing'));
loadGoogleStatus();

// ========== Brand / Logo — backend only, logo in logo-mark, brand name front ==========
async function loadBrand(){
  try{
    // CONTENT already loaded via loadContent — ensure fresh
    if(!CONTENT || !Object.keys(CONTENT).length) await loadContent();
    const brandName = CONTENT.logo_text || CONTENT.brand_name || 'NEXATECH';
    const logoUrl = CONTENT.logo_url || '';
    const faviconUrl = CONTENT.favicon_url || '';
    const pos = CONTENT.logo_position || CONTENT.brand_position || 'logo_first';
    const nameEl=$('#brand-name'); if(nameEl) nameEl.value=brandName;
    const logoUrlEl=$('#brand-logo-url'); if(logoUrlEl) logoUrlEl.value=logoUrl;
    const favEl=$('#brand-favicon-url'); if(favEl) favEl.value=faviconUrl;
    const posEl=$('#brand-position'); if(posEl) posEl.value=pos;
    // previews
    const lp=$('#brand-logo-preview');
    if(lp){
      if(logoUrl) lp.innerHTML=`<img src="${logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
      else lp.textContent='N';
    }
    const fp=$('#brand-favicon-preview');
    if(fp){
      if(faviconUrl) fp.innerHTML=`<img src="${faviconUrl}" style="max-width:100%;max-height:100%;object-fit:contain;display:block">`;
      else fp.textContent='favicon';
    }
    const liveMark=$('#brand-live-preview .logo-mark');
    const liveText=$('#brand-live-text');
    if(liveMark){
      if(logoUrl) liveMark.innerHTML=`<img src="${logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
      else liveMark.textContent='N';
    }
    if(liveText) liveText.textContent=brandName||'NEXATECH';
    // live preview order — logo first: (logo) NEXATECH (default)
    const liveWrap=$('#brand-live-preview');
    if(liveWrap){
      // logo_first = Mark + Brand (default), brand_first = Brand + Mark (legacy)
      if(pos==='brand_first'){ liveWrap.style.flexDirection='row'; liveWrap.innerHTML=''; liveWrap.appendChild(liveText); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(liveMark); }
      else { liveWrap.style.flexDirection='row'; liveWrap.innerHTML=''; liveWrap.appendChild(liveMark); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(liveText); }
    }
    // also update admin sidebar brand preview if exists
  }catch(e){ console.error('loadBrand',e); }
}
async function saveBrand(){
  const btn=$('#btn-save-brand'); const msgEl=$('#brand-msg');
  if(btn){ btn.disabled=true; btn.textContent='Saving...'; }
  if(msgEl){ msgEl.textContent='Saving...'; msgEl.style.color='#64748B'; }
  try{
    const brandName=$('#brand-name')?.value?.trim() || '';
    const logoUrl=$('#brand-logo-url')?.value?.trim() || '';
    const faviconUrl=$('#brand-favicon-url')?.value?.trim() || '';
    const pos=$('#brand-position')?.value || 'logo_first';
    const payload={};
    if(brandName) payload.logo_text=brandName;
    if(logoUrl) payload.logo_url=logoUrl;
    if(faviconUrl) payload.favicon_url=faviconUrl;
    payload.logo_position=pos;
    payload.brand_position=pos; // alias
    const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Save failed');
    if(msgEl){ msgEl.innerHTML='<span style="color:#10B981">Saved ✓ — (logo) NEXATECH, frontend header updates instantly. <a href="/" target="_blank" style="color:#00D1FF">Preview →</a></span>'; }
    await loadContent(); await loadBrand();
  }catch(e){ if(msgEl){ msgEl.textContent='Error: '+e.message; msgEl.style.color='#F87171'; } }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Save Brand'; } }
}
$('#btn-save-brand')?.addEventListener('click', saveBrand);
$('#btn-preview-brand')?.addEventListener('click', ()=> window.open('/', '_blank'));
$('#brand-name')?.addEventListener('input', ()=>{
  const v=$('#brand-name').value||'NEXATECH';
  const lt=$('#brand-live-text'); if(lt) lt.textContent=v;
});
$('#brand-logo-url')?.addEventListener('input', ()=>{
  const v=$('#brand-logo-url').value.trim();
  const lp=$('#brand-logo-preview');
  const lm=$('#brand-live-preview .logo-mark');
  if(v){
    if(lp) lp.innerHTML=`<img src="${v}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block" onerror="this.style.display='none'">`;
    if(lm) lm.innerHTML=`<img src="${v}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
  } else {
    if(lp) lp.textContent='N';
    if(lm) lm.textContent='N';
  }
});
$('#brand-favicon-url')?.addEventListener('input', ()=>{
  const v=$('#brand-favicon-url').value.trim();
  const fp=$('#brand-favicon-preview');
  if(v){
    if(fp) fp.innerHTML=`<img src="${v}" style="max-width:100%;max-height:100%;object-fit:contain;display:block">`;
  } else { if(fp) fp.textContent='favicon'; }
});
$('#brand-position')?.addEventListener('change', ()=>{
  const pos=$('#brand-position').value;
  const liveWrap=$('#brand-live-preview');
  const lm=liveWrap?.querySelector('.logo-mark');
  const lt=$('#brand-live-text');
  if(liveWrap && lm && lt){
    liveWrap.innerHTML='';
    if(pos==='logo_first'){ liveWrap.appendChild(lm); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(lt); }
    else { liveWrap.appendChild(lt); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(lm); }
  }
});
$('#brand-logo-file')?.addEventListener('change', async()=>{
  const f=$('#brand-logo-file').files[0]; if(!f) return;
  const fd=new FormData(); fd.append('file', f);
  const msgEl=$('#brand-msg');
  if(msgEl) msgEl.textContent='Uploading logo...';
  try{
    const r=await fetch('/api/admin/upload',{method:'POST', headers: authHeaders(), body: fd});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Upload failed');
    $('#brand-logo-url').value=j.url;
    $('#brand-logo-url').dispatchEvent(new Event('input'));
    if(msgEl) msgEl.innerHTML=`<span style="color:#10B981">Uploaded: ${j.url} — click Save Brand</span>`;
    // auto preview
    const lp=$('#brand-logo-preview'); if(lp) lp.innerHTML=`<img src="${j.url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
  }catch(e){ if(msgEl) msgEl.textContent='Error: '+e.message; }
});
$('#brand-favicon-file')?.addEventListener('change', async()=>{
  const f=$('#brand-favicon-file').files[0]; if(!f) return;
  const fd=new FormData(); fd.append('file', f);
  const msgEl=$('#brand-msg');
  if(msgEl) msgEl.textContent='Uploading favicon...';
  try{
    const r=await fetch('/api/admin/upload',{method:'POST', headers: authHeaders(), body: fd});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'Upload failed');
    $('#brand-favicon-url').value=j.url;
    $('#brand-favicon-url').dispatchEvent(new Event('input'));
    if(msgEl) msgEl.innerHTML=`<span style="color:#10B981">Uploaded: ${j.url} — click Save Brand</span>`;
  }catch(e){ if(msgEl) msgEl.textContent='Error: '+e.message; }
});
// Ensure brand loads when content loads
const _origLoadContent = loadContent;
loadContent = async function(){ await _origLoadContent(); await loadBrand(); };

// ========== Campaigns & Gmail CRM — HubSpot-like via same Console Creds ==========
let CAMPAIGNS=[], TEMPLATES=[], SELECTED_CAMP=null, PERSONAL_LEAD=null;
async function loadGmailStatus(){
  try{
    const r=await fetch('/api/admin/gmail/status',{headers: authHeaders()});
    const j=await r.json();
    const el=$('#gmail-status');
    if(el){
      if(j.hasGmailAuth && j.verified) el.textContent=`Gmail: ${j.email} ✓`;
      else if(j.hasGmailAuth) el.textContent=`Gmail: ${j.email||'connected'} (verify...)`;
      else if(j.needsReauth) el.textContent=`Re-connect needed — Gmail scope missing`;
      else if(j.hasClient && !j.hasGmailAuth) el.textContent=`Gmail not connected — click Connect`;
      else el.textContent=`Set Google Client ID/Secret first`;
      el.style.color = j.verified ? '#10B981' : '#94A3B8';
      el.style.borderColor = j.verified ? 'rgba(16,185,129,.3)' : '#E2E8F0';
    }
    const nameEl=$('#camp-from-name'); if(nameEl && j.senderName && !nameEl.value) nameEl.value=j.senderName;
    const emailEl=$('#camp-from-email'); if(emailEl && j.email && !emailEl.value) emailEl.placeholder=j.email;
    const msgEl=$('#gmail-msg');
    if(msgEl){
      if(j.verified) msgEl.innerHTML=`<span style="color:#10B981">✓ Gmail ready via <b>same Client ID</b> (${j.clientMasked}) — send bulk & personal now</span>`;
      else if(!j.hasClient) msgEl.textContent='Set Client ID/Secret in Integrations → Google Sheets (reused for Campaigns).';
      else if(!j.hasGmailAuth) msgEl.innerHTML=`<span style="color:#F59E0B">Gmail not yet authorized — click <b>Connect Gmail (same Client ID)</b> to grant gmail.send scope (one-time). Shares same refresh token as Sheets.</span>`;
      else msgEl.textContent=j.lastError ? 'Gmail check: '+j.lastError : '';
    }
  }catch(e){ const el=$('#gmail-status'); if(el) el.textContent='Gmail status error'; }
}
$('#btn-gmail-connect')?.addEventListener('click', async()=>{
  const r=await fetch('/api/admin/google/auth-url',{headers: authHeaders()});
  const j=await r.json();
  if(!r.ok){ $('#gmail-msg').textContent=j.error||'Connect failed'; return; }
  window.open(j.url,'_blank','width=600,height=700');
  $('#gmail-msg').textContent='Opened Google consent (Sheets + Gmail) — approve, then refresh Gmail status';
});
$('#btn-gmail-test')?.addEventListener('click', async()=>{
  const btn=$('#btn-gmail-test'); if(btn) btn.disabled=true;
  $('#gmail-msg').textContent='Sending test email via Gmail...';
  try{
    const r=await fetch('/api/admin/gmail/test',{method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify({})});
    const j=await r.json();
    $('#gmail-msg').textContent = r.ok ? `Test sent ✓ to ${j.to} via ${j.from} — check inbox` : (j.error||'Test failed — reconnect Gmail');
  }catch(e){ $('#gmail-msg').textContent='Error: '+e.message; }
  finally{ if(btn) btn.disabled=false; loadGmailStatus(); }
});
$('#btn-save-gmail-sender')?.addEventListener('click', async()=>{
  const name=$('#camp-from-name')?.value||'';
  const email=$('#camp-from-email')?.value||'';
  const reply=$('#camp-reply-to')?.value||'';
  const r=await fetch('/api/admin/gmail/sender',{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({name, email})});
  const j=await r.json();
  $('#gmail-msg').textContent = r.ok ? 'Sender saved — will be used for campaigns' : (j.error||'Save failed');
  // also store reply_to in a campaign? just keep for next sends
  if(reply) localStorage.setItem('nexatech_reply_to', reply);
});
async function loadCampaigns(){
  const r=await fetch('/api/admin/campaigns',{headers: authHeaders()});
  if(!r.ok) return;
  CAMPAIGNS=await r.json();
  renderCampaigns();
}
function renderCampaigns(){
  const wrap=$('#campaigns-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!CAMPAIGNS.length){ wrap.innerHTML='<div style="font-size:12px;color:#94A3B8;padding:8px;border:1px dashed #E2E8F0;border-radius:10px">No campaigns yet — click + New Campaign (HubSpot-style).</div>'; return; }
  CAMPAIGNS.forEach(c=>{
    const div=document.createElement('div');
    const isSel = SELECTED_CAMP && SELECTED_CAMP.id===c.id;
    div.style.cssText=`border:1px solid ${isSel?'#7C3AED':'#E2E8F0'};border-radius:10px;padding:10px;background:${isSel?'rgba(124,58,237,.06)':'#fff'};cursor:pointer`;
    const statusColor = c.status==='sent'?'#10B981':c.status==='sending'?'#F59E0B':c.status==='failed'?'#F87171':'#64748B';
    div.innerHTML=`<div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b style="font-size:13px">${c.name}</b><span style="font-size:10px;background:${statusColor};color:#fff;padding:2px 6px;border-radius:999px">${c.status}</span></div><div style="font-size:11px;color:#64748B;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.subject}</div><div style="font-size:11px;color:#94A3B8;margin-top:4px">${c.sent||0}/${c.total||c.total_recipients||0} sent ${c.failed?' • '+c.failed+' failed':''} • ${String(c.created_at||'').slice(0,10)}</div>`;
    div.addEventListener('click', ()=> selectCampaign(c.id));
    wrap.appendChild(div);
  });
}
async function selectCampaign(id){
  const r=await fetch('/api/admin/campaigns/'+id,{headers: authHeaders()});
  if(!r.ok) return;
  const j=await r.json();
  SELECTED_CAMP=j.campaign;
  $('#campaign-detail').style.display='block';
  $('#campaign-empty').style.display='none';
  $('#camp-detail-title').textContent=j.campaign.name;
  $('#camp-name').value=j.campaign.name||'';
  $('#camp-subject').value=j.campaign.subject||'';
  $('#camp-html').value=j.campaign.body_html||'';
  $('#camp-text').value=j.campaign.body_text||'';
  // load sends
  renderSends(j.sends||[]);
  loadGmailStatus();
}
function renderSends(list){
  const wrap=$('#camp-sends'); if(!wrap) return;
  if(!list.length){ wrap.innerHTML='<div style="font-size:11px;color:#94A3B8">No sends yet — preview audience and send bulk.</div>'; return; }
  wrap.innerHTML='';
  list.forEach(s=>{
    const div=document.createElement('div');
    const col = s.status==='sent'?'#10B981': s.status==='failed'?'#F87171':'#94A3B8';
    div.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid #E2E8F0;border-radius:8px;padding:8px;background:#fff';
    div.innerHTML=`<div><b style="font-size:12px">${s.email}</b> <span style="font-size:11px;color:#64748B">${s.name||''}</span><div style="font-size:10px;color:#94A3B8">${String(s.sent_at||'').slice(0,16)} • ${s.status}</div></div><div style="display:flex;gap:6px;align-items:center"><span style="font-size:10px;background:${col};color:#fff;padding:2px 6px;border-radius:999px">${s.status}</span>${s.error?`<span style="font-size:10px;color:#F87171" title="${s.error}">${s.error.slice(0,30)}</span>`:''}</div>`;
    wrap.appendChild(div);
  });
}
$('#btn-new-campaign')?.addEventListener('click', async()=>{
  const name=prompt('Campaign name (e.g. Welcome Sequence):');
  if(!name) return;
  const subject=prompt('Email subject (supports {{name}}, {{storeName}}):','Welcome {{name}}! Your {{storeName}} store');
  if(!subject) return;
  const r=await fetch('/api/admin/campaigns',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({name, subject, body_html:'<p>Hi {{name}},</p><p>Welcome to Nexatech — your {{storeName}} ({{preferredNiche}}) application is received. We will contact you on WhatsApp {{whatsapp}} within 24h.</p><p>— Nexatech</p>'})});
  const j=await r.json();
  if(r.ok){ await loadCampaigns(); if(j.id) selectCampaign(j.id); } else alert(j.error||'Create failed');
});
$('#btn-save-camp')?.addEventListener('click', async()=>{
  if(!SELECTED_CAMP) return;
  const body={ name: $('#camp-name').value, subject: $('#camp-subject').value, body_html: $('#camp-html').value, body_text: $('#camp-text').value,
    from_name: $('#camp-from-name').value, from_email: $('#camp-from-email').value, reply_to: $('#camp-reply-to').value||localStorage.getItem('nexatech_reply_to')||'' };
  const r=await fetch('/api/admin/campaigns/'+SELECTED_CAMP.id,{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify(body)});
  const j=await r.json();
  if(r.ok){ $('#gmail-msg').textContent='Campaign saved ✓'; loadCampaigns(); SELECTED_CAMP=j; } else alert(j.error||'Save failed');
});
$('#btn-camp-test')?.addEventListener('click', async()=>{
  if(!SELECTED_CAMP) return;
  const btn=$('#btn-camp-test'); if(btn) btn.disabled=true;
  try{
    const r=await fetch('/api/admin/campaigns/'+SELECTED_CAMP.id+'/test',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({})});
    const j=await r.json();
    alert(r.ok ? `Test sent to ${j.to}` : j.error||'Test failed — check Gmail connection');
  }finally{ if(btn) btn.disabled=false; }
});
// AI subject-line suggestions (click a suggestion to use it)
$('#btn-camp-ai-subject')?.addEventListener('click', async()=>{
  const msg=$('#camp-ai-subject-msg'), box=$('#camp-ai-subjects');
  if(msg) msg.textContent='Asking AI...';
  if(box) box.innerHTML='';
  try{
    const context = `campaign "${$('#camp-name')?.value||''}" — body preview: ${($('#camp-html')?.value||'').replace(/<[^>]+>/g,' ').slice(0,300)}`;
    const r=await fetch('/api/admin/ai/suggest-subject',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({ context, count: 3 })});
    const j=await r.json();
    if(!r.ok) throw new Error(j.error||'failed');
    if(msg) msg.textContent = j.ai ? 'AI suggestions — click to use:' : ('Template suggestions — click to use ('+(j.hint||'set Gemini key for AI')+')');
    if(box){
      box.innerHTML='';
      (j.subjects||[]).forEach(s=>{
        const b=document.createElement('button');
        b.type='button'; b.textContent=s;
        b.style.cssText='text-align:left;font-size:12px;border:1px solid #E2E8F0;border-radius:8px;padding:6px 10px;background:#F8FAFC;cursor:pointer';
        b.addEventListener('click', ()=>{ const inp=$('#camp-subject'); if(inp) inp.value=s; if(msg) msg.textContent='Subject set ✓ — Save Campaign to keep'; });
        box.appendChild(b);
      });
    }
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
});
$('#btn-camp-delete')?.addEventListener('click', async()=>{
  if(!SELECTED_CAMP || !confirm('Delete campaign '+SELECTED_CAMP.name+'?')) return;
  await fetch('/api/admin/campaigns/'+SELECTED_CAMP.id,{method:'DELETE',headers: authHeaders()});
  SELECTED_CAMP=null; $('#campaign-detail').style.display='none'; $('#campaign-empty').style.display='flex'; loadCampaigns();
});
$('#btn-camp-preview-audience')?.addEventListener('click', async()=>{
  if(!SELECTED_CAMP) return alert('Select a campaign first');
  const stage=$('#camp-filter-stage').value;
  const search=$('#camp-filter-search').value;
  const scammed=$('#camp-filter-scam').checked?'yes':'';
  const limit=$('#camp-limit').value||'20';
  const q=new URLSearchParams(); if(stage) q.set('stage',stage); if(search) q.set('search',search); if(scammed) q.set('scammed',scammed);
  q.set('limit',limit);
  // use dryRun via send endpoint preview
  const r=await fetch('/api/admin/campaigns/'+SELECTED_CAMP.id+'/send',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({ stage, search, scammed, limit: parseInt(limit,10), dryRun:true })});
  const j=await r.json();
  const wrap=$('#camp-audience-preview');
  if(!r.ok){ wrap.innerHTML=`<span style="color:#F87171">${j.error||'Preview failed'}</span>`; return; }
  wrap.innerHTML=`<b>${j.wouldSend} recipients</b> would receive this campaign (limit ${limit}). <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${(j.emails||[]).map(e=>`<span style="background:#F1F5F9;border:1px solid #E2E8F0;padding:2px 6px;border-radius:999px;font-size:11px">${e}</span>`).join('')}</div>`;
});
$('#btn-camp-send')?.addEventListener('click', async()=>{
  if(!SELECTED_CAMP) return;
  if(!confirm(`Send campaign "${SELECTED_CAMP.name}" now? This will send via Gmail (same Client ID) — bulk with personalization like HubSpot.`)) return;
  const stage=$('#camp-filter-stage').value;
  const search=$('#camp-filter-search').value;
  const scammed=$('#camp-filter-scam').checked?'yes':'';
  const limit=$('#camp-limit').value||'100';
  const dryRun=$('#camp-dryrun').checked;
  const btn=$('#btn-camp-send'); if(btn) btn.disabled=true;
  $('#camp-send-result').innerHTML='Sending — please wait (throttled 400ms each)...';
  try{
    const r=await fetch('/api/admin/campaigns/'+SELECTED_CAMP.id+'/send',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify({ stage, search, scammed, limit: parseInt(limit,10), dryRun })});
    const j=await r.json();
    if(!r.ok) $('#camp-send-result').innerHTML=`<span style="color:#F87171">${j.error||'Send failed — check Gmail connected (same Client ID) and Sheets+Gmail scopes'}</span>`;
    else {
      if(j.dryRun) $('#camp-send-result').innerHTML=`Dry run: ${j.wouldSend} would be sent`;
      else {
        $('#camp-send-result').innerHTML=`<span style="color:#10B981">Sent ${j.sent}/${j.total} ✓ ${j.failed?' • '+j.failed+' failed':''}</span>`;
        selectCampaign(SELECTED_CAMP.id); loadOutbox();
      }
    }
  }catch(e){ $('#camp-send-result').textContent='Error: '+e.message; }
  finally{ if(btn) btn.disabled=false; }
});
// Templates
async function loadTemplates(){
  const r=await fetch('/api/admin/templates',{headers: authHeaders()});
  if(!r.ok) return;
  TEMPLATES=await r.json();
  const wrap=$('#templates-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!TEMPLATES.length){ wrap.innerHTML='<div style="font-size:11px;color:#94A3B8">No templates — create one.</div>'; return; }
  TEMPLATES.forEach(t=>{
    const div=document.createElement('div');
    div.style.cssText='border:1px solid #E2E8F0;border-radius:8px;padding:8px;display:flex;gap:8px;align-items:center;justify-content:space-between;background:#F8FAFC';
    div.innerHTML=`<div><b style="font-size:12px">${t.name}</b> <small style="color:#94A3B8">${t.category}</small><div style="font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">${t.subject}</div></div><div style="display:flex;gap:4px"><button class="btn btn-ghost" data-tpl-use="${t.id}" style="padding:4px 8px;font-size:11px">Use</button><button class="btn btn-ghost" data-tpl-edit="${t.id}" style="padding:4px 8px;font-size:11px">Edit</button><button class="btn btn-ghost" data-tpl-del="${t.id}" style="padding:4px 8px;font-size:11px;color:#F87171">×</button></div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('[data-tpl-use]').forEach(b=> b.addEventListener('click', ()=>{
    const t=TEMPLATES.find(x=> String(x.id)===b.dataset.tplUse);
    if(t && SELECTED_CAMP){ $('#camp-subject').value=t.subject; $('#camp-html').value=t.body_html; $('#camp-text').value=t.body_text||''; $('#gmail-msg').textContent='Template loaded into campaign — Save Campaign to keep'; }
    else alert('Select a campaign first, then Use template');
  }));
  wrap.querySelectorAll('[data-tpl-edit]').forEach(b=> b.addEventListener('click', ()=> openTemplateDialog(b.dataset.tplEdit)));
  wrap.querySelectorAll('[data-tpl-del]').forEach(b=> b.addEventListener('click', async()=>{
    if(!confirm('Delete template?')) return;
    await fetch('/api/admin/templates/'+b.dataset.tplDel,{method:'DELETE',headers: authHeaders()});
    loadTemplates();
  }));
  // also fill personal email template select
  const sel=$('#personal-tpl'); if(sel){
    sel.innerHTML='<option value="">— No template —</option>';
    TEMPLATES.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.name+' — '+t.subject.slice(0,40); sel.appendChild(o); });
  }
}
let editingTplId=null;
function openTemplateDialog(id){
  const t=id ? TEMPLATES.find(x=> String(x.id)===String(id)) : null;
  editingTplId=id||null;
  $('#template-dialog-title').textContent = t ? 'Edit Template' : 'New Template';
  $('#tpl-name').value = t?.name||'';
  $('#tpl-cat').value = t?.category||'general';
  $('#tpl-subject').value = t?.subject||'';
  $('#tpl-html').value = t?.body_html||'';
  $('#tpl-text').value = t?.body_text||'';
  document.getElementById('template-dialog').showModal();
}
$('#btn-new-template')?.addEventListener('click', ()=> openTemplateDialog(null));
$('#template-save')?.addEventListener('click', async e=>{
  e.preventDefault();
  const payload={ name: $('#tpl-name').value, category: $('#tpl-cat').value||'general', subject: $('#tpl-subject').value, body_html: $('#tpl-html').value, body_text: $('#tpl-text').value };
  if(!payload.name||!payload.subject) return alert('Name and subject required');
  let r;
  if(editingTplId) r=await fetch('/api/admin/templates/'+editingTplId,{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify(payload)});
  else r=await fetch('/api/admin/templates',{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify(payload)});
  if(r.ok){ document.getElementById('template-dialog').close(); loadTemplates(); } else alert('Save failed');
});
$('#personal-tpl')?.addEventListener('change', ()=>{
  const t=TEMPLATES.find(x=> String(x.id)===$('#personal-tpl').value);
  if(t){ $('#personal-subject').value=t.subject; $('#personal-html').value=t.body_html; $('#personal-text').value=t.body_text||''; }
});
// Outbox
async function loadOutbox(){
  const r=await fetch('/api/admin/outbox?limit=30',{headers: authHeaders()});
  if(!r.ok) return;
  const j=await r.json();
  const wrap=$('#outbox-list'); if(!wrap) return;
  $('#outbox-count').textContent = j.sends.length+' recent';
  if(!j.sends.length){ wrap.innerHTML='<div style="font-size:11px;color:#94A3B8">No sends yet.</div>'; return; }
  wrap.innerHTML='';
  j.sends.forEach(s=>{
    const div=document.createElement('div');
    div.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid #E2E8F0;border-radius:8px;padding:8px;background:#fff';
    const col=s.status==='sent'?'#10B981': s.status==='failed'?'#F87171':'#94A3B8';
    div.innerHTML=`<div><b style="font-size:11px">${s.email}</b> <span style="font-size:11px;color:#64748B">${s.campaign_name||'1:1'}</span><div style="font-size:10px;color:#94A3B8">${s.campaign_subject||''} • ${String(s.sent_at||'').slice(0,16)}</div></div><div style="display:flex;gap:6px;align-items:center"><span style="font-size:10px;background:${col};color:#fff;padding:2px 6px;border-radius:999px">${s.status}</span><button data-deloutbox="${s.id}" title="Delete from database" style="font-size:10px;border:none;background:transparent;color:#F87171;cursor:pointer">✕</button></div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('[data-deloutbox]').forEach(b=> b.addEventListener('click', async()=>{
    if(!confirm('Delete this outbox record from the database?')) return;
    try{
      const r=await fetch('/api/admin/outbox/'+b.dataset.deloutbox,{method:'DELETE',headers:authHeaders()});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||'Delete failed');
    }catch(e){ alert('Delete failed: '+e.message); }
    loadOutbox();
  }));
}
$('#btn-refresh-outbox')?.addEventListener('click', loadOutbox);
$('#btn-clear-outbox')?.addEventListener('click', async()=>{
  if(!confirm('Clear the ENTIRE outbox? Every send record will be deleted from the database. This cannot be undone.')) return;
  const r=await fetch('/api/admin/outbox',{method:'DELETE',headers:authHeaders()});
  const j=await r.json().catch(()=>({}));
  alert(r.ok ? ('Outbox cleared ('+j.cleared+' records deleted)') : ('Failed: '+(j.error||'error')));
  loadOutbox();
});
// Personal email from Leads CRM — HubSpot 1:1
function openPersonalEmail(lead){
  PERSONAL_LEAD=lead;
  $('#personal-email-to').textContent=`to ${lead.name} <${lead.email}>`;
  $('#personal-subject').value=`Hi ${lead.name}, about your ${lead.storeName||'store'}`;
  $('#personal-html').value=`<p>Hi ${lead.name},</p><p>Thanks for your interest in <b>${lead.storeName||'your store'}</b> (${lead.preferredNiche||''}). Saw you’re on <b>${lead.pipeline_stage||'new'}</b> stage — happy to help personally.</p><p>— Nexatech</p>`;
  $('#personal-text').value=`Hi ${lead.name},\n\nThanks for your interest in ${lead.storeName||'your store'}.\n\n— Nexatech`;
  if(TEMPLATES.length===0) loadTemplates();
  document.getElementById('personal-email-dialog').showModal();
}
$('#personal-send')?.addEventListener('click', async e=>{
  e.preventDefault();
  if(!PERSONAL_LEAD) return;
  const payload={ subject: $('#personal-subject').value, body_html: $('#personal-html').value, body_text: $('#personal-text').value };
  const tplId=$('#personal-tpl').value;
  if(tplId) payload.templateId=parseInt(tplId,10);
  const r=await fetch(`/api/admin/leads/${PERSONAL_LEAD.id}/email`,{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()}, body: JSON.stringify(payload)});
  const j=await r.json();
  if(r.ok){ alert('Sent via Gmail ✓ to '+j.to); document.getElementById('personal-email-dialog').close(); loadOutbox(); }
  else alert(j.error||'Send failed — check Gmail connected (same Client ID)');
});
// Expose for leads rendering
window.openPersonalEmail = openPersonalEmail;
loadGoogleStatus();
$('#btn-publish').addEventListener('click', ()=>{ alert('Changes are live instantly — no draft queue. (This button confirms publish.)'); window.open('/','_blank'); });
$('#btn-revert').addEventListener('click', async()=>{
  const dlg=document.getElementById('revisions-dialog');
  const list=$('#revisions-list');
  if(list) list.innerHTML='<div style="font-size:12px;color:#94A3B8">Loading previous saves...</div>';
  if(dlg && dlg.showModal) dlg.showModal(); else return alert('No backup dialog');
  try{
    const r=await fetch('/api/admin/content-revisions',{headers:authHeaders()});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Failed to load backups');
    const revs=j.revisions||[];
    if(!revs.length){ if(list) list.innerHTML='<div style="font-size:12px;color:#94A3B8;border:1px dashed #E2E8F0;border-radius:10px;padding:16px;text-align:center">No previous saves yet.<br>Every Save now auto-backs-up the old version here.</div>'; return; }
    if(list){
      list.innerHTML='';
      revs.forEach((rev,idx)=>{
        const row=document.createElement('div');
        row.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid #E2E8F0;border-radius:10px;padding:10px;background:#fff';
        const when=rev.created_at?String(rev.created_at).slice(0,16).replace('T',' '):'#'+rev.id;
        row.innerHTML=`<div><b style="font-size:12px">${idx===0?'← Previous save (latest backup)':'Backup #'+rev.id}</b><div style="font-size:11px;color:#64748B">${when} • ${rev.label||'auto'} • ${(rev.size/1024).toFixed(1)} KB</div></div>`;
        const btn=document.createElement('button');
        btn.className='btn btn-primary'; btn.style.cssText='padding:6px 12px;font-size:12px';
        btn.textContent='Restore';
        btn.addEventListener('click', async (e)=>{
          e.preventDefault(); e.stopPropagation();
          if(!confirm('Restore this backup? Current version will be auto-backed-up first.')) return;
          btn.disabled=true; btn.textContent='Restoring...';
          try{
            const rr=await fetch('/api/admin/content-revisions/'+rev.id+'/restore',{method:'POST',headers:authHeaders()});
            const jj=await rr.json().catch(()=>({}));
            if(!rr.ok) throw new Error(jj.error||'Restore failed');
            alert('Restored ✓ ('+jj.keys+' keys) — preview updates instantly.');
            if(dlg) dlg.close();
            await loadContent();
          }catch(err){ alert('Restore failed: '+err.message); btn.disabled=false; btn.textContent='Restore'; }
        });
        row.appendChild(btn);
        list.appendChild(row);
      });
    }
  }catch(e){ if(list) list.innerHTML='<div style="font-size:12px;color:#F87171">Error: '+e.message+'</div>'; }
});

// Media
let currentMediaTab='portfolio';
function updateMediaHint(){
  const hint=$('#media-hint'); const txt=$('#media-hint-text');
  if(!hint||!txt) return;
  if(currentMediaTab==='reviews'){
    hint.style.display='block';
    txt.innerHTML='For <b>Review Screenshots</b> upload landscape images at <b>2550 × 1650 px</b> (aspect 1.545). <b>Videos must be portrait 9:16</b> (e.g. 1080 × 1920 phone video) — they display tall on the wall and play full-frame in the popup. Videos autoplay muted on hover. File limit <b>150MB</b> each — or paste a YouTube/Vimeo/Drive link in the URL field.';
  } else if(currentMediaTab==='testimonials'){
    hint.style.display='block';
    txt.textContent='Testimonials: use short quotes with small avatar. Videos (file up to 150MB, or YouTube/Vimeo link) show with a play badge. For large review screenshots use Review Screenshots tab.';
  } else if(currentMediaTab==='portfolio'){
    hint.style.display='block';
    txt.textContent='Portfolio supports any ratio but 16:10 works best. Videos (file up to 150MB, or YouTube/Vimeo/Drive URL) autoplay muted on hover and play in the popup.';
  } else if(currentMediaTab==='sales_proof'){
    hint.style.display='block';
    txt.textContent='Sales proof: images or videos (file up to 150MB, or YouTube/Vimeo link). Videos play with controls on the homepage.';
  } else if(currentMediaTab==='hero'){
    hint.style.display='block';
    txt.innerHTML='For the <b>homepage hero mockup</b> upload a wide image (16:10 works best). Uploading sets it live instantly — or hover any image below and click <b>Set as Hero</b> to switch.';
  } else if(currentMediaTab==='certificates'){
    hint.style.display='block';
    txt.innerHTML='For <b>Certificates & Awards</b> upload image files (PNG/JPG/PDF preview as image). Recommended <b>4:3</b> or square, max 5MB. These appear in the homepage Certificates section.';
  } else {
    hint.style.display='none';
  }
}
$('#media-tabs').addEventListener('click', e=>{
  const btn=e.target?.closest?.('[data-mtab]');
  if(btn && btn.dataset.mtab){
    $$('#media-tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentMediaTab=btn.dataset.mtab;
    $('#media-type').value=currentMediaTab;
    updateMediaHint();
    loadMedia();
  }
});
$('#media-type').addEventListener('change', e=>{ currentMediaTab=e.target.value; $$('#media-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.mtab===currentMediaTab)); updateMediaHint(); loadMedia(); });
updateMediaHint();

async function loadMedia(){
  const r=await fetch('/api/media?type='+currentMediaTab, {headers: authHeaders()});
  MEDIA=await r.json();
  // also fetch all if needed? For admin we want all types but filter
  // Actually fetch all then filter client side for admin view? Simplify: fetch with type
  renderMediaGallery();
}
// Current live hero preview (hero tab only)
function renderHeroBanner(g){
  if(currentMediaTab!=='hero') return;
  const url=(CONTENT.hero_image_url||'').trim();
  const bar=document.createElement('div');
  bar.style.cssText='grid-column:1/-1;display:flex;gap:12px;align-items:center;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.3);border-radius:12px;padding:10px 12px;margin-bottom:4px';
  bar.innerHTML=`<img src="${url}" style="width:120px;height:75px;object-fit:cover;border-radius:8px;background:#0B1220" onerror="this.style.display='none'"><div style="font-size:12px"><b>Live hero image</b><div style="color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px">${url||'(none set)'}</div><small style="color:#94A3B8">Upload a new image below (goes live instantly) or click Set as Hero on any image.</small></div>`;
  g.appendChild(bar);
}
function renderMediaGallery(){
  const g=$('#media-gallery'); g.innerHTML='';
  const filtered = MEDIA; // already filtered by type
  renderHeroBanner(g);
  filtered.forEach(item=>{
    const div=document.createElement('div');
    div.draggable=true;
    div.dataset.id=item.id;
    div.style.cssText='background:#0B1220;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;display:flex;flex-direction:column';
    const kindA=mediaKindA(item.url);
    const isVideo=kindA==='video';
    const isEmbed=kindA==='youtube'||kindA==='vimeo'||kindA==='drive';
    const ratio = (currentMediaTab==='reviews' ? '2550/1650' : '4/3');
    const isHeroTab = currentMediaTab==='hero';
    const isActiveHero = isHeroTab && CONTENT.hero_image_url && item.url===CONTENT.hero_image_url;
    div.innerHTML=`
      <div style="aspect-ratio:${ratio};overflow:hidden;background:#132238;position:relative">
        ${isEmbed?`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1E293B;color:#fff;font-size:28px">▶</div><span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:4px 6px;border-radius:999px">${kindA.toUpperCase()}</span>`:(isVideo?`<video src="${item.url}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video><span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:4px 6px;border-radius:999px">VIDEO</span>`:`<img src="${item.url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.opacity=.25">`)}
        <span style="position:absolute;left:8px;top:8px;background:${item.published?'#10B981':'#64748B'};color:#fff;font-size:10px;padding:3px 6px;border-radius:999px">${item.published?'LIVE':'DRAFT'}</span>
        ${isActiveHero?'<span style="position:absolute;right:8px;top:8px;background:#7C3AED;color:#fff;font-size:10px;padding:3px 8px;border-radius:999px">ACTIVE HERO</span>':''}
      </div>
      <div style="padding:10px;display:grid;gap:6px">
        <b style="font-size:13px">${item.caption||'(no caption)'}</b>
        <small style="color:#94A3B8">${item.category||' '} • ${item.result_stat||''}</small>
        <small style="color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.url}</small>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${isHeroTab?`<button class="btn btn-primary" data-sethero="${item.id}" style="padding:6px 10px;font-size:11px" ${isActiveHero?'disabled':''}>${isActiveHero?'Active ✓':'Set as Hero'}</button>`:''}
          <button class="btn btn-ghost" data-edit="${item.id}" style="padding:6px 10px;font-size:11px">Edit</button>
          <button class="btn btn-ghost" data-toggle="${item.id}" style="padding:6px 10px;font-size:11px">${item.published?'Unpublish':'Publish'}</button>
          <button class="btn btn-ghost" data-del="${item.id}" style="padding:6px 10px;font-size:11px;color:#F87171">Delete</button>
        </div>
      </div>
    `;
    // drag
    div.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', item.id); div.classList.add('drag-ghost'); });
    div.addEventListener('dragend', ()=> div.classList.remove('drag-ghost'));
    div.addEventListener('dragover', e=> e.preventDefault());
    div.addEventListener('drop', async e=>{
      e.preventDefault();
      const srcId=e.dataTransfer.getData('text/plain');
      const targetId=item.id;
      if(srcId===targetId) return;
      // reorder: move src before target
      const ids=[...document.querySelectorAll('#media-gallery [data-id]')].map(el=>el.dataset.id);
      const srcIdx=ids.indexOf(srcId), tgtIdx=ids.indexOf(targetId);
      ids.splice(srcIdx,1); ids.splice(tgtIdx,0,srcId);
      await fetch('/api/media/reorder',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({orderedIds: ids.map(Number)})});
      await loadMedia();
    });
    g.appendChild(div);
  });
  // attach edit/delete/toggle
  g.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openEditMedia(b.dataset.edit)));
  g.querySelectorAll('[data-sethero]').forEach(b=> b.addEventListener('click', async()=>{
    b.textContent='...'; b.disabled=true;
    try{
      const r=await fetch('/api/admin/media/'+b.dataset.sethero+'/set-hero',{method:'POST',headers:authHeaders()});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||'Failed');
      CONTENT.hero_image_url=j.hero_image_url||CONTENT.hero_image_url;
      alert('Hero image updated — homepage shows it instantly');
    }catch(e){ alert('Failed: '+e.message); }
    loadMedia();
  }));
  g.querySelectorAll('[data-toggle]').forEach(b=> b.addEventListener('click', async()=>{
    const id=b.dataset.toggle;
    const it=MEDIA.find(m=>String(m.id)===String(id));
    const orig=b.textContent; b.textContent='...'; b.disabled=true;
    try{
      const r=await fetch('/api/media/'+id,{method:'PATCH',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({published: it.published?0:1})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
      await loadMedia();
    }catch(e){
      b.textContent=orig; b.disabled=false;
      alert('Publish failed: '+e.message+(/401|unauthorized|invalid token/i.test(e.message)?' — log out and log back in, then retry':''));
    }
  }));
  g.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', async()=>{
    if(!confirm('Delete this media?')) return;
    const r=await fetch('/api/media/'+b.dataset.del,{method:'DELETE',headers:authHeaders()});
    if(r.ok) loadMedia();
  }));
}

// preview on file select (first file + count) — handles video + shows MB
$('input[name="file"]').addEventListener('change', e=>{
  const files=[...(e.target.files||[])];
  if(!files.length) return;
  const f=files[0];
  $('#media-preview').style.display='block';
  const prevImg=$('#media-preview-img');
  // If the selected file is a video, show a playable preview instead of a broken <img>
  try{
    const isVid=(f.type||'').startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(f.name||'');
    if(isVid){
      let v=$('#media-preview-video');
      if(!v){
        v=document.createElement('video');
        v.id='media-preview-video'; v.controls=true; v.muted=true; v.style.cssText='max-width:100%;max-height:220px;border-radius:8px;background:#0B1220';
        prevImg.replaceWith(v);
      }
      v.src=URL.createObjectURL(f);
    } else {
      let v=$('#media-preview-video');
      if(v){
        const ni=document.createElement('img'); ni.id='media-preview-img'; ni.style.cssText='max-width:100%;max-height:220px;border-radius:8px';
        v.replaceWith(ni);
      }
      $('#media-preview-img').src=URL.createObjectURL(f);
    }
  }catch{ prevImg.src=URL.createObjectURL(f); }
  const over=f.size>150*1024*1024?' — OVER 150MB LIMIT (will be rejected, compress or use URL)':'';
  $('#media-preview-meta').textContent = files.length>1
    ? `${files.length} files selected (first: ${f.name} • ${fmtSize(f.size)}${over})`
    : `${f.name} • ${fmtSize(f.size)} • ${f.type}${over}`;
});
$('input[name="url"]').addEventListener('input', e=>{
  const v=e.target.value.trim();
  if(!v) return;
  $('#media-preview').style.display='block';
  $('#media-preview-meta').textContent=v+' ('+mediaKindA(v)+')';
  try{
    const k=mediaKindA(v);
    if(k==='video'){
      let pv=$('#media-preview-video');
      if(!pv){
        pv=document.createElement('video');
        pv.id='media-preview-video'; pv.controls=true; pv.muted=true; pv.style.cssText='max-width:100%;max-height:220px;border-radius:8px;background:#0B1220';
        const old=$('#media-preview-img'); if(old) old.replaceWith(pv);
      }
      pv.src=v;
    } else {
      let pv=$('#media-preview-video');
      if(pv){
        const ni=document.createElement('img'); ni.id='media-preview-img'; ni.style.cssText='max-width:100%;max-height:220px;border-radius:8px';
        pv.replaceWith(ni);
      }
      const im=$('#media-preview-img'); if(im) im.src=v;
    }
  }catch{
    const im=$('#media-preview-img'); if(im) im.src=v;
  }
});

// upload with progress (XHR) — supports many files at once (one request per file)
$('#media-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const files=[...(e.target.querySelector('input[name="file"]')?.files||[])].filter(f=>f && f.size>0);
  const url=fd.get('url');
  // validation: either file(s) or url
  if(!files.length && !url) return alert('Provide file(s) or URL');
  $('#upload-progress').style.display='block';
  $('#upload-bar').style.width='10%';
  $('#upload-bar').style.background='';
  $('#upload-text').textContent='Uploading...';
  const uploadOne=(oneFd, label)=> new Promise((resolve, reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/media');
    xhr.setRequestHeader('Authorization','Bearer '+token);
    xhr.upload.onprogress = ev=>{ if(ev.lengthComputable){ const pct=Math.round(ev.loaded/ev.total*100); $('#upload-bar').style.width=pct+'%'; $('#upload-text').textContent=label+pct+'%'; } };
    xhr.onload=()=>{
      if(xhr.status>=200&&xhr.status<300) resolve(xhr.response);
      else {
        let msg='Upload failed (HTTP '+xhr.status+')';
        try{ const j=JSON.parse(xhr.responseText||'{}'); if(j.error) msg=j.error; }catch{ if(xhr.responseText) msg=xhr.responseText.slice(0,200); }
        if(xhr.status===413) msg='File too large — limit is 150MB. Compress the video or paste a video URL instead.';
        if(xhr.status===401) msg='Session expired — log out and log back in, then retry.';
        reject(new Error(msg));
      }
    };
    xhr.onerror=()=> reject(new Error('Network error'));
    xhr.send(oneFd);
  });
  try{
    if(files.length){
      let done=0, failed=0, lastErr='';
      let fileIdx=0;
      for(const file of files){
        fileIdx++;
        if(file.size>150*1024*1024){ failed++; lastErr=`${file.name}: over 150MB limit — compress or use URL`; console.error(lastErr); continue; }
        const singleMeta = {
          type: fd.get('type'),
          category: fd.get('category')||'',
          caption: files.length>1 ? '' : (fd.get('caption')||''),
          alt_text: fd.get('alt_text')||'',
          tags: fd.get('tags')||'',
          result_stat: files.length>1 ? '' : (fd.get('result_stat')||''),
          case_study_text: files.length>1 ? '' : (fd.get('case_study_text')||'')
        };
        try{
          if(file.size > CHUNK_THRESHOLD){
            // Big file: 4MB pieces with retry (proxies kill single giant requests)
            await chunkedUploadMedia(file, singleMeta, (frac,a,b)=>{
              const overall = Math.round(((fileIdx-1)+frac)/files.length*100);
              $('#upload-bar').style.width=overall+'%';
              $('#upload-text').textContent=`File ${fileIdx}/${files.length} (${fmtSize(file.size)}) piece ${a}/${b} — ${overall}%`;
            });
          } else {
            const oneFd=new FormData();
            for(const [k,v] of Object.entries(singleMeta)) oneFd.append(k, v);
            oneFd.append('file', file, file.name);
            await uploadOne(oneFd, `File ${fileIdx}/${files.length} `);
          }
          done++;
        }catch(err){ failed++; lastErr=file.name+': '+err.message; console.error('bulk upload item failed', file.name, err.message); }
        $('#upload-bar').style.width=Math.round((done+failed)/files.length*100)+'%';
      }
      $('#upload-text').textContent = failed ? `Done: ${done} uploaded, ${failed} failed — ${lastErr}` : `Done: ${done} uploaded`;
      if(!done) throw new Error('All uploads failed — '+lastErr);
    } else {
      // URL-only
      const payload={
        type: fd.get('type'),
        category: fd.get('category')||'',
        url: fd.get('url'),
        caption: fd.get('caption')||'',
        alt_text: fd.get('alt_text')||'',
        tags: fd.get('tags')||'',
        result_stat: fd.get('result_stat')||'',
        case_study_text: fd.get('case_study_text')||''
      };
      const r=await fetch('/api/media/url',{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
      if(!r.ok) throw new Error((await r.json()).error||'Failed');
      $('#upload-bar').style.width='100%'; $('#upload-text').textContent='Done';
    }
    e.target.reset(); $('#media-preview').style.display='none';
    setTimeout(()=> $('#upload-progress').style.display='none', 800);
    await loadMedia();
  }catch(err){
    $('#upload-text').textContent=err.message;
    $('#upload-bar').style.background='#F87171';
  }
});

// Edit media dialog
let editingMediaId=null;
function openEditMedia(id){
  const it=MEDIA.find(m=>String(m.id)===String(id));
  if(!it) return;
  editingMediaId=id;
  const body=$('#edit-media-body');
  body.innerHTML=`
    <label>Caption<input id="em-caption" value="${escAttr(it.caption)}"></label>
    <label>Category<input id="em-category" value="${escAttr(it.category)}"></label>
    <label>URL<input id="em-url" value="${escAttr(it.url)}"></label>
    <label>Alt text<input id="em-alt" value="${escAttr(it.alt_text)}"></label>
    <label>Tags<input id="em-tags" value="${escAttr(it.tags)}"></label>
    <label>Result stat<input id="em-result" value="${escAttr(it.result_stat)}"></label>
    <label>Case study text<textarea id="em-case" rows="3">${escAttr(it.case_study_text)}</textarea></label>
    <label>Replace file (optional)<input type="file" id="em-file" accept="image/*,video/*"></label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="em-pub" ${it.published?'checked':''}> Published</label>
  `;
  document.getElementById('edit-media-dialog').showModal();
}
$('#edit-media-save').addEventListener('click', async e=>{
  e.preventDefault();
  if(!editingMediaId) return;
  const fd=new FormData();
  fd.append('caption', $('#em-caption').value);
  fd.append('category', $('#em-category').value);
  fd.append('url', $('#em-url').value);
  fd.append('alt_text', $('#em-alt').value);
  fd.append('tags', $('#em-tags').value);
  fd.append('result_stat', $('#em-result').value);
  fd.append('case_study_text', $('#em-case').value);
  fd.append('published', $('#em-pub').checked ? '1' : '0');
  const btn=$('#edit-media-save'); if(btn){ btn.disabled=true; btn.textContent='Saving...'; }
  try{
    const file=$('#em-file').files[0];
    if(file){
      if(file.size>150*1024*1024){ alert('File too large — limit is 150MB. Compress or use a URL.'); if(btn){ btn.disabled=false; btn.textContent='Save'; } return; }
      if(file.size > CHUNK_THRESHOLD){
        // Big replacement: pieces first (file-only, no new gallery row), then save URL
        if(btn) btn.textContent='Uploading pieces...';
        const up = await chunkedUploadMedia(file, {mode:'file-only'}, (frac,a,b)=>{ if(btn) btn.textContent=`Uploading piece ${a}/${b}...`; });
        fd.set('url', up.url);
        if(btn) btn.textContent='Saving...';
      } else {
        fd.append('file', file);
      }
    }
    const r=await fetch('/api/media/'+editingMediaId, {method:'PATCH', headers: authHeaders(), body: fd});
    const j=await r.json().catch(()=>({}));
    if(r.ok){ document.getElementById('edit-media-dialog').close(); loadMedia(); }
    else alert('Save failed: '+(j.error||('HTTP '+r.status))+(r.status===401?' — log out and log back in':'')); 
  }catch(err){ alert('Save failed: '+err.message); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Save'; } }
});

// Team
async function loadTeam(){
  const list=$('#team-list');
  try{
    list.innerHTML='<div style="font-size:12px;color:#94A3B8">Loading experts...</div>';
    const r=await fetch('/api/team', {headers: authHeaders()});
    if(!r.ok) throw new Error('Server returned '+r.status+' — try logging out and back in');
    TEAM=await r.json();
  }catch(e){
    list.innerHTML='<div style="font-size:12px;color:#F87171;border:1px solid #FECACA;border-radius:10px;padding:10px">Could not load experts: '+e.message+'</div>';
    return;
  }
  list.innerHTML='';
  if(!TEAM.length){
    list.innerHTML='<div style="font-size:12px;color:#94A3B8;border:1px dashed #E2E8F0;border-radius:10px;padding:14px;text-align:center">No experts yet — add your first expert with the form above. They appear instantly in the homepage Experts section.</div>';
    return;
  }
  TEAM.forEach(m=>{
    const div=document.createElement('div');
    div.style.cssText='display:flex;gap:12px;align-items:center;background:#0B1220;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px';
    div.draggable=true; div.dataset.id=m.id;
    div.innerHTML=`
      <img src="${m.photo_url||''}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;background:#132238">
      <div style="flex:1">
        <b>${m.name}</b> <small style="color:#94A3B8">  ${m.role||''}</small>
        <div style="font-size:12px;color:#94A3B8">${m.credibility_note||''}</div>
        <small style="color:${m.published?'#34D399':'#F87171'}">${m.published?'Published':'Draft'}</small>
      </div>
      <div style="display:flex;gap:6px;flex-direction:column">
        <button class="btn btn-ghost" data-tedit="${m.id}" style="padding:6px 10px;font-size:11px">Edit</button>
        <button class="btn btn-ghost" data-ttoggle="${m.id}" style="padding:6px 10px;font-size:11px">${m.published?'Unpublish':'Publish'}</button>
        <button class="btn btn-ghost" data-tdel="${m.id}" style="padding:6px 10px;font-size:11px;color:#F87171">Delete</button>
      </div>
    `;
    div.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', m.id); });
    div.addEventListener('dragover', e=> e.preventDefault());
    div.addEventListener('drop', async e=>{
      e.preventDefault();
      const src=e.dataTransfer.getData('text/plain');
      const tgt=m.id;
      if(src===String(tgt)) return;
      const ids=[...document.querySelectorAll('#team-list [data-id]')].map(el=>el.dataset.id);
      const sIdx=ids.indexOf(src), tIdx=ids.indexOf(String(tgt));
      ids.splice(sIdx,1); ids.splice(tIdx,0,src);
      // update display_order sequentially via PATCH
      for(let i=0;i<ids.length;i++){
        await fetch('/api/team/'+ids[i],{method:'PATCH',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({display_order:i})});
      }
      await loadTeam();
    });
    list.appendChild(div);
  });
  list.querySelectorAll('[data-tedit]').forEach(b=> b.addEventListener('click', ()=> openEditTeam(b.dataset.tedit)));
  list.querySelectorAll('[data-ttoggle]').forEach(b=> b.addEventListener('click', async()=>{
    const it=TEAM.find(t=>String(t.id)===b.dataset.ttoggle);
    await fetch('/api/team/'+it.id,{method:'PATCH',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({published: it.published?0:1})});
    loadTeam();
  }));
  list.querySelectorAll('[data-tdel]').forEach(b=> b.addEventListener('click', async()=>{
    if(!confirm('Delete expert?')) return;
    await fetch('/api/team/'+b.dataset.tdel,{method:'DELETE',headers:authHeaders()});
    loadTeam();
  }));
}
$('#team-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const r=await fetch('/api/team',{method:'POST', headers: authHeaders(), body: fd});
  if(r.ok){ e.target.reset(); loadTeam(); } else alert('Failed: '+(await r.json()).error);
});
let editingTeamId=null;
function openEditTeam(id){
  const it=TEAM.find(t=>String(t.id)===String(id));
  if(!it) return;
  editingTeamId=id;
  $('#edit-team-body').innerHTML=`
    <label>Name<input id="et-name" value="${escAttr(it.name)}"></label>
    <label>Role<input id="et-role" value="${escAttr(it.role)}"></label>
    <label>Credibility note<input id="et-note" value="${escAttr(it.credibility_note)}"></label>
    <label>Photo URL<input id="et-photo" value="${escAttr(it.photo_url)}"></label>
    <label>Replace photo<input type="file" id="et-file" accept="image/*"></label>
    <label>Social URL<input id="et-social" value="${escAttr(it.social_url)}"></label>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="et-pub" ${it.published?'checked':''}> Published</label>
  `;
  document.getElementById('edit-team-dialog').showModal();
}
$('#edit-team-save').addEventListener('click', async e=>{
  e.preventDefault();
  if(!editingTeamId) return;
  const fd=new FormData();
  fd.append('name', $('#et-name').value);
  fd.append('role', $('#et-role').value);
  fd.append('credibility_note', $('#et-note').value);
  fd.append('photo_url', $('#et-photo').value);
  fd.append('social_url', $('#et-social').value);
  fd.append('published', $('#et-pub').checked?'1':'0');
  const f=$('#et-file').files[0];
  if(f) fd.append('photo', f);
  const r=await fetch('/api/team/'+editingTeamId,{method:'PATCH', headers: authHeaders(), body: fd});
  if(r.ok){ document.getElementById('edit-team-dialog').close(); loadTeam(); } else alert('Save failed');
});

// Sections
async function loadSections(){
  const r=await fetch('/api/sections');
  SECTIONS=await r.json();
  const list=$('#sections-list'); list.innerHTML='';
  SECTIONS.sort((a,b)=>a.display_order-b.display_order).forEach(sec=>{
    const div=document.createElement('div');
    div.draggable=true; div.dataset.key=sec.key;
    div.style.cssText='display:flex;gap:10px;align-items:center;background:#0B1220;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px';
    div.innerHTML=`
      <span style="cursor:grab">≡</span>
      <b style="flex:1">${sec.key}</b>
      <label style="flex-direction:row;gap:6px;align-items:center">Visible<input type="checkbox" ${sec.visible?'checked':''} data-vis></label>
      <label style="flex-direction:row;gap:6px;align-items:center">Anim<input type="checkbox" ${sec.animation_enabled?'checked':''} data-anim></label>
      <small style="color:#94A3B8">#${sec.display_order}</small>
    `;
    div.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', sec.key));
    div.addEventListener('dragover', e=> e.preventDefault());
    div.addEventListener('drop', e=>{
      e.preventDefault();
      const src=e.dataTransfer.getData('text/plain');
      const tgt=sec.key;
      if(src===tgt) return;
      const keys=[...document.querySelectorAll('#sections-list [data-key]')].map(el=>el.dataset.key);
      const sIdx=keys.indexOf(src), tIdx=keys.indexOf(tgt);
      keys.splice(sIdx,1); keys.splice(tIdx,0,src);
      // update DOM order visually
      const container=$('#sections-list');
      const map={}; [...container.children].forEach(c=> map[c.dataset.key]=c);
      container.innerHTML='';
      keys.forEach(k=> container.appendChild(map[k]));
      // update display_order values
      [...container.children].forEach((c,i)=> c.querySelector('small').textContent='#'+i);
    });
    list.appendChild(div);
  });
}
$('#btn-save-sections').addEventListener('click', async()=>{
  const els=[...document.querySelectorAll('#sections-list [data-key]')];
  const payload=els.map((el, idx)=> ({
    key: el.dataset.key,
    visible: el.querySelector('[data-vis]').checked,
    animation_enabled: el.querySelector('[data-anim]').checked,
    display_order: idx
  }));
  const r=await fetch('/api/sections',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
  if(r.ok) alert('Sections saved');
});

// Leads
async function loadLeads(){
  const search=$('#lead-search').value;
  const stage=$('#lead-stage-filter').value;
  const scammed=$('#lead-scam-filter').checked ? 'yes' : '';
  const q=new URLSearchParams(); if(search) q.set('search',search); if(stage) q.set('stage',stage); if(scammed) q.set('scammed',scammed);
  const r=await fetch('/api/admin/leads?'+q.toString(), {headers: authHeaders()});
  LEADS=await r.json();
  renderLeads();
}
function renderLeads(){
  const stages=[
    {key:'new', label:'New Application'},
    {key:'contacted', label:'Contacted'},
    {key:'scheduled', label:'Call Scheduled'},
    {key:'closed', label:'Client Closed'},
    {key:'archived', label:'Archived'},
  ];
  const kanban=$('#leads-kanban'); kanban.innerHTML='';
  stages.forEach(st=>{
    const col=document.createElement('div'); col.className='kanban-col';
    const items=LEADS.filter(l=> (l.pipeline_stage||'new')===st.key);
    col.innerHTML=`<h4>${st.label} (${items.length})</h4>`;
    items.forEach(lead=>{
      const card=document.createElement('div'); card.className='lead-card';
      const isHigh=lead.wasScammed==='yes';
      card.innerHTML=`
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <b>${lead.name||' '}</b> ${isHigh?'<span class="badge" style="background:#F59E0B;color:#fff">High Empathy Needed</span>':''}
          <span class="badge ${lead.webhook_status==='sent'?'badge-sent':lead.webhook_status==='failed'?'badge-failed':'badge-pending'}">${lead.webhook_status||'pending'}</span>
        </div>
        <small>${lead.storeName||''} • ${lead.preferredNiche||''} ${lead.preferredNicheOther?`(${lead.preferredNicheOther})`:''}</small>
        <small>${lead.email||''} • ${lead.whatsapp||''}</small>
        <small>${lead.investmentRange||''} • ${lead.storeStatus||''} • ${lead.source||''}</small>
        ${lead.scamDetails?`<small style="background:rgba(245,158,11,.12);padding:6px;border-radius:8px"><b>Scam details:</b> ${lead.scamDetails}</small>`:''}
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <select data-stage="${lead.id}" style="flex:1;padding:6px;border-radius:8px;background:#132238;color:#F1F5F9;border:1px solid rgba(255,255,255,.08)">
            ${stages.map(s=>`<option value="${s.key}" ${s.key===st.key?'selected':''}>${s.label}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" data-resend="${lead.id}" style="padding:6px 8px;font-size:11px">Resend</button>
          <button class="btn btn-ghost" data-email="${lead.id}" style="padding:6px 8px;font-size:11px;border-color:#7C3AED;color:#7C3AED" title="Send personal email via Gmail (same Client ID)">Email</button>
          <button class="btn btn-ghost" data-dellead="${lead.id}" style="padding:6px 8px;font-size:11px;color:#F87171" title="Delete this lead everywhere">Delete</button>
        </div>
      `;
      col.appendChild(card);
    });
    kanban.appendChild(col);
  });
  // table fallback
  const table=$('#leads-table');
  if(LEADS.length===0) table.innerHTML='<p style="color:#94A3B8">No leads found.</p>';
  else {
    let html='<table><tr><th>Name</th><th>Store</th><th>Niche</th><th>WhatsApp</th><th>Email</th><th>Status</th><th>Webhook</th><th>Created</th><th></th></tr>';
    LEADS.forEach(l=>{
      html+=`<tr><td>${l.name||''} ${l.wasScammed==='yes'?'<span style="background:#F59E0B;color:#fff;padding:2px 6px;border-radius:999px;font-size:10px">High Empathy</span>':''}</td><td>${l.storeName||''}</td><td>${l.preferredNiche||''}</td><td>${l.whatsapp||''}</td><td>${l.email||''}</td><td>${l.pipeline_stage||''}</td><td>${l.webhook_status||''} (${l.webhook_attempts||0})</td><td>${(l.created_at||'').slice(0,16)}</td><td><button class="btn btn-ghost" data-dellead="${l.id}" style="padding:4px 8px;font-size:11px;color:#F87171">Delete</button></td></tr>`;
    });
    html+='</table>'; table.innerHTML=html;
  }
  // bind stage change + resend
  kanban.querySelectorAll('[data-stage]').forEach(sel=> sel.addEventListener('change', async()=>{
    const id=sel.dataset.stage;
    const r=await fetch('/api/admin/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({pipeline_stage: sel.value})});
    if(r.ok) loadLeads();
  }));
  kanban.querySelectorAll('[data-resend]').forEach(b=> b.addEventListener('click', async()=>{
    const id=b.dataset.resend;
    b.textContent='...'; b.disabled=true;
    const r=await fetch('/api/admin/leads/'+id+'/resend',{method:'POST',headers:authHeaders()});
    const j=await r.json().catch(()=>({}));
    alert(r.ok? 'Resent': (j.error||'Resend failed'));
    b.textContent='Resend'; b.disabled=false;
    loadLeads();
  }));
  kanban.querySelectorAll('[data-email]').forEach(b=> b.addEventListener('click', ()=>{
    const lead = LEADS.find(l=> String(l.id)===b.dataset.email);
    if(lead){
      if(!lead.email) return alert('No email for this lead');
      // ensure gmail status loaded
      openPersonalEmail(lead);
    }
  }));
  async function deleteLead(id, btn){
    const lead = LEADS.find(l=> String(l.id)===String(id));
    const who = lead ? (lead.name||lead.email||('#'+id)) : ('#'+id);
    if(!confirm('Delete lead "'+who+'"? This removes it from the CRM everywhere (board, table, sends log). This cannot be undone.')) return;
    if(btn){ btn.textContent='...'; btn.disabled=true; }
    try{
      const r=await fetch('/api/admin/leads/'+id,{method:'DELETE',headers:authHeaders()});
      const j=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error||'Delete failed');
    }catch(e){ alert('Delete failed: '+e.message); }
    loadLeads();
  }
  kanban.querySelectorAll('[data-dellead]').forEach(b=> b.addEventListener('click', ()=> deleteLead(b.dataset.dellead, b)));
  table.querySelectorAll('[data-dellead]').forEach(b=> b.addEventListener('click', ()=> deleteLead(b.dataset.dellead, b)));
}
$('#lead-search').addEventListener('input', debounce(loadLeads, 400));
$('#lead-stage-filter').addEventListener('change', loadLeads);
$('#lead-scam-filter').addEventListener('change', loadLeads);
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

// ========== Chatbot — how many used it + full conversations (clean UI) ==========
let CHATS=[], SELECTED_CHAT=null;
function escChat(s){ const d=document.createElement('div'); d.textContent=String(s||''); return d.innerHTML; }
function fmtChatTime(s){ try{ const d=new Date(String(s).replace(' ','T')); return isNaN(d)? String(s).slice(0,16) : d.toLocaleString(); }catch{ return String(s||'').slice(0,16); } }
async function loadChats(){
  const searchEl=$('#chat-search');
  const q=(searchEl?.value||'').trim();
  try{
    const sRes=await fetch('/api/admin/chats/summary',{headers:authHeaders()});
    if(sRes.ok){
      const s=await sRes.json();
      const uEl=$('#chat-kpi-users'); if(uEl) uEl.textContent=s.totalSessions ?? 0;
      const mEl=$('#chat-kpi-msgs'); if(mEl) mEl.textContent=s.totalMessages ?? 0;
      const tEl=$('#chat-kpi-today'); if(tEl) tEl.textContent=(s.todaySessions ?? 0)+' users / '+(s.todayMessages ?? 0)+' msgs';
      const spEl=$('#chat-kpi-split'); if(spEl) spEl.textContent=(s.userMessages ?? 0)+' / '+(s.botMessages ?? 0);
      const note=$('#chat-summary-note');
      if(note){
        if((s.totalSessions||0)===0 && (s.legacySessions||0)>0) note.textContent=`${s.legacyMessages} chatbot clicks tracked via events before detailed logging — new conversations will appear here with full text.`;
        else if((s.totalSessions||0)===0) note.textContent='No chatbot conversations yet — they appear here automatically when visitors chat.';
        else note.textContent=`${s.totalSessions} people chatted • ${s.totalMessages} messages total • ${s.todaySessions} chatted today`;
      }
      const cnt=$('#chat-count'); if(cnt) cnt.textContent=`(${(s.totalSessions||0)} people)`;
    }
  }catch{}
  try{
    const qs=new URLSearchParams(); if(q) qs.set('search',q); qs.set('limit','100');
    const r=await fetch('/api/admin/chats?'+qs.toString(),{headers:authHeaders()});
    if(!r.ok) return;
    const j=await r.json();
    CHATS=j.sessions||[];
    renderChats();
  }catch(e){ console.error('loadChats',e); }
}
function renderChats(){
  const wrap=$('#chats-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!CHATS.length){ wrap.innerHTML='<div style="font-size:12px;color:#94A3B8;border:1px dashed #E2E8F0;border-radius:10px;padding:16px;text-align:center">No conversations yet.<br>Ask something in the frontend chatbot, then Refresh.</div>'; return; }
  CHATS.forEach(c=>{
    const isSel=SELECTED_CHAT===c.session_id;
    const div=document.createElement('div');
    div.style.cssText=`border:1px solid ${isSel?'#7C3AED':'#E2E8F0'};border-radius:12px;padding:10px;background:${isSel?'rgba(124,58,237,.07)':'#fff'};cursor:pointer;display:grid;gap:4px`;
    const whoName=c.name||'Anonymous';
    const whoEmail=c.email||'no email';
    div.innerHTML=`
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <b style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">👤 ${escChat(whoName)}</b>
        <span style="font-size:10px;background:#0B1220;color:#fff;padding:2px 8px;border-radius:999px">${c.message_count} msgs</span>
      </div>
      <div style="font-size:11px;color:#7C3AED;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">✉️ ${escChat(whoEmail)}</div>
      <div style="font-size:12px;color:#0B1220;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">“${escChat(c.preview||'(no preview)')}”</div>
      <div style="font-size:11px;color:#64748B">${c.user_count||0} you • ${c.bot_count||0} bot • ${fmtChatTime(c.last_seen)}</div>
      <div style="font-size:10px;color:#94A3B8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escChat(c.session_id)}">${escChat(String(c.session_id).slice(0,28))}</div>`;
    div.addEventListener('click',()=>selectChat(c.session_id));
    wrap.appendChild(div);
  });
}
async function selectChat(sessionId){
  SELECTED_CHAT=sessionId;
  renderChats();
  const title=$('#chat-thread-title'); const thread=$('#chat-thread'); const del=$('#btn-delete-chat');
  if(title) title.textContent='👤 '+String(sessionId).slice(0,24)+'...';
  if(thread) thread.innerHTML='<div style="font-size:12px;color:#94A3B8">Loading conversation...</div>';
  if(del) del.style.display='none';
  try{
    const r=await fetch('/api/admin/chats/'+encodeURIComponent(sessionId),{headers:authHeaders()});
    if(!r.ok) throw new Error('load failed');
    const j=await r.json();
    if(thread){
      thread.innerHTML='';
      const head=document.createElement('div');
      head.style.cssText='background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 10px;font-size:12px;color:#0B1220';
      head.innerHTML=`<b>👤 ${escChat(j.name||'Anonymous')}</b> <span style="color:#7C3AED">✉️ ${escChat(j.email||'no email')}</span> <span style="color:#94A3B8;font-family:monospace">${escChat(String(sessionId).slice(0,20))}…</span>`;
      thread.appendChild(head);
      if(!j.messages.length) thread.innerHTML='<div style="font-size:12px;color:#94A3B8">Empty conversation.</div>';
      j.messages.forEach(m=>{
        const isUser=m.role==='user';
        const b=document.createElement('div');
        b.style.cssText=`max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;${isUser?'justify-self:end;background:#0B1220;color:#fff;border-bottom-right-radius:4px':'justify-self:start;background:#F1F5F9;color:#0B1220;border:1px solid #E2E8F0;border-bottom-left-radius:4px'}`;
        b.textContent=m.text||'';
        const meta=document.createElement('div');
        meta.style.cssText=`font-size:10px;color:#94A3B8;margin-top:4px;${isUser?'text-align:right':''}`;
        meta.textContent=(isUser?'You • ':'Bot • ')+fmtChatTime(m.created_at);
        const w=document.createElement('div'); w.style.display='grid'; w.style.justifyItems=isUser?'end':'start';
        w.appendChild(b); w.appendChild(meta);
        thread.appendChild(w);
      });
      thread.scrollTop=thread.scrollHeight;
    }
    if(title) title.textContent=`👤 ${(j.name||'Anonymous').slice(0,20)} • ${j.count} messages`;
    if(del) del.style.display='inline-block';
  }catch(e){ if(thread) thread.innerHTML='<div style="font-size:12px;color:#F87171">Failed to load conversation.</div>'; }
}
$('#chat-search')?.addEventListener('input', debounce(loadChats, 400));
$('#btn-refresh-chats')?.addEventListener('click', loadChats);
$('#btn-delete-chat')?.addEventListener('click', async()=>{
  if(!SELECTED_CHAT || !confirm('Delete this conversation?')) return;
  await fetch('/api/admin/chats/'+encodeURIComponent(SELECTED_CHAT),{method:'DELETE',headers:authHeaders()});
  SELECTED_CHAT=null; $('#btn-delete-chat').style.display='none';
  $('#chat-thread-title').textContent='Select a conversation →';
  $('#chat-thread').innerHTML='<div style="font-size:12px;color:#94A3B8">Deleted. Select another conversation.</div>';
  loadChats();
});

// Overview & Analytics
async function loadOverview(){
  const c=await fetch('/api/content').then(r=>r.json());
  const leads=await fetch('/api/admin/leads',{headers:authHeaders()}).then(r=>r.json()).catch(()=>[]);
  const events=await fetch('/api/admin/analytics',{headers:authHeaders()}).then(r=>r.json()).catch(()=>null);
  $('#kpi-stores').textContent=c.stats.stores_launched||' ';
  $('#kpi-leads').textContent=leads.length||0;
  $('#kpi-pending').textContent=leads.filter(l=>l.webhook_status!=='sent').length;
  $('#kpi-views').textContent=events? events.totalViews : ' ';
}
async function loadAnalytics(){
  const r=await fetch('/api/admin/analytics',{headers:authHeaders()});
  if(!r.ok) return;
  ANALYTICS=await r.json();
  $('#a-views').textContent=ANALYTICS.totalViews;
  $('#a-unique').textContent=ANALYTICS.uniqueVisitors;
  $('#a-starts').textContent=ANALYTICS.funnelStarts;
  $('#a-completions').textContent=ANALYTICS.funnelCompletions;
  drawChart('chart-daily', ANALYTICS.daily.map(d=>d.d), ANALYTICS.daily.map(d=>d.c), 'Views');
  drawChart('chart-cta', ANALYTICS.ctaClicks.map(c=>c.element_id), ANALYTICS.ctaClicks.map(c=>c.c), 'Clicks');
  drawChart('chart-source', ANALYTICS.trafficSource.map(s=>s.name||'Unknown'), ANALYTICS.trafficSource.map(s=>s.c), 'Leads');
  $('#top-portfolio').innerHTML = ANALYTICS.topPortfolio.length? ANALYTICS.topPortfolio.map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${t.element_id||' '}</span><b>${t.c}</b></div>`).join('') : '<small style="color:#94A3B8">No portfolio views yet.</small>';
}
function drawChart(id, labels, values, label){
  const canvas=document.getElementById(id);
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width=canvas.clientWidth*2, H=canvas.height=160*2;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0B1220'; ctx.fillRect(0,0,W,H);
  if(!values.length){ ctx.fillStyle='#94A3B8'; ctx.font='12px Inter'; ctx.fillText('No data', 20,40); return; }
  const max=Math.max(...values,1);
  const pad=30;
  const barW=(W-pad*2)/labels.length*0.6;
  const gap=(W-pad*2)/labels.length;
  values.forEach((v,i)=>{
    const h=(v/max)*(H-pad*2);
    const x=pad + i*gap + gap*0.2;
    const y=H-pad - h;
    ctx.fillStyle='#00D1FF';
    ctx.fillRect(x,y,barW,h);
    ctx.fillStyle='#94A3B8'; ctx.font='10px Inter';
    const lbl=String(labels[i]).slice(0,10);
    ctx.fillText(lbl, x, H-8);
    ctx.fillText(String(v), x, y-6);
  });
}
// ========== Auto AI Follow-ups — CRM panel (instant + daily, same Gmail, HTML + WhatsApp + opt-out) ==========
async function loadFollowupStatus(){
  try{
    const r = await fetch('/api/admin/followups/status', { headers: authHeaders() });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'failed');
    const s = j.settings || {};
    const fe=$('#fu-enabled'); if(fe) fe.checked = !!s.enabled;
    const fi=$('#fu-instant'); if(fi) fi.checked = !!s.instantEnabled;
    const fd=$('#fu-daily'); if(fd) fd.checked = !!s.dailyEnabled;
    const fm=$('#fu-maxdays'); if(fm) fm.value = s.maxDays||7;
    const fi2=$('#fu-idle'); if(fi2) fi2.value = s.chatIdleMinutes||10;
    const fn=$('#fu-fromname'); if(fn) fn.value = s.fromName||'';
    const mh=$('#followup-max-hint'); if(mh) mh.textContent = s.maxDays||7;
    const pill=$('#followup-status-pill');
    if(pill){
      const on = s.enabled ? (s.instantEnabled||s.dailyEnabled) : false;
      pill.textContent = !s.enabled ? 'OFF' : `ON • sent ${j.counts?.totalSent||0} (${j.counts?.todaySent||0} today) • unsub ${j.counts?.unsubscribed||0} • Gmail ${j.gmail?.email||'not connected'}`;
      pill.style.color = on ? '#10B981' : '#F59E0B';
      pill.style.borderColor = on ? '#A7F3D0' : '#FDE68A';
    }
    const uc=$('#unsub-count'); if(uc) uc.textContent = j.counts?.unsubscribed ?? 0;
    if(!j.gmail?.email) { const m=$('#followup-msg'); if(m) m.innerHTML = '<span style="color:#F59E0B">Gmail not connected — follow-ups will fail until you Connect Gmail (same Client ID) in Integrations or Campaigns.</span>'; }
  }catch(e){ const p=$('#followup-status-pill'); if(p) p.textContent='Error: '+e.message; }
}
async function loadFollowupLogs(){
  try{
    const kind=$('#followup-kind')?.value||'';
    const search=$('#followup-search')?.value?.trim()||'';
    const qs = `limit=50&kind=${encodeURIComponent(kind)}&search=${encodeURIComponent(search)}`;
    const r = await fetch('/api/admin/followups/logs?'+qs, { headers: authHeaders() });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'failed');
    const wrap=$('#followup-list');
    const cnt=$('#followup-count');
    if(cnt) cnt.textContent = `${j.logs?.length||0} shown • ${j.total||0} total`;
    if(wrap){
      if(!j.logs?.length){ wrap.innerHTML='<div style="font-size:12px;color:#94A3B8;border:1px dashed #E2E8F0;border-radius:10px;padding:12px;text-align:center">No follow-ups sent yet — submit a test lead or chat, then Refresh. Instant sends appear here + in Outbox.</div>'; }
      else wrap.innerHTML = j.logs.map(l=> `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:8px 10px;background:#fff;display:flex;gap:8px;justify-content:space-between;align-items:start;flex-wrap:wrap"><div style="flex:1;min-width:200px"><div style="font-size:12px;font-weight:700">${(l.subject||'(no subject)').slice(0,90)}</div><div style="font-size:11px;color:#64748B">to <b>${l.email}</b> • <span style="background:#F1F5F9;border-radius:999px;padding:1px 6px">${l.kind}${l.day_number?` d${l.day_number}`:''}</span> • <span style="color:${l.status==='sent'?'#10B981':(l.status==='skipped'?'#F59E0B':'#F87171')}">${l.status}</span> • ${l.sent_at||''}${l.message_id?` • <small>${String(l.message_id).slice(0,16)}</small>`:''}${l.error?` • <small style="color:#F87171">${String(l.error).slice(0,80)}</small>`:''}</div></div><button data-delfu="${l.id}" title="Delete from backend + database" style="font-size:10px;border:1px solid #FECACA;color:#F87171;border-radius:999px;padding:3px 8px;background:#fff;cursor:pointer;flex-shrink:0">Delete</button></div>`).join('');
      wrap.querySelectorAll('[data-delfu]').forEach(b=> b.addEventListener('click', async()=>{
        if(!confirm('Delete this follow-up record from the backend and database (also removes its outbox copy)?')) return;
        b.textContent='...'; b.disabled=true;
        try{
          const r=await fetch('/api/admin/followups/logs/'+b.dataset.delfu,{method:'DELETE',headers:authHeaders()});
          const jj=await r.json().catch(()=>({}));
          if(!r.ok) throw new Error(jj.error||'Delete failed');
        }catch(e){ alert('Delete failed: '+e.message); }
        loadFollowupLogs(); loadFollowupStatus(); loadOutbox();
      }));
    }
  }catch(e){ const w=$('#followup-list'); if(w) w.innerHTML='<div style="color:#F87171;font-size:12px">Error: '+e.message+'</div>'; }
}
async function loadUnsubs(){
  try{
    const r = await fetch('/api/admin/followups/unsubscribes', { headers: authHeaders() });
    const j = await r.json();
    const wrap=$('#unsub-list');
    if(wrap){
      if(!j.length){ wrap.innerHTML='<small style="color:#94A3B8">No opt-outs.</small>'; return; }
      wrap.innerHTML = j.map(u=> `<div style="display:flex;gap:8px;align-items:center;font-size:11px;border:1px solid #E2E8F0;border-radius:8px;padding:4px 8px;background:#FFFBEB"><span style="flex:1">${u.email} <small style="color:#94A3B8">${u.created_at||''}</small></span><button data-resub="${u.email}" style="font-size:10px;border:1px solid #10B981;color:#10B981;border-radius:999px;padding:2px 8px;background:#fff;cursor:pointer">Resubscribe</button></div>`).join('');
      wrap.querySelectorAll('[data-resub]').forEach(b=> b.addEventListener('click', async()=>{
        if(!confirm('Resubscribe '+b.dataset.resub+'?')) return;
        await fetch('/api/admin/followups/unsubscribes/'+encodeURIComponent(b.dataset.resub), { method:'DELETE', headers: authHeaders() });
        loadUnsubs(); loadFollowupStatus();
      }));
    }
  }catch{}
}
$('#btn-save-followup')?.addEventListener('click', async()=>{
  const msg=$('#followup-msg');
  if(msg) msg.textContent='Saving...';
  try{
    const body = {
      followup_enabled: $('#fu-enabled')?.checked,
      followup_instant_enabled: $('#fu-instant')?.checked,
      followup_daily_enabled: $('#fu-daily')?.checked,
      followup_max_days: $('#fu-maxdays')?.value,
      followup_chat_idle_minutes: $('#fu-idle')?.value,
      followup_from_name: $('#fu-fromname')?.value
    };
    const r = await fetch('/api/admin/followups/settings', { method:'PUT', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Save failed');
    if(msg){ msg.innerHTML='<span style="color:#10B981">Saved ✓ — instant + daily follow-ups updated.</span>'; }
    loadFollowupStatus();
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
});
$('#btn-test-followup')?.addEventListener('click', async()=>{
  const msg=$('#followup-msg');
  if(msg) msg.textContent='Sending AI test follow-up to your Gmail...';
  try{
    const r = await fetch('/api/admin/followups/test', { method:'POST', headers: authHeaders() });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Send failed');
    if(msg) msg.innerHTML=`<span style="color:#10B981">Test sent ✓ to ${j.to} — subject: ${j.subject} ${j.ai?'(AI-generated)':'(template fallback — check Gemini key)'}. Check inbox + Logs below + Outbox.</span>`;
    loadFollowupLogs(); loadFollowupStatus();
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
});
$('#btn-run-daily')?.addEventListener('click', async()=>{
  const msg=$('#followup-msg');
  const dry = !confirm('Send daily follow-ups NOW?\n\nOK = actually SEND to due leads/chats\nCancel = dry-run preview only (no send)');
  if(msg) msg.textContent = dry ? 'Previewing audience (dry run)...' : 'Sending daily follow-ups...';
  try{
    const r = await fetch('/api/admin/followups/run-daily', { method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify({ dryRun: dry, limit: 50 }) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'Run failed');
    if(msg){
      if(j.dryRun) msg.innerHTML=`<span style="color:#64748B">Dry run: would send <b>${j.wouldSend}</b> (Day 2–${j.maxDays}). ${ (j.emails||[]).slice(0,5).map(e=>e.email).join(', ')||''}</span>`;
      else msg.innerHTML=`<span style="color:#10B981">Daily run done ✓ sent ${j.sent}, failed ${j.failed}, skipped ${j.skipped} (total ${j.total}). See Logs + Outbox.</span>`;
    }
    loadFollowupLogs(); loadFollowupStatus();
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
});
$('#btn-refresh-followup')?.addEventListener('click', ()=>{ loadFollowupStatus(); loadFollowupLogs(); });
$('#btn-clear-followup')?.addEventListener('click', async()=>{
  if(!confirm('Clear follow-up logs? This deletes the records (and their outbox copies) from the database. This cannot be undone.')) return;
  const msg=$('#followup-msg'); if(msg) msg.textContent='Clearing...';
  try{
    const r=await fetch('/api/admin/followups/logs',{method:'DELETE',headers:authHeaders()});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'Clear failed');
    if(msg) msg.innerHTML='<span style="color:#10B981">Cleared '+j.cleared+' log(s), '+j.outboxUnlinked+' outbox cop(ies) removed.</span>';
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
  loadFollowupStatus(); loadFollowupLogs(); loadOutbox();
});
$('#followup-search')?.addEventListener('input', ()=> loadFollowupLogs());
$('#followup-kind')?.addEventListener('change', ()=> loadFollowupLogs());
$('#btn-view-unsubs')?.addEventListener('click', loadUnsubs);
// Hook into campaigns tab load
const _origCampaignsTab = document.querySelector('.side-nav button[data-tab="campaigns"]');
_origCampaignsTab?.addEventListener('click', ()=>{ loadFollowupStatus(); loadFollowupLogs(); }, true);

$('#btn-refresh-stats').addEventListener('click', async()=>{
  const r=await fetch('/api/admin/refresh-stats',{method:'POST',headers:authHeaders()});
  if(r.ok){ alert('Stats refreshed'); loadOverview(); }
});
$('#btn-reset-defaults')?.addEventListener('click', async()=>{
  if(!confirm('Reset live site to DEFAULT content? This will overwrite hero, portfolio, pricing, etc. with the seeded defaults from code. Leads will be preserved. Continue?')) return;
  const r=await fetch('/api/admin/reset-defaults',{method:'POST',headers:authHeaders()});
  const j=await r.json().catch(()=>({}));
  if(r.ok){ alert('Defaults reseeded — refresh the public site to see changes'); await loadContent(); await loadMedia(); await loadTeam(); await loadSections(); await loadOverview(); }
  else alert('Reset failed: '+(j.error||r.statusText));
});

// ========== Backup & Restore — prove server-side saves in ANY browser ==========
async function loadBackupStatus(){
  try{
    const r = await fetch('/api/admin/backup/status', { headers: authHeaders() });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'failed');
    const pill = $('#backup-status-pill');
    if(pill){
      const total = Object.values(j.counts||{}).filter(v=>v>=0).reduce((a,b)=>a+b,0);
      pill.textContent = `Backend OK • ${total} records • disk ${j.usePg?'postgres':'sqlite:'+(j.dataDir||'local')} • ${j.fileBackups?.length||0} snapshots`;
      pill.style.color = '#10B981'; pill.style.borderColor = '#A7F3D0';
    }
    const wrap = $('#backup-saved-state');
    if(wrap){
      const c = j.counts||{}, s = j.secrets||{};
      const row = (k,v,ok)=> `<div style="display:flex;gap:8px;align-items:center;border:1px solid #E2E8F0;border-radius:8px;padding:4px 8px;background:#fff"><span style="flex:1">${k}</span><b style="color:${ok===false?'#F87171':'#10B981'}">${v}</b></div>`;
      let html = '';
      html += row('Content keys', (c.content??'?')+' saved', true);
      html += row('Leads (CRM)', (c.leads??'?')+' saved', true);
      html += row('Chat messages', (c.chat_messages??'?')+' saved', true);
      html += row('Follow-up emails sent', (c.followup_logs??'?')+' logged', true);
      for(const [k,v] of Object.entries(s)){
        const saved = String(v).includes('saved');
        html += row(k, v, saved);
      }
      wrap.innerHTML = html;
    }
    // download link needs auth header — fetch as blob instead of plain href
    const dl = $('#btn-backup-download');
    if(dl && !dl.dataset.wired){
      dl.dataset.wired = '1';
      dl.addEventListener('click', async (e)=>{
        e.preventDefault();
        const msg = $('#backup-msg'); if(msg) msg.textContent = 'Preparing download...';
        try{
          const rr = await fetch('/api/admin/backup/export', { headers: authHeaders() });
          if(!rr.ok) throw new Error('export failed');
          const blob = await rr.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'nexatech-backup-' + new Date().toISOString().slice(0,10) + '.json';
          a.click();
          setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
          if(msg) msg.innerHTML = '<span style="color:#10B981">Downloaded ✓ — keep this file to restore later from any browser.</span>';
        }catch(err){ if(msg) msg.textContent = 'Error: ' + err.message; }
      });
    }
    loadBackupFiles();
  }catch(e){ const p=$('#backup-status-pill'); if(p) p.textContent='Error: '+e.message; }
}
async function loadBackupFiles(){
  try{
    const r = await fetch('/api/admin/backup/files', { headers: authHeaders() });
    const j = await r.json();
    const wrap = $('#backup-files');
    if(!wrap) return;
    if(!j.files?.length){ wrap.innerHTML = '<small style="color:#94A3B8">No snapshots yet — click Save Snapshot Now. Nightly auto-snapshot at 03:30.</small>'; return; }
    wrap.innerHTML = j.files.map(f=> `<div style="display:flex;gap:8px;align-items:center;font-size:11px;border:1px solid #E2E8F0;border-radius:8px;padding:6px 8px;background:#F8FAFC"><span style="flex:1"><b>${f.file}</b> <small style="color:#94A3B8">${(f.size/1024).toFixed(1)}kb • ${f.modified||''}</small></span><button data-restore="${f.file}" style="font-size:10px;border:1px solid #10B981;color:#10B981;border-radius:999px;padding:3px 8px;background:#fff;cursor:pointer">Restore</button><button data-delbackup="${f.file}" style="font-size:10px;border:none;background:transparent;color:#F87171;cursor:pointer">Delete</button></div>`).join('');
    wrap.querySelectorAll('[data-restore]').forEach(b=> b.addEventListener('click', async()=>{
      if(!confirm('Restore snapshot '+b.dataset.restore+'? Current content is auto-backed-up first (reversible).')) return;
      const msg=$('#backup-msg'); if(msg) msg.textContent='Restoring...';
      const rr = await fetch('/api/admin/backup/files/'+encodeURIComponent(b.dataset.restore)+'/restore', { method:'POST', headers: authHeaders() });
      const jj = await rr.json().catch(()=>({}));
      if(msg) msg.innerHTML = rr.ok ? '<span style="color:#10B981">Restored ✓ — refresh the site to see it.</span>' : ('Error: '+(jj.error||'failed'));
      if(rr.ok){ await loadContent(); loadBackupStatus(); }
    }));
    wrap.querySelectorAll('[data-delbackup]').forEach(b=> b.addEventListener('click', async()=>{
      if(!confirm('Delete snapshot '+b.dataset.delbackup+'?')) return;
      await fetch('/api/admin/backup/files/'+encodeURIComponent(b.dataset.delbackup), { method:'DELETE', headers: authHeaders() });
      loadBackupFiles();
    }));
  }catch{}
}
$('#btn-backup-snapshot')?.addEventListener('click', async()=>{
  const msg=$('#backup-msg'); if(msg) msg.textContent='Saving snapshot...';
  try{
    const r = await fetch('/api/admin/backup/files', { method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify({}) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||'failed');
    if(msg) msg.innerHTML = `<span style="color:#10B981">Snapshot saved ✓ ${j.file} — visible in every browser.</span>`;
    loadBackupFiles(); loadBackupStatus();
  }catch(e){ if(msg) msg.textContent='Error: '+e.message; }
});
$('#btn-backup-refresh')?.addEventListener('click', ()=>{ loadBackupStatus(); });
$('#backup-restore-file')?.addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  if(!confirm('Restore from '+f.name+'? Current content is auto-backed-up first (reversible).')){ e.target.value=''; return; }
  const msg=$('#backup-msg'); if(msg) msg.textContent='Uploading + restoring...';
  try{
    const text = await f.text();
    const dump = JSON.parse(text);
    const r = await fetch('/api/admin/backup/import', { method:'POST', headers:{'Content-Type':'application/json', ...authHeaders()}, body: JSON.stringify(dump) });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||'restore failed');
    if(msg) msg.innerHTML='<span style="color:#10B981">Restored ✓ — refresh the site to see it.</span>';
    await loadContent(); loadBackupStatus();
  }catch(err){ if(msg) msg.textContent='Error: '+err.message; }
  e.target.value='';
});
// refresh backup state whenever Settings tab opens
document.querySelector('.side-nav button[data-tab="settings"]')?.addEventListener('click', ()=>{ loadBackupStatus(); }, true);

// Init
(async()=>{
  if(await checkAuth()){
    showApp(true);
    await loadAll();
  } else showApp(false);
})();
async function loadAll(){
  await loadContent();
  await loadMedia();
  await loadTeam();
  await loadSections();
  await loadOverview();
  // if on analytics tab preload
  // leads not loaded until tab
}

// Save integrations already handled
