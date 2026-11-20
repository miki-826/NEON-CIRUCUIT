// Presentation only. Never writes to the game snapshot or changes movement speed.
(() => {
  'use strict';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function step(previous,player,dt,{live=true,reducedMotion=false}={}){
    const targetYaw=-(player.angle||0);
    const px=Number.isFinite(player.x)?player.x:0,py=Number.isFinite(player.y)?player.y:0;
    const vx=player.vx||0,vz=player.vy||0,speed=Math.hypot(vx,vz);
    const old=previous||{time:0,yaw:targetYaw,height:.58,pitch:0,roll:0,thrust:.18,turn:0,
      speedNorm:0,surge:0,boost:0,wingSweep:0,wingBank:0,lastX:px,lastY:py,lastSpeed:speed};
    if(!live)return old;
    dt=Number.isFinite(dt)?clamp(dt,0,.05):0;
    const blend=1-Math.exp(-9*dt),fastBlend=1-Math.exp(-14*dt),yawBlend=1-Math.exp(-18*dt);
    const delta=wrap(targetYaw-old.yaw),yaw=wrap(old.yaw+delta*yawBlend);
    const localX=Math.cos(yaw)*vx-Math.sin(yaw)*vz,localZ=Math.sin(yaw)*vx+Math.cos(yaw)*vz;
    const turn=clamp(delta*2,-1,1),time=old.time+dt;
    const lastX=Number.isFinite(old.lastX)?old.lastX:px,lastY=Number.isFinite(old.lastY)?old.lastY:py;
    const lastSpeed=Number.isFinite(old.lastSpeed)?old.lastSpeed:speed;
    const jumpDist=Math.hypot(px-lastX,py-lastY);
    const dashed=dt>0&&jumpDist>26&&jumpDist<420;
    const accel=dt>1e-4?clamp((speed-lastSpeed)/(dt*750),-1,1):0;
    const targetSpeedNorm=clamp(speed/210,0,1);
    const speedNorm=(old.speedNorm||0)+(targetSpeedNorm-(old.speedNorm||0))*blend;
    const surge=reducedMotion?0:(old.surge||0)+(accel-(old.surge||0))*fastBlend;
    const boost=reducedMotion?0:Math.max(0,dashed?1:(old.boost||0)*Math.exp(-4.5*dt));
    const pitch=reducedMotion?0:clamp(localZ/960+surge*.07+boost*.15,-.32,.32)+Math.sin(time*1.7)*.008;
    const roll=reducedMotion?0:clamp(-localX/960-turn*.19,-.36,.36)+Math.sin(time*1.3+.8)*.009;
    const thrust=.18+clamp(speed/260,0,1)*.7+Math.abs(turn)*.25+boost*.62;
    const targetSweep=reducedMotion?0:clamp(targetSpeedNorm*.88+boost*.6,0,1);
    const targetWingBank=reducedMotion?0:clamp(-localX/230-turn*.75,-1,1);
    const wingSweep=(old.wingSweep||0)+(targetSweep-(old.wingSweep||0))*blend;
    const wingBank=(old.wingBank||0)+(targetWingBank-(old.wingBank||0))*fastBlend;
    const height=reducedMotion?.58:.58+Math.sin(time*2.6)*.045+Math.cos(time*5.2)*.004+boost*.035;
    return {time,yaw,height,pitch:old.pitch+(pitch-old.pitch)*blend,
      roll:old.roll+(roll-old.roll)*blend,thrust:old.thrust+(thrust-old.thrust)*blend,turn,
      speedNorm,surge,boost,wingSweep,wingBank,lastX:px,lastY:py,lastSpeed:speed};
  }
  window.NeonHover={step,wrap};
})();
