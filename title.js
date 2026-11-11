(() => {
  'use strict';
  const root = document.getElementById('titleRoot');
  const app = document.querySelector('.app');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const names = ['出撃する', 'オープニングを見る', '操作方法', 'サウンド設定'];
  const descriptions = [
    '戦闘ユニットとマスタースキルを選び、10ウェーブの防衛網に挑む。',
    '救難信号の受信から出撃までを、もう一度。',
    '移動と自動発動スキルの基本。',
    '音楽と効果音のオン／オフ。'
  ];
  let state = 'hidden', onStart = () => {}, selected = 0, panel = '', musicMuted = false;
  let rootBuilt = false, movieEnding = false, hintUntil = 0;
  let idleTimer, dimTimer, hintTimer, transitionTimer, fadeFrame, traceFrame;
  let opening, loop, music, buttons, hint, soundReadout, musicToggle, effectsToggle;
  const $ = selector => root.querySelector(selector);
  const effectsMuted = () => !!window.NeonAudio?.muted;
  function sound(name) { try { window.NeonAudio?.play(name, .3); } catch {} }
  function play(media) { try { const result = media.play(); result?.catch?.(() => {}); } catch {} }
  const readMute = () => window.NeonMusic.muted;
  function stopFade() { cancelAnimationFrame(fadeFrame); fadeFrame = 0; }
  function fadeMusic(target, duration) {
    stopFade();
    if (target && !musicMuted) play(music);
    const start = performance.now(), from = music.volume;
    if (reduce.matches || !duration) { music.volume = target; if (!target) music.pause(); return; }
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      music.volume = Math.min(1, Math.max(0, from + (target - from) * t));
      if (t < 1) fadeFrame = requestAnimationFrame(tick);
      else if (!target) music.pause();
    }
    fadeFrame = requestAnimationFrame(tick);
  }
  function syncSound() {
    const m = musicMuted ? 'OFF' : 'ON', e = effectsMuted() ? 'OFF' : 'ON';
    soundReadout.textContent = `音楽 ${m}　効果音 ${e}`;
    musicToggle.setAttribute('aria-pressed', String(!musicMuted));
    effectsToggle.setAttribute('aria-pressed', String(!effectsMuted()));
    $('button.title-music-toggle span').textContent = m;
    $('button.title-effects-toggle span').textContent = e;
    opening.muted = musicMuted;
  }
  function setMusic(value) {
    musicMuted = value; window.NeonMusic.setMuted(value);
    if (value) fadeMusic(0, 180);
    else if (state === 'press' || state === 'menu') fadeMusic(.5, 500);
    syncSound();
  }
  function setEffects(value) {
    if (effectsMuted() !== value) window.NeonAudio?.toggle();
    syncSound();
  }
  function build() {
    root.innerHTML = `<div class="title-gate">
      <span class="title-brand-mark" aria-hidden="true"></span><div class="title-gate-brand">NEON CIRCUIT</div>
      <button class="title-primary" type="button">クリック、またはキーを押して開始</button>
      <p class="title-gate-note">この先、音が出ます。</p><button class="title-quiet" type="button">音を出さずに開始</button>
    </div><div class="title-movie">
      <div class="title-movie-fallback title-fallback" hidden></div>
      <video class="title-opening" preload="auto" playsinline poster="assets/movie/opening-poster.jpg"><source src="assets/movie/opening.mp4" type="video/mp4"></video>
      <div class="title-movie-controls"><span class="title-skip-hint" role="status"></span><button class="title-skip" type="button">スキップ</button></div>
    </div><div class="title-scene">
      <div class="title-scene-fallback title-fallback" hidden></div>
      <video class="title-loop" preload="auto" muted loop playsinline poster="assets/movie/title-loop-poster.jpg"><source src="assets/movie/title-loop.mp4" type="video/mp4"></video>
      <div class="title-scrim" aria-hidden="true"></div>
      <div class="title-topline"><span class="title-beacon" aria-hidden="true"></span>アークより救難信号を受信中</div>
      <div class="title-content"><div class="title-logo-wrap"><img class="title-logo" src="assets/title/logo.png" alt="NEON CIRCUIT"><div class="title-tagline">軌道施設アーク救出作戦</div></div>
      <div class="title-press"><div class="title-press-latin">PRESS ANY KEY</div><p>キーを押すか、画面をタップ</p></div>
      <nav class="title-nav" aria-label="メインメニュー"></nav><p class="title-description" aria-live="polite"></p></div>
      <svg class="title-trace" aria-hidden="true"><path class="title-trace-base"></path><path class="title-trace-pulse"></path></svg>
      <section class="title-panel title-help" aria-label="操作方法" hidden><h2>操作方法</h2><dl>
      <dt>移動</dt><dd>W A S D または矢印キー（タッチ操作は戦闘エリアをドラッグ）</dd>
      <dt>攻撃</dt><dd>スキルはコストがたまると自動で発動。</dd>
      <dt>強化</dt><dd>レベルアップで3択。ノードは各スキルに2個まで接続。</dd>
      <dt>一時停止</dt><dd>Esc</dd></dl><button class="title-close" type="button">閉じる</button></section>
      <section class="title-panel title-sound" aria-label="サウンド設定" hidden><h2>サウンド設定</h2>
      <button class="title-toggle title-music-toggle" type="button" aria-pressed="true">音楽 <span>ON</span></button>
      <button class="title-toggle title-effects-toggle" type="button" aria-pressed="true">効果音 <span>ON</span></button>
      <button class="title-close" type="button">閉じる</button></section>
      <div class="title-bottom"><div class="title-keys"><span><kbd>↑↓</kbd> 選択</span><span><kbd>Enter</kbd> 決定</span><span><kbd>Esc</kbd> 戻る</span></div><div class="title-sound-readout"></div></div>
    </div>`;
    opening = $('.title-opening'); loop = $('.title-loop'); hint = $('.title-skip-hint');
    soundReadout = $('.title-sound-readout'); musicToggle = $('.title-music-toggle'); effectsToggle = $('.title-effects-toggle');
    music = new Audio('assets/audio/title-theme.wav'); music.loop = true; music.volume = 0;
    music.addEventListener('error', () => {});
    names.forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'title-item';
      button.innerHTML = '<span class="title-node" aria-hidden="true"></span><span class="title-item-label"></span>';
      button.lastElementChild.textContent = name;
      button.addEventListener('pointerenter', () => { if (state === 'menu' && !panel) select(i); });
      button.addEventListener('focus', () => { if (state === 'menu' && !panel) select(i, false); });
      button.addEventListener('click', () => { if (state === 'menu' && !panel) { select(i, false); activate(); } });
      $('.title-nav').append(button);
    });
    buttons = [...root.querySelectorAll('.title-item')];
    opening.addEventListener('ended', finishMovie);
    opening.addEventListener('error', finishMovie);
    loop.addEventListener('error', () => { loop.style.visibility = 'hidden'; $('.title-scene-fallback').hidden = false; });
    for (const [element, poster] of [['.title-movie-fallback', 'assets/movie/opening-poster.jpg'], ['.title-scene-fallback', 'assets/movie/title-loop-poster.jpg']]) {
      const image = new Image(); image.onerror = () => { $(element).style.backgroundImage = 'url("assets/cover.png")'; }; image.src = poster;
    }
    $('.title-primary').addEventListener('click', () => enterGate(false));
    $('.title-quiet').addEventListener('click', () => enterGate(true));
    $('.title-skip').addEventListener('click', finishMovie);
    musicToggle.addEventListener('click', () => setMusic(!musicMuted));
    effectsToggle.addEventListener('click', () => setEffects(!effectsMuted()));
    root.querySelectorAll('.title-close').forEach(button => button.addEventListener('click', closePanel));
    root.addEventListener('pointerdown', pointerDown);
    root.addEventListener('pointermove', pointerMove);
    document.addEventListener('keydown', keyDown);
    window.addEventListener('resize', queueTrace);
    window.setInterval(() => { if (state !== 'hidden') syncSound(); }, 700);
    rootBuilt = true;
  }
  function clearTimers() {
    clearTimeout(idleTimer); clearTimeout(dimTimer); clearTimeout(hintTimer); clearTimeout(transitionTimer);
    cancelAnimationFrame(traceFrame);
  }
  function setState(next) {
    state = next; root.dataset.state = next; root.hidden = next === 'hidden';
    if (app) app.inert = next !== 'hidden';
    if (next !== 'movie') opening.pause();
    if (next !== 'press' && next !== 'menu') loop.pause();
    resetIdle();
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    if ((state === 'press' || state === 'menu') && !panel) idleTimer = setTimeout(playOpening, 75000);
  }
  function hidePanels() {
    panel = ''; $('.title-help').hidden = true; $('.title-sound').hidden = true; root.classList.remove('has-panel');
    $('.title-nav').inert = false;
  }
  function enterGate(quiet) {
    if (state !== 'gate') return;
    if (quiet) { setMusic(true); setEffects(true); }
    sound('ui-confirm');
    if (reduce.matches) showPress(); else playOpening();
  }
  function startLoop() { if (reduce.matches) loop.pause(); else play(loop); }
  function showPress() {
    clearTimers(); movieEnding = false; hidePanels(); setState('press'); startLoop();
    fadeMusic(musicMuted ? 0 : .5, 1200);
  }
  function showMenu() {
    clearTimers(); movieEnding = false; hidePanels(); setState('menu'); startLoop();
    fadeMusic(musicMuted ? 0 : .5, 500); select(0);
  }
  function playOpening() {
    if (state === 'hidden' || state === 'movie') return;
    clearTimers(); hidePanels(); movieEnding = false; hintUntil = 0; hint.textContent = '';
    opening.style.visibility = ''; $('.title-movie-fallback').hidden = true;
    root.classList.remove('title-movie-exit', 'title-movie-dim');
    setState('movie'); fadeMusic(0, 300); opening.muted = musicMuted;
    $('.title-skip').focus({ preventScroll: true });
    try { opening.currentTime = 0; } catch {}
    opening.play().catch(finishMovie); movieActivity();
  }
  function movieActivity() {
    if (state !== 'movie') return;
    root.classList.remove('title-movie-dim'); clearTimeout(dimTimer);
    dimTimer = setTimeout(() => root.classList.add('title-movie-dim'), 2500);
  }
  function finishMovie() {
    if (state !== 'movie' || movieEnding) return;
    movieEnding = true; root.classList.add('title-movie-exit'); opening.pause(); clearTimeout(dimTimer);
    startLoop();
    transitionTimer = setTimeout(() => { showPress(); root.classList.remove('title-movie-exit', 'title-movie-dim'); }, reduce.matches ? 0 : 600);
  }
  function select(index, focus = true) {
    const changed = selected !== index; selected = index;
    buttons.forEach((button, i) => button.classList.toggle('is-selected', i === index));
    $('.title-description').textContent = descriptions[index];
    if (focus && document.activeElement !== buttons[index]) buttons[index].focus({ preventScroll: true });
    if (changed) sound('ui-move'); queueTrace(); resetIdle();
  }
  function queueTrace() { cancelAnimationFrame(traceFrame); traceFrame = requestAnimationFrame(drawTrace); }
  function drawTrace() {
    if (state !== 'menu' || innerWidth < 720) return;
    const box = root.getBoundingClientRect(), label = buttons[selected].lastElementChild.getBoundingClientRect();
    const x = Math.min(label.right - box.left + 16, box.width - 56), y = label.top - box.top + label.height / 2;
    const bend = Math.min(x + 52, box.width - 40);
    const path = `M ${x} ${y} H ${bend} L ${bend + 22} ${y - 22} H ${box.width}`;
    $('.title-trace').setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    $('.title-trace-base').setAttribute('d', path); $('.title-trace-pulse').setAttribute('d', path);
  }
  function activate() {
    sound('ui-confirm');
    if (selected === 0) leave();
    else if (selected === 1) playOpening();
    else openPanel(selected === 2 ? 'help' : 'sound');
  }
  function openPanel(name) {
    hidePanels(); panel = name;
    const element = name === 'help' ? $('.title-help') : $('.title-sound');
    element.hidden = false; root.classList.add('has-panel'); $('.title-nav').inert = true; clearTimeout(idleTimer);
    element.querySelector('button').focus({ preventScroll: true });
  }
  function closePanel() {
    if (!panel) return;
    hidePanels(); buttons[selected].focus({ preventScroll: true }); sound('ui-back'); resetIdle();
  }
  function leave() {
    if (state !== 'menu') return;
    clearTimers(); root.classList.add('title-leaving'); fadeMusic(0, 500);
    transitionTimer = setTimeout(() => {
      opening.pause(); loop.pause(); setState('hidden'); root.classList.remove('title-leaving');
      onStart(); document.querySelector('#overlay button')?.focus({ preventScroll: true });
    }, reduce.matches ? 0 : 450);
  }
  function generalKey(event) {
    return !event.altKey && !event.ctrlKey && !event.metaKey &&
      !['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key);
  }
  function keyDown(event) {
    if (state === 'hidden' || root.classList.contains('title-leaving') || event.repeat) return;
    if (state === 'gate') {
      const onQuiet = document.activeElement?.classList.contains('title-quiet') && (event.key === 'Enter' || event.key === ' ');
      if (generalKey(event) && !onQuiet) { event.preventDefault(); enterGate(false); }
      return;
    }
    if (state === 'movie') {
      movieActivity();
      if (event.key === 'Escape') { event.preventDefault(); finishMovie(); }
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (performance.now() < hintUntil) finishMovie();
        else { hintUntil = performance.now() + 3000; hint.textContent = 'もう一度押すとスキップ';
          clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.textContent = ''; hintUntil = 0; }, 3000); }
      }
      return;
    }
    if (state === 'press') { if (generalKey(event)) { event.preventDefault(); sound('ui-confirm'); showMenu(); } return; }
    if (panel) {
      if (event.key === 'Escape') { event.preventDefault(); closePanel(); }
      else if (event.key === 'Tab') {
        const controls = [...root.querySelectorAll(panel === 'help' ? '.title-help button' : '.title-sound button')];
        const index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index === 0) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      event.preventDefault(); select((selected + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length);
      return;
    }
    const lower = event.key.toLowerCase();
    if (event.key === 'ArrowDown' || lower === 's') { event.preventDefault(); select((selected + 1) % buttons.length); }
    else if (event.key === 'ArrowUp' || lower === 'w') { event.preventDefault(); select((selected + buttons.length - 1) % buttons.length); }
    else if (event.key === 'Escape') { event.preventDefault(); sound('ui-back'); showPress(); }
    else if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.classList.contains('title-item')) {
      event.preventDefault(); activate();
    }
    resetIdle();
  }
  function pointerDown() { if (state === 'movie') movieActivity(); else if (state === 'press') { sound('ui-confirm'); showMenu(); } }
  function pointerMove(event) {
    if (state === 'movie') { movieActivity(); return; }
    if (!fine.matches || reduce.matches || (state !== 'press' && state !== 'menu')) return;
    const x = event.clientX / innerWidth - .5, y = event.clientY / innerHeight - .5;
    root.style.setProperty('--t-parallax-x', `${x * 16}px`);
    root.style.setProperty('--t-parallax-y', `${y * 16}px`);
    root.style.setProperty('--t-logo-shift', `${-x * 8}px`);
    resetIdle();
  }
  function boot(options = {}) {
    onStart = typeof options.onStart === 'function' ? options.onStart : () => {};
    musicMuted = readMute(); if (!rootBuilt) build(); clearTimers(); setState('gate'); syncSound();
    $('.title-primary').focus({ preventScroll: true });
  }
  function show() {
    if (!rootBuilt) build();
    musicMuted=readMute(); syncSound(); clearTimers();
    root.classList.remove('title-leaving', 'title-movie-exit'); showMenu();
  }
  window.NeonTitle = { boot, show, playOpening, get state() { return state; } };
})();
