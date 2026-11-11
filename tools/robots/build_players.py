"""Procedural NEON CIRCUIT player robots. Blender 5.2, headless.

Run: blender -b --factory-startup --python build_players.py
"""
import bpy, math, os, sys
from array import array
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out'); PRE = os.path.join(HERE, 'preview')
os.makedirs(OUT, exist_ok=True); os.makedirs(PRE, exist_ok=True)
S = None; RIG = None; PARTS = []

def mat(name, rgb, metal=0, rough=.4, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=.3 if metal else 0
    if emission:
        p.inputs['Emission Color'].default_value=(*rgb,1); p.inputs['Emission Strength'].default_value=emission
    return m

def setup_materials(color):
    global M
    # Principled inputs are scene linear; convert the specified sRGB class hex.
    color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in color)
    M={
        'Armor':mat('Armor',(.035,.047,.060),.85,.35),
        'ArmorLight':mat('ArmorLight',(.115,.145,.180),.8,.34),
        'Undersuit':mat('Undersuit',(.004,.006,.008),.2,.75),
        'Metal':mat('Metal',(.26,.31,.36),1,.22),
        'Rubber':mat('Rubber',(.003,.004,.006),0,.6),
        'Cloth':mat('Cloth',(.018,.105,.120),0,.82),
        'Glow':mat('Glow',color,.25,.18,8),
        'Visor':mat('Visor',color,.1,.1,12),
    }

def add(o, material, bone, bevel=0):
    o.data.materials.append(M[material]); PARTS.append(o)
    if bevel:
        b=o.modifiers.new('Machined edge radius','BEVEL'); b.width=bevel*.65; b.segments=1; b.limit_method='ANGLE'; b.angle_limit=.45
        n=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL'); n.keep_sharp=True
    for p in o.data.polygons: p.use_smooth=True
    vg=o.vertex_groups.new(name=bone); vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    a=o.modifiers.new('Rigid bone skin','ARMATURE'); a.object=RIG
    bpy.context.view_layer.update()
    world=o.matrix_world.copy(); o.parent=RIG; o.matrix_world=world
    return o

def box(name, loc, dims, material='Armor', bone='chest', bevel=.025, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name
    o.dimensions=dims; o.rotation_euler=rot; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return add(o,material,bone,bevel)

def panel(name, points, y_front, depth, material, bone, bevel=.009):
    """Faceted die-cast plate with an intentional cut-corner outline in X/Z."""
    n=len(points); verts=[(x,y_front,z) for x,z in points]+[(x,y_front+depth,z) for x,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return add(o,material,bone,bevel)

def cyl(name, a, b, radius, material='Metal', bone='chest', verts=10, radius2=None):
    a,b=Vector(a),Vector(b); d=b-a; mid=(a+b)*.5
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length, location=mid)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=radius2, depth=d.length, location=mid)
    o=bpy.context.object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return add(o,material,bone,.008 if radius>.03 else 0)

def sphere(name,loc,r,matl='Metal',bone='chest',segments=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=8,radius=r,location=loc)
    return add(bpy.context.object,matl,bone)

def link(name, pts, radius, material='Rubber', bone='chest'):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=radius; cu.bevel_resolution=2
    sp=cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts)-1)
    for bp,p in zip(sp.bezier_points,pts): bp.co=p; bp.handle_left_type='AUTO'; bp.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(o)
    # Convert curves so glTF receives them and skin them.
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH'); return add(bpy.context.object,material,bone)

def rig(scale):
    global RIG
    s=scale; arm=bpy.data.armatures.new('RigData'); RIG=bpy.data.objects.new('Rig',arm); bpy.context.collection.objects.link(RIG)
    bpy.context.view_layer.objects.active=RIG; RIG.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    def bone(n,a,b,parent=None):
        e=arm.edit_bones.new(n); e.head=Vector(a)*s; e.tail=Vector(b)*s
        if parent: e.parent=arm.edit_bones[parent]
    bone('root',(0,0,.04),(0,0,.18))
    bone('hips',(0,0,.91),(0,0,1.05),'root')
    bone('spine',(0,0,1.05),(0,0,1.37),'hips')
    bone('chest',(0,0,1.37),(0,0,1.72),'spine')
    bone('neck',(0,0,1.72),(0,0,1.86),'chest')
    bone('head',(0,0,1.86),(0,0,2.16),'neck')
    for side,sg in [('L',-1),('R',1)]:
        bone('shoulder.'+side,(sg*.34,0,1.61),(sg*.53,0,1.57),'chest')
        bone('upper_arm.'+side,(sg*.53,0,1.57),(sg*.69,0,1.27),'shoulder.'+side)
        bone('forearm.'+side,(sg*.69,0,1.27),(sg*.69,-.05,1.05),'upper_arm.'+side)
        bone('hand.'+side,(sg*.69,-.05,1.05),(sg*.69,-.12,.94),'forearm.'+side)
        bone('thigh.'+side,(sg*.21,0,.89),(sg*.25,0,.52),'hips')
        bone('shin.'+side,(sg*.25,0,.52),(sg*.26,-.03,.17),'thigh.'+side)
        bone('foot.'+side,(sg*.26,-.03,.17),(sg*.26,-.23,.08),'shin.'+side)
    bpy.ops.object.mode_set(mode='OBJECT'); RIG.select_set(False)

def shell(name, rings, material, bone, sides=8, phase=0):
    """Loft elliptical armour cages; varied ring centres give sculpted, tapered forms."""
    # Close support loops preserve panel shoulders after subdivision.
    supported=[]
    for i,ring in enumerate(rings):
        if i:
            prev=rings[i-1]
            supported.append(tuple(prev[k]*.08+ring[k]*.92 for k in range(5)))
        supported.append(ring)
    verts=[]
    for cx,cy,z,rx,ry in supported:
        for j in range(sides):
            a=2*math.pi*j/sides+phase
            verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z))
    faces=[tuple(range(sides-1,-1,-1))]
    for i in range(len(supported)-1):
        for j in range(sides):
            k=(j+1)%sides
            faces.append((i*sides+j,i*sides+k,(i+1)*sides+k,(i+1)*sides+j))
    faces.append(tuple((len(supported)-1)*sides+j for j in range(sides)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    # Die-cast armour keeps its planar facets and tight machined highlights. Only
    # flexible cores are rounded by subdivision.
    if material in ('Armor','ArmorLight'):
        bev=obj.modifiers.new('Sharp armour edge','BEVEL')
        bev.width=.013; bev.segments=1 if S=='tank' else 2; bev.limit_method='ANGLE'; bev.angle_limit=.35
        norm=obj.modifiers.new('Plate normals','WEIGHTED_NORMAL'); norm.keep_sharp=True
    else:
        sub=obj.modifiers.new('Sculpted core','SUBSURF'); sub.levels=1; sub.render_levels=1
    return add(obj,material,bone)

def beam(name,a,b,width,depth,material,bone,edge=.02):
    a,b=Vector(a),Vector(b); mid=(a+b)*.5
    obj=box(name,mid,(width,depth,(b-a).length),material,bone,edge)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

def glow_path(name,pts,bone,r=.008):
    return link(name,pts,r,'Glow',bone)

def sculpt_limb(side,sg,kind):
    heavy=kind=='tank'; slim=kind=='assassin'
    q=1.34 if heavy else (.78 if slim else 1)
    sh='shoulder.'+side; up='upper_arm.'+side; fo='forearm.'+side; ha='hand.'+side
    th='thigh.'+side; sn='shin.'+side; ft='foot.'+side
    x=sg*(.56 if heavy else .52)
    sphere('shoulder ball '+side,(x,0,1.56),.105*q,'Metal',sh,16)
    shell('sculpted pauldron '+side,[(x,.02,1.43,.14*q,.15*q),(x,-.005,1.48,.23*q,.22*q),(x,-.01,1.63,.25*q,.23*q),(x,.015,1.72,.19*q,.18*q),(x,.03,1.735,.12*q,.12*q)],'ArmorLight',sh)
    shell('pauldron floating cap '+side,[(x,-.025,1.65,.19*q,.18*q),(x,-.025,1.685,.22*q,.20*q),(x,-.02,1.72,.18*q,.16*q)],'Armor',sh)
    glow_path('pauldron edge '+side,[(x-sg*.18*q,-.16*q,1.64),(x,-.225*q,1.65),(x+sg*.18*q,-.15*q,1.64)],sh)
    sphere('upper arm socket '+side,(sg*.60,0,1.44),.10*q,'Metal',up)
    shell('upper arm actuator '+side,[(sg*.66,0,1.25,.073*q,.08*q),(sg*.64,0,1.29,.10*q,.11*q),(sg*.61,.01,1.48,.12*q,.12*q),(sg*.60,.01,1.52,.09*q,.10*q)],'Undersuit',up)
    shell('upper arm shell '+side,[(sg*.65,-.015,1.28,.10*q,.11*q),(sg*.64,-.02,1.31,.135*q,.15*q),(sg*.61,-.015,1.46,.15*q,.15*q),(sg*.60,0,1.49,.11*q,.11*q)],'Armor',up)
    panel('upper arm faceted face '+side,[(sg*.54,1.47),(sg*.72,1.45),(sg*.77,1.34),(sg*.65,1.29),(sg*.56,1.35)],-.164*q,.018,'ArmorLight',up)
    sphere('elbow coupling '+side,(sg*.68,-.015,1.26),.09*q,'Metal',fo)
    for off in (-1,1):
        cyl('elbow axle '+side,(sg*.68+off*.06*q,-.12,1.26),(sg*.68+off*.06*q,.10,1.26),.022,'Metal',fo,10)
    shell('gauntlet shell '+side,[(sg*.69,-.04,1.04,.105*q,.12*q),(sg*.69,-.045,1.08,.15*q,.16*q),(sg*.68,-.035,1.22,.145*q,.16*q),(sg*.68,-.03,1.25,.11*q,.12*q)],'ArmorLight',fo)
    panel('forearm angular face '+side,[(sg*.58,1.23),(sg*.79,1.22),(sg*.80,1.13),(sg*.71,1.06),(sg*.60,1.09)],-.193*q,.018,'Armor',fo)
    glow_path('gauntlet tracer '+side,[(sg*.68,-.198*q,1.21),(sg*.68,-.205*q,1.14),(sg*.68,-.165*q,1.08)],fo)
    shell('articulated glove '+side,[(sg*.69,-.07,.94,.065*q,.075*q),(sg*.69,-.09,.96,.11*q,.12*q),(sg*.69,-.09,1.04,.11*q,.12*q)],'Armor',ha)
    for i in range(3):
        sphere('knuckle '+side+str(i),(sg*.69+(i-1)*.06*q,-.19*q,.99),.025*q,'Metal',ha,8)
    sphere('hip universal '+side,(sg*.23,0,.87),.115*q,'Metal',th)
    shell('thigh muscle core '+side,[(sg*.25,.02,.51,.10*q,.12*q),(sg*.25,.02,.58,.15*q,.16*q),(sg*.23,.02,.82,.19*q,.18*q),(sg*.23,.015,.86,.15*q,.15*q)],'Undersuit',th)
    shell('femoral armour '+side,[(sg*.25,-.04,.55,.13*q,.15*q),(sg*.25,-.05,.59,.18*q,.19*q),(sg*.23,-.04,.78,.205*q,.20*q),(sg*.23,-.02,.83,.16*q,.16*q)],'ArmorLight',th)
    panel('thigh continuous front '+side,[(sg*.11,.81),(sg*.33,.82),(sg*.42,.70),(sg*.37,.59),(sg*.24,.55),(sg*.10,.63)],-.225*q,.020,'Armor',th)
    glow_path('thigh seam '+side,[(sg*.23-sg*.105*q,-.17*q,.79),(sg*.23-sg*.13*q,-.19*q,.69),(sg*.25-sg*.10*q,-.15*q,.57)],th,.006)
    sphere('knee universal '+side,(sg*.25,-.01,.50),.10*q,'Metal',sn)
    shell('kneecap '+side,[(sg*.25,-.07,.45,.12*q,.11*q),(sg*.25,-.08,.50,.17*q,.15*q),(sg*.25,-.07,.55,.13*q,.11*q)],'Armor',sn)
    shell('calf motor '+side,[(sg*.26,.01,.16,.08*q,.10*q),(sg*.26,.03,.22,.12*q,.14*q),(sg*.25,.045,.43,.14*q,.15*q),(sg*.25,.03,.46,.10*q,.11*q)],'Undersuit',sn)
    shell('greave shell '+side,[(sg*.26,-.035,.18,.10*q,.11*q),(sg*.26,-.04,.23,.14*q,.16*q),(sg*.25,-.04,.40,.15*q,.17*q),(sg*.25,-.03,.43,.11*q,.11*q)],'Armor',sn)
    panel('shin continuous front '+side,[(sg*.14,.42),(sg*.36,.42),(sg*.39,.34),(sg*.34,.20),(sg*.23,.17),(sg*.13,.24)],-.20*q,.020,'ArmorLight',sn)
    cyl('knee hydraulic '+side,(sg*.25+sg*.13*q,.045,.45),(sg*.26+sg*.11*q,.035,.21),.022,'Metal',sn)
    cyl('knee hydraulic collar '+side,(sg*.25+sg*.13*q,.045,.36),(sg*.25+sg*.12*q,.04,.31),.039,'ArmorLight',sn)
    glow_path('shin edge '+side,[(sg*.25-sg*.09*q,-.17*q,.41),(sg*.26-sg*.09*q,-.18*q,.27)],sn,.006)
    sphere('ankle pivot '+side,(sg*.26,-.02,.16),.075*q,'Metal',ft)
    box('angular sole '+side,(sg*.26,-.18,.052),(.31*q,.46,.085),'Rubber',ft,.006)
    box('armoured toe '+side,(sg*.26,-.31,.105),(.32*q,.24,.12),'ArmorLight',ft,.012)
    box('armoured instep '+side,(sg*.26,-.105,.16),(.24*q,.25,.19),'Armor',ft,.011,rot=(.20,0,0))
    for toe in (-1,1):
        box('boot traction '+side+str(toe),(sg*.26+toe*.07*q,-.39,.045),(.09*q,.08,.035),'Rubber',ft,.008)
    link('shoulder servo hose '+side,[(x,.16,1.58),(sg*.63,.20,1.42),(sg*.68,.13,1.27)],.012,'Rubber',sh)

def sculpt_body(kind):
    heavy=kind=='tank'; slim=kind=='assassin'; w=1.30 if heavy else (.83 if slim else 1)
    shell('pelvis armour',[(0,0,.89,.22*w,.15),(0,0,.93,.32*w,.22),(0,0,1.03,.29*w,.20),(0,0,1.05,.22*w,.15)],'Armor','hips')
    shell('ribbed waist',[(0,0,1.03,.20*w,.16),(0,0,1.07,.26*w,.19),(0,0,1.30,.27*w,.21),(0,0,1.33,.22*w,.17)],'Undersuit','spine')
    if heavy:
        for z in (1.10,1.19,1.28):
            panel('overlapping abdominal slab '+str(z),[(-.32*w,z-.025),(.32*w,z-.025),(.27*w,z+.035),(-.27*w,z+.035)],-.235,.038,'ArmorLight','spine')
    elif not slim:
        for z in (1.10,1.18,1.26):
            beam('abdominal rib',(-.18*w,-.20,z),(.18*w,-.20,z),.026,.026,'Metal','spine',.005)
    shell('thoracic core',[(0,.02,1.31,.31*w,.24),(0,.01,1.35,.39*w,.28),(0,.02,1.57,.44*w,.29),(0,.025,1.70,.36*w,.24),(0,.03,1.72,.28*w,.19)],'Undersuit','chest')
    for sg,side in [(-1,'L'),(1,'R')]:
        if heavy:
            panel('barrel chest slab '+side,[(sg*.025,1.68),(sg*.31*w,1.73),(sg*.45*w,1.57),(sg*.43*w,1.41),(sg*.13*w,1.43)],-.307,.085,'ArmorLight','chest',.014)
            panel('lower breast overlap '+side,[(sg*.12*w,1.42),(sg*.43*w,1.43),(sg*.38*w,1.34),(sg*.15*w,1.35)],-.340,.045,'Armor','chest')
            for z in (1.49,1.54,1.59):
                beam('thorax vent '+side,(sg*.32*w,-.35,z),(sg*.40*w,-.32,z),.012,.012,'Undersuit','chest',.002)
        elif slim:
            panel('assassin V chest '+side,[(sg*.035,1.69),(sg*.31*w,1.68),(sg*.34*w,1.57),(sg*.09*w,1.39),(sg*.025,1.49)],-.296,.032,'ArmorLight','chest',.009)
            panel('assassin narrow flank '+side,[(sg*.26*w,1.55),(sg*.37*w,1.55),(sg*.24*w,1.35),(sg*.13*w,1.37)],-.304,.025,'Armor','chest')
            glow_path('V chest line '+side,[(sg*.05,-.307,1.66),(sg*.29*w,-.307,1.63),(sg*.09*w,-.314,1.40)],'chest',.006)
        else:
            panel('ranger tactical vest '+side,[(sg*.025,1.67),(sg*.31*w,1.67),(sg*.36*w,1.51),(sg*.29*w,1.39),(sg*.06,1.43)],-.31,.052,'ArmorLight','chest')
            panel('ranger upper armour '+side,[(sg*.04,1.64),(sg*.29*w,1.64),(sg*.33*w,1.54),(sg*.10,1.53)],-.362,.025,'Armor','chest')
            box('chest rig pouch '+side,(sg*.22,-.383,1.45),(.14,.075,.09),'Armor','chest',.009)
            glow_path('vest trim '+side,[(sg*.04,-.365,1.65),(sg*.29,-.363,1.64)],'chest',.006)
        shell('side rib shell '+side,[(sg*.37*w,.03,1.34,.075*w,.14),(sg*.39*w,.04,1.48,.10*w,.17),(sg*.40*w,.04,1.59,.09*w,.15)],'Armor','chest')
        sphere('clavicle bearing '+side,(sg*.39*w,.035,1.67),.065,'Metal','chest')
    if heavy:
        box('central reactor housing',(0,-.34,1.55),(.22,.11,.26),'Armor','chest',.025)
        panel('central amber reactor',[(-.075,1.63),(.075,1.63),(.11,1.55),(0,1.45),(-.11,1.55)],-.408,.012,'Glow','chest',.004)
    elif slim:
        panel('assassin sternum',[(0,1.65),(.07,1.53),(0,1.40),(-.07,1.53)],-.345,.022,'Armor','chest')
    else:
        beam('diagonal load strap',(-.28,-.389,1.66),(.23,-.39,1.38),.055,.024,'Undersuit','chest',.006)
        box('strap buckle',(-.02,-.43,1.52),(.085,.024,.075),'Metal','chest',.006)
    shell('backpack spine',[(0,.27,1.29,.13,.10),(0,.30,1.38,.18,.14),(0,.31,1.63,.17,.15),(0,.30,1.69,.12,.10)],'Armor','chest')
    for sg in (-1,1):
        x=sg*.25*w
        shell('pack engine',[(x,.27,1.32,.09*w,.10),(x,.35,1.38,.14*w,.16),(x,.35,1.61,.15*w,.17),(x,.27,1.67,.10*w,.10)],'ArmorLight','chest')
        for z in (1.39,1.44,1.49,1.54):
            beam('pack heat vent',(x-.075*w,.52,z),(x+.075*w,.52,z),.014,.012,'Undersuit','chest',.002)
        glow_path('pack exhaust '+str(sg),[(x,.51,1.38),(x,.53,1.51)],'chest',.008)
    sphere('neck bearing',(0,0,1.77),.10,'Metal','neck')
    shell('helmet organic cage',[(0,-.015,1.86,.09*w,.09),(0,-.025,1.90,.15*w,.14),(0,-.015,2.02,.175*w,.17),(0,.005,2.15,.16*w,.16),(0,.015,2.20,.10*w,.11),(0,.02,2.215,.04*w,.05)],'Armor','head',12)
    shell('helmet brow',[(0,-.025,2.07,.155*w,.16),(0,-.03,2.105,.18*w,.18),(0,-.02,2.13,.17*w,.17)],'ArmorLight','head',12)
    shell('angular jaw',[(0,-.09,1.88,.045*w,.09),(0,-.11,1.91,.10*w,.13),(0,-.10,1.99,.14*w,.16),(0,-.07,2.035,.13*w,.15)],'ArmorLight','head',12)
    for sg in (-1,1):
        cyl('temple sensor '+str(sg),(sg*.17*w,-.005,2.045),(sg*.205*w,-.005,2.045),.054,'Metal','head',12)
        cyl('sensor lens '+str(sg),(sg*.207*w,-.005,2.045),(sg*.214*w,-.005,2.045),.034,'Visor','head',12)
    for side,sg in [('L',-1),('R',1)]: sculpt_limb(side,sg,kind)

def sculpt_ranger():
    # Rifle points forward and crosses the chest. Its silhouette is visible from 50 degrees.
    b='chest'
    stock=Vector((.31,-.28,1.24)); tip=Vector((-.38,-1.53,1.24)); direction=tip-stock
    cyl('long rifle barrel',stock,tip,.045,'Armor',b,16)
    cyl('machined outer barrel',stock+direction*.35,tip-direction*.11,.064,'Metal',b,16)
    cyl('muzzle brake',tip-direction*.11,tip+direction*.035,.078,'ArmorLight',b,16)
    cyl('dark muzzle bore',tip+direction*.035,tip+direction*.05,.036,'Undersuit',b,12)
    beam('rifle receiver',stock+direction*.10,stock+direction*.35,.21,.19,'ArmorLight',b)
    beam('cheek stock',stock-direction*.24,stock+direction*.09,.12,.15,'Armor',b)
    beam('triangulated buttstock',stock-direction*.34+Vector((0,0,-.07)),stock-direction*.08+Vector((0,0,.01)),.16,.11,'ArmorLight',b,.01)
    beam('stock lower spar',stock-direction*.33+Vector((0,0,-.09)),stock-direction*.01+Vector((0,0,-.11)),.035,.035,'Metal',b,.006)
    beam('top optic rail',stock+Vector((0,0,.12)),stock+direction*.48+Vector((0,0,.12)),.035,.04,'Metal',b,.008)
    for t in (.60,.75,.90):
        p=stock+direction*t
        cyl('barrel isolation ring',p-direction*.012,p+direction*.012,.073,'Armor',b,12)
    p=stock+direction*.29
    cyl('sniper scope',p+Vector((0,0,.19)),p+direction*.26+Vector((0,0,.19)),.055,'Armor',b,14)
    cyl('scope objective',p+direction*.26+Vector((0,0,.19)),p+direction*.27+Vector((0,0,.19)),.046,'Visor',b,14)
    beam('power magazine',stock+direction*.15+Vector((0,0,-.10)),stock+direction*.22+Vector((0,0,-.27)),.12,.12,'Armor',b)
    glow_path('rifle emissive spine',[tuple(stock+direction*t+Vector((0,0,.063))) for t in (.33,.60,.88)],b,.007)
    for sg in (-1,1):
        x=sg*.24
        for i in range(3):
            box('utility pouch',(sg*(.19+i*.10),-.03,1.00),(.085,.11,.10),'Armor','hips',.018)
        # A dark aerodynamic scarf and layered trailing cape, attached to the torso.
        link('neck scarf wrap '+str(sg),[(sg*.13,-.16,1.78),(sg*.28,-.01,1.76),(sg*.30,.20,1.67)],.025,'Cloth','chest')
        shell('cape anchor '+str(sg),[(x,.24,1.55,.09,.08),(x,.31,1.63,.11,.10),(x,.27,1.72,.08,.07)],'Armor','chest')
        mesh=bpy.data.meshes.new('tattered cape cloth')
        verts=[(sg*.16,.32,1.62),(sg*.32,.32,1.60),(sg*.48,.68,1.38),(sg*.58,.91,1.23),(sg*.85,1.22,.80),(sg*.44,1.19,.85),(sg*.10,.65,1.23)]
        mesh.from_pydata(verts,[],[(0,1,2,3,6),(6,3,4,5)]); mesh.update()
        obj=bpy.data.objects.new('flowing scarf cape '+str(sg),mesh); bpy.context.collection.objects.link(obj)
        sol=obj.modifiers.new('cloth thickness','SOLIDIFY'); sol.thickness=.018
        sub=obj.modifiers.new('cloth folds','SUBSURF'); sub.levels=2
        add(obj,'Cloth','chest')
    glow_path('ranger visor',[(-.13,-.191,2.075),(0,-.215,2.071),(.13,-.191,2.075)],'head',.011)

def sculpt_tank():
    # Heavy upper silhouette, inset head, structural shield and shoulder carried maul.
    for sg,side in [(-1,'L'),(1,'R')]:
        sh='shoulder.'+side
        shell('siege pauldron '+side,[(sg*.58,0,1.49,.23,.24),(sg*.58,-.02,1.55,.33,.32),(sg*.57,-.01,1.73,.36,.33),(sg*.57,.02,1.82,.28,.25)],'Armor',sh)
        shell('layered upper shoulder '+side,[(sg*.59,-.03,1.70,.25,.24),(sg*.59,-.03,1.76,.31,.27),(sg*.59,0,1.82,.25,.21)],'ArmorLight',sh)
        glow_path('heavy pauldron slit '+side,[(sg*.30,-.27,1.66),(sg*.56,-.33,1.66),(sg*.81,-.22,1.65)],sh,.009)
        shell('heavy knee '+side,[(sg*.25,-.08,.44,.18,.17),(sg*.25,-.08,.52,.22,.20),(sg*.25,-.06,.59,.17,.16)],'ArmorLight','shin.'+side)
    # Shield 0.9 wide and 1.6 tall in final scaled asset.
    shield='forearm.L'
    shell('tower shield silhouette',[(-.75,-.36,.43,.32,.07),(-.75,-.36,.49,.42,.10),(-.75,-.36,1.48,.42,.11),(-.75,-.36,1.57,.33,.08)],'Armor',shield,10)
    shell('shield raised face',[(-.75,-.48,.58,.29,.035),(-.75,-.48,.66,.34,.05),(-.75,-.48,1.38,.34,.05),(-.75,-.48,1.45,.26,.035)],'ArmorLight',shield,10)
    panel('shield upper impact laminate',[(-1.04,1.39),(-.46,1.39),(-.48,1.08),(-1.02,1.08)],-.567,.017,'Armor',shield,.01)
    panel('shield lower impact laminate',[(-1.02,1.03),(-.48,1.03),(-.47,.66),(-1.03,.66)],-.567,.017,'Armor',shield,.01)
    for x in (-1.02,-.48):
        glow_path('shield amber edge '+str(x),[(x,-.602,.69),(x,-.605,1.35)],shield,.009)
    beam('shield central keel',(-.75,-.612,.67),(-.75,-.612,1.38),.045,.05,'ArmorLight',shield)
    glow_path('shield central circuit',[(-.75,-.646,1.28),(-.75,-.646,1.12),(-.87,-.646,1.01),(-.87,-.646,.77)],shield,.01)
    for z in (.69,1.35):
        for x in (-.98,-.52): sphere('shield captive bolt',(x,-.55,z),.018,'Metal',shield,8)
    h='hand.R'
    cyl('hammer grip',(.73,-.12,.93),(.73,.11,1.27),.043,'Rubber',h,12)
    cyl('hammer long haft',(.73,.11,1.26),(.73,.34,2.12),.057,'Metal',h,14)
    cyl('hammer collar',(.73,.29,1.95),(.73,.36,2.18),.09,'Armor',h,14)
    beam('maul powered head',(.42,.36,2.17),(1.03,.36,2.17),.31,.34,'Armor',h,.05)
    for x in (.42,1.03):
        beam('hammer impact face',(x,.36,2.04),(x,.36,2.30),.26,.29,'ArmorLight',h,.025)
        glow_path('hammer core '+str(x),[(x,-.005,2.08),(x,-.005,2.26)],h,.012)
    for x in (.56,.71,.86):
        for z in (2.10,2.21):
            box('hammer cooling vent '+str(x)+str(z),(x,.175,z),(.045,.014,.022),'Glow',h,.003)
    glow_path('tank visor horizontal',[(-.15,-.197,2.095),(0,-.218,2.095),(.15,-.197,2.095)],'head',.012)
    glow_path('tank visor vertical',[(0,-.218,2.09),(0,-.205,1.965)],'head',.011)
    for sg in (-1,1):
        glow_path('reactor chest slit '+str(sg),[(sg*.08,-.31,1.54),(sg*.29,-.28,1.54)],'chest',.008)

def sculpt_assassin():
    # Narrow head, paired angular eyes, streaming head ribbons and reverse daggers.
    for sg,side in [(-1,'L'),(1,'R')]:
        glow_path('violet angular eye '+side,[(sg*.018,-.202,2.074),(sg*.075,-.209,2.046),(sg*.14,-.182,2.083)],'head',.007)
        mesh=bpy.data.meshes.new('ribbon mesh')
        mesh.from_pydata([(sg*.12,.12,2.14),(sg*.18,.17,2.14),(sg*.31,.52,2.07),(sg*.23,.61,2.02),(sg*(.50 if sg<0 else .37),1.03,1.83),(sg*.26,.89,1.87)],[],[(0,1,2,3),(3,2,4,5)]); mesh.update()
        obj=bpy.data.objects.new('trailing head ribbon '+side,mesh); bpy.context.collection.objects.link(obj)
        sol=obj.modifiers.new('ribbon thickness','SOLIDIFY'); sol.thickness=.012
        sub=obj.modifiers.new('ribbon curve','SUBSURF'); sub.levels=2
        add(obj,'ArmorLight','head')
        glow_path('ribbon trim '+side,[(sg*.18,.17,2.14),(sg*.31,.52,2.07),(sg*(.50 if sg<0 else .37),1.03,1.83)],'head',.004)
        h='hand.'+side
        cyl('reverse dagger hilt '+side,(sg*.70,-.12,.97),(sg*.70,.10,.93),.033,'Rubber',h,10)
        cyl('dagger mechanical guard '+side,(sg*.62,.10,.93),(sg*.78,.10,.93),.023,'Metal',h,10)
        # Broad tapered energy blade: three cross sections make the curved
        # silhouette readable in both front and elevated game views.
        sections=[(sg*.70,.10,.93,.035), (sg*.94,.25,.74,.075), (sg*1.21,.36,.54,.055), (sg*1.40,.42,.41,.002)]
        verts=[]
        for x,y,z,width in sections:
            verts.extend([(x-width,y-.008,z),(x+width,y-.008,z),(x-width,y+.008,z),(x+width,y+.008,z)])
        faces=[]
        for j in range(len(sections)-1):
            a=4*j; c=a+4
            faces.extend([(a,a+1,c+1,c),(a+2,c+2,c+3,a+3),(a,c,a+2),(a+1,a+3,c+3,c+1)])
        mesh=bpy.data.meshes.new('energy blade mesh'); mesh.from_pydata(verts,[],faces); mesh.update()
        obj=bpy.data.objects.new('reverse grip energy blade '+side,mesh); bpy.context.collection.objects.link(obj)
        add(obj,'Glow',h,.004)
        beam('dagger blade spine '+side,(sg*.70,.10,.93),(sg*.93,.24,.75),.032,.045,'ArmorLight',h,.006)
        glow_path('arm violet seam '+side,[(sg*.62,-.16,1.43),(sg*.67,-.19,1.30)],'upper_arm.'+side,.006)
        glow_path('calf violet seam '+side,[(sg*.20,-.17,.40),(sg*.22,-.17,.23)],'shin.'+side,.006)
    shell('assassin elongated brow',[(0,-.02,2.09,.12,.15),(0,-.02,2.13,.16,.17),(0,.01,2.20,.09,.11),(0,.01,2.24,.045,.05)],'Armor','head',12)

def animate(kind):
    fps=30; scene=bpy.context.scene; scene.render.fps=fps
    ad=RIG.animation_data_create(); ad.action=None
    keys={
      'Idle':(60,[(1,0),(16,1),(31,0),(46,-1),(61,0)]),
      'Run':(20,[(1,0),(6,1),(11,0),(16,-1),(21,0)]),
      'Fire':(10,[(1,0),(3,1),(6,.35),(11,0)])
    }
    for name,(end,stamps) in keys.items():
        action=bpy.data.actions.new(name); ad.action=action
        for f,v in stamps:
            scene.frame_set(f)
            for pb in RIG.pose.bones:
                pb.rotation_mode='XYZ'; pb.rotation_euler=(0,0,0)
                if name=='Idle':
                    if pb.name=='spine': pb.rotation_euler=(.015*v,0,.012*v)
                    elif pb.name=='head': pb.rotation_euler=(-.012*v,0,0)
                    elif pb.name=='hips': pb.rotation_euler=(0,0,.014*v)
                    elif pb.name.startswith('shoulder.'): pb.rotation_euler=(.018*v,0,0)
                elif name=='Run':
                    if pb.name=='hips': pb.rotation_euler=(.07*v,0,.06*v)
                    elif pb.name=='spine': pb.rotation_euler=(.14,0,-.05*v)
                    elif pb.name.startswith('thigh.'):
                        sg=1 if pb.name.endswith('L') else -1; pb.rotation_euler=(sg*.72*v,0,0)
                    elif pb.name.startswith('shin.'):
                        sg=1 if pb.name.endswith('L') else -1; pb.rotation_euler=(-.63*max(0,-sg*v),0,0)
                    elif pb.name.startswith('upper_arm.'):
                        sg=1 if pb.name.endswith('L') else -1; pb.rotation_euler=(-sg*.48*v,0,0)
                    elif pb.name.startswith('forearm.'): pb.rotation_euler=(-.36,0,0)
                else:
                    if kind=='ranger':
                        if pb.name=='chest': pb.rotation_euler=(-.08*v,0,.025*v)
                        if pb.name=='forearm.R': pb.rotation_euler=(-.15*v,0,0)
                        if pb.name=='shoulder.R': pb.rotation_euler=(-.10*v,0,0)
                    elif kind=='tank':
                        if pb.name=='chest': pb.rotation_euler=(.22*v,0,-.10*v)
                        if pb.name=='shoulder.R': pb.rotation_euler=(-.8*v,0,0)
                        if pb.name=='forearm.L': pb.rotation_euler=(-.32*v,0,0)
                    else:
                        if pb.name=='chest': pb.rotation_euler=(.25*v,0,.38*v)
                        if pb.name=='upper_arm.L': pb.rotation_euler=(-.75*v,0,.25*v)
                        if pb.name=='upper_arm.R': pb.rotation_euler=(.65*v,0,-.3*v)
                        if pb.name=='forearm.L': pb.rotation_euler=(-.65*v,0,0)
                pb.keyframe_insert(data_path='rotation_euler',frame=f,group=pb.name)
        track=ad.nla_tracks.new(); track.name=name
        strip=track.strips.new(name,1,action); strip.action_frame_start=1; strip.action_frame_end=end
        track.mute=False
        ad.action=None
    scene.frame_set(1)

def preview(kind, view, action=None, frame=1, filepath=None, res=1024):
    scene=bpy.context.scene
    if RIG.animation_data:
        RIG.animation_data.action=bpy.data.actions.get(action) if action else bpy.data.actions.get('Idle')
    scene.frame_set(frame)
    bpy.ops.object.camera_add(location=(3.4,-5.5,3.0) if view=='hero' else (0,-4.3,6.2))
    cam=bpy.context.object; cam.name='Preview Camera'; target=Vector((0,0,1.34))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=3.3 if kind!='tank' else 3.75
    scene.camera=cam
    scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=res; scene.render.resolution_y=res; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
    scene.world.color=(.024,.031,.040)
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='Medium High Contrast'
    scene.view_settings.exposure=-1.65
    def light(loc,color,power,size):
        bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object
        o.data.energy=power; o.data.color=color; o.data.shape='DISK'; o.data.size=size
        o.rotation_euler=(Vector((0,0,1.3))-o.location).to_track_quat('-Z','Y').to_euler(); return o
    lights=[light((-3,-4,5),(1,.68,.48),1750,4),light((2.2,2.8,4),(.35,.75,1),2400,3)]
    # matte stage for grounding
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012)); floor=bpy.context.object; floor.name='Preview Stage'
    fm=mat('Stage',(.014,.020,.027),.25,.56); floor.data.materials.append(fm)
    scene.render.filepath=filepath or os.path.join(PRE,kind+'-'+view+'.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(floor,do_unlink=True); bpy.data.materials.remove(fm)
    for o in lights: bpy.data.objects.remove(o,do_unlink=True)
    bpy.data.objects.remove(cam,do_unlink=True)

def run_sheet(kind):
    tile=384; width=tile*3; height=tile*2
    dest=array('f',[0.0])*(width*height*4)
    for i in range(6):
        img=bpy.data.images.load(os.path.join(PRE,f'{kind}-run-{i}.png'),check_existing=False)
        src=array('f',[0.0])*(tile*tile*4); img.pixels.foreach_get(src)
        col=i%3; bottom=(1-i//3)*tile
        for row in range(tile):
            di=((bottom+row)*width+col*tile)*4; si=row*tile*4
            dest[di:di+tile*4]=src[si:si+tile*4]
        bpy.data.images.remove(img)
        os.remove(os.path.join(PRE,f'{kind}-run-{i}.png'))
    sheet=bpy.data.images.new(kind+' Run contact',width=width,height=height,alpha=True)
    sheet.pixels.foreach_set(dest); sheet.filepath_raw=os.path.join(PRE,kind+'-run.png')
    sheet.file_format='PNG'; sheet.save(); bpy.data.images.remove(sheet)

def main():
    quick='--quick' in sys.argv
    for kind,color,scale in [('ranger',(.349,.906,1),1.0),('tank',(1,.702,.278),1.22),('assassin',(.667,.510,1),.97)]:
        global S; S=kind
        bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
        for old_mat in list(bpy.data.materials): bpy.data.materials.remove(old_mat)
        global PARTS; PARTS=[]
        setup_materials(color); rig(scale)
        # Model coordinates are designed for ranger. Scale mesh geometry for larger/smaller bodies.
        sculpt_body(kind)
        {'ranger':sculpt_ranger,'tank':sculpt_tank,'assassin':sculpt_assassin}[kind]()
        if scale!=1:
            for o in PARTS:
                o.location*=scale; o.scale*=scale
        animate(kind)
        bpy.ops.object.select_all(action='DESELECT')
        RIG.select_set(True)
        for o in PARTS: o.select_set(True)
        bpy.context.view_layer.objects.active=RIG
        path=os.path.join(OUT,kind+'.glb')
        bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,
            export_yup=True,export_apply=True,export_materials='EXPORT',export_animations=True,
            export_animation_mode='NLA_TRACKS',export_skins=True,export_cameras=False,export_lights=False)
        print('[export]',kind,len(PARTS),os.path.getsize(path),flush=True)
        preview(kind,'hero'); preview(kind,'top')
        if not quick:
            preview(kind,'hero','Fire',3,os.path.join(PRE,kind+'-fire.png'))
            for i,f in enumerate((1,4,7,11,14,17)):
                preview(kind,'hero','Run',f,os.path.join(PRE,f'{kind}-run-{i}.png'),384)
            run_sheet(kind)
    print('[done] all players',flush=True)

if __name__=='__main__': main()
