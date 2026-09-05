// Admin App
const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];
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
  if(tab==='campaigns'){ loadCampaigns(); loadTemplates(); loadGmailStatus(); loadOutbox(); }
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
  ],
  hero: [
    {key:'hero_title', label:'Hero Title'},
    {key:'hero_subtitle', label:'Hero Subtitle', type:'textarea'},
    {key:'hero_cta_primary', label:'Hero CTA Primary'},
    {key:'hero_cta_secondary', label:'Hero CTA Secondary'},
    {key:'hero_badge', label:'Hero Badge (template with {remaining})'},
  ],
  social: [
    {key:'social_proof_title', label:'Social Proof Title'},
  ],
  portfolio: [
    {key:'portfolio_title', label:'Portfolio Title'},
    {key:'portfolio_subtitle', label:'Portfolio Subtitle', type:'textarea'},
  ],
  proof: [
    {key:'sales_proof_title', label:'Sales Proof Title'},
    {key:'sales_proof_subtitle', label:'Sales Proof Subtitle', type:'textarea'},
  ],
  experts: [
    {key:'experts_title', label:'Experts Title'},
    {key:'experts_subtitle', label:'Experts Subtitle', type:'textarea'},
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
    {key:'mentorship_price', label:'Mentorship Price'},
    {key:'mentorship_bullets', label:'Mentorship Bullets (one per line, text format)', type:'textarea'},
    {key:'pricing_mentorship_whatsapp', label:'Mentorship WhatsApp Message', type:'textarea'},
  ],
  testimonials: [
    {key:'testimonials_title', label:'Testimonials Title'},
    {key:'testimonials_subtitle', label:'Testimonials Subtitle', type:'textarea'},
  ],
  reviews: [
    {key:'reviews_title', label:'Reviews Wall Title'},
    {key:'reviews_subtitle', label:'Reviews Wall Subtitle (include 2550×1650 note)', type:'textarea'},
  ],
  certificates: [
    {key:'certificates_title', label:'Certificates & Awards Title'},
    {key:'certificates_subtitle', label:'Certificates Subtitle', type:'textarea'},
  ],
  faq: [
    {key:'faq_title', label:'FAQ Title'},
    {key:'faq_subtitle', label:'FAQ Subtitle', type:'textarea'},
    {key:'faq_items', label:'FAQ Items (JSON array of {q,a})', type:'textarea'},
  ],
  cta: [
    {key:'cta_band_title', label:'CTA Band Title'},
    {key:'cta_band_subtitle', label:'CTA Band Subtitle', type:'textarea'},
  ],
  footer: [
    {key:'footer_email', label:'Footer Email'},
    {key:'footer_phone', label:'Footer Phone'},
    {key:'footer_address', label:'Footer Address'},
    {key:'footer_copyright', label:'Footer Copyright'},
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
      input=document.createElement('textarea'); input.rows=4; input.value=displayVal;
      if(listKeys.includes(field.key)) input.placeholder = 'One item per line — text format';
    } else if(field.type==='image_upload'){
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
  });
}
$('#content-tabs').addEventListener('click', e=>{
  if(e.target.dataset.ctab){
    $$('#content-tabs button').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    currentCTab=e.target.dataset.ctab;
    renderContentForms();
  }
});

async function loadContent(){
  const r=await fetch('/api/content'); const j=await r.json();
  CONTENT=j.content;
  lastPublishedContent=JSON.parse(JSON.stringify(CONTENT));
  // scarcity
  $('#scarcity-total').value=CONTENT.scarcity_slots_total||10;
  $('#scarcity-label').value=CONTENT.scarcity_label||'Only {remaining} build slots left this month';
  $('#int-wa').value=CONTENT.whatsapp_number||'';
  const emailEl=$('#int-email'); if(emailEl) emailEl.value=CONTENT.footer_email||'';
  const phoneEl=$('#int-phone'); if(phoneEl) phoneEl.value=CONTENT.footer_phone||'';
  $('#int-calendly').value=CONTENT.calendly_url||'';
  $('#int-webhook').value=CONTENT.webhook_url||'';
  $('#int-webhook-enabled').checked=String(CONTENT.webhook_enabled)==='true';
  const formEl=$('#int-webhook-form'); if(formEl) formEl.value=CONTENT.webhook_form_url||'';
  const formEn=$('#int-webhook-form-enabled'); if(formEn) formEn.checked=String(CONTENT.webhook_form_enabled)==='true';
  const botEl=$('#int-webhook-bot'); if(botEl) botEl.value=CONTENT.webhook_chatbot_url||'';
  const botEn=$('#int-webhook-bot-enabled'); if(botEn) botEn.checked=String(CONTENT.webhook_chatbot_enabled)==='true';
  renderContentForms();
}
$('#btn-save-content').addEventListener('click', async()=>{
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
  // also include color text inputs (secondary)
  // find theme colors text values
  $$('#content-forms input[type="text"]').forEach(()=>{});
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
  const j=await r.json();
  $('#content-msg').textContent = r.ok ? 'Saved   preview updates instantly.' : (j.error||'Save failed');
  if(r.ok) await loadContent();
});
$('#btn-save-scarcity').addEventListener('click', async()=>{
  const total=$('#scarcity-total').value;
  const label=$('#scarcity-label').value;
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({scarcity_slots_total:total, scarcity_label:label})});
  if(r.ok) alert('Scarcity saved');
});
$('#btn-save-integrations').addEventListener('click', async()=>{
  const payload={
    whatsapp_number: $('#int-wa').value,
    footer_email: $('#int-email')?.value || CONTENT.footer_email,
    footer_phone: $('#int-phone')?.value || CONTENT.footer_phone,
    calendly_url: $('#int-calendly').value,
    webhook_url: $('#int-webhook').value,
    webhook_enabled: String($('#int-webhook-enabled').checked),
    webhook_form_url: $('#int-webhook-form')?.value || '',
    webhook_form_enabled: String($('#int-webhook-form-enabled')?.checked || false)
  };
  // sync whatsapp_link automatically
  if(payload.whatsapp_number) payload.whatsapp_link = 'https://wa.me/' + payload.whatsapp_number.replace(/\D/g,'');
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
  const j=await r.json();
  $('#int-msg').textContent=r.ok?'Saved ✓ closed until you click Edit again':(j.error||'Failed');
  if(r.ok){ await loadContent(); const d=document.getElementById('details-contact'); if(d) d.open=false; }
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
    if(el){
      if(j.dbHas) el.textContent = `Key set ✓ ${j.masked} via db (saved permanently), model: ${j.model}`;
      else if(j.envHas) el.textContent = `Key set (${j.masked||'env'} via env, model: ${j.model}) — also save in DB to persist`;
      else el.textContent = 'No key set — chatbot disabled, paste Gemini key above (AQ.Ab8... or AIza...)';
      el.style.color = j.dbHas ? '#10B981' : (j.envHas ? '#64748B' : '#F87171');
    }
    const sumEl=$('#gemini-summary-status');
    if(sumEl){
      if(j.dbHas) { sumEl.textContent=`${j.masked} ✓ saved permanently`; sumEl.style.color='#10B981'; }
      else if(j.envHas) { sumEl.textContent='env only — save to persist'; sumEl.style.color='#F59E0B'; }
      else { sumEl.textContent='not set'; sumEl.style.color='#F87171'; }
    }
    const modelEl=$('#int-gemini-model');
    if(modelEl){
      modelEl.placeholder = j.model || 'gemini-2.5-flash';
      if(j.dbModel) modelEl.value = '';
    }
  }catch{}
}
// Integrations accordion — only one open at a time, closed by default (backend only, save & close)
(function(){
  const ids=['details-contact','details-google','details-gemini','details-theme'];
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
$('#btn-show-gemini-key')?.addEventListener('click', ()=>{
  const inp=$('#int-gemini-key');
  if(inp) inp.type = inp.type==='password' ? 'text' : 'password';
});
$('#btn-save-gemini')?.addEventListener('click', async()=>{
  const key=$('#int-gemini-key')?.value || '';
  const model=$('#int-gemini-model')?.value || '';
  if(!key.trim() && !model.trim()){ $('#gemini-msg').textContent='Paste a key (AQ.Ab8... or AIza...) or model first'; return; }
  const btn=$('#btn-save-gemini'); if(btn) btn.disabled=true;
  $('#gemini-msg').textContent='Saving...';
  try{
    const r=await fetch('/api/admin/gemini-key',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({key, model})});
    const j=await r.json();
    if(r.ok){
      $('#gemini-msg').innerHTML = j.dbHas ? `<span style="color:#10B981">✓ Saved permanently in backend ✓ ${j.masked} — closed until you click Edit again</span>` : (j.message||'Saved');
      $('#int-gemini-key').value='';
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
    $('#gemini-msg').textContent = r.ok ? 'Gemini test succeeded' : (j.error||'Gemini test failed');
  }catch(e){ if(out) out.textContent='Error: '+e.message; }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Test Gemini →'; } }
});
loadGeminiStatus();
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
    const pos = CONTENT.logo_position || CONTENT.brand_position || 'brand_first';
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
    // live preview order — brand name at front of logo
    const liveWrap=$('#brand-live-preview');
    if(liveWrap){
      // brand_first = Brand + Mark, logo_first = Mark + Brand
      if(pos==='logo_first'){ liveWrap.style.flexDirection='row'; liveWrap.innerHTML=''; liveWrap.appendChild(liveMark); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(liveText); }
      else { liveWrap.style.flexDirection='row'; liveWrap.innerHTML=''; liveWrap.appendChild(liveText); liveWrap.appendChild(document.createTextNode(' ')); liveWrap.appendChild(liveMark); }
    }
    // also update admin sidebar brand preview if exists
  }catch(e){ console.error('loadBrand',e); }
}
async function saveBrand(){
  const brandName=$('#brand-name')?.value?.trim() || '';
  const logoUrl=$('#brand-logo-url')?.value?.trim() || '';
  const faviconUrl=$('#brand-favicon-url')?.value?.trim() || '';
  const pos=$('#brand-position')?.value || 'brand_first';
  const payload={};
  if(brandName) payload.logo_text=brandName;
  if(logoUrl) payload.logo_url=logoUrl;
  if(faviconUrl) payload.favicon_url=faviconUrl;
  payload.logo_position=pos;
  payload.brand_position=pos; // alias
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));
  const msgEl=$('#brand-msg');
  if(r.ok){ if(msgEl) msgEl.innerHTML='<span style="color:#10B981">Brand saved ✓ — logo in logo-mark, brand name at front, favicon updated (backend only)</span>'; await loadContent(); await loadBrand(); }
  else { if(msgEl) msgEl.textContent=j.error||'Save failed'; }
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
    div.innerHTML=`<div><b style="font-size:11px">${s.email}</b> <span style="font-size:11px;color:#64748B">${s.campaign_name||'1:1'}</span><div style="font-size:10px;color:#94A3B8">${s.campaign_subject||''} • ${String(s.sent_at||'').slice(0,16)}</div></div><span style="font-size:10px;background:${col};color:#fff;padding:2px 6px;border-radius:999px">${s.status}</span>`;
    wrap.appendChild(div);
  });
}
$('#btn-refresh-outbox')?.addEventListener('click', loadOutbox);
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
$('#btn-publish').addEventListener('click', ()=>{ alert('Changes are live instantly   no draft queue. (This button confirms publish.)'); window.open('/','_blank'); });
$('#btn-revert').addEventListener('click', async()=>{
  if(!lastPublishedContent) return alert('No snapshot');
  if(!confirm('Revert to last published snapshot?')) return;
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(lastPublishedContent)});
  if(r.ok){ alert('Reverted'); await loadContent(); } else alert('Revert failed');
});

// Media
let currentMediaTab='portfolio';
function updateMediaHint(){
  const hint=$('#media-hint'); const txt=$('#media-hint-text');
  if(!hint||!txt) return;
  if(currentMediaTab==='reviews'){
    hint.style.display='block';
    txt.innerHTML='For <b>Review Screenshots</b> please upload landscape images/videos at <b>2550 × 1650 px</b> (aspect 1.545). This keeps every review card pixel-perfect and prevents cropping. Videos should also be landscape (same ratio) and will autoplay muted on hover.';
  } else if(currentMediaTab==='testimonials'){
    hint.style.display='block';
    txt.textContent='Testimonials: use short quotes with small avatar. For large review screenshots use Review Screenshots tab.';
  } else if(currentMediaTab==='portfolio'){
    hint.style.display='block';
    txt.textContent='Portfolio supports any ratio but 16:10 works best. Videos autoplay muted on hover.';
  } else if(currentMediaTab==='certificates'){
    hint.style.display='block';
    txt.innerHTML='For <b>Certificates & Awards</b> upload image files (PNG/JPG/PDF preview as image). Recommended <b>4:3</b> or square, max 5MB. These appear in the homepage Certificates section.';
  } else {
    hint.style.display='none';
  }
}
$('#media-tabs').addEventListener('click', e=>{
  if(e.target.dataset.mtab){
    $$('#media-tabs button').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    currentMediaTab=e.target.dataset.mtab;
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
function renderMediaGallery(){
  const g=$('#media-gallery'); g.innerHTML='';
  const filtered = MEDIA; // already filtered by type
  filtered.forEach(item=>{
    const div=document.createElement('div');
    div.draggable=true;
    div.dataset.id=item.id;
    div.style.cssText='background:#0B1220;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;display:flex;flex-direction:column';
    const isVideo=item.url.match(/\.(mp4|webm|mov)$/i);
    const ratio = (currentMediaTab==='reviews' ? '2550/1650' : '4/3');
    div.innerHTML=`
      <div style="aspect-ratio:${ratio};overflow:hidden;background:#132238;position:relative">
        ${isVideo?`<video src="${item.url}" muted style="width:100%;height:100%;object-fit:cover"></video><span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:4px 6px;border-radius:999px">VIDEO</span>`:`<img src="${item.url}" style="width:100%;height:100%;object-fit:cover">`}
        <span style="position:absolute;left:8px;top:8px;background:${item.published?'#10B981':'#64748B'};color:#fff;font-size:10px;padding:3px 6px;border-radius:999px">${item.published?'LIVE':'DRAFT'}</span>
      </div>
      <div style="padding:10px;display:grid;gap:6px">
        <b style="font-size:13px">${item.caption||'(no caption)'}</b>
        <small style="color:#94A3B8">${item.category||' '} • ${item.result_stat||''}</small>
        <small style="color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.url}</small>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
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
  g.querySelectorAll('[data-toggle]').forEach(b=> b.addEventListener('click', async()=>{
    const id=b.dataset.toggle;
    const it=MEDIA.find(m=>String(m.id)===String(id));
    const r=await fetch('/api/media/'+id,{method:'PATCH',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({published: it.published?0:1})});
    if(r.ok) loadMedia();
  }));
  g.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', async()=>{
    if(!confirm('Delete this media?')) return;
    const r=await fetch('/api/media/'+b.dataset.del,{method:'DELETE',headers:authHeaders()});
    if(r.ok) loadMedia();
  }));
}

// preview on file select
$('input[name="file"]').addEventListener('change', e=>{
  const f=e.target.files[0];
  if(!f) return;
  const url=URL.createObjectURL(f);
  $('#media-preview').style.display='block';
  $('#media-preview-img').src=url;
  $('#media-preview-meta').textContent=`${f.name} • ${(f.size/1024).toFixed(1)} KB • ${f.type}`;
});
$('input[name="url"]').addEventListener('input', e=>{
  const v=e.target.value.trim();
  if(v){ $('#media-preview').style.display='block'; $('#media-preview-img').src=v; $('#media-preview-meta').textContent=v; }
});

// upload with progress (XHR)
$('#media-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const file=fd.get('file');
  const url=fd.get('url');
  // validation: either file or url
  if((!file || file.size===0) && !url) return alert('Provide a file or URL');
  $('#upload-progress').style.display='block';
  $('#upload-bar').style.width='10%';
  $('#upload-text').textContent='Uploading...';
  try{
    // Use XHR for progress if file
    if(file && file.size>0){
      await new Promise((resolve, reject)=>{
        const xhr=new XMLHttpRequest();
        xhr.open('POST','/api/media');
        xhr.setRequestHeader('Authorization','Bearer '+token);
        xhr.upload.onprogress = ev=>{ if(ev.lengthComputable){ const pct=Math.round(ev.loaded/ev.total*100); $('#upload-bar').style.width=pct+'%'; $('#upload-text').textContent=pct+'%'; } };
        xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300) resolve(xhr.response); else reject(new Error(xhr.responseText||'Upload failed')); };
        xhr.onerror=()=> reject(new Error('Network error'));
        xhr.send(fd);
      });
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
    }
    $('#upload-bar').style.width='100%'; $('#upload-text').textContent='Done';
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
    <label>Caption<input id="em-caption" value="${it.caption||''}"></label>
    <label>Category<input id="em-category" value="${it.category||''}"></label>
    <label>URL<input id="em-url" value="${it.url||''}"></label>
    <label>Alt text<input id="em-alt" value="${it.alt_text||''}"></label>
    <label>Tags<input id="em-tags" value="${it.tags||''}"></label>
    <label>Result stat<input id="em-result" value="${it.result_stat||''}"></label>
    <label>Case study text<textarea id="em-case" rows="3">${it.case_study_text||''}</textarea></label>
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
  const file=$('#em-file').files[0];
  if(file) fd.append('file', file);
  const r=await fetch('/api/media/'+editingMediaId, {method:'PATCH', headers: authHeaders(), body: fd});
  if(r.ok){ document.getElementById('edit-media-dialog').close(); loadMedia(); } else alert('Save failed');
});

// Team
async function loadTeam(){
  const r=await fetch('/api/team', {headers: authHeaders()});
  TEAM=await r.json();
  const list=$('#team-list'); list.innerHTML='';
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
    <label>Name<input id="et-name" value="${it.name||''}"></label>
    <label>Role<input id="et-role" value="${it.role||''}"></label>
    <label>Credibility note<input id="et-note" value="${it.credibility_note||''}"></label>
    <label>Photo URL<input id="et-photo" value="${it.photo_url||''}"></label>
    <label>Replace photo<input type="file" id="et-file" accept="image/*"></label>
    <label>Social URL<input id="et-social" value="${it.social_url||''}"></label>
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
    let html='<table><tr><th>Name</th><th>Store</th><th>Niche</th><th>WhatsApp</th><th>Email</th><th>Status</th><th>Webhook</th><th>Created</th></tr>';
    LEADS.forEach(l=>{
      html+=`<tr><td>${l.name||''} ${l.wasScammed==='yes'?'<span style="background:#F59E0B;color:#fff;padding:2px 6px;border-radius:999px;font-size:10px">High Empathy</span>':''}</td><td>${l.storeName||''}</td><td>${l.preferredNiche||''}</td><td>${l.whatsapp||''}</td><td>${l.email||''}</td><td>${l.pipeline_stage||''}</td><td>${l.webhook_status||''} (${l.webhook_attempts||0})</td><td>${(l.created_at||'').slice(0,16)}</td></tr>`;
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
}
$('#lead-search').addEventListener('input', debounce(loadLeads, 400));
$('#lead-stage-filter').addEventListener('change', loadLeads);
$('#lead-scam-filter').addEventListener('change', loadLeads);
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

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
