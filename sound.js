'use strict';

window.NeonAudio = (() => {
  const voices = new Map();
  const lastPlayed = new Map();
  const limits = {pulse:70, volley:90, hit:75, burst:100, arc:90};
  const variation = {pulse:.065,volley:.035,hit:.09,seeker:.028,enemyfire:.035};
  let muted = false;
  try { muted = localStorage.getItem('neon-muted') === 'true'; } catch {}

  function play(name, volume=.36) {
    if (muted) return;
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? -Infinity) < (limits[name] ?? 45)) return;
    lastPlayed.set(name, now);
    if (!voices.has(name)) voices.set(name, []);
    const pool = voices.get(name);
    let voice = pool.find(audio => audio.paused || audio.ended);
    if (!voice && pool.length < 3) {
      voice = new Audio(`assets/audio/${name}.wav`);
      pool.push(voice);
    }
    if (!voice) return;
    voice.volume = volume;
    const spread=variation[name]??0;
    voice.preservesPitch=false;
    voice.playbackRate=1+spread*Math.sin(now*.071);
    voice.currentTime = 0;
    voice.play().catch(() => {});
  }

  function toggle() {
    muted = !muted;
    if (muted) for (const pool of voices.values()) for (const voice of pool) voice.pause();
    try { localStorage.setItem('neon-muted', String(muted)); } catch {}
    return muted;
  }

  return {play, toggle, get muted() { return muted; }};
})();

window.NeonMusic = (() => {
  const cues={battle:{file:'Metal_and_Nerve',volume:.32},boss:{file:'core-lockdown',volume:.44}};
  const tracks=new Map();
  let scene=null, active=null, fadeFrame=0, muted=false;
  try { muted=localStorage.getItem('neon-music-muted')==='true'; } catch {}

  function refresh(){
    const wanted=muted?null:scene;
    if (active===wanted) return;
    cancelAnimationFrame(fadeFrame);
    if (active) tracks.get(active).pause();
    active=wanted;
    if (!active) return;

    const {file,volume}=cues[active];
    if (!tracks.has(active)) {
      const media=new Audio(`assets/audio/${file}.mp3`);
      media.loop=true;
      media.dataset.music=active;
      document.body.append(media);
      tracks.set(active,media);
    }
    const track=tracks.get(active);
    track.volume=0;
    track.play().catch(()=>{});
    const start=performance.now();
    function fade(now){
      const progress=Math.min(1,(now-start)/320);
      track.volume=volume*progress;
      if (progress<1) fadeFrame=requestAnimationFrame(fade);
    }
    fadeFrame=requestAnimationFrame(fade);
  }

  function setScene(next){ scene=next; refresh(); }

  function setMuted(next){
    muted=Boolean(next);
    try { localStorage.setItem('neon-music-muted',String(muted)); } catch {}
    refresh();
  }

  function reset(){
    setScene(null);
    for (const track of tracks.values()) track.currentTime=0;
  }

  return {setScene,setMuted,reset,get muted(){return muted;}};
})();
