// Run with: node tools/verify_circuit.cjs
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');
const {randomUUID} = require('node:crypto');
const assert = require('node:assert/strict');
const context = {window:{}, crypto:{randomUUID}, structuredClone};
runInNewContext(readFileSync(join(__dirname,'..','circuit-model.js'),'utf8'),context);
const {GraphStore, validate, descendants, parentOf} = context.window.NeonCircuit;
const point = (x = 30, y = 40) => ({x,y});
const store = new GraphStore();
const event = store.add('event.enemyDefeated',point());
const condition = store.add('condition.chance',point(),{}, {id:event,port:'next'});
const action = store.add('action.castSkill',point(),{}, {id:condition,port:'then'});
const otherwise = store.add('action.buff',point(),{}, {id:condition,port:'else'});
const after = store.add('action.castSkill',point(),{skillId:'beam'}, {id:condition,port:'next'});
const tail = store.add('action.buff',point(),{}, {id:action,port:'next'});
assert.equal(descendants(store.document,event).size,6);
assert.equal(parentOf(store.document,otherwise).port,'else');

// Dragging from the middle removes only its incoming edge, and keeps all descendants.
store.move(condition,point(500,300));
assert.equal(store.document.nodes[event].links.next,null);
assert.equal(descendants(store.document,condition).size,5);
assert.equal(store.document.roots.length,2);
assert.equal(store.document.layout.rootPositions[condition].x,500);
store.undo();
assert.equal(store.document.nodes[event].links.next,condition);
assert.equal(store.document.roots.length,1);
store.redo();
store.connect(condition,event,'next');
assert.equal(store.document.roots.length,1);

// Single removal preserves both branches on a condition, but reconnects its outer next.
store.detachOnly(condition,point(600,400));
assert.equal(store.document.nodes[event].links.next,after);
assert.equal(store.document.nodes[condition].links.next,null);
assert.equal(store.document.nodes[condition].links.then,action);
assert.equal(store.document.nodes[condition].links.else,otherwise);
assert.equal(descendants(store.document,condition).size,4);
store.undo();
store.detachOnly(action,point(700,400));
assert.equal(store.document.nodes[condition].links.then,tail);
assert.equal(store.document.nodes[action].links.next,null);
store.undo();

// Invalid graph edits roll back atomically, including history and revision.
function rejects(operation, pattern) {
  const before = JSON.stringify(store.document), revision = store.revision, history = store.past.length;
  assert.throws(operation,pattern);
  assert.equal(JSON.stringify(store.document),before);
  assert.equal(store.revision,revision);
  assert.equal(store.past.length,history);
}
rejects(() => store.connect(condition,tail,'next'),/子孫/);
rejects(() => store.connect(event,tail,'next'),/子孫|接続先/);
rejects(() => store.connect(action,condition,'else'),/使用中/);
rejects(() => store.setParams(condition,{probability:1.1}),/値が不正/);
rejects(() => store.setParams(condition,{probability:NaN}),/値が不正/);
rejects(() => store.setParams(condition,{probability:.5,unknown:1}),/数が不正/);
rejects(() => store.move(event,point(-1,3)),/配置/);
rejects(() => store.add('event.deploy',point(),{},{id:tail,port:'next'}),/接続先/);
rejects(() => store.add('constructor',point()),/不明/);
assert.ok(Object.isFrozen(store.document.nodes[condition].params));

// Parent sharing and disconnected cycles must fail even outside normal editor commands.
const shared = structuredClone(store.document);
shared.nodes[tail].links.next = after;
assert.throws(() => validate(shared),/複数/);
const cyclic = new GraphStore();
const a = cyclic.add('action.buff',point()), b = cyclic.add('action.buff',point());
const invalid = structuredClone(cyclic.document);
invalid.nodes[a].links.next = b; invalid.nodes[b].links.next = a;
invalid.roots = []; invalid.layout.rootPositions = {};
assert.throws(() => validate(invalid),/循環/);

// Remove an entire branch, undo restores every parameter and edge, not only the root.
const beforeDelete = JSON.stringify(store.document);
store.remove(condition);
assert.equal(Object.keys(store.document.nodes).length,1);
store.undo(); assert.equal(JSON.stringify(store.document),beforeDelete);
store.redo(); assert.equal(Object.keys(store.document.nodes).length,1);
store.undo();
store.setParams(condition,{probability:.75});
assert.equal(store.future.length,0);

// A palette drop that creates and connects a block is exactly one undo operation.
const target = new GraphStore();
const root = target.add('event.deploy',point());
const revision = target.revision;
target.add('action.buff',point(),{},{id:root,port:'next'});
assert.equal(target.revision,revision+1);
target.undo(); assert.equal(Object.keys(target.document.nodes).length,1);
target.redo(); assert.equal(Object.keys(target.document.nodes).length,2);

// Depth limit and history bounds are enforced without damaging the current document.
const deep = new GraphStore();
let last = deep.add('event.deploy',point());
for (let i=1; i<32; i++) last = deep.add('action.buff',point(),{},{id:last,port:'next'});
const beforeDepth = JSON.stringify(deep.document);
assert.throws(() => deep.add('action.buff',point(),{},{id:last,port:'next'}),/32段/);
assert.equal(JSON.stringify(deep.document),beforeDepth);
for (let i=0; i<110; i++) target.move(root,point(i,40));
assert.equal(target.past.length,100);
const other = target.add('event.deploy',point());
target.move(root,point(900,90));
assert.equal(target.document.roots[0],root,'Moving a root must not change event execution order');
assert.equal(target.document.roots[1],other);
const tooMany = structuredClone(new GraphStore().document);
for (let i=0; i<257; i++) {
  const id = `block-${i}`;
  tooMany.nodes[id] = {id,type:'action.buff',params:{stat:'attack',multiplier:1.2,duration:3},links:{next:null}};
  tooMany.roots.push(id); tooMany.layout.rootPositions[id] = point();
}
assert.throws(() => validate(tooMany),/256個/);
console.log('Passed: branch graphs, group/single detach, atomic edits, invalid connections, undo/redo and limits.');
