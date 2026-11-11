/* NEON CIRCUIT 3D view. Classic-script API: NeonRender3D.create({canvas,arena,settings})
   returns {setSettings,render,resize,dispose}, or null without WebGL2. Game snapshots
   are read only; visual objects are tracked by snapshot object identity. */
(() => {
  'use strict';
  const T = window.THREE, A = window.THREE_ADDONS;
  const TAU = Math.PI * 2, HALF = Math.PI / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
  const POS = new T.Vector3(), DIR = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  const DUMMY = new T.Object3D(), COL = new T.Color();
  const C = { cyan: 0x59e7ff, violet: 0xaa82ff, amber: 0xffcf79, red: 0xff4d6a,
    orange: 0xff9a55, magenta: 0xef8dff, mint: 0x74ffd3, ice: 0x87dfff };
  const ports = [[145,145],[480,96],[815,145],[865,300],[815,455],[480,504],[145,455],[95,300]];
  function wx(x, w) { return (x - w / 2) / 10; }
  function wz(y, h) { return (y - h / 2) / 10; }
  function material(color, glow = 0, metalness = .7, roughness = .38) {
    return new T.MeshStandardMaterial({ color, metalness, roughness, emissive: glow || 0,
      emissiveIntensity: glow ? 1.6 : 0 });
  }
  function glow(color, opacity = 1) {
    return new T.MeshBasicMaterial({ color, transparent: true, opacity,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  }
  function mesh(g, m, parent, x = 0, y = 0, z = 0) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  }
  function mergeBoxes(parts) {
    const geos = [];
    for (const p of parts) {
      const g = new T.BoxGeometry(p[3], p[4], p[5]);
      g.translate(p[0], p[1], p[2]); geos.push(g);
    }
    const out = A.BufferGeometryUtils.mergeGeometries(geos);
    for (const g of geos) g.dispose();
    return out;
  }
  function makeFloorTexture(size, kind='color') {
    const cv=document.createElement('canvas');cv.width=cv.height=size;
    const c=cv.getContext('2d'), s=size/1024;
    let seed=2917;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    c.fillStyle=kind==='color'?'#0d151d':kind==='rough'?'#9b9b9b':'#000';c.fillRect(0,0,size,size);
    c.save();c.scale(s,s);
    for(let row=0;row<10;row++){
      const y=row*102.4,offset=row%2?41:0;
      for(let x=-80+offset;x<1024;x+=82){
        const w=(rnd()>.72?158:76),h=83+rnd()*10;
        if(kind==='color'){
          const shade=Math.floor(17+rnd()*14);c.fillStyle=`rgb(${shade},${shade+9},${shade+16})`;c.fillRect(x+3,y+4,w-7,h);
          c.fillStyle='rgba(0,0,0,.45)';c.fillRect(x+3,y+4,w-7,3);c.fillRect(x+3,y+4,3,h);
          c.fillStyle='rgba(130,160,170,.13)';c.fillRect(x+6,y+h-2,w-12,1);
          if(rnd()>.78){c.fillStyle='rgba(6,10,15,.55)';c.fillRect(x+14,y+15,w-30,23);c.strokeStyle='rgba(94,128,143,.25)';c.strokeRect(x+14,y+15,w-30,23);}
          c.fillStyle='rgba(100,140,155,.4)';for(const bx of [x+10,x+w-15])for(const by of [y+12,y+h-10])c.fillRect(bx,by,2,2);
        }else if(kind==='rough'){
          const r=Math.floor(95+rnd()*100);c.fillStyle=`rgb(${r},${r},${r})`;c.fillRect(x+3,y+4,w-7,h);
          if(rnd()>.82){c.fillStyle='#404040';c.fillRect(x+8,y+8,w-18,h-14);}
        }else{
          c.strokeStyle='#777';c.lineWidth=2;c.strokeRect(x+3,y+4,w-7,h);
          c.strokeStyle='#222';c.lineWidth=4;c.beginPath();c.moveTo(x+9,y+h-3);c.lineTo(x+w-8,y+h-3);c.stroke();
        }
      }
    }
    if(kind==='color'){
      c.fillStyle='rgba(180,190,180,.05)';for(let i=0;i<3000;i++)c.fillRect(rnd()*1024,rnd()*1024,1+rnd()*8,.4);
      for(let i=0;i<24;i++){const x=rnd()*1024,y=rnd()*1024,r=10+rnd()*40,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(1,3,6,.23)');g.addColorStop(1,'rgba(1,3,6,0)');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
      c.font='bold 18px monospace';c.fillStyle='rgba(125,164,172,.28)';c.fillText('ARK-07',66,150);c.fillText('BAY 04',820,920);
      c.strokeStyle='rgba(52,141,161,.35)';c.lineWidth=3;for(const x of [68,956]){c.beginPath();c.moveTo(x,100);c.lineTo(x,920);c.stroke();}
      c.strokeStyle='rgba(120,160,170,.28)';c.lineWidth=4;c.beginPath();c.arc(512,512,82,0,TAU);c.stroke();c.beginPath();c.arc(512,512,61,0,TAU);c.stroke();
      for(let i=0;i<12;i++){const a=i*TAU/12;c.beginPath();c.moveTo(512+Math.cos(a)*66,512+Math.sin(a)*66);c.lineTo(512+Math.cos(a)*79,512+Math.sin(a)*79);c.stroke();}
    }
    c.restore();
    const tex=new T.CanvasTexture(cv);if(kind==='color')tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
  }
  function makeNormalMap(heightTexture){
    const src=heightTexture.image,w=src.width,h=src.height,c=src.getContext('2d'),input=c.getImageData(0,0,w,h).data;
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const out=cv.getContext('2d'),img=out.createImageData(w,h),data=img.data;
    const at=(x,y)=>input[(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const gx=at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1);
      const gy=at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1);
      const l=Math.hypot(gx*.008,gy*.008,1),i=(y*w+x)*4;data[i]=128-gx*.008/l*127;data[i+1]=128-gy*.008/l*127;data[i+2]=128+127/l;data[i+3]=255;
    }
    out.putImageData(img,0,0);return new T.CanvasTexture(cv);
  }
  function makeContactTexture(){const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d');
    const g=c.createRadialGradient(64,64,3,64,64,64);g.addColorStop(0,'rgba(0,2,5,.68)');g.addColorStop(.48,'rgba(0,2,5,.36)');g.addColorStop(1,'rgba(0,2,5,0)');c.fillStyle=g;c.fillRect(0,0,128,128);return new T.CanvasTexture(cv);}
  function makeTrimTexture(){const cv=document.createElement('canvas');cv.width=cv.height=256;const c=cv.getContext('2d');
    c.fillStyle='#777';c.fillRect(0,0,256,256);c.strokeStyle='#151515';c.lineWidth=3;
    for(let y=0;y<256;y+=64){c.strokeRect(5,y+5,246,54);c.fillStyle='#ccc';for(const x of [14,240]){c.beginPath();c.arc(x,y+13,3,0,TAU);c.fill();c.beginPath();c.arc(x,y+49,3,0,TAU);c.fill();}}
    c.strokeStyle='#aaa';c.lineWidth=1;for(let i=0;i<75;i++){const x=(i*97)%250,y=(i*53)%250;c.beginPath();c.moveTo(x,y);c.lineTo(x+8,y+2);c.stroke();}
    return new T.CanvasTexture(cv);}
  const zoneVertex = 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const zoneFragment = `uniform vec3 uColor; uniform float uProgress; uniform float uPulse;
    varying vec2 vUv; void main(){vec2 p=vUv*2.-1.; float r=length(p); if(r>1.)discard;
    float a=atan(p.y,p.x)+1.5707963; a=mod(a+6.2831853,6.2831853)/6.2831853;
    float rim=smoothstep(.88,.92,r)*(1.-smoothstep(.974,1.,r));
    float dash=step(.38,fract(a*36.));
    float arc=(1.-smoothstep(uProgress-.012,uProgress+.012,a))*smoothstep(.76,.8,r);
    float alpha=(.09+.045*uPulse)*(1.-r)+rim*dash*.53+arc*.68;
    gl_FragColor=vec4(uColor,alpha); }`;
  const domeFragment = `uniform vec3 uColor; varying vec3 vN; varying vec3 vEye;
    void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vEye))),2.5);
    gl_FragColor=vec4(uColor,.06+f*.38);}`;
  const domeVertex = `varying vec3 vN; varying vec3 vEye; void main(){vec4 p=modelViewMatrix*vec4(position,1.);
    vN=normalize(normalMatrix*normal); vEye=-p.xyz; gl_Position=projectionMatrix*p;}`;
  const gradeShader = {
    uniforms: { tDiffuse: { value:null }, uTime:{value:0}, uHurt:{value:0}, uLow:{value:0}, uSize:{value:new T.Vector2(1,1)} },
    vertexShader:'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime,uHurt,uLow; uniform vec2 uSize;
      varying vec2 vUv; void main(){vec2 q=vUv-.5; float edge=dot(q,q);
      vec2 shift=q*(.0007+uHurt*.0035); float r=texture2D(tDiffuse,vUv+shift).r;
      vec3 base=texture2D(tDiffuse,vUv).rgb; float b=texture2D(tDiffuse,vUv-shift).b;
      vec3 col=vec3(r,base.g,b); float l=dot(col,vec3(.2126,.7152,.0722));
      col+=vec3(-.014,.012,.021)*(1.-l)+vec3(.025,.008,-.012)*l;
      float grain=fract(sin(dot(vUv*uSize+uTime*17.,vec2(12.9898,78.233)))*43758.5453)-.5;
      col+=grain*.011; col*=1.-edge*.57;
      col=mix(col,col*vec3(1.25,.64,.68),clamp((edge-.105)*1.7,0.,1.)*uLow);
      col=mix(col,col*vec3(1.13,.73,.77),uHurt*.35);
      gl_FragColor=vec4(col,1.); }`
  };

  function create({ canvas, arena = {w:960,h:600}, settings = {} }) {
    if (!T || !A || !canvas || !canvas.getContext) return null;
    let context;
    try { context = canvas.getContext('webgl2', { antialias:false, alpha:false, powerPreference:'high-performance' }); }
    catch (_) { return null; }
    if (!context) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, context, antialias:false, powerPreference:'high-performance' }); }
    catch (_) { return null; }
    const cfg = {quality:'medium',bloom:true,shake:true,damageNumbers:true,follow:true,reducedMotion:false,...settings};
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=.95;
    renderer.shadowMap.type=T.PCFShadowMap;
    const scene=new T.Scene(); scene.background=new T.Color(0x070e1b); scene.fog=new T.FogExp2(0x080f1c,.009);
    const camera=new T.PerspectiveCamera(35,1,.3,600);
    const resources={geometries:new Set(),materials:new Set(),textures:new Set()};
    const G=(g)=>{resources.geometries.add(g);return g;}, M=(m)=>{resources.materials.add(m);return m;};
    const floorSize=cfg.quality==='high'?2048:1024;
    const floorMap=makeFloorTexture(floorSize),roughMap=makeFloorTexture(floorSize,'rough');
    const floorHeight=makeFloorTexture(floorSize,'height'),floorNormal=makeNormalMap(floorHeight);
    const contactMap=makeContactTexture(),trimHeight=makeTrimTexture(),trimNormal=makeNormalMap(trimHeight);
    for(const tex of [floorMap,roughMap,floorNormal,contactMap,trimNormal])resources.textures.add(tex);
    floorHeight.dispose();
    trimHeight.dispose();
    const floorMat=M(new T.MeshStandardMaterial({map:floorMap,roughnessMap:roughMap,normalMap:floorNormal,
      color:0xb0c5d0,metalness:.55,roughness:.74,normalScale:new T.Vector2(.48,.48)}));
    const worldW=arena.w/10, worldH=arena.h/10;
    const floor=mesh(G(new T.PlaneGeometry(worldW,worldH)),floorMat,scene);
    floor.rotation.x=-HALF; floor.receiveShadow=true;
    // Painted arena art (same layout as the 2D game) replaces the procedural albedo when available.
    // It is embedded as a data URI (vendor/arena-texture.js) so WebGL can sample it on file://.
    if(window.NEON_ARENA_TEXTURE){
      const art=new Image();
      art.onload=()=>{
        if(disposed)return;
        const w=cfg.quality==='high'?2048:1600,h=Math.round(w*art.height/art.width);
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        const c=cv.getContext('2d');c.drawImage(art,0,0,w,h);
        const artMap=new T.CanvasTexture(cv);artMap.colorSpace=T.SRGBColorSpace;artMap.anisotropy=8;
        const hc=document.createElement('canvas');hc.width=1024;hc.height=Math.round(1024*h/w);
        const hctx=hc.getContext('2d');hctx.filter='grayscale(1) blur(1px)';hctx.drawImage(art,0,0,hc.width,hc.height);
        const heightTex=new T.CanvasTexture(hc),artNormal=makeNormalMap(heightTex);heightTex.dispose();
        // Rougher where the art is dark, a little glossier on lit plates: reads as worn, wet metal.
        const rc=document.createElement('canvas');rc.width=512;rc.height=Math.round(512*h/w);
        const rctx=rc.getContext('2d');rctx.filter='grayscale(1) invert(1) contrast(.55) brightness(1.05)';rctx.drawImage(art,0,0,rc.width,rc.height);
        const artRough=new T.CanvasTexture(rc);
        for(const tex of [artMap,artNormal,artRough])resources.textures.add(tex);
        floorMat.map=artMap;floorMat.normalMap=artNormal;floorMat.roughnessMap=artRough;
        floorMat.normalScale.set(.9,.9);floorMat.color.set(0x8f98a6);floorMat.metalness=.62;floorMat.roughness=.82;
        floorMat.needsUpdate=true;
      };
      art.src=window.NEON_ARENA_TEXTURE;
    }
    // Gunmetal armour: mid-dark values so key/rim light shape the forms instead of clipping to white.
    const mArmor=M(material(0x3b4b59,0,.62,.36)), mDark=M(material(0x0e1824,0,.45,.5)), mEdge=M(material(0x2c3c4a,0,.6,.4));
    const mPlate=M(new T.MeshStandardMaterial({color:0x5f7280,metalness:.66,roughness:.3,normalMap:trimNormal,normalScale:new T.Vector2(.5,.5)}));
    const mCyan=M(material(0x79eaff,C.cyan,.35,.25)), mViolet=M(material(0xb993ff,C.violet,.4,.28));
    const mAmber=M(material(0xffd99a,C.amber,.4,.27)), mRed=M(material(0xff6076,C.red,.4,.25));
    const mIce=M(material(0xb9f5ff,C.ice,.3,.25)), mWhite=M(material(0xffffff,0xffffff,.2,.22));
    const aura={cyan:M(glow(C.cyan,.68)),violet:M(glow(C.violet,.6)),magenta:M(glow(C.magenta,.6)),amber:M(glow(C.amber,.7)),red:M(glow(C.red,.7)),mint:M(glow(C.mint,.6)),orange:M(glow(C.orange,.7))};
    const box=G(new T.BoxGeometry(1,1,1)), round=G(new A.RoundedBoxGeometry(1,1,1,2,.13)), sphere=G(new T.IcosahedronGeometry(1,1));
    const ring=G(new T.RingGeometry(.93,1,64)), disc=G(new T.PlaneGeometry(2,2));
    const cylinder=G(new T.CylinderGeometry(1,1,1,8)), blade=G(new T.ConeGeometry(.36,1.35,4));
    const torus=G(new T.TorusGeometry(1,.055,5,48));
    const floorRing=(parent,mat,r,y=.05)=>{const o=mesh(ring,mat,parent,0,y,0);o.rotation.x=-HALF;o.scale.setScalar(r);return o;};
    const cube=(parent,mat,x,y,z,sx,sy,sz)=>{const o=mesh(box,mat,parent,x,y,z);o.scale.set(sx,sy,sz);return o;};
    const plate=(parent,mat,x,y,z,sx,sy,sz)=>{const o=mesh(round,mat,parent,x,y,z);o.scale.set(sx,sy,sz);return o;};
    const shadowMat=M(new T.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,opacity:.8,polygonOffset:true,polygonOffsetFactor:-1}));
    // Bulkhead panels and integrated light channels remain one mesh per material.
    const wallParts=[],trimParts=[],warningParts=[];
    for(let x=-worldW/2;x<worldW/2;x+=4){
      wallParts.push([x+1.95,2.5,-worldH/2-1,3.85,5,1.8],[x+1.95,.58,worldH/2+1,3.85,1.16,1.8]);
      trimParts.push([x+1.95,4.95,-worldH/2-.6,3.7,.06,.07],[x+1.95,1.18,worldH/2+.6,3.7,.06,.07]);
    }
    for(let z=-worldH/2;z<worldH/2;z+=4){
      wallParts.push([-worldW/2-1,2.5,z+1.95,1.8,5,3.85],[worldW/2+1,2.5,z+1.95,1.8,5,3.85]);
      trimParts.push([-worldW/2-.6,4.95,z+1.95,.07,.06,3.7],[worldW/2+.6,4.95,z+1.95,.07,.06,3.7]);
    }
    for(let i=0;i<24;i++){const x=-worldW/2+2+i*4;warningParts.push([x,.025,-worldH/2+1,1.7,.03,.18],[x,.025,worldH/2-1,1.7,.03,.18]);}
    const walls=mesh(G(mergeBoxes(wallParts)),mArmor,scene);walls.castShadow=true;walls.receiveShadow=true;
    mesh(G(mergeBoxes(trimParts)),mCyan,scene);
    mesh(G(mergeBoxes(warningParts)),mAmber,scene);
    mesh(G(mergeBoxes([[-34,.04,-18,21,.025,.08],[34,.04,18,21,.025,.08],[-26,.04,0,.08,.025,17],[26,.04,0,.08,.025,17]])),mCyan,scene);
    const portGroups=[];
    for(let i=0;i<ports.length;i++){
      const p=ports[i], g=new T.Group();g.position.set(wx(p[0],arena.w),0,wz(p[1],arena.h));scene.add(g);
      const hatch=mesh(G(new T.CylinderGeometry(2.65,2.65,.13,8)),mDark,g,0,.045,0);
      hatch.rotation.y=Math.PI/8;
      floorRing(g,aura.cyan,2.6,.15);
      const leaves=[];
      for(let j=0;j<4;j++){const a=j*HALF;const bar=plate(g,mArmor,Math.cos(a)*.62,.18,Math.sin(a)*.62,1.16,.19,1.16);
        bar.rotation.y=-a;leaves.push(bar);const lamp=cube(g,mAmber,Math.cos(a)*1.8,.18,Math.sin(a)*1.8,.8,.16,.16);lamp.rotation.y=-a;}
      const flare=floorRing(g,aura.amber,2.9,.19);flare.visible=false;
      portGroups.push({group:g,flare,leaves,t:0});
    }
    const outside=new T.Group();scene.add(outside);
    const pylons=[];for(let x=-70;x<=70;x+=10)for(const z of [-41,41])pylons.push([x,2,z,1.2,4,1.2]);
    for(let z=-40;z<=40;z+=10)for(const x of [-59,59])pylons.push([x,2,z,1.2,4,1.2]);
    mesh(G(mergeBoxes(pylons)),mDark,outside);
    for(const z of [-38,38])cube(outside,mEdge,0,.3,z,120,.5,2);
    const reactor=new T.Group(); reactor.position.set(0,0,-76);scene.add(reactor);
    cube(reactor,mDark,0,4,0,7,8,7);
    const core=mesh(sphere,mRed,reactor,0,5,0);core.scale.setScalar(3);
    const coreRing=mesh(torus,aura.red,reactor,0,5,0);coreRing.scale.setScalar(5);
    const starPosition=new Float32Array(2000*3);
    for(let i=0;i<2000;i++){const a=Math.random()*TAU,r=110+Math.random()*250;starPosition[i*3]=Math.cos(a)*r;
      starPosition[i*3+1]=20+Math.random()*160;starPosition[i*3+2]=Math.sin(a)*r-40;}
    const starGeo=G(new T.BufferGeometry());starGeo.setAttribute('position',new T.BufferAttribute(starPosition,3));
    const stars=new T.Points(starGeo,M(new T.PointsMaterial({color:0x8cb5e0,size:.55,sizeAttenuation:true,transparent:true,opacity:.55,depthWrite:false,fog:false})));scene.add(stars);
    const planetMat=M(new T.ShaderMaterial({uniforms:{uRim:{value:new T.Color(0x368dcd)}},
      vertexShader:'varying vec3 n; varying vec3 v; void main(){n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader:'uniform vec3 uRim;varying vec3 n;varying vec3 v;void main(){float f=pow(1.-max(dot(normalize(n),normalize(v)),0.),2.3);vec3 deep=mix(vec3(.006,.024,.06),vec3(.03,.11,.22),max(n.y,0.));gl_FragColor=vec4(deep+uRim*f*.7,1.);}' }));
    const planet=mesh(G(new T.SphereGeometry(48,40,24)),planetMat,scene,0,-43,-172);
    const dustGeo=G(new T.BufferGeometry()),dustPos=new Float32Array(420*3);
    for(let i=0;i<420;i++){dustPos[i*3]=(Math.random()-.5)*145;dustPos[i*3+1]=Math.random()*20+1;dustPos[i*3+2]=(Math.random()-.5)*110;}
    dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));
    const dust= new T.Points(dustGeo,M(new T.PointsMaterial({color:C.cyan,size:.13,transparent:true,opacity:.33,depthWrite:false})));
    scene.add(dust);
    scene.add(new T.HemisphereLight(0x7f9ec4,0x05080e,.55));
    const key=new T.DirectionalLight(0xffe2c2,2.1);key.position.set(-17,42,15);scene.add(key,key.target);
    const rim=new T.DirectionalLight(0x8ccaff,2.6);rim.position.set(21,19,-30);scene.add(rim);
    key.shadow.camera.left=-56;key.shadow.camera.right=56;key.shadow.camera.top=39;key.shadow.camera.bottom=-39;
    key.shadow.camera.near=1;key.shadow.camera.far=110;key.shadow.bias=-.0003;key.shadow.normalBias=.035;
    const playerLight=new T.PointLight(C.cyan,16,13,2);scene.add(playerLight);
    const bossLight=new T.PointLight(C.red,0,16,2);scene.add(bossLight);
    const blastLights=[];for(let i=0;i<6;i++){const l=new T.PointLight(C.amber,0,18,2);scene.add(l);blastLights.push({light:l,t:0});}
    let pmrem=null, env=null;
    if(A.RoomEnvironment){try{pmrem=new T.PMREMGenerator(renderer);const room=new A.RoomEnvironment();env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.38;room.dispose();}catch(_){if(pmrem)pmrem.dispose();pmrem=null;}}

    // Unit geometry is built once per class, with static pieces merged by material.
    // The small flying enemies use three model draws even when the pool reaches 90.
    const unitMats={};
    for(const [name,color] of Object.entries({ranger:C.cyan,tank:C.amber,assassin:C.violet,
      drone:C.magenta,hunter:C.magenta,elite:C.amber,boss:C.red})){
      unitMats[name]={
        shell:M(new T.MeshPhysicalMaterial({color:name==='boss'?0x3a0d16:0x202d3a,metalness:name==='boss'?.6:.72,
          roughness:name==='boss'?.35:.32,clearcoat:.4,clearcoatRoughness:.25,normalMap:trimNormal,normalScale:new T.Vector2(.23,.23)})),
        plate:M(new T.MeshPhysicalMaterial({color:name==='boss'?0x5a1420:0x3b4c5b,metalness:name==='boss'?.6:.7,
          roughness:name==='boss'?.35:.3,clearcoat:.42,clearcoatRoughness:.25,normalMap:trimNormal,normalScale:new T.Vector2(.3,.3)})),
        dark:M(new T.MeshStandardMaterial({color:0x0b1118,metalness:.38,roughness:.7})),
        gold:M(new T.MeshPhysicalMaterial({color:0xc8962e,metalness:1,roughness:.25,clearcoat:.5})),
        line:M(new T.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:name==='elite'?1.8:2.2,
          metalness:.34,roughness:.25})),
        eye:M(new T.MeshStandardMaterial({color:name==='drone'?0x9d39aa:name==='boss'?0x9a142f:name==='elite'?0xff9a35:0xffffff,emissive:color,
          emissiveIntensity:name==='drone'?2.5:name==='elite'?1.8:name==='boss'?3.1:3.4,
          metalness:.2,roughness:.2}))
      };
    }
    const unitFlash=M(new T.MeshBasicMaterial({color:0xdff6ff,transparent:true,opacity:.32,
      blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));
    const templates={};
    function batch(){
      const pieces={shell:[],plate:[],dark:[],gold:[],line:[],eye:[]};
      const add=(key,geo,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{
        let g=geo.clone();if(geo!==round)geo.dispose();
        if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}
        const o=new T.Object3D();o.position.set(x,y,z);o.rotation.set(rx,ry,rz);
        o.scale.set(sx,sy,sz);o.updateMatrix();g.applyMatrix4(o.matrix);pieces[key].push(g);
      };
      const rounded=(key,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>add(key,round,x,y,z,sx,sy,sz,rx,ry,rz);
      const capsule=(key,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>add(key,new T.CapsuleGeometry(.5,1,4,8),x,y,z,sx,sy,sz,rx,ry,rz);
      const shape=(key,points,x,y,z,depth=.14,rx=0,ry=0,rz=0)=>{
        const s=new T.Shape();s.moveTo(points[0][0],points[0][1]);
        for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);s.closePath();
        const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.05,bevelThickness:.05,bevelSegments:2,steps:1});
        add(key,g,x,y,z,1,1,1,rx,ry,rz);
      };
      const line=(key,a,b,r=.035)=>{const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
        const g=new T.CylinderGeometry(r,r,len,6),q=new T.Quaternion().setFromUnitVectors(UP,new T.Vector3(dx,dy,dz).normalize());
        const o=new T.Object3D();o.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
        o.quaternion.copy(q);o.updateMatrix();g.applyMatrix4(o.matrix);
        const flat=g.toNonIndexed();g.dispose();pieces[key].push(flat);
      };
      const finish=()=>{const out={};for(const key of Object.keys(pieces))if(pieces[key].length){
        out[key]=G(A.BufferGeometryUtils.mergeGeometries(pieces[key]));for(const g of pieces[key])g.dispose();}
        return out;};
      return {add,rounded,capsule,shape,line,finish};
    }
    const starPoints=(count,outer,inner)=>{const pts=[];for(let i=0;i<count*2;i++){
      const a=i*Math.PI/count-Math.PI/2,r=i%2?inner:outer;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}return pts;};
    function makeTemplate(type){
      if(templates[type])return templates[type];
      const b=batch(),limb=batch(),shin=batch(),arm=batch(),extra=batch();
      const human=['ranger','tank','assassin','elite'].includes(type);
      if(human){
        const heavy=type==='tank',killer=type==='assassin',elite=type==='elite';
        const shoulder=heavy?1.05:elite?.82:killer?.55:.68,torso=heavy?.78:killer?.47:.62;
        b.capsule('dark',0,1.43,0,torso*1.45,.6,.62);
        b.rounded('shell',0,1.67,0,torso*1.8,.76,.68);
        b.shape('plate',[[-torso,0],[0,.19],[torso,0],[torso*.7,-.55],[0,-.7],[-torso*.7,-.55]],0,1.95,-.39,.12);
        if(!elite)b.shape('line',[[-.34,0],[0,-.11],[.34,0],[.28,-.075],[0,-.19],[-.28,-.075]],0,1.79,-.56,.018);
        for(const side of [-1,1]){
          if(!elite)b.line('line',[side*.35,1.73,-.54],[side*.55,1.92,-.39],.025);
          b.rounded('dark',side*.37,1.03,0,.3,.27,.43);
          b.rounded('plate',side*.36,1.07,-.25,.28,.21,.09);
        }
        const head=new T.LatheGeometry([[0,-.34],[.27,-.3],[.34,-.13],[.35,.12],[.27,.32],[.08,.38],[0,.38]].map(p=>new T.Vector2(p[0],p[1])),12);
        b.add('shell',head,0,2.31,-.02,1,1,1);
        b.shape('dark',[[-.28,0],[.28,0],[.24,-.15],[-.24,-.15]],0,2.36,-.32,.045);
        b.shape('eye',[[-.24,0],[.24,0],[.18,-.045],[-.18,-.045]],0,2.31,-.39,.012);
        if(!elite)b.line('line',[-.18,2.61,-.04],[.18,2.61,-.04],.025);
        // Crest and top plate stay readable from the pitched overhead camera.
        b.rounded('plate',0,2.64,.035,.39,.075,.46);
        if(!elite)b.rounded('line',0,2.69,-.04,.075,.025,.35);
        if(killer){
          b.shape('shell',[[-.42,-.26],[-.34,.13],[0,.47],[.34,.13],[.42,-.26],[.25,-.38],[-.25,-.38]],0,2.42,.02,.17);
          b.line('line',[0,2.87,-.02],[0,2.67,-.31],.03);
          b.shape('plate',[[-.39,0],[0,-.2],[.39,0],[.26,-.28],[0,-.42],[-.26,-.28]],0,1.78,-.55,.06);
        }
        if(heavy||elite){
          const w=heavy?.67:.48;
          for(const side of [-1,1]){
            b.shape('plate',[[-w,-.13],[-w*.84,.24],[0,.39],[w*.84,.24],[w,-.13],[0,-.34]],side*shoulder,1.89,-.12,.43,0,side*.18);
            b.line('line',[side*(shoulder-w*.55),2.1,-.19],[side*shoulder,2.21,-.18],elite?.026:.04);
            if(!elite)b.line('line',[side*shoulder,2.21,-.18],[side*(shoulder+w*.55),2.1,-.19],.04);
          }
          b.rounded('dark',0,1.55,.43,.7,.64,.43);
          if(!elite)b.rounded('line',0,1.76,-.57,.18,.27,.035);
        }else if(type==='ranger'){
          b.rounded('shell',0,1.52,.47,.8,.78,.38);
          for(const side of [-1,1]){
            b.rounded('plate',side*.33,1.43,.68,.28,.56,.2);
            b.line('line',[side*.34,1.28,.8],[side*.34,1.59,.8],.025);
          }
        }
        if(!heavy&&!elite)for(const side of [-1,1]){
          const x=side*(killer?.62:.73);
          b.rounded('plate',x,1.98,-.02,killer?.48:.59,.27,.61);
        }
        if(killer)b.rounded('dark',0,1.53,.5,.67,.63,.41);
        if(!elite){for(const side of [-1,1]){
          b.rounded('dark',side*.22,1.72,.77,.13,.1,.22);
          b.rounded('plate',side*.22,1.77,.79,.075,.025,.16);
        }}
        // Weapon silhouette projects ahead of the torso in the overhead view.
        if(type==='ranger'){
          b.rounded('dark',.28,1.43,-.96,.25,.23,1.78);
          b.rounded('plate',.28,1.47,-1.28,.43,.3,.55);
          b.line('line',[.28,1.6,-1.05],[.28,1.6,-1.95],.045);
          b.add('shell',new T.CylinderGeometry(.11,.11,.55,8),.28,1.44,-2.04,1,1,1,HALF);
          b.rounded('eye',.28,1.45,-2.34,.15,.15,.11);
        }else if(heavy||elite){
          const gunX=heavy?.72:.47;
          b.rounded('shell',gunX,1.44,-.98,.55,.47,1.19);
          for(const side of [-1,1]){
            b.add('dark',new T.CylinderGeometry(.17,.19,1.13,10),gunX+side*.18,1.45,-1.67,1,1,1,HALF);
            if(!elite||side===1)b.add('line',new T.TorusGeometry(.145,elite?.022:.032,5,12),gunX+side*.18,1.45,-2.27,1,1,1,0,0,0);
          }
          b.shape('plate',[[-.33,0],[.33,0],[.2,-.29],[-.2,-.29]],gunX,1.77,-1.25,.1);
        }
        limb.capsule('dark',0,-.18,0,.4,.38,.42);
        limb.shape('plate',[[-.22,0],[0,.11],[.22,0],[.2,-.32],[-.2,-.32]],0,-.17,-.23,.09);
        if(!elite)limb.line('line',[0,-.06,-.34],[0,-.32,-.31],.026);
        shin.capsule('dark',0,-.18,0,.37,.39,.39);
        shin.shape('plate',[[-.2,0],[.2,0],[.17,-.35],[0,-.42],[-.17,-.35]],0,-.16,-.21,.08);
        if(!elite)shin.line('line',[0,-.03,-.31],[0,-.33,-.29],.026);
        shin.rounded('shell',0,-.39,-.17,.49,.25,.72);
        arm.capsule('dark',0,-.25,0,.31,.5,.31);
        arm.shape('plate',[[-.25,.16],[.25,.16],[.22,-.24],[0,-.37],[-.22,-.24]],0,-.21,-.22,.09);
        if(!elite)arm.line('line',[0,-.05,-.33],[0,-.39,-.3],.026);
        if(killer){
          arm.shape('shell',[[-.13,0],[.13,0],[.07,-.3],[-.07,-.3]],0,-.52,.48,.09);
          arm.shape('line',[[-.065,0],[.065,0],[.035,-1.37],[0,-1.55],[-.035,-1.37]],0,-.55,.55,.045);
          arm.shape('eye',[[-.018,0],[.018,0],[0,-1.5]],0,-.59,.61,.015);
        }
      }else if(type==='drone'||type==='hunter'){
        const hunter=type==='hunter',r=hunter?1.2:1.08;
        const pts=hunter?[[-1.55,.63],[-1.95,-.02],[-.62,-.4],[0,-1.32],[.62,-.4],[1.95,-.02],[1.55,.63],[0,.36]]:starPoints(4,r,.43);
        b.shape('shell',pts,0,1.2,0,.34,-HALF);
        if(hunter){
          b.shape('shell',pts.map(p=>[p[0]*.82,p[1]*.82]),0,1.43,0,.12,-HALF);
          for(let i=0;i<4;i++){
            const a=i*HALF-Math.PI/2;
            b.line('line',[Math.cos(a)*.37,1.58,Math.sin(a)*.37],
              [Math.cos(a)*1.28,1.52,Math.sin(a)*1.28],.04);
          }
          b.add('line',new T.OctahedronGeometry(.42,0),0,1.67,0,1,.32,1);
        }else{
          for(let i=0;i<4;i++){
            const a=i*HALF-Math.PI/2,c=Math.cos(a),s=Math.sin(a),p=Math.cos(a+HALF),q=Math.sin(a+HALF);
            const blade=[[c*.28+p*.22,-s*.28-q*.22],[c*.94,-s*.94],
              [c*.28-p*.22,-s*.28+q*.22],[c*.4,-s*.4]];
            b.shape('plate',blade,0,1.56,0,.11,-HALF);
            b.line('line',[c*.28+p*.2,1.72,s*.28+q*.2],[c*.94,1.72,s*.94],.018);
            b.line('line',[c*.94,1.72,s*.94],[c*.28-p*.2,1.72,s*.28-q*.2],.018);
          }
          b.add('eye',new T.OctahedronGeometry(.25,0),0,1.79,0,1,.72,1);
        }
        b.add('shell',new T.LatheGeometry([[0,0],[.24,.05],[.3,.18],[.2,.3],[0,.34]].map(p=>new T.Vector2(p[0],p[1])),10),0,.76,0);
        b.add('line',new T.ConeGeometry(.2,.38,8),0,.57,0,1,1,1,0,0,Math.PI);
      }else{
        // Flat star armour has a true eight-point footprint, visible from the game camera.
        const pts=starPoints(8,2.8,1.34);
        b.shape('dark',pts,0,1.3,0,.42,-HALF);
        b.shape('shell',starPoints(8,2.68,1.27),0,1.74,0,.25,-HALF);
        for(let i=0;i<8;i++){
          const a=i*TAU/8-Math.PI/2,c=Math.cos(a),s=Math.sin(a),p=-s,q=c;
          const base=[c*.73,s*.73],left=[c*1.32+p*.56,s*1.32+q*.56];
          const right=[c*1.32-p*.56,s*1.32-q*.56],tip=[c*2.82,s*2.82];
          b.shape('plate',[[base[0],-base[1]],[left[0],-left[1]],
            [tip[0],-tip[1]],[right[0],-right[1]]],0,1.85,0,.72,-HALF);
          b.line('gold',[left[0],2.62,left[1]],[tip[0],2.62,tip[1]],.032);
          b.line('gold',[tip[0],2.62,tip[1]],[right[0],2.62,right[1]],.032);
          b.add('gold',new T.CylinderGeometry(.095,.095,.12,6),tip[0],2.65,tip[1]);
          b.line('line',[c*1.03,2.64,s*1.03],[c*2.45,2.64,s*2.45],.024);
        }
        b.add('gold',new T.TorusGeometry(.76,.065,8,48),0,2.66,0,1,1,1,HALF);
        b.add('dark',new T.CylinderGeometry(.59,.68,.3,16),0,2.67,0);
        b.add('gold',new T.TorusGeometry(.42,.035,6,32),0,2.85,0,1,1,1,HALF);
        // Extra star appears on wave ten; the crown rises above the eight tips.
        extra.shape('shell',starPoints(8,3.05,1.12),0,1.2,0,.14,-HALF);
        for(let i=0;i<8;i++){const a=i*TAU/8-Math.PI/2,c=Math.cos(a),s=Math.sin(a);
          extra.line('line',[c*1.7,1.43,s*1.7],[c*2.78,1.43,s*2.78],.055);
          extra.add('eye',new T.ConeGeometry(.2,.65,5),c*2.67,1.73,s*2.67,1,1,1);
        }
      }
      return templates[type]={main:b.finish(),leg:limb.finish(),shin:shin.finish(),arm:arm.finish(),extra:extra.finish()};
    }
    function mount(parent,geos,mats){let body=null;for(const key of Object.keys(geos)){
      const part=mesh(geos[key],mats[key],parent);part.castShadow=key!=='line'&&key!=='eye';
      if(key==='shell')body=part;}return body;}
    const bossCoreGeo=G(new T.SphereGeometry(.34,16,10));
    const bossOrbitMat=M(new T.MeshPhysicalMaterial({color:0x513039,metalness:.75,roughness:.42,
      clearcoat:.2}));
    // ---- Blender robot models -------------------------------------------------
    // GLBs are embedded as base64 in vendor/models.js (window.NEON_MODELS) so they also load on file://.
    // Until a model has parsed (or if it is missing) the procedural unit below stays visible.
    const gltfCache={}, allUnits=[];
    const LOWER_BODY=/^(root|hips|thigh|shin|foot)/;
    const MODEL_SCALE={boss:.8,ranger:1.3,tank:1.25,assassin:1.3,elite:1.1};
    // Named nodes the renderer animates directly; their contents are merged but the nodes themselves are kept.
    const CONTROL_NODES=new Set(['Body','Core','Petals','Wings','Base','Star','StarOuter','Ring1','Ring2','Pylons','Crown']);
    // Blender exports one mesh per armour piece (100+ per robot). Merge them per material so a robot costs a
    // handful of draw calls: rigid-skinned pieces become one SkinnedMesh per material sharing the skeleton,
    // static pieces are merged inside their nearest animated control node.
    function mergeByMaterial(meshes,keep,matrixOf){
      const byMat=new Map();
      for(const m of meshes){
        const src=m.geometry,g=new T.BufferGeometry();
        for(const k of keep)if(src.attributes[k])g.setAttribute(k,src.attributes[k].clone());
        if(src.index)g.setIndex(src.index.clone());
        g.applyMatrix4(matrixOf(m));
        if(!byMat.has(m.material))byMat.set(m.material,[]);
        byMat.get(m.material).push(g);
      }
      const out=[];
      for(const [mat,geos] of byMat){
        const mixed=geos.some(g=>g.index)&&geos.some(g=>!g.index);
        const list=mixed?geos.map(g=>g.index?g.toNonIndexed():g):geos;
        const merged=A.BufferGeometryUtils.mergeGeometries(list,false);
        if(merged)out.push([mat,merged]);
      }
      return out;
    }
    function optimizeModel(scene){
      scene.updateMatrixWorld(true);
      const skinned=[],statics=new Map();
      scene.traverse(o=>{
        if(!o.isMesh||Array.isArray(o.material)||o.children.length||CONTROL_NODES.has(o.name))return;
        if(o.isSkinnedMesh){skinned.push(o);return;}
        let c=o.parent;while(c&&c!==scene&&!CONTROL_NODES.has(c.name))c=c.parent;c=c||scene;
        if(!statics.has(c))statics.set(c,[]);statics.get(c).push(o);
      });
      if(skinned.length>1){
        const skeleton=skinned[0].skeleton,sameBones=skinned.every(m=>m.skeleton.bones.length===skeleton.bones.length&&m.skeleton.bones.every((b,i)=>b===skeleton.bones[i]));
        if(sameBones){
          // Bake each piece's bind matrix into its vertices so one identity bind works for all of them.
          const parts=mergeByMaterial(skinned,['position','normal','skinIndex','skinWeight'],m=>m.bindMatrix);
          for(const m of skinned)m.removeFromParent();
          for(const [mat,geo] of parts){
            const sm=new T.SkinnedMesh(geo,mat);sm.name='merged';sm.frustumCulled=false;
            scene.add(sm);sm.bind(skeleton,new T.Matrix4());
          }
        }
      }
      for(const [control,meshes] of statics){
        if(meshes.length<2)continue;
        const inv=new T.Matrix4().copy(control.matrixWorld).invert();
        const parts=mergeByMaterial(meshes,['position','normal'],m=>new T.Matrix4().multiplyMatrices(inv,m.matrixWorld));
        for(const m of meshes)m.removeFromParent();
        for(const [mat,geo] of parts)control.add(new T.Mesh(geo,mat));
      }
    }
    function tuneModelMaterials(root,id){
      root.traverse(o=>{
        if(!o.isMesh)return;
        resources.geometries.add(o.geometry);
        o.castShadow=true;o.receiveShadow=true;
        for(const m of Array.isArray(o.material)?o.material:[o.material]){
          if(!m||m.userData.neonTuned)continue;
          m.userData.neonTuned=true;resources.materials.add(m);
          const n=(m.name||'').toLowerCase();
          // Blender emission strengths (6–14) would blow out under bloom; normalise to the scene's range.
          if(n.startsWith('glow'))m.emissiveIntensity=id==='elite'?1.3:2.4;
          else if(n.startsWith('visor'))m.emissiveIntensity=id==='boss'?1.8:id==='drone'?2.2:3.4;
          else m.envMapIntensity=.9;
        }
      });
    }
    function upgradeUnit(v){
      const g=gltfCache[v.type];if(!g||v.model)return;
      const model=A.SkeletonUtils.clone(g.scene);
      model.rotation.y=Math.PI; // GLB faces +Z, the unit rig faces -Z
      model.scale.setScalar(MODEL_SCALE[v.type]||1);
      for(const c of v.tilt.children)c.visible=false;
      v.tilt.add(model);v.model=model;
      const nodes={};model.traverse(o=>{if(o.name&&!nodes[o.name])nodes[o.name]=o;});
      v.nodes=nodes;v.chest=nodes.chest||null;
      if(v.type!=='drone'&&v.type!=='hunter'){
        // Few of these exist at once, so they get their own materials for a hit flash.
        v.flashMats=[];
        model.traverse(o=>{
          if(!o.isMesh||Array.isArray(o.material))return;
          const name=(o.material.name||'').toLowerCase();
          if(name.startsWith('glow')||name.startsWith('visor'))return;
          const m=o.material.clone();m.emissive=new T.Color(.55,.72,.9);m.emissiveIntensity=0;
          o.material=m;resources.materials.add(m);v.flashMats.push(m);
        });
      }
      if(g.animations.length){
        const mixer=new T.AnimationMixer(model),acts={};
        for(const clip of g.animations){
          let c=clip;
          // Firing only drives the upper body so it layers over the run cycle.
          if(clip.name==='Fire'){c=clip.clone();c.tracks=c.tracks.filter(t=>!LOWER_BODY.test(t.name.split('.')[0]));}
          acts[clip.name]=mixer.clipAction(c);
        }
        for(const k of ['Idle','Run','Walk'])if(acts[k]){acts[k].play();acts[k].setEffectiveWeight(k==='Idle'?1:0);}
        if(acts.Fire){acts.Fire.setLoop(T.LoopOnce,1);acts.Fire.clampWhenFinished=false;}
        v.mixer=mixer;v.acts=acts;v.firePlaying=false;v.twist=0;
      }
    }
    function animateModel(v,dt,move,firing,twist){
      if(!v.mixer)return;
      const run=v.acts.Run||v.acts.Walk,idle=v.acts.Idle,w=clamp(move,0,1);
      if(run){run.setEffectiveWeight(w);run.setEffectiveTimeScale(.7+w*.45);}
      if(idle)idle.setEffectiveWeight(1-w);
      if(firing&&v.acts.Fire&&!v.firePlaying){v.acts.Fire.reset().setEffectiveWeight(1).play();v.firePlaying=true;}
      if(!firing)v.firePlaying=false;
      v.mixer.update(dt);
      if(v.chest&&twist)v.chest.rotateY(twist);
    }
    function loadModels(){
      const src=window.NEON_MODELS;
      if(!src||!A.GLTFLoader||!A.SkeletonUtils)return;
      const loader=new A.GLTFLoader();
      for(const id of Object.keys(src)){
        let buffer;
        try{const bin=atob(src[id]),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);buffer=bytes.buffer;}
        catch(error){console.warn('NEON model decode failed',id,error);continue;}
        loader.parse(buffer,'',gltf=>{
          if(disposed)return;
          try{optimizeModel(gltf.scene);}catch(error){console.warn('NEON model merge skipped',id,error);}
          tuneModelMaterials(gltf.scene,id);
          gltfCache[id]=gltf;
          for(const v of allUnits)if(v.type===id)upgradeUnit(v);
        },error=>console.warn('NEON model parse failed',id,error));
      }
    }

    function unit(type){
      const root=new T.Group(),tilt=new T.Group(),upper=new T.Group();root.add(tilt);tilt.add(upper);scene.add(root);
      const mats=unitMats[type],tpl=makeTemplate(type);
      let rotating=null,thrust=null,bar=null,aim=null,trail=null,crown=null,secondRing=null,pylons=null,petals=null;
      let body=null,legs=null,knees=null,arms=null,eye=null;
      const human=['ranger','tank','assassin','elite'].includes(type);
      if(human){
        body=mount(upper,tpl.main,mats);legs=[];knees=[];arms=[];
        const wide=type==='tank'?.54:type==='elite'?.47:type==='assassin'?.31:.39;
        for(const side of [-1,1]){
          const leg=new T.Group();leg.position.set(side*wide,1.04,0);tilt.add(leg);mount(leg,tpl.leg,mats);legs.push(leg);
          const knee=new T.Group();knee.position.y=-.43;leg.add(knee);mount(knee,tpl.shin,mats);knees.push(knee);
          const armNode=new T.Group();armNode.position.set(side*(wide+.35),1.84,0);upper.add(armNode);
          mount(armNode,tpl.arm,mats);arms.push(armNode);
        }
        if(type==='ranger'){
          const thrusterGeo=G(new T.LatheGeometry([[0,0],[.13,.05],[.19,.16],[.13,.24],[0,.26]].map(p=>new T.Vector2(p[0],p[1])),10));
          thrust=[];for(const side of [-1,1]){const t=mesh(thrusterGeo,mats.eye,upper,side*.32,1.27,.77);t.rotation.x=HALF;thrust.push(t);}
        }
      }else if(type==='drone'||type==='hunter'){
        rotating=new T.Group();upper.add(rotating);body=mount(rotating,tpl.main,mats);
        body.castShadow=false;
        thrust=rotating;
        if(type==='hunter'){
          const ribbonGeo=G(new T.BufferGeometry()),positions=new Float32Array(16*2*3),colors=new Float32Array(16*2*4),indices=[];
          for(let i=0;i<15;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
          ribbonGeo.setIndex(indices);ribbonGeo.setAttribute('position',new T.BufferAttribute(positions,3));
          ribbonGeo.setAttribute('color',new T.BufferAttribute(colors,4));
          trail=new T.Mesh(ribbonGeo,M(new T.MeshBasicMaterial({vertexColors:true,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide})));
          scene.add(trail);trail.frustumCulled=false;trail.visible=false;
        }
      }else{
        rotating=new T.Group();upper.add(rotating);body=mount(rotating,tpl.main,mats);
        eye=mesh(bossCoreGeo,mats.eye,rotating,0,2.96,0);eye.scale.y=.42;
        secondRing=mesh(G(new T.TorusGeometry(2.5,.035,6,48)),bossOrbitMat,upper,0,2.32,0);secondRing.rotation.x=HALF;
        crown=new T.Group();upper.add(crown);mount(crown,tpl.extra,mats);
      }
      const flash=mesh(body.geometry,unitFlash,body.parent);flash.position.copy(body.position);
      flash.scale.setScalar(1.025);flash.visible=false;
      const flying=type==='drone'||type==='hunter';
      const contact=flying?new T.Object3D():mesh(disc,shadowMat,root,0,.035,0);
      if(!flying){contact.rotation.x=-HALF;
        contact.scale.set(type==='boss'?7:type==='elite'?3.6:2.6,type==='boss'?7:type==='elite'?3.6:2.6,1);}
      const outline=type==='boss'?'red':type==='tank'||type==='elite'?'amber':type==='ranger'?'cyan':type==='hunter'?'magenta':'violet';
      const ground=flying?new T.Object3D():floorRing(root,aura[outline],type==='boss'?3.2:type==='elite'?1.9:1.4,.07);
      if(type==='elite'||type==='boss'){
        const y=type==='boss'?3.7:3.22,w=type==='boss'?3.9:2.3;
        const back=plate(root,mDark,0,y,0,w+.1,.13,.13),fill=plate(root,type==='boss'?mRed:mAmber,0,y,.08,w,.09,.11);
        bar={back,fill,full:w};
      }
      if(type==='elite'){
        aim=mesh(G(new T.PlaneGeometry(.08,33)),M(new T.ShaderMaterial({uniforms:{uTime:{value:0},uPower:{value:0}},
          vertexShader:zoneVertex,fragmentShader:'uniform float uTime,uPower;varying vec2 vUv;void main(){float dash=step(.42,fract(vUv.y*42.-uTime*5.));float edge=smoothstep(0.,.3,vUv.x)*(1.-smoothstep(.7,1.,vUv.x));gl_FragColor=vec4(1.,.57,.16,dash*(.25+uPower*.55)*edge);}',
          transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide})),root,0,.1,-16.5);aim.rotation.x=-HALF;aim.visible=false;
      }
      root.visible=false;
      const record={root,tilt,upper,legs,knees,arms,body,flash,eye,ground,contact,rotating,thrust,bar,aim,trail,crown,secondRing,pylons,petals,type,spawn:0,dead:0,seen:false,phase:0};
      allUnits.push(record);upgradeUnit(record);
      return record;
    }
    const playerModels={ranger:unit('ranger'),tank:unit('tank'),assassin:unit('assassin')};
    let currentPlayer=playerModels.ranger;
    const pools={drone:[],hunter:[],elite:[],boss:[]},enemyMap=new Map(),retired=[];
    const takeEnemy=(type)=>pools[type].pop()||unit(type);
    function releaseEnemy(v){v.root.visible=false;v.aim&&(v.aim.visible=false);if(v.trail)v.trail.visible=false;pools[v.type].push(v);}
    const footprintShadow=new T.InstancedMesh(disc,shadowMat,256);
    const footprintDrone=new T.InstancedMesh(ring,aura.violet,256);
    const footprintHunter=new T.InstancedMesh(ring,aura.magenta,256);
    for(const inst of [footprintShadow,footprintDrone,footprintHunter]){
      inst.count=0;inst.instanceMatrix.setUsage(T.DynamicDrawUsage);inst.frustumCulled=false;scene.add(inst);
    }
    const dome=mesh(G(new T.SphereGeometry(1,24,16)),M(new T.ShaderMaterial({uniforms:{uColor:{value:new T.Color(C.mint)}},vertexShader:domeVertex,fragmentShader:domeFragment,transparent:true,depthWrite:false,side:T.DoubleSide})),scene);
    dome.visible=false;dome.scale.set(2.4,2.4,2.4);
    const orbitMeshes=[];for(let i=0;i<12;i++){const b=mesh(blade,mViolet,scene);b.visible=false;orbitMeshes.push(b);}
    // Projectile cores and luminous velocity streaks are two instanced draws per team.
    const bullets={};
    const bulletWhite=M(glow(0xffffff,.95));
    for(const kind of ['friendly','hostile','streak','hostileStreak','halo','hostileHalo']){
      const geo=kind.includes('Streak')||kind==='streak'?cylinder:sphere;
      const mat=kind==='hostile'||kind==='hostileStreak'?aura.orange:kind==='halo'?M(glow(C.cyan,.18)):kind==='hostileHalo'?M(glow(C.orange,.16)):bulletWhite;
      const inst=new T.InstancedMesh(geo,mat,512);inst.count=0;inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
      inst.frustumCulled=false;scene.add(inst);bullets[kind]=inst;
    }
    const frost=new T.InstancedMesh(sphere,aura.cyan,256);frost.count=0;frost.instanceMatrix.setUsage(T.DynamicDrawUsage);frost.frustumCulled=false;scene.add(frost);
    const qOrient=new T.Quaternion();
    function putInstance(inst,i,x,y,z,sx,sy,sz,col,angle){
      DUMMY.position.set(x,y,z);DUMMY.scale.set(sx,sy,sz);
      DUMMY.rotation.set(0,angle||0,0);DUMMY.updateMatrix();inst.setMatrixAt(i,DUMMY.matrix);
      if(col!==undefined){COL.set(col);inst.setColorAt(i,COL);}
    }
    function putStreak(inst,i,x,y,z,dx,dz,length,r,color){
      DUMMY.position.set(x,y,z);DIR.set(dx,0,dz).normalize();
      DUMMY.quaternion.setFromUnitVectors(UP,DIR);DUMMY.scale.set(r,length,r);
      DUMMY.updateMatrix();inst.setMatrixAt(i,DUMMY.matrix);
      COL.set(color);inst.setColorAt(i,COL);
    }
    const zones=new Map(),zonePool=[];
    function newZone(){
      const mat=M(new T.ShaderMaterial({uniforms:{uColor:{value:new T.Color(C.red)},uProgress:{value:0},uPulse:{value:0}},
        vertexShader:zoneVertex,fragmentShader:zoneFragment,transparent:true,depthWrite:false,side:T.DoubleSide}));
      const o=mesh(disc,mat,scene);o.rotation.x=-HALF;return o;
    }
    function syncZones(frame,elapsed){
      for(const record of zones.values())record.seen=false;
      for(const z of frame.zones||[]){
        let v=zones.get(z);if(!v){v={mesh:zonePool.pop()||newZone()};zones.set(z,v);}
        v.seen=true;v.mesh.visible=true;v.mesh.position.set(wx(z.x,arena.w),.09,wz(z.y,arena.h));
        v.mesh.scale.set(z.r/10,z.r/10,1);
        v.mesh.material.uniforms.uColor.value.set(z.source?C.red:C.amber);
        v.mesh.material.uniforms.uProgress.value=clamp(1-z.t/z.duration,0,1);
        v.mesh.material.uniforms.uPulse.value=.5+.5*Math.sin(elapsed*7);
      }
      for(const [key,v] of zones)if(!v.seen){v.mesh.visible=false;zonePool.push(v.mesh);zones.delete(key);}
    }
    const effects=new Map(),effectPool={ring:[],impact:[],sparks:[],trail:[],arc:[],slash:[],text:[]};
    const fxSeen=new WeakSet();
    const scorch=[];for(let i=0;i<24;i++){const mark=mesh(disc,M(new T.MeshBasicMaterial({map:contactMap,color:0x05080c,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})),scene);
      mark.rotation.x=-HALF;mark.visible=false;scorch.push({mark,age:0});}
    let scorchNext=0;
    function paintScorch(x,z,r){const v=scorch[scorchNext++%scorch.length];v.age=6;v.mark.visible=true;v.mark.position.set(x,.047,z);v.mark.scale.setScalar(Math.max(1,r));}
    function textSprite(){const cv=document.createElement('canvas');cv.width=128;cv.height=64;
      const ctx=cv.getContext('2d');const tex=new T.CanvasTexture(cv);resources.textures.add(tex);
      const mat=M(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
      const sp=new T.Sprite(mat);sp.scale.set(2.8,1.4,1);scene.add(sp);return {object:sp,canvas:cv,ctx,tex};}
    function makeEffect(type){
      if(type==='text')return textSprite();
      const root=new T.Group();scene.add(root);
      let o;
      if(type==='ring'||type==='impact'){o=floorRing(root,M(glow(C.cyan,.7)),1,.12);
        if(type==='impact'){const flash=mesh(sphere,M(glow(C.cyan,.5)),root,0,.7,0);flash.scale.setScalar(.3);
          for(let i=0;i<3;i++){const smoke=mesh(sphere,M(new T.MeshBasicMaterial({color:0x18232c,transparent:true,opacity:.25,depthWrite:false})),root,Math.cos(i*TAU/3)*.5,.4,Math.sin(i*TAU/3)*.5);smoke.scale.setScalar(.4);smoke.userData.smoke=true;}}}
      else if(type==='sparks'){
        const mat=M(glow(C.cyan,.8));
        for(let i=0;i<12;i++){const s=mesh(blade,mat,root);s.scale.set(.13,.65,.13);}
      }else if(type==='slash'){
        o=mesh(G(new T.TorusGeometry(1,.1,5,24,2.1)),M(glow(C.violet,.8)),root,0,1.3,0);o.rotation.x=HALF;
      }else if(type==='arc'){
        const mat=M(glow(C.cyan,.9));
        for(let i=0;i<9;i++)mesh(cylinder,mat,root);
      }else{
        o=mesh(cylinder,M(glow(C.cyan,.8)),root);o.scale.set(.12,1,.12);
        if(type==='trail')mesh(cylinder,M(glow(C.cyan,.26)),root);
      }
      return {object:root,main:o};
    }
    function startEffect(e){
      const type=effectPool[e.type]?e.type:'impact';
      const v=effectPool[type].pop()||makeEffect(type);v.type=type;v.life=e.duration||.4;v.age=0;
      v.color=e.color||'#59e7ff';v.object.visible=true;
      if(type==='impact')paintScorch(wx(e.x,arena.w),wz(e.y,arena.h),(e.r||25)/10);
      if(type==='text'){
        const c=v.ctx;c.clearRect(0,0,128,64);c.font='bold 42px Arial';c.textAlign='center';
        c.shadowColor=v.color;c.shadowBlur=10;c.fillStyle=v.color;c.fillText(String(e.text||''),64,46);v.tex.needsUpdate=true;
      }else{
        v.object.traverse(o=>{if(o.isMesh&&o.material.color&&!o.userData.smoke)o.material.color.set(v.color);});
      }
      effects.set(e,v);return v;
    }
    function syncEffects(frame,dt){
      for(const e of frame.effects||[]){if(!fxSeen.has(e)){fxSeen.add(e);startEffect(e);}}
      for(const [e,v] of effects){
        v.age+=dt;const remain=clamp(e.t/e.duration,0,1);const progress=1-remain;
        if(v.type==='text'){
          v.object.visible=cfg.damageNumbers;v.object.position.set(wx(e.x,arena.w),3+progress*2,wz(e.y,arena.h));
          v.object.material.opacity=remain;
        }else{
          const root=v.object;root.position.set(wx(e.x,arena.w),0,wz(e.y,arena.h));
          if(v.type==='ring'||v.type==='impact'){
            const scale=Math.max(.1,(e.r||30)/10*(.25+progress*.75));v.main.scale.setScalar(scale);
            v.main.material.opacity=remain*.72;
            if(v.type==='impact'){const flash=root.children[1];flash.scale.setScalar(Math.min(1.6,(e.r||30)/10*.12)*(.4+remain*.6));flash.material.opacity=remain*remain*.42;
              for(let i=0;i<3;i++){const smoke=root.children[i+2],a=i*TAU/3;
                smoke.position.set(Math.cos(a)*(0.5+progress*1.5),.35+progress*2,Math.sin(a)*(0.5+progress*1.5));
                smoke.scale.setScalar(.35+progress*.85);smoke.material.opacity=remain*.22;}}
          }else if(v.type==='sparks'){
            const n=Math.min(root.children.length,e.count||8),range=(e.r||30)/10*progress;
            for(let i=0;i<root.children.length;i++){const s=root.children[i];s.visible=i<n;
              const a=(e.angle||0)+i*TAU/n;s.position.set(Math.cos(a)*range,Math.max(.12,.75+progress*3-progress*progress*4),Math.sin(a)*range);
              s.rotation.z=-a;s.scale.y=.55*remain;}
          }else if(v.type==='slash'){
            root.rotation.y=-(e.angle||0);v.main.scale.setScalar((e.r||22)/10);v.main.material.opacity=remain;
          }else if(v.type==='arc'){
            const dx=wx(e.x2??e.x,arena.w)-root.position.x,dz=wz(e.y2??e.y,arena.h)-root.position.z;
            const inv=1/Math.max(.001,Math.hypot(dx,dz));
            let lastX=0,lastZ=0;
            for(let i=0;i<6;i++){
              const t=(i+1)/6,bend=i===5?0:((i%2)?-.5:.5)*(.7+.2*Math.sin(elapsed*28+i));
              const nx=dx*t-dz*inv*bend,nz=dz*t+dx*inv*bend;
              const seg=root.children[i],sx=nx-lastX,sz=nz-lastZ;
              seg.position.set((nx+lastX)/2,1.3,(nz+lastZ)/2);
              DIR.set(sx,0,sz).normalize();seg.quaternion.setFromUnitVectors(UP,DIR);
              seg.scale.set(.08*remain,Math.hypot(sx,sz),.08*remain);
              seg.material.opacity=remain;
              lastX=nx;lastZ=nz;
            }
            for(let i=0;i<3;i++){const branch=root.children[i+6],t=(i+2)/6;
              const bx=dx*t,bz=dz*t,side=i%2?-.8:.8,len=Math.max(.3,Math.hypot(dx,dz)*.13);
              branch.position.set(bx-dz*inv*side*.5,1.35,bz+dx*inv*side*.5);
              DIR.set(dx*inv*.3-dz*inv*side,0,dz*inv*.3+dx*inv*side).normalize();branch.quaternion.setFromUnitVectors(UP,DIR);
              branch.scale.set(.045*remain,len,.045*remain);branch.material.opacity=remain*.7;}
          }else{
            const x2=wx(e.x2||e.x,arena.w),z2=wz(e.y2||e.y,arena.h);
            const dx=x2-root.position.x,dz=z2-root.position.z,len=Math.hypot(dx,dz);
            v.main.position.set(dx/2,1.1,dz/2);DIR.set(dx,0,dz).normalize();
            qOrient.setFromUnitVectors(UP,DIR);v.main.quaternion.copy(qOrient);
            v.main.scale.set(v.type==='trail'?.24*remain:.09*remain,len,.24*remain);
            if(v.type==='trail'){const outer=root.children[1];outer.position.copy(v.main.position);outer.quaternion.copy(v.main.quaternion);
              outer.scale.set(.48*remain,len,.48*remain);outer.material.opacity=remain*.27;}
          }
        }
        if(e.t<=0){v.object.visible=false;effectPool[v.type].push(v);effects.delete(e);}
      }
    }
    let composer=null,bloomPass=null,gradePass=null,smaaPass=null,aoPass=null;
    if(A.EffectComposer&&A.RenderPass&&A.OutputPass){
      composer=new A.EffectComposer(renderer);composer.addPass(new A.RenderPass(scene,camera));
      if(A.GTAOPass){try{aoPass=new A.GTAOPass(scene,camera);composer.addPass(aoPass);}catch(_){aoPass=null;}}
      if(A.UnrealBloomPass){bloomPass=new A.UnrealBloomPass(new T.Vector2(1,1),.6,.45,1.15);composer.addPass(bloomPass);}
      if(A.ShaderPass){gradePass=new A.ShaderPass(gradeShader);composer.addPass(gradePass);}
      if(A.SMAAPass){smaaPass=new A.SMAAPass();composer.addPass(smaaPass);}
      composer.addPass(new A.OutputPass());
    }
    let width=0,height=0,elapsed=0,trauma=0,hurt=0,disposed=false,frameId=0;
    const camTarget=new T.Vector3(0,0,0),look=new T.Vector3();
    let observer=null;
    function resize(){
      if(disposed)return;
      const w=Math.max(1,canvas.clientWidth||canvas.parentElement?.clientWidth||window.innerWidth||960);
      const h=Math.max(1,canvas.clientHeight||canvas.parentElement?.clientHeight||window.innerHeight||600);
      const ratio=cfg.quality==='low'?1:Math.min(window.devicePixelRatio||1,cfg.quality==='high'?2:1.5);
      if(w!==width||h!==height||renderer.getPixelRatio()!==ratio){
        width=w;height=h;renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);
        if(composer){composer.setPixelRatio(ratio);composer.setSize(w,h);}
        camera.aspect=w/h;camera.updateProjectionMatrix();
        if(gradePass)gradePass.uniforms.uSize.value.set(w*ratio,h*ratio);
      }
    }
    if(typeof ResizeObserver!=='undefined'&&canvas.parentElement){observer=new ResizeObserver(resize);observer.observe(canvas.parentElement);}
    window.addEventListener('resize',resize);resize();
    function setSettings(partial){Object.assign(cfg,partial||{});cfg.quality=['low','medium','high'].includes(cfg.quality)?cfg.quality:'medium';
      renderer.shadowMap.enabled=cfg.quality!=='low';key.castShadow=cfg.quality!=='low';
      key.shadow.mapSize.set(cfg.quality==='high'?2048:1024,cfg.quality==='high'?2048:1024);
      if(key.shadow.map){key.shadow.map.dispose();key.shadow.map=null;}
      if(aoPass)aoPass.enabled=cfg.quality==='high';
      if(bloomPass)bloomPass.enabled=!!cfg.bloom;
      if(smaaPass)smaaPass.enabled=cfg.quality!=='low';
      resize();
    }
    setSettings({});
    function pulseLight(x,z,color,power=1){let slot=blastLights[0];for(const b of blastLights)if(b.t<slot.t)slot=b;
      slot.t=.28*power;slot.light.position.set(x,2,z);slot.light.color.set(color);slot.light.intensity=70*power;}
    const muzzleFlash=mesh(sphere,M(glow(C.cyan,.9)),scene);muzzleFlash.visible=false;
    const levelColumn=mesh(cylinder,M(glow(C.cyan,.32)),scene);levelColumn.scale.set(1.5,5,1.5);levelColumn.position.y=2.5;levelColumn.visible=false;
    let muzzleTime=0,levelTime=0;
    const bursts=[],burstPool=[];
    function burst(x,z,color,radius){
      let v=burstPool.pop();if(!v){
        const root=new T.Group();scene.add(root);
        const wave=floorRing(root,M(glow(C.cyan,.8)),1,.14);
        const shards=[];for(let i=0;i<6;i++){const s=mesh(round,M(glow(C.cyan,.8)),root);s.scale.set(.28,.24,.4);shards.push(s);}
        v={root,wave,shards};
      }
      v.root.visible=true;v.root.position.set(x,0,z);v.t=1;v.radius=radius;
      v.wave.material.color.set(color);for(const s of v.shards)s.material.color.set(color);
      bursts.push(v);
    }
    function updateBursts(dt){
      for(let i=bursts.length-1;i>=0;i--){const v=bursts[i];v.t-=dt;
        const p=1-clamp(v.t,0,1);v.wave.scale.setScalar(v.radius*(.15+p*2));
        v.wave.material.opacity=Math.max(0,1-p*2.6)*.85;
        for(let j=0;j<v.shards.length;j++){const a=j*TAU/v.shards.length,s=v.shards[j];
          const y=1.2+7*p-18*p*p;
          s.position.set(Math.cos(a)*v.radius*p,Math.max(.17,y<0?(-y)*.22:.17+y),Math.sin(a)*v.radius*p);
          s.rotation.set(p*12,a+p*8,p*7);s.material.opacity=(1-p)*.9;
        }
        if(v.t<=0){v.root.visible=false;burstPool.push(v);bursts.splice(i,1);}
      }
    }
    function handleEvents(frame){for(const ev of frame.events||[]){
      if(ev.type==='start'){
        for(const v of enemyMap.values())releaseEnemy(v);enemyMap.clear();
        for(const v of retired)releaseEnemy(v);retired.length=0;
        for(const [e,v] of effects){v.object.visible=false;effectPool[v.type].push(v);}effects.clear();
        for(const v of bursts){v.root.visible=false;burstPool.push(v);}bursts.length=0;trauma=0;
      }else if(ev.type==='shake'){if(cfg.shake&&!cfg.reducedMotion)trauma=clamp(trauma+ev.power*.65,0,1);}
      else if(ev.type==='hurt'){hurt=ev.guard?.3:1;}
      else if(ev.type==='kill'){
        pulseLight(wx(ev.x,arena.w),wz(ev.y,arena.h),ev.boss?C.red:ev.elite?C.amber:C.violet,ev.boss?2:1);
        burst(wx(ev.x,arena.w),wz(ev.y,arena.h),ev.boss?C.red:ev.elite?C.amber:C.violet,ev.boss?5:2.3);
        if(ev.boss&&!cfg.reducedMotion)trauma=Math.max(trauma,.8);
      }else if(ev.type==='spawn'){
        let best=null,dist=Infinity;for(const p of portGroups){const dx=p.group.position.x-wx(ev.x,arena.w),dz=p.group.position.z-wz(ev.y,arena.h),d=dx*dx+dz*dz;if(d<dist){dist=d;best=p;}}
        if(best&&dist<160)best.t=.65;
        burst(wx(ev.x,arena.w),wz(ev.y,arena.h),ev.boss?C.red:ev.elite?C.amber:C.violet,ev.boss?3:1.6);
      }else if(ev.type==='levelup'){pulseLight(currentPlayer.root.position.x,currentPlayer.root.position.z,C.cyan,1.4);burst(currentPlayer.root.position.x,currentPlayer.root.position.z,C.cyan,3);levelColumn.position.set(currentPlayer.root.position.x,3,currentPlayer.root.position.z);levelColumn.visible=true;levelTime=.7;}
      else if(ev.type==='cast'){const x=wx(ev.x,arena.w),z=wz(ev.y,arena.h);pulseLight(x,z,C.cyan,.7);muzzleFlash.position.set(x,2,z);muzzleFlash.visible=true;muzzleTime=.12;}
    }}
    function syncEnemies(frame,dt){
      for(const v of enemyMap.values())v.seen=false;
      let frostCount=0,shadowCount=0,droneRingCount=0,hunterRingCount=0;
      const px=wx(frame.player?.x||arena.w/2,arena.w),pz=wz(frame.player?.y||arena.h/2,arena.h);
      for(const e of frame.enemies||[]){
        let v=enemyMap.get(e);const type=e.boss?'boss':e.elite?'elite':e.hunter?'hunter':'drone';
        if(!v){v=takeEnemy(type);v.spawn=.32;v.dead=0;v.history=null;enemyMap.set(e,v);}v.seen=true;v.root.visible=true;
        const x=wx(e.x,arena.w),z=wz(e.y,arena.h),a=Math.atan2(x-px,z-pz);
        v.root.position.set(x,0,z);v.root.rotation.y=lerp(v.root.rotation.y,a,smooth(12,dt));
        const scale=1.35*(e.r||14)/(e.boss?31:14)*(e.boss?(frame.wave>=10?1.22:frame.wave>=5?1.08:1):1);
        v.spawn=Math.max(0,v.spawn-dt);const pop=1-v.spawn/.32;
        v.root.scale.setScalar(scale*clamp(pop,0.03,1));
        v.ground.scale.setScalar((e.r||14)/10/Math.max(scale*clamp(pop,0.03,1),.01));
        if(type==='drone'||type==='hunter'){
          const radius=(e.r||14)/10,visibleScale=scale*clamp(pop,0.03,1);
          DUMMY.rotation.set(-HALF,0,0);
          if(shadowCount<256){DUMMY.position.set(x,.035,z);DUMMY.scale.set(2.6*visibleScale,2.6*visibleScale,1);
            DUMMY.updateMatrix();footprintShadow.setMatrixAt(shadowCount++,DUMMY.matrix);}
          const inst=type==='drone'?footprintDrone:footprintHunter;
          const index=type==='drone'?droneRingCount++:hunterRingCount++;
          if(index<256){DUMMY.position.set(x,.07,z);DUMMY.scale.set(radius,radius,1);
            DUMMY.updateMatrix();inst.setMatrixAt(index,DUMMY.matrix);}
        }
        v.tilt.position.y=(type==='drone'||type==='hunter'?0:.09)+Math.sin(elapsed*3+x)*.1;
        if(v.rotating){v.rotating.rotation.y+=dt*(type==='boss'?.23:type==='hunter'?.78:1.15);
          v.rotating.position.y=Math.sin(elapsed*(type==='boss'?1.3:2.7)+x)*.09;}
        if(v.petals){v.petals.rotation.y+=dt*.7;v.petals.scale.setScalar(1+Math.sin(elapsed*3+x)*.07);}
        if(v.secondRing){v.secondRing.rotation.x+=dt*.38;v.secondRing.rotation.y-=dt*.44;}
        if(v.crown){v.crown.visible=frame.wave>=10;
          v.crown.scale.setScalar(1+Math.sin(elapsed*1.9)*.028);v.crown.rotation.y-=dt*.13;}
        if(v.secondRing)v.secondRing.visible=frame.wave>=5;
        if(v.pylons)v.pylons.visible=frame.wave>=5;
        if(v.trail){
          v.trail.visible=true;
          if(!v.history){v.history=new Float32Array(32);for(let i=0;i<16;i++){v.history[i*2]=x;v.history[i*2+1]=z;}}
          for(let i=15;i>0;i--){v.history[i*2]=v.history[(i-1)*2];v.history[i*2+1]=v.history[(i-1)*2+1];}
          v.history[0]=x;v.history[1]=z;
          const pa=v.trail.geometry.attributes.position,ca=v.trail.geometry.attributes.color;
          for(let i=0;i<16;i++){const k=i*2,hx=v.history[k],hz=v.history[k+1],next=Math.min(15,i+1)*2;
            const dx=v.history[next]-hx,dz=v.history[next+1]-hz,inv=1/Math.max(.001,Math.hypot(dx,dz)),wide=(1-i/16)*.75;
            const ox=-dz*inv*wide,oz=dx*inv*wide;
            const ty=v.model?1.05:2.12;pa.setXYZ(k,hx-ox,ty,hz-oz);pa.setXYZ(k+1,hx+ox,ty,hz+oz);
            const alpha=(1-i/16)*.55;ca.setXYZW(k,.85,.32,1,alpha);ca.setXYZW(k+1,.85,.32,1,alpha);}
          pa.needsUpdate=true;ca.needsUpdate=true;
        }
        if(v.legs){const speed=Math.hypot(e.vx||0,e.vy||0);v.phase+=dt*(2.5+speed*.02);
          for(let i=0;i<2;i++){const step=Math.sin(v.phase+i*Math.PI);
            v.legs[i].rotation.x=step*.28;
            if(v.knees)v.knees[i].rotation.x=Math.max(0,-step)*.42;}}
        const frozen=e.slowUntil>frame.time;v.body.material=frozen?mIce:unitMats[type].shell;v.flash.visible=e.hit>0;
        if(frozen)for(let i=0;i<3&&frostCount<256;i++){const a=elapsed*3+i*TAU/3,rad=(e.r||14)/10;
          putInstance(frost,frostCount++,x+Math.cos(a)*rad,1.1+Math.sin(elapsed*5+i)*.35,z+Math.sin(a)*rad,.09,.09,.09,C.ice);}
        if(type==='boss'){let charging=false;for(const z of frame.zones||[])if(z.source===e){charging=true;break;}
          const charge=charging?1.27:.92+Math.sin(elapsed*2)*.04;v.eye.scale.set(charge,.42*charge,charge);
          if(v.secondRing)v.secondRing.scale.setScalar(charging?1.08:1);}
        if(v.bar){const fraction=clamp((e.hp||0)/(e.max||1),0,1);v.bar.fill.scale.x=fraction;
          v.bar.fill.position.x=-(1-fraction)*v.bar.full/2;v.bar.back.quaternion.copy(camera.quaternion);v.bar.fill.quaternion.copy(camera.quaternion);}
        if(v.model){
          const n=v.nodes,live=frame.state==='running'?dt:0;
          if(type==='elite'){
            const moved=v.lastX===undefined?0:Math.hypot(x-v.lastX,z-v.lastZ)/Math.max(dt,1e-3);v.lastX=x;v.lastZ=z;
            animateModel(v,live,moved/5,!!(e.aim&&e.aim.time<.1),0);
          }else if(type==='boss'){
            let charging=false;for(const zone of frame.zones||[])if(zone.source===e){charging=true;break;}
            n.Star?.rotateY(live*.2);n.StarOuter?.rotateY(-live*.13);n.Ring1?.rotateY(live*.55);n.Ring2?.rotateY(-live*.4);
            if(n.Core)n.Core.scale.setScalar(charging?1.3:1+Math.sin(elapsed*2.2)*.05);
            if(n.Pylons)n.Pylons.visible=frame.wave>=5;
            if(n.StarOuter)n.StarOuter.visible=frame.wave>=10;
            if(n.Crown)n.Crown.visible=frame.wave>=10;
          }else{
            n.Body?.rotateY(live*(type==='hunter'?0:1.1));n.Petals?.rotateY(-live*.7);
            if(n.Core)n.Core.scale.setScalar(1+Math.sin(elapsed*4+x)*.12);
          }
          if(v.flashMats){const on=e.hit>0;for(const m of v.flashMats)m.emissiveIntensity=on?.45:0;}
        }
        if(v.aim){v.aim.visible=!!e.aim;if(e.aim){v.aim.material.uniforms.uPower.value=1-clamp(e.aim.time/.57,0,1);v.aim.material.uniforms.uTime.value=elapsed;}}
      }
      for(const [e,v] of enemyMap)if(!v.seen){enemyMap.delete(e);v.dead=.22;if(v.trail)v.trail.visible=false;retired.push(v);}
      for(let i=retired.length-1;i>=0;i--){const v=retired[i];v.dead-=dt;v.root.scale.multiplyScalar(Math.max(.01,1-dt*12));
        v.root.rotation.y+=dt*8;if(v.dead<=0){releaseEnemy(v);retired.splice(i,1);}}
      frost.count=frostCount;frost.instanceMatrix.needsUpdate=true;if(frost.instanceColor)frost.instanceColor.needsUpdate=true;
      footprintShadow.count=shadowCount;footprintDrone.count=Math.min(droneRingCount,256);
      footprintHunter.count=Math.min(hunterRingCount,256);
      footprintShadow.instanceMatrix.needsUpdate=true;footprintDrone.instanceMatrix.needsUpdate=true;
      footprintHunter.instanceMatrix.needsUpdate=true;
    }
    function syncPlayer(frame,dt){
      const p=frame.player;if(!p){currentPlayer.root.visible=false;dome.visible=false;return;}
      const type=playerModels[frame.classId]?frame.classId:'ranger';
      if(currentPlayer!==playerModels[type])currentPlayer.root.visible=false;
      currentPlayer=playerModels[type];const v=currentPlayer;v.root.visible=true;
      const x=wx(p.x,arena.w),z=wz(p.y,arena.h),heading=(p.angle||0)-HALF;
      v.root.position.set(x,0,z);v.root.rotation.y=lerp(v.root.rotation.y,-HALF-heading,smooth(18,dt));
      v.root.scale.setScalar(1.35);
      v.ground.scale.setScalar((p.r||14)/13.5);
      const speed=Math.hypot(p.vx||0,p.vy||0);
      v.phase+=dt*(1.6+speed*.033);
      v.tilt.position.y=.11+Math.sin(v.phase*2)*(.035+Math.min(speed/1200,.11));
      v.tilt.position.z=p.recoilUntil>frame.time?.32:0;
      v.tilt.rotation.z=lerp(v.tilt.rotation.z,clamp((p.vx||0)/500,-.17,.17),smooth(9,dt));
      v.tilt.rotation.x=lerp(v.tilt.rotation.x,clamp((p.vy||0)/500,-.16,.16),smooth(9,dt));
      v.body.material=unitMats[type].shell;v.flash.visible=p.inv>0&&Math.floor(elapsed*16)%2===0;
      if(v.legs){const swing=Math.min(.5,speed/360);for(let i=0;i<2;i++){v.legs[i].rotation.x=Math.sin(v.phase+i*Math.PI)*swing;
        v.legs[i].rotation.z=Math.max(0,Math.cos(v.phase+i*Math.PI))*.12*swing;
        if(v.knees)v.knees[i].rotation.x=Math.max(0,-Math.sin(v.phase+i*Math.PI))*.5*swing;}}
      if(v.arms)for(let i=0;i<2;i++)v.arms[i].rotation.x=Math.sin(v.phase+i*Math.PI+Math.PI)*Math.min(.2,speed/1100);
      v.upper.rotation.y=lerp(v.upper.rotation.y,p.recoilUntil>frame.time?(p.recoilAngle||0)*.22:0,smooth(12,dt));
      if(Array.isArray(v.thrust))for(let i=0;i<v.thrust.length;i++){
        const t=v.thrust[i];t.scale.setScalar(.78+speed/550+Math.sin(elapsed*17+i*2.1)*.08);}
      v.ground.rotation.z+=dt*.22;
      if(v.model){
        // Blender rig drives the body; keep only a light lean and a short recoil kick from the procedural motion.
        v.tilt.position.y=0;v.tilt.position.z=p.recoilUntil>frame.time?.12:0;
        const firing=p.recoilUntil>frame.time;
        let diff=0;
        if(firing&&speed>20)diff=(((p.recoilAngle||0)-heading)%TAU+TAU*1.5)%TAU-Math.PI;
        v.twist=lerp(v.twist||0,clamp(-diff,-.9,.9),smooth(14,dt));
        const live=frame.state==='running'||frame.state==='title'||frame.state==='menu'||frame.state==='master';
        animateModel(v,live?dt:0,speed/190,firing,v.twist);
        if(v.flashMats){const on=p.inv>0&&Math.floor(elapsed*16)%2===0;for(const m of v.flashMats)m.emissiveIntensity=on?.4:0;}
      }
      playerLight.position.set(x,2.2,z);playerLight.color.set(frame.classColor||'#59e7ff');
      dome.visible=!!(p.guardUntil>frame.time);dome.position.set(x,1.3,z);
      const orb=frame.orbit;for(let i=0;i<orbitMeshes.length;i++){
        const b=orbitMeshes[i];b.visible=!!orb&&i<orb.count;if(!b.visible)continue;
        const a=frame.time*2.8+i*TAU/orb.count,r=orb.radius/10;
        b.position.set(x+Math.cos(a)*r,1.1,z+Math.sin(a)*r);b.rotation.set(.5,-a,0);b.scale.set(.85,1.05,.85);
      }
    }
    function syncBullets(frame){
      let n=0,s=0;const friendly=bullets.friendly,streak=bullets.streak,halo=bullets.halo;
      for(const b of frame.bullets||[]){if(n>=512)break;const x=wx(b.x,arena.w),z=wz(b.y,arena.h),vel=Math.hypot(b.vx||0,b.vy||0),angle=Math.atan2(b.vx||0,b.vy||0),r=Math.max(.14,(b.r||4)/10);
        putInstance(friendly,n,x,.9,z,r,r,r,b.color||C.cyan);
        putInstance(halo,n,x,.9,z,r*2.5,r*2.5,r*2.5,b.color||C.cyan);n++;
        putStreak(streak,s,x-(b.vx||0)/Math.max(vel,1)*.5,.9,z-(b.vy||0)/Math.max(vel,1)*.5,b.vx||0,b.vy||-1,.75+vel/550,r*.45,b.color||C.cyan);s++;
      }
      friendly.count=n;halo.count=n;streak.count=s;friendly.instanceMatrix.needsUpdate=true;halo.instanceMatrix.needsUpdate=true;streak.instanceMatrix.needsUpdate=true;
      if(friendly.instanceColor)friendly.instanceColor.needsUpdate=true;
      if(halo.instanceColor)halo.instanceColor.needsUpdate=true;
      if(streak.instanceColor)streak.instanceColor.needsUpdate=true;
      n=0;s=0;for(const b of frame.hostileShots||[]){if(n>=512)break;
        const x=wx(b.x,arena.w),z=wz(b.y,arena.h),vel=Math.hypot(b.vx||0,b.vy||0);
        putInstance(bullets.hostile,n++,x,.2,z,.25,.25,.25,C.orange);
        putStreak(bullets.hostileStreak,s++,x-(b.vx||0)/Math.max(vel,1)*.26,.2,
          z-(b.vy||0)/Math.max(vel,1)*.26,b.vx||0,b.vy||-1,.52,.055,C.orange);
      }
      bullets.hostile.count=n;bullets.hostileHalo.count=0;bullets.hostileStreak.count=s;
      bullets.hostile.instanceMatrix.needsUpdate=true;bullets.hostileHalo.instanceMatrix.needsUpdate=true;bullets.hostileStreak.instanceMatrix.needsUpdate=true;
      if(bullets.hostileHalo.instanceColor)bullets.hostileHalo.instanceColor.needsUpdate=true;
    }
    function updateCamera(frame,dt){
      const aspect=width/height, fov=camera.fov*Math.PI/180,pitch=50*Math.PI/180;
      const full=cfg.follow===false||!frame.player;
      const widthNeeded=full?worldW*1.07:aspect<1?worldH*aspect:55*(frame.bossActive?1.15:1);
      const heightNeeded=full?worldH*1.23:aspect<1?worldH*1.08:0;
      const dist=Math.max(widthNeeded/(2*Math.tan(fov/2)*aspect),heightNeeded*Math.sin(pitch)/(2*Math.tan(fov/2)));
      let tx=0,tz=0;if(!full&&frame.player){
        const p=frame.player,speed=Math.hypot(p.vx||0,p.vy||0),lead=Math.min(5,speed/45);
        tx=wx(p.x,arena.w)+(speed>1?(p.vx/speed)*lead:0);
        tz=wz(p.y,arena.h)+(speed>1?(p.vy/speed)*lead:0);
        if(frame.bossActive){for(const e of frame.enemies){if(!e.boss||e.hp<=0)continue;
          tx=lerp(tx,wx(e.x,arena.w),.35);tz=lerp(tz,wz(e.y,arena.h),.35);break;}}
        const margin=aspect<1?4:widthNeeded*.49;
        tx=clamp(tx,-worldW/2+margin,worldW/2-margin);
        tz=clamp(tz,-worldH/2+15,worldH/2-15);
      }
      camTarget.x=lerp(camTarget.x,tx,smooth(5,dt));camTarget.z=lerp(camTarget.z,tz,smooth(5,dt));
      const idle=frame.state==='title'||frame.state==='menu'||frame.state==='master';
      const orbit=idle&&!cfg.reducedMotion?Math.sin(elapsed*.18)*.12:0;
      let sx=0,sy=0,sz=0;if(trauma>0&&cfg.shake&&!cfg.reducedMotion){const power=trauma*trauma; sx=(Math.random()-.5)*power*2;sy=(Math.random()-.5)*power;sz=(Math.random()-.5)*power*2;}
      camera.position.set(camTarget.x+Math.sin(orbit)*dist*.4+sx,Math.sin(pitch)*dist+sy,camTarget.z+Math.cos(pitch)*dist+sz);
      look.set(camTarget.x,0,camTarget.z);camera.lookAt(look);
    }
    function render(frame){
      if(disposed||!frame||document.hidden)return;
      const dt=clamp(frame.dt||0,0,.05);elapsed+=dt;frameId++;
      unitMats.drone.line.emissiveIntensity=2.1+Math.sin(elapsed*4.2)*.4;
      unitMats.hunter.line.emissiveIntensity=2.3+Math.sin(elapsed*5.1)*.3;
      resize();handleEvents(frame);syncPlayer(frame,dt);syncEnemies(frame,dt);
      syncBullets(frame);syncZones(frame,elapsed);syncEffects(frame,dt);
      updateBursts(dt);
      for(const v of scorch)if(v.age>0){v.age-=dt;v.mark.material.opacity=clamp(v.age/6,0,1)*.62;if(v.age<=0)v.mark.visible=false;}
      for(const p of portGroups){p.t=Math.max(0,p.t-dt);p.flare.visible=p.t>0;if(p.t>0){p.flare.scale.setScalar(2.9+(1-p.t/.65)*2);p.group.rotation.y+=dt*1.7;}
        const open=p.t>0?Math.sin(Math.PI*clamp(p.t/.65,0,1))*1.2:0;
        for(let i=0;i<4;i++){const a=i*HALF;p.leaves[i].position.x=Math.cos(a)*(.62+open);p.leaves[i].position.z=Math.sin(a)*(.62+open);}}
      for(const b of blastLights){b.t=Math.max(0,b.t-dt);b.light.intensity=b.t>0?70*b.t/.28:0;}
      trauma=Math.max(0,trauma-dt*1.7);hurt=Math.max(0,hurt-dt*2.3);
      core.material=frame.bossActive?mRed:mCyan;coreRing.rotation.y+=dt*.22;
      bossLight.intensity=frame.bossActive?38:0;
      for(const e of frame.enemies||[])if(e.boss){bossLight.position.set(wx(e.x,arena.w),4,wz(e.y,arena.h));break;}
      if(muzzleTime>0){muzzleTime-=dt;muzzleFlash.scale.setScalar(1+muzzleTime*12);muzzleFlash.material.opacity=clamp(muzzleTime/.12,0,1);}else muzzleFlash.visible=false;
      if(levelTime>0){levelTime-=dt;levelColumn.scale.y=5+(1-levelTime/.7)*10;levelColumn.material.opacity=levelTime/.7*.33;}else levelColumn.visible=false;
      dust.position.y=Math.sin(elapsed*.18)*.3;
      updateCamera(frame,dt);
      if(gradePass){gradePass.uniforms.uTime.value=elapsed;gradePass.uniforms.uHurt.value=hurt;
        gradePass.uniforms.uLow.value=frame.maxHp?clamp((.3-frame.hp/frame.maxHp)/.3,0,1)*(.7+.3*Math.sin(elapsed*5)):0;}
      if(composer)composer.render(dt);else renderer.render(scene,camera);
    }
    function dispose(){if(disposed)return;disposed=true;
      if(observer)observer.disconnect();window.removeEventListener('resize',resize);
      if(composer){for(const pass of composer.passes)if(pass.dispose)pass.dispose();composer.renderTarget1.dispose();composer.renderTarget2.dispose();}
      for(const v of enemyMap.values())releaseEnemy(v);
      for(const m of resources.materials)m.dispose();for(const g of resources.geometries)g.dispose();
      for(const t of resources.textures)t.dispose();if(env)env.dispose();if(pmrem)pmrem.dispose();
      scene.traverse(o=>{if(o.isInstancedMesh&&o.dispose)o.dispose();});
      renderer.dispose();
    }
    loadModels();
    return {setSettings,render,resize,dispose};
  }
  window.NeonRender3D={create};
})();
