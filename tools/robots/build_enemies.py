"""Deterministic procedural NEON CIRCUIT enemies. Blender 5.2 headless."""
import bpy, math, os, sys, json
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'out'); PRE = os.path.join(ROOT, 'preview')
os.makedirs(OUT, exist_ok=True); os.makedirs(PRE, exist_ok=True)
ONLY = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')), None)
PI = math.pi
LOWPOLY=False

def mat(name, hexval, metal=0, rough=.4, emit=0, coat=0):
    h=hexval.lstrip('#'); srgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
    m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=coat
    if emit: p.inputs['Emission Color'].default_value=(*c,1); p.inputs['Emission Strength'].default_value=emit
    return m

def materials(color):
    global M
    M={}
    for a in [('Armor','#1c242c',.85,.32,0,.3),('ArmorLight','#3a4652',.8,.36,0,0),
              ('Undersuit','#0c1116',.2,.75,0,0),('Metal','#8a949e',1,.22,0,0),
              ('Rubber','#0a0c0e',0,.6,0,0),('Glow',color,.12,.18,4,0),
              ('Visor',color,.1,.16,5,0),('Gold','#c8962e',1,.25,0,0),
              ('Crimson','#4a1018',.6,.35,0,0),('CrimsonPlate','#9a2635',.65,.30,0,.2)]: M[a[0]]=mat(*a)

def reset(color):
    global LOWPOLY
    LOWPOLY=color in ('#d66bff','#ef8dff')
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    materials(color)

def finish(o,name,material,bevel=0):
    o.name=name; o.data.materials.append(M[material])
    if bevel:
        b=o.modifiers.new('Machined edges','BEVEL'); b.width=bevel; b.segments=1 if LOWPOLY else 2; b.limit_method='ANGLE'
        b.angle_limit=.35
        n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True
    return o

def cube(name,loc,scale,material='Armor',bevel=.03,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot: o.rotation_euler=rot
    return finish(o,name,material,bevel)

def cyl(name,loc,r,depth,material='Metal',vertices=12,axis='Z',bevel=.015):
    bpy.ops.mesh.primitive_cylinder_add(vertices=min(vertices,8) if LOWPOLY else vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object
    if axis=='Y': o.rotation_euler[0]=PI/2
    if axis=='X': o.rotation_euler[1]=PI/2
    return finish(o,name,material,bevel)

def uvball(name,loc,scale,material='Metal',segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material)

def prism(name,points,z0,z1,material='Armor',bevel=.02):
    area=sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
    if area<0: points=list(reversed(points))
    n=len(points); vs=[(x,y,z) for z in (z0,z1) for x,y in points]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    fs += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],fs); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,name,material,bevel)

def beam(name,a,b,width,material='Metal',sides=8):
    a,b=Vector(a),Vector(b); d=b-a; mid=(a+b)/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=width,depth=d.length,location=mid)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return finish(o,name,material,.006 if width>.015 else 0)

def torus(name,loc,major,minor,material='Metal',major_segments=32,minor_segments=6):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments,minor_segments=minor_segments,
        location=loc,major_radius=major,minor_radius=minor)
    return finish(bpy.context.object,name,material)

def radial_point(r,a): return (r*math.sin(a),r*math.cos(a))
def parent_to(child,master):
    child.parent=master; child.matrix_parent_inverse=master.matrix_world.inverted()
def blade(name,ang,r0,r1,w0,w1,z0,z1,material='Armor',bevel=.025):
    u=Vector((math.sin(ang),math.cos(ang))); t=Vector((math.cos(ang),-math.sin(ang)))
    pts=[]
    for r,w,sgn in [(r0,w0,-1),(r1,w1,-1),(r1,w1,1),(r0,w0,1)]:
        v=u*r+t*w; pts.append((v.x,v.y))
    return prism(name,pts,z0,z1,material,bevel)

def diamond(name,loc,rx,ry,zdepth,material='Visor'):
    x,y,z=loc; return prism(name,[(x,y-ry),(x+rx,y),(x,y+ry),(x-rx,y)],z-zdepth/2,z+zdepth/2,material,.008)

def kite_points(angle,root,shoulder,tip,half_angle):
    """A broad four-sided pointed armour plate, with shoulders under the hub."""
    return [radial_point(root,angle), radial_point(shoulder,angle-half_angle),
            radial_point(tip,angle), radial_point(shoulder,angle+half_angle)]

def kite(name,angle,root,shoulder,tip,half_angle,z0,z1,material,bevel):
    return prism(name,kite_points(angle,root,shoulder,tip,half_angle),z0,z1,material,bevel)

def shaped_hull(name,front_y,back_y,front_half,back_half,bottom_z,top_z,material,bevel=.03):
    """Wedge with a narrower lower waist and broad plated shoulders."""
    lower=[(-front_half*.68,front_y), (front_half*.68,front_y),
           (back_half*.72,back_y),(-back_half*.72,back_y)]
    upper=[(-front_half,front_y), (front_half,front_y),
           (back_half,back_y),(-back_half,back_y)]
    vs=[(x,y,bottom_z) for x,y in lower]+[(x,y,top_z) for x,y in upper]
    faces=[(3,2,1,0),(4,5,6,7)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,name,material,bevel)

def drone():
    reset('#d66bff')
    cyl('Body',(0,0,.69),.30,.20,'Armor',8,.025)
    cyl('body armature rim',(0,0,.81),.27,.055,'ArmorLight',8)
    for i in range(4):
        a=i*PI/2
        kite('Petals' if i==0 else 'Petals.%03d'%i,a,.16,.43,.86,math.radians(18),.60,.78,'Armor',.03)
        kite('raised blade ridge',a,.28,.47,.79,math.radians(10),.78,.87,'ArmorLight',.012)
        pts=kite_points(a,.16,.43,.86,math.radians(18))
        for side in (1,3):
            p,q=Vector((*pts[side],.803)),Vector((*pts[2],.803))
            beam('magenta leading edge',p,q,.012,'Glow',6)
        p=radial_point(.44,a)
        cyl('blade pivot',(p[0],p[1],.89),.033,.025,'Metal',8)
    # An eight-faced crystal reads as a gem even without bloom.
    verts=[(0,0,1.05),(0,0,.74),(-.16,0,.89),(0,-.29,.89),(.16,0,.89),(0,.29,.89)]
    faces=[(0,2+i,2+(i+1)%4) for i in range(4)]+[(1,2+(i+1)%4,2+i) for i in range(4)]
    mesh=bpy.data.meshes.new('Core'); mesh.from_pydata(verts,[],faces); mesh.update()
    core=bpy.data.objects.new('Core',mesh); bpy.context.collection.objects.link(core); finish(core,'Core','Visor')
    torus('gem socket',(0,0,.85),.27,.035,'Armor',16,4)
    for a in (PI/4,3*PI/4,5*PI/4,7*PI/4):
        x,y=radial_point(.25,a); cyl('core bolt',(x,y,.865),.021,.022,'Metal',8)
    cyl('underside thruster',(0,0,.58),.17,.04,'Glow',12)
    petal=bpy.data.objects['Petals']
    for o in bpy.data.objects:
        if o.name.startswith(('Petals.','raised blade','magenta leading','blade pivot')): parent_to(o,petal)

def hunter():
    reset('#ef8dff')
    # Spear nose points -Y, broad rear mantle and swept split wing blades.
    prism('Body',[(-.22,.7),(.22,.7),(.39,.10),(.17,-.67),(0,-1.42),(-.17,-.67),(-.39,.10)],.55,.78,'Armor',.035)
    prism('upper spine',[(-.12,.57),(.12,.57),(.22,-.17),(0,-1.18),(-.22,-.17)],.79,.89,'ArmorLight',.018)
    prism('nose lance',[(-.07,-.54),(.07,-.54),(.015,-1.34),(-.015,-1.34)],.85,.94,'Metal',.01)
    for s in (-1,1):
        pts=[(s*.20,.43),(s*.66,.51),(s*1.26,.08),(s*1.19,-.19),(s*.76,-.30),(s*.35,-.55)]
        prism('Wings' if s<0 else 'Wings.R',pts,.57,.72,'Armor',.025)
        prism('wing upper shell',[(s*.35,.38),(s*.68,.37),(s*1.18,-.02),(s*.70,-.14),(s*.41,-.37)],.72,.8,'ArmorLight',.018)
        beam('wing leading edge',(s*.23,.42,.81),(s*1.21,.03,.75),.03,'Metal')
        beam('wing luminous slash',(s*.51,.29,.815),(s*1.10,-.035,.786),.013,'Glow',6)
        cube('intake',(s*.39,.05,.8),(.06,.25,.09),'Rubber',.01)
        for j in range(3):
            cube('vent fin',(s*(.39+j*.047),.05,.855),(.019,.2,.018),'Metal',.003)
        cyl('wing hinge',(s*.36,.36,.67),.08,.09,'Metal',10)
        cyl('aft thruster',(s*.37,.62,.66),.105,.07,'ArmorLight',12,'Y')
        cyl('thruster light',(s*.37,.667,.66),.062,.009,'Glow',12,'Y')
    diamond('canopy eye',(0,-.42,.925),.10,.29,.018,'Visor')
    cube('rear engine housing',(0,.57,.68),(.42,.27,.15),'ArmorLight',.025)
    for x in (-.13,0,.13): cube('engine grate',(x,.725,.71),(.045,.015,.085),'Metal',.004)
    wing=bpy.data.objects['Wings']
    for o in bpy.data.objects:
        if o.name.startswith(('Wings.','wing upper','wing leading','wing luminous','wing hinge','intake','vent fin','aft thruster','thruster light')): parent_to(o,wing)

def boss():
    reset('#ff3050')
    # A continuous, filled eight-pointed star; variants remain separate controls.
    z=2.1
    cyl('Base',(0,0,z-.23),1.04,.44,'Armor',24,.055)
    cyl('base rear armor',(0,0,z-.49),.72,.13,'Crimson',16)
    for i in range(8):
        a=i*PI/4
        length=3.38 if i%2==0 else 2.67
        kite('Star' if i==0 else 'Star.%03d'%i,a,.66,1.33,length,math.radians(21),z-.30,z+.25,'Crimson',.055)
        kite('blade upper armour',a,.88,1.41,length-.18,math.radians(14),z+.25,z+.35,'CrimsonPlate',.024)
        kite('blade central keel',a,.96,1.47,length-.30,math.radians(5),z+.35,z+.46,'Armor',.022)
        pts=kite_points(a,.66,1.33,length,math.radians(21))
        for side in (1,3):
            beam('gold perimeter',(*pts[side],z+.30),(*pts[2],z+.30),.034,'Gold',6)
        beam('red groove',(*radial_point(1.13,a),z+.475),(*radial_point(length-.39,a),z+.475),.025,'Glow',6)
        # Two recessed inset slots and tiny fasteners make the large plates legible from above.
        for r in (1.65,2.05):
            if r < length-.45:
                x,y=radial_point(r,a); cyl('keel fastener',(x,y,z+.48),.027,.025,'Gold',8)
        x,y=radial_point(length-.25,a)
        cyl('blade tip socket',(x,y,z+.35),.055,.025,'Gold',8)
    cyl('hub outer armour',(0,0,z+.24),1.18,.18,'Armor',24,.035)
    torus('Ring1',(0,0,z+.38),1.06,.075,'Gold',48,8)
    torus('Ring2',(0,0,z-.19),1.29,.05,'ArmorLight',48,8)
    for i in range(8):
        a=(i+.5)*PI/4; x,y=radial_point(1.0,a)
        cube('Ring2 teeth',(x,y,z-.12),(.19,.12,.13),'Gold',.018,rot=(0,0,-a))
    cyl('core socket',(0,0,z+.39),.67,.13,'Undersuit',24,.02)
    torus('core gold bezel',(0,0,z+.49),.51,.06,'Gold',32,8)
    uvball('Core',(0,0,z+.48),(.42,.42,.18),'Visor',24,12)
    torus('eye iris',(0,0,z+.60),.26,.025,'Crimson',24,6)
    for i in range(12):
        a=i*PI/6; x,y=radial_point(.83,a)
        cube('radial vent',(x,y,z+.345),(.07,.21,.024),'Rubber',.003,rot=(0,0,-a))
    # Two separate wave variants; hidden only in preview, exported as meshes.
    for i in range(4):
        a=(i+.5)*PI/2; x,y=radial_point(3.75,a)
        o=cyl('Pylons' if i==0 else 'Pylons.%03d'%i,(x,y,z),.23,.6,'Armor',8,.025)
        cyl('pylon face',(x,y,z+.34),.13,.04,'Glow',8)
    for i in range(8):
        a=(i+.5)*PI/4
        kite('StarOuter' if i==0 else 'StarOuter.%03d'%i,a,2.53,2.91,3.86,math.radians(8),z-.24,z-.08,'Crimson',.019)
    cyl('Crown',(0,0,z+.52),.59,.09,'Gold',16,.016)
    for i in range(8):
        a=i*PI/4
        blade('crown rays',a,.4,.78,.08,.008,z+.53,z+.58,'Gold',.01)
    groups=[('Star',('Star.','blade upper','blade central','gold perimeter','red groove','keel fastener','blade tip')),
            ('Ring2',('Ring2 teeth',)),('Core',('eye pupil','eye iris')),
            ('Pylons',('Pylons.','pylon face')),
            ('StarOuter',('StarOuter.',)),('Crown',('crown rays',))]
    for master_name,prefixes in groups:
        master=bpy.data.objects[master_name]
        for o in bpy.data.objects:
            if o!=master and o.name.startswith(prefixes): parent_to(o,master)
    for o in bpy.data.objects:
        if o.name.startswith(('Pylons','pylon face','StarOuter','Crown','crown rays')): o.hide_render=True

def rig_elite():
    arm=bpy.data.armatures.new('RigData'); rig=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    bones={
      'root':((0,0,.05),(0,0,.20),None),'hips':((0,0,.55),(0,0,.82),'root'),
      'spine':((0,0,.82),(0,0,1.34),'hips'),'chest':((0,0,1.34),(0,0,1.83),'spine'),
      'neck':((0,-.08,1.83),(0,-.08,1.99),'chest'),'head':((0,-.08,1.99),(0,-.08,2.30),'neck'),
      'shoulder.L':((-.52,0,1.74),(-.73,0,1.71),'chest'),
      'upper_arm.L':((-.73,0,1.71),(-.93,-.04,1.33),'shoulder.L'),
      'forearm.L':((-.93,-.04,1.33),(-.92,-.22,1.11),'upper_arm.L'),
      'hand.L':((-.92,-.22,1.11),(-.92,-.31,1.03),'forearm.L'),
      'shoulder.R':((.52,0,1.74),(.73,0,1.71),'chest'),
      'upper_arm.R':((.73,0,1.71),(.93,-.04,1.33),'shoulder.R'),
      'forearm.R':((.93,-.04,1.33),(.92,-.22,1.11),'upper_arm.R'),
      'hand.R':((.92,-.22,1.11),(.92,-.31,1.03),'forearm.R'),
    }
    for s in ('L','R'):
        x=-.37 if s=='L' else .37
        bones['thigh.'+s]=((x,0,.78),(x,-.04,.47),'hips')
        bones['shin.'+s]=((x,-.04,.47),(x,-.10,.16),'thigh.'+s)
        bones['foot.'+s]=((x,-.10,.16),(x,-.32,.10),'shin.'+s)
    for name,(h,t,parent) in bones.items():
        b=arm.edit_bones.new(name); b.head=h; b.tail=t
        if parent: b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
    return rig

def skin(o,rig,bone):
    vg=o.vertex_groups.new(name=bone); vg.add(list(range(len(o.data.vertices))),1.0,'REPLACE')
    mod=o.modifiers.new('Rigid segment skin','ARMATURE'); mod.object=rig
    o.parent=rig
    return o

def elite():
    reset('#ffcf79'); rig=rig_elite()
    def C(*a,bone='chest',**kw): return skin(cube(*a,**kw),rig,bone)
    def Y(*a,bone='chest',**kw): return skin(cyl(*a,**kw),rig,bone)
    def B(*a,bone='chest',**kw): return skin(beam(*a,**kw),rig,bone)
    C('torso pressure vessel',(0,0,1.55),(.95,.52,.68),'Armor',.08)
    C('upper chest breastplate',(0,-.29,1.65),(.86,.12,.43),'ArmorLight',.04)
    for s in (-1,1):
        C('angled chest applique',(s*.32,-.372,1.76),(.27,.045,.20),'Armor',.018,rot=(0,0,s*.20))
        for j in range(3):
            C('chest heat sink',(s*(.34+j*.10),.29,1.69),(.038,.08,.34),'Metal',.007)
        for j in range(3):
            C('torso fastener',(s*.48,-.365,1.46+j*.13),(.028,.025,.028),'Gold',.004)
    Y('hex power core',(0,-.37,1.65),.30,.085,'Gold',6,'Y',.02)
    Y('core luminous hex',(0,-.42,1.65),.20,.017,'Visor',6,'Y',.006)
    Y('core inner emitter',(0,-.434,1.65),.09,.018,'Glow',6,'Y',.004)
    for s in (-1,1):
        label='L' if s<0 else 'R'
        C('waist housing',(s*.32,0,.82),(.27,.44,.27),'Armor',.035,bone='hips')
        Y('hip joint',(s*.37,0,.73),.15,.22,'Metal',12,'X',bone='hips')
        C('thigh armor',(s*.37,-.035,.61),(.29,.33,.39),'ArmorLight',.035,bone='thigh.'+label)
        C('thigh outer rail',(s*.54,-.045,.59),(.045,.26,.32),'Metal',.008,bone='thigh.'+label)
        C('knee cap',(s*.37,-.18,.45),(.24,.15,.18),'Gold',.025,bone='shin.'+label)
        Y('knee actuator',(s*.37,-.04,.47),.12,.24,'Metal',10,'X',bone='shin.'+label)
        C('shin armor',(s*.37,-.08,.29),(.25,.35,.35),'Armor',.035,bone='shin.'+label)
        C('shin illuminated inset',(s*.37,-.263,.28),(.035,.012,.20),'Glow',.003,bone='shin.'+label)
        B('hydraulic piston',(s*.52,-.16,.50),(s*.50,-.22,.20),.035,'Metal',bone='shin.'+label)
        C('splayed foot',(s*.37,-.26,.09),(.34,.52,.17),'ArmorLight',.025,bone='foot.'+label)
        for dx in (-.10,.10): C('toe talon',(s*.37+dx,-.52,.075),(.10,.18,.11),'Metal',.012,bone='foot.'+label)
        Y('shoulder bearing',(s*.69,0,1.69),.20,.22,'Metal',12,'X',bone='shoulder.'+label)
        C('shoulder guard',(s*.76,-.02,1.76),(.40,.50,.30),'Armor',.04,bone='shoulder.'+label)
        C('shoulder top plate',(s*.76,-.02,1.935),(.31,.38,.035),'ArmorLight',.009,bone='shoulder.'+label)
        for j in range(3): C('shoulder panel rib',(s*.76,-.14+j*.13,1.956),(.26,.018,.012),'Metal',.002,bone='shoulder.'+label)
        C('upper arm',(s*.86,-.01,1.48),(.28,.32,.38),'ArmorLight',.03,bone='upper_arm.'+label)
        Y('elbow joint',(s*.92,-.04,1.30),.11,.20,'Metal',10,'X',bone='forearm.'+label)
        C('forearm gun shroud',(s*.94,-.22,1.15),(.31,.51,.25),'Armor',.025,bone='forearm.'+label)
        C('gun top rail',(s*.94,-.26,1.29),(.12,.54,.035),'Gold',.007,bone='forearm.'+label)
        for dx in (-.075,.075):
            Y('twin barrel',(s*.94+dx,-.57,1.13),.045,.39,'Metal',10,'Y',bone='forearm.'+label)
            Y('barrel bore',(s*.94+dx,-.772,1.13),.029,.012,'Glow',10,'Y',bone='forearm.'+label)
        C('hand clamp',(s*.94,-.34,1.02),(.25,.21,.15),'Metal',.015,bone='hand.'+label)
        for k in range(3): C('side vent',(s*.78,-.27+k*.11,1.80),(.045,.055,.04),'Glow',.006,bone='shoulder.'+label)
    C('pelvis',(0,0,.77),(.62,.45,.25),'Armor',.04,bone='hips')
    C('neck collar',(0,-.05,1.98),(.47,.42,.20),'Armor',.035,bone='neck')
    C('helmet',(0,-.11,2.15),(.49,.48,.37),'ArmorLight',.04,bone='head')
    C('helmet brow',(0,-.38,2.20),(.43,.12,.10),'Armor',.018,bone='head')
    C('T visor vertical',(0,-.407,2.16),(.075,.015,.24),'Visor',.006,bone='head')
    C('T visor horizontal',(0,-.415,2.25),(.32,.018,.055),'Visor',.006,bone='head')
    for s in (-1,1):
        C('backpack reactor',(s*.32,.39,1.57),(.29,.25,.60),'Armor',.035)
        Y('reactor vent',(s*.32,.535,1.67),.11,.02,'Glow',10,'Y')
        for k in range(4): C('backpack grille',(s*.32,.535,1.25+k*.09),(.19,.022,.025),'Metal',.004)
    C('spinal power bus',(0,.39,1.55),(.14,.15,.65),'Metal',.02)
    animate_elite(rig)

def elite_rebuilt():
    global LOWPOLY
    reset('#ffcf79'); LOWPOLY=True; rig=rig_elite()
    def S(o,bone='chest'): return skin(o,rig,bone)
    def C(n,p,d,m='Armor',b=.025,bone='chest',rot=None): return S(cube(n,p,d,m,b,rot),bone)
    def Y(n,p,r,d,m='Metal',v=10,axis='Z',bone='chest'): return S(cyl(n,p,r,d,m,v,axis,.008),bone)
    def B(n,a,b,r,m='Metal',bone='chest'): return S(beam(n,a,b,r,m,6),bone)
    def P(n,pts,z0,z1,m='Armor',bone='chest'): return S(prism(n,pts,z0,z1,m,.025),bone)
    S(shaped_hull('tapered pressure hull',-.34,.32,.72,.55,1.31,1.93,'Armor',.055))
    P('upper breastplate',[(-.62,-.365),(.62,-.365),(.48,-.43),(-.48,-.43)],1.50,1.90,'ArmorLight')
    C('lower chest inset',(0,-.442,1.52),(.70,.025,.18),'Undersuit',.008)
    C('reactor slit',(0,-.468,1.55),(.29,.018,.055),'Visor',.006)
    for s in (-1,1):
        C('thorax floating plate',(s*.39,-.452,1.72),(.28,.05,.27),'Armor',.02,rot=(0,0,s*.12))
        C('thorax seam',(s*.24,-.485,1.73),(.018,.012,.25),'Gold',.004)
        for j in range(3): C('rear cooling vent',(s*.38,.38,1.53+j*.115),(.33,.025,.027),'Metal',.004)
        C('backpack ammunition drum',(s*.45,.44,1.53),(.31,.31,.52),'Armor',.04)
        Y('backpack rotary axle',(s*.45,.61,1.52),.12,.035,'Gold',10,'Y')
    C('pelvis',(0,.03,.83),(.68,.43,.28),'Armor',.045,bone='hips')
    C('waist swivel',(0,0,1.17),(.48,.42,.21),'Undersuit',.015,bone='spine')
    for s in (-1,1):
        side='L' if s<0 else 'R'; x=s*.43
        Y('hip axle',(x,0,.80),.17,.22,'Metal',10,'X',bone='hips')
        # Reverse knee: upper leg sweeps back, lower leg folds forward to the foot.
        B('thigh structural spar',(x,0,.77),(x,.22,.43),.105,'ArmorLight','thigh.'+side)
        C('thigh swept plate',(x,.12,.62),(.32,.40,.25),'ArmorLight',.038,bone='thigh.'+side,rot=(s*.08,0,0))
        C('thigh amber trace',(x,.10,.755),(.21,.29,.022),'Gold',.005,bone='thigh.'+side)
        Y('reverse knee bearing',(x,.22,.44),.13,.25,'Metal',10,'X',bone='shin.'+side)
        C('knee shield',(x,.32,.46),(.30,.15,.18),'Armor',.025,bone='shin.'+side)
        B('angled shin frame',(x,.22,.43),(x,-.20,.14),.10,'Armor','shin.'+side)
        C('shin scute',(x,-.02,.25),(.29,.34,.23),'ArmorLight',.028,bone='shin.'+side)
        B('piston sleeve',(x+s*.15,.18,.44),(x+s*.15,-.11,.20),.053,'Metal','shin.'+side)
        B('piston rod',(x+s*.15,-.11,.20),(x+s*.15,-.28,.12),.025,'Metal','shin.'+side)
        B('hydraulic hose',(x-s*.17,.20,.44),(x-s*.22,-.18,.17),.022,'Rubber','shin.'+side)
        C('splayed metatarsal',(x,-.27,.105),(.37,.41,.17),'Armor',.024,bone='foot.'+side)
        for j in (-1,0,1):
            C('three toe claw',(x+j*.145,-.52-(.06 if j==0 else 0),.075),(.125,.28,.12),'ArmorLight',.014,bone='foot.'+side)
            C('toe metal tip',(x+j*.145,-.69-(.06 if j==0 else 0),.075),(.10,.06,.065),'Metal',.007,bone='foot.'+side)
        Y('shoulder gimbal',(s*.73,0,1.74),.20,.27,'Metal',10,'X',bone='shoulder.'+side)
        P('shoulder pauldron',[(s*.62,-.22),(s*1.18,-.50),(s*1.28,-.33),(s*.99,.28),(s*.65,.31)],1.68,1.96,'Armor',bone='shoulder.'+side)
        B('shoulder amber stripe',(s*.73,.20,1.975),(s*1.18,-.37,1.975),.025,'Gold','shoulder.'+side)
        C('upper arm servo',(s*.91,-.04,1.48),(.23,.31,.39),'ArmorLight',.03,bone='upper_arm.'+side)
        Y('elbow axle',(s*.94,-.12,1.29),.105,.22,'Metal',10,'X',bone='forearm.'+side)
        C('cannon cradle',(s*.96,-.35,1.15),(.37,.59,.27),'Armor',.032,bone='forearm.'+side)
        C('cannon top scute',(s*.96,-.42,1.31),(.26,.52,.044),'ArmorLight',.01,bone='forearm.'+side)
        for dx in (-.10,.10):
            Y('twin barrel shroud',(s*.96+dx,-.68,1.13),.078,.37,'ArmorLight',10,'Y',bone='forearm.'+side)
            Y('twin barrel bore',(s*.96+dx,-.88,1.13),.043,.025,'Undersuit',10,'Y',bone='forearm.'+side)
            Y('muzzle lining',(s*.96+dx,-.898,1.13),.027,.012,'Glow',10,'Y',bone='forearm.'+side)
        for j in range(3):
            C('cannon cooling fin',(s*.96,-.25-j*.105,1.29),(.39,.025,.085),'Metal',.005,bone='forearm.'+side)
        for j in range(4):
            B('ammo feed link',(s*.55,.49-j*.14,1.48-j*.04),(s*.85,-.02-j*.09,1.21),.027,'Gold','chest')
        C('barrel hand clamp',(s*.96,-.50,1.03),(.26,.20,.12),'Metal',.012,bone='hand.'+side)
    C('sunken sensor pod',(0,-.14,1.98),(.43,.42,.22),'Armor',.027,bone='head')
    C('sensor brow',(0,-.385,2.02),(.48,.09,.075),'ArmorLight',.01,bone='head')
    C('horizontal amber visor',(0,-.438,1.995),(.34,.016,.035),'Visor',.004,bone='head')
    for s in (-1,1): C('sensor cheek',(s*.34,-.35,1.94),(.14,.13,.12),'Armor',.012,bone='head')
    animate_elite(rig)

def animate_elite(rig):
    rig.animation_data_create()
    def act(name,frames,poses):
        action=bpy.data.actions.new(name); rig.animation_data.action=action
        for frame,coords in zip(frames,poses):
            for bone in rig.pose.bones:
                v=coords.get(bone.name,(0,0,0)); bone.rotation_mode='XYZ'; bone.rotation_euler=v
                bone.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone.name)
        action.use_fake_user=True
        # NLA strips make every action reliably export as its own glTF animation.
        track=rig.animation_data.nla_tracks.new(); track.name=name
        strip=track.strips.new(name,1,action); strip.action_frame_start=frames[0]; strip.action_frame_end=frames[-1]
        return action
    act('Idle',[1,31,61],[{}, {'spine':(.018,0,.018),'chest':(-.025,0,-.012),'head':(.012,0,0)},{}])
    walk=[]
    for q in (0,1,2,3,4):
        t=q*PI/2; swing=math.sin(t)*.30
        walk.append({'thigh.L':(swing,0,0),'thigh.R':(-swing,0,0),
          'shin.L':(max(0,-swing)*.7,0,0),'shin.R':(max(0,swing)*.7,0,0),
          'upper_arm.L':(-swing*.25,0,0),'upper_arm.R':(swing*.25,0,0),
          'hips':(0,0,math.sin(t)*.025)})
    act('Walk',[1,6,11,16,21],walk)
    act('Fire',[1,4,8,11],[{}, {'chest':(.12,0,0),'forearm.L':(-.23,0,0),'forearm.R':(-.23,0,0)},
         {'chest':(-.05,0,0),'forearm.L':(.10,0,0),'forearm.R':(.10,0,0)},{}])
    rig.animation_data.action=None
    for b in rig.pose.bones: b.rotation_euler=(0,0,0)

def render_view(name,top=False):
    scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1024; scene.render.resolution_y=1024; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
    scene.world.color=(.016,.020,.027)
    scene.view_settings.view_transform='AgX'
    bounds=[o for o in bpy.data.objects if o.type=='MESH' and not o.hide_render]
    coords=[o.matrix_world@Vector(v) for o in bounds for v in o.bound_box]
    lo=Vector(tuple(min(p[i] for p in coords) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in coords) for i in range(3)))
    center=(lo+hi)/2; dim=hi-lo; span=max(dim.x,dim.y,dim.z)
    def area(n,loc,power,color,size):
        d=bpy.data.lights.new(n,'AREA'); d.energy=power; d.color=color; d.shape='DISK'; d.size=size
        o=bpy.data.objects.new(n,d); scene.collection.objects.link(o); o.location=center+Vector(loc); o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
    area('warm key',(span*.8,-span*.75,span*1.35),320,(1,.70,.43),span*.9)
    area('cool rim',(-span*.85,span*.8,span*1.1),420,(.32,.63,1),span*.8)
    camd=bpy.data.cameras.new('Preview camera'); cam=bpy.data.objects.new('Preview camera',camd); scene.collection.objects.link(cam); scene.camera=cam
    camd.type='ORTHO'; camd.ortho_scale=span*1.48 if name=='boss' else span*1.7
    offset=Vector((span*.65,-span*.9,span*(1.75 if top else .56)))
    cam.location=center+offset; cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(PRE,name+('-top.png' if top else '-hero.png'))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True)
    for o in [x for x in bpy.data.objects if x.type=='LIGHT']: bpy.data.objects.remove(o,do_unlink=True)

def export(name):
    for o in bpy.data.objects:
        if o.type=='MESH': o.hide_set(False)
    path=os.path.join(OUT,name+'.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',export_yup=True,
        export_apply=True,export_animations=True,export_nla_strips=True,
        export_cameras=False,export_lights=False,export_materials='EXPORT')
    tris=sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons)
    print('ASSET_STATS',json.dumps({'id':name,'base_triangles':tris,'bytes':os.path.getsize(path)}))

for name,fn in [('drone',drone),('hunter',hunter),('elite',elite_rebuilt),('boss',boss)]:
    if ONLY and ONLY!=name: continue
    print('BUILDING',name,flush=True); fn(); export(name); render_view(name,False); render_view(name,True)
print('DONE',flush=True)
