// Pure strengthening compiler and ownership operations: node tools/verify_circuit.cjs
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {randomUUID} = require('node:crypto');
const assert = require('node:assert/strict');
const context = {window:{},crypto:{randomUUID}};
runInNewContext(readFileSync(join(__dirname,'..','circuit-model.js'),'utf8'),context);
const api = context.window.NeonCircuit;
const {compileSkill,createNode,transferTail,isCompatible,MAX_CHAIN} = api;
const skill = (id='pulse',nodes=[]) => ({id,kind:'main',damage:17,cost:36,rank:1,nodes:nodes.map(createNode)});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
const base = skill();
const baseStats = compileSkill(base);
near(baseStats.damage,17); assert.equal(baseStats.cost,36);
assert.equal(baseStats.chargeRate,68); near(baseStats.interval,36/68);
assert.equal(baseStats.projectileCount,1); assert.equal(baseStats.projectileSpeed,560);
assert.equal(baseStats.pierce,1); assert.equal(baseStats.chainCount,0);
assert.ok(Object.isFrozen(baseStats)); assert.strictEqual(compileSkill(base),baseStats);
near(compileSkill({...base,rank:3},{attack:1.12,level:4}).damage,17*1.36*1.12*Math.pow(1.18,3));

// Every compatible tail addition increases damage while preserving all prior upgrades.
const growing = skill();
let previous = compileSkill(growing);
for (const definition of api.nodeDefinitions) {
  growing.nodes.push(createNode(definition.id));
  const current = compileSkill(growing);
  assert.ok(current.damage > previous.damage,definition.id + ' must strengthen the chain');
  assert.ok(current.projectileCount >= previous.projectileCount);
  assert.ok(current.projectileSpeed >= previous.projectileSpeed);
  assert.ok(current.pierce >= previous.pierce);
  assert.ok(current.chargeRate >= previous.chargeRate);
  assert.ok(current.cost <= previous.cost);
  assert.ok(current.interval <= previous.interval);
  previous = current;
}
near(previous.chainMultiplier,1+.05*api.nodeDefinitions.length);
assert.equal(previous.chainCount,api.nodeDefinitions.length);
assert.ok(previous.homing && previous.explosionRadius > 0 && previous.splitCount >= 2 && previous.leech > 0);
assert.strictEqual(compileSkill(growing),previous);
growing.rank++;
assert.notStrictEqual(compileSkill(growing),previous,'Rank changes must invalidate compilation cache');
const speedBefore = compileSkill(growing).chargeRate;
assert.ok(compileSkill(growing,{chargeBoost:1.25}).chargeRate > speedBefore);

// Order, rather than counts alone, changes actual skill parameters.
const amplifiedPower = compileSkill(skill('pulse',['power','amplifyPrevious']));
const plainPower = compileSkill(skill('pulse',['amplifyPrevious','power']));
assert.ok(amplifiedPower.damage > plainPower.damage);
near(amplifiedPower.contributions[0].potency,1.5);
const boostedMulti = compileSkill(skill('pulse',['amplifyFollowing','multishot']));
const plainMulti = compileSkill(skill('pulse',['multishot','amplifyFollowing']));
assert.ok(boostedMulti.projectileCount > plainMulti.projectileCount);
const mixed = compileSkill(skill('pulse',['amplifyFollowing','power','amplifyPrevious','multishot']));
near(mixed.contributions[1].potency,2.25);
assert.ok(mixed.contributions[3].potency > 1);

// Native homing and volley remain intact; nonprojectiles reject inappropriate modifiers.
assert.equal(compileSkill(skill('seeker')).homing,true);
assert.equal(compileSkill(skill('seeker')).projectileSpeed,400);
assert.equal(compileSkill(skill('volley')).projectileCount,3);
assert.equal(isCompatible(skill('beam'),'homing'),false);
assert.equal(isCompatible(skill('repair'),'split'),false);
assert.equal(isCompatible({id:'barrier',cost:0},'discount'),false);
assert.equal(isCompatible({id:'barrier',cost:0},'power'),true);
const incompatible = compileSkill(skill('beam',['homing']));
assert.equal(incompatible.chainCount,0); assert.equal(incompatible.ignoredNodes.length,1);
const area = compileSkill(skill('blast',['area','multishot']));
assert.ok(area.radius > 155); assert.equal(area.range,area.radius);
near(compileSkill({id:'orbit',kind:'passive',rank:2,cost:0,nodes:[]}).damage,9*1.18);
near(compileSkill({id:'shock',kind:'passive',rank:1,cost:0,nodes:[]}).cooldown,2.8);

// Unique physical node ownership survives attach, middle-tail transfer, and detach.
const builds = [skill(),skill('volley')];
const inventory = ['power','multishot','amplifyFollowing','velocity'].map(createNode);
const ownedUids = () => [...inventory,...builds.flatMap(s=>s.nodes)].map(node=>node.uid).sort();
const initial = ownedUids();
const power = inventory[0], multi = inventory[1], amplifier = inventory[2], velocity = inventory[3];
transferTail(builds,inventory,{kind:'inventory',uid:power.uid},{kind:'skill',skillId:'pulse',afterUid:null});
transferTail(builds,inventory,{kind:'inventory',uids:[multi.uid,amplifier.uid,velocity.uid]},{kind:'skill',skillId:'pulse',afterUid:power.uid});
assert.equal(inventory.length,0); assert.equal(builds[0].nodes.length,4);
assert.deepEqual(ownedUids(),initial);
transferTail(builds,inventory,{kind:'skill',skillId:'pulse',uid:multi.uid},{kind:'skill',skillId:'volley',afterUid:null});
assert.equal(builds[0].nodes.length,1); assert.equal(builds[1].nodes.length,3);
assert.strictEqual(builds[1].nodes[0],multi,'Transfers move the actual owned instance');
assert.deepEqual(ownedUids(),initial);
transferTail(builds,inventory,{kind:'skill',skillId:'volley',uid:amplifier.uid},{kind:'inventory'});
assert.equal(builds[1].nodes.length,1); assert.equal(inventory.length,2);
assert.deepEqual(ownedUids(),initial);

const snapshot = () => JSON.stringify({builds,inventory});
function rejected(source,target,pattern) {
  const before = snapshot();
  assert.throws(()=>transferTail(builds,inventory,source,target),pattern);
  assert.equal(snapshot(),before,'Invalid transfers must not mutate either inventory or skill chains');
}
rejected({kind:'inventory',uid:'fabricated-node'},{kind:'skill',skillId:'pulse',afterUid:null},/所持/);
rejected({kind:'inventory',uids:[amplifier.uid,amplifier.uid]},{kind:'skill',skillId:'pulse',afterUid:null},/指定/);
rejected({kind:'skill',skillId:'volley',uid:multi.uid},{kind:'skill',skillId:'volley',afterUid:multi.uid},/自身/);
rejected({kind:'inventory',uid:amplifier.uid},{kind:'skill',skillId:'pulse',afterUid:'missing'},/接続先/);
builds.push({...skill('beam'),nodes:[]});
rejected({kind:'inventory',uid:velocity.uid},{kind:'skill',skillId:'beam',afterUid:null},/弾に接続/);
inventory.push({...power});
rejected({kind:'inventory',uid:velocity.uid},{kind:'skill',skillId:'pulse',afterUid:null},/重複/);
inventory.pop();

// Caps keep extreme but valid inflation finite, and appending never makes costs negative.
const huge = skill('pulse',Array.from({length:MAX_CHAIN},(_,i) => i%3===0 ? 'amplifyFollowing' : i%3===1 ? 'multishot' : 'haste'));
const hugeStats = compileSkill({...huge,rank:1000},{attack:1000,level:1000,chargeBoost:1000});
for (const value of Object.values(hugeStats)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
assert.ok(hugeStats.projectileCount <= 32 && hugeStats.projectileSpeed <= 2000);
assert.ok(hugeStats.cooldown >= .04 && hugeStats.cost >= 1);
near(hugeStats.cooldown,hugeStats.cost/hugeStats.chargeRate);
assert.throws(()=>compileSkill(skill('pulse',Array(MAX_CHAIN+1).fill('power'))),/64個/);
const full = skill('pulse',Array(MAX_CHAIN).fill('power'));
const spare = [createNode('power')];
const fullBefore = JSON.stringify({full,spare});
assert.throws(()=>transferTail([full],spare,{kind:'inventory',uid:spare[0].uid},{kind:'skill',skillId:'pulse',afterUid:null}),/64個/);
assert.equal(JSON.stringify({full,spare}),fullBefore);
assert.equal(api.nodeDefinitions.length,13);
console.log('Passed: chain bonuses, order-dependent amplification, baseline skills, stat caps, cache invalidation and atomic ownership transfers.');
