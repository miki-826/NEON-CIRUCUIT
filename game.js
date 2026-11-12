(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let canvas = $('game');
  const W = 960, H = 600, TAU = Math.PI * 2;

  // ---- Settings (persisted) -------------------------------------------------
  const SETTINGS_KEY = 'neon-settings';
  const defaultSettings = {quality:'medium', bloom:true, damageNumbers:true, shake:true, follow:true};
  const settings = (() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch {}
    const valid = {...defaultSettings};
    if (['low','medium','high'].includes(saved.quality)) valid.quality = saved.quality;
    for (const key of ['bloom','damageNumbers','shake','follow']) if (typeof saved[key] === 'boolean') valid[key] = saved[key];
    return valid;
  })();
  function saveSettings(){ try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
  const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const renderSettings = () => ({...settings, reducedMotion: reducedMotionQuery.matches});

  // ---- Renderer: 3D when WebGL2 is available, otherwise the original 2D canvas ----
  let renderer3d = null;
  try {
    renderer3d = window.NeonRender3D?.create({canvas, arena:{w:W,h:H}, settings:renderSettings()}) || null;
  } catch (error) {
    console.error('3D renderer failed to start, using 2D fallback', error);
    renderer3d = null;
  }
  let ctx = null;
  function useCanvas2d(){
    renderer3d = null;
    ctx = canvas.getContext('2d');
    if (!ctx) {
      // A canvas that already holds a WebGL context cannot switch to 2D: swap in a fresh element.
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvas = fresh;
      ctx = canvas.getContext('2d');
    }
    canvas.width = W; canvas.height = H;
    canvas.classList.add('canvas-2d');
    document.body.classList.add('is-2d');
  }
  if (!renderer3d) useCanvas2d();
  reducedMotionQuery.addEventListener?.('change', () => renderer3d?.setSettings(renderSettings()));
  let frameEvents = [];
  function emit(event){ if (frameEvents.length < 64) frameEvents.push(event); }
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const classes = [
    {id:'ranger',name:'レンジャー',kicker:'LONG RANGE',desc:'遠距離攻撃に特化。耐久は低めで、移動速度は標準。',hp:85,atk:1.12,def:0.86,speed:205,color:'#5eeaff'},
    {id:'tank',name:'タンク',kicker:'FRONT LINE',desc:'近距離で押し切る高防御型。移動速度は標準。',hp:155,atk:1,def:1.75,speed:190,color:'#ffcc7c'},
    {id:'assassin',name:'アサシン',kicker:'HIGH MOBILITY',desc:'素早く動き、敵の間をすり抜ける高機動型。',hp:95,atk:1.08,def:1,speed:270,color:'#b28aff'}
  ];
  const masters = [
    {id:'pulse',name:'パルスショット',desc:'最も近い敵へ高精度の弾を発射。',cost:36,damage:17,kind:'main'},
    {id:'volley',name:'スプリットボルト',desc:'扇状に弾を放ち、集団を制圧。',cost:48,damage:12,kind:'main'},
    {id:'beam',name:'レールビーム',desc:'射線上の敵を貫く高威力の一撃。',cost:62,damage:28,kind:'main'},
    {id:'blast',name:'プラズマバースト',desc:'周囲の敵をまとめて吹き飛ばす。',cost:54,damage:22,kind:'main'},
    {id:'seeker',name:'ホーミングスフィア',desc:'追尾弾が離れた敵を捉える。',cost:43,damage:14,kind:'main'},
    {id:'arc',name:'チェインアーク',desc:'近くの敵へ放電し、最大3体に連鎖する。',cost:62,damage:23,kind:'main'},
    {id:'orbital',name:'オービタルストライク',desc:'敵の現在地を狙い、少し遅れて範囲爆撃。',cost:91,damage:41,kind:'main'},
    {id:'slash',name:'フォトンスラッシュ',desc:'正面の近距離を、光刃でなぎ払う。',cost:35,damage:26,kind:'main'}
  ];
  const subs = [
    {id:'orbit',name:'オービットブレード',desc:'常時回転する刃が近くの敵を削る。',cost:0,kind:'passive'},
    {id:'repair',name:'リペアパルス',desc:'コストがたまると耐久値を回復。',cost:75,kind:'active'},
    {id:'shock',name:'ショックリング',desc:'一定間隔で周囲へ電撃を放つ。',cost:0,kind:'passive'},
    {id:'dash',name:'フェイズダッシュ',desc:'危険な接近時に自動で短距離移動。',cost:60,kind:'move'},
    {id:'barrier',name:'シールドマトリクス',desc:'常時、受けるダメージを軽減。',cost:0,kind:'passive'},
    {id:'haste',name:'オーバークロック',desc:'常時、移動速度とコスト回復を強化。',cost:0,kind:'passive'},
    {id:'frost',name:'クライオフィールド',desc:'周囲に冷却波を放ち、敵の移動を一時的に遅くする。',cost:75,damage:13,kind:'active'},
    {id:'magnet',name:'グラビティウェル',desc:'敵を中心に引き寄せ、固まった敵を攻撃する。',cost:81,damage:16,kind:'active'},
    {id:'aegis',name:'イージスドーム',desc:'敵が接近するとドームを展開し、2秒間ダメージを大きく軽減。',cost:78,kind:'active'}
  ];
  const starterSkills = {ranger:'shock', tank:'repair', assassin:'dash'};
  const artPath = (folder, id) => `assets/${folder}/${id}.webp`;
  const loadArt = path => {
    const image = new Image();
    image.src = path;
    return image;
  };
  // 2D sprites are only needed by the fallback renderer; load them lazily.
  let arenaArt = null, unitArt = null;
  function ensure2dArt(){
    if (arenaArt) return;
    arenaArt = loadArt('assets/arena.webp');
    unitArt = Object.fromEntries(['ranger','tank','assassin','drone','elite','boss'].map(id => [id, loadArt(artPath('units',id))]));
  }
  if (!renderer3d) ensure2dArt();
  const skillTotal = masters.length + subs.length;
  const reducedMotion = reducedMotionQuery;
  const skillSounds = {pulse:'pulse',volley:'volley',beam:'beam',blast:'burst',seeker:'seeker',arc:'arc',
    orbital:'orbital',slash:'slash',repair:'repair',shock:'arc',dash:'dash',frost:'frost',magnet:'magnet',aegis:'guard'};
  const play = (id, volume) => window.NeonAudio?.play(id, volume);
  const circuit = window.NeonCircuit;
  const nodes = circuit.nodeDefinitions;
  const modeDefs = {demo:{label:'ラッシュ',rounds:[13,13,22]},hour:{label:'約1時間',rounds:[90,90,180]},spec:{label:'指定時間',rounds:[300,300,600]}};
  let selectedClass = classes[0], mode='demo', selectedSkill=0, choices=[], choiceType='', state='menu', pausedFrom='', last=0, clock=0, roundTime=0, wave=1, round=1, kills=0, level=1, xp=0, xpNeed=4, hp=100, maxHp=100, player={x:W/2,y:H/2,r:14}, enemies=[], bullets=[], effects=[], builds=[], inventory=[], keys=new Set(), pointer=null, spawnClock=0, lastUI=0, bossSpawned=false, nextRoundPending=false;
  let zones = [], hostileShots = [], spawned = 0, missionLog = [], transmissionUntil = 0;
  const colorOf = skill => skill.kind==='main'?'#59e7ff':skill.kind==='passive'?'#aa82ff':'#ffcf79';
  function pick(list,n){return [...list].sort(()=>Math.random()-.5).slice(0,n)}
  function log(msg){$('feed').textContent=msg; if(state==='paused') $('buildHint').textContent=msg;}
  function show(html){
    const panel = $('overlayPanel');
    panel.innerHTML=html;
    panel.querySelector('h2, h3').id='overlayTitle';
    $('overlay').classList.remove('hidden');
    $('overlay').scrollTop=0;
  }
  function hide(){ $('overlay').classList.add('hidden') }
  // Reflects persisted settings + audio mute state onto the settings page controls.
  function syncSettingsUI(){
    const values = {...settings, music:!window.NeonMusic.muted, sfx:!window.NeonAudio.muted};
    document.querySelectorAll('#command .switch[data-setting]').forEach(button => {
      button.setAttribute('aria-checked', String(Boolean(values[button.dataset.setting])));
    });
    document.querySelectorAll('#command .segmented[data-setting] [role="radio"]').forEach(button => {
      const checked = values[button.parentElement.dataset.setting] === button.dataset.value;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    });
  }

  function applySetting(key, value){
    if (key === 'music') { window.NeonMusic.setMuted(!value); }
    else if (key === 'sfx') {
      if (window.NeonAudio.muted === value) window.NeonAudio.toggle();
      if (value) play('radio', .3);
    } else {
      settings[key] = value;
      saveSettings();
      renderer3d?.setSettings(renderSettings());
    }
    syncSettingsUI();
  }

  function bossName(){
    if (wave===10) return 'CIRCUIT-0';
    if (wave===5) return 'ゲートキーパー';
    return '中ボス';
  }

  function announceChapter(){
    const chapter=window.NeonMission[wave];
    if (!chapter) return;
    missionLog.push(chapter);
    $('transmissionTitle').textContent=`${chapter.speaker} ｜ ${chapter.title}`;
    $('transmissionText').textContent=chapter.text;
    $('transmission').hidden=false;
    transmissionUntil=clock+9;
    play('radio',.38);
  }

  // ---- Esc command menu ----------------------------------------------------
  const commandTabs = ['build','settings','log','quit'];
  let circuitEditor = null;
  let commandTab = 'build', commandReturnFocus = null;

  function renderMissionLog(){
    $('missionLog').innerHTML = missionLog.length
      ? missionLog.map(entry=>`<article class="mission-entry"><h4>${entry.title} ｜ ${entry.speaker}</h4><p>${entry.text}</p></article>`).join('')
      : '<p class="empty-node">まだ通信は届いていません。</p>';
  }

  function selectCommandTab(tab, focus=false){
    commandTab = tab;
    document.querySelectorAll('#command .command-tab[data-tab]').forEach(button => {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus({preventScroll:true});
    });
    document.querySelectorAll('#command .command-page').forEach(page => { page.hidden = page.dataset.page !== tab; });
    if (tab === 'log') renderMissionLog();
    if (tab === 'settings') syncSettingsUI();
    if (tab === 'build' && window.NeonCircuit?.createEditor) {
      if (!circuitEditor) circuitEditor = circuit.createEditor($('circuitEditor'), {
        getState: () => ({builds, inventory, context:upgradeContext(), getStats:skillStats}),
        onChange: () => {
          for (const skill of builds) {
            const stats=skillStats(skill);
            skill.charge=Math.min(skill.charge,stats.cost);
            skill.cooldown=Math.min(skill.cooldown,stats.cooldown);
          }
          updateUI(); play('upgrade',.2);
        }
      });
      else circuitEditor.refresh();
    }
  }

  function openCommand(tab='build'){
    if (state!=='running') return;
    state='paused'; pausedFrom='running'; keys.clear();
    resetPointer();
    commandReturnFocus = document.activeElement;
    $('commandTitle').textContent='一時停止中';
    $('commandRun').innerHTML=`<span>WAVE ${String(wave).padStart(2,'0')}　ROUND ${round} / 3</span><span>${selectedClass.name}　LV ${level}</span>`;
    $('command').hidden=false;
    $('app').inert=true;
    selectCommandTab(tab, true);
    updateUI();
  }

  function closeCommand(){
    if (state!=='paused') return;
    circuitEditor?.cancelDrag();
    $('command').hidden=true;
    $('app').inert=false;
    state=pausedFrom||'running';
    if (commandReturnFocus?.isConnected && commandReturnFocus !== document.body) commandReturnFocus.focus({preventScroll:true});
    else canvas.focus?.({preventScroll:true});
    updateUI();
  }

  function quitToTitle(){
    circuitEditor?.cancelDrag();
    $('command').hidden=true;
    $('app').inert=false;
    resetPointer();
    state='ended';
    enemies=[]; bullets=[]; hostileShots=[]; zones=[]; effects=[];
    $('transmission').hidden=true;
    $('pauseBtn').disabled=true;
    updateMusic();
    updateUI();
    if (window.NeonTitle) window.NeonTitle.show(); else menu();
  }

  function bindCommandMenu(){
    const command=$('command');
    command.querySelectorAll('[data-action="resume"]').forEach(button => button.onclick=closeCommand);
    command.querySelectorAll('.command-tab[data-tab]').forEach(button => button.onclick=()=>selectCommandTab(button.dataset.tab));
    $('quitConfirm').onclick=quitToTitle;
    command.querySelectorAll('.switch[data-setting]').forEach(button => {
      button.onclick=()=>applySetting(button.dataset.setting, button.getAttribute('aria-checked')!=='true');
    });
    command.querySelectorAll('.segmented[data-setting]').forEach(group => {
      const radios=[...group.querySelectorAll('[role="radio"]')];
      radios.forEach((button,index) => {
        button.onclick=()=>applySetting(group.dataset.setting, button.dataset.value);
        button.onkeydown=event=>{
          const step = event.key==='ArrowRight'||event.key==='ArrowDown' ? 1 : event.key==='ArrowLeft'||event.key==='ArrowUp' ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const next=radios[(index+step+radios.length)%radios.length];
          applySetting(group.dataset.setting, next.dataset.value);
          next.focus();
        };
      });
    });
    // Vertical tablist: arrow keys move between tabs.
    command.querySelector('.command-tabs').addEventListener('keydown', event => {
      const tabs=[...command.querySelectorAll('.command-tabs .command-tab')];
      const index=tabs.indexOf(document.activeElement);
      if (index<0) return;
      const step = event.key==='ArrowDown'||event.key==='ArrowRight' ? 1 : event.key==='ArrowUp'||event.key==='ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      tabs[(index+step+tabs.length)%tabs.length].focus();
    });
    // Keep keyboard focus inside the dialog.
    command.addEventListener('keydown', event => {
      if (event.key!=='Tab') return;
      const focusable=[...command.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')].filter(el=>el.tabIndex>=0 && el.offsetParent!==null);
      if (!focusable.length) return;
      const first=focusable[0], last=focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    });
  }
  function classCards(){return classes.map(c=>`<button class="choice class-choice" data-class="${c.id}"><img class="class-art" src="${artPath('units',c.id)}" alt=""><span class="choice-kicker">${c.kicker}</span><strong>${c.name}</strong><p>${c.desc}<br>初期サブスキル：${subs.find(s=>s.id===starterSkills[c.id]).name}</p><span class="choice-bottom">HP ${c.hp} / DEF ${c.def.toFixed(2)} / SPD ${c.speed}</span></button>`).join('')}
  function menu(){state='menu';show(`<div class="hero"><div><h2>NEON <span>CIRCUIT</span></h2><p>軌道施設アークより救難信号。防衛網を突破せよ。</p></div></div><div class="overlay-content"><h3 class="overlay-title">戦闘ユニットを選択</h3><p class="overlay-desc">軌道施設に取り残された住民を救出する。ノードで自動攻撃を組み替え、10ウェーブを突破せよ。</p><div class="choice-grid">${classCards()}</div><div class="mode-row">${Object.entries(modeDefs).map(([id,m])=>`<button class="mode-button ${id===mode?'active':''}" data-mode="${id}">${m.label}</button>`).join('')}</div><p class="note">ラッシュは敵部隊を全滅させると即座に次のラウンドへ。約1時間と指定時間モードでも、ラウンド開始から敵が出現します。</p></div>`);document.querySelectorAll('[data-class]').forEach(b=>b.onclick=()=>{selectedClass=classes.find(c=>c.id===b.dataset.class);masterChoice()});document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;menu()})}
  function masterChoice(){choices=pick(masters,3);state='master';show(`<div class="hero"><div><h2>MASTER <span>SKILL</span></h2><p>${selectedClass.name}の主回路を設定</p></div></div><div class="overlay-content"><h3 class="overlay-title">マスタースキルを1つ選択</h3><p class="overlay-desc">攻撃の中心になるスキルです。消費コストが満たされるたび自動発動します。</p><div class="choice-grid">${choices.map((s,i)=>card(s,i,'MASTER')).join('')}</div><button class="primary-action" id="backClass">クラス選択へ戻る</button></div>`);document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>start(choices[+b.dataset.choice]));$('backClass').onclick=menu}
  function card(option,index,kicker){
    const isNode = option.choiceKind === 'node';
    const art = isNode ? '' : `<img class="choice-art" src="${artPath('skills',option.id)}" alt="">`;
    let detail = option.cost ? `COST ${option.cost}` : '常時発動';
    if (option.id === 'shock') detail='周期発動';
    if (isNode) detail='強化ノード · 追加コストなし';
    if (option.choiceKind === 'rank') detail='威力アップ';
    return `<button class="choice" data-choice="${index}">${art}<span class="choice-kicker">${kicker}</span><strong>${option.name}</strong><p>${option.desc}</p><span class="choice-bottom">${detail}</span></button>`;
  }
  function start(master){
    window.NeonMusic.reset();
    syncSettingsUI();
    wave=1; round=1; roundTime=0; clock=0; lastUI=0; kills=0; level=1; xp=0; xpNeed=4;
    maxHp=selectedClass.hp; hp=maxHp;
    player={x:W/2,y:H/2,r:14,inv:0,angle:0,guardUntil:0,recoilUntil:0,recoilAngle:0,vx:0,vy:0};
    enemies=[]; bullets=[]; effects=[]; builds=[]; inventory=[];
    zones=[]; hostileShots=[]; spawned=0; missionLog=[];
    frameEvents=[]; emit({type:'start'});
    addSkill(master);
    const starter = subs.find(s => s.id === starterSkills[selectedClass.id]);
    addSkill(starter);
    for (const id of ['power','power','haste','velocity','multishot','area','pierce','homing','explosion','split','amplifyPrevious','amplifyFollowing']) inventory.push(circuit.createNode(id));
    circuitEditor?.reset();
    selectedSkill=0; spawnClock=0; bossSpawned=false; nextRoundPending=false;
    state='running'; hide(); $('pauseBtn').disabled=false;
    $('combatStatus').textContent='自動発動 待機中';
    log(`${selectedClass.name}、出撃。「${master.name}」と「${starter.name}」を装備`);
    announceChapter();
    deploySquad();
    updateUI();
  }
  const compiledSkills = new WeakMap();
  let hasteSignature='', hastePower=0;
  function upgradeContext(){
    const haste = builds.find(skill => skill.id === 'haste');
    const key=haste ? `${haste.rank}|${haste.nodes.map(n=>n.uid+':'+n.id).join(',')}` : '';
    if (key!==hasteSignature) {
      hasteSignature=key;
      hastePower=haste ? circuit.compileSkill(haste,{attack:selectedClass.atk,level,chargeBoost:1}).utilityPower : 0;
    }
    return {attack:selectedClass.atk,level,chargeBoost:1 + .25*hastePower,maxHp,baseMoveSpeed:selectedClass.speed};
  }
  function movementSpeed(){
    const haste=builds.find(skill=>skill.id==='haste');
    return selectedClass.speed*(1+(haste ? .18*skillStats(haste).utilityPower : 0));
  }
  function skillStats(skill){
    const context = upgradeContext();
    const key = `${skill.rank}|${context.attack}|${context.level}|${context.chargeBoost}|${skill.nodes.map(n=>`${n.uid || ''}:${n.id}`).join(',')}`;
    const cached = compiledSkills.get(skill);
    if (cached?.key === key) return cached.stats;
    const stats = circuit.compileSkill(skill,context);
    compiledSkills.set(skill,{key,stats});
    return stats;
  }
  function costOf(s){return skillStats(s).cost}
  function addSkill(skill){
    const existing = builds.findIndex(s => s.id === skill.id);
    if (existing >= 0) {
      selectedSkill = existing;
      builds[existing].rank++;
      return false;
    }
    const {choiceKind, ...definition} = skill;
    builds.push({...definition,nodes:[],rank:1,charge:0,cooldown:0,flashUntil:0});
    selectedSkill = builds.length - 1;
    return true;
  }
  function levelUp(){play('upgrade',.5);emit({type:'levelup'});level++;xp-=xpNeed;xpNeed=Math.round(4+level*4+level*level*.52);hp=Math.min(maxHp,hp+Math.round(maxHp*.18));const pool=[...pick(subs.filter(s=>!builds.some(b=>b.id===s.id)),2).map(o=>({...o,choiceKind:'skill'})),...pick(nodes,2).map(o=>({...o,choiceKind:'node'}))];if(builds.length>0){let upgrade=builds[Math.floor(rand(0,builds.length))];pool.push({...upgrade,choiceKind:'rank',name:'強化：'+upgrade.name,desc:'既存スキルのランクを上げて威力を強化。'})}let required=[pool.find(o=>o.choiceKind==='skill'),pool.find(o=>o.choiceKind==='node')].filter(Boolean);choices=[...required,...pick(pool.filter(o=>!required.includes(o)),3-required.length)];if(choices.length<3)choices.push(...pick(nodes,3-choices.length).map(o=>({...o,choiceKind:'node'})));choiceType='level';showChoices('レベルアップ','回路を1つ拡張してください。スキル、ノード、既存スキル強化が出現します。');state='choice';updateUI()}
  function showChoices(title,desc){show(`<div class="overlay-content"><span class="small-label">${choiceType==='boss'?'BOSS CACHE':'LEVEL '+level}</span><h3 class="overlay-title">${title}</h3><p class="overlay-desc">${desc}</p><div class="choice-grid">${choices.map((o,i)=>card(o,i,o.choiceKind==='node'?'NODE':o.choiceKind==='rank'?'UPGRADE':o.kind==='main'?'MASTER':'SUB SKILL')).join('')}</div></div>`);document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>selectChoice(choices[+b.dataset.choice]))}
  function selectChoice(o){if(o.choiceKind==='node'){inventory.push(circuit.createNode(o.id));log(`ノード「${o.name}」を入手。スキル回路で接続できます`)}else if(o.choiceKind==='rank'){let s=builds.find(b=>b.id===o.id)||builds[selectedSkill];s.rank++;log(`「${s.name}」をランク${s.rank}に強化`)}else{const added=addSkill(o);log(added?`スキル「${o.name}」を回路に追加`:`「${o.name}」をランク${builds[selectedSkill].rank}に強化`)}hide();state='running';updateUI();if(choiceType==='boss'&&nextRoundPending)advanceRound()}
  function bossReward(){choiceType='boss';choices=pick([...masters,...subs].filter(s=>!builds.some(b=>b.id===s.id)),3).map(o=>({...o,choiceKind:'skill'}));if(choices.length<3)choices.push(...pick(subs,3-choices.length).map(o=>({...o,choiceKind:'skill'})));state='choice';showChoices(`${bossName()}の報酬`,'ボスからマスター／サブスキルを1つ獲得。既に持っているスキルはランクが上がります。')}
  function advanceRound(){
    nextRoundPending=false;
    enemies=[]; bullets=[]; hostileShots=[]; zones=[];
    roundTime=0; spawnClock=0; spawned=0; bossSpawned=false;
    if(round<3) round++;
    else {round=1;wave++;announceChapter()}
    if(wave>10){victory();return}
    state='running';
    deploySquad();
    log(`WAVE ${String(wave).padStart(2,'0')} / ROUND ${round} 開始`);
    updateUI();
  }
  function endRound(){if(nextRoundPending)return;if(round===3&&!bossSpawned){spawnEnemy(true);bossSpawned=true;return}if(enemies.length)return;nextRoundPending=true;if(round===3)bossReward();else advanceRound()}
  function roundQuota(){return mode==='demo'?7+round*2+Math.floor(wave*1.6):Infinity}

  function deploySquad(){
    for(let count=0;count<round+2;count++) spawnEnemy();
  }

  const entryPorts=[[145,145],[480,96],[815,145],[865,300],[815,455],[480,504],[145,455],[95,300]];

  function spawnEnemy(boss=false){
    const openPorts=entryPorts.filter(([x,y])=>Math.hypot(x-player.x,y-player.y)>(boss?255:190));
    const ports=openPorts.length?openPorts:entryPorts;
    const [entryX,entryY]=ports[Math.floor(rand(0,ports.length))];
    const x=entryX+rand(-24,24), y=entryY+rand(-24,24);
    const scale=1+(wave-1)*.40+(round-1)*.13;
    const bossFactor=wave===10?3.9:wave===5?2.2:1;
    const elite=!boss && wave>=2 && Math.random()<.11+wave*.009;
    const hunter=!boss && !elite && wave>=3 && Math.random()<.22;
    const bossGrowth=boss?1+Math.max(0,level-5)*.14:1;
    const health=(boss?235*bossFactor:elite?77:hunter?33:40)*scale*bossGrowth;
    const speed=(boss?53:elite?71:hunter?123:rand(68,92))*(1+wave*.044);
    const damage=(boss?23:elite?15:hunter?12:wave===1?6.5:9)*(1+wave*.135);
    enemies.push({x,y,r:boss?31:elite?19:12,hp:health,max:health,speed,damage,boss,elite,hunter,
      hit:0,attackIn:boss?1.2:rand(.65,1.8),aim:null,slowUntil:0});
    effect('ring',x,y,boss?'#ff687f':hunter?'#ef8dff':'#ad83f1',.38,{r:boss?69:26});
    emit({type:'spawn',x,y,boss,elite,hunter});
    if(boss){log(`${bossName()}、出現`);play('alert',.48);emit({type:'shake',power:.6})}
    else spawned++;
  }
  function nearest(max=Infinity){let found=null,d=max*max;for(const e of enemies){let n=(e.x-player.x)**2+(e.y-player.y)**2;if(e.hp>0&&n<d){d=n;found=e}}return found}
  function effect(type,x,y,color,duration,extra={}){
    if (effects.length >= 180) return;
    effects.push({type,x,y,color,t:duration,duration,...extra});
  }

  function damageFor(skill){
    return skillStats(skill).damage;
  }

  function shoot(skill){
    const stats = skillStats(skill);
    const range = stats.range;
    const target = nearest(range);
    if (!target) return false;
    const angle = Math.atan2(target.y-player.y,target.x-player.x);
    const damage = stats.damage;
    player.angle=angle+Math.PI/2;
    player.recoilAngle=angle;
    player.recoilUntil=clock+.16;

    if (skill.id==='orbital') {
      zones.push({x:target.x,y:target.y,r:stats.radius,t:.55,duration:.55,color:'#ffd081',skill,stats,damage});
      return true;
    }
    if (skill.id==='arc') {
      const chained = new Set();
      let origin = player, next = target;
      for (let index=0; next && index<3+stats.bonusProjectiles; index++) {
        effect('arc',origin.x,origin.y,'#87f9ff',.27,{x2:next.x,y2:next.y});
        hurtEnemy(next,damage*Math.pow(.84,index),skill,stats);
        chained.add(next);
        origin=next;
        next=nearestTo(origin,stats.radius,chained);
      }
      return true;
    }
    if (skill.id==='blast' || skill.id==='slash') {
      const isSlash = skill.id==='slash';
      for (const enemy of enemies) {
        const dx=enemy.x-player.x, dy=enemy.y-player.y;
        const distance=Math.hypot(dx,dy);
        if (distance > range) continue;
        if (isSlash && dx*Math.cos(angle)+dy*Math.sin(angle) < distance*.5) continue;
        hurtEnemy(enemy,isSlash?damage:damage*Math.max(.35,1-distance/(range*2)),skill,stats);
      }
      effect(isSlash?'slash':'impact',player.x,player.y,'#ba87ff',.31,{r:range,angle});
      return true;
    }
    if (skill.id==='beam') {
      const width=stats.radius;
      for (const enemy of enemies) {
        const dx=enemy.x-player.x, dy=enemy.y-player.y;
        const along=dx*Math.cos(angle)+dy*Math.sin(angle);
        const across=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
        if (along>0 && along<range && across<width+enemy.r) hurtEnemy(enemy,damage,skill,stats);
      }
      effect('trail',player.x,player.y,'#79f0ff',.24,{x2:player.x+Math.cos(angle)*range,y2:player.y+Math.sin(angle)*range});
      return true;
    }

    if (bullets.length >= 512) return false;
    const count=Math.min(stats.projectileCount,512-bullets.length);
    const spread=skill.id==='volley'?.19:.12;
    const homing=stats.homing;
    const speed=stats.projectileSpeed;
    const muzzleX=player.x+Math.cos(angle)*17, muzzleY=player.y+Math.sin(angle)*17;
    effect('sparks',muzzleX,muzzleY,colorOf(skill),.15,{r:19,count:5,angle});
    for (let index=0; index<count; index++) {
      const heading=angle+(index-(count-1)/2)*spread;
      bullets.push({x:muzzleX,y:muzzleY,vx:Math.cos(heading)*speed,vy:Math.sin(heading)*speed,
        r:stats.projectileRadius,damage,life:1.5*stats.areaMultiplier,pierce:stats.pierce,source:skill,stats,speed,generation:0,
        color:colorOf(skill),homing,hits:new Set()});
    }
    return true;
  }

  function nearestTo(origin,range,excluded){
    let target=null, nearestDistance=range*range;
    for (const enemy of enemies) {
      if (enemy.hp<=0 || excluded?.has(enemy)) continue;
      const distance=(enemy.x-origin.x)**2+(enemy.y-origin.y)**2;
      if (distance>=nearestDistance) continue;
      target=enemy;
      nearestDistance=distance;
    }
    return target;
  }

  function hurtEnemy(enemy,damage,skill,stats = skill ? skillStats(skill) : null){
    if (enemy.hp<=0) return;
    enemy.hp-=damage;
    if (!enemy.hit) {
      effect('sparks',enemy.x,enemy.y,skill?colorOf(skill):'#f4f5ff',.18,{r:enemy.r??12,count:4,angle:clock});
      play('hit',.12);
    }
    enemy.hit=.12;
    effect('text',enemy.x+rand(-8,8),enemy.y-12,'#e7f9ff',.43,{text:Math.round(damage)});
    if (stats?.leech) hp=Math.min(maxHp,hp+stats.leech);
    if (enemy.hp>0) return;
    kills++;
    xp+=enemy.boss?16+wave*2:enemy.elite?4:1;
    effect('impact',enemy.x,enemy.y,enemy.boss?'#ffcf79':'#aa82ff',.35,{r:(enemy.r??12)*2.4});
    emit({type:'kill',x:enemy.x,y:enemy.y,boss:!!enemy.boss,elite:!!enemy.elite});
    if (enemy.boss || enemy.elite) emit({type:'shake',power:enemy.boss?1:.18});
    if (enemy.boss) {
      play('burst',.58);
      log(`${bossName()}撃破。スキルキャッシュを解放`);
    }
  }

  function useSub(skill){
    const stats=skillStats(skill);
    if (skill.id==='repair') {
      if (hp>maxHp*.9) return false;
      hp=Math.min(maxHp,hp+maxHp*(.18+(skill.rank-1)*.04)*stats.utilityPower);
      effect('ring',player.x,player.y,'#76e9ba',.45,{r:68});
      return true;
    }
    if (skill.id==='dash') {
      const close=nearest(stats.range);
      if (!close) return false;
      const angle=Math.atan2(player.y-close.y,player.x-close.x);
      const {x,y}=player;
      player.x=clamp(x+Math.cos(angle)*130*stats.utilityPower,25,W-25);
      player.y=clamp(y+Math.sin(angle)*130*stats.utilityPower,25,H-25);
      player.inv=Math.min(3,.55*stats.utilityPower);
      effect('trail',x,y,'#aa82ff',.32,{x2:player.x,y2:player.y});
      return true;
    }
    if (skill.id==='aegis') {
      if (!nearest(stats.range) || player.guardUntil>clock) return false;
      player.guardUntil=clock+(2+(skill.rank-1)*.15)*stats.utilityPower;
      effect('ring',player.x,player.y,'#74ffd3',.4,{r:54});
      return true;
    }

    if (skill.id!=='frost' && skill.id!=='magnet') return false;
    const frost=skill.id==='frost';
    const radius=stats.radius;
    const center=frost?player:nearest(stats.range);
    if (!center || (frost && !nearest(radius))) return false;
    const {x,y}=center;
    const damage=stats.damage;
    for (const enemy of enemies) {
      const dx=x-enemy.x, dy=y-enemy.y;
      if (enemy.hp<=0 || Math.hypot(dx,dy)>radius) continue;
      if (frost) enemy.slowUntil=clock+(1.6+(skill.rank-1)*.12)*stats.utilityPower;
      else if (!enemy.boss) {
        effect('trail',enemy.x,enemy.y,'#ff83b0',.24,{x2:x,y2:y});
        enemy.x+=dx*Math.min(.9,.43*stats.utilityPower);
        enemy.y+=dy*Math.min(.9,.43*stats.utilityPower);
      }
      hurtEnemy(enemy,damage,skill,stats);
    }
    effect('impact',x,y,frost?'#86cfff':'#ff83b0',.44,{r:radius});
    return true;
  }

  function hurtPlayer(damage){
    if (player.inv>0) return;
    const barrierSkill=builds.find(skill=>skill.id==='barrier');
    const barrier=barrierSkill ? Math.max(.1,1-.27*skillStats(barrierSkill).utilityPower) : 1;
    const guard = player.guardUntil>clock ? .35 : 1;
    hp=Math.max(0,hp-damage*barrier*guard/selectedClass.def);
    player.inv=.55;
    effect('ring',player.x,player.y,guard<1?'#74ffd3':'#ff6f88',.25,{r:34});
    emit({type:'hurt',guard:guard<1});
    emit({type:'shake',power:guard<1?.15:.4});
    play(guard<1?'guard':'hurt',.31);
    if (!hp) { updateUI(); defeat(); }
  }

  function updateZones(dt){
    const pending=[];
    for (const zone of zones) {
      if (zone.source && zone.source.hp<=0) continue;
      zone.t-=dt;
      if (zone.t>0) { pending.push(zone); continue; }
      effect('impact',zone.x,zone.y,zone.color,.48,{r:zone.r});
      effect('sparks',zone.x,zone.y,zone.color,.37,{r:zone.r,count:9,angle:.3});
      play('burst',zone.source ? .48 : .36);
      emit({type:'shake',power:zone.source ? .45 : .22});
      if (zone.source) {
        if (Math.hypot(player.x-zone.x,player.y-zone.y)<zone.r+player.r) hurtPlayer(zone.damage);
        if (zone.echo && state==='running') {
          pending.push({...zone,t:.68,duration:.68,r:zone.r*.78,echo:false,damage:zone.damage*.85});
        }
      } else {
        for (const enemy of enemies) {
          if (Math.hypot(enemy.x-zone.x,enemy.y-zone.y)<zone.r+enemy.r) hurtEnemy(enemy,zone.damage,zone.skill,zone.stats);
        }
      }
    }
    zones=pending;
  }

  function bossAttack(enemy,dt){
    enemy.attackIn-=dt;
    if (enemy.attackIn>0) return;
    const secondPhase=enemy.hp<enemy.max*.5;
    const radius=wave===10?76:wave===5?65:48;
    const duration=wave===10?.86:wave===5?1.02:1.18;
    const damage=wave===10?56:wave===5?31:16+wave*1.1;
    const danger={r:radius,t:duration,duration,color:'#ff687f',source:enemy,damage};
    zones.push({...danger,x:player.x,y:player.y,echo:wave>=5&&secondPhase});
    if (wave===10 && secondPhase) {
      for (const side of [-1,1]) {
        zones.push({...danger,x:clamp(player.x+side*142,radius,W-radius),y:player.y});
      }
    }
    enemy.attackIn=secondPhase?2.35:3.55;
    play('alert',.44);
    $('combatStatus').textContent='敵の範囲攻撃を回避';
  }

  function gunnerAttack(enemy,dt,distance){
    if (enemy.aim) {
      enemy.aim.time-=dt;
      if (enemy.aim.time>0) return;
      const angle=enemy.aim.angle;
      const speed=235+wave*8;
      hostileShots.push({x:enemy.x,y:enemy.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        damage:enemy.damage*.90,life:3.1});
      play('enemyfire',.26);
      enemy.aim=null;
      enemy.attackIn=2.4+rand(0,.9);
      return;
    }
    enemy.attackIn-=dt;
    if (enemy.attackIn<=0 && distance<365) {
      const angle=Math.atan2(player.y-enemy.y,player.x-enemy.x);
      enemy.aim={angle,time:.57};
    }
  }

  function updateHostileShots(dt){
    for (const shot of hostileShots) {
      shot.x+=shot.vx*dt;
      shot.y+=shot.vy*dt;
      shot.life-=dt;
      if (Math.hypot(shot.x-player.x,shot.y-player.y)<=player.r+5) {
        hurtPlayer(shot.damage);
        shot.life=0;
        if (state==='ended') return;
      }
    }
    hostileShots=hostileShots.filter(s=>s.life>0 && s.x>-15 && s.x<W+15 && s.y>-15 && s.y<H+15);
  }
  function chargeRate(skill){
    return skillStats(skill).chargeRate;
  }

  function updateBullets(dt){
    const pending=[];
    for (const bullet of bullets) {
      if (bullet.life<=0) continue;
      const target=bullet.homing ? nearestTo(bullet,Infinity) : null;
      const speed=bullet.speed || Math.hypot(bullet.vx,bullet.vy);
      if (target) {
        const angle=Math.atan2(target.y-bullet.y,target.x-bullet.x);
        const turn=Math.min(1,dt*5);
        bullet.vx+=(Math.cos(angle)*speed-bullet.vx)*turn;
        bullet.vy+=(Math.sin(angle)*speed-bullet.vy)*turn;
        const length=Math.hypot(bullet.vx,bullet.vy) || 1;
        bullet.vx=bullet.vx/length*speed; bullet.vy=bullet.vy/length*speed;
      }
      const oldX=bullet.x,oldY=bullet.y;
      bullet.x+=bullet.vx*dt; bullet.y+=bullet.vy*dt; bullet.life-=dt;
      const dx=bullet.x-oldX,dy=bullet.y-oldY,lengthSquared=dx*dx+dy*dy;
      // Swept collision keeps high-speed projectiles from passing through enemies.
      const hits=[];
      for (const enemy of enemies) {
        if (enemy.hp<=0 || bullet.hits.has(enemy)) continue;
        const along=lengthSquared ? clamp(((enemy.x-oldX)*dx+(enemy.y-oldY)*dy)/lengthSquared,0,1) : 0;
        if (Math.hypot(enemy.x-oldX-dx*along,enemy.y-oldY-dy*along)<enemy.r+bullet.r) hits.push({enemy,along});
      }
      hits.sort((a,b)=>a.along-b.along);
      for (const {enemy} of hits) {
        if (enemy.hp<=0) continue;
        hurtEnemy(enemy,bullet.damage,bullet.source,bullet.stats);
        bullet.hits.add(enemy);
        const stats=bullet.stats;
        if (stats && !bullet.secondaryTriggered && !bullet.generation) {
          bullet.secondaryTriggered=true;
          if (stats.explosionRadius>0) {
            effect('impact',enemy.x,enemy.y,'#ffad64',.35,{r:stats.explosionRadius});
            play('burst',.18);
            for (const nearby of enemies) if (nearby!==enemy && nearby.hp>0 && Math.hypot(nearby.x-enemy.x,nearby.y-enemy.y)<=stats.explosionRadius+nearby.r) {
              hurtEnemy(nearby,bullet.damage*stats.explosionDamage,bullet.source,stats);
            }
          }
          if (stats.splitCount>0) {
            const angle=Math.atan2(bullet.vy,bullet.vx);
            const count=Math.min(stats.splitCount,512-bullets.length-pending.length);
            for (let index=0; index<count; index++) {
              const heading=angle+(index-(count-1)/2)*.42;
              pending.push({...bullet,x:enemy.x,y:enemy.y,vx:Math.cos(heading)*speed,vy:Math.sin(heading)*speed,
                damage:bullet.damage*.55,life:1.1,pierce:1,generation:1,secondaryTriggered:true,hits:new Set([enemy])});
            }
          }
        }
        if (--bullet.pierce<=0) { bullet.life=0; break; }
      }
    }
    bullets=bullets.filter(b=>b.life>0&&b.x>-30&&b.x<W+30&&b.y>-30&&b.y<H+30);
    bullets.push(...pending.slice(0,512-bullets.length));
  }

  function activateSkills(dt){
    for (const skill of builds) {
      if (skill.cost > 0) {
        const cost = costOf(skill);
        skill.charge = Math.min(cost, skill.charge + dt * chargeRate(skill));
        if (skill.charge < cost) continue;
        const fired = skill.kind === 'main' ? shoot(skill) : useSub(skill);
        if (!fired) continue;
        skill.charge = 0;
        skill.flashUntil = clock + .18;
        emit({type:'cast',skill:skill.id,x:player.x,y:player.y,angle:player.recoilAngle||0});
        $('combatStatus').textContent = `${skill.name} 自動発動`;
        play(skillSounds[skill.id]);
        continue;
      }

      if (skill.id !== 'orbit' && skill.id !== 'shock') continue;
      skill.cooldown = Math.max(0, skill.cooldown - dt);
      if (skill.cooldown > 0) continue;
      const orbit = skill.id === 'orbit';
      const stats = skillStats(skill);
      const radius = stats.radius;
      const damage = stats.damage;
      for (const enemy of enemies) {
        if (Math.hypot(enemy.x-player.x,enemy.y-player.y) < radius + (orbit ? enemy.r : 0)) {
          hurtEnemy(enemy,damage,skill,stats);
        }
      }
      if (!orbit) {
        effect('impact',player.x,player.y,'#aa82ff',.32,{r:radius});
        if (nearest(radius)) play('arc',.22);
      }
      skill.cooldown = stats.cooldown;
    }
  }
  function update(dt){
    clock+=dt;
    roundTime+=dt;
    player.inv=Math.max(0,player.inv-dt);
    if (clock>=transmissionUntil) $('transmission').hidden=true;

    const down = keys.has('s') || keys.has('arrowdown');
    const up = keys.has('w') || keys.has('arrowup');
    const right = keys.has('d') || keys.has('arrowright');
    const left = keys.has('a') || keys.has('arrowleft');
    const dx=Number(right)-Number(left)+(pointer?.dx??0);
    const dy=Number(down)-Number(up)+(pointer?.dy??0);
    const length=Math.hypot(dx,dy)||1;
    const speed=movementSpeed();
    const previousX=player.x, previousY=player.y;
    player.x=clamp(player.x+dx/length*speed*dt,18,W-18);
    player.y=clamp(player.y+dy/length*speed*dt,18,H-18);
    player.vx=dt>0?(player.x-previousX)/dt:0;
    player.vy=dt>0?(player.y-previousY)/dt:0;
    if (dx||dy) player.angle=Math.atan2(dy,dx)+Math.PI/2;

    spawnClock+=dt;
    const interval=Math.max(.43,1.06-wave*.046-round*.052);
    while (spawnClock>=interval) {
      spawnClock-=interval;
      if (roundTime<modeDefs[mode].rounds[round-1] && spawned<roundQuota() && enemies.length<90) spawnEnemy();
    }
    for (const enemy of enemies) {
      if (enemy.hp<=0) continue;
      const angle=Math.atan2(player.y-enemy.y,player.x-enemy.x);
      const distance=Math.hypot(player.x-enemy.x,player.y-enemy.y);
      if (enemy.elite) gunnerAttack(enemy,dt,distance);
      if (distance<=enemy.r+player.r+1) hurtPlayer(enemy.damage);
      else if (!enemy.aim && (!enemy.elite || distance>218)) {
        const speed=enemy.speed*(enemy.slowUntil>clock?.49:1);
        enemy.x+=Math.cos(angle)*speed*dt;
        enemy.y+=Math.sin(angle)*speed*dt;
      }
      if (state==='ended') return;
      enemy.hit=Math.max(0,enemy.hit-dt);
      if (enemy.boss) bossAttack(enemy,dt);
    }
    updateHostileShots(dt);
    if (state==='ended') return;
    updateBullets(dt);
    effects.forEach(effect=>effect.t-=dt);
    effects=effects.filter(effect=>effect.t>0);
    updateZones(dt);
    if (state==='ended') return;
    activateSkills(dt);
    enemies=enemies.filter(enemy=>enemy.hp>0);
    if (xp>=xpNeed) { levelUp(); return; }
    const squadCleared=spawned>=roundQuota() && !enemies.length;
    if (roundTime>=modeDefs[mode].rounds[round-1] || squadCleared) endRound();
    if (clock-lastUI>=.08) { lastUI=clock; updateUI(); }
  }
  function drawUnit(image,x,y,size,angle,color,hit=false){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.shadowColor=color;
    ctx.shadowBlur=hit ? 18 : 7;
    if (image.naturalWidth) {
      const scale = size / Math.max(image.naturalWidth,image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      ctx.drawImage(image,-width/2,-height/2,width,height);
    } else {
      ctx.fillStyle=color;
      ctx.beginPath();
      ctx.moveTo(0,-size/3);
      ctx.lineTo(size/4,size/4);
      ctx.lineTo(-size/4,size/4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function gameStateForRenderer(){
    if (window.NeonTitle && window.NeonTitle.state !== 'hidden') return 'title';
    return state;
  }

  function fallBackTo2d(error){
    console.error('3D renderer failed, switching to 2D', error);
    try { renderer3d?.dispose(); } catch {}
    useCanvas2d();
    ensure2dArt();
    bindCanvasPointer();
  }

  function draw(realDt){
    if (!renderer3d) { frameEvents = []; draw2d(); return; }
    const orbit = builds.find(s=>s.id==='orbit');
    const events = frameEvents;
    frameEvents = [];
    try { renderer3d.render({
      state: gameStateForRenderer(), time: clock, dt: realDt,
      classId: selectedClass.id, classColor: selectedClass.color,
      hp, maxHp, wave, round,
      player, enemies, bullets, hostileShots, zones, effects,
      orbit: orbit ? {count:Math.min(32,2+orbit.rank+skillStats(orbit).bonusProjectiles), radius:skillStats(orbit).radius} : null,
      bossActive: enemies.some(enemy=>enemy.boss && enemy.hp>0),
      events
    }); } catch (error) { fallBackTo2d(error); }
  }

  function draw2d(){
    ctx.fillStyle='#0a1629';
    ctx.fillRect(0,0,W,H);
    if (arenaArt.naturalWidth) ctx.drawImage(arenaArt,0,0,W,H);
    ctx.strokeStyle='#45687e';
    ctx.strokeRect(16,16,W-32,H-32);
    for (const enemy of enemies) {
      const art = enemy.boss ? 'boss' : enemy.elite ? 'elite' : 'drone';
      const angle = enemy.boss ? (reducedMotion.matches ? 0 : clock * .25) :
        Math.atan2(player.y-enemy.y,player.x-enemy.x) + Math.PI/2;
      const size = enemy.boss ? 110 : enemy.elite ? 60 : enemy.hunter ? 35 : 40;
      if (enemy.aim) {
        const {angle:heading,time}=enemy.aim;
        ctx.save();
        ctx.strokeStyle='#ffc47a';
        ctx.globalAlpha=.5+(1-time/.57)*.45;
        ctx.lineWidth=2;
        ctx.setLineDash([8,6]);
        ctx.beginPath();
        ctx.moveTo(enemy.x,enemy.y);
        ctx.lineTo(enemy.x+Math.cos(heading)*330,enemy.y+Math.sin(heading)*330);
        ctx.stroke();
        ctx.restore();
      }
      if (enemy.hunter) {
        ctx.strokeStyle='#ef8dff';
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(enemy.x+Math.sin(angle)*-14,enemy.y+Math.cos(angle)*14);
        ctx.lineTo(enemy.x+Math.sin(angle)*-25,enemy.y+Math.cos(angle)*25);
        ctx.stroke();
      }
      drawUnit(unitArt[art],enemy.x,enemy.y,size,angle,enemy.boss||enemy.elite?'#ffbc6a':'#ad74ff',enemy.hit>0);
      if (enemy.boss || enemy.elite) {
        const top = enemy.y - size / 2 - 7;
        ctx.fillStyle='#17283e';
        ctx.fillRect(enemy.x-enemy.r,top,enemy.r*2,4);
        ctx.fillStyle=enemy.boss?'#ffcf79':'#ff8db8';
        ctx.fillRect(enemy.x-enemy.r,top,enemy.r*2*(enemy.hp/enemy.max),4);
      }
    }
    for (const zone of zones) window.NeonFX.telegraph(ctx,zone);
    for (const shot of hostileShots) {
      ctx.strokeStyle='#ff8b62';
      ctx.lineWidth=5;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(shot.x-shot.vx*.065,shot.y-shot.vy*.065);
      ctx.lineTo(shot.x,shot.y);
      ctx.stroke();
      ctx.fillStyle='#fff0cd';
      ctx.beginPath();
      ctx.arc(shot.x,shot.y,3,0,TAU);
      ctx.fill();
    }
    for (const bullet of bullets) {
      ctx.strokeStyle=bullet.color;
      ctx.lineWidth=bullet.r;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(bullet.x-bullet.vx*.036,bullet.y-bullet.vy*.036);
      ctx.lineTo(bullet.x,bullet.y);
      ctx.stroke();
      ctx.fillStyle='#edfcff';
      ctx.beginPath();
      ctx.arc(bullet.x,bullet.y,bullet.r*.58,0,TAU);
      ctx.fill();
    }
    const orbit=builds.find(s=>s.id==='orbit');
    if (orbit) {
      const count=Math.min(32,2+orbit.rank+skillStats(orbit).bonusProjectiles);
      const radius=skillStats(orbit).radius;
      for (let index=0;index<count;index++) {
        const angle=clock*2.8+index*TAU/count;
        const x=player.x+Math.cos(angle)*radius,y=player.y+Math.sin(angle)*radius;
        ctx.fillStyle='#c098ff';
        ctx.beginPath();
        ctx.moveTo(x+Math.cos(angle)*11,y+Math.sin(angle)*11);
        ctx.lineTo(x+Math.cos(angle+2.4)*7,y+Math.sin(angle+2.4)*7);
        ctx.lineTo(x+Math.cos(angle-2.4)*7,y+Math.sin(angle-2.4)*7);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(player.x,player.y,24,0,TAU);
    ctx.strokeStyle=selectedClass.color;
    ctx.globalAlpha=.65;
    ctx.lineWidth=1.5;
    ctx.stroke();
    ctx.globalAlpha=1;
    const recoil=reducedMotion.matches?0:Math.max(0,(player.recoilUntil??0)-clock)*43;
    drawUnit(unitArt[selectedClass.id],player.x-Math.cos(player.recoilAngle||0)*recoil,
      player.y-Math.sin(player.recoilAngle||0)*recoil,selectedClass.id==='tank'?60:52,
      player.angle||0,selectedClass.color,player.inv>0);
    if (player.guardUntil>clock) {
      ctx.strokeStyle='#74ffd3';
      ctx.fillStyle='#74ffd31c';
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.arc(player.x,player.y,35,0,TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const visual of effects) {
      if (visual.type==='text') {
        if (!settings.damageNumbers) continue;
        ctx.save();
        ctx.globalAlpha=Math.min(1,visual.t*2.5);
        ctx.fillStyle=visual.color;
        ctx.font='700 14px Exo 2';
        ctx.fillText(visual.text,visual.x,visual.y-(reducedMotion.matches?0:(.43-visual.t)*35));
        ctx.restore();
      } else window.NeonFX.draw(ctx,visual,reducedMotion.matches);
    }
  }
  function updateBossBar(){
    const boss=enemies.find(enemy=>enemy.boss && enemy.hp>0);
    const bar=$('bossBar');
    bar.hidden=!boss || state==='ended';
    if (!boss) return;
    $('bossName').textContent=bossName();
    $('bossFill').style.transform=`scaleX(${clamp(boss.hp/boss.max,0,1)})`;
  }
  function updateUI(){updateBossBar();let remain=Math.max(0,modeDefs[mode].rounds[round-1]-roundTime);$('timerLabel').textContent=`${String(Math.floor(Math.ceil(remain)/60)).padStart(2,'0')}:${String((Math.ceil(remain)%60)).padStart(2,'0')}`;$('waveLabel').textContent=`WAVE ${String(wave).padStart(2,'0')}`;$('roundLabel').textContent=`ROUND ${round} / 3`;$('enemyCount').textContent=enemies.length;$('killCount').textContent=kills;$('hpText').textContent=`${Math.ceil(hp)} / ${maxHp}`;$('hpFill').style.width=`${hp/maxHp*100}%`;$('xpText').textContent=`${xp} / ${xpNeed}`;$('xpFill').style.width=`${xp/xpNeed*100}%`;$('levelText').textContent=`LV ${level}`;$('classTag').textContent=selectedClass.name;$('attackStat').textContent=selectedClass.atk.toFixed(2);$('defenseStat').textContent=selectedClass.def.toFixed(2);$('speedStat').textContent=Math.round(movementSpeed());$('slotCount').textContent=`${builds.length} / ${skillTotal}`;renderBuild();updateSkillHud()}
  function renderBuild(){ if (state === 'paused') circuitEditor?.refresh(); }
  let hudTiles = [];
  function updateMusic(){
    if (state!=='running') { window.NeonMusic.setScene(null); return; }
    const hasBoss=enemies.some(enemy=>enemy.boss && enemy.hp>0);
    window.NeonMusic.setScene(hasBoss?'boss':'battle');
  }

  function updateSkillHud(){
    updateMusic();
    $('hpBar').dataset.low=String(hp <= maxHp*.3);
    if (hudTiles.length !== builds.length || hudTiles.some((tile,i) => tile.skill !== builds[i])) {
      const hud = $('skillHud');
      hud.innerHTML = builds.map(s => `
        <div class="hud-skill" data-phase="charging" data-kind="${s.kind}" style="--p:0">
          <img src="${artPath('skills',s.id)}" alt="">
          <span class="hud-skill-time"></span>
          <span class="hud-skill-name">${s.name}</span>
        </div>`).join('');
      hudTiles = Array.from(hud.children,(tile,i) => ({
        skill: builds[i], tile, time: tile.querySelector('.hud-skill-time')
      }));
    }

    for (const [index, {skill,tile,time}] of hudTiles.entries()) {
      let remaining, progress, label, detail, phase='charging';
      if (skill.cost > 0) {
        const cost = costOf(skill);
        remaining = Math.max(0,cost-skill.charge) / chargeRate(skill);
        progress = clamp(skill.charge/cost,0,1);
        label = remaining > 0 ? `${(Math.ceil(remaining*10)/10).toFixed(1)}秒` : '充填完了';
        if (remaining === 0) phase='ready';
        detail = remaining > 0 ? `コスト ${Math.min(cost,Math.floor(skill.charge))} / ${cost}` :
          skill.id==='repair'?'耐久90%以下で発動':['dash','aegis','frost'].includes(skill.id)?'敵が近づくと発動':'敵が範囲に入ると発動';
        if (skill.flashUntil > clock) { label='発動'; phase='fired'; }
      } else if (skill.id === 'shock') {
        remaining = skill.cooldown;
        progress = clamp(1 - remaining / skillStats(skill).cooldown,0,1);
        label = `${(Math.ceil(remaining*10)/10).toFixed(1)}秒`;
        detail = 'コストなし・周期発動';
      } else {
        label='常時'; detail='コストなし'; progress=1; phase='passive';
      }
      // HUD tile: short label (seconds without unit), full detail in the tooltip.
      const shortLabel = phase==='fired' ? '発動' : phase==='ready' ? '' : phase==='passive' ? '' : (Math.ceil(remaining*10)/10).toFixed(1);
      time.textContent=shortLabel;
      tile.dataset.phase=phase;
      tile.style.setProperty('--p', (phase==='fired'||phase==='passive') ? '1' : clamp(progress,0,1).toFixed(3));
      tile.title=`${skill.name}：${label}（${detail}）`;
      const sidebarTime = $('skillList').querySelector(`[data-skill="${index}"] .skill-time`);
      if (sidebarTime) {
        sidebarTime.textContent=phase === 'ready' ? '完了' : label;
        sidebarTime.dataset.phase=phase;
      }
    }
  }

  function titleButton(){
    return window.NeonTitle ? '<button class="primary-action secondary-action" id="toTitle" type="button">タイトルへ戻る</button>' : '';
  }
  function bindTitleButton(){
    const button=$('toTitle');
    if (button) button.onclick=()=>window.NeonTitle.show();
  }

  function victory(){
    state='ended';
    updateMusic();
    $('pauseBtn').disabled=true;
    $('transmission').hidden=true;
    updateBossBar();
    play('clear',.6);
    const ending=window.NeonMission.clear;
    show(`<div class="hero mission-hero"><div><h2>CIRCUIT <span>CLEAR</span></h2><p>10ウェーブを突破</p></div></div>
      <div class="overlay-content"><h3 class="overlay-title">${ending.title}</h3>
      <div class="mission-entry"><h4>${ending.speaker}</h4><p>${ending.text}</p></div>
      <div class="result-number">${kills} KILLS</div><p class="overlay-desc">到達レベル ${level}</p>
      <div class="end-actions"><button class="primary-action" id="retry">もう一度プレイ</button>${titleButton()}</div></div>`);
    $('retry').onclick=menu;
    bindTitleButton();
  }
  function defeat(){state='ended';updateMusic();updateBossBar();$('pauseBtn').disabled=true;$('transmission').hidden=true;show(`<div class="hero"><div><h2>SIGNAL <span>LOST</span></h2><p>回路停止</p></div></div><div class="overlay-content"><h3 class="overlay-title">戦闘終了</h3><div class="result-number">WAVE ${String(wave).padStart(2,'0')}</div><p class="overlay-desc">撃破 ${kills} / 到達レベル ${level}。次の回路で再挑戦できます。</p><div class="end-actions"><button class="primary-action" id="retry">再出撃</button>${titleButton()}</div></div>`);$('retry').onclick=menu;bindTitleButton()}
  function pause(){
    if (state==='running') openCommand('build');
    else if (state==='paused') closeCommand();
  }
  function frame(t){
    requestAnimationFrame(frame); // schedule first so one bad frame can never stop the loop
    const elapsed=Math.max(0,(t-last)/1000||0); last=t;
    if(state==='running')update(Math.min(.04,elapsed));
    draw(Math.min(.05,elapsed));
  }
  const titleActive = () => window.NeonTitle && window.NeonTitle.state !== 'hidden';
  document.addEventListener('keydown',event=>{
    if (titleActive()) return;
    const key=event.key.toLowerCase();
    if (key==='escape' && !event.repeat) { event.preventDefault(); pause(); return; }
    if (state==='paused' && !event.repeat && (key==='q' || key==='e') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const index=commandTabs.indexOf(commandTab);
      selectCommandTab(commandTabs[(index+(key==='e'?1:-1)+commandTabs.length)%commandTabs.length], true);
      return;
    }
    if (state!=='running') return;
    if (key.startsWith('arrow') || key===' ') event.preventDefault();
    keys.add(key);
  });
  document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();if(state==='running')pause()});
  $('pauseBtn').onclick=pause;
  bindCommandMenu();
  syncSettingsUI();
  // Touch / drag movement. Bound per canvas element because the 2D fallback may swap the canvas.
  function resetPointer(){
    pointer=null;
    $('touchPad').firstElementChild.style.transform='';
    $('touchPad').style.display='';
  }
  function bindCanvasPointer(){
    const target=canvas;
    target.addEventListener('pointerdown',e=>{if(state!=='running')return;target.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};$('touchPad').style.display='block'});
    target.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;let dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,m=Math.hypot(dx,dy);pointer.dx=m>8?dx/Math.max(m,45):0;pointer.dy=m>8?dy/Math.max(m,45):0;$('touchPad').firstElementChild.style.transform=`translate(${clamp(dx,-27,27)}px,${clamp(dy,-27,27)}px)`});
    for(const event of ['pointerup','pointercancel'])target.addEventListener(event,e=>{if(pointer?.id===e.pointerId)resetPointer()});
  }
  bindCanvasPointer();
  updateUI();requestAnimationFrame(frame);
  if (window.NeonTitle) { hide(); window.NeonTitle.boot({onStart: menu}); }
  else menu();
})();
