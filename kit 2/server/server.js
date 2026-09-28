/* ══════════════════════════════════════════════════════════════════
   MAPAMUNDI CONTROL — API de accesos + panel de administración
   Un solo archivo · Cero dependencias · Node 18+

   Arranca:   node server.js        (o: ADMIN_PASSWORD=tuclave node server.js)
   Landing:   http://localhost:3000/
   App:       http://localhost:3000/app   (solo con acceso aprobado)
   Panel:     http://localhost:3000/admin (contraseña del administrador)
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DIR = __dirname;
const DB_FILE = path.join(DIR, 'data.json');
const LANDING = path.join(DIR, '..', 'landing', 'index.html');
const APP_FILE = path.join(DIR, '..', 'app', 'index.html');
const ADMIN_FILE = path.join(DIR, 'admin.html');
const COOKIE = 'mapamundi_session';

/* ── Base de datos (JSON en disco) ─────────────────────────────── */
let db;
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    const pass = process.env.ADMIN_PASSWORD || 'mapamundi2026';
    const salt = crypto.randomBytes(16).toString('hex');
    db = {
      secret: crypto.randomBytes(32).toString('hex'),
      admin: { salt, hash: sha256(salt + pass) },
      requests: []
    };
    saveDB();
    console.log('✔ Base de datos creada. Contraseña de admin: ' + pass + '  (cámbiala con la variable ADMIN_PASSWORD)');
  }
}
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function hmac(s) { return crypto.createHmac('sha256', db.secret).update(s).digest('base64url'); }

/* ── Utilidades ────────────────────────────────────────────────── */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function readBody(req, limit = 20000) {
  return new Promise((ok, bad) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { bad(new Error('body-too-large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { bad(new Error('bad-json')); } });
    req.on('error', bad);
  });
}
function parseCookies(req) {
  const h = req.headers.cookie || ''; const out = {};
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function makeToken(email, key, days) {
  const payload = Buffer.from(JSON.stringify({ e: email, k: key, x: Date.now() + days * 864e5 })).toString('base64url');
  return payload + '.' + hmac(payload);
}
function readToken(t) {
  if (!t || typeof t !== 'string' || !t.includes('.')) return null;
  const [p, sig] = t.split('.');
  try {
    const expect = hmac(p);
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!d.e || !d.x) return null;
    return d;
  } catch { return null; }
}
/* Registro vigente = aprobado y no expirado */
function activeFor(email, key) {
  const r = db.requests.find(r => r.email === email);
  if (!r || r.state !== 'approved' || !r.key) return null;
  if (key && r.key !== key) return null;
  if ((r.exp || 0) < Date.now()) return null;
  return r;
}
function findRequest(email) { return db.requests.find(r => r.email === String(email).toLowerCase().trim()); }
function genKey() {
  const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let k = '';
  for (let i = 0; i < 16; i++) { if (i && i % 4 === 0) k += '-'; k += ABC[crypto.randomInt(ABC.length)]; }
  return k;
}

/* Límite de peticiones por IP (memoria) */
const hits = new Map();
function rateOK(ip, bucket, max, ms) {
  const now = Date.now(); const k = ip + '|' + bucket;
  const arr = (hits.get(k) || []).filter(t => now - t < ms);
  if (arr.length >= max) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr); return true;
}

/* ── Archivos estáticos ────────────────────────────────────────── */
function serveFile(res, file, type, extraHeaders = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
    res.writeHead(200, {
      'Content-Type': type + '; charset=utf-8',
      'Cache-Control': type === 'text/html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders
    });
    res.end(buf);
  });
}

/* Página de activación cuando alguien entra a /app sin acceso */
function gatePage(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mapamundi — Activar acceso</title><link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
<style>:root{--v:#22d3ee;--a:#f59e0b;--bg:#060b18;--tx:#eaf2ff}*{box-sizing:border-box;margin:0}body{min-height:100vh;display:grid;place-items:center;background:radial-gradient(120% 80% at 20% 0%,#12244a 0,transparent 60%),radial-gradient(100% 70% at 90% 100%,#1b1440 0,transparent 55%),var(--bg);color:var(--tx);font-family:Nunito,sans-serif;padding:20px}
.card{max-width:430px;width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:30px 26px;backdrop-filter:blur(6px)}
h1{font-family:'Baloo 2';font-size:26px;margin:10px 0 6px}p{color:rgba(234,242,255,.65);font-size:14.5px;line-height:1.5}
input,button{width:100%;padding:13px 15px;border-radius:12px;font-size:15px;margin-top:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:var(--tx);font-family:inherit}
button{background:var(--a);border:none;color:#1a1205;font-weight:800;cursor:pointer;font-family:'Baloo 2'}button:disabled{opacity:.6}
#m{min-height:20px;font-size:13.5px;margin-top:10px;color:#ffd28a}.ok{color:#7ef2c0!important}
a{color:var(--v);font-size:14px;display:inline-block;margin-top:14px}svg{display:block;margin:0 auto}</style></head>
<body><div class="card"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3.2 3.5 14.8 0 18M12 3c-3.5 3.2-3.5 14.8 0 18"/></svg>
<h1>Activa tu Mapamundi</h1><p>${esc(msg || 'Escribe el correo con el que pediste acceso y la clave que recibiste del equipo Mapamundi.')}</p>
<form id="f"><input id="e" type="email" placeholder="Correo" autocomplete="email" required><input id="k" placeholder="Clave  XXXX-XXXX-XXXX-XXXX" required style="text-transform:uppercase;letter-spacing:.06em"><button id="b">Activar acceso</button><div id="m"></div></form>
<a href="/">¿Todavía no tienes acceso? Solicítalo aquí</a></div>
<script>
const f=document.getElementById('f'),m=document.getElementById('m'),b=document.getElementById('b');
f.onsubmit=async ev=>{ev.preventDefault();b.disabled=true;b.textContent='Verificando…';m.className='';m.textContent='';
try{const r=await fetch('/api/access/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value.trim().toLowerCase(),key:k.value.trim().toUpperCase()})});const d=await r.json();
if(d.valid){m.className='ok';m.textContent='¡Acceso activado! Entrando…';document.cookie='mapamundi_session='+encodeURIComponent(d.token)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000';setTimeout(()=>location.reload(),700);}
else{m.textContent=d.reason==='expired'?'Tu acceso expiró. Pide una renovación por Instagram.':d.reason==='revoked'?'Este acceso fue desactivado. Escríbenos por Instagram.':'Correo o clave incorrectos.';b.disabled=false;b.textContent='Activar acceso';}}
catch{m.textContent='No hay conexión con el servidor. Intenta de nuevo.';b.disabled=false;b.textContent='Activar acceso';}};
</script></body></html>`;
}

/* ── Servidor ──────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    /* ─── API pública de accesos ─── */
    if (p === '/api/access/request' && req.method === 'POST') {
      if (!rateOK(ip, 'req', 5, 3600e3)) return json(res, 429, { ok: false, error: 'Demasiadas solicitudes. Prueba más tarde.' });
      const b = await readBody(req);
      const email = String(b.email || '').toLowerCase().trim();
      const name = String(b.childName || '').slice(0, 40).trim();
      if (!/^[^\s@]{1,64}@[^\s@]{2,}\.[^\s@]{2,}$/.test(email)) return json(res, 400, { ok: false, error: 'Correo no válido.' });
      let r = findRequest(email);
      if (!r) {
        r = { id: crypto.randomUUID(), email, childName: name, ts: Date.now(), state: 'pending', key: null, exp: 0, days: 0, ip };
        db.requests.push(r); saveDB();
        console.log('Nueva solicitud: ' + email + ' (' + name + ')');
      } else if (r.state === 'denied' || r.state === 'revoked') {
        r.state = 'pending'; r.childName = name || r.childName; saveDB();
      } else if (name) { r.childName = name; saveDB(); }
      return json(res, 200, { ok: true, state: r.state === 'approved' ? 'approved' : 'pending' });
    }

    if (p === '/api/access/status' && req.method === 'GET') {
      const email = (u.searchParams.get('email') || '').toLowerCase().trim();
      const r = findRequest(email);
      if (!r) return json(res, 200, { state: 'unknown' });
      const active = r.state === 'approved' && (r.exp || 0) > Date.now();
      return json(res, 200, { state: active ? 'approved' : r.state, key: active ? r.key : undefined, exp: r.exp || 0 });
    }

    if (p === '/api/access/verify' && req.method === 'POST') {
      if (!rateOK(ip, 'ver', 30, 3600e3)) return json(res, 429, { valid: false });
      const b = await readBody(req);
      const email = String(b.email || '').toLowerCase().trim();
      const key = String(b.key || '').toUpperCase().trim();
      const r = activeFor(email, key);
      if (!r) {
        const r2 = findRequest(email);
        const reason = r2 && r2.state === 'revoked' ? 'revoked' : r2 && r2.state === 'approved' && (r2.exp || 0) < Date.now() ? 'expired' : 'invalid';
        return json(res, 200, { valid: false, reason });
      }
      r.lastSeen = Date.now(); saveDB();
      return json(res, 200, { valid: true, token: makeToken(email, r.key, Math.max(1, Math.ceil((r.exp - Date.now()) / 864e5))), exp: r.exp });
    }

    if (p === '/api/access/check' && req.method === 'GET') {
      const d = readToken(u.searchParams.get('t') || '');
      if (!d) return json(res, 200, { valid: false, reason: 'invalid' });
      const r = activeFor(d.e);
      if (!r) return json(res, 200, { valid: false, reason: (db.requests.find(x => x.email === d.e) || {}).state || 'invalid' });
      return json(res, 200, { valid: true, exp: r.exp, name: r.childName });
    }

    /* ─── API de administración (cookie de sesión) ─── */
    const cookies = parseCookies(req);
    const adminOK = () => {
      const d = readToken(cookies[COOKIE] || '');
      return !!(d && d.e === 'admin' && d.x > Date.now());
    };

    if (p === '/api/admin/login' && req.method === 'POST') {
      if (!rateOK(ip, 'login', 10, 600e3)) return json(res, 429, { ok: false });
      const b = await readBody(req);
      const pass = String(b.password || '');
      const h = sha256(db.admin.salt + pass);
      if (h.length === db.admin.hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(db.admin.hash))) {
        const days = 7;
        const tok = makeToken('admin', '', days);
        res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(tok)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}`);
        return json(res, 200, { ok: true });
      }
      return json(res, 401, { ok: false, error: 'Contraseña incorrecta.' });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/admin/')) {
      if (!adminOK()) return json(res, 401, { ok: false, error: 'No autorizado.' });
      const act = p.replace('/api/admin/', '');

      if (req.method === 'GET' && act === 'requests') {
        const rows = [...db.requests].sort((a, b) => b.ts - a.ts).map(r => ({
          id: r.id, email: r.email, childName: r.childName, ts: r.ts, state: r.state,
          key: r.key, exp: r.exp, lastSeen: r.lastSeen || 0,
          active: r.state === 'approved' && (r.exp || 0) > Date.now()
        }));
        return json(res, 200, { ok: true, rows });
      }
      if (req.method === 'GET' && act === 'stats') {
        const rs = db.requests;
        return json(res, 200, { ok: true, pending: rs.filter(r => r.state === 'pending').length, active: rs.filter(r => r.state === 'approved' && (r.exp || 0) > Date.now()).length, total: rs.length });
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        const r = db.requests.find(x => x.id === b.id);
        if (!r) return json(res, 404, { ok: false, error: 'No existe.' });
        if (act === 'approve') {
          r.state = 'approved'; r.key = r.key || genKey();
          r.days = Math.min(3650, Math.max(1, parseInt(b.days, 10) || 30));
          r.exp = Date.now() + r.days * 864e5; r.approvedTs = Date.now();
          saveDB(); console.log('Aprobado: ' + r.email + ' clave ' + r.key + ' (' + r.days + ' días)');
          return json(res, 200, { ok: true, key: r.key, exp: r.exp });
        }
        if (act === 'deny') { r.state = 'denied'; saveDB(); return json(res, 200, { ok: true }); }
        if (act === 'revoke') { r.state = 'revoked'; saveDB(); return json(res, 200, { ok: true }); }
        if (act === 'extend') { r.exp = Math.max(r.exp, Date.now()) + Math.max(1, parseInt(b.days, 10) || 30) * 864e5; if (r.state !== 'approved') r.state = 'approved'; r.key = r.key || genKey(); saveDB(); return json(res, 200, { ok: true, exp: r.exp }); }
        if (act === 'delete') { db.requests = db.requests.filter(x => x.id !== r.id); saveDB(); return json(res, 200, { ok: true }); }
      }
      return json(res, 404, { ok: false });
    }

    /* ─── Páginas ─── */
    if (p === '/' || p === '/index.html') return serveFile(res, LANDING, 'text/html');
    if (p === '/app') {
      const d = readToken(cookies[COOKIE] || '');
      const qk = (u.searchParams.get('key') || '').toUpperCase().trim();
      const qe = (u.searchParams.get('email') || '').toLowerCase().trim();
      const ok = (d && d.e !== 'admin' && activeFor(d.e)) || (qk && qe && activeFor(qe, qk));
      if (!ok) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(gatePage());
      }
      const extra = qk ? { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(makeToken(qe, qk, Math.max(1, Math.ceil(((activeFor(qe, qk).exp) - Date.now()) / 864e5))))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } : {};
      return serveFile(res, APP_FILE, 'text/html', extra);
    }
    if (p === '/admin') {
      if (adminOK()) return serveFile(res, ADMIN_FILE, 'text/html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(gatePageAdmin());
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404');
  } catch (e) {
    console.error('Error:', e.message);
    if (!res.headersSent) json(res, 400, { ok: false, error: 'Petición no válida.' }); else res.end();
  }
});

function gatePageAdmin() {
  return gatePage('').replace('Activa tu Mapamundi', 'Panel Mapamundi').replace('Escribe el correo con el que pediste acceso y la clave que recibiste del equipo Mapamundi.', 'Introduce la contraseña del panel para administrar los accesos.').replace('type="email" placeholder="Correo" autocomplete="email" required', 'type="password" placeholder="Contraseña" autocomplete="current-password" required').replace('Clave  XXXX-XXXX-XXXX-XXXX', '').replace('Activar acceso', 'Entrar al panel').replace('¿Todavía no tienes acceso? Solicítalo aquí', '').replace("id='k' style", "id='k' hidden style");
}

loadDB();
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  MAPAMUNDI CONTROL — corriendo en el puerto ' + PORT);
  console.log('  Landing  →  /');
  console.log('  App      →  /app   (requiere acceso aprobado)');
  console.log('  Panel    →  /admin');
  console.log('═══════════════════════════════════════════════');
});
