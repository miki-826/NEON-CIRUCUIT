const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const project = path.resolve(__dirname, '..');

const element = {getContext: () => ({}), addEventListener() {}, setAttribute() {}, focus() {}, style:{}, dataset:{},
  classList:{add() {}, remove() {}, toggle() {}}, children:[], querySelectorAll:()=>[], querySelector:()=>element};
element.firstElementChild=element;
const soundEvents=[];
const musicEvents=[];
const globals = {
  Image: class {}, matchMedia: () => ({matches: false}),
  document: {body:element, getElementById: () => element, addEventListener() {}, querySelectorAll: () => []},
  console, window: {addEventListener() {}, NeonAudio:{muted:false,play:(name)=>soundEvents.push(name)},
    NeonMusic:{muted:false,reset(){},setScene:name=>musicEvents.push(name)}}, assert, soundEvents, musicEvents, element,
};
vm.runInNewContext(fs.readFileSync(path.join(project,'mission.js'),'utf8'),globals);

const source = fs.readFileSync(path.join(project,'game.js'), 'utf8');
const startup = source.indexOf('  updateUI();requestAnimationFrame(frame);');
assert.ok(startup >= 0);
const injected = source.slice(0,startup) + `
  selectedClass = classes[1];
  updateUI = () => {};
  start(masters[0]);
  assert.equal(builds.length, 2);
  assert.equal(builds[1].id, 'repair');
  addSkill(masters[1]);
  enemies = [{x:player.x+130,y:player.y,hp:1000,r:12}];
  activateSkills(.55);
  assert.equal(bullets.length, 1);
  assert.equal(builds[0].charge, 0);
  assert.ok(builds[2].charge > 0 && builds[2].charge < builds[2].cost);
  activateSkills(.17);
  assert.equal(bullets.length, 4);
  assert.equal(builds[2].charge, 0);
  activateSkills(5);
  assert.equal(builds[1].charge, 75);
  hp=100;
  activateSkills(.01);
  assert.ok(hp > 100);
  assert.equal(builds[1].charge, 0);
  const attack = builds[0];
  attack.nodes.push(nodes.find(n=>n.id==='discount'));
  assert.equal(costOf(attack), 34);
  attack.nodes.push(nodes.find(n=>n.id==='haste'));
  assert.ok(chargeRate(attack) > 68);
  for(const skill of [...masters, ...subs]) {
    addSkill(skill);
  }
  assert.equal(builds.length, 17);
  const shock = builds.find(skill=>skill.id==='shock');
  assert.equal(shock.cooldown, 0);
  activateSkills(.01);
  assert.ok(shock.cooldown > 0);
  const at = (dx,dy) => ({x:player.x+dx,y:player.y+dy,hp:1000,max:1000,r:12,hit:0});
  const get = id => builds.find(s=>s.id===id);
  enemies=[at(55,0),at(100,30),at(160,30),at(-100,0)];
  assert.ok(shoot(get('arc')));
  assert.equal(enemies.filter(e=>e.hp<1000).length,3);
  enemies=[at(75,0),at(-85,0)];
  assert.ok(shoot(get('slash')));
  assert.ok(enemies[0].hp<1000);
  assert.equal(enemies[1].hp,1000);
  enemies=[at(145,0)]; zones=[];
  assert.ok(shoot(get('orbital')));
  assert.equal(enemies[0].hp,1000);
  updateZones(.3); assert.equal(enemies[0].hp,1000);
  updateZones(.3); assert.ok(enemies[0].hp<1000);
  assert.ok(useSub(get('frost')));
  assert.ok(enemies[0].slowUntil>clock);
  enemies=[at(30,0),at(150,0)];
  assert.ok(useSub(get('magnet')));
  assert.ok(enemies[1].x<player.x+150);
  assert.ok(useSub(get('aegis')));
  const before=hp;
  player.inv=0;
  hurtPlayer(20);
  assert.ok(before-hp < 20/selectedClass.def*.5);
  wave=10; zones=[];
  const boss={...at(290,0),boss:true,max:1000,hp:400,attackIn:0};
  bossAttack(boss,.01);
  assert.equal(zones.length,3);
  enemies.push(boss);
  updateMusic();
  assert.equal(musicEvents.at(-1),'boss');
  const beforeDodge=hp;
  player.y+=120; player.inv=0;
  updateZones(1);
  assert.equal(hp,beforeDodge);
  assert.equal(zones.length,1);
  updateZones(.7);
  assert.equal(hp,beforeDodge);
  assert.ok(soundEvents.includes('alert') && soundEvents.includes('burst') && soundEvents.includes('radio'));
  const arenaMode = modeDefs.demo.rounds.join(',');
  assert.equal(arenaMode, '13,13,22');
  assert.equal(modeDefs.hour.rounds.join(','),'90,90,180');
  assert.equal(modeDefs.spec.rounds.join(','),'300,300,600');
  const sentry={...at(200,0),attackIn:0,aim:null,damage:18};
  gunnerAttack(sentry,.01,200);
  assert.ok(sentry.aim && hostileShots.length===0);
  gunnerAttack(sentry,.58,200);
  assert.equal(hostileShots.length,1);
  assert.ok(hostileShots[0].vx<0 && soundEvents.includes('enemyfire'));
  const showVictory = victory;
  let cleared = false;
  victory = () => { cleared = true; };
  wave=10; round=3; bossSpawned=true; nextRoundPending=true;
  advanceRound();
  assert.equal(cleared, true);

  let seed=93;
  Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
  selectedClass=classes[1];
  start(masters.find(s=>s.id==='beam'));
  victory=()=>{state='ended';cleared=true};
  cleared=false;
  const preference=['frost','aegis','orbit','magnet','arc','shock','orbital','barrier','haste'];
  const visited=new Set();
  let firstUpgrade=0;
  for(let frame=0; frame<24000 && state!=='ended'; frame++) {
    visited.add(wave);
    if(state==='choice') {
      if(!firstUpgrade) firstUpgrade=clock;
      const reward=preference.map(id=>choices.find(c=>c.id===id&&c.choiceKind==='skill')).find(Boolean)
        ?? choices.find(c=>c.kind==='main'&&c.choiceKind==='skill')
        ?? choices.find(c=>c.choiceKind==='rank') ?? choices[0];
      selectChoice(reward);
      continue;
    }
    const angle=clock*.51;
    const destination={x:480+Math.cos(angle)*258,y:300+Math.sin(angle)*165};
    const dx=destination.x-player.x,dy=destination.y-player.y;
    pointer=Math.hypot(dx,dy)>6?{dx,dy}:null;
    update(.04);
  }
  assert.ok(cleared, 'Demo run failed at wave '+wave+', round '+round+', HP '+hp+', clock '+clock);
  assert.equal(visited.size,10);
  assert.ok(firstUpgrade<15, 'First upgrade took '+firstUpgrade+' seconds');
  assert.equal(missionLog.length,5);
  console.log('First upgrade '+firstUpgrade.toFixed(1)+'s; full rush clear '+clock.toFixed(1)+'s; HP '+Math.round(hp)+'/'+maxHp);
  showVictory();
  assert.match(element.innerHTML,/帰還信号/);
  assert.match(element.innerHTML,/避難艇は全員を乗せて発進/);
  assert.ok(soundEvents.includes('clear'));
  assert.equal(musicEvents.at(-1),null);
})();`;
vm.runInNewContext(injected, globals);
console.log('Independent charge, node effects, six new skills, boss dodge, audio cues and a seeded 10-wave demo clear passed.');
