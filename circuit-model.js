(() => {
  'use strict';
  const api = window.NeonCircuit = window.NeonCircuit || {};
  const skillIds = ['pulse','volley','beam','blast','seeker','arc','orbital','slash','repair','dash','frost','magnet','aegis'];
  const number = (label, initial, min, max, step = .1) => ({label, initial, min, max, step});
  const definitions = {
    'event.deploy': {kind:'event', label:'出撃したとき', fields:{}},
    'event.enemyDefeated': {kind:'event', label:'敵を撃破したとき', fields:{}},
    'event.hpBelow': {kind:'event', label:'HPが指定割合以下になったとき', fields:{threshold:number('HPの割合', .5, 0, 1, .01)}},
    'event.skillReady': {kind:'event', label:'スキルの充填が完了したとき', fields:{skillId:{label:'スキル', initial:'pulse', values:skillIds}}},
    'condition.chance': {kind:'condition', label:'指定確率なら', fields:{probability:number('確率（0〜1）', .5, 0, 1, .01)}},
    'condition.enemyNearby': {kind:'condition', label:'周囲に敵がいれば', fields:{radius:number('索敵半径', 150, 1, 960, 1)}},
    'action.castSkill': {kind:'action', label:'スキルを発動する', fields:{skillId:{label:'スキル', initial:'pulse', values:skillIds}}},
    'action.buff': {kind:'action', label:'一定時間パラメーターを上げる', fields:{stat:{label:'能力', initial:'attack', values:['attack','defense','speed']}, multiplier:number('倍率', 1.2, 1, 2), duration:number('時間（秒）', 3, .1, 30)}}
  };
  const ports = type => definitions[type]?.kind === 'condition' ? ['then','else','next'] : ['next'];
  const clone = value => structuredClone(value);
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  freeze(definitions);
  const fail = message => { throw new Error(message); };
  const own = (object, key) => Object.hasOwn(object, key);
  function descendants(doc, id) {
    const found = new Set(), pending = [id];
    while (pending.length) {
      const current = pending.pop();
      if (found.has(current)) continue;
      found.add(current);
      for (const child of Object.values(doc.nodes[current]?.links || {})) if (child) pending.push(child);
    }
    return found;
  }
  function parentOf(doc, id) {
    for (const node of Object.values(doc.nodes)) for (const [port, target] of Object.entries(node.links)) {
      if (target === id) return {id:node.id, port};
    }
    return null;
  }
  function validate(doc) {
    if (doc?.schemaVersion !== 1 || !doc.nodes || !Array.isArray(doc.roots)) fail('回路の形式が不正です。');
    const ids = Object.keys(doc.nodes);
    if (ids.length > 256) fail('ブロックは256個までです。');
    const parents = new Map();
    for (const id of ids) {
      const node = doc.nodes[id], def = definitions[node.type];
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ['__proto__','constructor','prototype'].includes(id) || node.id !== id || !own(definitions, node.type)) fail('ブロックIDまたは種類が不正です。');
      if (!node.params || Object.keys(node.params).length !== Object.keys(def.fields).length) fail('パラメーターの数が不正です。');
      for (const [key, field] of Object.entries(def.fields)) {
        const value = node.params[key];
        if (field.values ? !field.values.includes(value) : typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) fail(`${def.label}: ${field.label}の値が不正です。`);
      }
      if (!node.links || Object.keys(node.links).length !== ports(node.type).length || ports(node.type).some(port => !own(node.links, port))) fail('接続ポートが不正です。');
      for (const child of Object.values(node.links)) {
        if (child === null) continue;
        if (typeof child !== 'string' || !own(doc.nodes, child) || definitions[doc.nodes[child].type]?.kind === 'event') fail('接続先が不正です。');
        if (parents.has(child)) fail('同じブロックを複数の場所へ接続できません。');
        parents.set(child, id);
      }
    }
    if (new Set(doc.roots).size !== doc.roots.length || doc.roots.some(id => !own(doc.nodes, id) || parents.has(id))) fail('スタックの始点が不正です。');
    if (ids.some(id => !parents.has(id) && !doc.roots.includes(id))) fail('未登録の始点があります。');
    const visited = new Set();
    const visit = (id, depth) => {
      if (visited.has(id)) fail('循環した接続があります。');
      if (depth > 32) fail('接続の深さは32段までです。');
      visited.add(id);
      Object.values(doc.nodes[id].links).filter(Boolean).forEach(child => visit(child, depth + 1));
    };
    doc.roots.forEach(id => visit(id, 1));
    if (visited.size !== ids.length) fail('循環した接続があります。');
    const positions = doc.layout?.rootPositions, viewport = doc.layout?.viewport;
    if (!positions || Object.keys(positions).length !== doc.roots.length) fail('配置情報が不正です。');
    for (const id of doc.roots) {
      const p = positions[id];
      if (!p || ![p.x,p.y].every(v => Number.isFinite(v) && v >= 0 && v <= 20000)) fail('配置は0〜20000の範囲にしてください。');
    }
    if (!viewport || ![viewport.x, viewport.y, viewport.scale].every(Number.isFinite) || viewport.scale < .5 || viewport.scale > 2) fail('表示倍率が不正です。');
    return true;
  }
  function unlink(doc, id) {
    const parent = parentOf(doc, id);
    if (parent) doc.nodes[parent.id].links[parent.port] = null;
    else { doc.roots.splice(doc.roots.indexOf(id), 1); delete doc.layout.rootPositions[id]; }
  }
  class GraphStore {
    constructor() {
      this.document = freeze({schemaVersion:1, id:crypto.randomUUID(), roots:[], nodes:{}, layout:{rootPositions:{}, viewport:{x:0,y:0,scale:1}}});
      this.revision = 0; this.past = []; this.future = [];
    }
    apply(change) {
      const draft = clone(this.document);
      const result = change(draft);
      validate(draft);
      this.past.push(this.document); if (this.past.length > 100) this.past.shift();
      this.future = []; this.document = freeze(draft); this.revision++;
      return result;
    }
    add(type, position, params = {}, attachment = null) {
      if (!own(definitions, type)) fail('不明なブロックです。');
      return this.apply(doc => {
        const id = 'block-' + crypto.randomUUID();
        doc.nodes[id] = {id, type, params:{...Object.fromEntries(Object.entries(definitions[type].fields).map(([key,field]) => [key,field.initial])), ...params}, links:Object.fromEntries(ports(type).map(port => [port,null]))};
        if (attachment) {
          const target = doc.nodes[attachment.id];
          if (!target || target.links[attachment.port] !== null) fail('この接続先は使用できません。');
          target.links[attachment.port] = id;
        } else { doc.roots.push(id); doc.layout.rootPositions[id] = position; }
        return id;
      });
    }
    move(id, position) {
      this.apply(doc => {
        if (!doc.nodes[id]) fail('移動するブロックがありません。');
        if (parentOf(doc,id)) { unlink(doc,id); doc.roots.push(id); }
        doc.layout.rootPositions[id] = position;
      });
    }
    connect(id, target, port) {
      this.apply(doc => {
        if (!doc.nodes[id] || !doc.nodes[target] || !ports(doc.nodes[target].type).includes(port)) fail('接続先が不正です。');
        if (doc.nodes[target].links[port] !== null) fail('この接続先は使用中です。');
        if (descendants(doc,id).has(target)) fail('自分や子孫へ接続できません。');
        unlink(doc,id); doc.nodes[target].links[port] = id;
      });
    }
    detachOnly(id, position) {
      this.apply(doc => {
        const node = doc.nodes[id];
        if (definitions[node.type].kind === 'event') fail('イベントはスタック全体を移動してください。');
        const parent = parentOf(doc,id), next = node.links.next;
        if (!parent && !next) fail('すでに単独のスタックです。');
        if (parent) doc.nodes[parent.id].links[parent.port] = next;
        else {
          const index = doc.roots.indexOf(id), old = doc.layout.rootPositions[id];
          doc.roots.splice(index,1); delete doc.layout.rootPositions[id];
          if (next) { doc.roots.splice(index,0,next); doc.layout.rootPositions[next] = old; }
        }
        node.links.next = null;
        doc.roots.push(id); doc.layout.rootPositions[id] = position;
      });
    }
    remove(id) {
      this.apply(doc => { const all = descendants(doc,id); unlink(doc,id); all.forEach(child => delete doc.nodes[child]); });
    }
    setParams(id, params) { this.apply(doc => { doc.nodes[id].params = params; }); }
    undo() {
      if (!this.past.length) return;
      this.future.push(this.document); this.document = this.past.pop(); this.revision++;
    }
    redo() {
      if (!this.future.length) return;
      this.past.push(this.document); this.document = this.future.pop(); this.revision++;
    }
  }
  Object.assign(api, {definitions, ports, descendants, parentOf, validate, GraphStore});
})();
