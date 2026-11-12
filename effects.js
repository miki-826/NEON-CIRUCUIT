'use strict';

window.NeonFX = {
  pool:new window.NeonCombatFX.ParticlePool(),trails:new window.NeonCombatFX.TrailCache(),seen:new WeakSet(),lastTime:null,shake:0,
  reset(){this.pool.clear();this.trails.clear();this.seen=new WeakSet();this.lastTime=null;this.shake=0;},
  beginFrame(effects,time,settings,reduced){
    const dt=this.lastTime===null?0:Math.max(0,Math.min(.1,time-this.lastTime));this.lastTime=time;
    this.pool.setQuality(settings.quality);this.pool.update(dt);this.shake=Math.max(0,this.shake-dt*2);
    for(const e of effects)if(!this.seen.has(e)){
      this.seen.add(e);this.pool.emit(e.type,e,{quality:settings.quality,reducedMotion:reduced});
      if(e.type==='impact'&&e.r>=70)this.shake=Math.min(.65,this.shake+e.r/1800);
    }
  },
  drawProjectile(ctx,b,time,{effectOpacity=1,quality='medium',reducedMotion=false,bloom=true}={}){
    const trail=this.trails.update(b,time),alpha=window.NeonCombatFX.opacity(effectOpacity);if(!alpha)return;
    const color=b.color||'#ff9a55',speed=Math.hypot(b.vx,b.vy)||1,r=b.r||3;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.shadowColor=color;ctx.shadowBlur=bloom&&!reducedMotion?14:0;
    if(!reducedMotion)for(let i=0;i<Math.min(trail.count-1,quality==='low'?2:6);i++){
      const a=this.trails.point(trail,i),z=this.trails.point(trail,i+1);
      ctx.globalAlpha=alpha*(1-i/7)*.55;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,r*(1-i/8));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();
      if(i%2===0){ctx.globalAlpha=alpha*.25*(1-i/7);ctx.fillStyle=color;ctx.beginPath();ctx.arc(z.x+Math.sin(i*3+time*13)*4,z.y+Math.cos(i*5+time*11)*4,1.3,0,Math.PI*2);ctx.fill();}
    }
    const dx=b.vx/speed,dy=b.vy/speed,length=Math.min(30,8+speed*.016);
    ctx.strokeStyle=color;ctx.globalAlpha=alpha*.35;ctx.lineWidth=r*2.8;ctx.beginPath();ctx.moveTo(b.x-dx*length,b.y-dy*length);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.shadowBlur=0;ctx.strokeStyle='#ffffff';ctx.globalAlpha=alpha;ctx.lineWidth=Math.max(1.2,r*.8);ctx.beginPath();ctx.moveTo(b.x-dx*length*.7,b.y-dy*length*.7);ctx.lineTo(b.x+dx*r,b.y+dy*r);ctx.stroke();ctx.restore();
  },
  drawParticles(ctx,settings){
    const alpha=window.NeonCombatFX.opacity(settings.effectOpacity);if(!alpha)return;
    ctx.save();ctx.lineCap='round';
    for(const p of this.pool.active){
      ctx.globalCompositeOperation=p.kind==='smoke'?'source-over':'lighter';ctx.globalAlpha=p.alpha*alpha;
      const color=`rgb(${Math.round(p.red*255)},${Math.round(p.green*255)},${Math.round(p.blue*255)})`;ctx.fillStyle=ctx.strokeStyle=color;
      const x=p.x,y=p.y-p.h*.35;
      if(p.kind==='wave'){ctx.lineWidth=Math.max(1,5*(1-p.age/p.life));ctx.beginPath();ctx.ellipse(x,p.y,p.size,p.size*.7,0,0,Math.PI*2);ctx.stroke();}
      else if(p.kind==='spark'){const a=Math.atan2(p.vy,p.vx);ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*p.length,y-Math.sin(a)*p.length);ctx.stroke();}
      else {const gradient=ctx.createRadialGradient(x,y,0,x,y,p.size);gradient.addColorStop(0,color);gradient.addColorStop(.35,color);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.fillRect(x-p.size,y-p.size,p.size*2,p.size*2);}
    }ctx.restore();
  },
  draw(ctx, effect, reduced, opacity=1) {
    if(['impact','hit','muzzle','sparks'].includes(effect.type))return;
    const remaining = Math.max(0, effect.t / effect.duration);
    const progress = 1 - remaining;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = effect.color;
    ctx.globalAlpha = remaining*opacity;
    ctx.lineCap = 'round';
    if (!reduced) { ctx.shadowColor = effect.color; ctx.shadowBlur = 12; }

    if (effect.type === 'trail' || effect.type === 'arc') {
      ctx.lineWidth = effect.type === 'trail' ? 16 * remaining + 1 : 5 * remaining + 1;
      ctx.beginPath();
      ctx.moveTo(effect.x,effect.y);
      if (effect.type === 'arc') {
        const dx=effect.x2-effect.x, dy=effect.y2-effect.y;
        for (let step=1; step<6; step++) {
          const bend=(step%2 ? 1 : -1)*.075;
          ctx.lineTo(effect.x+dx*step/6-dy*bend,effect.y+dy*step/6+dx*bend);
        }
      }
      ctx.lineTo(effect.x2,effect.y2);
      ctx.stroke();
    } else if (effect.type === 'slash') {
      ctx.lineWidth=15*remaining+2;
      ctx.beginPath();
      ctx.arc(effect.x,effect.y,effect.r,effect.angle-1.05,effect.angle-1.05+2.1*Math.min(1,progress*2.6));
      ctx.stroke();
    } else if (effect.type === 'sparks') {
      ctx.lineWidth=2;
      for(let i=0;i<effect.count;i++) {
        const angle=effect.angle+i*Math.PI*2/effect.count;
        const radius=effect.r*progress;
        ctx.beginPath();
        ctx.moveTo(effect.x+Math.cos(angle)*radius*.66,effect.y+Math.sin(angle)*radius*.66);
        ctx.lineTo(effect.x+Math.cos(angle)*(radius+3),effect.y+Math.sin(angle)*(radius+3));
        ctx.stroke();
      }
    } else {
      const radius=effect.r*(.24+progress*.76);
      ctx.lineWidth=effect.type==='impact'?7*remaining+1:3;
      ctx.beginPath();
      ctx.arc(effect.x,effect.y,radius,0,Math.PI*2);
      ctx.stroke();
      if(effect.type==='impact') {
        ctx.globalAlpha=remaining*.17*opacity;
        ctx.fill();
      }
    }
    ctx.restore();
  },

  telegraph(ctx, zone) {
    const progress=1-zone.t/zone.duration;
    ctx.save();
    ctx.strokeStyle=ctx.fillStyle=zone.color;
    ctx.globalAlpha=.12+progress*.19;
    ctx.beginPath();
    ctx.arc(zone.x,zone.y,zone.r,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=.95;
    ctx.lineWidth=2;
    ctx.setLineDash([7,5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.arc(zone.x,zone.y,zone.r,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);
    ctx.stroke();
    ctx.restore();
  }
};
