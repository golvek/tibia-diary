const test=require('node:test');
const assert=require('node:assert/strict');
const d=require('../core.js');
const sample=`Session data: From 2026-10-19, 21:32:26 to 2026-10-19, 21:37:29
Session: 00:05h
Raw XP Gain: 0
XP Gain: 0
Raw XP/h: 0
XP/h: 0
Loot: 0
Supplies: 254
Balance: -254
Damage: 0
Damage/h: 0
Healing: 0
Healing/h: 0
Killed Monsters:
  None
Looted Items:
  None`;
const hunt={id:'hunt-1',...d.parse(sample)};
test('exemplo do usuário: data/hora, 303 segundos, custo e listas vazias',()=>{
 assert.equal(hunt.date,'2026-10-19');assert.equal(hunt.start,'2026-10-19 21:32:26');assert.equal(hunt.end,'2026-10-19 21:37:29');assert.equal(hunt.seconds,303);assert.equal(hunt.reportedMinutes,5);assert.equal(hunt.balance,-254);assert.equal(hunt.supplies,254);assert.deepEqual(hunt.monsters,[]);assert.deepEqual(hunt.items,[]);assert.equal(hunt.raw,sample);
});
test('mantém relatório integral, taxas e listas com contagens',()=>{
 const raw=sample.replace('XP Gain: 0','XP Gain: 1,234,567').replace('XP/h: 0','XP/h: 987,654').replace('  None\nLooted','  2x dragon\n  1x dragon lord\nLooted').replace(/  None$/,'  1,234x gold coin\n  1x dragon shield');
 const s=d.parse(raw.replace(/\n/g,'\r\n'));assert.equal(s.rawXp,1234567);assert.equal(s.rawXpRate,987654);assert.deepEqual(s.monsters,[{name:'dragon',count:2},{name:'dragon lord',count:1}]);assert.equal(s.items[0].count,1234);
});
test('não converte campos ausentes, decimais ou datas inválidas em zero',()=>{
 for(const raw of [sample.replace('Loot: 0\n',''),sample.replace('Balance: -254','Balance: -2,54'),sample.replace('21:37:29','20:00:00'),sample.replaceAll('2026-10-19','2026-02-30'),sample.replace('21:37:29','25:00:00'),sample.replace('Loot: 0','Loot: 0\nLoot: 3'),sample.replace('Looted Items:','Missing:')]) assert.throws(()=>d.parse(raw));
});
test('meia-noite preserva início e calcula segundos sem conversão de fuso',()=>{
 const s=d.parse(sample.replace('2026-10-19, 21:32:26','2026-10-19, 23:59:00').replace('2026-10-19, 21:37:29','2026-10-20, 00:01:00'));
 assert.equal(s.seconds,120);assert.equal(s.date,'2026-10-19');
});
test('resumos calculam taxas ponderadas pelo tempo e mantem as listas de cada caca',()=>{
  const a={...hunt,seconds:3600,xp:1000,xpRate:888,monsters:[{name:'dragon',count:2}]};
  const b={...hunt,seconds:7200,xp:1000,xpRate:999,monsters:[{name:'dragon',count:3}]};
  const total=d.aggregate([a,b]);assert.equal(total.xp,2000);assert.equal(total.xpRate,2000/3);assert.equal(total.balance,-508);assert.equal(total.seconds,10800);
  assert.deepEqual(total.monsters.map(block=>block.entries),[[{name:'dragon',count:2}],[{name:'dragon',count:3}]]);
});
test('cada caca mantem as proprias entradas de loot sem somar entre logs',()=>{
  const a={...hunt,monsters:[{name:'dragon',count:2},{name:'dragon',count:3}],items:[{name:'gold coin',count:10}]};
  const b={...hunt,monsters:[{name:'dragon',count:1}],items:[]};
  const total=d.aggregate([a,b]);
  assert.deepEqual(total.monsters.map(block=>block.entries),[[{name:'dragon',count:5}],[{name:'dragon',count:1}]]);
  assert.deepEqual(total.items.map(block=>block.entries),[[{name:'gold coin',count:10}]]);
  assert.equal(total.monsters[0].start,'2026-10-19 21:32:26');
  assert.equal(total.monsters[0].session,'hunt-1');
});
test('backup v2 valida relatório e preserva campos ocultos e preferências',()=>{
 const data={version:2,sessions:[hunt],preferences:{visible:['balance','items'],period:'month',anchor:'2026-10-19',reset:'00:00'}};
 assert.deepEqual(d.validate(JSON.parse(JSON.stringify(data))),data);
 assert.throws(()=>d.validate({...data,sessions:[hunt,hunt]}));
 assert.throws(()=>d.validate({...data,sessions:[{...hunt,raw:'invalid'}]}));
 assert.deepEqual(d.preferences({visible:[]}).visible,[]);
});
test('migração v1 mantém dados sem inventar horas ou valores ausentes',()=>{
 const old={version:1,dailyLimit:6,sessions:[{id:'old-1',date:'2026-10-19',minutes:90,xp:1500000,profit:-50000,character:'Knight',notes:'Hunt'}]};
 const migrated=d.validate(old);assert.equal(migrated.version,2);assert.equal(migrated.sessions[0].seconds,5400);assert.equal(migrated.sessions[0].balance,-50000);assert.equal(migrated.sessions[0].rawXp,undefined);assert.equal(migrated.sessions[0].start,undefined);assert.equal(migrated.sessions[0].notes,'Hunt');assert.deepEqual(d.validate(migrated),migrated);
});
test('períodos: segunda a domingo, fevereiro bissexto e data escolhida',()=>{
 assert.deepEqual(d.period('week','2026-10-25'),{start:'2026-10-19',end:'2026-10-25'});assert.deepEqual(d.period('month','2024-02-10'),{start:'2024-02-01',end:'2024-02-29'});assert.deepEqual(d.period('day','2026-10-19'),{start:'2026-10-19',end:'2026-10-19'});
});
test('CSV preserva texto integral e escapa aspas e valores de planilha',()=>{
 const csv=d.csv([hunt]);assert.ok(csv.includes('"-254"'));assert.ok(csv.includes(sample));assert.ok(csv.startsWith('\uFEFF'));assert.ok(d.csv([{...hunt,raw:'=1+1'}]).includes('"\'=1+1"'));
});

test('reset: antes, no instante exato e depois, com precisão de minutos',()=>{
 const at=start=>({start});
 assert.equal(d.sessionDay(at('2026-10-19 05:29:59'),'05:30'),'2026-10-18');
 assert.equal(d.sessionDay(at('2026-10-19 05:30:00'),'05:30'),'2026-10-19');
 assert.equal(d.sessionDay(at('2026-10-19 05:30:01'),'05:30'),'2026-10-19');
 assert.equal(d.sessionDay(at('2026-10-19 00:00:00'),'00:00'),'2026-10-19');
 assert.equal(d.sessionDay(at('2026-10-19 23:58:59'),'23:59'),'2026-10-18');
});
test('reset atravessa semana, mês, ano e ano bissexto sem alterar a sessão',()=>{
 for(const [start,expected] of [['2026-01-01 03:00:00','2025-12-31'],['2024-03-01 03:00:00','2024-02-29'],['2026-10-19 03:00:00','2026-10-18']])assert.equal(d.sessionDay({start},'06:00'),expected);
 const date=d.sessionDay({start:'2026-10-19 03:00:00'},'06:00');
 assert.deepEqual(d.period('week',date),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(d.period('month',d.sessionDay({start:'2026-11-01 03:00:00'},'06:00')),{start:'2026-10-01',end:'2026-10-31'});
 const copy=JSON.stringify(hunt);d.sessionDay(hunt,'22:00');assert.equal(JSON.stringify(hunt),copy);
});
test('Hoje usa o dia do reset e registros sem horário mantêm a data',()=>{
 assert.equal(d.currentDay('06:00',new Date(2026,9,19,5,59,59)),'2026-10-18');
 assert.equal(d.currentDay('06:00',new Date(2026,9,19,6,0,0)),'2026-10-19');
 assert.equal(d.sessionDay({legacy:true,date:'2026-10-19'},'06:00'),'2026-10-19');
});
test('reset persiste no backup, exporta dia ajustado e aceita backups anteriores',()=>{
 const data={version:2,sessions:[hunt],preferences:{...d.preferences(),reset:'22:00'}};
 assert.equal(d.validate(JSON.parse(JSON.stringify(data))).preferences.reset,'22:00');
 assert.equal(d.preferences({}).reset,'00:00');
 for(const invalid of ['24:00','12:60','6:00','',null])assert.equal(d.validReset(invalid),false);
 assert.throws(()=>d.sessionDay(hunt,'24:00'));
 assert.ok(d.csv([hunt],'22:00').includes('"2026-10-18"'));
});
test('seções de listas terminam em linha não indentada e texto posterior não vira loot',()=>{
  assert.deepEqual(d.parse(sample+'\nNote: good hunt').items,[]);
  assert.deepEqual(d.parse(sample+'\ngood hunt, level 200').items,[]);
  assert.deepEqual(d.parse(sample+'\n  good hunt').items,[{name:'good hunt',count:null}]);
  assert.deepEqual(d.parse(sample.replace('  None\nLooted Items','2x dragon\nLooted Items')).monsters,[{name:'dragon',count:2}]);
  assert.deepEqual(d.parse(sample.replace('  None\nLooted Items','None\nLooted Items')).monsters,[]);
});
test('duração declarada no relatório é comparada com a janela do cabeçalho',()=>{
  assert.equal(d.parse(sample).durationMismatch,false);
  assert.equal(d.parse(sample.replace('00:05h','120:00h')).durationMismatch,true);
  assert.equal(d.parse(sample.replace('00:05h','00:04h')).durationMismatch,true);
});
test('preferências corrompidas voltam ao padrão sem apagar seleções vazias',()=>{
  assert.deepEqual(d.preferences({visible:['nope']}).visible,[...d.defaults]);
  assert.deepEqual(d.preferences({visible:[]}).visible,[]);
  assert.deepEqual(d.preferences({visible:['xp','nope']}).visible,['xp']);
  assert.deepEqual(d.preferences(null).visible,[...d.defaults]);
  assert.equal(d.validate({version:2,sessions:[],preferences:null}).preferences.reset,'00:00');
});
test('os characters da barra de baixo podem ser escondidos nas preferencias',()=>{
  assert.equal(d.preferences({}).characters,undefined);
  assert.equal(d.preferences({characters:true}).characters,undefined);
  assert.equal(d.preferences({characters:false}).characters,false);
  const prefs={...d.preferences(),characters:false};
  assert.equal(d.validate({version:2,sessions:[hunt],preferences:prefs}).preferences.characters,false);
  // A escolha fica no perfil e vai no backup.
  const store=d.validateStore({version:3,activeProfile:'p1',profiles:[{id:'p1',name:'Knight',sessions:[hunt],preferences:prefs}]});
  assert.equal(store.profiles[0].preferences.characters,false);
});
test('os periodos em andamento e o log das semanas e meses ficam no backup',()=>{
  const base={version:3,activeProfile:'p1',profiles:[{id:'p1',name:'Knight',sessions:[],preferences:{}}]};
  const store=d.validateStore({...base,periods:{week:'2026-10-19',month:'2026-10-01'},history:[
    {kind:'week',from:'2026-10-12',to:'2026-10-18',xp:1000,total:500},
    {kind:'month',from:'2026-09-01',to:'2026-09-30',xp:9000,total:4000}
  ]});
  assert.deepEqual(store.periods,{week:'2026-10-19',month:'2026-10-01'});
  assert.equal(store.history.length,2);
  assert.equal(store.history[0].kind,'week');
  assert.equal(store.history[0].total,500);
  assert.equal(store.history[1].kind,'month');
  assert.equal(store.history[1].xp,9000);
  // O backup volta igual depois de validar.
  assert.deepEqual(d.validateStore(store).history,store.history);
  // Um periodo invalido e ignorado: o total comeca de novo, sem perder o backup.
  assert.equal(d.validateStore({...base,periods:{week:'2026-13-01',month:'2026-10-01'}}).periods,undefined);
  // O log invalido e recusado.
  assert.throws(()=>d.validateStore({...base,history:[{kind:'week',from:'2026-10-12',to:'2026-10-11',total:1}]}));
  assert.throws(()=>d.validateStore({...base,history:[{kind:'week',from:'2026-10-12',to:'2026-10-18',total:1.5}]}));
  // Um backup antigo continua valendo, sem periodos nem log.
  const old=d.validateStore(base);
  assert.equal(old.periods,undefined);
  assert.equal(old.history,undefined);
});
test('resumos ignoram sessões sem tempo e períodos inválidos são rejeitados',()=>{
  assert.equal(d.aggregate([{xp:100,seconds:0}]).xpRate,null);
  assert.equal(d.aggregate([{xp:100}]).xpRate,null);
  assert.equal(d.aggregate([{xp:100,seconds:60}]).xpRate,6000);
  assert.throws(()=>d.period('quarter','2026-10-19'));
  assert.deepEqual(d.period('day','2026-10-19'),{start:'2026-10-19',end:'2026-10-19'});
  assert.throws(()=>d.sessionDay({}));
});
test('validação repetida mantém os mesmos resultados e os campos calculados',()=>{
  const data={version:2,sessions:[hunt],preferences:{visible:['balance'],period:'day',anchor:'2026-10-19',reset:'00:00'}};
  const first=d.validate(JSON.parse(JSON.stringify(data))),second=d.validate(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(first,second);
  assert.equal(first.sessions[0].durationMismatch,false);
  assert.equal(second.sessions[0].seconds,303);
});
test('nome da hunt sobrevive ao backup e aparece no CSV',()=>{
  const named={...hunt,name:'DT Sio'};
  const out=d.validate({version:2,sessions:[named],preferences:{visible:['balance'],period:'day',anchor:'2026-10-19',reset:'00:00'}});
  assert.equal(out.sessions[0].name,'DT Sio');
  assert.equal(d.validate(out).sessions[0].name,'DT Sio');
  assert.equal(d.validate({version:2,sessions:[{...hunt,name:'   '}]}).sessions[0].name,undefined);
  assert.equal(d.validate({version:2,sessions:[{...hunt,name:'x'.repeat(200)}]}).sessions[0].name.length,60);
  assert.ok(d.csv([named]).includes('"DT Sio"'));
});test('perfis guardam historico separado e o backup antigo e migrado',()=>{
  const one={version:2,sessions:[hunt],preferences:{visible:['balance'],period:'day',anchor:'2026-10-19',reset:'00:00'}};
  const store=d.validateStore({version:3,activeProfile:'p2',profiles:[{id:'p1',name:'Knight',sessions:[hunt],preferences:one.preferences},{id:'p2',name:'Sio',sessions:[],preferences:one.preferences}]});
  assert.equal(store.profiles.length,2);
  assert.equal(store.activeProfile,'p2');
  assert.equal(store.profiles[0].sessions.length,1);
  assert.equal(store.profiles[1].sessions.length,0);
  assert.equal(store.profiles[0].sessions[0].seconds,303);
  assert.deepEqual(d.validateStore(store).profiles.map(p=>p.name),['Knight','Sio']);
  const legacy=d.validateStore(one);
  assert.equal(legacy.profiles.length,1);
  assert.equal(legacy.profiles[0].sessions.length,1);
  assert.equal(legacy.profiles[0].name,'Profile 1');
  assert.throws(()=>d.validateStore({version:3,profiles:[{id:'p1',name:'a'},{id:'p1',name:'b'}]}));
  assert.throws(()=>d.validateStore({version:3,profiles:[]}));
  assert.throws(()=>d.validateStore({}));
});test('despesas extras sao validadas e ficam separadas do relatorio',()=>{
  const base={id:'p1',name:'Knight',sessions:[],preferences:{visible:['balance'],period:'day',anchor:'2026-10-19',reset:'00:00'}};
  const expense={id:'e1',label:'Recall 1h',amount:80000,date:'2026-10-19'};
  const out=d.validateProfile({...base,expenses:[expense]});
  assert.equal(out.expenses.length,1);
  assert.equal(out.expenses[0].label,'Recall 1h');
  assert.equal(out.expenses[0].amount,80000);
  assert.deepEqual(d.validateProfile(base).expenses,[]);
  assert.throws(()=>d.validateProfile({...base,expenses:[{...expense,label:'  '}]}));
  assert.throws(()=>d.validateProfile({...base,expenses:[{...expense,amount:1.5}]}));
  assert.throws(()=>d.validateProfile({...base,expenses:[{...expense,date:'2026-13-01'}]}));
  assert.throws(()=>d.validateProfile({...base,expenses:[expense,{...expense,label:'other'}]}));
  assert.equal(d.validateStore({version:3,activeProfile:'p1',profiles:[{...base,expenses:[expense]}]}).profiles[0].expenses.length,1);
});test('valores aceitam k, kk e m como sufixo',()=>{
  assert.equal(d.parseAmount('1k'),1000);
  assert.equal(d.parseAmount('10k'),10000);
  assert.equal(d.parseAmount('100k'),100000);
  assert.equal(d.parseAmount('1kk'),1000000);
  assert.equal(d.parseAmount('2kk'),2000000);
  assert.equal(d.parseAmount('1m'),1000000);
  assert.equal(d.parseAmount('80K'),80000);
  assert.equal(d.parseAmount(' 80 k '),80000);
  assert.equal(d.parseAmount('1.5k'),1500);
  assert.equal(d.parseAmount('1,5k'),1500);
  assert.equal(d.parseAmount('100.000'),100000);
  assert.equal(d.parseAmount('100,000'),100000);
  assert.equal(d.parseAmount('500'),500);
  assert.equal(d.parseAmount('-80k'),-80000);
  assert.equal(d.parseAmount(''),null);
  assert.equal(d.parseAmount('abc'),null);
  assert.equal(d.parseAmount('k'),null);
  assert.equal(d.parseAmount('1kkk'),null);
  assert.equal(d.parseAmount('80kk'),80000000);
  assert.equal(d.parseAmount(null),null);
});test('descricao com quantidade multiplica o valor da despesa',()=>{
  assert.deepEqual(d.parseLabel('2 silver token'),{quantity:2,name:'silver token'});
  assert.deepEqual(d.parseLabel('2x silver token'),{quantity:2,name:'silver token'});
  assert.deepEqual(d.parseLabel('2X silver token'),{quantity:2,name:'silver token'});
  assert.deepEqual(d.parseLabel('silver token'),{quantity:1,name:'silver token'});
  assert.deepEqual(d.parseLabel('Recall 1h'),{quantity:1,name:'Recall 1h'});
  assert.deepEqual(d.parseLabel('3rd kill bonus'),{quantity:1,name:'3rd kill bonus'});
  assert.equal(d.parseAmount('40k')*d.parseLabel('2 silver token').quantity,80000);
  const out=d.validateProfile({id:'p1',name:'Knight',sessions:[],preferences:{},expenses:[{id:'e1',label:'2 silver token',amount:80000,date:'2026-10-19'}]});
  assert.equal(out.expenses[0].quantity,2);
  assert.equal(out.expenses[0].amount,80000);
});test('foto do perfil e guardada como png e levada no backup',()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const profile={id:'p1',name:'Knight',sessions:[],preferences:{},photo:png};
  const out=d.validateProfile(profile);
  assert.equal(out.photo,png);
  assert.equal(d.validateProfile({...profile,photo:'javascript:alert(1)'}).photo,undefined);
  assert.equal(d.validateProfile({...profile,photo:'data:image/png;base64,'+'A'.repeat(600000)}).photo,undefined);
  assert.equal(d.validateProfile({id:'p1',name:'K',sessions:[],preferences:{}}).photo,undefined);
  const store=d.validateStore({version:3,activeProfile:'p1',profiles:[profile]});
  assert.equal(store.profiles[0].photo,png);
});test('perfil travado nao pode ser excluido e o estado vai no backup',()=>{
  const profile={id:'p1',name:'Knight',sessions:[],preferences:{},locked:true};
  const out=d.validateProfile(profile);
  assert.equal(out.locked,true);
  assert.equal(d.validateProfile({id:'p1',name:'K',sessions:[],preferences:{}}).locked,undefined);
  const store=d.validateStore({version:3,activeProfile:'p1',profiles:[profile]});
  assert.equal(store.profiles[0].locked,true);
});test('titulo do app pode ser renomeado e vai no backup',()=>{
  const store=d.validateStore({version:3,activeProfile:'p1',title:'Meu Diario',profiles:[{id:'p1',name:'K',sessions:[],preferences:{}}]});
  assert.equal(store.title,'Meu Diario');
  assert.equal(d.validateStore({version:3,activeProfile:'p1',profiles:[{id:'p1',name:'K',sessions:[],preferences:{}}]}).title,undefined);
  assert.equal(d.validateStore({version:3,activeProfile:'p1',title:'   ',profiles:[{id:'p1',name:'K',sessions:[],preferences:{}}]}).title,undefined);
  assert.equal(d.validateStore({version:3,activeProfile:'p1',title:'x'.repeat(200),profiles:[{id:'p1',name:'K',sessions:[],preferences:{}}]}).title.length,60);
});
test('despesas de hunts apagadas somem e as do dia ficam na primeira hunt',()=>{
  const raw=[
    'Session data: From 2026-10-20, 17:35:15 to 2026-10-20, 17:52:23',
    'Session: 00:17h',
    'Raw XP Gain: 7053159',
    'XP Gain: 8000000',
    'Raw XP/h: 0',
    'XP/h: 0',
    'Loot: 1000',
    'Supplies: 100',
    'Balance: -1329',
    'Damage: 160',
    'Damage/h: 10',
    'Healing: 10',
    'Healing/h: 10',
    'Killed Monsters:',
    '  1x dragon',
    'Looted Items:',
    '  None',
  ].join('\n');
  const hunt={id:'s1',...d.parse(raw)};
  const profile={id:'p1',name:'Sage Cat',sessions:[hunt],preferences:{visible:['balance'],period:'day',anchor:'2026-10-20',reset:'00:00'},expenses:[
    {id:'e1',label:'2x sleepspawn',amount:80000,date:'2026-10-20',sessionId:'hunt-apagada'},
    {id:'e2',label:'10x cheese',amount:1000,date:'2026-10-20',sessionId:''}
  ]};
  const out=d.validateProfile(profile);
  assert.equal(out.expenses.length,1);
  assert.equal(out.expenses[0].id,'e2');
  assert.equal(out.expenses[0].sessionId,'s1');
  assert.equal(d.validateProfile({...profile,expenses:[]}).expenses.length,0);
});
