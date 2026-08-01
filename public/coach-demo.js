(function(){
"use strict";
var LOGO='<svg viewBox="0 0 1254 1254" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">'
+'<rect width="1254" height="1254" rx="280" fill="#062120"/>'
+'<path transform="translate(926,285)" d="m0 0h21l7 4 4 5 3 8v52l-2 35-4 35-5 29-6 26-9 29-11 27-10 20-11 18-11 15-9 11-11 12-9 9-11 9-16 12-22 13-27 13-28 10-36 10-23 7-20 9-13 8-10 8-9 8-10 13-8 14-5 11-5 17-3 18-1 78-4 9-8 6-3 1h-11l-8-4-5-6-1-3v-274l2-39 3-26 5-26 7-25 9-24 11-23 10-17 11-16 13-16 9-10 18-18 11-9 16-12 20-12 21-11 25-10 25-8 34-8 38-6 36-4z" fill="#43DA7A"/>'
+'<path transform="translate(316,476)" d="m0 0h42l26 3 22 5 21 7 21 10 14 9 12 9 13 12 11 12 11 16 10 18 8 21 5 18 4 26 1 14v41l-5 10-6 4-3 1h-25l-25-3-23-5-20-6-25-11-19-11-16-12-12-11-14-14-11-15-8-13-8-16-6-15-6-21-4-24-1-11v-34l5-8 5-4z" fill="#43DA7A"/>'
+'<path transform="translate(341,710)" d="m0 0 9 1 6 3 6 7 2 5 2 25 3 19 6 23 7 20 13 27 10 16 10 14 11 13 7 8 14 14 10 8 17 13 20 12 17 9 25 10 24 7 28 5 11 1h41l27-4 25-6 20-7 20-9 17-9 18-12 13-10 15-13 13-13 11-14 9-12 14-23 9-19 8-21 6-23 4-24h-102l-8-4-5-6-2-5v-10l4-8 6-5 5-2h130l6 3 6 7 1 2v25l-4 29-6 25-9 26-12 26-12 21-12 17-11 14-11 12-7 8-13 12-13 11-18 13-20 12-17 9-24 10-24 8-25 6-20 3-27 2h-13l-20-1-29-4-25-6-27-9-25-11-20-11-17-11-12-9-10-8-12-11-20-20-11-14-11-15-13-21-8-15-11-26-8-25-6-27-3-26v-17l4-8 9-6z" fill="#43DA7A"/></svg>';
var SPROUT='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex:0 0 auto"><path d="M12 21V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5Z" fill="currentColor"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" fill="currentColor"/></svg>';
var BELL='<span class="bell"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="badge">4</span></span>';
var CHATSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
var DOC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/></svg>';
var BELLSM='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
document.getElementById('winmark').innerHTML=LOGO;
document.querySelector('.fab').innerHTML=CHATSVG;
function el(id){ return document.getElementById(id); }
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function ic(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'; }
var ICONS={
 Messages: ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
 Stats: ic('<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="14" width="3" height="3"/>'),
 Consistency: ic('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
 Targets: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
 Nutrition: ic('<path d="M11 3a9 9 0 1 0 10 10z"/><path d="M13 3a8 8 0 0 1 8 8h-8z"/>'),
 "Check-in": ic('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
 Notes: ic('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
 Progress: ic('<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h7v7"/>'),
 Weight: ic('<path d="M3 12h4l3 7 4-14 3 7h4"/>'),
 Calories: ic('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
 Cardio: ic('<path d="M20.8 5.6a5 5 0 0 0-8-1.3L12 5l-.8-.7a5 5 0 1 0-7 7l7.8 7.5 7.8-7.5a5 5 0 0 0 0-6z"/>'),
 Steps: ic('<path d="M8 5c1.3 0 2 1.6 2 4s.2 5-1.5 5S6 12 6 9s.7-4 2-4z"/><path d="M17 10c1.3 0 2 1.6 2 4s.2 5-1.5 5S15 17 15 14s.7-4 2-4z"/>'),
 Measurements: ic('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>')
};
var RAILS=['Messages','Stats','Consistency','Targets','Nutrition','Check-in','Notes','Progress','Weight','Calories','Cardio','Steps','Measurements'];
function railHTML(active){ return '<div class="rlbl">On this client</div>'+RAILS.map(function(r){ return '<a data-act="tease" class="'+(r===active?'on':'')+'">'+ICONS[r]+'<span>'+r+'</span></a>'; }).join(''); }

/* ---- state ---- */
function defState(){ return { sort:'attention', open:null, report:false, reviewed:false, unit:'kg', win:21, notes:[], hideCal:false, targetsSaved:false, invited:false }; }
var S=defState(); S.ch=0;
function resetChapterState(){ var d=defState(); for(var k in d) S[k]=d[k]; }

var CH=[
  { num:'01', title:'Triage the roster', sub:'See who needs you first; open a record' },
  { num:'02', title:'The weekly report', sub:'Drafted from real data, in your voice' },
  { num:'03', title:'Review the check-in', sub:'Your cadence, your questions' },
  { num:'04', title:'The evidence', sub:'Maintenance, composition, targets, notes' },
  { num:'05', title:'Invite & grow', sub:'Add a client — then start free' }
];

var STEPS=[
 { steps:[
   {el:'sort-comp', type:'click', place:'bottom', title:'Rank who’s slipping', body:'Your dashboard sorts by who needs you first. <b>Sort by compliance</b> — not by who emailed last.'},
   {el:'open-maya', type:'click', place:'bottom', title:'Open a client', body:'Every client is one full record. <b>Open Maya Chen</b> to see what’s inside.'}
 ], done:'That’s triage — ready, watch, or nudge. The next chapters tour a client’s record.' },
 { steps:[
   {el:'gw-meeting', type:'info', place:'bottom', title:'Walk in prepared', body:'“Meeting prep” drafts a private brief — <b>just for you</b> — before a call.'},
   {el:'gw-weekly', type:'click', place:'bottom', title:'Draft the weekly report', body:'Written from Maya’s real data, in your voice. <b>Click to generate it.</b>'},
   {el:'send-report', type:'click', place:'top', title:'Review, then send', body:'Edit a line if you want — then it’s off. About a minute, instead of an evening.'}
 ], done:'The weekly report that used to take an evening — drafted from real data in about a minute.' },
 { steps:[
   {el:'checkin-cadence', type:'info', place:'bottom', title:'On your cadence, your questions', body:'Weekly, biweekly, or every few weeks — and you can replace the default questions with your own.'},
   {el:'checkin-review', type:'click', place:'top', title:'Read it, then close it', body:'Maya rated herself <b>4/10 despite logging all week</b> — a signal worth a reply. <b>Mark it reviewed.</b>'}
 ], done:'Every week’s self-report in one place — with the context to actually respond.' },
 { steps:[
   {el:'eb-maint', type:'info', place:'top', title:'Their real maintenance', body:'Read from what Maya <b>actually ate and weighed</b> — not a calculator. The more she logs, the tighter it gets.'},
   {el:'unit-lbs', type:'click', place:'bottom', title:'Read it your way', body:'Maya logs in kilos. <b>Flip to pounds</b> — the whole chart converts.'},
   {el:'meas', type:'info', place:'top', title:'Neck-to-thigh, not just the scale', body:'Six sites with per-site trends — where the change is actually happening.'},
   {el:'note-add', type:'click', place:'top', title:'Leave yourself a note', body:'Private, coach-only memory that survives to next week. <b>Add one.</b>'}
 ], done:'Empirical maintenance, body-composition and a coaching memory — the depth a spreadsheet can’t hold.' },
 { steps:[
   {el:'invite-send', type:'click', place:'top', title:'Add your next client', body:'Send an invite — they install it like an app, no App Store. <b>Send it.</b>'}
 ], done:'That’s the whole loop: invite, log, coach. Ready to run yours?' }
];

/* ============ DASHBOARD (roster + invite) ============ */
var CLIENTS=[
 {id:'sr',name:'Sam Rivera',init:'SR',email:'sam@gardnr.demo',level:'red',locked:false,triage:'5 days no log',lastLog:5,cscore:2,nudge:true,hasCheckin:false,comp:{calories:0,protein:1,cardio:1,steps:0}},
 {id:'mw',name:'Marcus Webb',init:'MW',email:'marcus@gardnr.demo',level:'yellow',locked:false,triage:'Cardio 1/7',lastLog:1,cscore:9,hasCheckin:true,checkin:{adh:3,en:3},comp:{calories:4,protein:4,cardio:1,steps:0}},
 {id:'dt',name:'Diego Torres',init:'DT',email:'diego@gardnr.demo',level:'red',locked:true,triage:'Locked · 4 days no nutrition',lastLog:4,cscore:10,nudge:true,hasCheckin:false,comp:{calories:2,protein:1,cardio:3,steps:4}},
 {id:'ps',name:'Priya Shah',init:'PS',email:'priya@gardnr.demo',level:'yellow',locked:false,triage:'No check-in this week',lastLog:1,cscore:16,hasCheckin:false,comp:{calories:5,protein:3,cardio:2,steps:6}},
 {id:'to',name:'Tom Okafor',init:'TO',email:'tom@gardnr.demo',level:'green',locked:false,triage:'Logged yesterday',lastLog:1,cscore:21,hasCheckin:true,checkin:{adh:7,en:7},comp:{calories:6,protein:6,cardio:3,steps:6}},
 {id:'mc',name:'Maya Chen',init:'MC',email:'maya@gardnr.demo',level:'green',locked:false,triage:'Logged today',lastLog:0,cscore:22,hasCheckin:true,checkin:{adh:4,en:4},comp:{calories:5,protein:6,cardio:4,steps:7}}
];
var LVL={red:'--error',yellow:'--warning',green:'--success'};
var SORTS=[['attention','Attention'],['compliance','Compliance'],['lastlog','Last logged'],['checkin','Check-in']];
function sortedClients(){ var a=CLIENTS.slice();
  if(S.sort==='attention'){ var o={red:0,yellow:1,green:2}; a.sort(function(x,y){return o[x.level]-o[y.level]||y.lastLog-x.lastLog;}); }
  else if(S.sort==='compliance'){ a.sort(function(x,y){return x.cscore-y.cscore;}); }
  else if(S.sort==='lastlog'){ a.sort(function(x,y){return y.lastLog-x.lastLog;}); }
  else if(S.sort==='checkin'){ a.sort(function(x,y){return (x.hasCheckin?1:0)-(y.hasCheckin?1:0)||(x.checkin?x.checkin.adh:0)-(y.checkin?y.checkin.adh:0);}); }
  return a; }
function statusPill(level,txt){ var c=LVL[level]; return '<span class="opill" style="color:var('+c+');border-color:color-mix(in srgb,var('+c+') 55%,transparent);background:color-mix(in srgb,var('+c+') 12%,transparent)"><span class="dt" style="background:var('+c+')"></span>'+txt+'</span>'; }
function checkinPill(a,e){ return '<span class="opill" style="color:var(--success);border-color:color-mix(in srgb,var(--success) 45%,transparent)">'+a+'/10 adherence · '+e+'/10 energy</span>'; }
function compPill(name,n,tok){ var op=n>=5?1:n>=3?.82:.6; return '<span class="opill" style="color:var('+tok+');border-color:var('+tok+');background:color-mix(in srgb,var('+tok+') 9%,transparent);opacity:'+op+'">'+name+' '+n+'/7</span>'; }
function statc(label,valueHTML,color,sub,info,danger){ return '<div class="statc'+(danger?' danger':'')+'"><div class="k">'+label+(info?' <span class="i">i</span>':'')+'</div><div class="v" style="color:var('+(color||'--text')+')">'+valueHTML+'</div>'+(sub?'<div class="s">'+sub+'</div>':'')+'</div>'; }
function dashHTML(){
  var red=0,yel=0,grn=0,review=0;
  CLIENTS.forEach(function(c){ if(c.level==='red')red++;else if(c.level==='yellow')yel++;else grn++; if(c.hasCheckin)review++; });
  var checkedIn=CLIENTS.filter(function(c){return c.hasCheckin;}).length;
  var banner='<div class="card row between" style="flex-wrap:wrap;gap:12px"><div class="row" style="gap:20px;flex-wrap:wrap">'
    +seg('--error',red+' at risk')+seg('--warning',yel+' needs review')+seg('--success',grn+' on track')+'</div>'
    +'<button class="btn sm ghost" data-act="open" data-id="mw" style="border-color:color-mix(in srgb,var(--success) 45%,transparent);color:var(--success)">'+review+' check-ins to review →</button></div>';
  var summary='<div class="grid3">'+statc('Total clients',CLIENTS.length,'--text')
    +statc('Checked in this week','<span style="color:var(--success)">'+checkedIn+'</span><span class="muted" style="font-size:1.1rem">/'+CLIENTS.length+'</span>','--text')
    +statc('At risk',red,red>0?'--error':'--success',null,false,red>0)+'</div>';
  var sortRow='<div class="row between"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:.8rem">Sort:</span>'
    +SORTS.map(function(s){ var on=S.sort===s[0]; var tr=s[0]==='compliance'?' data-tour="sort-comp"':''; return '<button class="win-pill" style="font-size:.76rem;padding:5px 12px'+(on?';background:var(--primary);color:var(--on-accent);border-color:transparent':'')+'" data-act="sort" data-sort="'+s[0]+'"'+tr+'>'+s[1]+'</button>'; }).join('')+'</div><span class="i">i</span></div>';
  var list=sortedClients().map(clientCard).join('');
  var invite = S.invited
    ? '<div class="card" data-tour="invite-send"><h2 class="h2">Invite a client</h2><div class="opill anim-in" style="margin-top:12px;color:var(--success);border-color:color-mix(in srgb,var(--success) 45%,transparent)">✓ Invite emailed to jess@example.com</div><p class="muted" style="font-size:.78rem;margin-top:10px">They’ll get a link to install Gardnr and start logging — no App Store.</p></div>'
    : '<div class="card"><h2 class="h2">Invite a client</h2><div class="row" style="gap:10px;margin-top:12px"><input class="field" style="flex:1;padding:11px 13px" value="jess@example.com" readonly aria-label="Client email"><button class="btn pri" data-act="invite-send" data-tour="invite-send">Send invite</button></div><p class="muted" style="font-size:.78rem;margin-top:10px">No per-client fee, no cap — invite as many as you like.</p></div>';
  return '<div class="pad"><h1 class="h1">Coach Dashboard</h1><p class="sub">Welcome, Alex Moreau</p>'
    +'<div class="stack" style="margin-top:20px">'+banner+summary+sortRow+'<div class="stack" style="gap:12px">'+list+'</div>'+invite+'</div></div>';
}
function seg(v,txt){ return '<span class="row" style="gap:8px"><span style="width:9px;height:9px;border-radius:50%;background:var('+v+')"></span><span style="font-size:.84rem"><b>'+txt.split(' ')[0]+'</b> '+txt.split(' ').slice(1).join(' ')+'</span></span>'; }
function clientCard(c){
  var checkin=c.hasCheckin?checkinPill(c.checkin.adh,c.checkin.en):'';
  var comp='<div style="margin-top:13px;padding-top:13px;border-top:1px solid var(--border)"><div class="label" style="margin-bottom:8px">7-day compliance</div><div class="cpill-wrap" style="margin-top:0">'
    +(c.locked?'<span class="opill" style="color:var(--error);border-color:color-mix(in srgb,var(--error) 45%,transparent)">Locked</span>':'')
    +compPill('Calories',c.comp.calories,'--calories')+compPill('Protein',c.comp.protein,'--protein')+compPill('Cardio',c.comp.cardio,'--cardio')+compPill('Steps',c.comp.steps,'--steps')+'</div></div>';
  var tr=c.id==='mc'?' data-tour="open-maya"':'';
  return '<div class="client'+(c.level==='red'?' red':'')+'" data-act="open" data-id="'+c.id+'"'+tr+'>'
    +'<div class="row between"><div class="row" style="gap:13px"><div class="avatar-lg grn">'+c.init+'</div><div><div style="font-weight:700;font-size:.98rem">'+c.name+'</div><div class="muted" style="font-size:.78rem">'+c.email+'</div></div></div>'
    +'<div class="row" style="gap:8px">'+(c.nudge?'<button class="btn sm ghost" data-act="tease">Nudge</button>':'')+'<span class="btn sm ghost">View data →</span></div></div>'
    +'<div class="cpill-wrap">'+statusPill(c.level,c.triage)+checkin+'</div>'+comp+'</div>';
}

/* ============ CLIENT RECORD (Maya Chen) ============ */
var MAYA={ name:'Maya Chen', init:'MC', email:'maya@gardnr.demo' };
var TODAY={ cal:1609, p:129, c:169, f:47, w:70.4 };
var TARGETS={ cal:1850, p:140, c:165, f:60, cardio:35, steps:9000, wgoal:71 };
var MEALS=[
 ['Breakfast','Greek yoghurt, berries, granola',402,32,42,12],
 ['Lunch','Chicken, rice and greens',563,45,59,16],
 ['Dinner','Salmon, potatoes, broccoli',483,39,51,14],
 ['Snack','Protein shake',161,13,17,5]
];
var WEIGHTS_KG=[73.6,73.1,72.6,72.1,71.7,71.3,71.0,70.8,70.6,70.5,70.4,70.3];
var WAVG_KG=[73.4,73.0,72.5,72.1,71.7,71.4,71.1,70.9,70.7,70.6,70.4,70.3];
var GOAL_KG=71; var XLAB=['May','','','Jun','','','','Jul','','','',''];
var WINDOWS={ 14:{lo:2120,hi:2300,note:'estimate · 79% logged',trend:0.7,logged:1780,traj:'maintenance ~2,190 → ~2,210, rate down 0.6 → down 0.7 lb/wk'},
 21:{lo:2150,hi:2250,note:'estimate',trend:0.9,logged:1746,traj:'maintenance ~2,200 → ~2,200, rate down 0.9 lb/wk → down 0.9 lb/wk'},
 28:{lo:2170,hi:2240,note:'estimate · 93% logged',trend:0.9,logged:1760,traj:'maintenance ~2,210 → ~2,200, rate down 0.8 → down 0.9 lb/wk'} };
var EB_TARGET=1850;
var MEAS=[['Neck',32.1,-0.3],['Chest',92.6,-1.2],['Waist',72.6,-5.2],['Hips',95.1,-2.7],['Arm',29.5,1.1],['Thigh',54.6,-1.3]];
function toU(v){ return S.unit==='lbs'? v*2.20462 : v; }
function uName(){ return S.unit==='lbs'?'lbs':'kg'; }

function recordHTML(){
  var content='<button class="btn ghost sm" data-act="back">← Roster</button>'
    +'<div class="row between" style="gap:14px;margin:16px 0;flex-wrap:wrap"><div class="row" style="gap:14px"><div class="avatar-lg grn" style="width:52px;height:52px;font-size:1rem">'+MAYA.init+'</div><div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h1 class="h1" style="font-size:1.5rem">'+MAYA.name+'</h1>'+statusPill('green','On track')+'</div><div class="muted" style="font-size:.78rem">'+MAYA.email+'</div></div></div>'
    +'<button class="btn ghost sm" data-act="tease">'+BELLSM+' Nudge to log</button></div>'
    +'<div class="stack">'+groundworkCard()+todayStatsCard()+consistencyCard()+targetsCard()+nutritionCard()+checkinCard()+notesCard()+energyCard()+weightCard()+measCard()+'</div>';
  return '<div class="cv"><nav class="rail">'+railHTML('Progress')+'</nav><div class="cvmain">'+content+'</div></div>';
}
function groundworkCard(){
  var box;
  if(S.report){ box='<div style="margin-top:14px" class="anim-in"><div class="label" style="color:var(--ai);margin-bottom:6px">Draft · review before sending</div>'
      +'<textarea class="ta" style="min-height:150px;color:var(--text-dim);line-height:1.6;resize:vertical">'+REPORT_DRAFT+'</textarea>'
      +'<div class="row" style="gap:8px;margin-top:10px"><button class="btn pri sm" data-act="send-report" data-tour="send-report">Send to client</button><button class="btn ghost sm" data-act="discard">Discard</button></div></div>'; }
  else { box=''; }
  return '<div class="card"><div class="cardhd"><h2 class="h2">Groundwork</h2><span class="faint">▾</span></div>'
    +'<div class="grid2">'
    +'<div class="gw-tile" data-act="tease" data-tour="gw-meeting"><div class="gw-ico" style="background:color-mix(in srgb,var(--ai) 15%,transparent);color:var(--ai)">'+DOC+'</div><div><div class="t">Meeting prep</div><div class="d">AI brief to walk in prepared — just for you</div></div></div>'
    +'<div class="gw-tile" data-act="gw-weekly" data-tour="gw-weekly"><div class="gw-ico" style="background:color-mix(in srgb,var(--success) 15%,transparent);color:var(--success)">'+DOC+'</div><div><div class="t">Weekly report</div><div class="d">AI draft to review and send the client</div></div></div>'
    +'</div>'+box+'</div>';
}
var REPORT_DRAFT="Hey Maya — really solid week. You logged all 7 days and your calories landed in range on most of them; protein held at 6/7. Weight’s trending down about 0.9 lb/wk, right on plan for your 71 kg goal.\n\nOne thing from your check-in: you rated adherence 4/10 even though the data looks strong. That gap usually means the plan feels harder than it needs to — let’s talk Monday about making the weekends feel less restrictive so the number matches the effort.\n\nProud of the consistency. Keep it rolling. — Coach Alex";
function todayStatsCard(){
  return '<div class="card"><div class="cardhd"><h2 class="h2">Today’s stats</h2><span class="faint">▾</span></div>'
    +'<div class="grid2">'
    +statL('--warning','Calories',fmt(TODAY.cal))+statL('--protein','Protein',TODAY.p+'g')
    +statL('--carbs','Carbs',TODAY.c+'g')+statL('--fat','Fat',TODAY.f+'g')
    +'</div><div style="margin-top:12px">'+statL('--weight','Weight',TODAY.w+' kg')+'</div></div>';
}
function statL(dot,label,val){ return '<div class="statL"><div class="k"><span class="dot2" style="background:var('+dot+')"></span>'+label+'</div><div class="v">'+val+'</div></div>'; }
function consistencyCard(){
  var cards='<div class="grid3">'+statc('Current streak','12','--success','days',true)+statc('Last 7 days','7<span class="muted" style="font-size:1rem">/7</span>','--success',null,true)+statc('Last 30 days','27<span class="muted" style="font-size:1rem">/30</span>','--success',null,true)+'</div>';
  return '<div class="card"><div class="cardhd"><h2 class="h2">Logging consistency</h2><span class="grip">⠿ ▾</span></div>'+cards
    +'<div class="label" style="margin:18px 0 8px">Calorie compliance · last 90 days</div>'+heatmap()
    +'<div class="hleg"><span><b style="background:#34d399"></b>90–110%</span><span><b style="background:#fb923c"></b>&gt;110%</span><span><b style="background:#fbbf24"></b>60–89%</span><span><b style="background:#f87171"></b>&lt;60%</span><span><b style="background:var(--border)"></b>No log</span></div></div>';
}
function heatmap(){
  var col=['var(--border)','#34d399','#fbbf24','#fb923c','#f87171']; var cells='';
  for(var r=0;r<7;r++){ for(var c=0;c<13;c++){ var v;
    if(c<3){ v=0; } else { var s=(Math.sin((r*13+c)*1.7)+1)/2; v = s>0.9?3 : s>0.72?2 : s<0.06?4 : 1; if(c===3&&r<2) v=0; }
    cells+='<i style="background:'+col[v]+(v===0?';box-shadow:inset 0 0 0 1px var(--border-strong)':'')+'"></i>';
  }}
  return '<div class="hmap">'+cells+'</div>';
}
function targetsCard(){
  var saved=S.targetsSaved?'<span class="opill anim-in" style="margin-left:10px;color:var(--success);border-color:color-mix(in srgb,var(--success) 45%,transparent)">✓ Saved</span>':'';
  function f(l,v,extra){ return '<div class="field"><label>'+l+'</label><input class="field" value="'+v+'" readonly'+(extra||'')+'></div>'; }
  return '<div class="card"><div class="cardhd"><h2 class="h2">Client targets</h2><span class="grip">⠿ ▾</span></div>'
    +'<p class="muted" style="font-size:.82rem;margin:0 0 14px">Set daily goals for Maya Chen. These appear on their dashboard.</p>'
    +'<div class="row between" style="padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px"><div><div style="font-weight:600;font-size:.85rem;color:var(--text-dim)">Hide calories from client</div><div class="muted" style="font-size:.74rem;margin-top:2px">For clients with a sensitive relationship with calorie tracking.</div></div><button class="toggle'+(S.hideCal?' on':'')+'" data-act="toggle-cal" aria-label="Hide calories"></button></div>'
    +'<button class="link-g" data-act="tease" style="margin-bottom:14px">'+DOC+' Calculate from stats</button>'
    +'<div class="grid2" style="gap:12px 14px">'+f('Calories',TARGETS.cal)+f('Protein (g)',TARGETS.p)+f('Carbs (g)',TARGETS.c)+f('Fat (g)',TARGETS.f)+f('Cardio (min/day)',TARGETS.cardio)+f('Steps/day',TARGETS.steps)+'</div>'
    +'<div class="field" style="margin-top:12px"><label>Weight goal</label><div class="row" style="gap:8px"><input class="field" value="'+TARGETS.wgoal+'" readonly style="flex:1"><span class="win-pill" style="padding:9px 12px">kg ▾</span></div></div>'
    +'<div class="row" style="margin-top:14px"><button class="btn pri" data-act="targets-save" data-tour="targets-save">Save targets</button>'+saved+'</div></div>';
}
function nutritionCard(){
  var meals=MEALS.map(function(m){ return '<div class="meal-h"><span class="lbl">'+m[0]+'</span><span class="muted" style="font-size:.72rem">'+m[2]+' cal</span></div>'
    +'<div class="food"><span style="font-size:.85rem">'+m[1]+'</span><div class="macros"><span style="color:var(--success);font-weight:600">'+m[2]+' cal</span><span>P: '+m[3]+'g</span><span>C: '+m[4]+'g</span><span>F: '+m[5]+'g</span></div></div>'; }).join('');
  return '<div class="card"><div class="cardhd"><h2 class="h2">Nutrition log</h2><span class="grip">⠿ ▾</span></div><div class="stack" style="gap:10px">'+meals+'</div></div>';
}
function checkinCard(){
  var body;
  if(S.reviewed){ body='<span class="opill anim-in" style="color:var(--success);border-color:color-mix(in srgb,var(--success) 45%,transparent)">✓ Reviewed</span><p class="muted" style="font-size:.82rem;margin-top:10px">Your comment reached Maya — the roster drops her off your “to review” count.</p>'; }
  else { body='<div class="grid2" style="margin:0 0 12px"><div class="statL"><div class="k">Adherence</div><div class="v">4<span class="muted" style="font-size:1rem">/10</span></div></div><div class="statL"><div class="k">Energy level</div><div class="v">4<span class="muted" style="font-size:1rem">/10</span></div></div></div>'
    +'<div class="label">Notes for coach</div><p class="dim" style="font-size:.85rem;margin:4px 0 12px">Good week. Weekend was harder but I stayed in range.</p>'
    +'<textarea class="ta" style="min-height:60px" placeholder="Optional comment for the client…"></textarea>'
    +'<button class="btn pri sm" style="margin-top:10px" data-act="review" data-tour="checkin-review">Mark reviewed</button>'; }
  var cad='<div class="row between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px" data-tour="checkin-cadence"><div class="row" style="gap:7px;flex-wrap:wrap"><span class="muted" style="font-size:.8rem">Cadence:</span>'
    +['Weekly','Biweekly','Every 3 weeks','Every 4 weeks'].map(function(c,i){ return '<button class="win-pill'+(i===0?' active':'')+'" data-act="tease">'+c+'</button>'; }).join('')
    +'</div><button class="link-g" data-act="tease">Customize questions →</button></div>';
  return '<div class="card"><div class="cardhd"><h2 class="h2">This week’s check-in</h2><span class="grip">⠿ ▾</span></div>'+cad+body+'</div>';
}
function notesCard(){
  var hist = S.notes.length
    ? '<div class="stack" style="gap:8px;margin-bottom:12px">'+S.notes.map(function(n){ return '<div class="food" style="display:block"><div class="faint" style="font-size:.68rem;margin-bottom:3px">'+n.when+'</div><div style="font-size:.84rem">'+n.text+'</div></div>'; }).join('')+'</div>'
    : '<div class="ta" style="min-height:90px;color:var(--faint);font-family:ui-monospace,monospace;font-size:.8rem;margin-bottom:12px">Notes history will appear here…</div>';
  return '<div class="card"><div class="cardhd"><h2 class="h2">Private notes</h2><span class="grip">⠿ ▾</span></div>'+hist
    +'<textarea class="ta" id="note-input" style="min-height:80px" placeholder="Add a note…"></textarea>'
    +'<div class="row" style="gap:12px;margin-top:10px"><button class="btn pri sm" data-act="note-add" data-tour="note-add">Add note</button><button class="link-g" data-act="tease">Edit history</button></div></div>';
}
function eb2(k,v,info,tour){ var tr=tour?' data-tour="'+tour+'"':''; return '<div class="eb2'+(info===1?' first':'')+'"'+tr+'><span class="eb2k">'+k+(info?' <span class="i">i</span>':'')+'</span><span class="eb2v">'+v+'</span></div>'; }
function energyCard(){
  var w=WINDOWS[S.win]; var gap=w.logged-EB_TARGET;
  var winPills=Object.keys(WINDOWS).map(function(kk){ var lbl=(parseInt(kk,10)/7)+'w'; var tr=kk==='28'?' data-tour="win-28"':''; return '<button class="win-pill'+(S.win==kk?' active':'')+'" data-act="win" data-w="'+kk+'"'+tr+'>'+lbl+'</button>'; }).join(' ');
  return '<div class="card"><div class="cardhd" style="margin-bottom:6px"><span class="label">Energy balance read</span><div class="row" style="gap:9px"><span class="faint" style="font-size:.72rem">coach-only · last '+(S.win/7)+' weeks</span>'+winPills+'</div></div>'
    +eb2('Est. maintenance','~'+fmt(w.lo)+'–'+fmt(w.hi)+' cal <span class="faint" style="font-weight:400">· '+w.note+'</span>',1,'eb-maint')
    +eb2('Weight trend','↓ '+w.trend.toFixed(1)+' lb/wk',2)
    +eb2('Logged vs target',fmt(w.logged)+' / '+fmt(EB_TARGET)+' <span style="color:var(--success);font-weight:600">· '+(gap<0?'−':'+')+Math.abs(gap)+'</span>',2)
    +'<p class="muted" style="font-size:.8rem;margin-top:12px;line-height:1.5">Vs the prior window: '+w.traj+'.</p></div>';
}
function weightCard(){
  var unitToggle='<div class="seg" role="group" aria-label="Weight unit"><button class="'+(S.unit==='kg'?'on':'')+'" data-act="unit" data-u="kg">kg</button><button class="'+(S.unit==='lbs'?'on':'')+'" data-act="unit" data-u="lbs" data-tour="unit-lbs">lbs</button></div>';
  return '<div class="card"><div class="cardhd"><h2 class="h2">Weight trend</h2>'+unitToggle+'</div><div class="chart-wrap">'+weightChartSVG()+'</div><div class="leaf-cap" data-tour="reached" style="margin-top:10px">'+SPROUT+'<span>Reached goal — first hit '+toU(GOAL_KG).toFixed(0)+' '+uName()+' on Jul 21</span></div></div>';
}
function weightChartSVG(){
  var data=WEIGHTS_KG.map(toU),avg=WAVG_KG.map(toU),goal=toU(GOAL_KG);
  var W=680,H=250,pl=44,pr=14,pt=14,pb=26;
  var min=Math.min.apply(null,data.concat([goal])),max=Math.max.apply(null,data);
  var lo=min-(S.unit==='lbs'?2:1),hi=max+(S.unit==='lbs'?2:1);
  var X=function(i){return pl+(i/(data.length-1))*(W-pl-pr);};
  var Y=function(v){return pt+(1-(v-lo)/(hi-lo))*(H-pt-pb);};
  var line=data.map(function(v,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);}).join(' ');
  var area=line+' L'+X(data.length-1).toFixed(1)+' '+Y(lo).toFixed(1)+' L'+X(0).toFixed(1)+' '+Y(lo).toFixed(1)+' Z';
  var avgLine=avg.map(function(v,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);}).join(' ');
  var ri=-1; for(var i=0;i<WEIGHTS_KG.length;i++){ if(WEIGHTS_KG[i]<=GOAL_KG){ri=i;break;} }
  var tk=''; for(var t=0;t<=4;t++){ var val=lo+(hi-lo)*t/4,yy=Y(val); tk+='<line x1="'+pl+'" y1="'+yy.toFixed(1)+'" x2="'+(W-pr)+'" y2="'+yy.toFixed(1)+'" stroke="rgba(128,128,128,0.14)"/><text x="'+(pl-6)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" fill="#888" font-size="10">'+val.toFixed(0)+'</text>'; }
  var xl=''; XLAB.forEach(function(l,i){ if(l) xl+='<text x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" fill="#888" font-size="10">'+l+'</text>'; });
  var marker=ri>=0?'<circle cx="'+X(ri).toFixed(1)+'" cy="'+Y(data[ri]).toFixed(1)+'" r="6" fill="#15803d" stroke="#fff" stroke-width="2"/>':'';
  var goalY=Y(goal).toFixed(1);
  return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Weight trend"><defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(52,211,153,0.22)"/><stop offset="1" stop-color="rgba(52,211,153,0)"/></linearGradient></defs>'+tk+xl
    +'<line x1="'+pl+'" y1="'+goalY+'" x2="'+(W-pr)+'" y2="'+goalY+'" stroke="rgba(128,128,128,0.5)" stroke-width="1.5" stroke-dasharray="6 4"/><text x="'+(W-pr)+'" y="'+(parseFloat(goalY)-5).toFixed(1)+'" text-anchor="end" fill="#aaa" font-size="10">Goal ('+toU(GOAL_KG).toFixed(0)+' '+uName()+')</text>'
    +'<path d="'+area+'" fill="url(#wg)"/><path d="'+avgLine+'" fill="none" stroke="rgba(52,211,153,0.45)" stroke-width="1.5" stroke-dasharray="4 4"/><path d="'+line+'" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+marker+'</svg>';
}
function measCard(){
  var cards=MEAS.map(function(m){ var sign=m[2]>=0?'+':''; return '<div class="statc" style="padding:16px 12px"><div class="k" style="text-transform:none;letter-spacing:0;font-size:.8rem">'+m[0]+'</div><div class="v" style="font-size:1.6rem">'+m[1].toFixed(1)+'<span class="faint" style="font-size:.72rem;font-weight:500"> cm</span></div><div class="s">'+sign+m[2].toFixed(1)+' cm</div></div>'; }).join('');
  var minis=MEAS.map(function(m){ return miniChart(m[0],m[1]-m[2],m[1]); }).join('');
  return '<div class="card" data-tour="meas"><div class="cardhd"><h2 class="h2">Body measurements</h2><span class="grip">⠿ ▾</span></div><p class="muted" style="font-size:.78rem;margin:0 0 14px">Latest Jul 12 · change since first recorded</p><div class="grid3">'+cards+'</div><div class="grid3" style="margin-top:12px">'+minis+'</div></div>';
}
function miniChart(name,first,last){
  var n=5,pts=[]; for(var i=0;i<n;i++){ var tt=i/(n-1); pts.push(first+(last-first)*tt+Math.sin(i*1.4)*Math.abs(last-first)*0.05); }
  var W=230,H=110,pl=32,pr=8,pt=12,pb=18;
  var mn=Math.min.apply(null,pts),mx=Math.max.apply(null,pts),pad=(mx-mn)*0.25||0.2,lo=mn-pad,hi=mx+pad;
  var X=function(i){return pl+(i/(n-1))*(W-pl-pr);},Y=function(v){return pt+(1-(v-lo)/(hi-lo))*(H-pt-pb);};
  var line=pts.map(function(v,i){return (i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);}).join(' ');
  var area=line+' L'+X(n-1).toFixed(1)+' '+Y(lo).toFixed(1)+' L'+X(0).toFixed(1)+' '+Y(lo).toFixed(1)+' Z';
  var dots=pts.map(function(v,i){return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="2.4" fill="#0a0a0a" stroke="#34d399" stroke-width="1.5"/>';}).join('');
  var yl='<text x="'+(pl-5)+'" y="'+(Y(hi-pad*0.4)+3).toFixed(1)+'" text-anchor="end" fill="#888" font-size="8">'+hi.toFixed(1)+'</text><text x="'+(pl-5)+'" y="'+(Y(lo+pad*0.4)).toFixed(1)+'" text-anchor="end" fill="#888" font-size="8">'+lo.toFixed(1)+'</text>';
  var xd=['05-18','06-09','07-01'],xi=[0,2,4],xl2=''; xi.forEach(function(ix,k){ xl2+='<text x="'+X(ix).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" fill="#888" font-size="8">'+xd[k]+'</text>'; });
  return '<div style="border:1px solid var(--border);border-radius:8px;padding:11px"><div style="font-size:.75rem;color:var(--text-dim);margin-bottom:2px">'+name+' <span class="faint">(cm)</span></div><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+yl+xl2+'<path d="'+area+'" fill="rgba(52,211,153,.1)"/><path d="'+line+'" fill="none" stroke="#34d399" stroke-width="2"/>'+dots+'</svg></div>';
}

/* ============ RENDER ============ */
function screenHTML(){
  if(S.ch===0) return S.open ? recordHTML() : dashHTML();
  if(S.ch===4) return dashHTML();
  return recordHTML();
}
function navHTML(){ return '<a href="#" data-act="tease" class="active">Clients</a>'+BELL+'<span class="fbk">Feedback</span><span class="avatar grn">AM</span>'; }
function render(){
  el('chapters').innerHTML=CH.map(function(c,i){ return '<button class="chapter" role="tab" aria-current="'+(i===S.ch)+'" data-act="chapter" data-i="'+i+'"><span class="num">'+c.num+'</span><span class="title">'+c.title+'</span><span class="csub">'+c.sub+'</span></button>'; }).join('');
  el('winnav').innerHTML=navHTML();
  el('screen').innerHTML=screenHTML(); el('screen').scrollTop=0;
  el('prev').disabled=S.ch===0; el('next').disabled=S.ch===CH.length-1;
  el('next').textContent=S.ch===CH.length-1?'That’s the tour':'Next workflow →';
  el('dots').innerHTML=CH.map(function(_,i){ return '<i class="'+(i===S.ch?'on':'')+'"></i>'; }).join('');
  centerActiveChapter();
  updateCallout();
}
/* On mobile the chapters are a horizontal strip; keep the active one centered.
   Sets scrollLeft on the strip ONLY (never scrollIntoView — that would scroll
   the parent landing page across the iframe boundary). */
function centerActiveChapter(){
  var wrap=el('chapters'); if(!wrap) return;
  var act=wrap.querySelector('[aria-current="true"]');
  if(!act || wrap.scrollWidth<=wrap.clientWidth+2) return; // not scrollable (desktop)
  var wr=wrap.getBoundingClientRect(), ar=act.getBoundingClientRect();
  wrap.scrollLeft += (ar.left - wr.left) - (wrap.clientWidth - act.offsetWidth)/2;
}
function setHint(t){ if(TOUR.active) return; el('hint').innerHTML=t; }
function goChapter(i){ S.ch=i; resetChapterState(); render(); startTour(); }

/* ============ TOUR ENGINE ============ */
var TOUR={active:false,done:false,i:0};
function curDef(){ return STEPS[S.ch]; }
function curSteps(){ return curDef().steps; }
function curStep(){ if(TOUR.done) return null; return curSteps()[TOUR.i]; }
function curTarget(){ var s=curStep(); if(!s||!s.el) return null; return el('screen').querySelector('[data-tour="'+s.el+'"]'); }
function startTour(){ TOUR.active=true; TOUR.done=false; TOUR.i=0; el('tour').hidden=false; addRepos(); showStep(); updateCallout(); }
function endTour(){ TOUR.active=false; TOUR.done=false; el('tour').hidden=true; removeRepos(); updateCallout(); }
function replayTour(){ resetChapterState(); render(); startTour(); }
function advanceTour(){ if(TOUR.done) return; TOUR.i++; if(TOUR.i>=curSteps().length) showDone(); else showStep(); }
function scrollTargetIntoScreen(tg){ var sc=el('screen'); if(!sc||!tg) return; var sr=sc.getBoundingClientRect(), tr=tg.getBoundingClientRect(); var frac=window.innerWidth<=640?0.28:0.5; sc.scrollTop += (tr.top - sr.top) - (sc.clientHeight*frac - tr.height/2); }
function showStep(){ var s=curStep(); if(!s){ showDone(); return; } fillStep(s,TOUR.i,curSteps().length); scrollTargetIntoScreen(curTarget()); requestAnimationFrame(place); updateCallout(); }
function showDone(){ TOUR.done=true; fillDone(curDef().done); requestAnimationFrame(place); updateCallout(); }
function nudge(){ var r=el('tring'); if(!r) return; r.classList.remove('nudge'); void r.offsetWidth; r.classList.add('nudge'); }
function fillStep(s,idx,total){ var foot=s.type==='info'?'<span></span><button class="ttip-btn" data-act="tour-next">Got it →</button>':'<span class="ttip-hint"><span class="pt"></span>Click the highlighted control</span>';
  el('ttip').innerHTML='<div class="ttip-head"><span class="ttip-step">Step '+(idx+1)+' / '+total+'</span><button class="ttip-skip" data-act="tour-skip">Skip tour</button></div><div class="ttip-title">'+s.title+'</div><div class="ttip-body">'+s.body+'</div><div class="ttip-foot">'+foot+'</div>'; }
function fillDone(msg){ var last=S.ch===CH.length-1;
  var foot = last
    ? '<a class="ttip-btn" href="/login?mode=signup&role=coach" target="_top">Start free →</a><a class="ttip-btn ghost" href="/login" target="_top">Sign in</a>'
    : '<button class="ttip-btn ghost" data-act="tour-replay">↻ Replay</button><button class="ttip-btn" data-act="tour-next-ch">Next workflow →</button>';
  el('ttip').innerHTML='<div class="ttip-head"><span class="ttip-step" style="color:var(--success)">✓ '+(last?'That’s the coach’s side of Gardnr':'Workflow complete')+'</span></div><div class="ttip-title">'+CH[S.ch].title+'</div><div class="ttip-body">'+msg+'</div><div class="ttip-foot">'+foot+'</div>'; }
function setBox(e,l,t,w,h){ e.style.left=l+'px'; e.style.top=t+'px'; e.style.width=Math.max(0,w)+'px'; e.style.height=Math.max(0,h)+'px'; }
function centerTip(W){ var tip=el('ttip'); tip.style.maxWidth=Math.min(330,W.width-24)+'px'; var tw=tip.offsetWidth,th=tip.offsetHeight; tip.style.left=clamp(W.left+W.width/2-tw/2,8,window.innerWidth-tw-8)+'px'; tip.style.top=clamp(W.top+W.height/2-th/2,8,window.innerHeight-th-8)+'px'; }
function place(){
  if(!TOUR.active) return;
  var winEl=el('window'); if(!winEl) return; var W=winEl.getBoundingClientRect();
  var panels=[el('tp-top'),el('tp-bot'),el('tp-left'),el('tp-right')]; var ring=el('tring');
  if(TOUR.done || !curTarget()){ setBox(panels[0],W.left,W.top,W.width,W.height); [panels[1],panels[2],panels[3]].forEach(function(p){p.style.width='0px';p.style.height='0px';}); ring.style.display='none'; centerTip(W); return; }
  var tg=curTarget(); var r=tg.getBoundingClientRect(); var pad=6;
  var l=Math.max(W.left,r.left-pad),t=Math.max(W.top,r.top-pad),rr=Math.min(W.right,r.right+pad),b=Math.min(W.bottom,r.bottom+pad);
  setBox(panels[0],W.left,W.top,W.width,t-W.top); setBox(panels[1],W.left,b,W.width,W.bottom-b); setBox(panels[2],W.left,t,l-W.left,b-t); setBox(panels[3],rr,t,W.right-rr,b-t);
  ring.style.display='block'; setBox(ring,l,t,rr-l,b-t);
  var s=curStep(); var tip=el('ttip');
  if(window.innerWidth<=640){ // mobile: pin the tooltip as a bottom sheet inside the app window (target sits up top)
    tip.style.maxWidth='none'; tip.style.left=(W.left+10)+'px'; tip.style.width=(W.width-20)+'px';
    tip.style.top=(W.bottom - tip.offsetHeight - 12)+'px';
    return;
  }
  tip.style.width=''; tip.style.maxWidth=Math.min(300,W.width-24)+'px'; var pl=s.place||'bottom';
  var tw=tip.offsetWidth,th=tip.offsetHeight,vw=window.innerWidth,vh=window.innerHeight,x,y;
  if(pl==='top'){ y=t-th-12; x=l; if(y<8) y=b+12; }
  else if(pl==='left'){ x=l-tw-12; y=t+(b-t)/2-th/2; if(x<8) x=rr+12; }
  else if(pl==='right'){ x=rr+12; y=t+(b-t)/2-th/2; if(x+tw>vw-8) x=l-tw-12; }
  else { y=b+12; x=l; if(y+th>vh-8) y=t-th-12; }
  tip.style.left=clamp(x,8,vw-tw-8)+'px'; tip.style.top=clamp(y,8,vh-th-8)+'px';
}
var reposFn=function(){ if(TOUR.active) place(); };
function addRepos(){ window.addEventListener('scroll',reposFn,true); window.addEventListener('resize',reposFn); }
function removeRepos(){ window.removeEventListener('scroll',reposFn,true); window.removeEventListener('resize',reposFn); }
function updateCallout(){ el('role').textContent='Coach'; var hint=el('hint'),ctl=el('callctl');
  if(TOUR.active&&!TOUR.done){ hint.innerHTML='<b>Guided tour.</b> Follow the green highlight and click it to advance.'; ctl.textContent='Skip tour'; ctl.setAttribute('data-act','tour-skip'); }
  else if(TOUR.done){ hint.innerHTML='Workflow complete — replay it, or move to the next one.'; ctl.textContent='↻ Replay tour'; ctl.setAttribute('data-act','tour-replay'); }
  else { hint.innerHTML='<b>Exploring freely.</b> Click anything — or replay the guided tour.'; ctl.textContent='↻ Replay tour'; ctl.setAttribute('data-act','tour-replay'); } }

/* ============ ACTIONS ============ */
function tourMatchesClick(t){ if(!TOUR.active||TOUR.done) return false; var s=curStep(); if(!s||s.type!=='click') return false; var tg=curTarget(); if(!tg) return false; return tg===t||tg.contains(t)||t.contains(tg); }
function handleAction(act,t,e){
  if(act==='chapter'){ goChapter(parseInt(t.getAttribute('data-i'),10)); return; }
  if(act==='prev'){ if(S.ch>0) goChapter(S.ch-1); return; }
  if(act==='next'){ if(S.ch<CH.length-1) goChapter(S.ch+1); return; }
  if(act==='tease') return;
  if(act==='sort'){ S.sort=t.getAttribute('data-sort'); el('screen').innerHTML=screenHTML(); return; }
  if(act==='open'){ S.open=t.getAttribute('data-id'); el('screen').innerHTML=screenHTML(); el('screen').scrollTop=0; return; }
  if(act==='back'){ S.open=null; el('screen').innerHTML=screenHTML(); el('screen').scrollTop=0; setHint(''); return; }
  if(act==='gw-weekly'){ S.report=true; el('screen').innerHTML=screenHTML(); return; }
  if(act==='send-report'){ S.report=false; el('screen').innerHTML=screenHTML(); setHint('✓ Report sent.'); return; }
  if(act==='discard'){ S.report=false; el('screen').innerHTML=screenHTML(); return; }
  if(act==='review'){ S.reviewed=true; el('screen').innerHTML=screenHTML(); return; }
  if(act==='unit'){ S.unit=t.getAttribute('data-u'); el('screen').innerHTML=screenHTML(); return; }
  if(act==='win'){ S.win=parseInt(t.getAttribute('data-w'),10); el('screen').innerHTML=screenHTML(); return; }
  if(act==='toggle-cal'){ S.hideCal=!S.hideCal; el('screen').innerHTML=screenHTML(); return; }
  if(act==='targets-save'){ S.targetsSaved=true; el('screen').innerHTML=screenHTML(); return; }
  if(act==='note-add'){ var ta=el('note-input'); var v=(ta&&ta.value.trim())||'Wants weekends to feel less restrictive — revisit her plan flexibility Monday.'; S.notes.unshift({when:'Jul 31, 2026',text:v}); el('screen').innerHTML=screenHTML(); return; }
  if(act==='invite-send'){ S.invited=true; el('screen').innerHTML=screenHTML(); return; }
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]'); if(!t) return; var act=t.getAttribute('data-act');
  if(act==='tour-skip'||act==='tour-explore'){ endTour(); return; }
  if(act==='tour-replay'){ replayTour(); return; }
  if(act==='tour-next'){ advanceTour(); return; }
  if(act==='tour-next-ch'){ if(S.ch<CH.length-1) goChapter(S.ch+1); return; }
  if(act==='tour-nudge'){ nudge(); return; }
  var matched=tourMatchesClick(t);
  handleAction(act,t,e);
  if(matched) advanceTour();
});

render();
startTour();
})();


/* Report content height to the embedding landing page so the iframe can size
   itself. The tour's mask/tooltip are position:fixed and don't affect layout
   height; the app "window" is a fixed 560px scroll area, so height is stable. */
(function(){
  var root = document.querySelector('.demo');
  function post(){ try { parent.postMessage({ type:'gardnr-demo-height', height: Math.ceil(root.getBoundingClientRect().height) }, '*'); } catch (e) {} }
  window.addEventListener('load', post);
  window.addEventListener('resize', post);
  if (window.ResizeObserver) { try { new ResizeObserver(post).observe(root); } catch (e) {} }
  setTimeout(post, 150); setTimeout(post, 600);
})();