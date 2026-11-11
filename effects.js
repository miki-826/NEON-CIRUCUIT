'use strict';

window.NeonFX = {
  draw(ctx, effect, reduced) {
    const remaining = Math.max(0, effect.t / effect.duration);
    const progress = 1 - remaining;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = effect.color;
    ctx.globalAlpha = remaining;
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
        ctx.globalAlpha=remaining*.17;
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
