'use strict';
const $=id=>document.getElementById(id);
const KEY='tibia-diary:v3';
const LEGACY_KEYS=['tibia-diary:v2','tibia-diary:v1'];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>n.toLocaleString('en-GB',{maximumFractionDigits:0});
const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const shortDate=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const weekdayLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'});
const monthName=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
function duration(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=Math.floor(seconds%60);return `${h?h+'h ':''}${m}min${s?' '+s+'s':''}`;}
let store={version:3,activeProfile:'',profiles:[]};
let state={version:2,sessions:[],preferences:Diary.preferences()};
let blocked=false,toastTimer,selectedId,confirmAction;
function warning(message){$('warning').textContent=message;$('warning').hidden=false;}
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?8000:5000);}
// randomUUID only exists in secure contexts, so plain http:// installs need a fallback.
function newId(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'session-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
function status(message,error=false){toast(message,error);}
function currentProfile(){return store.profiles.find(p=>p.id===store.activeProfile)||store.profiles[0];}
function totalHunts(){return store.profiles.reduce((n,p)=>n+p.sessions.length,0);}
function applyProfile(profile){state={version:2,sessions:profile.sessions,preferences:profile.preferences,expenses:profile.expenses||[]};}
function blankProfile(name){
  return {id:newId(),name:name||'Profile '+(store.profiles.length+1),created:Diary.today(),sessions:[],expenses:[],preferences:Diary.preferences()};
}
function readStore(){
  const raw=localStorage.getItem(KEY)||LEGACY_KEYS.map(key=>localStorage.getItem(key)).find(Boolean);
  if(!raw)return {version:3,activeProfile:'default',profiles:[{id:'default',name:'Profile 1',created:Diary.today(),sessions:[],preferences:Diary.preferences()}]};
  return Diary.validateStore(JSON.parse(raw));
}
try{store=readStore();rollPeriods();applyProfile(currentProfile());writeStore();}
catch{blocked=true;warning('Saved data could not be read. Restore a valid backup to continue.');}
function writeStore(){
  try{localStorage.setItem(KEY,JSON.stringify(store));return true;}
  catch{toast('Could not save: the browser storage is full.');return false;}
}
function save(next,restore=false){
  if(blocked&&!restore){toast('Saving is blocked to protect existing data.');return false;}
  try{
    const profile=Diary.validateProfile({...currentProfile(),sessions:next.sessions,preferences:next.preferences,expenses:next.expenses});
    store={...store,profiles:store.profiles.map(p=>p.id===profile.id?profile:p)};
    if(!writeStore())return false;
    state={version:2,sessions:profile.sessions,preferences:profile.preferences,expenses:profile.expenses};
    blocked=false;$('warning').hidden=true;render();return true;
  }catch(error){toast('Could not save: '+error.message);return false;}
}
function confirm(title,description,action){$('confirm-title').textContent=title;$('confirm-description').textContent=description;confirmAction=action;$('confirm-dialog').showModal();}
$('confirm-cancel').onclick=()=>{$('confirm-dialog').close();confirmAction=null;};
$('confirm-ok').onclick=()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();};
$('confirm-dialog').addEventListener('cancel',()=>confirmAction=null);
$('confirm-dialog').addEventListener('close',()=>confirmAction=null);
// Clicking outside the box (on the backdrop) closes the dialog.
function closeOnBackdrop(dialog,onClose){
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const box=dialog.getBoundingClientRect();
    const outside=event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom;
    if(!outside)return;
    if(onClose)onClose();
    dialog.close();
  });
}
for(const id of ['detail-dialog','backup-dialog','statement-dialog','expense-dialog','profile-dialog','settings-dialog'])closeOnBackdrop($(id));
closeOnBackdrop($('confirm-dialog'),()=>{confirmAction=null;});
function importAnalyzer(raw){
  if(!raw.trim()){status('Paste a complete report.',true);return;}
  try{
    const parsed=Diary.parse(raw);
    const previous=state.sessions.find(s=>!s.legacy&&s.start===parsed.start);
    if(previous&&previous.end===parsed.end&&previous.raw.replace(/\r/g,'').trim()===raw.replace(/\r/g,'').trim()){status('Session already saved.');return;}
    const commit=()=>{
      const session={id:previous?.id||newId(),...parsed};
      if(save({...state,sessions:[...state.sessions.filter(s=>s.id!==session.id),session],preferences:{...state.preferences,anchor:Diary.sessionDay(session,state.preferences.reset)}})){
        status(`${previous?'Updated':'Saved'}: ${dateLabel(session.date)} · ${session.start.slice(11)}–${session.end.slice(11)} · ${duration(session.seconds)} · Balance ${number(session.balance)}.`);
      }else status('Not saved. Keep a copy of your report before leaving.',true);
    };
    if(previous){confirm('Update existing session?',`A session already starts on ${dateLabel(parsed.date)} at ${parsed.start.slice(11)}. Replace it with this report?`,commit);return;}
    const overlap=state.sessions.some(s=>!s.legacy&&s.start<parsed.end&&s.end>parsed.start);
    if(overlap){confirm('Overlapping sessions', 'This overlaps a saved session. Saving both may double-count the hunt. Save anyway?',commit);return;}
    commit();
  }catch(error){status(error.message,true);}
}
// Ctrl+V anywhere on the page imports the report.
document.addEventListener('paste',e=>{
  const target=e.target;
  if(target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA)$/.test(target.tagName)))return;
  const raw=e.clipboardData?.getData('text/plain')||'';
  if(!raw.includes('Session data:'))return;
  e.preventDefault();
  importAnalyzer(raw);
});
// Profiles: one character each, with its own hunts, filters and daily reset.
function switchProfile(id){
  const profile=store.profiles.find(p=>p.id===id);
  if(!profile||profile.id===store.activeProfile)return;
  store={...store,activeProfile:id};
  applyProfile(profile);
  writeStore();
  render();
}
function addProfile(name){
  const profile=blankProfile((name||'').trim());
  store={...store,profiles:[...store.profiles,profile],activeProfile:profile.id};
  applyProfile(profile);
  writeStore();
  render();
}
function renameProfile(id,name){
  const clean=(name||'').trim().slice(0,40);
  if(!clean)return;
  store={...store,profiles:store.profiles.map(p=>p.id===id?{...p,name:clean}:p)};
  writeStore();
  renderProfiles();
}
function deleteProfile(id){
  const profile=store.profiles.find(p=>p.id===id);
  if(profile&&profile.locked){toast('This profile is locked. Unlock it first.');return;}
  if(store.profiles.length<=1){toast('At least one profile is needed.');return;}
  const profiles=store.profiles.filter(p=>p.id!==id);
  const active=store.activeProfile===id?profiles[0].id:store.activeProfile;
  store={version:3,activeProfile:active,profiles};
  applyProfile(currentProfile());
  writeStore();
  render();
}
function setProfileLock(id,locked){
  store={...store,profiles:store.profiles.map(p=>{
    if(p.id!==id)return p;
    const copy={...p};
    if(locked)copy.locked=true;else delete copy.locked;
    return copy;
  })};
  writeStore();
  renderProfiles();
  toast(locked?'Profile locked. It cannot be deleted now.':'Profile unlocked.');
}
function renderProfiles(){
  $('profile-select').innerHTML=store.profiles.map(p=>`<option value="${esc(p.id)}"${p.id===store.activeProfile?' selected':''}>${esc(p.name)}</option>`).join('');
  const current=currentProfile();
  const avatar=$('profile-avatar');
  if(current&&current.photo){avatar.src=current.photo;avatar.hidden=false;avatar.title=current.name;}
  else{avatar.removeAttribute('src');avatar.hidden=true;}
  $('profile-list').innerHTML=store.profiles.map(p=>{
    const active=p.id===store.activeProfile,locked=!!p.locked;
    const photo=p.photo
      ? `<span class="profile-avatar-wrap"><img class="profile-avatar" src="${esc(p.photo)}" alt=""><button type="button" class="profile-photo-remove" data-remove-photo="${esc(p.id)}" aria-label="Remove the photo of ${esc(p.name)}">×</button></span>`
      : `<button type="button" class="profile-avatar empty" data-pick-photo="${esc(p.id)}" aria-label="Choose a photo for ${esc(p.name)}" title="Choose a photo">+</button>`;
    const use=active?'':`<button type="button" data-use="${esc(p.id)}">Use</button>`;
    const lock=`<button type="button" class="profile-lock${locked?' locked':''}" data-toggle-lock="${esc(p.id)}" title="${locked?'Unlock this profile':'Lock this profile'}" aria-label="${locked?'Unlock':'Lock'} ${esc(p.name)}">${locked?LOCK_SVG:UNLOCK_SVG}</button>`;
    const remove=store.profiles.length>1
      ? locked?`<button type="button" class="danger" disabled title="Unlock the profile to delete it">Delete</button>`:`<button type="button" class="danger" data-delete-profile="${esc(p.id)}">Delete</button>`
      : '';
    return `<div class="profile-row${active?' current':''}">${photo}<span class="profile-name" data-profile-name="${esc(p.id)}">${esc(p.name)}</span>${lock}<span class="profile-actions">${use}<button type="button" data-pick-photo="${esc(p.id)}">Photo</button><button type="button" data-rename-profile="${esc(p.id)}">Rename</button>${remove}</span></div>`;
  }).join('')+`<button type="button" class="profile-new" data-new-profile>+ New profile</button>`;
}
// The picture is shrunk to a square PNG so it fits in the browser storage.
function resizeImage(file,max=144){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=reject;
    reader.onload=()=>{
      const image=new Image();
      image.onerror=reject;
      image.onload=()=>{
        const side=Math.min(image.width,image.height),size=Math.min(max,side);
        const canvas=document.createElement('canvas');
        canvas.width=size;canvas.height=size;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,size,size);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function pickPhoto(id){
  const input=document.createElement('input');
  input.type='file';input.accept='image/png,image/jpeg,image/webp';
  input.onchange=async()=>{
    const file=input.files&&input.files[0];
    if(!file)return;
    if(file.size>10*1024*1024){toast('That image is too large.',true);return;}
    try{
      const photo=await resizeImage(file);
      store={...store,profiles:store.profiles.map(p=>p.id===id?{...p,photo}:p)};
      if(writeStore()){render();toast('Photo saved.');}
    }catch{toast('Could not read that image.',true);}
  };
  input.click();
}
function removePhoto(id){
  store={...store,profiles:store.profiles.map(p=>{if(p.id!==id)return p;const copy={...p};delete copy.photo;return copy;})};
  writeStore();
  render();
}
function startRenameProfile(id){
  const label=document.querySelector(`#profile-list [data-profile-name="${CSS.escape(id)}"]`);
  const profile=store.profiles.find(p=>p.id===id);
  if(!label||!profile)return;
  const input=document.createElement('input');
  input.type='text';input.className='profile-rename-field';input.maxLength=40;input.value=profile.name;
  label.replaceWith(input);
  input.focus();input.select();
  let finished=false;
  const finish=commit=>{
    if(finished)return;
    finished=true;
    if(commit)renameProfile(id,input.value);else renderProfiles();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();finish(true);}
    else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  input.addEventListener('blur',()=>finish(true));
}
// The day of a session only depends on its start time and the reset hour,
// so the result is cached instead of being recalculated on every render.
const dayCache=new Map();
const day=s=>{
  const key=(s.legacy?s.date:s.start)+'|'+state.preferences.reset;
  let value=dayCache.get(key);
  if(value===undefined){
    value=Diary.sessionDay(s,state.preferences.reset);
    if(dayCache.size>20000)dayCache.clear();
    dayCache.set(key,value);
  }
  return value;
};
const visible=()=>Diary.fields.filter(f=>state.preferences.visible.includes(f.key));
function format(value,field){if(value==null)return '—';if(field.type==='time')return duration(value);if(field.type==='list')return value.length?value.map(item=>`${item.count===null?'':number(item.count)+'× '}${item.name}`).join('; '):'None';return number(value);}
function color(value,key){return key==='balance'&&value!=null?(value<0?'negative':value>0?'positive':''):'';}
function totalsMarkup(values){return visible().filter(f=>f.type!=='list').map(f=>`<div class="total"><dl><dt>${esc(f.label)}</dt><dd class="${color(values[f.key],f.key)}">${esc(format(values[f.key],f))}</dd></dl></div>`).join('');}
// Every hunt keeps its own block, so entries of different logs are never summed together.
function listBlocks(value){
  if(!value)return null;
  if(value.length&&Array.isArray(value[0].entries))return value.map(block=>({label:blockLabel(block),entries:block.entries}));
  return value.length?[{label:'',entries:value}]:[];
}
function blockLabel(block){
  if(block.start)return `${dateLabel(block.date)} · ${block.start.slice(11)}`;
  return block.date?dateLabel(block.date):'';
}
function listMarkup(values){return visible().filter(f=>f.type==='list').map(f=>{
  const blocks=listBlocks(values[f.key]);
  if(!blocks)return `<h3>${esc(f.label)}</h3><p>Not recorded in this older session.</p>`;
  if(!blocks.length)return `<h3>${esc(f.label)}</h3><p>None</p>`;
  const headings=blocks.length>1;
  return `<h3>${esc(f.label)}</h3>`+blocks.map(block=>`<div class="list-block">${headings&&block.label?`<p class="muted">${esc(block.label)}</p>`:''}<ul>${block.entries.map(item=>`<li>${esc(item.count===null?'':number(item.count)+'× ')}${esc(item.name)}</li>`).join('')}</ul></div>`).join('');
}).join('');}
// Inline SVG keeps the icon and the pencil in an exact box, with no font
// bearing, so they line up pixel by pixel with the data below.
const ICON_SVG='<svg class="card-svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="#9fd66b" d="M2 13V7h3v6H2zm4.5 0V3h3v10h-3zM11 13V9h3v4h-3z"/></svg>';
const REPORT_SVG='<svg class="card-svg" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1zm0 1.7L11.3 5H9V2.7zM5 7.5h6v1.2H5V7.5zm0 2.6h6v1.2H5v-1.2zm0-5h2.5v1.2H5V5.1z"/></svg>';
const LOCK_SVG='<svg class="card-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.2" y="7" width="9.6" height="6.6" rx="1"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/></svg>';
const UNLOCK_SVG='<svg class="card-svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.2" y="7" width="9.6" height="6.6" rx="1"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.5-1.3"/></svg>';
// Cards can be minimized, keeping only the session length and the balance.
const minimizedCards=new Set();

// One box per pasted report, in the shape of the Hunt Analyzer summary panel.
// The loot lists start collapsed and can be opened again; only the fields
// enabled in "Fields" ever reach the box.
const expandedSections=new Set();
const moneyFields=new Set(['loot','supplies','balance']);
function sessionCard(s){
  const numeric=visible().filter(f=>f.type!=='list'),listFields=visible().filter(f=>f.type==='list');
  const minimized=minimizedCards.has(s.id);
  const reported=s.reportedMinutes!=null?`${Math.floor(s.reportedMinutes/60).toString().padStart(2,'0')}:${(s.reportedMinutes%60).toString().padStart(2,'0')}h`:duration(s.seconds);
  const coin='<span class="coin" aria-hidden="true"></span>';
  // The real balance is the analyzer balance minus the costs of this hunt.
  const expenses=state.expenses.filter(e=>e.sessionId===s.id);
  const spent=expenses.reduce((n,e)=>n+e.amount,0);
  const net=(s.balance||0)-spent;
  // The minimized box keeps the session, the raw XP and the balance, one per line.
  const rows=minimized
    ? `<dt>Session:</dt><dd>${esc(reported)}</dd><dt>Raw XP:</dt><dd>${s.rawXp!=null?esc(number(s.rawXp)):'—'}</dd><dt>Balance:</dt><dd class="${color(net,'balance')}">${esc(number(net))}${moneyFields.has('balance')?coin:''}</dd>`
    : [`<dt>Session:</dt><dd>${esc(reported)}</dd>`].concat(numeric.map(f=>{
      const value=f.key==='balance'?net:s[f.key];
      return `<dt>${esc(f.label)}:</dt><dd class="${color(value,f.key)}">${esc(format(value,f))}${moneyFields.has(f.key)?coin:''}</dd>`;
    })).join('');
  const lists=minimized?'':listFields.map(f=>{
    const entries=s[f.key],key=`${s.id}:${f.key}`;
    const body=!entries?'<p class="card-note">Not recorded</p>':!entries.length?'<p class="card-note">None</p>':`<ul>${entries.map(item=>`<li>${esc(item.count===null?'':number(item.count)+'× ')}${esc(item.name)}</li>`).join('')}</ul>`;
    return `<details class="card-section" data-key="${esc(key)}"${expandedSections.has(key)?' open':''}><summary>${esc(f.label)}</summary>${body}</details>`;
  }).join('');
  const shift=day(s)!==s.date?` · Day ${shortDate(day(s))}`:'';
  const title=s.name||'Hunt Analyser';
  const toggle=`<button type="button" class="card-minimize" data-minimize="${esc(s.id)}" title="${minimized?'Expand':'Minimize'}" aria-label="${minimized?'Expand':'Minimize'} ${esc(title)}">${minimized?'+':'−'}</button>`;
  const report=`<button type="button" class="card-report" data-detail="${esc(s.id)}" title="Open the original report" aria-label="Open the original report">${REPORT_SVG}</button>`;
  return `<article class="analyser-card${minimized?' minimized':''}" draggable="true" data-id="${esc(s.id)}"><header><span class="card-heading"><span class="card-icon" aria-hidden="true">${ICON_SVG}</span><span class="card-title" data-title="${esc(s.id)}" data-rename="${esc(s.id)}" role="button" tabindex="0" title="Click to rename this hunt">${esc(title)}</span></span><span class="card-window">${report}${toggle}</span></header>${minimized?'':`<p class="card-time">${esc(s.start?s.start.slice(11):'—')} → ${esc(s.end?s.end.slice(11):'—')}${esc(shift)}</p>`}<dl>${rows}</dl>${minimized?'':`${expenseSection(s,expenses)}<div class="card-lists">${lists}</div>`}</article>`;
}
// The costs of this hunt, always visible inside the box.
function expenseSection(s,expenses){
  const rows=expenses.map(e=>{
    const {quantity,name}=Diary.parseLabel(e.label);
    const label=quantity>1?`${quantity}× ${name}`:name;
    return `<div class="card-expense"><span class="card-expense-name" role="button" tabindex="0" data-expense="${esc(e.id)}" title="Click to edit">${esc(label)}</span><span class="card-expense-amount ${e.amount>0?'negative':'positive'}" role="button" tabindex="0" data-expense-amount="${esc(e.id)}" title="Click to change the value">${e.amount>0?'−':'+'}${esc(number(Math.abs(e.amount)))}</span><span class="card-expense-remove" role="button" tabindex="0" data-remove-expense="${esc(e.id)}" aria-label="Remove ${esc(label)}">×</span></div>`;
  }).join('');
  const add=`<div class="card-expenses-head" role="button" tabindex="0" data-add-expense="${esc(s.id)}" title="Add a cost to this hunt" aria-label="Add a cost to this hunt">Expenses</div>`;
  return `<div class="card-expenses">${add}${rows||'<p class="card-note">No extra costs in this hunt.</p>'}</div>`;
}
// Hovering the amount lets the value be changed right there, without the window.
function startAmountEdit(id){
  const expense=state.expenses.find(e=>e.id===id);
  const cell=document.querySelector(`[data-expense-amount="${CSS.escape(id)}"]`);
  if(!expense||!cell)return;
  const input=document.createElement('input');
  input.type='text';input.className='card-expense-input';input.value=Math.abs(expense.amount);
  input.setAttribute('aria-label','Cost');
  cell.replaceWith(input);
  input.focus();input.select();
  let finished=false;
  const finish=commit=>{
    if(finished)return;
    finished=true;
    const value=Diary.parseAmount(input.value);
    if(commit&&value!==null&&value!==expense.amount){
      const expenses=state.expenses.map(e=>e.id===id?{...e,amount:value}:e);
      save({...state,expenses});
      return;
    }
    render();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();finish(true);}
    else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  input.addEventListener('blur',()=>finish(true));
}
// Clicking the title opens the field in place; the whole title can be edited.
function startRename(id){
  const session=state.sessions.find(s=>s.id===id);
  const title=document.querySelector(`#sessions [data-title="${CSS.escape(id)}"]`);
  if(!session||!title)return;
  const input=document.createElement('input');
  input.type='text';input.className='card-rename-field';input.maxLength=60;
  input.value=session.name||'Hunt Analyser';
  title.replaceWith(input);
  input.focus();input.select();
  let finished=false;
  const finish=commit=>{
    if(finished)return;
    finished=true;
    const value=input.value.trim().slice(0,60);
    if(commit&&value!==(session.name||'Hunt Analyser')){
      const sessions=state.sessions.map(s=>{
        if(s.id!==id)return s;
        const copy={...s};
        if(value&&value!=='Hunt Analyser')copy.name=value;else delete copy.name;
        return copy;
      });
      if(!save({...state,sessions}))render();
      return;
    }
    render();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();finish(true);}
    else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  input.addEventListener('blur',()=>finish(true));
}
function cardsMarkup(sessions){return sessions.map(sessionCard).join('');}
// The weekly list keeps every hunt of the week, so nothing disappears when
// the view moves to another day.
// Big numbers are shortened the Tibia way: 80k = 80 thousand, 80kk = 80 million.
function compact(value){
  if(value==null)return '—';
  const n=Math.abs(value),sign=value<0?'-':'';
  const trim=x=>String(Number(x.toFixed(2)));
  if(n>=1e9)return sign+trim(n/1e9)+'kkk';
  if(n>=1e6)return sign+trim(n/1e6)+'kk';
  if(n>=1e4)return sign+Math.round(n/1e3)+'k';
  if(n>=1e3)return sign+trim(n/1e3)+'k';
  return sign+number(n);
}
// The detail window of a day: every hunt, every cost and the result.
function statementMarkup(date){
  const entries=state.sessions.filter(s=>day(s)===date).sort((a,b)=>(a.start||a.date).localeCompare(b.start||b.date));
  const expenses=state.expenses.filter(e=>e.date===date);
  if(!entries.length&&!expenses.length)return {html:'',total:0};
  let total=0,rawXp=0;
  const cards=entries.map(s=>{
    const balance=s.balance||0;
    total+=balance;
    if(s.rawXp!=null)rawXp+=s.rawXp;
    const own=expenses.filter(e=>e.sessionId===s.id);
    const net=balance-own.reduce((n,e)=>n+e.amount,0);
    const stats=[
      ['Raw XP',s.rawXp!=null?compact(s.rawXp):'—'],
      ['XP Gain',number(s.xp||0)],
      ['Loot',number(s.loot||0)],
      ['Supplies',number(s.supplies||0)],
      ['Time',duration(s.seconds||0)],
    ].map(([label,value])=>`<div><span>${esc(label)}</span>${esc(value)}</div>`).join('');
    const costs=own.map(e=>{
      total-=e.amount;
      const {quantity,name}=Diary.parseLabel(e.label);
      return `<div class="statement-cost"><span class="statement-cost-name">${esc(quantity>1?`${quantity}× ${name}`:name)}</span><span class="statement-cost-value ${e.amount>0?'negative':'positive'}">${e.amount>0?'−':'+'}${esc(number(Math.abs(e.amount)))}</span></div>`;
    }).join('');
    // The time of the hunt is not shown here: the card has the duration already.
    return `<article class="statement-card"><div class="statement-head"><h3>${esc(s.name||'Hunt Analyser')}</h3></div><div class="statement-grid">${stats}</div><div class="statement-balance"><span>Balance</span><span class="${net>=0?'positive':'negative'}">${esc(number(net))}</span></div>${costs?`<div class="statement-costs"><h4>Expenses</h4>${costs}</div>`:''}</article>`;
  }).join('');
  const loose=expenses.filter(e=>!e.sessionId||!state.sessions.some(s=>s.id===e.sessionId));
  const looseRows=loose.map(e=>{
    total-=e.amount;
    return `<div class="statement-cost"><span class="statement-cost-name">${esc(e.label)}</span><span class="statement-cost-value ${e.amount>0?'negative':'positive'}">${e.amount>0?'−':'+'}${esc(number(Math.abs(e.amount)))}</span></div>`;
  }).join('');
  const totalRow=`<div class="statement-total"><span>Day total</span><span class="statement-total-xp">Raw XP ${esc(compact(rawXp))}</span><span class="${total>=0?'positive':'negative'}">${esc(number(total))}</span></div>`;
  return {html:cards+(looseRows?`<article class="statement-card"><div class="statement-costs"><h4>Other costs</h4>${looseRows}</div></article>`:'')+totalRow,total};
}
// The side panel with every day of the week or of the month.
function daysInRange(range){
  const days=[];
  const end=new Date(range.end+'T12:00:00');
  for(const start=new Date(range.start+'T12:00:00');start<=end;start.setDate(start.getDate()+1))days.push(Diary.today(start));
  return days;
}
// The totals of the week or of the month: days, hunts, raw XP and balance.
function periodSummary(kind){
  const range=Diary.period(kind,state.preferences.anchor);
  let xp=0,balance=0,hunts=0,days=0;
  for(const date of daysInRange(range)){
    const sessions=state.sessions.filter(s=>day(s)===date);
    const spent=state.expenses.filter(e=>e.date===date).reduce((n,e)=>n+e.amount,0);
    xp+=sessions.reduce((n,s)=>n+(s.rawXp||0),0);
    balance+=(Diary.aggregate(sessions).balance||0)-spent;
    if(sessions.length||spent){days++;hunts+=sessions.length;}
  }
  return {range,xp,balance,hunts,days,label:kind==='week'?`${shortDate(range.start)} – ${shortDate(range.end)}`:`${monthName(range.start)}`};
}
// One table with the date, the raw XP and the balance of every day of the
// week or of the month. The numbers are exact, so the days can be compared.
function rangeViewMarkup(kind){
  const range=Diary.period(kind,state.preferences.anchor);
  const label=kind==='week'?`${shortDate(range.start)} – ${shortDate(range.end)}`:`${monthName(range.start)}`;
  const today=Diary.currentDay(state.preferences.reset);
  const cells=daysInRange(range).map(date=>{
    const sessions=state.sessions.filter(s=>day(s)===date);
    const spent=state.expenses.filter(e=>e.date===date).reduce((n,e)=>n+e.amount,0);
    const hasXp=sessions.some(s=>s.rawXp!=null);
    const rawXp=sessions.reduce((n,s)=>n+(s.rawXp||0),0);
    const balance=(Diary.aggregate(sessions).balance||0)-spent;
    const hunts=sessions.length;
    const empty=!hunts&&!spent;
    const xp=hasXp?esc(number(rawXp)):'—';
    const bal=empty?'—':esc(number(balance));
    const sign=empty?'blank':(balance>=0?'positive':'negative');
    // The day of the day is the only one marked in the list.
    const current=date===today?' current':'';
    // The date is a real button, so the day can also be opened with the keyboard.
    const dayCell=hunts
      ? `<button type="button" class="range-link"><span class="range-weekday">${esc(weekdayLabel(date))}</span> ${esc(dateLabel(date))}</button>`
      : `<span class="range-weekday">${esc(weekdayLabel(date))}</span> ${esc(dateLabel(date))}`;
    const html=`<tr class="range-row${empty?' blank':''}${current}"${empty?'':` data-statement="${date}"`}><td class="col-date">${dayCell}</td><td class="col-xp">${xp}</td><td class="col-balance ${sign}">${bal}</td></tr>`;
    return {date,empty,html};
  });
  // Every day of the period gets a line, so the month shows the whole month.
  // The days without hunts stay thin and dim, and the ones with hunts stand out.
  const rows=cells.map(cell=>cell.html);
  // The total of the period is the last line of the table.
  const summary=periodSummary(kind);
  const totalLabel=kind==='week'?'Week total':'Month total';
  const total=`<tr class="range-row total"><td class="col-date"><span class="range-total-label">${esc(totalLabel)}</span></td><td class="col-xp">${summary.days?esc(number(summary.xp)):'—'}</td><td class="col-balance ${summary.balance>=0?'positive':'negative'}">${summary.days?esc(number(summary.balance)):'—'}</td></tr>`;
  return {label,html:`<div class="range-view"><div class="range-wrap"><table class="range-table"><thead><tr><th scope="col" class="col-date">Date</th><th scope="col" class="col-xp">Raw XP</th><th scope="col" class="col-balance">Balance</th></tr></thead><tbody>${rows.join('')}</tbody><tfoot>${total}</tfoot></table></div></div>`};
}
// The totals of the week and the month, on the bar at the bottom of the screen.
function renderTotalsBar(){
  const panel=$('totals-bar');
  const today=profileToday(currentProfile());
  const from=(store.periods&&store.periods.week)||Diary.period('week',today).start;
  const totals=storePeriodTotals(from,today);
  // On the left: the photo of every character and the sum of their balances.
  const faces=store.profiles.map(profile=>{
    const current=profile.id===store.activeProfile;
    const photo=profile.photo?`<img class="bar-face-img" src="${esc(profile.photo)}" alt="">`:'';
    const initial=esc((profile.name||'?').trim().charAt(0).toUpperCase());
    return `<span class="bar-face${current?' current':''}" data-profile="${esc(profile.id)}" title="${current?'Current profile':esc(profile.name)}">${photo||`<span class="bar-face-initial">${initial}</span>`}</span>`;
  }).join('<span class="bar-op">+</span>');
  const characters=faces?`<div class="bar-characters">${faces}<span class="bar-op">=</span><span class="bar-balance ${totals.total>=0?'positive':'negative'}">${esc(compact(totals.total))}<span class="coin"></span></span></div>`:'';
  const s=periodSummary('week');
  const sign=s.balance>=0?'positive':'negative';
  const week=`<div class="bar-total"><span class="bar-label">week total</span><span class="bar-xp">${s.days?esc(compact(s.xp)):'—'} xp</span><span class="bar-sep">|</span><span class="bar-balance ${sign}">${s.days?esc(compact(s.balance)):'—'}<span class="coin"></span></span></div>`;
  panel.innerHTML=characters+week;
  // The bar is fixed on the bottom, so the page keeps room for it.
  document.body.classList.add('has-totals-bar');
  document.body.style.paddingBottom=panel.offsetHeight+'px';
}
// Clicking a photo on the bar switches to that character.
$('totals-bar').addEventListener('click',e=>{
  const face=e.target.closest('[data-profile]');
  if(face)switchProfile(face.dataset.profile);
});
function renderRangeView(){
  const view=rangeViewMarkup(rangeKind);
  $('range-label').textContent=view.label;
  $('range-body').innerHTML=view.html;
  $('range-week').classList.toggle('active',rangeKind==='week');
  $('range-month').classList.toggle('active',rangeKind==='month');
}
function render(){
  // The week and the month turn over on their own, following the daily reset.
  if(rollPeriods())writeStore();
  const prefs=state.preferences;
  $('anchor').value=prefs.anchor;$('daily-reset').value=prefs.reset;
  $('day-button').textContent=`${weekdayLabel(prefs.anchor)} ${dateLabel(prefs.anchor)}`;
  $('field-checkboxes').innerHTML=Diary.fields.map(f=>`<label><input type="checkbox" value="${f.key}" ${prefs.visible.includes(f.key)?'checked':''}>${esc(f.label)}</label>`).join('');
  // Oldest first, so the boxes read from left to right as the day happened.
  const sessions=state.sessions.filter(s=>day(s)===prefs.anchor).sort((a,b)=>(a.start||a.date).localeCompare(b.start||b.date));
  $('sessions').innerHTML=sessions.length?cardsMarkup(sessions):'<div class="empty">No hunts for this day. Paste a report above.</div>';
  renderProfiles();
  renderCharacters();
  renderRangeView();
  renderTotalsBar();
  renderBrand();
  // An open window shows the current numbers, not the ones it had when opened.
  if($('statement-dialog').open&&statementDate){
    const statement=statementMarkup(statementDate);
    $('statement-body').innerHTML=statement.html||'<p class="muted">Nothing recorded on this day.</p>';
  }
  if($('detail-dialog').open&&selectedId){
    const session=state.sessions.find(s=>s.id===selectedId);
    if(session){
      $('detail-values').innerHTML=totalsMarkup(session);
      $('detail-lists').innerHTML=listMarkup(session);
    }
  }
}
// The app title can be renamed by clicking it.
function renderBrand(){$('brand').textContent=store.title||'Tibia Diary';}
function startBrandRename(){
  const brand=$('brand');
  const input=document.createElement('input');
  input.type='text';input.className='brand-rename';input.maxLength=60;input.value=store.title||'Tibia Diary';
  brand.replaceWith(input);
  input.focus();input.select();
  let finished=false;
  const finish=commit=>{
    if(finished)return;
    finished=true;
    if(commit){
      const value=input.value.trim().slice(0,60);
      store={...store,title:value};
      writeStore();
    }
    input.replaceWith(brand);
    renderBrand();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();finish(true);}
    else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  input.addEventListener('blur',()=>finish(true));
}
$('brand').onclick=()=>startBrandRename();
// The day of today for a profile, following its own daily reset.
function profileToday(profile){
  const reset=profile&&profile.preferences?profile.preferences.reset:'00:00';
  return Diary.currentDay(reset);
}
const dayBefore=date=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-1);return Diary.today(d);};
// The totals of one profile inside a period: the raw XP and the balance of the
// hunts of that period, with the extra costs deducted.
function profilePeriodTotals(profile,from,to){
  const reset=profile.preferences?profile.preferences.reset:'00:00';
  const sessions=profile.sessions.filter(s=>{
    const d=Diary.sessionDay(s,reset);
    return d>=from&&d<=to;
  });
  const balance=Diary.aggregate(sessions).balance||0;
  const spent=(profile.expenses||[]).filter(e=>e.date>=from&&e.date<=to).reduce((n,e)=>n+e.amount,0);
  return {hunts:sessions.length,xp:sessions.reduce((n,s)=>n+(s.rawXp||0),0),profit:balance-spent};
}
// The sum of every profile in a period: the log of a closed period.
function storePeriodTotals(from,to){
  let xp=0,total=0;
  for(const profile of store.profiles){
    const t=profilePeriodTotals(profile,from,to);
    xp+=t.xp;total+=t.profit;
  }
  return {xp,total};
}
// A closed period goes to the log, with the sum of every profile.
function archivePeriod(kind,from,to){
  if(!from||to<from)return;
  const totals=storePeriodTotals(from,to);
  store.history=[{kind,from,to,xp:totals.xp,total:totals.total},...(store.history||[])];
  if(store.history.length>240)store.history.length=240;
}
// When the week or the month turns over, the closed period goes to the log and
// the totals start again. The daily reset of the profile decides the day.
function rollPeriods(){
  const today=profileToday(currentProfile());
  let changed=false;
  store.periods=store.periods||{};
  for(const kind of ['week','month']){
    const start=Diary.period(kind,today).start;
    const from=store.periods[kind];
    if(!from){store.periods[kind]=start;changed=true;continue;}
    if(from>=start)continue;//the period in progress is still open
    archivePeriod(kind,from,dayBefore(start));
    store.periods[kind]=start;
    changed=true;
  }
  return changed;
}
// The user can close a period by hand: the totals start again from today.
function resetPeriod(kind){
  const today=profileToday(currentProfile());
  const from=store.periods&&store.periods[kind];
  const last=dayBefore(today);
  if(from&&last>=from)archivePeriod(kind,from,last);
  store.periods=store.periods||{};
  store.periods[kind]=today;
  writeStore();
  render();
}
// The characters view: the period in progress and the log of the closed ones.
$('character-week').onclick=()=>{characterKind='week';renderCharacters();};
$('character-month').onclick=()=>{characterKind='month';renderCharacters();};
$('character-reset').onclick=()=>{
  const kind=characterKind;
  confirm(`Reset the ${kind} total?`,'The totals start again from today and the closed period goes to the log.',()=>resetPeriod(kind));
};
// The profit of every profile, with the extra costs already deducted.
function renderCharacters(){
  const kind=characterKind;
  const today=profileToday(currentProfile());
  const from=(store.periods&&store.periods[kind])||Diary.period(kind,today).start;
  let total=0,totalXp=0;
  const rows=store.profiles.map(profile=>{
    const t=profilePeriodTotals(profile,from,today);
    total+=t.profit;totalXp+=t.xp;
    const current=profile.id===store.activeProfile;
    // One column per profile: the nick on top and the numbers below.
    return `<div class="character-card${current?' current':''}"><div class="character-card-name">${esc(profile.name)}</div><div class="character-card-row"><span class="character-label">Raw XP</span><span class="character-value">${t.hunts?esc(number(t.xp)):'—'}</span></div><div class="character-card-row"><span class="character-label">Profit</span><span class="character-value ${t.profit>=0?'positive':'negative'}">${esc(number(t.profit))}</span></div></div>`;
  }).join('');
  $('character-list').innerHTML=rows;
  $('character-total').innerHTML=`<span>${esc(number(totalXp))}</span><span class="character-sep">|</span><span class="${total>=0?'positive':'negative'}">${esc(number(total))}</span>`;
  $('character-week').classList.toggle('active',kind==='week');
  $('character-month').classList.toggle('active',kind==='month');
  $('character-range').textContent=kind==='week'?`${shortDate(from)} – ${shortDate(Diary.period('week',today).end)}`:`${monthName(from)}`;
  $('character-reset').textContent=kind==='week'?'Reset week':'Reset month';
  $('character-reset').title=`Start the ${kind} totals again from today. The closed period goes to the log.`;
  // The log of the periods already closed.
  const history=store.history||[];
  $('character-history').innerHTML=history.length
    ? `<h3 class="history-title">Log</h3>${history.map(entry=>{
      const label=entry.kind==='month'?monthName(entry.from):`${shortDate(entry.from)} – ${shortDate(entry.to)}`;
      const name=entry.kind==='month'?'Month':'Week';
      return `<div class="history-row"><span class="history-kind">${name}</span><span class="history-range">${esc(label)}</span><span class="history-total ${entry.total>=0?'positive':'negative'}">${esc(number(entry.total))}</span></div>`;
    }).join('')}`
    : '<p class="muted">No closed period yet.</p>';
}
function showTab(name){
  $('view-hunts').hidden=name!=='hunts';
  $('view-calendar').hidden=name!=='calendar';
  $('view-characters').hidden=name!=='characters';
  for(const tab of document.querySelectorAll('.side-tab'))tab.classList.toggle('active',tab.dataset.tab===name);
  if(name==='characters')renderCharacters();
  if(name==='calendar')renderRangeView();
  window.scrollTo({top:0,behavior:'smooth'});
}
for(const tab of document.querySelectorAll('.side-tab'))tab.onclick=()=>showTab(tab.dataset.tab);
$('range-week').onclick=()=>{rangeKind='week';renderRangeView();};
$('range-month').onclick=()=>{rangeKind='month';renderRangeView();};
// The button in the dates area takes the user straight to today's hunts.
$('range-today').onclick=()=>{
  updatePrefs({anchor:Diary.currentDay(state.preferences.reset)});
  showTab('hunts');
};
$('range-body').addEventListener('click',e=>{const row=e.target.closest('[data-statement]');if(row)openStatement(row.dataset.statement);});
// The extra costs of a hunt, kept inside its box.
let editingExpense=null,editingSession='';
function openExpenseForm(id,sessionId){
  const expense=id?state.expenses.find(e=>e.id===id):null;
  editingExpense=expense?expense.id:null;
  editingSession=expense?expense.sessionId:(sessionId||'');
  $('expense-dialog-title').textContent=expense?'Edit expense':'Add expense';
  $('expense-label').value=expense?expense.label:'';
  // The field shows the price of one item, so the quantity is not applied twice.
  const quantity=expense?(expense.quantity||1):1;
  $('expense-amount').value=expense?Math.round(expense.amount/quantity):'';
  $('expense-save').textContent=expense?'Save':'Add';
  $('expense-remove').hidden=!expense;
  $('expense-dialog').showModal();
  updateExpensePreview();
  $('expense-label').focus();
}
function closeExpenseForm(){
  editingExpense=null;
  editingSession='';
  $('expense-dialog').close();
  $('expense-label').value='';$('expense-amount').value='';
  $('expense-preview').textContent='';
  $('expense-save').textContent='Add';
}
function updateExpensePreview(){
  const unit=Diary.parseAmount($('expense-amount').value);
  const {quantity}=Diary.parseLabel($('expense-label').value);
  $('expense-preview').textContent=unit===null?'':`= ${number(unit*quantity)}${quantity>1?` (${quantity}×)`:''}`;
}
function saveExpense(){
  const label=$('expense-label').value.trim();
  const unit=Diary.parseAmount($('expense-amount').value);
  if(!label||unit===null||unit===0){toast('Type a description and a cost (e.g. 80k).',true);return;}
  const {quantity}=Diary.parseLabel(label);
  const amount=unit*quantity;
  if(!Number.isSafeInteger(amount)||Math.abs(amount)>1e12){toast('That cost is too high.',true);return;}
  const session=editingSession?state.sessions.find(s=>s.id===editingSession):null;
  const date=session?day(session):state.preferences.anchor;
  const expenses=editingExpense
    ? state.expenses.map(e=>e.id===editingExpense?{...e,label,amount,quantity}:e)
    : [...state.expenses,{id:newId(),label,amount,quantity,date,sessionId:editingSession}];
  closeExpenseForm();
  save({...state,expenses});
}
function deleteExpense(id){save({...state,expenses:state.expenses.filter(e=>e.id!==id)});}
$('expense-remove').onclick=()=>{if(editingExpense)deleteExpense(editingExpense);closeExpenseForm();};
$('expense-amount').addEventListener('input',updateExpensePreview);
$('expense-label').addEventListener('input',updateExpensePreview);
$('expense-form').addEventListener('submit',e=>{e.preventDefault();saveExpense();});
// Inside a box: the title adds a cost to that hunt, the name edits it,
// the amount is changed in place and the x removes it.
$('sessions').addEventListener('click',e=>{
  const add=e.target.closest('[data-add-expense]');
  if(add){e.stopPropagation();openExpenseForm(null,add.dataset.addExpense);return;}
  const amount=e.target.closest('[data-expense-amount]');
  if(amount){e.stopPropagation();startAmountEdit(amount.dataset.expenseAmount);return;}
  const edit=e.target.closest('[data-expense]');
  if(edit){e.stopPropagation();openExpenseForm(edit.dataset.expense);return;}
  const remove=e.target.closest('[data-remove-expense]');
  if(remove){e.stopPropagation();deleteExpense(remove.dataset.removeExpense);return;}
});
$('sessions').addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const target=e.target.closest('[role="button"]');
  if(!target)return;
  e.preventDefault();
  target.click();
});
function updatePrefs(patch){save({...state,preferences:{...state.preferences,...patch}});}
$('field-checkboxes').addEventListener('change',()=>updatePrefs({visible:[...$('field-checkboxes').querySelectorAll('input:checked')].map(input=>input.value)}));
$('reset-fields').onclick=()=>updatePrefs({visible:[...Diary.defaults]});
function openStatement(date){
  statementDate=date;
  const statement=statementMarkup(date);
  $('statement-title').textContent=dateLabel(date);
  $('statement-body').innerHTML=statement.html||'<p class="muted">Nothing recorded on this day.</p>';
  $('statement-dialog').showModal();
}
$('daily-reset').onchange=()=>{const reset=$('daily-reset').value;if(Diary.validReset(reset))updatePrefs({reset});else $('daily-reset').value=state.preferences.reset;};
$('anchor').onchange=()=>{const value=$('anchor').value;if(Diary.validDate(value))updatePrefs({anchor:value});else $('anchor').value=state.preferences.anchor;};
// The date is shown as plain text; clicking it opens the native picker.
$('day-button').onclick=()=>{const input=$('anchor');if(input.showPicker){try{input.showPicker();return;}catch{}}input.focus();};
$('settings-open').onclick=()=>$('settings-dialog').showModal();
// Profile controls in the header.
$('profile-select').onchange=e=>switchProfile(e.target.value);
// The + in the side menu opens the profiles window, where they are edited.
$('profile-add').onclick=()=>{renderProfiles();$('profile-dialog').showModal();};
$('profile-list').addEventListener('click',e=>{
  const create=e.target.closest('[data-new-profile]');
  if(create){
    const profile=blankProfile();
    store={...store,profiles:[...store.profiles,profile],activeProfile:profile.id};
    applyProfile(profile);
    writeStore();
    renderProfiles();
    startRenameProfile(profile.id);
    return;
  }
  const lock=e.target.closest('[data-toggle-lock]');
  if(lock){const profile=store.profiles.find(p=>p.id===lock.dataset.toggleLock);setProfileLock(profile.id,!profile.locked);return;}
  const removePhotoButton=e.target.closest('[data-remove-photo]');
  if(removePhotoButton){removePhoto(removePhotoButton.dataset.removePhoto);return;}
  const pick=e.target.closest('[data-pick-photo]');
  if(pick){pickPhoto(pick.dataset.pickPhoto);return;}
  const use=e.target.closest('[data-use]');
  if(use){switchProfile(use.dataset.use);$('profile-dialog').close();return;}
  const rename=e.target.closest('[data-rename-profile]');
  if(rename){startRenameProfile(rename.dataset.renameProfile);return;}
  const remove=e.target.closest('[data-delete-profile]');
  if(remove){
    const profile=store.profiles.find(p=>p.id===remove.dataset.deleteProfile);
    if(!profile)return;
    confirm('Delete profile?',`"${profile.name}" and its ${profile.sessions.length} hunts will be removed. This cannot be undone.`,()=>deleteProfile(profile.id));
  }
});
function detail(id){const s=state.sessions.find(s=>s.id===id);if(!s)return;selectedId=id;$('detail-title').textContent=s.name||'Session on '+dateLabel(s.date);$('detail-name').value=s.name||'Hunt Analyser';$('detail-time').textContent=s.legacy?'Older manual entry. Time and additional fields were not recorded.':`${s.start.slice(11)} → ${dateLabel(s.end.slice(0,10))} ${s.end.slice(11)} · ${duration(s.seconds)} · Reported duration: ${Math.floor(s.reportedMinutes/60).toString().padStart(2,'0')}:${(s.reportedMinutes%60).toString().padStart(2,'0')}h${s.durationMismatch?' — the report states a different length than the header window':''}`;$('detail-values').innerHTML=totalsMarkup(s);$('detail-values').hidden=!$('detail-values').innerHTML;$('detail-lists').innerHTML=listMarkup(s);$('detail-raw').textContent=s.raw||`Character: ${s.character}\nNote: ${s.notes}\nTime: ${duration(s.seconds)}\nXP: ${s.xp}\nProfit: ${s.balance}`;$('detail-dialog').showModal();}
// The name replaces the whole title, so "Hunt Analyser" can be dropped.
function saveSessionName(id,value){
  const clean=String(value||'').trim().slice(0,60);
  const sessions=state.sessions.map(s=>{
    if(s.id!==id)return s;
    const copy={...s};
    if(clean&&clean!=='Hunt Analyser')copy.name=clean;else delete copy.name;
    return copy;
  });
  save({...state,sessions});
}
$('detail-name-save').onclick=()=>{saveSessionName(selectedId,$('detail-name').value);toast('Name saved.');};
$('sessions').addEventListener('click',e=>{
  const minimize=e.target.closest('[data-minimize]');
  if(minimize){
    const id=minimize.dataset.minimize;
    if(minimizedCards.has(id))minimizedCards.delete(id);else minimizedCards.add(id);
    render();
    return;
  }
  const rename=e.target.closest('[data-rename]');
  if(rename){startRename(rename.dataset.rename);return;}
  const button=e.target.closest('[data-detail]');
  if(button)detail(button.dataset.detail);
});
// The toggle event does not bubble, so it is captured to remember opened lists between renders.
$('sessions').addEventListener('toggle',e=>{
  const details=e.target;
  if(!details.dataset||!details.dataset.key||!details.isConnected)return;
  if(details.open)expandedSections.add(details.dataset.key);else expandedSections.delete(details.dataset.key);
},true);
// Drag a hunt to the trash to delete it.
let draggedSession=null,statementDate=null,rangeKind='week',characterKind='week';
function endDrag(){
  document.body.classList.remove('dragging');
  for(const card of document.querySelectorAll('.analyser-card.dragging'))card.classList.remove('dragging');
  $('trash').classList.remove('over');
  draggedSession=null;
}
document.addEventListener('dragstart',e=>{
  const card=e.target.closest?.('.analyser-card');
  if(!card)return;
  draggedSession=card.dataset.id;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',draggedSession);
  document.body.classList.add('dragging');
  card.classList.add('dragging');
});
document.addEventListener('dragend',endDrag);
$('trash').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';$('trash').classList.add('over');});
$('trash').addEventListener('dragleave',()=>$('trash').classList.remove('over'));
$('trash').addEventListener('drop',e=>{
  e.preventDefault();
  const id=e.dataTransfer.getData('text/plain')||draggedSession;
  // The card is removed from the page, so the state is cleared here.
  endDrag();
  if(id)deleteSession(id);
});
function deleteSession(id){
  // The costs of the hunt go away with it.
  if(!save({...state,sessions:state.sessions.filter(s=>s.id!==id),expenses:state.expenses.filter(e=>e.sessionId!==id)}))return;
  toast('Session deleted.');
}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
$('backup-open').onclick=()=>{$('backup-status').textContent=`${store.profiles.length} profile${store.profiles.length===1?'':'s'} · ${totalHunts()} saved hunts.`;$('backup-dialog').showModal();};
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export-json').onclick=()=>download(`tibia-diary-${Diary.today()}.json`,JSON.stringify({...store,exportedAt:new Date().toISOString()},null,2),'application/json');
$('export-csv').onclick=()=>download(`tibia-diary-${currentProfile().name}.csv`,Diary.csv(state.sessions,state.preferences.reset),'text/csv;charset=utf-8');
$('import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    if(file.size>20000000)throw new Error('Backup size limit: 20 MB.');
    const data=Diary.validateStore(JSON.parse(await file.text()));
    const hunts=data.profiles.reduce((n,p)=>n+p.sessions.length,0);
    confirm('Restore backup?',`Replace your ${store.profiles.length} profile(s) and ${totalHunts()} hunts with ${data.profiles.length} profile(s) and ${hunts} hunts from this backup?`,()=>{
      store=data;
      applyProfile(currentProfile());
      if(writeStore()){
        blocked=false;$('warning').hidden=true;render();
        $('backup-status').textContent='Backup restored.';toast('Backup restored.');
      }else $('backup-status').textContent='Could not restore: the browser storage is full.';
    });
  }catch(error){$('backup-status').textContent='Could not restore: '+error.message;}
};
window.addEventListener('storage',e=>{
  if(e.key!==KEY)return;
  try{
    store=e.newValue?Diary.validateStore(JSON.parse(e.newValue)):{version:3,activeProfile:'default',profiles:[{id:'default',name:'Profile 1',created:Diary.today(),sessions:[],preferences:Diary.preferences()}]};
    applyProfile(currentProfile());
    blocked=false;render();toast('Updated from another tab.');
  }catch{blocked=true;warning('Could not read changes from another tab.');}
});
render();
