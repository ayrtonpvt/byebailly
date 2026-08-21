(() => {
  'use strict';
  const STATS_KEY = 'byebailly_stats';
  const q = s => document.querySelector(s);
  const el = (tag, cls='', text='') => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; };
  document.body.dataset.theme = localStorage.getItem('app_theme') || 'system';

  function emptyCounter(){ return {points:0,pointsPossibles:0,tentatives:0,assistees:0,resultats:{exact:0,orthographe:0,partiel:0,incorrect:0,revelee:0}}; }
  function readLocal(){ try{return JSON.parse(localStorage.getItem(STATS_KEY)) || null;}catch{return null;} }
  function n(v){ return Number(v)||0; }
  function fmt(v){ const x=Math.round((n(v)+Number.EPSILON)*10)/10; return Number.isInteger(x)?String(x):String(x).replace('.',','); }
  function correct(c){ return n(c?.resultats?.exact)+n(c?.resultats?.orthographe); }
  function success(c){ return n(c?.tentatives) ? Math.round(correct(c)/n(c.tentatives)*1000)/10 : 0; }
  function pointRate(c){ return n(c?.pointsPossibles) ? Math.round(n(c.points)/n(c.pointsPossibles)*1000)/10 : 0; }
  function mergeCounters(list){ const out=emptyCounter(); for(const c of list.filter(Boolean)){ for(const k of ['points','pointsPossibles','tentatives','assistees'])out[k]+=n(c[k]); for(const k of Object.keys(out.resultats))out.resultats[k]+=n(c.resultats?.[k]); } return out; }
  function category(stats,key){ return mergeCounters(Object.values(stats?.parCategorie?.[key]||{})); }

  const dimensionConfig={
    typeDeclinaison:['Type de déclinaison',{nom_1:'Noms — 1re déclinaison',nom_2:'Noms — 2e déclinaison',nom_3:'Noms — 3e déclinaison',adjectif_1:'Adjectifs — 1re classe',adjectif_2:'Adjectifs — 2e classe',adjectif_3:'Adjectifs — 3e classe',autre:'Autres formes'}],
    cas:['Cas',{nom:'Nominatif',voc:'Vocatif',acc:'Accusatif',gen:'Génitif',dat:'Datif'}], nombre:['Nombre',{sg:'Singulier',pl:'Pluriel'}],
    mode:['Mode verbal',{indicative:'Indicatif',participle:'Participe',infinitive:'Infinitif',subjunctive:'Subjonctif',imperative:'Impératif',optative:'Optatif'}],
    temps:['Temps',{present:'Présent',imperfect:'Imparfait',future:'Futur',aorist:'Aoriste',perfect:'Parfait'}],
    voix:['Voix',{active:'Active',middle:'Moyenne',middle_passive:'Moyenne / passive',passive:'Passive'}]
  };

  function section(title,note=''){ const s=el('section','setting-group stats-group'); const h=el('div','stats-group-title-row'); h.append(el('h3','setting-label',title)); if(note)h.append(el('span','stats-group-note',note)); s.append(h); return s; }
  function metric(grid,val,label,accent=false){ const b=el('div','stats-metric'); b.append(el('span',`stats-metric-value${accent?' is-accent':''}`,val),el('span','stats-metric-label',label)); grid.append(b); }
  function summary(counter,title='Vue d’ensemble',streak=null){ const s=section(title); const g=el('div','stats-summary-grid'); metric(g,`${success(counter)} %`,'Réussite',true); metric(g,fmt(correct(counter)),'Réponses correctes'); metric(g,fmt(counter?.tentatives),'Tentatives'); metric(g,`${fmt(counter?.points)} / ${fmt(counter?.pointsPossibles)}`,'Points'); metric(g,fmt(counter?.assistees),'Avec indice'); if(streak){metric(g,fmt(streak.actuel),'Série actuelle');metric(g,fmt(streak.meilleur),'Record');} s.append(g); return s; }
  function detail(label,c){ const row=el('div','stats-detail-row'); const head=el('div','stats-detail-head'); head.append(el('span','stats-detail-label',label),el('span','stats-detail-value',`${pointRate(c)} %`)); const track=el('div','stats-progress-track'); const fill=el('div','stats-progress-fill'); fill.style.width=`${pointRate(c)}%`; track.append(fill); const foot=el('div','stats-detail-foot'); foot.append(el('span','',`${fmt(c?.points)} / ${fmt(c?.pointsPossibles)} points`),el('span','',`${fmt(c?.tentatives)} tentatives`)); row.append(head,track,foot); return row; }
  function dimensions(stats,names){ const frag=document.createDocumentFragment(); for(const name of names){ const [title,labels]=dimensionConfig[name]; const s=section(title); const list=el('div','stats-detail-list'); const table=stats?.parDimension?.[name]||{}; const keys=Object.keys(table); if(!keys.length) list.append(el('p','stats-empty-text','Aucune donnée pour le moment.')); else keys.sort((a,b)=>(labels[a]||a).localeCompare(labels[b]||b,'fr')).forEach(k=>list.append(detail(labels[k]||k.replaceAll('_',' '),table[k]))); s.append(list); frag.append(s); } return frag; }
  function modes(stats,cat,defs){ const s=section('Modes'); const grid=el('div','stats-mode-grid'); for(const [key,label] of defs){ const c=stats?.parCategorie?.[cat]?.[key]||emptyCounter(); const card=el('div','stats-mode-card'); card.append(el('span','stats-mode-name',label),el('span','stats-mode-score',`${success(c)} %`),el('span','stats-mode-detail',`${fmt(correct(c))} correctes · ${fmt(c.tentatives)} tentatives`)); grid.append(card); } s.append(grid); return s; }
  function streaks(stats){ const s=section('Séries','Une mauvaise réponse interrompt seulement la série concernée.'); const grid=el('div','stats-streak-grid'); const labels={beginner:'Débutant',intermediate:'Intermédiaire',advanced:'Avancé',version:'Version'}; for(const key of Object.keys(labels)){ const st=stats?.streaks?.[key]||{actuel:0,meilleur:0}; const card=el('div','stats-streak-card'); card.append(el('strong','',labels[key]),el('span','',`Série : ${fmt(st.actuel)}`),el('span','',`Record : ${fmt(st.meilleur)}`)); grid.append(card); } s.append(grid); return s; }
  function activity(stats){ const s=section('Activité récente','14 derniers jours'); const grid=el('div','stats-activity-simple'); const now=new Date(); for(let i=13;i>=0;i--){ const d=new Date(now);d.setDate(now.getDate()-i); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; const c=stats?.parJour?.[key]||emptyCounter(); const day=el('div','stats-day-simple'); day.title=`${key} : ${n(c.tentatives)} tentative(s)`; day.append(el('span','stats-day-count',fmt(c.tentatives)),el('small','',d.toLocaleDateString('fr-FR',{weekday:'short'}).slice(0,2))); grid.append(day); } s.append(grid); return s; }
  function renderStats(stats){ const root=q('#statsContent'); root.replaceChildren(); const view=q('#statsViewControl .active')?.dataset.view||'global'; if(view==='global'){ root.append(summary(stats.global,'Vue générale',stats.global?.streak),streaks(stats),activity(stats)); } else if(view==='declinaison'){ root.append(summary(category(stats,'declinaison'),'Déclinaison'),modes(stats,'declinaison',[['analyse','Analyse'],['production','Production']]),dimensions(stats,['typeDeclinaison','cas','nombre'])); } else if(view==='conjugaison'){ root.append(summary(category(stats,'conjugaison'),'Conjugaison'),modes(stats,'conjugaison',[['analyse','Analyse'],['production','Production']]),dimensions(stats,['mode','temps','voix'])); } else { root.append(summary(category(stats,'version'),'Version',stats?.streaks?.version),modes(stats,'version',[['qcm','Version'],['theme','Thème']])); } }

  let displayedStats=readLocal()||{global:emptyCounter(),parCategorie:{},parDimension:{},parJour:{},streaks:{}};
  q('#statsViewControl').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(!b)return;q('#statsViewControl').querySelectorAll('button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderStats(displayedStats);});

  function dateFr(iso){ if(!iso)return ''; return new Date(iso).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}); }
  function renderHeader({username=null,createdAt=null,rank=null,isPublic=false}={}){
    q('#profileName').textContent=username||'Profil local'; q('#profileMeta').textContent=username ? `Inscrit le ${dateFr(createdAt)}${rank?` · #${rank} au classement`:''}` : 'Statistiques enregistrées sur cet appareil.';
    q('#authActions').hidden=isPublic; q('#logoutBtn').hidden=!username||isPublic; q('#authPanel').hidden=Boolean(username)||isPublic; q('#localAccountHint').hidden=Boolean(username)||isPublic;
  }
  async function load(){ const publicName=new URLSearchParams(location.search).get('user'); try{
      if(publicName){ const data=await ByeBaillyAPI.request(`/users/${encodeURIComponent(publicName)}`); displayedStats=data.stats; renderHeader({username:data.username,createdAt:data.createdAt,rank:data.rank,isPublic:true}); }
      else if(ByeBaillyAPI.token()){ await ByeBaillyAPI.syncNow({force:true}).catch(()=>{}); const data=await ByeBaillyAPI.me(); displayedStats=data.stats||readLocal()||displayedStats; renderHeader({username:data.user.username,createdAt:data.user.createdAt,rank:data.user.rank}); }
      else renderHeader();
    } catch(err){ q('#profileNotice').textContent=err.message; renderHeader(); }
    renderStats(displayedStats);
  }
  q('#loginForm').addEventListener('submit',async e=>{e.preventDefault();q('#profileNotice').textContent='';try{await ByeBaillyAPI.login(q('#loginUsername').value,q('#loginPassword').value);await load();}catch(err){q('#profileNotice').textContent=err.message;}});
  q('#registerForm').addEventListener('submit',async e=>{e.preventDefault();q('#profileNotice').textContent='';try{await ByeBaillyAPI.register(q('#registerUsername').value,q('#registerPassword').value);await load();}catch(err){q('#profileNotice').textContent=err.message;}});
  q('#logoutBtn').addEventListener('click',async()=>{await ByeBaillyAPI.logout(); displayedStats=readLocal()||displayedStats; renderHeader();renderStats(displayedStats);});
  load();
})();
