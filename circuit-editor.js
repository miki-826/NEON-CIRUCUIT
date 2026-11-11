(() => {
  'use strict';
  const api = window.NeonCircuit;
  const {definitions, ports, parentOf, descendants, GraphStore} = api;
  const kindNames = {event:'イベント', condition:'条件', action:'アクション'};
  const portNames = {then:'なら', else:'でなければ', next:'次へ'};
  const statNames = {attack:'攻撃', defense:'防御', speed:'速度'};
  function element(tag, className, text) {
    const el = document.createElement(tag); el.className = className || '';
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(label, handler, className = '') {
    const el = element('button', className, label); el.type = 'button';
    if (handler) el.addEventListener('click',handler);
    return el;
  }
  class CircuitEditor {
    constructor(host, skills = [], catalog = skills) {
      this.host = host; this.skills = skills; this.catalog = catalog; this.store = new GraphStore();
      this.selected = null; this.drag = null; this.zoom = 1; this.pendingDelete = null;
      host.classList.add('circuit-editor');
      const toolbar = element('div','circuit-toolbar');
      this.undoButton = button('↶ 元に戻す', () => this.run(() => this.store.undo()));
      this.redoButton = button('↷ やり直す', () => this.run(() => this.store.redo()));
      this.zoomOut = button('−', () => this.setZoom(this.zoom - .1)); this.zoomOut.setAttribute('aria-label','縮小');
      this.zoomLabel = element('output','','100%');
      this.zoomIn = button('＋', () => this.setZoom(this.zoom + .1)); this.zoomIn.setAttribute('aria-label','拡大');
      toolbar.append(this.undoButton, this.redoButton, element('span','circuit-toolbar-spacer'), this.zoomOut, this.zoomLabel, this.zoomIn);
      const note = element('p','circuit-stage-note','回路エディター（プレビュー） · この回路はまだ戦闘に適用されません。現在の自動発動は下の装備設定で調整できます。');
      const body = element('div','circuit-body');
      this.palette = element('aside','circuit-palette'); this.palette.setAttribute('aria-label','ブロックパレット');
      for (const kind of ['event','condition','action']) {
        this.palette.append(element('h4','',kindNames[kind]));
        for (const [type,def] of Object.entries(definitions).filter(([,def]) => def.kind === kind)) {
          const add = button('＋ ' + def.label, event => { if (event.detail === 0) this.add(type); },`circuit-palette-block kind-${kind}`);
          add.dataset.add = type; add.title = 'ドラッグして配置、またはEnterで追加'; this.palette.append(add);
        }
      }
      this.viewport = element('div','circuit-viewport'); this.viewport.tabIndex = 0;
      this.viewport.setAttribute('aria-label','回路ワークスペース。ブロックを選択して設定欄から接続できます。');
      this.sizer = element('div','circuit-sizer'); this.surface = element('div','circuit-surface');
      this.sizer.append(this.surface); this.viewport.append(this.sizer);
      this.inspector = element('aside','circuit-inspector'); this.inspector.setAttribute('aria-label','選択ブロックの設定');
      body.append(this.palette, this.viewport, this.inspector);
      this.status = element('p','circuit-status'); this.status.setAttribute('role','status'); this.status.setAttribute('aria-live','polite');
      host.append(toolbar, note, body, this.status);
      this.onDown = event => this.pointerDown(event);
      this.onMove = event => this.pointerMove(event);
      this.onUp = event => this.pointerUp(event);
      this.onCancel = () => this.cancelDrag();
      this.onKey = event => this.keydown(event);
      host.addEventListener('pointerdown',this.onDown);
      host.addEventListener('pointermove',this.onMove);
      host.addEventListener('pointerup',this.onUp);
      host.addEventListener('pointercancel',this.onCancel);
      host.addEventListener('lostpointercapture',this.onCancel);
      host.addEventListener('keydown',this.onKey);
      window.addEventListener('blur',this.onCancel);
      this.reset(skills);
    }
    announce(message) { this.status.textContent = message; }
    run(operation, message = '') {
      const active = document.activeElement, param = active?.dataset.param;
      try {
        operation(); this.pendingDelete = null; this.render();
        if (active && !active.isConnected) {
          const next = param ? this.inspector.querySelector(`[data-param="${param}"]`) : this.surface.querySelector(`[data-drag="${this.selected}"]`);
          (next || this.viewport).focus({preventScroll:true});
        }
        if (message) this.announce(message);
      }
      catch (error) { this.announce(error.message); }
    }
    reset(skills) {
      this.cancelDrag(); this.skills = skills; this.store = new GraphStore(); this.selected = null;
      skills.filter(skill => skill.cost > 0).forEach((skill,index) => {
        const root = this.store.add('event.skillReady',{x:35 + index % 2 * 320, y:40 + Math.floor(index / 2) * 300},{skillId:skill.id});
        this.store.add('action.castSkill',{x:0,y:0},{skillId:skill.id},{id:root,port:'next'});
      });
      this.store.past = []; this.store.future = []; this.pendingDelete = null;
      this.render(); this.announce('パレットからドラッグするか、Enterで追加してください。');
    }
    setSkills(skills) { this.skills = skills; this.render(); }
    labelValue(value) { return this.catalog.find(skill => skill.id === value)?.name || statNames[value] || String(value); }
    summary(node) {
      return Object.entries(node.params).map(([key,value]) => {
        if (key === 'probability' || key === 'threshold') return `${Math.round(value*100)}%`;
        if (key === 'radius') return `半径 ${value}`;
        if (key === 'duration') return `${value}秒`;
        if (key === 'multiplier') return `×${value}`;
        return this.labelValue(value);
      }).join(' · ');
    }
    renderNode(id) {
      const node = this.store.document.nodes[id], def = definitions[node.type];
      const block = element('div',`circuit-block kind-${def.kind}${this.selected === id ? ' is-selected' : ''}`);
      block.dataset.id = id;
      const head = button('',event => { if (event.detail === 0) this.select(id); },'circuit-block-head');
      head.dataset.drag = id; head.setAttribute('aria-pressed',String(this.selected === id));
      head.setAttribute('aria-label',`${kindNames[def.kind]}: ${def.label} ${this.summary(node)}`);
      head.append(element('span','circuit-kind',kindNames[def.kind]),element('strong','',def.label));
      if (Object.keys(node.params).length) head.append(element('span','circuit-param',this.summary(node)));
      block.append(head);
      if (def.kind === 'condition') {
        for (const port of ['then','else']) {
          const branch = element('div','circuit-branch');
          branch.append(element('span','circuit-branch-label',port === 'then' ? 'なら' : 'でなければ'));
          branch.append(node.links[port] ? this.renderNode(node.links[port]) : this.renderPort(id,port));
          block.append(branch);
        }
      }
      block.append(node.links.next ? this.renderNode(node.links.next) : this.renderPort(id,'next'));
      return block;
    }
    renderPort(id, port) {
      const el = button('＋ ここにつなぐ',() => {
        if (!this.selected) { this.announce('先に接続するブロックを選択してください。'); return; }
        this.run(() => this.store.connect(this.selected,id,port),'ブロックを接続しました。');
      },'circuit-port');
      el.dataset.target = id; el.dataset.port = port;
      el.setAttribute('aria-label',`${definitions[this.store.document.nodes[id].type].label}の「${portNames[port]}」へ選択ブロックを接続`);
      return el;
    }
    render() {
      const doc = this.store.document;
      if (!doc.nodes[this.selected]) this.selected = null;
      this.surface.replaceChildren();
      for (const id of doc.roots) {
        const root = this.renderNode(id), p = doc.layout.rootPositions[id];
        root.classList.add('circuit-root'); root.style.left = `${p.x}px`; root.style.top = `${p.y}px`;
        this.surface.append(root);
      }
      if (!doc.roots.length) this.surface.append(element('p','circuit-empty','左のパレットから、最初のイベントを置きましょう。'));
      this.undoButton.disabled = !this.store.past.length; this.redoButton.disabled = !this.store.future.length;
      this.renderInspector(); this.resizeSurface();
    }
    resizeSurface() {
      let width = 900, height = 600;
      for (const root of this.surface.children) {
        width = Math.max(width,root.offsetLeft + root.offsetWidth + 100);
        height = Math.max(height,root.offsetTop + root.offsetHeight + 100);
      }
      this.surface.style.width = `${width}px`; this.surface.style.height = `${height}px`;
      this.surface.style.transform = `scale(${this.zoom})`;
      this.sizer.style.width = `${width*this.zoom}px`; this.sizer.style.height = `${height*this.zoom}px`;
    }
    select(id) {
      this.selected = id; this.pendingDelete = null;
      this.surface.querySelectorAll('[data-id]').forEach(el => el.classList.toggle('is-selected',el.dataset.id === id));
      this.surface.querySelectorAll('[data-drag]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.drag === id)));
      this.renderInspector();
    }
    freePosition() {
      const x = Math.min(19000,Math.round(this.viewport.scrollLeft/this.zoom + 35));
      let y = Math.round(this.viewport.scrollTop/this.zoom + 35);
      const boxes = [...this.surface.querySelectorAll('.circuit-root')].map(el => ({x:el.offsetLeft,y:el.offsetTop,width:el.offsetWidth,height:el.offsetHeight}));
      for (let attempt=0; attempt<=boxes.length; attempt++) {
        const hits = boxes.filter(box => x < box.x+box.width+24 && x+280+24 > box.x && y < box.y+box.height+24 && y+300+24 > box.y);
        if (!hits.length) break;
        y = Math.max(...hits.map(box => box.y+box.height+32));
      }
      return {x,y:Math.min(19000,y)};
    }
    add(type, position = this.freePosition(), attachment = null) {
      const params = definitions[type].fields.skillId && this.skills.some(skill => skill.cost > 0) ? {skillId:this.skills.find(skill => skill.cost > 0).id} : {};
      this.run(() => { this.selected = this.store.add(type,position,params,attachment); },'ブロックを追加しました。');
      if (!attachment) this.surface.querySelector(`[data-id="${this.selected}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
    }
    renderInspector() {
      this.inspector.replaceChildren(element('h4','','ブロックの設定'));
      const node = this.store.document.nodes[this.selected];
      if (!node) {
        this.inspector.append(element('p','circuit-help','ブロックを選択すると、値の変更・接続・分離ができます。'),element('p','circuit-help','中間からドラッグすると、その下のブロックも一緒に移動します。'));
        return;
      }
      const def = definitions[node.type]; this.inspector.append(element('p','circuit-selection',def.label));
      const root = !parentOf(this.store.document,node.id);
      if (root && def.kind !== 'event') this.inspector.append(element('p','circuit-warning','イベントにつながっていないため実行対象外です。'));
      for (const [key,field] of Object.entries(def.fields)) {
        const label = element('label','circuit-field'); label.append(element('span','',field.label));
        let input;
        if (field.values) {
          input = element('select');
          for (const value of field.values) {
            const unavailable = key === 'skillId' && !this.skills.some(skill => skill.id === value);
            const option = element('option','',this.labelValue(value) + (unavailable ? '（未所持）' : '')); option.value = value; input.append(option);
          }
        } else {
          input = element('input'); input.type = 'number'; input.min = field.min; input.max = field.max; input.step = field.step;
        }
        input.value = node.params[key];
        input.dataset.param = key;
        input.addEventListener('change',() => {
          if (!input.checkValidity()) { this.announce('入力範囲を確認してください。'); return; }
          const value = field.values ? input.value : input.valueAsNumber;
          this.run(() => this.store.setParams(node.id,{...node.params,[key]:value}),'設定を変更しました。');
        });
        label.append(input); this.inspector.append(label);
      }
      if (node.params.skillId && !this.skills.some(skill => skill.id === node.params.skillId)) this.inspector.append(element('p','circuit-warning','このスキルは現在未所持です。'));
      const choices = element('select'); choices.setAttribute('aria-label','接続先');
      const placeholder = element('option','','接続先を選択'); placeholder.value = ''; choices.append(placeholder);
      const excluded = descendants(this.store.document,node.id);
      for (const target of Object.values(this.store.document.nodes)) {
        if (def.kind === 'event' || excluded.has(target.id)) continue;
        for (const port of ports(target.type)) if (target.links[port] === null) {
          const option = element('option','',`${definitions[target.type].label} (${this.summary(target) || kindNames[definitions[target.type].kind]}) → ${portNames[port]}`);
          option.value = `${target.id}:${port}`; choices.append(option);
        }
      }
      const connect = button('選んだ場所につなぐ',() => {
        const [id,port] = choices.value.split(':'); if (!id) { this.announce('接続先を選択してください。'); return; }
        this.run(() => this.store.connect(node.id,id,port),'ブロックを接続しました。');
      });
      choices.disabled = choices.options.length === 1; connect.disabled = choices.disabled;
      this.inspector.append(choices,connect);
      const detach = button('ここから下を分離',() => this.run(() => this.store.move(node.id,this.freePosition()),'子孫ごと分離しました。'));
      detach.disabled = root;
      const single = button('このブロックだけ取り外す',() => this.run(() => this.store.detachOnly(node.id,this.freePosition()),'後続を残して取り外しました。'));
      single.disabled = def.kind === 'event' || (root && !node.links.next);
      const count = descendants(this.store.document,node.id).size;
      const remove = button(this.pendingDelete === node.id ? `${count}個を削除する` : 'スタックを削除…',() => {
        if (this.pendingDelete !== node.id) { this.pendingDelete = node.id; this.renderInspector(); this.inspector.querySelector('.circuit-delete').focus(); this.announce(`このブロックを含む${count}個を削除します。もう一度押すと削除します。`); return; }
        this.run(() => this.store.remove(node.id),'削除しました。元に戻す操作で復元できます。');
      },'circuit-delete');
      this.inspector.append(detach,single,remove);
    }
    setZoom(value) {
      this.zoom = Math.max(.5,Math.min(2,Math.round(value*10)/10));
      this.zoomLabel.textContent = `${Math.round(this.zoom*100)}%`; this.resizeSurface();
      this.zoomOut.disabled = this.zoom === .5; this.zoomIn.disabled = this.zoom === 2;
    }
    pointerDown(event) {
      if (event.button !== 0 || this.drag) return;
      const source = event.target.closest('[data-add], [data-drag]');
      if (!source) return;
      const id = source.dataset.drag;
      if (id) this.select(id);
      const rect = (id ? this.surface.querySelector(`[data-id="${id}"]`) : source).getBoundingClientRect();
      this.drag = {pointerId:event.pointerId, id, type:source.dataset.add, startX:event.clientX, startY:event.clientY, offsetX:event.clientX-rect.left, offsetY:event.clientY-rect.top, source, moved:false, candidate:null};
      this.host.setPointerCapture(event.pointerId);
    }
    pointerMove(event) {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) < 6) return;
      event.preventDefault();
      if (!drag.moved) {
        drag.moved = true;
        const original = drag.id ? this.surface.querySelector(`[data-id="${drag.id}"]`) : null;
        drag.ghost = original ? original.cloneNode(true) : element('div',`circuit-block kind-${definitions[drag.type].kind}`,definitions[drag.type].label);
        drag.ghost.classList.add('circuit-drag-ghost'); drag.ghost.classList.remove('circuit-root');
        drag.ghost.removeAttribute('data-id'); drag.ghost.style.width = `${original?.offsetWidth || 272}px`;
        drag.ghost.style.transform = `scale(${drag.id ? this.zoom : 1})`;
        drag.ghost.setAttribute('aria-hidden','true'); document.body.append(drag.ghost);
        drag.ghost.inert = true;
        original?.classList.add('is-dragging');
      }
      drag.ghost.style.left = `${event.clientX-drag.offsetX}px`; drag.ghost.style.top = `${event.clientY-drag.offsetY}px`;
      this.updateCandidate(event.clientX-drag.offsetX,event.clientY-drag.offsetY);
    }
    updateCandidate(x,y) {
      const drag = this.drag, doc = this.store.document;
      const excluded = drag.id ? descendants(doc,drag.id) : new Set();
      this.surface.querySelectorAll('.is-snap-target').forEach(el => el.classList.remove('is-snap-target'));
      drag.candidate = null;
      if (definitions[drag.type || doc.nodes[drag.id].type].kind === 'event') return;
      const view = this.viewport.getBoundingClientRect();
      const candidates = [];
      this.surface.querySelectorAll('[data-target]').forEach(el => {
        if (excluded.has(el.dataset.target)) return;
        const rect = el.getBoundingClientRect();
        if (rect.left < view.left || rect.top < view.top || rect.right > view.right || rect.bottom > view.bottom) return;
        const distance = Math.hypot(rect.left-x,rect.top-y);
        if (distance <= 24) candidates.push({id:el.dataset.target,port:el.dataset.port,distance,el});
      });
      candidates.sort((a,b) => a.distance-b.distance || `${a.id}:${a.port}`.localeCompare(`${b.id}:${b.port}`));
      if (candidates.length) { drag.candidate = candidates[0]; drag.candidate.el.classList.add('is-snap-target'); }
    }
    pointerUp(event) {
      const drag = this.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const view = this.viewport.getBoundingClientRect();
      const inside = event.clientX >= view.left && event.clientX <= view.right && event.clientY >= view.top && event.clientY <= view.bottom;
      if (!drag.moved) {
        this.cleanupDrag(); if (drag.type) this.add(drag.type); return;
      }
      this.updateCandidate(event.clientX-drag.offsetX,event.clientY-drag.offsetY);
      const candidate = drag.candidate;
      const position = {x:Math.max(0,Math.min(20000,Math.round((event.clientX-drag.offsetX-view.left+this.viewport.scrollLeft)/this.zoom))),y:Math.max(0,Math.min(20000,Math.round((event.clientY-drag.offsetY-view.top+this.viewport.scrollTop)/this.zoom)))};
      this.cleanupDrag();
      if (!inside) { this.announce('配置をキャンセルしました。'); return; }
      if (drag.type) this.add(drag.type,position,candidate);
      else this.run(() => candidate ? this.store.connect(drag.id,candidate.id,candidate.port) : this.store.move(drag.id,position),candidate ? 'ブロックを接続しました。' : 'スタックを移動しました。');
    }
    cleanupDrag() {
      const drag = this.drag; this.drag = null;
      drag?.ghost?.remove();
      this.surface.querySelectorAll('.is-dragging, .is-snap-target').forEach(el => el.classList.remove('is-dragging','is-snap-target'));
      if (drag && this.host.hasPointerCapture(drag.pointerId)) this.host.releasePointerCapture(drag.pointerId);
    }
    cancelDrag() { if (this.drag) { this.cleanupDrag(); this.announce('配置をキャンセルしました。'); } }
    keydown(event) {
      if (event.key === 'Escape' && this.drag) { event.preventDefault(); event.stopPropagation(); this.cancelDrag(); return; }
      if (event.target.matches('input, select, textarea')) { if (event.key !== 'Tab') event.stopPropagation(); return; }
      if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation();
        this.run(() => event.key.toLowerCase() === 'y' || event.shiftKey ? this.store.redo() : this.store.undo());
      }
    }
    dispose() {
      this.cancelDrag();
      for (const [type,handler] of [['pointerdown',this.onDown],['pointermove',this.onMove],['pointerup',this.onUp],['pointercancel',this.onCancel],['lostpointercapture',this.onCancel],['keydown',this.onKey]]) this.host.removeEventListener(type,handler);
      window.removeEventListener('blur',this.onCancel);
      this.host.replaceChildren();
    }
  }
  api.createEditor = (host,skills,catalog) => new CircuitEditor(host,skills,catalog);
})();
