// Presentation only. Never writes to the game snapshot or changes movement speed.
(() => {
  'use strict';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function step(previous,player,dt,{live=true,reducedMotion=false}={}){
    const targetYaw=-(player.angle||0);
    const old=previous||{time:0,yaw:targetYaw,height:.58,pitch:0,roll:0,thrust:.18,turn:0};
    if(!live)return old;
    dt=Number.isFinite(dt)?clamp(dt,0,.05):0;
    const blend=1-Math.exp(-9*dt),yawBlend=1-Math.exp(-18*dt);
    const delta=wrap(targetYaw-old.yaw),yaw=wrap(old.yaw+delta*yawBlend);
    const vx=player.vx||0,vz=player.vy||0,speed=Math.hypot(vx,vz);
    const localX=Math.cos(yaw)*vx-Math.sin(yaw)*vz,localZ=Math.sin(yaw)*vx+Math.cos(yaw)*vz;
    const turn=clamp(delta*2,-1,1),time=old.time+dt;
    const pitch=reducedMotion?0:clamp(localZ/1100,-.23,.23)+Math.sin(time*1.7)*.008;
    const roll=reducedMotion?0:clamp(-localX/1100-turn*.13,-.28,.28)+Math.sin(time*1.3+.8)*.009;
    const thrust=.18+clamp(speed/260,0,1)*.7+Math.abs(turn)*.25;
    return {time,yaw,height:reducedMotion?.58:.58+Math.sin(time*2.6)*.045,pitch:old.pitch+(pitch-old.pitch)*blend,
      roll:old.roll+(roll-old.roll)*blend,thrust:old.thrust+(thrust-old.thrust)*blend,turn};
  }
  window.NeonHover={step,wrap};
})();
