const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
function b64bytes(s){ return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function esc(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function decrypt(pass){
  const payload = await fetch('encrypted-data.json', {cache:'no-store'}).then(r => r.json());
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:b64bytes(payload.salt), iterations:payload.iterations, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const ct = new Uint8Array([...b64bytes(payload.ciphertext), ...b64bytes(payload.tag)]);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64bytes(payload.iv), tagLength:128}, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}
function sessionLink(s){ return '<a href="#session-'+esc(s.id)+'">'+esc(s.title)+'</a>'; }
function render(data){
  const app = $('#app');
  const subjects = data.subjects.map(function(s){
    return '<div class="tile" id="subject-'+esc(s.slug)+'"><h3>'+esc(s.name.toUpperCase())+'</h3><p>'+esc(s.summary)+'</p><small>'+s.count+' session(s)</small><ul>'+s.sessions.map(function(x){return '<li>'+sessionLink(x)+' · '+esc(x.date)+'</li>';}).join('')+'</ul></div>';
  }).join('');
  const days = data.daily_logs.map(function(d){
    return '<div class="tile" id="daily-'+esc(d.slug)+'"><h3>'+esc(d.date)+'</h3><p>'+d.session_count+' session(s), '+d.message_count+' messages</p><p class="muted">Keywords: '+esc(d.keywords.join(', '))+'</p><ul>'+d.sessions.map(function(s){return '<li>'+sessionLink(s)+'</li>';}).join('')+'</ul></div>';
  }).join('');
  const sessions = data.sessions.map(function(s){
    return '<article class="session" id="session-'+esc(s.id)+'"><h3>'+esc(s.title)+'</h3><p class="muted">'+esc(s.started_at)+' · '+s.message_count+' messages · '+s.tool_call_count+' tool calls</p>'+s.messages.map(function(m){return '<div class="msg '+esc(m.role)+'"><b>'+esc(m.role)+' · '+esc(m.time)+'</b><p>'+esc(m.content).replace(/\n/g,'<br>')+'</p></div>';}).join('')+'</article>';
  }).join('');
  const countMessages = data.sessions.reduce(function(a,s){ return a+s.message_count; }, 0);
  app.innerHTML = '<section class="hero"><h2>Operational memory, indexed.</h2><div class="cards"><div><b>'+data.subjects.length+'</b><span>subjects</span></div><div><b>'+data.daily_logs.length+'</b><span>days</span></div><div><b>'+data.sessions.length+'</b><span>sessions</span></div><div><b>'+countMessages+'</b><span>messages</span></div></div></section><nav class="tabs"><a href="#subjects">Subjects</a><a href="#daily">Daily Logs</a><a href="#sessions">Sessions</a></nav><section id="subjects"><h2>Subjects</h2><div class="grid">'+subjects+'</div></section><section id="daily"><h2>Daily Logs</h2><div class="grid">'+days+'</div></section><section id="sessions"><h2>Sessions</h2>'+sessions+'</section>';
}
$('#btn').addEventListener('click', async () => {
  $('#status').textContent = 'Decrypting…';
  try { const data = await decrypt($('#pass').value); $('#unlock').hidden = true; $('#app').hidden = false; render(data); }
  catch(e){ $('#status').textContent = 'Unlock failed. Check the passphrase.'; console.error(e); }
});
$('#pass').addEventListener('keydown', e => { if(e.key === 'Enter') $('#btn').click(); });