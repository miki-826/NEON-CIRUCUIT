(() => {
  'use strict';
  const api = window.NeonCircuit;
  const categories = {damage:'火力',stat:'ステータス',projectile:'弾道・特殊効果',special:'特殊効果',amplifier:'増幅',amplify:'増幅',utility:'補助'};
  const el = (tag, cls = '', text) => { const r = document.createElement(tag); r.className = cls; if (text !== undefined) r.textContent = text; return r; };
  const button = (text, fn, cls = '') => { const r = el('button',cls,text); r.type = 'button'; if (fn) r.addEventListener('click',fn); return r; };
  const fmt = v => Number.isFinite(v) ? new Intl.NumberFormat('ja-JP',{maximumFractionDigits:2}).format(v) : '—';
  class UpgradeEditor {
    constructor(host, options) {
      this.host=host; this.options=options; this.selectedSkill=null; this.selectedUid=null; this.zoom=1; this.floating=[]; this.history=[]; this.future=[]; this.drag=null;
      host.classList.add('circuit-editor');
      const toolbar=el('div','circuit-toolbar'), title=el('div','circuit-toolbar-title');
      title.append(el('span','circuit-live-dot'),el('strong','','SKILL FORGE'),el('span','circuit-live-label','戦闘に即反映'));
      this.undoButton=button('↶',()=>this.undo()); this.undoButton.setAttribute('aria-label','元に戻す');
      this.redoButton=button('↷',()=>this.redo()); this.redoButton.setAttribute('aria-label','やり直す');
      this.zoomLabel=el('output','','100%'); const smaller=button('−',()=>this.setZoom(this.zoom-.1)), larger=button('＋',()=>this.setZoom(this.zoom+.1));
      smaller.setAttribute('aria-label','縮小'); larger.setAttribute('aria-label','拡大'); toolbar.append(title,this.undoButton,this.redoButton,smaller,this.zoomLabel,larger);
      const body=el('div','circuit-body'); this.palette=el('aside','circuit-palette'); this.palette.setAttribute('aria-label','所持強化ノード');
      this.workspace=el('section','circuit-workspace'); const head=el('div','circuit-workspace-head'); head.append(el('strong','','ビルドワークスペース'),el('span','','ベーススキルの下へ、ガチャンと接続'));
      this.viewport=el('div','circuit-viewport'); this.viewport.tabIndex=0; this.viewport.setAttribute('aria-label','スキル強化ワークスペース');
      this.sizer=el('div','circuit-sizer'); this.surface=el('div','circuit-surface'); this.sizer.append(this.surface); this.viewport.append(this.sizer); this.workspace.append(head,this.viewport);
      this.inspector=el('aside','circuit-inspector'); this.inspector.setAttribute('aria-label','最終ステータス'); body.append(this.palette,this.workspace,this.inspector);
      this.status=el('p','circuit-status','所持ノードをスキルの下にドラッグ。途中をつかむと、それ以降も一緒に動きます。'); this.status.setAttribute('role','status'); this.status.setAttribute('aria-live','polite'); host.append(toolbar,body,this.status);
      this.handlers={pointerdown:e=>this.pointerDown(e),pointermove:e=>this.pointerMove(e),pointerup:e=>this.pointerUp(e),pointercancel:()=>this.cancelDrag(),lostpointercapture:()=>this.cancelDrag(),keydown:e=>this.keydown(e)};
      Object.entries(this.handlers).forEach(([type,fn])=>host.addEventListener(type,fn)); this.onBlur=()=>this.cancelDrag(); window.addEventListener('blur',this.onBlur); this.refresh(true);
    }
    state(){return this.options.getState();}
    definition(node){return api.nodeDefinitions.find(d=>d.id===node.id)||node;}
    announce(text){this.status.textContent=text;}
    allNodes(){const {builds,inventory}=this.state();return [...inventory,...builds.flatMap(s=>s.nodes)];}
    source(uid){
      const {builds,inventory}=this.state();
      for(const s of builds){const i=s.nodes.findIndex(n=>n.uid===uid);if(i>=0)return {kind:'skill',skillId:s.id,uid,nodes:s.nodes.slice(i)};}
      const group=this.floating.find(g=>g.uids.includes(uid));
      if(group){const uids=group.uids.slice(group.uids.indexOf(uid));return {kind:'inventory',uid,uids,nodes:uids.map(id=>inventory.find(n=>n.uid===id)).filter(Boolean)};}
      const node=inventory.find(n=>n.uid===uid);return node?{kind:'inventory',uid,nodes:[node]}:null;
    }
    snapshot(){const {builds,inventory}=this.state();return {skills:builds.map(s=>({id:s.id,nodes:[...s.nodes]})),inventory:[...inventory],floating:structuredClone(this.floating)};}
    restore(snapshot){const {builds,inventory}=this.state();for(const s of builds){const old=snapshot.skills.find(o=>o.id===s.id);if(old)s.nodes.splice(0,s.nodes.length,...old.nodes);}inventory.splice(0,inventory.length,...snapshot.inventory);this.floating=structuredClone(snapshot.floating);this.options.onChange?.();this.refresh(true);}
    undo(){if(this.history.length){this.future.push(this.snapshot());this.restore(this.history.pop());this.announce('接続を元に戻しました。');}}
    redo(){if(this.future.length){this.history.push(this.snapshot());this.restore(this.future.pop());this.announce('接続をやり直しました。');}}
    transfer(source,target,position){
      if(!source?.nodes.length)return;
      const before=this.snapshot(),uids=source.nodes.map(n=>n.uid),{builds,inventory}=this.state();
      try{
        if(!(source.kind==='inventory'&&target.kind==='inventory'))api.transferTail(builds,inventory,source,target);
        this.floating=this.floating.map(g=>({...g,uids:g.uids.filter(id=>!uids.includes(id))})).filter(g=>g.uids.length);
        if(position)this.floating.push({id:crypto.randomUUID(),uids,x:position.x,y:position.y});
        this.history.push(before);if(this.history.length>50)this.history.shift();this.future=[];this.selectedUid=uids[0];if(target.kind==='skill')this.selectedSkill=target.skillId;
        this.options.onChange?.();this.refresh(true);this.announce(target.kind==='skill'?`${source.nodes.length}個のノードを接続。戦闘性能に反映しました。`:position?'スタックを分離しました。未接続ノードは戦闘に影響しません。':'ノードをパレットへ戻しました。');
      }catch(error){this.announce(error.message);}
    }
    reset(){this.cancelDrag();this.floating=[];this.history=[];this.future=[];this.selectedSkill=null;this.selectedUid=null;this.ownership=null;this.refresh(true);}
    refresh(force=false){
      const {builds,inventory,context={}}=this.state(),ownership=this.allNodes().map(n=>n.uid).sort().join('|');
      if(this.ownership!=null&&ownership!==this.ownership){this.history=[];this.future=[];}this.ownership=ownership;
      const available=new Set(inventory.map(n=>n.uid));this.floating=this.floating.map(g=>({...g,uids:g.uids.filter(id=>available.has(id))})).filter(g=>g.uids.length);
      if(!builds.some(s=>s.id===this.selectedSkill))this.selectedSkill=builds[0]?.id||null;
      if(!this.allNodes().some(n=>n.uid===this.selectedUid))this.selectedUid=null;
      const stamp=JSON.stringify({skills:builds.map(s=>[s.id,s.rank,s.nodes.map(n=>[n.uid,n.id])]),inventory:inventory.map(n=>[n.uid,n.id]),context,floating:this.floating});
      if(!force&&stamp===this.stamp)return;this.stamp=stamp;if(this.drag)this.cancelDrag();
      const active=document.activeElement,restore=this.host.contains(active)&&!this.palette.contains(active)&&!active.closest('.circuit-toolbar');
      this.renderPalette();this.renderWorkspace();this.renderInspector();this.undoButton.disabled=!this.history.length;this.redoButton.disabled=!this.future.length;
      if(restore&&!active.isConnected)(this.surface.querySelector(`[data-node-uid="${this.selectedUid}"]`)||this.surface.querySelector(`[data-base="${this.selectedSkill}"]`)||this.viewport).focus({preventScroll:true});
    }
    selectSkill(id){this.selectedSkill=id;this.selectedUid=null;this.refresh(true);}
    selectNode(uid){this.selectedUid=uid;const source=this.source(uid);if(source?.kind==='skill')this.selectedSkill=source.skillId;this.host.querySelectorAll('[data-node-uid]').forEach(n=>n.classList.toggle('is-selected',n.dataset.nodeUid===uid));this.surface.querySelectorAll('[data-base]').forEach(n=>n.classList.toggle('is-selected',n.dataset.base===this.selectedSkill));this.renderInspector();}
    renderNode(node,palette=false){
      const def=this.definition(node),r=button('',e=>{if(e.detail===0)this.selectNode(node.uid);},`upgrade-node${palette?' palette-node':''}${this.selectedUid===node.uid?' is-selected':''}`);
      r.dataset.nodeUid=node.uid;r.style.setProperty('--node-color',def.color||'#64d6ff');r.setAttribute('aria-label',`${def.name}。${def.desc}。選択して接続先を指定できます。`);
      r.append(el('span','node-category',categories[def.category]||def.category||'強化'),el('strong','',def.name),el('span','node-description',def.desc));return r;
    }
    renderPalette(){
      const {inventory}=this.state(),floating=new Set(this.floating.flatMap(g=>g.uids));this.palette.replaceChildren(el('h4','','NODE PALETTE'),el('p','palette-count',`未接続 ${inventory.length}個`));
      this.palette.append(el('p','circuit-help','所持ノードをドラッグ、または選択して接続。ここへ戻すと強化を解除します。'));
      const nodes=inventory.filter(n=>!floating.has(n.uid)),groups=[...new Set(nodes.map(n=>this.definition(n).category||'強化'))];
      for(const category of groups){this.palette.append(el('h5','',categories[category]||category));nodes.filter(n=>(this.definition(n).category||'強化')===category).forEach(n=>this.palette.append(this.renderNode(n,true)));}
      if(!inventory.length)this.palette.append(el('p','circuit-empty','すべて接続中です。レベルアップでノードを獲得できます。'));else if(!nodes.length)this.palette.append(el('p','circuit-help','未接続ノードはワークスペースの分離スタックにあります。'));
    }
    renderSlot(skill,afterUid,terminal=false){
      const r=button(terminal?'＋ ノードを接続':'接続',()=>{const src=this.source(this.selectedUid);if(!src){this.announce('パレットまたはスタックのノードを先に選択してください。');return;}this.transfer(src,{kind:'skill',skillId:skill.id,afterUid});},`circuit-snap-slot${terminal?' terminal-slot':''}`);
      r.dataset.targetSkill=skill.id;r.dataset.after=afterUid||'';r.setAttribute('aria-label',`${skill.name}の${afterUid?'このノードの後ろ':'先頭'}へ選択ノードを接続`);return r;
    }
    renderWorkspace(){
      const {builds,inventory,context={}}=this.state();this.surface.replaceChildren();
      builds.forEach((skill,index)=>{
        const stack=el('div','circuit-stack live-stack');stack.dataset.skill=skill.id;stack.style.left=`${28+index*296}px`;stack.style.top='28px';
        const base=button('',()=>this.selectSkill(skill.id),`base-skill${this.selectedSkill===skill.id?' is-selected':''}`);base.dataset.base=skill.id;
        base.append(el('span','base-label','BASE SKILL · FIXED'),el('strong','',skill.name),el('span','',`Lv.${skill.rank} · ${skill.nodes.length} CHAIN`));stack.append(base);
        const chain=el('div','circuit-chain');chain.append(this.renderSlot(skill,null,!skill.nodes.length));
        skill.nodes.forEach((node,i)=>chain.append(this.renderNode(node),this.renderSlot(skill,node.uid,i===skill.nodes.length-1)));stack.append(chain);
        const stats=api.compileSkill(skill,context);stack.append(el('div','stack-chain-bonus',`${stats.chainCount} CHAIN / 効果量 +${fmt((stats.chainMultiplier-1)*100)}%`));this.surface.append(stack);
      });
      for(const group of this.floating){const stack=el('div','circuit-stack floating-stack');stack.dataset.floating=group.id;stack.style.left=`${group.x}px`;stack.style.top=`${group.y}px`;stack.append(el('span','floating-label','未接続 · 強化は通っていません'));group.uids.forEach(uid=>{const n=inventory.find(n=>n.uid===uid);if(n)stack.append(this.renderNode(n));});this.surface.append(stack);}
      if(!builds.length)this.surface.append(el('p','circuit-empty','出撃すると、ベーススキルがここに表示されます。'));this.resizeSurface();
    }
    resizeSurface(){let w=620,h=480;[...this.surface.children].forEach(s=>{w=Math.max(w,s.offsetLeft+s.offsetWidth+60);h=Math.max(h,s.offsetTop+s.offsetHeight+100);});this.surface.style.width=`${w}px`;this.surface.style.height=`${h}px`;this.surface.style.transform=`scale(${this.zoom})`;this.sizer.style.width=`${w*this.zoom}px`;this.sizer.style.height=`${h*this.zoom}px`;}
    renderInspector(){
      const {builds,context={}}=this.state(),skill=builds.find(s=>s.id===this.selectedSkill);this.inspector.replaceChildren(el('h4','','FINAL STATUS'));if(!skill){this.inspector.append(el('p','circuit-help','スキルを選択してください。'));return;}
      this.inspector.append(el('strong','preview-skill-name',skill.name));const stats=api.compileSkill(skill,context),base=api.compileSkill({...skill,nodes:[]},context),bonus=el('div','preview-chain');bonus.append(el('strong','',`${stats.chainCount} CHAIN`),el('span','',`全ノードの効果量 +${fmt((stats.chainMultiplier-1)*100)}%`));this.inspector.append(bonus);
      const values=[],add=(label,key,unit='',calculate=null)=>values.push([label,calculate?calculate(base):base[key],calculate?calculate(stats):stats[key],unit]);
      if(stats.damage>0)add('スキル威力','damage');
      if(['pulse','volley','seeker'].includes(skill.id)){add('発射数','projectileCount','発');add('弾速','projectileSpeed');add('貫通数','pierce','体');}
      if(skill.id==='arc')add('最大連鎖数',null,'体',s=>3+s.bonusProjectiles);
      if(skill.id==='orbit')add('ブレード数',null,'枚',s=>Math.min(32,2+skill.rank+s.bonusProjectiles));
      if(stats.cooldown>0)add('発動間隔','cooldown','秒');
      if(stats.radius>0)add(skill.id==='beam'?'ビーム幅':'効果半径','radius');
      if(['orbital','beam','arc','magnet'].includes(skill.id))add('射程','range');
      if(skill.id==='repair'){
        add('最大HPからの回復',null,'%',s=>Math.min(100,(.18+(skill.rank-1)*.04)*s.utilityPower*100));
        if(context.maxHp)add('回復量（HP上限まで）',null,'',s=>Math.min(context.maxHp,context.maxHp*(.18+(skill.rank-1)*.04)*s.utilityPower));
      }
      if(skill.id==='dash'){add('移動距離',null,'',s=>130*s.utilityPower);add('無敵時間',null,'秒',s=>Math.min(3,.55*s.utilityPower));}
      if(skill.id==='aegis')add('防御持続',null,'秒',s=>(2+(skill.rank-1)*.15)*s.utilityPower);
      if(skill.id==='barrier')add('ダメージ軽減',null,'%',s=>Math.min(.9,.27*s.utilityPower)*100);
      if(skill.id==='haste'){add('移動速度UP',null,'%',s=>18*s.utilityPower);add('充填速度UP',null,'%',s=>25*s.utilityPower);if(context.baseMoveSpeed)add('移動速度',null,'',s=>context.baseMoveSpeed*(1+.18*s.utilityPower));}
      if(skill.id==='frost')add('スロウ持続',null,'秒',s=>(1.6+(skill.rank-1)*.12)*s.utilityPower);
      if(skill.id==='magnet')add('引き寄せ率',null,'%',s=>Math.min(.9,.43*s.utilityPower)*100);
      if(stats.cost>0)add('消費コスト','cost');
      const metrics=el('dl','preview-metrics');
      for(const [label,before,after,unit]of values){const row=el('div','preview-metric');row.append(el('dt','',label));const value=el('dd');value.append(el('small','',fmt(before)),el('span','metric-arrow','→'),el('strong','',fmt(after)+unit));row.append(value);metrics.append(row);}
      this.inspector.append(metrics,el('h5','','特殊効果'),el('p','preview-effects',stats.effects?.length?stats.effects.join(' / '):'追加効果なし'),el('h5','','ノード操作'));
      const source=this.source(this.selectedUid);if(!source){this.inspector.append(el('p','circuit-help','ノードを選ぶと、接続先の指定や分離ができます。'));return;}
      this.inspector.append(el('p','selected-node-name',`${this.definition(source.nodes[0]).name}${source.nodes.length>1?` 以下 ${source.nodes.length}個`:''}`));const targets=el('select');targets.setAttribute('aria-label','ノードの接続先');const moved=new Set(source.nodes.map(n=>n.uid));
      for(const target of builds){const reason=source.nodes.map(n=>api.compatibilityReason?.(target,n)||'').find(Boolean),first=el('option','',`${target.name}の先頭${reason?`（${reason}）`:''}`);first.value=`${target.id}:`;first.disabled=!!reason;targets.append(first);target.nodes.forEach(n=>{if(moved.has(n.uid))return;const option=el('option','',`${target.name} / ${this.definition(n).name}の後ろ`);option.value=`${target.id}:${n.uid}`;option.disabled=!!reason;targets.append(option);});}
      const preferred=`${skill.id}:${skill.nodes.at(-1)?.uid||''}`;if([...targets.options].some(o=>o.value===preferred&&!o.disabled))targets.value=preferred;const enabled=[...targets.options].find(o=>!o.disabled);if(!targets.selectedOptions[0]||targets.selectedOptions[0].disabled)targets.value=enabled?.value||'';
      const connect=button('選んだ場所へ接続',()=>{const [id,after]=targets.value.split(':');if(id)this.transfer(this.source(this.selectedUid),{kind:'skill',skillId:id,afterUid:after||null});});connect.disabled=!enabled;
      const detach=button('ここから下をパレットへ戻す',()=>this.transfer(this.source(this.selectedUid),{kind:'inventory'}));
      detach.disabled=source.kind==='inventory'&&!this.floating.some(group=>group.uids.includes(source.uid));
      this.inspector.append(targets,connect,detach);
    }
    setZoom(v){this.zoom=Math.max(.5,Math.min(1.5,Math.round(v*10)/10));this.zoomLabel.textContent=`${Math.round(this.zoom*100)}%`;this.resizeSurface();}
    pointerDown(e){if(e.button!==0||this.drag)return;const n=e.target.closest('[data-node-uid]');if(!n)return;const source=this.source(n.dataset.nodeUid);if(!source)return;this.selectNode(n.dataset.nodeUid);const r=n.getBoundingClientRect();this.drag={source,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,scale:this.palette.contains(n)?1:this.zoom,moved:false,candidate:null};this.host.setPointerCapture(e.pointerId);}
    pointerMove(e){
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;if(!d.moved&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6)return;e.preventDefault();
      if(!d.moved){d.moved=true;d.ghost=el('div','circuit-drag-ghost');d.ghost.inert=true;d.ghost.setAttribute('aria-hidden','true');d.source.nodes.forEach(n=>d.ghost.append(this.renderNode(n)));d.ghost.style.transform=`scale(${d.scale})`;document.body.append(d.ghost);const moved=new Set(d.source.nodes.map(n=>n.uid));this.host.querySelectorAll('[data-node-uid]').forEach(n=>{if(moved.has(n.dataset.nodeUid))n.classList.add('is-dragging');});}
      d.ghost.style.left=`${e.clientX-d.offsetX}px`;d.ghost.style.top=`${e.clientY-d.offsetY}px`;const v=this.viewport.getBoundingClientRect();
      if(e.clientX>=v.left-20&&e.clientX<=v.right+20&&e.clientY>=v.top-20&&e.clientY<=v.bottom+20){
        if(e.clientY<v.top+40)this.viewport.scrollTop-=10;else if(e.clientY>v.bottom-40)this.viewport.scrollTop+=10;
        if(e.clientX<v.left+40)this.viewport.scrollLeft-=12;else if(e.clientX>v.right-40)this.viewport.scrollLeft+=12;
      }
      this.findCandidate(e.clientX-d.offsetX,e.clientY-d.offsetY);
    }
    findCandidate(x,y){
      const d=this.drag,{builds}=this.state(),moved=new Set(d.source.nodes.map(n=>n.uid));this.host.querySelectorAll('.is-snap-target,.is-incompatible').forEach(n=>n.classList.remove('is-snap-target','is-incompatible'));d.candidate=null;d.incompatibleReason='';const v=this.viewport.getBoundingClientRect(),candidates=[];
      this.surface.querySelectorAll('[data-target-skill]').forEach(slot=>{
        if(moved.has(slot.dataset.after))return;const skill=builds.find(s=>s.id===slot.dataset.targetSkill),r=slot.getBoundingClientRect();
        if(r.bottom<v.top||r.top>v.bottom||r.left<v.left||r.left>v.right)return;const distance=Math.hypot(r.left-x,r.top-y);if(distance>=38)return;
        const incompatible=d.source.nodes.find(n=>!api.isCompatible(skill,n));
        if(incompatible){slot.classList.add('is-incompatible');d.incompatibleReason=api.compatibilityReason(skill,incompatible);return;}
        candidates.push({el:slot,distance,kind:'skill',skillId:skill.id,afterUid:slot.dataset.after||null});
      });candidates.sort((a,b)=>a.distance-b.distance);if(candidates.length){d.candidate=candidates[0];d.candidate.el.classList.add('is-snap-target');}
    }
    pointerUp(e){
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;if(!d.moved){this.cleanupDrag();return;}this.findCandidate(e.clientX-d.offsetX,e.clientY-d.offsetY);const candidate=d.candidate,v=this.viewport.getBoundingClientRect(),p=this.palette.getBoundingClientRect(),inside=r=>e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom,inView=inside(v),returning=inside(p),position={x:Math.max(0,Math.round((e.clientX-d.offsetX-v.left+this.viewport.scrollLeft)/this.zoom)),y:Math.max(0,Math.round((e.clientY-d.offsetY-v.top+this.viewport.scrollTop)/this.zoom))};this.cleanupDrag();
      if(inView&&candidate)this.transfer(d.source,candidate);else if(inView&&d.incompatibleReason)this.announce(d.incompatibleReason);else if(returning)this.transfer(d.source,{kind:'inventory'});else if(inView)this.transfer(d.source,{kind:'inventory'},position);else this.announce('移動をキャンセルしました。接続は変更していません。');
    }
    cleanupDrag(){const d=this.drag;this.drag=null;d?.ghost?.remove();this.host.querySelectorAll('.is-dragging,.is-snap-target,.is-incompatible').forEach(n=>n.classList.remove('is-dragging','is-snap-target','is-incompatible'));if(d&&this.host.hasPointerCapture(d.pointerId))this.host.releasePointerCapture(d.pointerId);}
    cancelDrag(){if(this.drag){this.cleanupDrag();this.announce('移動をキャンセルしました。');}}
    keydown(e){if(e.key==='Escape'&&this.drag){e.preventDefault();e.stopPropagation();this.cancelDrag();return;}if(e.target.matches('select,input,textarea')){if(e.key!=='Tab')e.stopPropagation();return;}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();if(e.key.toLowerCase()==='y'||e.shiftKey)this.redo();else this.undo();}}
    dispose(){this.cancelDrag();Object.entries(this.handlers).forEach(([type,fn])=>this.host.removeEventListener(type,fn));window.removeEventListener('blur',this.onBlur);this.host.replaceChildren();}
  }
  api.createEditor=(host,options)=>new UpgradeEditor(host,options);
})();
