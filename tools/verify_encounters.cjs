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
  updateUI=()=>{};start(masters[0]);
  const first=encounterProfile(1,0),last=encounterProfile(10,600);
  assert.ok(last.batch>first.batch&&last.interval<first.interval);
  assert.ok(last.hpScale>first.hpScale*5&&last.damageScale>first.damageScale);
  enemies=[];spawned=0;wave=4;clock=0;
  for(const role of ['swarm','tank','gunner','hunter']){
    const e=spawnEnemy(false,{role});
    const baseline=role==='tank'||role==='gunner'?71:role==='hunter'?123:null;
    if(baseline)assert.equal(e.speed,baseline*(1+wave*.044));
    else assert.ok(e.speed>=68*(1+wave*.044)&&e.speed<=92*(1+wave*.044));
    assert.ok(e.x<0||e.y<0||e.x>W||e.y>H);
  }
  const earlyTank=enemies.find(e=>e.role==='tank');clock=600;
  const lateTank=spawnEnemy(false,{role:'tank'});
  assert.equal(earlyTank.speed,lateTank.speed);assert.ok(lateTank.hp>earlyTank.hp&&lateTank.damage>earlyTank.damage);
  assert.ok(lateTank.knockbackFactor<1);
  enemies=[];spawned=0;mode='hour';wave=8;clock=120;
  for(let i=0;i<100;i++)spawnBatch();
  assert.equal(enemies.length,MAX_ENEMIES-1);assert.ok(enemies.length>100);
  assert.ok(spawnEnemy(true));assert.equal(enemies.length,MAX_ENEMIES);assert.equal(spawnEnemy(),false);
  const old=enemies[0];old.hp=0;recycleEnemies();
  assert.ok(!enemies.includes(old));assert.equal(enemyPool.length,0);
  clock+=7;recycleEnemies();assert.ok(enemyPool.includes(old));
  enemies=enemies.filter(e=>!e.boss);
  const reused=spawnEnemy(false,{role:'swarm'});assert.equal(reused,old);assert.equal(reused.aim,null);assert.equal(reused.pooled,false);
  enemies=[];spawned=0;clock=25;nextRushAt=25;updatePressure();assert.equal(rushing(),false);
  clock=27;assert.equal(rushing(),true);clock=35;assert.equal(rushing(),false);
  mode='demo';wave=3;round=3;enemies=[];spawned=roundQuota();bossSpawned=false;nextRoundPending=false;endRound();
  assert.equal(bossSpawned,true);assert.equal(enemies.filter(e=>e.boss).length,1);endRound();assert.equal(enemies.length,1);
  mode='hour';enemies=[];wave=8;clock=300;spawned=0;
  for(let i=0;i<160;i++)spawnEnemy(false,{role:'swarm'});
  enemies.forEach((e,i)=>{e.x=30+i%16*56;e.y=30+Math.floor(i/16)*50;});
  bullets=[];for(let i=0;i<512;i++)bullets.push({x:50+i%20*40,y:50+Math.floor(i/20)%10*45,vx:560,vy:0,r:5,life:1,pierce:999,damage:0,hits:new Set(),homing:false});
  const begin=performance.now();for(let i=0;i<120;i++)updateBullets(.001);
  console.log('160 enemies / 512 projectiles, 120 collision ticks: '+(performance.now()-begin).toFixed(1)+'ms (headless CPU test; excludes rendering)');
  start(masters[0]);assert.equal(nextRushAt,25);assert.equal(retiredEnemies.length,0);assert.equal(enemyPool.length,0);
  console.log('Encounter tests passed: scaling, unchanged speeds, formations, cap, delayed pool reuse, rush and boss progression.');
  }
})();`;
vm.runInNewContext(source.slice(0,startup)+cases,{...globals,performance},{timeout:10000});
