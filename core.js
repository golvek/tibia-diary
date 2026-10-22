(function(root) {
  'use strict';

  // Every field drives parsing, aggregation, CSV export and the settings panel.
  const fields = [
    ['seconds','Time','time'],['rawXp','Raw XP Gain'],['xp','XP Gain'],['rawXpRate','Raw XP/h','rate','rawXp'],['xpRate','XP/h','rate','xp'],
    ['loot','Loot'],['supplies','Supplies'],['balance','Balance'],['damage','Damage'],['damageRate','Damage/h','rate','damage'],['healing','Healing'],['healingRate','Healing/h','rate','healing'],['monsters','Killed Monsters','list'],['items','Looted Items','list']
  ].map(([key,label,type='number',base])=>({key,label,type,base}));
  const defaults = ['seconds','xp','xpRate','loot','supplies','balance'];

  const MAX_REPORT_LENGTH = 200000;
  const MAX_SESSION_SECONDS = 366*86400;
  const REPORT_HEADER = /^Session data: From (\d{4}-\d{2}-\d{2}), (\d{2}:\d{2}:\d{2}) to (\d{4}-\d{2}-\d{2}), (\d{2}:\d{2}:\d{2})$/;
  const SESSION_LENGTH = /^(\d{1,4}):([0-5]\d)h$/;
  const FIELD_LINE = /^([^:]+):\s*(.*)$/;
  const COUNTED_ENTRY = /^([\d,.]+)\s*x\s+(.+)$/i;
  const SECTIONS = {'Killed Monsters':'monsters','Looted Items':'items'};
  const PERIODS = ['day','week','month','all'];

  const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

  function validDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T12:00:00');return !Number.isNaN(d.getTime())&&today(d)===value&&value>='1900-01-01';
  }

  function timestamp(value) {
    if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)||!validDate(value.slice(0,10)))throw new Error('Invalid date or time in the header.');
    const [h,m,s]=value.slice(11).split(':').map(Number);if(h>23||m>59||s>59)throw new Error('Invalid time in the header.');
    // UTC is used only for arithmetic on the wall-clock times from Tibia, without timezone conversion.
    return Date.parse(value.replace(' ','T')+'Z');
  }

  function parseInteger(value, negative=false) {
    const raw=String(value).trim();
    if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(raw))throw new Error('Invalid number: '+raw);
    const n=Number(raw.replace(/[.,]/g,''));
    if(!Number.isSafeInteger(n)||Math.abs(n)>1e12||(!negative&&n<0))throw new Error('Number is outside the supported range.');return n;
  }

  // Amounts can be typed with a suffix: 1k = 1000, 10k = 10000, 1kk = 1000000.
  function parseAmount(value) {
    const raw=String(value??'').trim().toLowerCase().replace(/\s/g,'');
    if(!raw)return null;
    const match=raw.match(/^(-)?(\d[\d.,]*)(kk|k|m)?$/);
    if(!match)return null;
    const negative=match[1]==='-',digits=match[2],suffix=match[3]||'';
    let number;
    if(suffix) {
      const normalized=digits.replace(/,/g,'.').replace(/(\d)\.(\d{3})$/,'$1$2');
      number=Number(normalized);
      if(suffix==='k')number*=1000;
      else if(suffix==='kk'||suffix==='m')number*=1000000;
    } else {
      number=Number(digits.replace(/[.,]/g,''));
    }
    if(!Number.isFinite(number))return null;
    const result=Math.round(number);
    if(!Number.isSafeInteger(result)||Math.abs(result)>1e12)return null;
    return negative?-result:result;
  }

  function parseList(lines) {    return lines.map(line=>line.trim()).filter(line=>line&&line.toLowerCase()!=='none').map(line=>{
      const match=line.match(COUNTED_ENTRY);
      return match?{name:match[2],count:parseInteger(match[1])}:{name:line,count:null};
    });
  }

  // A list section ends at the first line that is neither indented nor a "12x rat" entry.
  // Everything after it belongs to the report body, so trailing text never becomes loot.
  function closesSection(line,trimmed) {
    if(/^\s/.test(line))return false;
    if(/^none$/i.test(trimmed))return false;
    return !COUNTED_ENTRY.test(trimmed);
  }

  function sectionLabel(line) {
    if(!line.endsWith(':'))return null;
    const label=line.slice(0,-1);
    return SECTIONS[label]?label:null;
  }

  function parse(raw) {
    if(typeof raw!=='string'||raw.length>MAX_REPORT_LENGTH)throw new Error('Paste a Hunt Analyzer report of up to 200,000 characters.');
    const lines=raw.replace(/\r\n?/g,'\n').trim().split('\n');
    const header=lines[0]?.trim().match(REPORT_HEADER);
    if(!header)throw new Error('Paste the full report, starting with “Session data: From …”.');
    const start=header[1]+' '+header[2],end=header[3]+' '+header[4],seconds=(timestamp(end)-timestamp(start))/1000;
    if(seconds<=0||seconds>MAX_SESSION_SECONDS)throw new Error('The session must end after it starts.');
    const values=new Map();const lists={monsters:[],items:[]};let section=null;let ended=false;
    for(const line of lines.slice(1)) {
      if(ended)continue;
      const trimmed=line.trim();if(!trimmed)continue;
      if(section) {
        if(!closesSection(line,trimmed)){lists[section].push(trimmed);continue;}
        section=null;
        if(!trimmed.includes(':')){ended=true;continue;}// plain text pasted after the report is ignored
      }
      const label=sectionLabel(trimmed);
      if(label){if(values.has(label))throw new Error('Duplicate section.');values.set(label,true);section=SECTIONS[label];continue;}
      const match=trimmed.match(FIELD_LINE);if(!match)throw new Error('Unrecognized line: '+trimmed);
      if(values.has(match[1]))throw new Error('Duplicate field: '+match[1]);values.set(match[1],match[2]);
    }
    const session=String(values.get('Session')||'').match(SESSION_LENGTH);
    if(!session)throw new Error('Missing or invalid Session field (e.g. 00:05h).');
    const reportedMinutes=Number(session[1])*60+Number(session[2]);
    const result={start,end,date:header[1],seconds,reportedMinutes,raw};
    // The report states its own length; flag it when it disagrees with the header window.
    result.durationMismatch=Math.abs(reportedMinutes-seconds/60)>1;
    for(const field of fields.filter(f=>f.type==='number'||f.type==='rate')) {
      if(!values.has(field.label))throw new Error('Missing field: '+field.label+'. Paste the complete report.');
      result[field.key]=parseInteger(values.get(field.label),field.key==='balance');
    }
    for(const [key,label] of [['monsters','Killed Monsters'],['items','Looted Items']]) {
      if(!values.has(label))throw new Error('Missing section: '+label+'.');
      result[key]=parseList(lists[key]);
    }
    return result;
  }

  // Reports are immutable, so the same text always yields the same result.
  // Caching keeps repeated validations (every save) cheap with thousands of sessions.
  const parseCache=new Map();const PARSE_CACHE_LIMIT=100;
  function parseCached(raw) {
    if(!parseCache.has(raw)) {
      if(parseCache.size>=PARSE_CACHE_LIMIT)parseCache.delete(parseCache.keys().next().value);
      parseCache.set(raw,parse(raw));
    }
    const cached=parseCache.get(raw);
    return {...cached,monsters:cached.monsters.map(item=>({...item})),items:cached.items.map(item=>({...item}))};
  }

  const validReset = value => typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

  // A hunt may be given a custom title; it is kept only when it has content.
  const cleanName = value => typeof value==='string'?value.trim().slice(0,60):'';
  function withName(session,name) {
    const clean=cleanName(name);
    if(clean)session.name=clean;
    return session;
  }
  // The tab of a hunt: the group of hunts that share the same name.
  const cleanGroup = value => typeof value==='string'?value.trim().slice(0,40):'';
  function withGroup(session,group) {
    const clean=cleanGroup(group);
    if(clean)session.group=clean;
    return session;
  }
  // The tabs of a profile: the names of the hunts, in the order they were made.
  function validateTabs(value) {
    if(!Array.isArray(value))return [];
    const tabs=[];
    for(const name of value) {
      if(typeof name!=='string')continue;
      const clean=name.trim().slice(0,40);
      if(clean&&!tabs.includes(clean))tabs.push(clean);
      if(tabs.length>=30)break;
    }
    return tabs;
  }

  function sessionDay(session,reset='00:00') {
    if(!validReset(reset))throw new Error('Invalid daily reset time.');
    // Legacy records have no start time: keep their recorded date.
    if(!session.start) {
      if(!validDate(session.date))throw new Error('Session has no valid date.');
      return session.date;
    }
    const [hours,minutes]=reset.split(':').map(Number);
    return new Date(timestamp(session.start)-(hours*60+minutes)*60000).toISOString().slice(0,10);
  }

  function currentDay(reset='00:00',now=new Date()) {
    const time=[now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
    return sessionDay({start:today(now)+' '+time},reset);
  }

  function preferences(p={}) {
    const source=p&&typeof p==='object'?p:{};
    const reset=validReset(source.reset)?source.reset:'00:00';
    let visible=[...defaults];
    if(Array.isArray(source.visible)) {
      const filtered=[...new Set(source.visible.filter(k=>fields.some(f=>f.key===k)))];
      // An empty selection is valid; a selection of unknown fields is not.
      visible=filtered.length?filtered:(source.visible.length?[...defaults]:[]);
    }
    const result={visible,period:PERIODS.includes(source.period)?source.period:'day',anchor:validDate(source.anchor)?source.anchor:currentDay(reset),reset};
    // The characters can be hidden from the bottom bar of the screen.
    if(source.characters===false)result.characters=false;
    return result;
  }

  function validate(data) {
    if(!data||![1,2].includes(data.version)||!Array.isArray(data.sessions)||data.sessions.length>5000)throw new Error('Invalid backup or more than 5,000 sessions.');
    const ids=new Set();const sessions=data.sessions.map(s=>{
      if(!s||typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)||ids.has(s.id))throw new Error('Invalid or duplicate session ID.');ids.add(s.id);
      if(data.version===1||s.legacy) {
        if(!validDate(s.date)||!Number.isInteger(s.minutes)||s.minutes<1||s.minutes>1440||!Number.isSafeInteger(s.xp)||s.xp<0||s.xp>1e12||!Number.isSafeInteger(s.profit)||Math.abs(s.profit)>1e12)throw new Error('Invalid legacy session.');
        return withGroup(withName({id:s.id,legacy:true,date:s.date,minutes:s.minutes,seconds:s.minutes*60,xp:s.xp,profit:s.profit,balance:s.profit,character:String(s.character||'').slice(0,80),notes:String(s.notes||'').slice(0,2000)},s.name),s.group);
      }
      return withGroup(withName({id:s.id,...parseCached(s.raw)},s.name),s.group);
    });
    return {version:2,sessions,preferences:preferences(data.preferences)};
  }

  function period(kind,anchor=today()) {
    const now=new Date(anchor+'T12:00:00'),start=new Date(now),end=new Date(now);
    if(kind==='week'){start.setDate(start.getDate()-(start.getDay()+6)%7);end.setTime(start.getTime());end.setDate(end.getDate()+6);}
    else if(kind==='month'){start.setDate(1);end.setMonth(end.getMonth()+1,0);}
    else if(kind!=='day'&&kind!=='all')throw new Error('Unknown period: '+kind);
    return {start:today(start),end:today(end)};
  }

  // A description may start with a quantity: "2 silver token" or "2x silver token".
  function parseLabel(label) {
    const text=String(label??'').trim();
    const match=text.match(/^(\d+)\s*(?:x\s*|\s+)(.+)$/i);
    if(!match)return {quantity:1,name:text};
    const quantity=Number(match[1]);
    return Number.isSafeInteger(quantity)&&quantity>0?{quantity,name:match[2].trim()}:{quantity:1,name:text};
  }

  // A profile is one character: its own hunts, filters and daily reset.
  function validateExpense(expense) {
    if(!expense||typeof expense!=='object')throw new Error('Invalid expense.');
    if(typeof expense.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(expense.id))throw new Error('Invalid expense ID.');
    const label=String(expense.label??'').trim().slice(0,60);
    if(!label)throw new Error('The expense needs a description.');
    const amount=Number(expense.amount);
    if(!Number.isSafeInteger(amount)||Math.abs(amount)>1e12)throw new Error('Invalid expense amount.');
    if(!validDate(expense.date))throw new Error('Invalid expense date.');
    // The expense can belong to a hunt, so it shows up inside that box.
    const sessionId=typeof expense.sessionId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(expense.sessionId)?expense.sessionId:'';
    return {id:expense.id,label,amount,quantity:parseLabel(label).quantity,date:expense.date,sessionId};
  }

  // A preset of expense: a description and the price of one item.
  function validatePreset(preset) {
    if(!preset||typeof preset!=='object')throw new Error('Invalid preset.');
    if(typeof preset.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(preset.id))throw new Error('Invalid preset ID.');
    const label=String(preset.label??'').trim().slice(0,60);
    if(!label)throw new Error('The preset needs a description.');
    const amount=Number(preset.amount);
    if(!Number.isSafeInteger(amount)||Math.abs(amount)>1e12)throw new Error('Invalid preset amount.');
    const result={id:preset.id,label,amount,quantity:parseLabel(label).quantity};
    // The picture of the item, kept in the assets folder.
    const icon=String(preset.icon??'').trim().slice(0,80);
    if(/^[A-Za-z0-9._-]+\.(gif|png|jpg|jpeg|webp)$/i.test(icon))result.icon=icon;
    // A pinned item shows up in the bar of the tabs.
    if(preset.pinned===true)result.pinned=true;
    return result;
  }

  function validateProfile(profile,version=2) {
    if(!profile||typeof profile!=='object')throw new Error('Invalid profile.');
    if(typeof profile.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(profile.id))throw new Error('Invalid profile ID.');
    const name=typeof profile.name==='string'&&profile.name.trim()?profile.name.trim().slice(0,40):'Profile';
    const data=validate({version,sessions:Array.isArray(profile.sessions)?profile.sessions:[],preferences:profile.preferences});
    // Costs of hunts that no longer exist are dropped, and the ones without a
    // hunt belong to the first hunt of that day.
    const sessionIds=new Set(data.sessions.map(s=>s.id));
    const firstOfDay=new Map(),firstOfStart=new Map();
    for(const session of data.sessions){
      if(!session.start)continue;
      const day=sessionDay(session,data.preferences.reset);
      if(!firstOfDay.has(day))firstOfDay.set(day,session.id);
      const start=session.start.slice(0,10);
      if(!firstOfStart.has(start))firstOfStart.set(start,session.id);
    }
    const expenses=(Array.isArray(profile.expenses)?profile.expenses.map(validateExpense):[])
      .filter(e=>!e.sessionId||sessionIds.has(e.sessionId))
      .map(e=>e.sessionId?e:{...e,sessionId:firstOfDay.get(e.date)||firstOfStart.get(e.date)||''});
    if(expenses.length>500)throw new Error('Too many expenses.');
    const ids=new Set();
    for(const expense of expenses){if(ids.has(expense.id))throw new Error('Duplicate expense ID.');ids.add(expense.id);}
    const result={id:profile.id,name,created:typeof profile.created==='string'&&validDate(profile.created)?profile.created:today(),sessions:data.sessions,preferences:data.preferences,expenses};
    // The tabs of the profile: the names of the hunts, and the one in use.
    const tabs=validateTabs(profile.tabs);
    if(tabs.length)result.tabs=tabs;
    if(typeof profile.activeTab==='string'&&tabs.includes(profile.activeTab))result.activeTab=profile.activeTab;
    // The presets of expense, used to add the same cost again and again.
    const presets=(Array.isArray(profile.presets)?profile.presets.map(validatePreset):[]);
    if(presets.length>100)throw new Error('Too many presets.');
    const presetIds=new Set();
    for(const preset of presets){if(presetIds.has(preset.id))throw new Error('Duplicate preset ID.');presetIds.add(preset.id);}
    if(presets.length)result.presets=presets;
    // The photo is a small PNG kept as a data url, so the backup carries it too.
    // The photo is a small PNG as a data url, or a file kept in the assets folder.
    if(typeof profile.photo==='string'&&((/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(profile.photo)&&profile.photo.length<=500000)||/^assets\/[A-Za-z0-9._-]+\.png$/.test(profile.photo)))result.photo=profile.photo;
    // A locked profile cannot be deleted.
    if(profile.locked===true)result.locked=true;
    return result;
  }

  // The store holds every profile. Backups in the old single-profile format are migrated.
  function validateStore(data) {
    if(!data||typeof data!=='object')throw new Error('Invalid backup.');
    let profiles;
    if(Array.isArray(data.profiles)&&data.profiles.length)profiles=data.profiles.map(p=>validateProfile(p));
    else if(Array.isArray(data.sessions))profiles=[validateProfile({id:'default',name:'Profile 1',sessions:data.sessions,preferences:data.preferences},data.version===1?1:2)];
    else throw new Error('Invalid backup.');
    if(profiles.length>20)throw new Error('Too many profiles.');
    const ids=new Set();
    for(const profile of profiles){if(ids.has(profile.id))throw new Error('Duplicate profile ID.');ids.add(profile.id);}
    const active=typeof data.activeProfile==='string'&&ids.has(data.activeProfile)?data.activeProfile:profiles[0].id;
    const result={version:3,activeProfile:active,profiles};
    // The app title can be renamed by the user.
    if(typeof data.title==='string'&&data.title.trim())result.title=data.title.trim().slice(0,60);
    // The periods in progress: the totals start again on these days.
    if(data.periods&&typeof data.periods==='object') {
      const week=validDate(data.periods.week)?data.periods.week:'';
      const month=validDate(data.periods.month)?data.periods.month:'';
      if(week&&month)result.periods={week,month};
    }
    // The log of the periods already closed, with the sum of every profile.
    if(Array.isArray(data.history)&&data.history.length) {
      const history=data.history.slice(0,240).map(entry=>{
        if(!entry||typeof entry!=='object')throw new Error('Invalid history entry.');
        const kind=entry.kind==='month'?'month':'week';
        if(!validDate(entry.from)||!validDate(entry.to)||entry.to<entry.from)throw new Error('Invalid history period.');
        const total=Number(entry.total);
        if(!Number.isSafeInteger(total)||Math.abs(total)>1e12)throw new Error('Invalid history total.');
        const xp=Number(entry.xp)||0;
        if(!Number.isSafeInteger(xp)||Math.abs(xp)>1e12)throw new Error('Invalid history XP.');
        return {kind,from:entry.from,to:entry.to,xp,total};
      });
      if(history.length)result.history=history;
    }
    return result;
  }

  function aggregate(sessions) {
    const result={};
    for(const field of fields) {
      if(field.type==='list') {
        // Every hunt keeps its own entries: names are only merged inside a single report.
        result[field.key]=sessions.map(s=>{
          const counts=new Map();
          for(const item of s[field.key]||[]) {
            const previous=counts.get(item.name);
            // A name counted in one report and listed without a count has no reliable total.
            const count=previous===undefined?item.count:(previous===null||item.count===null?null:previous+item.count);
            counts.set(item.name,count);
          }
          return {session:s.id||null,start:s.start||null,date:s.date||null,entries:[...counts].map(([name,count])=>({name,count}))};
        }).filter(block=>block.entries.length);
      } else if(field.type==='rate') {
        // Rates are weighted by the time actually hunted, so short and long hunts average together.
        const available=sessions.filter(s=>s[field.base]!=null&&s.seconds>0),seconds=available.reduce((n,s)=>n+s.seconds,0);
        result[field.key]=seconds?available.reduce((n,s)=>n+s[field.base],0)*3600/seconds:null;
      } else {
        const available=sessions.filter(s=>s[field.key]!=null);result[field.key]=available.length?available.reduce((n,s)=>n+s[field.key],0):null;
      }
    }
    return result;
  }

  function csv(sessions,reset='00:00') {
    const numeric=fields.filter(f=>f.type!=='list');
    const cell=v=>'"'+(typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'":'')+String(v??'').replace(/"/g,'""')+'"';
    return '\uFEFF'+[['Day (reset '+reset+')','Start','End','Hunt',...numeric.map(f=>f.label),'Killed Monsters','Looted Items','Original text'],...sessions.map(s=>[sessionDay(s,reset),s.start||s.date,s.end||'',s.name||'',...numeric.map(f=>s[f.key]),JSON.stringify(s.monsters||[]),JSON.stringify(s.items||[]),s.raw||s.notes||''])].map(row=>row.map(cell).join(';')).join('\r\n');
  }

  const api={fields,defaults,today,validDate,validReset,sessionDay,currentDay,parseInteger,parseAmount,parseLabel,parse,preferences,validate,validateProfile,validateStore,period,aggregate,csv};
  if(typeof module!=='undefined')module.exports=api;root.Diary=api;
})(typeof window!=='undefined'?window:globalThis);
