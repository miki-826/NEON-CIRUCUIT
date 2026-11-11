// Integration tests execute the actual game functions, not a second combat implementation.
// Run: node tools/verify_upgrade_combat.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const root = path.resolve(__dirname,'..');
const element = {getContext:() => ({}),addEventListener(){},setAttribute(){},focus(){},style:{},dataset:{},
  classList:{add(){},remove(){},toggle(){}},children:[],querySelectorAll:() => [],querySelector:() => element};
element.firstElementChild = element;
const globals = {
  Image:class {}, matchMedia:() => ({matches:false}), crypto:{randomUUID}, structuredClone, console, assert,
  document:{body:element,getElementById:() => element,addEventListener(){},querySelectorAll:() => []},
  window:{addEventListener(){},NeonAudio:{muted:false,play(){}},NeonMusic:{muted:false,reset(){},setScene(){}}}
};
vm.runInNewContext(fs.readFileSync(path.join(root,'circuit-model.js'),'utf8'),globals);
vm.runInNewContext(fs.readFileSync(path.join(root,'mission.js'),'utf8'),globals);
const source = fs.readFileSync(path.join(root,'game.js'),'utf8');
const startup = source.indexOf('  updateUI();requestAnimationFrame(frame);');
assert.ok(startup >= 0,'The game test entry point must exist');
const cases = `
  {
  const close = (actual,expected,message) => assert.ok(Math.abs(actual-expected)<1e-7, message+': '+actual+' vs '+expected);
  updateUI = () => {};
  selectedClass = classes[1];
  start(masters.find(s => s.id==='pulse'));
  function fixture(id, nodeIds=[]) {
    builds=[]; inventory=[]; enemies=[]; bullets=[]; zones=[]; effects=[]; hostileShots=[];
    xp=0; xpNeed=1000000; level=1; clock=0; roundTime=0; spawnClock=0; lastUI=1000000; state='running';
    player={x:400,y:300,r:14,inv:100,angle:0,guardUntil:0,vx:0,vy:0}; hp=maxHp;
    addSkill([...masters,...subs].find(s=>s.id===id));
    const skill=builds[0]; skill.nodes=nodeIds.map(nodeId=>circuit.createNode(nodeId));
    return skill;
  }
  const enemy = (x,y=300) => ({x,y,r:12,hp:1000000,max:1000000,speed:0,damage:0,hit:0});
  const preview = skill => circuit.compileSkill(skill,{attack:selectedClass.atk,level,chargeBoost:1});

  // The editor preview, actual fired projectile and charge HUD calculations share one result.
  let skill=fixture('pulse'); enemies=[enemy(650)];
  assert.ok(shoot(skill));
  const base={damage:bullets[0].damage,speed:Math.hypot(bullets[0].vx,bullets[0].vy),count:bullets.length,cooldown:preview(skill).cooldown};
  skill.nodes=['power','multishot','haste','velocity','pierce','homing','area','explosion','split'].map(id=>circuit.createNode(id));
  bullets=[];
  const compiled=preview(skill);
  assert.ok(shoot(skill));
  assert.equal(bullets.length,compiled.projectileCount);
  assert.ok(bullets.length>base.count,'Multishot must create more real projectiles');
  close(bullets[0].damage,compiled.damage,'Projectile damage must equal preview');
  close(Math.hypot(bullets[0].vx,bullets[0].vy),compiled.projectileSpeed,'Projectile speed must equal preview');
  assert.ok(compiled.damage>base.damage && compiled.projectileSpeed>base.speed);
  assert.ok(compiled.cooldown<base.cooldown,'Longer upgrade chain must speed up firing');
  close(costOf(skill),compiled.cost,'Actual charge cost must equal preview');
  close(chargeRate(skill),compiled.chargeRate,'Actual charge rate must equal preview');
  assert.equal(bullets[0].pierce,compiled.pierce);
  assert.ok(bullets[0].homing);
  assert.ok(bullets[0].stats && bullets[0].stats.explosionRadius>0 && bullets[0].stats.splitCount>0);

  // Reversing order changes damage without inventing or duplicating an owned node.
  skill=fixture('pulse',['power','amplifyPrevious','area']);
  const ordered=damageFor(skill), owned=skill.nodes.map(n=>n.uid).sort().join(',');
  skill.nodes.reverse();
  assert.notEqual(damageFor(skill),ordered,'Amplification must depend on chain order');
  assert.equal(skill.nodes.map(n=>n.uid).sort().join(','),owned);

  // A drag transfer updates the source and target combat stats immediately.
  skill=fixture('pulse',['power','velocity','multishot']);
  addSkill(masters.find(s=>s.id==='volley'));
  const target=builds[1], sourceBefore=damageFor(skill), targetBefore=damageFor(target);
  const node=skill.nodes[0], countBefore=builds.reduce((sum,s)=>sum+s.nodes.length,0)+inventory.length;
  circuit.transferTail(builds,inventory,{kind:'skill',skillId:skill.id,uid:node.uid},{kind:'skill',skillId:target.id,afterUid:null});
  assert.equal(skill.nodes.length,0);
  assert.equal(target.nodes.length,3);
  assert.ok(damageFor(skill)<sourceBefore && damageFor(target)>targetBefore);
  assert.equal(builds.reduce((sum,s)=>sum+s.nodes.length,0)+inventory.length,countBefore);
  const detachedUid=target.nodes[1].uid;
  circuit.transferTail(builds,inventory,{kind:'skill',skillId:target.id,uid:detachedUid},{kind:'inventory'});
  assert.equal(target.nodes.length,1);
  assert.equal(inventory.length,2);
  assert.equal(builds.reduce((sum,s)=>sum+s.nodes.length,0)+inventory.length,countBefore);

  // Projectile properties are snapshots: subsequent editing cannot rewrite a bullet in flight.
  skill=fixture('pulse',['power','velocity','leech']); enemies=[enemy(650)];
  shoot(skill); const launched=bullets[0], launchedDamage=launched.damage, launchedStats=launched.stats;
  skill.nodes=[];
  assert.equal(launched.damage,launchedDamage);
  assert.equal(launched.stats,launchedStats);
  assert.ok(launched.damage>damageFor(skill));
  hp=maxHp-20; launched.x=650; launched.y=300; launched.vx=0; launched.vy=0;
  const hpBeforeLeech=hp;
  updateBullets(0);
  close(hp-hpBeforeLeech,launchedStats.leech,'Hit effects must retain their launch-time snapshot');

  // Homing must steer without silently reverting a velocity-enhanced projectile to fixed 420 speed.
  skill=fixture('pulse',['velocity','homing']); enemies=[enemy(700)]; shoot(skill);
  const fast=bullets[0]; fast.x=500; fast.y=300;
  const speedBefore=Math.hypot(fast.vx,fast.vy);
  updateBullets(.05);
  close(Math.hypot(fast.vx,fast.vy),speedBefore,'Homing toward a collinear enemy must preserve upgraded speed');

  // Pierce counts distinct targets and never repeatedly damages the same enemy while overlapping.
  skill=fixture('pulse',['pierce']); enemies=[enemy(600),enemy(620)]; shoot(skill);
  const piercing=bullets[0]; piercing.x=600; piercing.y=300; piercing.vx=0; piercing.vy=0;
  const hpBefore=enemies[0].hp;
  updateBullets(0); const afterHit=enemies[0].hp;
  assert.ok(afterHit<hpBefore); assert.ok(bullets.includes(piercing));
  updateBullets(0); assert.equal(enemies[0].hp,afterHit);
  piercing.x=620; updateBullets(0); assert.ok(enemies[1].hp<1000000);

  // Impact explosion damages a neighbour outside the direct collision radius.
  skill=fixture('pulse',['explosion']); enemies=[enemy(600),enemy(640)]; shoot(skill);
  const explosive=bullets[0]; explosive.x=600; explosive.y=300; explosive.vx=0; explosive.vy=0;
  updateBullets(0);
  assert.ok(enemies[0].hp<1000000 && enemies[1].hp<1000000,'Explosion must damage nearby enemies');
  const explosionDamage=1000000-enemies[1].hp;
  close(explosionDamage,preview(skill).damage*preview(skill).explosionDamage,'Splash damage must equal compiled multiplier');

  // Split children are deferred, capped, and cannot recursively explode/split into an infinite cascade.
  skill=fixture('pulse',['split','explosion']); enemies=[enemy(600),enemy(640)]; shoot(skill);
  const splitting=bullets[0]; splitting.x=600; splitting.y=300; splitting.vx=0; splitting.vy=0;
  updateBullets(0);
  assert.ok(bullets.length>0 && bullets.length<=preview(skill).splitCount);
  assert.ok(bullets.every(b=>b.generation===1),'Only one child generation is allowed');
  const childCount=bullets.length;
  const splashBystander=enemy(680); enemies.push(splashBystander);
  for(const child of bullets) {child.x=640; child.y=300; child.vx=0; child.vy=0;}
  updateBullets(0);
  assert.ok(bullets.length<=childCount,'Child impact must not create further children');
  assert.equal(splashBystander.hp,1000000,'Split children must not recursively trigger new explosions');
  assert.ok(bullets.length<=512);

  // Non-projectile skills use the same enhanced range, not only an optimistic preview.
  skill=fixture('blast'); enemies=[enemy(580)];
  assert.equal(shoot(skill),false);
  skill.nodes=['area','area','power'].map(id=>circuit.createNode(id));
  assert.ok(shoot(skill)); assert.ok(enemies[0].hp<1000000);
  skill=fixture('frost',['area','power']); enemies=[enemy(590)];
  assert.ok(useSub(skill)); assert.ok(enemies[0].hp<1000000 && enemies[0].slowUntil>clock);
  skill=fixture('orbital',['area','power']); enemies=[enemy(600)];
  shoot(skill);
  const launchedZone=zones[0], zoneDamage=launchedZone.damage;
  const zoneNeighbour=enemy(600+launchedZone.r+11); enemies.push(zoneNeighbour);
  skill.nodes=[];
  updateZones(.6);
  close(1000000-enemies[0].hp,zoneDamage,'Delayed orbital damage must keep the compiled launch-time strength');
  close(1000000-zoneNeighbour.hp,zoneDamage,'Delayed orbital radius must keep the compiled launch-time area');

  // Utility upgrades affect healing/guard and the passive class stats used by the game loop.
  skill=fixture('repair',['power','amplifyPrevious']); hp=maxHp*.3;
  const beforeRepair=hp;
  assert.ok(useSub(skill));
  close(hp-beforeRepair,maxHp*.18*preview(skill).utilityPower,'Healing power must use compiled utility strength');
  skill=fixture('aegis',['power']); enemies=[enemy(480)];
  assert.ok(useSub(skill));
  close(player.guardUntil-clock,2*preview(skill).utilityPower,'Guard duration must use compiled utility strength');
  skill=fixture('barrier',['power','power']); player.inv=0;
  const beforeBarrier=hp;
  hurtPlayer(10);
  close(beforeBarrier-hp,10*Math.max(.1,1-.27*preview(skill).utilityPower)/selectedClass.def,'Damage mitigation must use compiled barrier strength');
  skill=fixture('haste',['power','power']);
  const hastePower=preview(skill).utilityPower;
  addSkill(masters.find(s=>s.id==='pulse'));
  const boostedPulse=builds[1];
  close(chargeRate(boostedPulse),circuit.compileSkill(boostedPulse,{attack:selectedClass.atk,level,chargeBoost:1+.25*hastePower}).chargeRate,'Global haste must affect real skill charge');
  keys=new Set(['d']);
  const xBeforeHaste=player.x;
  update(.01);
  close(player.x-xBeforeHaste,selectedClass.speed*(1+.18*hastePower)*.01,'Global haste must affect real movement');
  keys.clear();
  skill=fixture('orbit',['area','multishot','power']);
  const orbitStats=preview(skill); enemies=[enemy(player.x+orbitStats.radius-1)];
  activateSkills(0);
  close(1000000-enemies[0].hp,orbitStats.damage,'Passive damage must use the same compiled stats');

  // Skill charge actually respects the compiled interval; it is not just a display value.
  skill=fixture('pulse',['haste','haste','power']); enemies=[enemy(650)];
  const cooldown=costOf(skill)/chargeRate(skill);
  activateSkills(cooldown*.5); assert.equal(bullets.length,0);
  activateSkills(cooldown*.51); assert.ok(bullets.length>0); assert.equal(skill.charge,0);

  // Swept collisions must hit an enemy crossed between frames by an accelerated projectile.
  skill=fixture('pulse',['velocity','velocity','velocity','velocity']); enemies=[enemy(445)];
  shoot(skill);
  assert.ok(bullets[0].x+bullets[0].vx*.08>enemies[0].x+enemies[0].r+bullets[0].r);
  updateBullets(.08);
  assert.ok(enemies[0].hp<1000000,'Accelerated projectiles must not tunnel through enemies');

  // Renderer and simulation both cap at 512 live projectiles, and a failed cast keeps charge.
  skill=fixture('pulse',Array(20).fill('multishot')); enemies=[enemy(650)]; shoot(skill);
  const sample=bullets[0];
  bullets=Array.from({length:510},()=>({...sample,hits:new Set()}));
  assert.ok(shoot(skill)); assert.equal(bullets.length,512);
  skill.charge=costOf(skill);
  activateSkills(0);
  assert.equal(bullets.length,512); assert.equal(skill.charge,costOf(skill));
  enemies=[]; bullets=[];
  activateSkills(0); assert.equal(skill.charge,costOf(skill));
  enemies=[enemy(650)]; activateSkills(0); assert.equal(skill.charge,0);
  skill=fixture('repair',['power']); skill.charge=costOf(skill); hp=maxHp;
  activateSkills(1); assert.equal(skill.charge,costOf(skill),'Full HP must preserve a fully charged repair');
  hp=maxHp*.4; activateSkills(0); assert.equal(skill.charge,0);

  // Unsupported projectile effects are explicitly ignored, not counted as phantom chain power.
  skill=fixture('beam',['power']);
  const validBeamDamage=damageFor(skill), validBeamChain=preview(skill).chainCount;
  skill.nodes.push(circuit.createNode('homing'));
  assert.equal(preview(skill).ignoredNodes.length,1);
  assert.equal(preview(skill).chainCount,validBeamChain);
  assert.equal(damageFor(skill),validBeamDamage);
  enemies=[enemy(600)]; shoot(skill);
  close(1000000-enemies[0].hp,validBeamDamage,'Beam hits must agree with the compatible-node preview');
  console.log('Upgrade combat passed: preview parity, ordered amplification, ownership transfers, snapshots, homing velocity, piercing, explosions, finite splits, area and real charge.');
  }
})();
`;
vm.runInNewContext(source.slice(0,startup)+cases,globals,{timeout:10000});
