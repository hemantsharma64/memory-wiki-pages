const $ = s => document.querySelector(s);
const enc = new TextEncoder();
let DATA = null;
let STATE = { section:'daily', id:null, query:'' };
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function b64bytes(s){ return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function titleCase(s){ return String(s||'').replace(/\b\w/g, m => m.toUpperCase()); }
function compact(text, n=340){ text=String(text||'').replace(/\s+/g,' ').trim(); return text.length>n ? text.slice(0,n-1)+'…' : text; }
function firstUser(s){ return (s.messages.find(m => m.role==='user' && m.content)||{}).content || ''; }
function lastAssistant(s){ const a=s.messages.filter(m => m.role==='assistant' && m.content); return (a[a.length-1]||{}).content || ''; }
function timeOnly(t){ const m=String(t||'').match(/(\d\d:\d\d)/); return m ? m[1] : ''; }
function niceDate(d){ try { return new Date(d+'T00:00:00Z').toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric', year:'numeric'}); } catch { return d; } }
function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label || 'Operation timed out')), ms))
  ]);
}
async function decrypt(pass){
  if(!pass) throw new Error('Enter the passphrase.');
  if(!crypto.subtle) throw new Error('This browser does not support WebCrypto. Try Chrome, Safari, or Firefox.');
  const payload = await withTimeout(fetch('encrypted-data.json?ts=' + Date.now(), {cache:'no-store'}).then(r => {
    if(!r.ok) throw new Error('Could not download encrypted archive.');
    return r.json();
  }), 12000, 'Network timed out while downloading the archive.');
  const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await withTimeout(crypto.subtle.deriveKey({name:'PBKDF2', salt:b64bytes(payload.salt), iterations:payload.iterations, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['decrypt']), 12000, 'Password check timed out. Reload and try again.');
  const ct = new Uint8Array([...b64bytes(payload.ciphertext), ...b64bytes(payload.tag)]);
  const plain = await withTimeout(crypto.subtle.decrypt({name:'AES-GCM', iv:b64bytes(payload.iv), tagLength:128}, key, ct), 12000, 'Decryption timed out. Reload and try again.');
  return JSON.parse(new TextDecoder().decode(plain));
}
function parseHash(){
  const h = location.hash.replace(/^#/,'');
  if(!h) return;
  const [section, ...rest] = h.split('/');
  STATE.section = section || 'daily';
  STATE.id = decodeURIComponent(rest.join('/')) || null;
}
function go(section,id){ STATE.section=section; STATE.id=id; location.hash = section + (id ? '/' + encodeURIComponent(id) : ''); render(); }
function sessionById(){ return Object.fromEntries(DATA.sessions.map(s => [s.id, s])); }
function sessionText(s){ return (s.title+' '+s.text).toLowerCase(); }
function passesQuery(s){ return !STATE.query || sessionText(s).includes(STATE.query); }
function buildShell(){
  $('#app').innerHTML = '<aside class="left"><div class="product"><div class="logo">J</div><div><strong>Jarvis</strong><span>Memory Wiki</span></div></div><button class="new-goal" data-go="home">/goal overview</button><label class="search"><span>Search archive</span><input id="q" placeholder="Search work, repos, subjects…"></label><nav><p>Daily logs</p><div id="day-nav"></div><p>Subjects</p><div id="subject-nav"></div></nav><div class="backup-note"><b>GitHub backed up</b><span>Daily markdown + JSON are committed to the private repo.</span></div></aside><main class="page"><div class="mobilebar"><button id="hamb">☰</button><b>Memory Wiki</b></div><div id="view"></div></main>';
  $('#day-nav').innerHTML = DATA.daily_logs.map(d => '<button class="navlink" data-kind="daily" data-id="'+esc(d.date)+'"><span>'+esc(d.date)+'</span><small>'+d.session_count+'</small></button>').join('');
  $('#subject-nav').innerHTML = DATA.subjects.map(s => '<button class="navlink" data-kind="subject" data-id="'+esc(s.slug)+'"><span>'+esc(titleCase(s.name))+'</span><small>'+s.count+'</small></button>').join('');
  document.querySelectorAll('.navlink').forEach(b => b.addEventListener('click', () => go(b.dataset.kind, b.dataset.id)));
  $('.new-goal').addEventListener('click', () => go('home',''));
  $('#q').addEventListener('input', e => { STATE.query = e.target.value.toLowerCase().trim(); render(); });
  $('#hamb').addEventListener('click', () => document.body.classList.toggle('menu-open'));
}
function hero(title, eyebrow, subtitle, stats){
  return '<section class="hero"><div><div class="mini-label">'+esc(eyebrow)+'</div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div><div class="metric-stack">'+stats.map(x => '<div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>').join('')+'</div></section>';
}
function sessionCard(s){
  return '<article class="entry"><div class="entry-time">'+esc(timeOnly(s.started_at))+'</div><div class="entry-body"><div class="entry-head"><div><p class="mini-label">session</p><h3>'+esc(s.title)+'</h3></div><div class="chips"><span>'+s.message_count+' messages</span><span>'+s.tool_call_count+' tools</span></div></div><div class="summary-pair"><section><b>What you asked</b><p>'+esc(compact(firstUser(s), 360))+'</p></section><section><b>What Jarvis did</b><p>'+esc(compact(lastAssistant(s), 420))+'</p></section></div><details><summary>Open full conversation</summary><div class="transcript">'+s.messages.map(m => '<div class="bubble '+esc(m.role)+'"><strong>'+esc(m.role)+' · '+esc(m.time)+'</strong><p>'+esc(m.content).replace(/\n/g,'<br>')+'</p></div>').join('')+'</div></details></div></article>';
}
function renderHome(){
  const latest = DATA.daily_logs[0];
  const top = DATA.subjects.slice(0,6);
  $('#view').innerHTML = hero('Memory command center','/goal overview','A readable dashboard for everything Hemant and Jarvis have worked on together.',[[DATA.daily_logs.length,'daily logs'],[DATA.subjects.length,'subjects'],[DATA.sessions.length,'sessions']]) + '<section class="section-title"><h2>Continue from latest day</h2><button onclick="go(\'daily\',\''+esc(latest.date)+'\')">Open '+esc(latest.date)+'</button></section><div class="subject-grid">'+top.map(s => '<button class="subject-card" onclick="go(\'subject\',\''+esc(s.slug)+'\')"><span>'+s.count+' sessions</span><b>'+esc(titleCase(s.name))+'</b><p>'+esc(compact(s.summary,150))+'</p></button>').join('')+'</div>';
}
function renderDaily(){
  if(!STATE.id) STATE.id = DATA.daily_logs[0]?.date;
  const day = DATA.daily_logs.find(d => d.date===STATE.id) || DATA.daily_logs[0];
  const by = sessionById();
  const sessions = day.sessions.map(x => by[x.id]).filter(Boolean).filter(passesQuery);
  const summary = '<section class="day-summary"><div><p class="mini-label">day summary</p><h2>What happened today</h2><p>'+esc(day.summary || 'Summary will appear after the next rebuild.')+'</p></div><ul>'+((day.highlights||[]).map(h => '<li>'+esc(h)+'</li>').join('') || '<li>No highlights yet.</li>')+'</ul></section>';
  $('#view').innerHTML = hero(niceDate(day.date), 'daily log', 'A quick executive summary first, then readable work cards if you need the detail.', [[sessions.length,'shown'],[day.message_count,'messages'],[day.tool_call_count,'tool calls']]) + summary + '<section class="keywords">'+day.keywords.map(k => '<span>'+esc(k)+'</span>').join('')+'</section><section class="timeline">'+sessions.map(sessionCard).join('')+'</section>';
}
function renderSubject(){
  if(!STATE.id) STATE.id = DATA.subjects[0]?.slug;
  const subject = DATA.subjects.find(s => s.slug===STATE.id) || DATA.subjects[0];
  const by = sessionById();
  const sessions = subject.sessions.map(x => by[x.id]).filter(Boolean).filter(passesQuery);
  $('#view').innerHTML = hero(titleCase(subject.name), 'subject', subject.summary, [[sessions.length,'sessions'],[subject.mentions || subject.count,'mentions']]) + '<section class="timeline compact">'+sessions.map(sessionCard).join('')+'</section>';
}
function render(){
  parseHash();
  if(!DATA) return;
  document.querySelectorAll('.navlink').forEach(b => b.classList.toggle('active', b.dataset.kind===STATE.section && b.dataset.id===STATE.id));
  if(STATE.section==='home') renderHome(); else if(STATE.section==='subject') renderSubject(); else renderDaily();
  document.body.classList.remove('menu-open');
}
$('#btn').addEventListener('click', async () => {
  $('#status').textContent = 'Decrypting archive…';
  $('#btn').disabled = true;
  try { DATA = await decrypt($('#pass').value.trim()); $('#unlock').hidden = true; $('#app').hidden = false; parseHash(); if(!STATE.id && STATE.section==='daily') STATE.id = DATA.daily_logs[0]?.date; buildShell(); render(); }
  catch(e){ $('#status').textContent = e && e.message ? e.message : 'Unlock failed. Check the passphrase.'; console.error(e); }
  finally { $('#btn').disabled = false; }
});
$('#pass').addEventListener('keydown', e => { if(e.key==='Enter') $('#btn').click(); });