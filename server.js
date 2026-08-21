'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'byebailly.sqlite');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function emptyStats() {
  const counter = () => ({ points:0, pointsPossibles:0, tentatives:0, assistees:0, resultats:{exact:0,orthographe:0,partiel:0,incorrect:0,revelee:0} });
  return { schemaVersion:2, updatedAt:null, global:{...counter(),streak:{actuel:0,meilleur:0}}, streaks:{beginner:{actuel:0,meilleur:0},intermediate:{actuel:0,meilleur:0},advanced:{actuel:0,meilleur:0},version:{actuel:0,meilleur:0}}, parCategorie:{declinaison:{analyse:counter(),production:counter()},conjugaison:{analyse:counter(),production:counter()},version:{qcm:counter(),theme:counter()}}, parDimension:{typeDeclinaison:{},cas:{},nombre:{},mode:{},temps:{},voix:{}},parJour:{} };
}
function isObject(v){ return v && typeof v === 'object' && !Array.isArray(v); }
function addDelta(target, delta) {
  for (const [key, value] of Object.entries(delta || {})) {
    if (typeof value === 'number') target[key] = (Number(target[key]) || 0) + Math.max(0, value);
    else if (isObject(value)) { if (!isObject(target[key])) target[key] = {}; addDelta(target[key], value); }
  }
  return target;
}
function maxStreak(target, incoming) {
  if (!incoming) return;
  target.actuel = Math.max(0, Number(incoming.actuel) || 0);
  target.meilleur = Math.max(Number(target.meilleur)||0, Number(incoming.meilleur)||0, target.actuel);
}
function parseStats(row) { try { return row ? JSON.parse(row.data_json) : emptyStats(); } catch { return emptyStats(); } }
function loadStats(userId) { return parseStats(db.prepare('SELECT data_json FROM stats WHERE user_id=?').get(userId)); }
function saveStats(userId, stats) {
  stats.schemaVersion = Math.max(2, Number(stats.schemaVersion)||2);
  stats.updatedAt = new Date().toISOString();
  db.prepare(`INSERT INTO stats(user_id,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`).run(userId, JSON.stringify(stats), stats.updatedAt);
}
function correct(stats){ return (Number(stats?.global?.resultats?.exact)||0) + (Number(stats?.global?.resultats?.orthographe)||0); }
function attempts(stats){ return Number(stats?.global?.tentatives)||0; }
function rate(stats){ const a=attempts(stats); return a ? correct(stats)/a : 0; }
function publicUser(user, stats, rank=null){ return { username:user.username, createdAt:user.created_at, rank, correct:correct(stats), attempts:attempts(stats), successRate:rate(stats), stats }; }
function tokenHash(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
function issueSession(userId){ const token=crypto.randomBytes(32).toString('base64url'); db.prepare('INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)').run(tokenHash(token),userId,new Date().toISOString()); return token; }
function auth(req,res,next){ const raw=(req.get('Authorization')||'').replace(/^Bearer\s+/i,''); if(!raw) return res.status(401).json({error:'Authentification requise.'}); const row=db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?').get(tokenHash(raw)); if(!row) return res.status(401).json({error:'Session invalide.'}); req.user=row; req.rawToken=raw; next(); }
function rankRows(){ return db.prepare(`SELECT users.id, users.username, users.created_at, stats.data_json FROM users LEFT JOIN stats ON stats.user_id=users.id`).all().map(r=>({...r,stats:parseStats(r)})).sort((a,b)=> correct(b.stats)-correct(a.stats) || rate(b.stats)-rate(a.stats) || a.id-b.id); }

app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.post('/api/auth/register', async (req,res)=>{
  const username=String(req.body?.username||'').trim(); const password=String(req.body?.password||'');
  if(!username || !password) return res.status(400).json({error:'Pseudo et mot de passe requis.'});
  if(username.length>50) return res.status(400).json({error:'Pseudo trop long.'});
  const key=username.toLocaleLowerCase('fr');
  if(db.prepare('SELECT 1 FROM users WHERE username_key=?').get(key)) return res.status(409).json({error:'Ce pseudo existe déjà.'});
  const hash=await bcrypt.hash(password,10); const createdAt=new Date().toISOString();
  const info=db.prepare('INSERT INTO users(username,username_key,password_hash,created_at) VALUES(?,?,?,?)').run(username,key,hash,createdAt);
  saveStats(info.lastInsertRowid, emptyStats()); const token=issueSession(info.lastInsertRowid);
  res.status(201).json({token,user:{id:Number(info.lastInsertRowid),username,createdAt}});
});
app.post('/api/auth/login', async (req,res)=>{
  const username=String(req.body?.username||'').trim(); const password=String(req.body?.password||'');
  const user=db.prepare('SELECT * FROM users WHERE username_key=?').get(username.toLocaleLowerCase('fr'));
  if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Pseudo ou mot de passe incorrect.'});
  res.json({token:issueSession(user.id),user:{id:user.id,username:user.username,createdAt:user.created_at}});
});
app.post('/api/auth/logout', auth, (req,res)=>{ db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(req.rawToken)); res.json({ok:true}); });
app.get('/api/me', auth, (req,res)=>{ const rows=rankRows(); const rank=rows.findIndex(r=>r.id===req.user.id)+1; res.json({user:{id:req.user.id,username:req.user.username,createdAt:req.user.created_at,rank:rank||null},stats:loadStats(req.user.id)}); });
app.post('/api/sync', auth, (req,res)=>{
  const stats=loadStats(req.user.id); addDelta(stats, req.body?.delta || {});
  maxStreak(stats.global.streak, req.body?.streaks?.global);
  stats.streaks ||= emptyStats().streaks;
  for(const key of ['beginner','intermediate','advanced','version']) maxStreak(stats.streaks[key] ||= {actuel:0,meilleur:0}, req.body?.streaks?.streaks?.[key]);
  saveStats(req.user.id,stats); res.json({ok:true,stats});
});
app.get('/api/leaderboard', (req,res)=>{ const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50)); const offset=Math.max(0,Number(req.query.offset)||0); const rows=rankRows(); res.json({total:rows.length,items:rows.slice(offset,offset+limit).map((r,i)=>publicUser(r,r.stats,offset+i+1))}); });
app.get('/api/users/:username', (req,res)=>{ const user=db.prepare('SELECT * FROM users WHERE username_key=?').get(String(req.params.username).toLocaleLowerCase('fr')); if(!user) return res.status(404).json({error:'Profil introuvable.'}); const rows=rankRows(); const rank=rows.findIndex(r=>r.id===user.id)+1; res.json(publicUser(user,loadStats(user.id),rank||null)); });

app.listen(PORT, ()=>console.log(`ByeBailly backend: http://localhost:${PORT}`));
