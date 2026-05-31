const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
let state = { data:null, view:'daily', id:null, q:'' };
function b64bytes(s){ return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function esc(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clip(s,n=220){ s=(s||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1)+'…':s; }
function firstUser(session){ return (session.messages.find(m=>m.role==='user' && m.content)||{}).content || ''; }
function lastAssistant(session){ const a=session.messages.filter(m=>m.role==='assistant' && m.content); return (a[a.length-1]||{}).content || ''; }
async function decrypt(pass){
  const payload = await fetch('encrypted-data.json', {cache:'no-store'}).then(r => r.json());
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:b64bytes(payload.salt), iterations:payload.iterations, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const ct = new Uint8Array([...b64bytes(payload.ciphertext), ...b64bytes(payload.tag)]);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64bytes(payload.iv), tagLength:128}, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}
function route(view,id){ state.view=view; state.id=id||null; location.hash = id ? view+'/'+encodeURIComponent(id) : view; renderMain(); }
function parseHash(){ const h=location.hash.replace(/^#/,''); if(!h) return; const [v,...rest]=h.split('/'); state.view=v||'daily'; state.id=decodeURIComponent(rest.join('/'))||null; }
function sidebar(){
  const d=state.data; const days=d.daily_logs || []; const subjects=d.subjects || [];
  return '<aside class="sidebar"><div class="brand"><div class="orb">J</div><div><b>Hemant Wiki</b><span>Jarvis memory</span></div></div><label class="search"><span>Search</span><input id="search" value="'+esc(state.q)+'" placeholder="subjects, logs, sessions…"></label><div class="nav-block"><h4>Subjects</h4>'+subjects.map(s=>'<button class="nav-item '+(state.view==='subject'&&state.id===s.slug?'active':'')+'" data-view="subject" data-id="'+esc(s.slug)+'"><span>'+esc(titleCase(s.name))+'</span><small>'+s.count+'</small></button>').join('')+'</div><div class="nav-block"><h4>Recent Daily Logs</h4>'+days.map(day=>'<button class="nav-item '+(state.view==='daily'&&state.id===day.date?'active':'')+'" data-view="daily" data-id="'+esc(day.date)+'"><span>'+esc(day.date)+'</span><small>'+day.session_count+'</small></button>').join('')+'</div></aside>';
}
function titleCase(s){ return (s||'').replace(/\b\w/g, c => c.toUpperCase()); }
function shell(){
  const d=state.data;
  $('#app').innerHTML = sidebar() + '<section class="content"><header class="topbar"><button id="menu">☰</button><div><p class="eyebrow">Encrypted GitHub archive</p><h1 id="page-title">Memory Wiki</h1></div><div class="stats"><span>'+d.subjects.length+' subjects</span><span>'+d.daily_logs.length+' days</span><span>'+d.sessions.length+' sessions</span></div></header><div id="main-panel"></div></section>';
  $('#search').addEventListener('input', e=>{ state.q=e.target.value.toLowerCase(); renderMain(); });
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>route(b.dataset.view,b.dataset.id)));
  $('#menu').addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
}
function sessionCard(s, expanded=false){
  return '<article class="log-card" id="session-'+esc(s.id)+'"><div class="log-time">'+esc(s.started_at)+'</div><h3>'+esc(s.title)+'</h3><div class="facts"><span>'+s.message_count+' messages</span><span>'+s.tool_call_count+' tool calls</span><span>'+esc(s.source||'local')+'</span></div><div class="summary-grid"><div><b>Asked</b><p>'+esc(clip(firstUser(s),260))+'</p></div><div><b>Result</b><p>'+esc(clip(lastAssistant(s),320))+'</p></div></div><details '+(expanded?'open':'')+'><summary>Conversation details</summary><div class="transcript">'+s.messages.map(m=>'<div class="msg '+esc(m.role)+'"><b>'+esc(m.role)+' · '+esc(m.time)+'</b><p>'+esc(m.content).replace(/\n/g,'<br>')+'</p></div>').join('')+'</div></details></article>';
}
function filteredSessions(list){ if(!state.q) return list; return list.filter(s => (s.title+' '+s.text).toLowerCase().includes(state.q)); }
function renderMain(){
  parseHash(); if(!state.id && state.view==='daily') state.id=(state.data.daily_logs[0]||{}).date; if(!state.id && state.view==='subject') state.id=(state.data.subjects[0]||{}).slug;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===state.view && b.dataset.id===state.id));
  if(state.view==='subject') return renderSubject();
  if(state.view==='sessions') return renderSessions();
  return renderDaily();
}
function renderDaily(){
  const day = state.data.daily_logs.find(d=>d.date===state.id) || state.data.daily_logs[0];
  const sessionsById = Object.fromEntries(state.data.sessions.map(s=>[s.id,s]));
  const sessions = filteredSessions(day.sessions.map(x=>sessionsById[x.id]).filter(Boolean));
  $('#page-title').textContent = day.date + ' Daily Log';
  $('#main-panel').innerHTML = '<section class="hero-log"><div><p class="date-label">'+esc(day.date)+'</p><h2>'+weekday(day.date)+' Wrap-Up</h2><p>Readable summary of what we worked on together, with details one click away.</p></div><div class="hero-metrics"><b>'+sessions.length+'</b><span>sessions shown</span><b>'+day.message_count+'</b><span>messages</span></div></section><section class="keywords">'+day.keywords.map(k=>'<span>'+esc(k)+'</span>').join('')+'</section><section class="timeline">'+sessions.map(s=>sessionCard(s,false)).join('')+'</section>';
}
function weekday(date){ try{return new Date(date+'T00:00:00Z').toLocaleDateString(undefined,{weekday:'long'});}catch(e){return ''} }
function renderSubject(){
  const sub = state.data.subjects.find(s=>s.slug===state.id) || state.data.subjects[0];
  const sessionsById = Object.fromEntries(state.data.sessions.map(s=>[s.id,s]));
  const sessions = filteredSessions(sub.sessions.map(x=>sessionsById[x.id]).filter(Boolean));
  $('#page-title').textContent = titleCase(sub.name);
  $('#main-panel').innerHTML = '<section class="hero-log subject"><div><p class="date-label">Subject</p><h2>'+esc(titleCase(sub.name))+'</h2><p>'+esc(sub.summary)+'</p></div><div class="hero-metrics"><b>'+sessions.length+'</b><span>sessions</span></div></section><section class="timeline">'+sessions.map(s=>sessionCard(s,false)).join('')+'</section>';
}
function renderSessions(){
  const sessions = filteredSessions(state.data.sessions);
  $('#page-title').textContent = 'All Sessions';
  $('#main-panel').innerHTML = '<section class="timeline">'+sessions.map(s=>sessionCard(s,false)).join('')+'</section>';
}
$('#btn').addEventListener('click', async () => {
  $('#status').textContent = 'Decrypting…';
  try { state.data = await decrypt($('#pass').value); $('#unlock').hidden = true; $('#app').hidden = false; parseHash(); if(!state.view) state.view='daily'; shell(); renderMain(); }
  catch(e){ $('#status').textContent = 'Unlock failed. Check the passphrase.'; console.error(e); }
});
$('#pass').addEventListener('keydown', e => { if(e.key === 'Enter') $('#btn').click(); });