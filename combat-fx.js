// Bounded, deterministic visual simulation. Gameplay objects and gameplay RNG are never modified.
(() => {
  'use strict';
  const caps={low:320,medium:768,high:1536};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const opacity=value=>typeof value==='number'&&Number.isFinite(value)?clamp(value,0,1):1;
  function rgb(value){
    let hex=typeof value==='number'?value.toString(16).padStart(6,'0'):String(value||'#59e7ff').replace('#','');
    if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');
    const n=parseInt(hex.slice(0,6),16)||0;
    return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
  }
  class ParticlePool {
    constructor(capacity=1536){
      this.capacity=clamp(Math.floor(capacity),32,1536);this.active=[];this.free=[];this.limit=this.capacity;this.seed=9173;
      for(let i=0;i<this.capacity;i++)this.free.push({});
    }
    random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}
    setQuality(quality){this.limit=Math.min(this.capacity,caps[quality]||caps.medium);while(this.active.length>this.limit)this.free.push(this.active.pop());}
    clear(){while(this.active.length)this.free.push(this.active.pop());this.seed=9173;}
    add(kind,e,color,size,life,vx=0,vy=0,vh=0){
      if(this.active.length>=this.limit||!this.free.length)return false;
      const p=this.free.pop();
      Object.assign(p,{kind,age:0,life,ox:e.x,oy:e.y,oh:kind==='wave'?1:9,x:e.x,y:e.y,h:9,vx,vy,vh,size,size0:size,
        cr:color[0],cg:color[1],cb:color[2],red:1,green:1,blue:1,alpha:0,length:1,reduced:false,rotation:this.random()*6.28,radius:e.r||24});
      this.active.push(p);this.sample(p);return true;
    }
    emit(type,event,{quality='medium',reducedMotion=false}={}){
      if(!['hit','impact','muzzle','sparks'].includes(type)||!Number.isFinite(event.x)||!Number.isFinite(event.y))return 0;
      this.setQuality(quality);
      const e={...event,r:clamp(event.r||24,6,300)},color=rgb(event.color),before=this.active.length;
      const large=type==='impact',muzzle=type==='muzzle',sparks=type==='sparks';
      if(!sparks){
        this.add('flash',e,[1,1,1],clamp(e.r*.34,7,42),muzzle?.055:.075);
        this.add('wave',e,color,e.r,muzzle?.20:.38);
      }
      const budget=reducedMotion?3:quality==='low'?6:quality==='high'?large?30:14:large?18:9;
      for(let i=0;i<budget;i++){
        const angle=(e.angle||0)+(muzzle?(this.random()-.5)*1.9:this.random()*Math.PI*2);
        const speed=(large?90:45)+this.random()*(large?230:125);
        this.add('spark',e,color,1+this.random()*1.8,.22+this.random()*.4,Math.cos(angle)*speed,Math.sin(angle)*speed,25+this.random()*95);
      }
      if(!muzzle&&!sparks)for(let i=0;i<(reducedMotion?1:large?5:2);i++){
        const a=this.random()*6.28,s=12+this.random()*25;
        this.add('smoke',e,color,large?13+this.random()*12:5+this.random()*5,.6+this.random()*.35,Math.cos(a)*s,Math.sin(a)*s,15+this.random()*18);
      }
      for(let i=0;i<(reducedMotion?1:large?7:3);i++){
        const a=this.random()*6.28;this.add('mote',e,color,1+this.random()*1.8,.4+this.random()*.4,Math.cos(a)*30,Math.sin(a)*30,15+this.random()*25);
      }
      if(reducedMotion)for(let i=before;i<this.active.length;i++){this.active[i].reduced=true;this.sample(this.active[i]);}
      else for(let i=before;i<this.active.length;i++)this.active[i].reduced=false;
      return this.active.length-before;
    }
    sample(p){
      const t=p.age,u=clamp(t/p.life,0,1),drag=p.kind==='spark'?5:p.kind==='smoke'?1.3:2;
      const travel=(1-Math.exp(-drag*t))/drag,motion=p.reduced?.25:1;
      p.x=p.ox+p.vx*travel*motion;p.y=p.oy+p.vy*travel*motion;
      p.h=Math.max(1,p.oh+p.vh*travel*motion-(p.kind==='spark'?80*t*t:0));
      const hot=Math.max(0,1-t/.16);
      p.red=p.cr+(1-p.cr)*hot;p.green=p.cg+(.96-p.cg)*hot;p.blue=p.cb+(.72-p.cb)*hot;
      p.alpha=Math.pow(1-u,p.kind==='smoke'?.8:1.7)*(p.reduced?.35:1);
      p.length=Math.max(2,Math.hypot(p.vx,p.vy)*Math.exp(-drag*t)*.065);
      p.size=p.size0;
      if(p.kind==='wave'){p.size=p.size0*(.15+.95*(1-Math.pow(1-u,3)));p.h=1;p.alpha*=.7;}
      if(p.kind==='flash'){p.red=p.green=p.blue=1;p.size=p.size0*(.8+u*.4);p.alpha*=.9;}
      if(p.kind==='smoke'){p.size=p.size0*(.6+u*1.7);p.alpha*=.26;p.red=.09+p.cr*.12;p.green=.11+p.cg*.12;p.blue=.15+p.cb*.12;}
    }
    update(dt){
      dt=Number.isFinite(dt)?clamp(dt,0,.1):0;
      let write=0;for(const p of this.active){p.age+=dt;if(p.age>=p.life){this.free.push(p);continue;}this.sample(p);this.active[write++]=p;}this.active.length=write;
    }
  }
  class TrailCache {
    constructor(){this.clear();}
    clear(){this.records=new WeakMap();}
    update(b,time){
      let r=this.records.get(b);
      if(!r||time<r.time||time-r.time>.2){r={points:Array.from({length:8},()=>({x:b.x,y:b.y})),head:0,count:1,time};this.records.set(b,r);}
      if(time-r.time>=.012){r.head=(r.head+1)%8;r.points[r.head].x=b.x;r.points[r.head].y=b.y;r.count=Math.min(8,r.count+1);r.time=time;}
      return r;
    }
    point(record,age){return record.points[(record.head-age+8)%8];}
  }
  window.NeonCombatFX={ParticlePool,TrailCache,caps,opacity};
})();
