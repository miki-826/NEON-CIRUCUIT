(() => {
  'use strict';
  const api = window.NeonCircuit = window.NeonCircuit || {};
  const MAX_CHAIN = 64;
  const nodeDefinitions = [
    {id:'power',name:'増幅',desc:'威力・回復量・補助効果 +25%',category:'ステータス',color:'#ff916c'},
    {id:'haste',name:'高速化',desc:'連射・発動速度 +20%',category:'ステータス',color:'#ffe183'},
    {id:'velocity',name:'加速弾',desc:'弾速 +25%',category:'ステータス',color:'#ffe183'},
    {id:'multishot',name:'多重化',desc:'発射数 +2／範囲スキルの効果範囲を拡張',category:'ステータス',color:'#59e7ff'},
    {id:'area',name:'広域化',desc:'効果範囲・射程 +20%',category:'ステータス',color:'#59e7ff'},
    {id:'discount',name:'省電力',desc:'消費コスト -5%（ノード追加のコスト増なし）',category:'ステータス',color:'#87edb6'},
    {id:'pierce',name:'貫通',desc:'弾がさらに1体を貫通',category:'特殊効果',color:'#a997ff'},
    {id:'homing',name:'追尾',desc:'弾が敵を追尾する',category:'特殊効果',color:'#a997ff'},
    {id:'explosion',name:'着弾爆発',desc:'命中時に半径48の爆風（弾威力の45%）',category:'特殊効果',color:'#ff7eab'},
    {id:'split',name:'スプリット',desc:'初回命中時に2発の補助弾へ分裂',category:'特殊効果',color:'#ff7eab'},
    {id:'leech',name:'吸収',desc:'命中時に耐久値を0.55回復',category:'特殊効果',color:'#87edb6'},
    {id:'amplifyPrevious',name:'リピート増幅',desc:'直前のノードの効果量を1.5倍にする',category:'チェイン増幅',color:'#f7c35c'},
    {id:'amplifyFollowing',name:'後段ブースター',desc:'これより下のノードの効果量を1.5倍にする',category:'チェイン増幅',color:'#f7c35c'}
  ].map(def => Object.freeze({...def,cost:0,effect:def.id}));
  Object.freeze(nodeDefinitions);
  const definitions = Object.freeze(Object.fromEntries(nodeDefinitions.map(def => [def.id,def])));
  const projectiles = new Set(['pulse','volley','seeker']);
  const damaging = new Set(['pulse','volley','beam','blast','seeker','arc','orbital','slash','orbit','shock','frost','magnet']);
  const projectileEffects = new Set(['velocity','pierce','homing','explosion','split']);
  const amplifiers = new Set(['amplifyPrevious','amplifyFollowing']);
  const getId = node => typeof node === 'string' ? node : node?.id;
  const has = (object,key) => Object.hasOwn(object,key);
  const finite = (value,fallback,min = 0,max = 1e9) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : fallback;
  function isCompatible(skill,node) {
    const id = getId(node);
    if (!skill || !has(definitions,id)) return false;
    if (amplifiers.has(id) || id === 'power') return true;
    if (projectileEffects.has(id)) return projectiles.has(skill.id);
    if (id === 'discount') return skill.cost > 0;
    if (id === 'haste') return skill.cost > 0 || ['orbit','shock'].includes(skill.id);
    if (id === 'area') return damaging.has(skill.id) || ['dash','aegis'].includes(skill.id);
    return damaging.has(skill.id);
  }
  function compatibilityReason(skill,node) {
    if (isCompatible(skill,node)) return '';
    if (!has(definitions,getId(node))) return 'この強化ノードは登録されていません。';
    if (projectileEffects.has(getId(node))) return 'パルスショット・スプリットボルト・ホーミングスフィアの弾に接続できます。';
    if (getId(node) === 'discount') return 'コストを消費するスキルに接続できます。';
    return 'このノードは攻撃スキル、または対応する補助スキルに接続してください。';
  }
  let serial = 0;
  function createNode(id) {
    if (!has(definitions,id)) throw new Error('不明な強化ノードです。');
    const uid = 'node-' + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++serial}`);
    return {...definitions[id],uid};
  }
  const cache = new WeakMap();
  function compileSkill(skill,context = {}) {
    if (!skill || typeof skill !== 'object') throw new Error('スキルを指定してください。');
    const nodes = Array.isArray(skill.nodes) ? skill.nodes : [];
    if (nodes.length > MAX_CHAIN) throw new Error(`1つのスキルには${MAX_CHAIN}個まで接続できます。`);
    const rank = finite(skill.rank,1,1,1000), level = finite(context.level,1,1,1000);
    const attack = finite(context.attack,1,.01,1000), chargeBoost = finite(context.chargeBoost,1,.01,1000);
    const signature = JSON.stringify([skill.id,skill.kind,skill.cost,skill.damage,rank,level,attack,chargeBoost,nodes.map(node => [node.id,node.uid])]);
    const cached = cache.get(skill);
    if (cached?.signature === signature) return cached.stats;
    const active = nodes.filter(node => isCompatible(skill,node));
    const ignoredNodes = nodes.filter(node => !isCompatible(skill,node)).map(node => Object.freeze({id:node.id,reason:compatibilityReason(skill,node)}));
    const chainCount = active.length, chainMultiplier = 1 + chainCount * .05;
    const weights = active.map(() => 1);
    // Immediate backward amplifiers resolve first, including amplified boosters.
    for (let i=active.length-1; i>0; i--) {
      if (active[i].id === 'amplifyPrevious') weights[i-1] = Math.min(64,weights[i-1] * (1 + .5*weights[i]));
    }
    const amounts = Object.fromEntries(nodeDefinitions.map(def => [def.id,0]));
    const contributions = [];
    let downstream = 1;
    active.forEach((node,index) => {
      const potency = Math.min(64,weights[index]*downstream);
      contributions.push(Object.freeze({id:node.id,uid:node.uid,name:definitions[node.id].name,index,potency,amplified:potency>1}));
      if (node.id === 'amplifyFollowing') downstream = Math.min(64,downstream*(1 + .5*potency));
      else if (!amplifiers.has(node.id)) amounts[node.id] += potency;
    });
    const weighted = id => amounts[id]*chainMultiplier;
    const utilityPower = Math.min(10000,(1 + amounts.power*.25)*chainMultiplier);
    const damageMultiplier = Math.min(10000,(1 + (rank-1)*.18)*utilityPower);
    const baseDamage = skill.id === 'orbit' ? 5+rank*2 : skill.id === 'shock' ? 14+rank*4 : finite(skill.damage,0);
    const damage = Math.min(1e9,baseDamage*attack*Math.pow(1.18,Math.min(level-1,100))*damageMultiplier);
    const attackSpeed = Math.min(20,1+weighted('haste')*.2);
    const areaMultiplier = Math.min(4,1+weighted('area')*.2);
    const bonusProjectiles = Math.min(31,Math.floor(weighted('multishot')*2));
    const projectileCount = Math.min(32,(skill.id === 'volley' ? 3 : 1)+bonusProjectiles);
    const projectileSpeed = Math.min(2000,(skill.id === 'seeker' ? 400 : 560)*(1+weighted('velocity')*.25));
    const baseRadius = {blast:155,slash:114,orbital:81,beam:17,frost:170,magnet:190,orbit:78,shock:145,arc:148,dash:95,aegis:130}[skill.id] || 0;
    const radiusGain = {blast:22,slash:14,orbital:14,beam:8,frost:18,magnet:18,orbit:18,shock:18}[skill.id] || 0;
    const radius = Math.min(2000,(baseRadius+radiusGain*weighted('multishot'))*areaMultiplier);
    const baseRange = {orbital:510,beam:760,arc:315,magnet:385}[skill.id];
    const range = baseRange ? Math.min(4000,baseRange*areaMultiplier) : radius || 1200*areaMultiplier;
    const cost = skill.cost > 0 ? Math.max(1,Math.round(finite(skill.cost,1,1)*Math.pow(.95,weighted('discount')))) : 0;
    const baseRate = {repair:18,dash:23,frost:24,magnet:24,aegis:21}[skill.id] ?? 68;
    const growth = skill.kind === 'main' ? 4 : skill.damage ? 2 : 1;
    const chargeRate = Math.min(1e6,cost ? cost/.04 : 1e6,(baseRate+(level-1)*growth)*chargeBoost*attackSpeed);
    const basePeriod = skill.id === 'orbit' ? .22 : skill.id === 'shock' ? 2.8 : 0;
    const cooldown = basePeriod ? Math.max(.04,basePeriod/attackSpeed) : cost ? Math.max(.04,cost/chargeRate) : 0;
    const pierce = Math.min(32,1+Math.floor(weighted('pierce')));
    const homing = skill.id === 'seeker' || amounts.homing > 0;
    const projectileRadius = (homing ? 7 : 5)*areaMultiplier;
    const explosionRadius = amounts.explosion ? Math.min(360,48*Math.sqrt(weighted('explosion'))*areaMultiplier) : 0;
    const explosionDamage = amounts.explosion ? Math.min(2,.45*weighted('explosion')) : 0;
    const splitCount = Math.min(8,Math.floor(weighted('split')*2));
    const leech = Math.min(30,weighted('leech')*.55);
    const effects = [];
    if (pierce > 1) effects.push(`貫通 ${pierce}体`);
    if (homing) effects.push('追尾');
    if (explosionRadius) effects.push(`着弾爆発 半径${Math.round(explosionRadius)} / 威力${Math.round(explosionDamage*100)}%`);
    if (splitCount) effects.push(`分裂 ${splitCount}発`);
    if (leech) effects.push(`命中回復 +${leech.toFixed(2)}`);
    const stats = Object.freeze({damage,damageMultiplier,utilityPower,projectileCount,bonusProjectiles,projectileSpeed,projectileRadius,attackSpeed,areaMultiplier,radius,range,pierce,homing,explosionRadius,explosionDamage,splitCount,leech,cost,chargeRate,cooldown,interval:cooldown,chainCount,activeNodeCount:chainCount,chainMultiplier,effects:Object.freeze(effects),contributions:Object.freeze(contributions),ignoredNodes:Object.freeze(ignoredNodes)});
    cache.set(skill,{signature,stats});
    return stats;
  }
  function transferTail(builds,inventory,source,target) {
    if (!Array.isArray(builds) || !Array.isArray(inventory)) throw new Error('所持データが不正です。');
    if (new Set(builds.map(skill => skill.id)).size !== builds.length) throw new Error('スキルの所持IDが重複しています。');
    const seen = new Set();
    for (const node of [...inventory,...builds.flatMap(skill => skill.nodes || [])]) {
      if (!node || typeof node.uid !== 'string' || !node.uid || seen.has(node.uid) || !has(definitions,node.id)) throw new Error('ノードの所持IDが不正、または重複しています。');
      seen.add(node.uid);
    }
    const sourceSkill = source?.kind === 'skill' ? builds.find(skill => skill.id === source.skillId) : null;
    if (!['skill','inventory'].includes(source?.kind) || source.kind === 'skill' && !sourceSkill) throw new Error('移動元のスキルがありません。');
    const origin = sourceSkill ? sourceSkill.nodes : inventory;
    const start = origin.findIndex(node => node.uid === source.uid);
    let moving;
    if (sourceSkill) {
      if (start < 0) throw new Error('移動するノードがありません。');
      moving = origin.slice(start);
    } else {
      const ids = source.uids || [source.uid];
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('移動するノードの指定が不正です。');
      moving = ids.map(uid => inventory.find(node => node.uid === uid));
      if (moving.some(node => !node)) throw new Error('所持していないノードは接続できません。');
    }
    if (target?.kind === 'inventory') {
      if (!sourceSkill) return true;
      sourceSkill.nodes = origin.slice(0,start);
      inventory.push(...moving);
      return true;
    }
    const targetSkill = target?.kind === 'skill' ? builds.find(skill => skill.id === target.skillId) : null;
    if (!targetSkill) throw new Error('接続先のスキルがありません。');
    if (moving.some(node => !isCompatible(targetSkill,node))) throw new Error(compatibilityReason(targetSkill,moving.find(node => !isCompatible(targetSkill,node))));
    if (moving.some(node => node.uid === target.afterUid)) throw new Error('移動中のグループ自身へは接続できません。');
    const remainingTarget = sourceSkill === targetSkill ? targetSkill.nodes.slice(0,start) : [...(targetSkill.nodes || [])];
    const afterIndex = target.afterUid == null ? -1 : remainingTarget.findIndex(node => node.uid === target.afterUid);
    if (target.afterUid != null && afterIndex < 0) throw new Error('接続先のノードがありません。');
    if (remainingTarget.length+moving.length > MAX_CHAIN) throw new Error(`1つのスキルには${MAX_CHAIN}個まで接続できます。`);
    remainingTarget.splice(afterIndex+1,0,...moving);
    // Validate first, then move the original instances atomically; never duplicate owned items.
    if (sourceSkill && sourceSkill !== targetSkill) sourceSkill.nodes = origin.slice(0,start);
    if (!sourceSkill) {
      const movingIds = new Set(moving.map(node => node.uid));
      for (let index=inventory.length-1; index>=0; index--) if (movingIds.has(inventory[index].uid)) inventory.splice(index,1);
    }
    targetSkill.nodes = remainingTarget;
    return true;
  }
  Object.assign(api,{nodeDefinitions,definitions,MAX_CHAIN,createNode,compileSkill,isCompatible,canAttach:isCompatible,compatibilityReason,transferTail});
})();
