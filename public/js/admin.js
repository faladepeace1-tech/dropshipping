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
    webhook_form_enabled: String($('#int-webhook-form-enabled')?.checked || false),
    webhook_chatbot_url: $('#int-webhook-bot')?.value || '',
    webhook_chatbot_enabled: String($('#int-webhook-bot-enabled')?.checked || false)
  };
  // sync whatsapp_link automatically
  if(payload.whatsapp_number) payload.whatsapp_link = 'https://wa.me/' + payload.whatsapp_number.replace(/\D/g,'');
  const r=await fetch('/api/content',{method:'PUT',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify(payload)});
  const j=await r.json();
  $('#int-msg').textContent=r.ok?'Saved   webhooks and contact updated instantly.':(j.error||'Failed');
  if(r.ok) await loadContent();
});
// Webhook test — send mock data (per owner request)
async function testWebhook(type){
  const btnMap = {form:'btn-test-webhook-form', chat:'btn-test-webhook-chat', all:'btn-test-webhook-all'};
  const btn = document.getElementById(btnMap[type]||btnMap.all);
  const out = $('#webhook-test-result');
  if(btn){ btn.disabled=true; const orig=btn.textContent; btn.textContent='Testing...'; out.style.display='block'; out.textContent='Sending mock '+type+' payload...'; }
  try{
    const r=await fetch('/api/admin/webhook-test',{method:'POST',headers:{'Content-Type':'application/json', ...authHeaders()},body:JSON.stringify({type})});
    const j=await r.json();
    if(out){ out.style.display='block'; out.textContent = JSON.stringify(j, null, 2); }
    if(!r.ok) $('#int-msg').textContent = j.error||'Webhook test failed';
    else $('#int-msg').textContent = 'Webhook test sent — see result below';
  }catch(e){ if(out){ out.style.display='block'; out.textContent='Error: '+e.message; } }
  finally{ if(btn){ btn.disabled=false; btn.textContent = type==='form'?'Test Form Webhook →': type==='chat'?'Test Chat Webhook →':'Test All Webhooks'; } }
}
$('#btn-test-webhook-form')?.addEventListener('click', ()=> testWebhook('form'));
$('#btn-test-webhook-chat')?.addEventListener('click', ()=> testWebhook('chat'));
$('#btn-test-webhook-all')?.addEventListener('click', ()=> testWebhook('all'));
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
