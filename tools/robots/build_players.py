"""AAA Orbital Hover-Flight Mecha generator for NEON CIRCUIT. Blender 5.2, headless.

Generates three distinct zero-G hover-flight player mecha:
  - ranger   : AX-07 VALKYRIE   (Pearl-white & slate variable-wing rail sniper ace)
  - tank     : BG-09 AEGIS      (Heavy titanium/gold quad-booster hover fortress)
  - assassin : PX-11 SERAPH     (Obsidian/chrome six-blade cyber-seraph interceptor)

Run:
  blender -b --factory-startup --python tools/robots/build_players.py
  blender -b --factory-startup --python tools/robots/build_players.py -- --quick
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PRE = os.path.join(HERE, 'preview')
os.makedirs(OUT, exist_ok=True)
os.makedirs(PRE, exist_ok=True)

S = None
RIG = None
PARTS = []
M = {}


# ---------------------------------------------------------------------------
# Color & AAA Multi-Tone PBR Materials
# ---------------------------------------------------------------------------
def srgb_to_linear(rgb):
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def hex_to_linear(hex_str):
    h = hex_str.lstrip('#')
    return srgb_to_linear(tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)))


def make_mat(name, hex_or_rgb, metal=0.0, rough=0.35, coat=0.0, coat_rough=0.12, emission=0.0, emit_hex=None):
    rgb = hex_to_linear(hex_or_rgb) if isinstance(hex_or_rgb, str) else srgb_to_linear(hex_or_rgb)
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1.0)
    if not m.node_tree:
        m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1.0)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    if emission > 0:
        er = hex_to_linear(emit_hex) if emit_hex else rgb
        p.inputs['Emission Color'].default_value = (*er, 1.0)
        p.inputs['Emission Strength'].default_value = emission
    return m


def setup_materials(kind):
    global M
    if kind == 'ranger':
        # Pearl aerospace white + tactical navy-slate + brushed titanium + electric cyan
        M = {
            'Armor':      make_mat('ArmorPrimary',   '#d9e4f0', metal=0.22, rough=0.26, coat=0.72, coat_rough=0.12),
            'ArmorLight': make_mat('ArmorAccent',    '#2d5478', metal=0.58, rough=0.28, coat=0.55, coat_rough=0.14),
            'ArmorDark':  make_mat('ArmorSecondary', '#1c2633', metal=0.68, rough=0.34, coat=0.32, coat_rough=0.22),
            'Undersuit':  make_mat('FrameDark',      '#10161f', metal=0.38, rough=0.62, coat=0.05),
            'Metal':      make_mat('FrameTitanium',  '#6c7c8e', metal=0.95, rough=0.26, coat=0.18),
            'Trim':       make_mat('TrimChrome',     '#c7d8e8', metal=1.00, rough=0.16, coat=0.45),
            'Nozzle':     make_mat('NozzleAlloy',    '#3a4452', metal=0.96, rough=0.24, coat=0.20),
            'Glow':       make_mat('GlowCyan',       '#59e7ff', metal=0.15, rough=0.16, emission=7.0),
            'Visor':      make_mat('VisorCyan',      '#8ef4ff', metal=0.08, rough=0.08, coat=0.80, emission=10.0, emit_hex='#59e7ff'),
            'Blade':      make_mat('GlowWing',       '#a8f7ff', metal=0.05, rough=0.12, emission=6.5, emit_hex='#4de2ff'),
        }
    elif kind == 'tank':
        # Heavy brushed gunmetal-silver + dark battleship slate + anodized champagne gold + solar amber
        M = {
            'Armor':      make_mat('ArmorPrimary',   '#8f9dad', metal=0.62, rough=0.30, coat=0.50, coat_rough=0.18),
            'ArmorLight': make_mat('ArmorAccent',    '#d4dce4', metal=0.30, rough=0.28, coat=0.65, coat_rough=0.14),
            'ArmorDark':  make_mat('ArmorSecondary', '#1e2733', metal=0.76, rough=0.36, coat=0.28, coat_rough=0.22),
            'Undersuit':  make_mat('FrameDark',      '#11161e', metal=0.42, rough=0.64, coat=0.05),
            'Metal':      make_mat('FrameTitanium',  '#5c6978', metal=0.95, rough=0.28, coat=0.15),
            'Trim':       make_mat('TrimGold',       '#d8a94e', metal=1.00, rough=0.20, coat=0.45),
            'Nozzle':     make_mat('NozzleAlloy',    '#343c48', metal=0.96, rough=0.24, coat=0.20),
            'Glow':       make_mat('GlowAmber',      '#ffb84d', metal=0.15, rough=0.16, emission=7.0),
            'Visor':      make_mat('VisorAmber',     '#ffe094', metal=0.08, rough=0.08, coat=0.80, emission=10.5, emit_hex='#ffba4a'),
            'Blade':      make_mat('GlowCore',       '#ffd37a', metal=0.10, rough=0.14, emission=6.5, emit_hex='#ffa938'),
        }
    else:  # assassin
        # Iridescent midnight obsidian-indigo + razor silver-chrome + vivid violet plasma
        M = {
            'Armor':      make_mat('ArmorPrimary',   '#38425e', metal=0.72, rough=0.24, coat=0.84, coat_rough=0.10),
            'ArmorLight': make_mat('ArmorAccent',    '#dce4f4', metal=0.45, rough=0.20, coat=0.78, coat_rough=0.10),
            'ArmorDark':  make_mat('ArmorSecondary', '#1a2030', metal=0.68, rough=0.30, coat=0.48, coat_rough=0.16),
            'Undersuit':  make_mat('FrameDark',      '#0e121d', metal=0.35, rough=0.60, coat=0.05),
            'Metal':      make_mat('FrameTitanium',  '#7c8aa4', metal=0.96, rough=0.22, coat=0.20),
            'Trim':       make_mat('TrimSilver',     '#e8effa', metal=1.00, rough=0.14, coat=0.55),
            'Nozzle':     make_mat('NozzleAlloy',    '#343b50', metal=0.96, rough=0.22, coat=0.20),
            'Glow':       make_mat('GlowViolet',     '#c28aff', metal=0.15, rough=0.14, emission=8.0),
            'Visor':      make_mat('VisorViolet',    '#ebd6ff', metal=0.08, rough=0.08, coat=0.85, emission=11.5, emit_hex='#bc7eff'),
            'Blade':      make_mat('GlowBlade',      '#f0ddff', metal=0.05, rough=0.10, emission=8.5, emit_hex='#b474ff'),
        }


# ---------------------------------------------------------------------------
# Hard-Surface Mecha Geometry Engine
# ---------------------------------------------------------------------------
def finalize_part(obj, material, bone, bevel=0.0, bevel_seg=1, smooth=True):
    obj.data.materials.append(M[material])
    PARTS.append(obj)
    if bevel > 0:
        b = obj.modifiers.new('MachinedBevel', 'BEVEL')
        b.width = bevel
        b.segments = bevel_seg
        b.limit_method = 'ANGLE'
        b.angle_limit = 0.42
        b.harden_normals = False
        wn = obj.modifiers.new('WeightedNorm', 'WEIGHTED_NORMAL')
        wn.keep_sharp = True
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    arm = obj.modifiers.new('RigSkin', 'ARMATURE')
    arm.object = RIG
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = RIG
    obj.matrix_world = world
    return obj


def make_mesh(name, verts, faces, material, bone, bevel=0.0, bevel_seg=1, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finalize_part(obj, material, bone, bevel, bevel_seg, smooth)


def loft_rings(name, rings, material, bone, bevel=0.008, bevel_seg=1, cap_start=True, cap_end=True):
    """Loft arbitrary list of 3D closed polygon rings (same vertex count per ring)."""
    n = len(rings[0])
    m = len(rings)
    verts = [tuple(p) for ring in rings for p in ring]
    faces = []
    if cap_start:
        faces.append(tuple(range(n - 1, -1, -1)))
    for i in range(m - 1):
        b0 = i * n
        b1 = (i + 1) * n
        for j in range(n):
            jn = (j + 1) % n
            faces.append((b0 + j, b0 + jn, b1 + jn, b1 + j))
    if cap_end:
        b = (m - 1) * n
        faces.append(tuple(b + j for j in range(n)))
    return make_mesh(name, verts, faces, material, bone, bevel, bevel_seg)


def octagon_ring(cx, cy, cz, rx, ry, front_pinch=1.0, back_pinch=1.0, chine=0.68, tilt_x=0.0, tilt_y=0.0):
    """Precision 8-point stealth-faceted armor cross section lying in XY (tilted optionally)."""
    # Angles arranged around perimeter starting front-right to give sharp nose/chine facets
    pts2d = [
        ( rx * chine * front_pinch, -ry),
        ( rx,                       -ry * chine * front_pinch),
        ( rx,                        ry * chine * back_pinch),
        ( rx * chine * back_pinch,   ry),
        (-rx * chine * back_pinch,   ry),
        (-rx,                        ry * chine * back_pinch),
        (-rx,                       -ry * chine * front_pinch),
        (-rx * chine * front_pinch, -ry),
    ]
    rot = Euler((tilt_x, tilt_y, 0.0), 'XYZ').to_matrix()
    center = Vector((cx, cy, cz))
    return [center + rot @ Vector((x, y, 0.0)) for x, y in pts2d]


def hex_ring(cx, cy, cz, rx, ry, nose=1.18, tail=1.05, tilt_x=0.0, tilt_y=0.0):
    """Sharp 6-point diamond-stealth cross-section with crisp front/rear ridge."""
    pts2d = [
        (0.0, -ry * nose),
        (rx,  -ry * 0.32),
        (rx * 0.92, ry * 0.42),
        (0.0,  ry * tail),
        (-rx * 0.92, ry * 0.42),
        (-rx, -ry * 0.32),
    ]
    rot = Euler((tilt_x, tilt_y, 0.0), 'XYZ').to_matrix()
    center = Vector((cx, cy, cz))
    return [center + rot @ Vector((x, y, 0.0)) for x, y in pts2d]


def box_part(name, loc, dims, material='Armor', bone='chest', bevel=0.012, rot=(0, 0, 0), seg=1):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finalize_part(o, material, bone, bevel, seg)


def strut(name, a, b, width, depth=None, material='Metal', bone='chest', bevel=0.005):
    if depth is None:
        depth = width
    a, b = Vector(a), Vector(b)
    d = b - a
    if d.length < 1e-5:
        return None
    mid = (a + b) * 0.5
    o = box_part(name, mid, (width, depth, d.length), material, bone, bevel)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def cyl_part(name, a, b, r1, r2=None, material='Metal', bone='chest', verts=12, bevel=0.004):
    a, b = Vector(a), Vector(b)
    d = b - a
    if d.length < 1e-5:
        return None
    mid = (a + b) * 0.5
    if r2 is None or abs(r1 - r2) < 1e-5:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r1, depth=d.length, location=mid)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=mid)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return finalize_part(o, material, bone, bevel if r1 > 0.02 else 0.0)


def plate_xz(name, pts_xz, y_pos, thickness, material, bone, bevel=0.008, rot=(0, 0, 0)):
    """Faceted 3D armor plate extruded along +Y from an X/Z contour."""
    n = len(pts_xz)
    cx = sum(p[0] for p in pts_xz) / n
    cz = sum(p[1] for p in pts_xz) / n
    cy = y_pos + thickness * 0.5
    rot_m = Euler(rot, 'XYZ').to_matrix()
    center = Vector((cx, cy, cz))
    front = [center + rot_m @ Vector((x - cx, -thickness * 0.5, z - cz)) for x, z in pts_xz]
    back  = [center + rot_m @ Vector((x - cx,  thickness * 0.5, z - cz)) for x, z in pts_xz]
    return loft_rings(name, [front, back], material, bone, bevel=bevel)


def plate_yz(name, pts_yz, x_pos, thickness, material, bone, bevel=0.008, rot=(0, 0, 0)):
    """Faceted 3D armor plate extruded along X from a Y/Z contour."""
    n = len(pts_yz)
    cy = sum(p[0] for p in pts_yz) / n
    cz = sum(p[1] for p in pts_yz) / n
    cx = x_pos
    rot_m = Euler(rot, 'XYZ').to_matrix()
    center = Vector((cx, cy, cz))
    left  = [center + rot_m @ Vector((-thickness * 0.5, y - cy, z - cz)) for y, z in pts_yz]
    right = [center + rot_m @ Vector(( thickness * 0.5, y - cy, z - cz)) for y, z in pts_yz]
    return loft_rings(name, [left, right], material, bone, bevel=bevel)


def airfoil_wing(name, stations, material, bone, bevel=0.004):
    """Tapered aerospace diamond/hex-section wing lofted along span stations.
    Each station: (center_vec, chord_dir_vec, normal_vec, chord_len, half_thick, edge_ratio)
    """
    rings = []
    for pos, cdir, ndir, chord, thick, er in stations:
        p = Vector(pos)
        c = Vector(cdir).normalized()
        n = Vector(ndir).normalized()
        # 6-point sharp supersonic diamond-hex airfoil
        rings.append([
            p - c * (chord * 0.50),                         # razor leading edge
            p - c * (chord * (0.50 - er)) + n * thick,      # upper forward ridge
            p + c * (chord * 0.22)        + n * (thick * 0.72),
            p + c * (chord * 0.50),                         # razor trailing edge
            p + c * (chord * 0.22)        - n * (thick * 0.72),
            p - c * (chord * (0.50 - er)) - n * thick,      # lower forward ridge
        ])
    return loft_rings(name, rings, material, bone, bevel=bevel, bevel_seg=1)


def mech_joint(name, pos, axis='X', r=0.075, width=0.11, bone='chest'):
    """Detailed rotary joint drum with titanium housing & chrome axle cap."""
    p = Vector(pos)
    v = Vector((1, 0, 0)) if axis == 'X' else Vector((0, 1, 0)) if axis == 'Y' else Vector((0, 0, 1))
    cyl_part(name + ' housing', p - v * (width * 0.5), p + v * (width * 0.5), r, r, 'Undersuit', bone, 12, 0.004)
    cyl_part(name + ' collar',  p - v * (width * 0.56), p + v * (width * 0.56), r * 0.68, r * 0.68, 'Metal', bone, 10, 0.003)
    cyl_part(name + ' pin',     p - v * (width * 0.62), p + v * (width * 0.62), r * 0.36, r * 0.36, 'Trim', bone, 8, 0.0)


def thruster_bell(name, origin, direction, r_base, r_mouth, length, bone, glow_mat='Glow', shroud=True):
    """Multi-part AAA vectored vernier thruster nozzle with expansion bell & plasma core."""
    o = Vector(origin)
    d = Vector(direction).normalized()
    # Outer armored cowling collar
    if shroud:
        cyl_part(name + ' collar', o - d * (length * 0.12), o + d * (length * 0.45),
                 r_base * 1.18, r_base * 1.08, 'ArmorDark', bone, 8, 0.006)
        cyl_part(name + ' trim', o + d * (length * 0.42), o + d * (length * 0.54),
                 r_base * 1.12, r_base * 1.05, 'Trim', bone, 8, 0.003)
    # Metallic expansion nozzle bell
    cyl_part(name + ' bell', o + d * (length * 0.35), o + d * length,
             r_base * 0.90, r_mouth, 'Nozzle', bone, 12, 0.004)
    # Inner dark chamber rim + recessed glowing plasma injector core
    cyl_part(name + ' core', o + d * (length * 0.58), o + d * (length * 0.96),
             r_mouth * 0.66, r_mouth * 0.54, glow_mat, bone, 10, 0.0)


def glow_strip(name, pts, radius, bone, mat='Glow'):
    """Clean polygonal conduit strip (low-poly, razor sharp, zero noodle wobble)."""
    for i in range(len(pts) - 1):
        cyl_part(f'{name}_{i}', pts[i], pts[i + 1], radius, radius, mat, bone, 6, 0.0)


# ---------------------------------------------------------------------------
# Skeleton (Backwards-compatible + Articulated Flight Pack / Wings / Skirts)
# ---------------------------------------------------------------------------
def build_rig(kind):
    global RIG
    w_hip = 0.21 if kind == 'tank' else (0.15 if kind == 'assassin' else 0.17)
    w_sh  = 0.55 if kind == 'tank' else (0.44 if kind == 'assassin' else 0.47)
    arm_x = 0.61 if kind == 'tank' else (0.49 if kind == 'assassin' else 0.52)

    arm = bpy.data.armatures.new('RigData')
    RIG = bpy.data.objects.new('Rig', arm)
    bpy.context.collection.objects.link(RIG)
    bpy.context.view_layer.objects.active = RIG
    RIG.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, a, b, parent=None, roll_z=False):
        e = arm.edit_bones.new(name)
        e.head = Vector(a)
        e.tail = Vector(b)
        if roll_z:
            e.align_roll(Vector((0.0, 0.0, 1.0)))
        if parent:
            e.parent = arm.edit_bones[parent]

    bone('root',     (0, 0.00, 0.04), (0, 0.00, 0.24))
    bone('hips',     (0, 0.00, 1.12), (0, 0.00, 1.26), 'root')
    bone('spine',    (0, 0.00, 1.26), (0, -0.01, 1.48), 'hips')
    bone('chest',    (0, -0.01, 1.48), (0, -0.02, 1.86), 'spine')
    bone('neck',     (0, -0.02, 1.86), (0, -0.03, 1.98), 'chest')
    bone('head',     (0, -0.03, 1.98), (0, -0.03, 2.26), 'neck')
    bone('backpack', (0, 0.21, 1.62), (0, 0.45, 1.62), 'chest', roll_z=True)

    for side, sg in [('L', -1), ('R', 1)]:
        bone('shoulder.'  + side, (sg * 0.28, -0.01, 1.78), (sg * w_sh, -0.01, 1.75), 'chest')
        bone('upper_arm.' + side, (sg * w_sh, -0.01, 1.75), (sg * arm_x, 0.02, 1.42), 'shoulder.' + side)
        bone('forearm.'   + side, (sg * arm_x, 0.02, 1.42), (sg * (arm_x - 0.01), -0.16, 1.14), 'upper_arm.' + side)
        bone('hand.'      + side, (sg * (arm_x - 0.01), -0.16, 1.14), (sg * (arm_x - 0.02), -0.27, 1.05), 'forearm.' + side)

        bone('thigh.'     + side, (sg * w_hip, 0.00, 1.10), (sg * (w_hip + 0.04), -0.02, 0.66), 'hips')
        bone('shin.'      + side, (sg * (w_hip + 0.04), -0.02, 0.66), (sg * (w_hip + 0.05), 0.05, 0.22), 'thigh.' + side)
        bone('foot.'      + side, (sg * (w_hip + 0.05), 0.05, 0.22), (sg * (w_hip + 0.05), -0.16, 0.05), 'shin.' + side)

        # Articulated hover-flight bones with world-aligned orthogonal axes (+Y back, +Z up, +X right)!
        bone('wing_root.' + side, (sg * 0.20, 0.30, 1.72), (sg * 0.20, 0.56, 1.72), 'backpack', roll_z=True)
        bone('wing_sub.'  + side, (sg * 0.20, 0.28, 1.56), (sg * 0.20, 0.52, 1.56), 'backpack', roll_z=True)
        bone('skirt.'     + side, (sg * (w_hip + 0.04), 0.02, 1.14), (sg * (w_hip + 0.04), 0.26, 1.14), 'hips', roll_z=True)

    bpy.ops.object.mode_set(mode='OBJECT')
    RIG.select_set(False)


# ---------------------------------------------------------------------------
# Sculpted AAA Head Designs (Distinct Iconic Mecha Helmets)
# ---------------------------------------------------------------------------
def sculpt_head(kind):
    # Armored tactical collar shroud (eliminates "floating ball neck")
    cw = 0.24 if kind == 'tank' else (0.18 if kind == 'assassin' else 0.20)
    loft_rings('neck collar shroud', [
        octagon_ring(0, 0.00, 1.82, cw, 0.20, 0.90, 0.95, 0.68),
        octagon_ring(0, 0.01, 1.90, cw * 0.92, 0.19, 0.85, 0.96, 0.66),
        octagon_ring(0, 0.03, 1.97, cw * 0.78, 0.16, 0.78, 0.98, 0.66),
    ], 'ArmorDark', 'chest', bevel=0.008)
    # High lateral collar guards
    for sg in (-1, 1):
        plate_yz(f'collar fin {sg}', [(-0.14, 1.85), (0.14, 1.86), (0.16, 1.98), (-0.06, 1.96)],
                 sg * (cw * 0.84), 0.035, 'Armor', 'chest', bevel=0.006, rot=(0, sg * -0.18, 0))
    # Hydraulic neck column + dual side cables
    cyl_part('neck spine', (0, 0.01, 1.83), (0, -0.02, 2.01), 0.062, 0.056, 'Undersuit', 'neck', 10, 0.0)
    for sg in (-1, 1):
        cyl_part(f'neck piston {sg}', (sg * 0.068, -0.03, 1.85), (sg * 0.052, -0.04, 2.00), 0.016, 0.014, 'Metal', 'neck', 8, 0.0)

    # Inner dark optical face core (recessed cleanly under brow & cheeks)
    hw = 0.165 if kind == 'tank' else (0.128 if kind == 'assassin' else 0.142)
    hd = 0.195 if kind == 'tank' else (0.185 if kind == 'assassin' else 0.190)
    loft_rings('head optical core', [
        hex_ring(0, -0.02, 1.99, hw * 0.65, hd * 0.68, 1.15, 1.0),
        hex_ring(0, -0.03, 2.08, hw * 0.86, hd * 0.84, 1.16, 1.0),
        hex_ring(0, -0.02, 2.18, hw * 0.84, hd * 0.86, 1.10, 1.05),
    ], 'Undersuit', 'head', bevel=0.004)

    # Outer sculpted aerodynamic helmet dome (swept stealth-facet crown)
    loft_rings('helmet main cowl', [
        hex_ring(0,  0.00, 2.09, hw * 0.96, hd * 0.92, 1.18, 1.12, tilt_x=0.14),
        hex_ring(0, -0.01, 2.16, hw * 1.08, hd * 1.04, 1.22, 1.18, tilt_x=0.10),
        hex_ring(0,  0.02, 2.24, hw * 0.82, hd * 0.96, 1.12, 1.24, tilt_x=0.05),
        hex_ring(0,  0.05, 2.28, hw * 0.36, hd * 0.62, 1.05, 1.22),
    ], 'Armor', 'head', bevel=0.009, bevel_seg=2)

    # Angled stealth brow hood overhanging the visor cavity
    loft_rings('helmet brow hood', [
        hex_ring(0, -0.06, 2.115, hw * 0.96, hd * 0.72, 1.32, 0.75, tilt_x=0.22),
        hex_ring(0, -0.04, 2.165, hw * 1.02, hd * 0.76, 1.25, 0.80, tilt_x=0.18),
    ], 'ArmorLight' if kind == 'ranger' else 'Armor', 'head', bevel=0.006)

    # Sculpted angular cheek armor & pointed chin faceplate
    for sg in (-1, 1):
        plate_yz(f'helmet cheek {sg}',
                 [(-0.20, 2.02), (-0.06, 1.98), (0.14, 2.04), (0.16, 2.14), (-0.08, 2.11)],
                 sg * (hw * 0.88), 0.042, 'Armor', 'head', bevel=0.006, rot=(0, sg * 0.14, sg * -0.16))
        # Ear sensor housing + metallic rotor cap
        cyl_part(f'ear pod {sg}', (sg * hw * 0.95, 0.01, 2.10), (sg * (hw * 1.24), 0.01, 2.10),
                 0.046, 0.036, 'ArmorDark', 'head', 8, 0.004)
        cyl_part(f'ear trim {sg}', (sg * (hw * 1.22), 0.01, 2.10), (sg * (hw * 1.28), 0.01, 2.10),
                 0.028, 0.024, 'Trim', 'head', 8, 0.002)

    # Crisp angular chin-guard
    loft_rings('chin guard', [
        hex_ring(0, -0.14, 1.97, hw * 0.34, 0.055, 1.35, 0.7),
        hex_ring(0, -0.16, 2.03, hw * 0.56, 0.075, 1.28, 0.8),
        hex_ring(0, -0.15, 2.06, hw * 0.48, 0.065, 1.22, 0.8),
    ], 'ArmorLight' if kind == 'assassin' else 'Armor', 'head', bevel=0.005)

    # Central dorsal sensor mohawk crest (readable from overhead 50 deg!)
    plate_yz('helmet crest', [(-0.14, 2.22), (0.24, 2.24), (0.28, 2.33), (-0.08, 2.31)],
             0.0, 0.046, 'ArmorDark', 'head', bevel=0.005)
    box_part('crest fore lens', (0, -0.13, 2.265), (0.032, 0.045, 0.045), 'Visor', 'head', 0.003, rot=(0.2, 0, 0))

    # Class-specific Recessed Visor + Swept Aero-Crest / V-Fin Antennae
    if kind == 'ranger':
        # Razor continuous V-visor recessed neatly under brow
        loft_rings('ranger visor', [
            [(0, -0.215, 2.075), (0.115, -0.172, 2.088), (0.105, -0.145, 2.088), (0, -0.185, 2.075), (-0.105, -0.145, 2.088), (-0.115, -0.172, 2.088)],
            [(0, -0.220, 2.108), (0.120, -0.176, 2.118), (0.108, -0.148, 2.118), (0, -0.188, 2.108), (-0.108, -0.148, 2.118), (-0.120, -0.176, 2.118)],
        ], 'Visor', 'head', bevel=0.002)
        # Iconic swept Gundam/AC twin V-fin crest blades!
        for sg in (-1, 1):
            airfoil_wing(f'ranger vfin {sg}', [
                ((sg * 0.015, -0.155, 2.20), (0, 1, 0.25), (sg * 0.15, 0, 1), 0.055, 0.012, 0.35),
                ((sg * 0.17,  -0.06,  2.32), (0, 1, 0.22), (sg * 0.20, 0, 1), 0.048, 0.009, 0.35),
                ((sg * 0.30,   0.12,  2.42), (0, 1, 0.18), (sg * 0.25, 0, 1), 0.018, 0.004, 0.35),
            ], 'Trim', 'head', bevel=0.002)
            # Twin swept rear communication antennae
            strut(f'ranger rear fin {sg}', (sg * 0.13, 0.04, 2.14), (sg * 0.19, 0.30, 2.34), 0.018, 0.045, 'Armor', 'head', 0.003)

    elif kind == 'tank':
        # Command heavy armored visor: crisp recessed T-slit tucked snugly inside brow/cheeks
        box_part('tank visor h', (0, -0.194, 2.094), (0.162, 0.032, 0.028), 'Visor', 'head', 0.002)
        box_part('tank visor v', (0, -0.198, 2.066), (0.036, 0.030, 0.056), 'Visor', 'head', 0.002)
        # Heavy command crest horns & gold fore-emblem
        plate_xz('tank brow emblem', [(-0.036, 2.165), (0.036, 2.165), (0.024, 2.245), (-0.024, 2.245)],
                 -0.212, 0.032, 'Trim', 'head', bevel=0.004)
        for sg in (-1, 1):
            airfoil_wing(f'tank command horn {sg}', [
                ((sg * 0.11, -0.05, 2.20), (0, 1, 0.15), (sg * 0.3, 0, 1), 0.090, 0.016, 0.35),
                ((sg * 0.22,  0.10, 2.34), (0, 1, 0.10), (sg * 0.3, 0, 1), 0.048, 0.009, 0.35),
            ], 'Trim', 'head', bevel=0.003)

    else:  # assassin
        # Razor predatory dual angled eyes recessed cleanly inside helmet mask
        for sg in (-1, 1):
            plate_xz(f'assassin eye {sg}',
                     [(sg * 0.022, 2.085), (sg * 0.105, 2.118), (sg * 0.112, 2.098), (sg * 0.028, 2.068)],
                     -0.205, 0.026, 'Visor', 'head', bevel=0.002, rot=(0, 0, sg * 0.26))
            # Swept cyber-valkyrie twin rear blade-ears integrated cleanly into helmet temples!
            airfoil_wing(f'assassin blade ear {sg}', [
                ((sg * 0.10, -0.04, 2.16), (0, 1, 0.30), (sg * 0.85, 0.15, 0.50), 0.080, 0.015, 0.30),
                ((sg * 0.18,  0.22, 2.28), (0, 1, 0.20), (sg * 0.85, 0.15, 0.50), 0.068, 0.011, 0.30),
                ((sg * 0.24,  0.54, 2.38), (0, 1, 0.10), (sg * 0.85, 0.15, 0.50), 0.020, 0.004, 0.30),
            ], 'ArmorLight', 'head', bevel=0.003)
            glow_strip(f'assassin ear edge {sg}',
                       [(sg * 0.11, 0.00, 2.19), (sg * 0.18, 0.24, 2.30), (sg * 0.23, 0.50, 2.38)],
                       0.006, 'head', 'Glow')


# ---------------------------------------------------------------------------
# Sculpted AAA Torso, Spine & Aero-Skirt Pelvis
# ---------------------------------------------------------------------------
def sculpt_torso(kind):
    heavy = kind == 'tank'
    slim  = kind == 'assassin'
    w = 1.24 if heavy else (0.88 if slim else 1.00)

    # --- Pelvis & Sleek Aero-Thruster Hip Skirts ---
    loft_rings('pelvis inner block', [
        hex_ring(0, 0.00, 1.01, 0.14 * w, 0.14, 1.2, 1.1),
        hex_ring(0, 0.00, 1.14, 0.24 * w, 0.19, 1.15, 1.1),
        hex_ring(0, 0.00, 1.24, 0.20 * w, 0.16, 1.1, 1.05),
    ], 'ArmorDark', 'hips', bevel=0.009)
    # Iconic front center pelvic armored codpiece-keel (Gundam/AC signature!)
    loft_rings('pelvis front keel', [
        hex_ring(0, -0.15, 0.99, 0.065 * w, 0.085, 1.35, 0.7),
        hex_ring(0, -0.17, 1.11, 0.105 * w, 0.110, 1.30, 0.8),
        hex_ring(0, -0.14, 1.23, 0.095 * w, 0.095, 1.22, 0.8),
    ], 'Armor', 'hips', bevel=0.008, bevel_seg=2)
    box_part('pelvis core accent', (0, -0.265, 1.12), (0.06 * w, 0.025, 0.08), 'Trim', 'hips', 0.004)
    # Rear pelvic vernier fin
    loft_rings('pelvis rear tail', [
        hex_ring(0, 0.18, 1.06, 0.12 * w, 0.11, 0.8, 1.35),
        hex_ring(0, 0.16, 1.20, 0.15 * w, 0.12, 0.8, 1.25),
    ], 'Armor', 'hips', bevel=0.008)
    thruster_bell('pelvis rear thruster', (0, 0.24, 1.10), (0, 0.85, -0.52), 0.042 * w, 0.056 * w, 0.12, 'hips')

    # Articulated Hip Aero-Skirts (bound to skirt.L / skirt.R so they trail with flight thrust!)
    for side, sg in [('L', -1), ('R', 1)]:
        sk = 'skirt.' + side
        sx = sg * (0.22 * w)
        airfoil_wing(f'hip aero skirt {side}', [
            ((sx,           -0.06, 1.18), (0, 1, -0.25), (sg, 0, 0.28), 0.26, 0.032, 0.35),
            ((sx + sg*0.09,  0.04, 1.00), (0, 1, -0.22), (sg, 0, 0.32), 0.30, 0.024, 0.35),
            ((sx + sg*0.14,  0.16, 0.82), (0, 1, -0.18), (sg, 0, 0.35), 0.14, 0.010, 0.35),
        ], 'Armor', sk, bevel=0.006)
        # Skirt contrast trim + recessed glow line
        strut(f'skirt edge {side}', (sx + sg*0.04, -0.14, 1.13), (sx + sg*0.12, 0.08, 0.86), 0.018, 0.024, 'ArmorLight', sk, 0.004)
        glow_strip(f'skirt glow {side}', [(sx + sg*0.055, -0.06, 1.10), (sx + sg*0.125, 0.11, 0.88)], 0.007, sk)
        thruster_bell(f'skirt vernier {side}', (sx + sg*0.07, 0.10, 1.02), (sg*0.25, 0.72, -0.65),
                      0.034 * w, 0.045 * w, 0.10, sk, shroud=False)

    # --- Athletic Narrow Mechanical Waist & Exposed Hydraulic Pistons ---
    loft_rings('waist endo core', [
        octagon_ring(0, 0.00, 1.23, 0.15 * w, 0.14),
        octagon_ring(0, -0.01, 1.36, 0.165 * w, 0.155),
        octagon_ring(0, -0.01, 1.50, 0.21 * w, 0.185),
    ], 'Undersuit', 'spine', bevel=0.005)
    # Segmented armored abdominal plates
    for idx, z in enumerate((1.29, 1.37, 1.44)):
        pw = (0.14 + idx * 0.016) * w
        loft_rings(f'ab plate {idx}', [
            hex_ring(0, -0.12 - idx * 0.012, z - 0.026, pw, 0.075, 1.25, 0.7),
            hex_ring(0, -0.13 - idx * 0.012, z + 0.024, pw * 1.06, 0.082, 1.25, 0.7),
        ], 'ArmorDark' if idx == 0 else 'Armor', 'spine', bevel=0.005)
    # Exposed titanium abdominal hydraulic pistons & spine vertebrae
    for sg in (-1, 1):
        cyl_part(f'waist piston outer {sg}', (sg * 0.155 * w, -0.06, 1.24), (sg * 0.185 * w, -0.08, 1.48), 0.024, 0.024, 'Metal', 'spine', 8, 0.003)
        cyl_part(f'waist piston rod {sg}',   (sg * 0.155 * w, -0.06, 1.20), (sg * 0.190 * w, -0.08, 1.51), 0.013, 0.013, 'Trim', 'spine', 8, 0.0)
        cyl_part(f'waist rear cable {sg}',   (sg * 0.12 * w,   0.13, 1.22), (sg * 0.15 * w,   0.15, 1.50), 0.018, 0.018, 'Metal', 'spine', 8, 0.0)

    # --- Sculpted Heroic V-Taper Chest Core ---
    loft_rings('chest inner chassis', [
        octagon_ring(0, 0.00, 1.47, 0.24 * w, 0.19),
        octagon_ring(0, -0.01, 1.64, 0.34 * w, 0.23, 0.92, 0.94),
        octagon_ring(0, 0.00, 1.82, 0.32 * w, 0.21, 0.88, 0.92),
        octagon_ring(0, 0.01, 1.87, 0.24 * w, 0.17),
    ], 'ArmorDark', 'chest', bevel=0.010)

    # Sculpted Left/Right Pectoral Aero-Cowls (angled V-sweep, layered with panel reveal!)
    for side, sg in [('L', -1), ('R', 1)]:
        # Main sloped pectoral armor block
        loft_rings(f'chest armor plate {side}', [
            [(sg*0.07*w, -0.18, 1.48), (sg*0.30*w, -0.14, 1.51), (sg*0.36*w, 0.04, 1.54), (sg*0.20*w, 0.12, 1.50)],
            [(sg*0.08*w, -0.26, 1.64), (sg*0.37*w, -0.20, 1.67), (sg*0.41*w, 0.03, 1.69), (sg*0.22*w, 0.14, 1.65)],
            [(sg*0.06*w, -0.21, 1.82), (sg*0.33*w, -0.14, 1.84), (sg*0.35*w, 0.08, 1.84), (sg*0.18*w, 0.16, 1.82)],
        ], 'Armor', 'chest', bevel=0.011, bevel_seg=2)

        # Layered front intake cowl / reactive armor vent
        loft_rings(f'chest intake cowl {side}', [
            [(sg*0.11*w, -0.265, 1.57), (sg*0.29*w, -0.225, 1.59), (sg*0.27*w, -0.19, 1.61), (sg*0.11*w, -0.22, 1.59)],
            [(sg*0.11*w, -0.295, 1.69), (sg*0.32*w, -0.245, 1.71), (sg*0.29*w, -0.20, 1.73), (sg*0.11*w, -0.24, 1.71)],
        ], 'ArmorLight', 'chest', bevel=0.007)

        # Recessed intake louver slats + crisp luminous conduit seam
        for lz in (1.60, 1.64, 1.68):
            strut(f'chest vent {side} {lz:.2f}',
                  (sg*0.14*w, -0.295, lz), (sg*0.28*w, -0.250, lz + 0.015),
                  0.014, 0.018, 'Undersuit', 'chest', 0.002)
        glow_strip(f'chest conduit {side}', [
            (sg*0.085*w, -0.265, 1.76),
            (sg*0.295*w, -0.215, 1.78),
            (sg*0.345*w, -0.130, 1.70),
        ], 0.007, 'chest')

        # Clavicle armored strap & titanium actuator strut
        strut(f'clavicle strut {side}', (sg*0.13*w, -0.15, 1.84), (sg*0.34*w, -0.02, 1.85), 0.055, 0.042, 'Trim' if heavy else 'Metal', 'chest', 0.005)

    # Central Cockpit / Reactor Core Sternum
    loft_rings('chest sternum housing', [
        hex_ring(0, -0.23, 1.50, 0.095 * w, 0.072, 1.15, 0.7),
        hex_ring(0, -0.26, 1.65, 0.125 * w, 0.090, 1.15, 0.7),
        hex_ring(0, -0.23, 1.81, 0.105 * w, 0.076, 1.15, 0.7),
    ], 'ArmorDark', 'chest', bevel=0.008)
    # Recessed luminous reactor crystal / cockpit optical prism (cleanly proud of sternum!)
    if heavy:
        cyl_part('tank reactor ring', (0, -0.34, 1.65), (0, -0.40, 1.65), 0.118, 0.108, 'Trim', 'chest', 6, 0.005)
        cyl_part('tank reactor core', (0, -0.38, 1.65), (0, -0.415, 1.65), 0.076, 0.068, 'Visor', 'chest', 6, 0.003)
    else:
        plate_xz('chest prism bezel',
                 [(0, 1.78), (0.086 * w, 1.66), (0, 1.52), (-0.086 * w, 1.66)],
                 -0.372, 0.024, 'Trim', 'chest', bevel=0.004)
        plate_xz('chest reactor prism',
                 [(0, 1.75), (0.062 * w, 1.66), (0, 1.55), (-0.062 * w, 1.66)],
                 -0.392, 0.022, 'Visor', 'chest', bevel=0.003)


# ---------------------------------------------------------------------------
# Sculpted AAA Arms & Swept Angular Pauldrons
# ---------------------------------------------------------------------------
def sculpt_arms(kind):
    heavy = kind == 'tank'
    slim  = kind == 'assassin'
    q = 1.24 if heavy else (0.84 if slim else 1.00)
    w_sh  = 0.55 if heavy else (0.44 if slim else 0.47)
    arm_x = 0.61 if heavy else (0.49 if slim else 0.52)

    for side, sg in [('L', -1), ('R', 1)]:
        sh = 'shoulder.' + side
        up = 'upper_arm.' + side
        fo = 'forearm.' + side
        ha = 'hand.' + side

        # Internal shoulder gimbal joint (no bare ping-pong ball!)
        mech_joint(f'shoulder gimbal {side}', (sg * (w_sh - 0.06), -0.01, 1.76), 'Y', 0.078 * q, 0.12 * q, sh)

        # Sculpted Swept Angular Pauldron (Armored Core / Gundam wing-shoulder!)
        px = sg * w_sh
        if heavy:
            # Massive sloped reactive-armor siege pauldron with gold keel & upper thruster vent
            loft_rings(f'tank pauldron main {side}', [
                [(px - sg*0.14, -0.22, 1.58), (px + sg*0.24, -0.18, 1.54), (px + sg*0.28, 0.20, 1.58), (px - sg*0.12, 0.22, 1.60)],
                [(px - sg*0.16, -0.25, 1.78), (px + sg*0.26, -0.21, 1.74), (px + sg*0.30, 0.22, 1.78), (px - sg*0.14, 0.24, 1.80)],
                [(px - sg*0.10, -0.18, 1.94), (px + sg*0.18, -0.14, 1.92), (px + sg*0.20, 0.18, 1.94), (px - sg*0.08, 0.18, 1.95)],
            ], 'Armor', sh, bevel=0.013, bevel_seg=2)
            # Layered upper white-titanium reactive plate + gold rail
            loft_rings(f'tank pauldron cap {side}', [
                [(px - sg*0.09, -0.18, 1.86), (px + sg*0.20, -0.15, 1.83), (px + sg*0.22, 0.17, 1.86), (px - sg*0.08, 0.18, 1.87)],
                [(px - sg*0.06, -0.14, 1.97), (px + sg*0.15, -0.11, 1.95), (px + sg*0.16, 0.14, 1.97), (px - sg*0.05, 0.14, 1.98)],
            ], 'ArmorLight', sh, bevel=0.009)
            strut(f'tank pauldron gold rail {side}', (px - sg*0.04, -0.19, 1.92), (px + sg*0.16, 0.14, 1.94), 0.036, 0.036, 'Trim', sh, 0.005)
            glow_strip(f'tank pauldron glow {side}', [(px - sg*0.08, -0.245, 1.75), (px + sg*0.23, -0.205, 1.72)], 0.009, sh)
            thruster_bell(f'tank pauldron vernier {side}', (px + sg*0.24, 0.04, 1.68), (sg*0.85, 0.35, -0.38), 0.045, 0.058, 0.11, sh, shroud=False)
        else:
            # Sleek Swept Aerospace Wing-Pauldron (swept up-outward with razor leading edge!)
            flare = 0.24 if slim else 0.20
            loft_rings(f'aero pauldron main {side}', [
                [(px - sg*0.11, -0.16, 1.62), (px + sg*0.14, -0.13, 1.58), (px + sg*0.16, 0.15, 1.62), (px - sg*0.09, 0.16, 1.64)],
                [(px - sg*0.12, -0.18, 1.78), (px + sg*0.20, -0.14, 1.78), (px + sg*0.22, 0.16, 1.80), (px - sg*0.10, 0.17, 1.80)],
                [(px - sg*0.08, -0.13, 1.88), (px + sg*flare, -0.08, 1.94), (px + sg*flare, 0.14, 1.95), (px - sg*0.06, 0.14, 1.89)],
            ], 'Armor', sh, bevel=0.010, bevel_seg=2)
            # Swept upper aero-blade fin on shoulder
            airfoil_wing(f'pauldron winglet {side}', [
                ((px + sg*0.04, 0.02, 1.87), (0, 1, -0.05), (sg*0.15, 0, 1), 0.26, 0.020, 0.35),
                ((px + sg*(flare + 0.12), 0.08, 1.98), (0, 1, -0.08), (sg*0.25, 0, 1), 0.16, 0.010, 0.35),
            ], 'ArmorLight', sh, bevel=0.004)
            glow_strip(f'pauldron slit {side}', [
                (px - sg*0.07, -0.175, 1.76),
                (px + sg*0.18, -0.138, 1.78),
                (px + sg*0.21,  0.080, 1.81),
            ], 0.007, sh)
            thruster_bell(f'shoulder microjet {side}', (px + sg*0.15, 0.14, 1.72), (sg*0.45, 0.80, -0.38), 0.030, 0.040, 0.09, sh, shroud=False)

        # Ranger asymmetrical tactical targeting pod on left shoulder (-X)
        if kind == 'ranger' and side == 'L':
            box_part('ranger sensor pod', (px - 0.04, 0.04, 1.98), (0.12, 0.24, 0.10), 'ArmorDark', sh, 0.008, rot=(0.08, 0, 0))
            box_part('ranger sensor cap', (px - 0.04, 0.04, 2.035), (0.10, 0.20, 0.025), 'Armor', sh, 0.004)
            box_part('ranger sensor lens', (px - 0.04, -0.082, 1.985), (0.07, 0.018, 0.048), 'Visor', sh, 0.002)

        # --- Upper Arm (Inner titanium frame + sculpted faceted sleeve) ---
        ux0, ux1 = sg * (w_sh + 0.02), sg * arm_x
        cyl_part(f'upper arm frame {side}', (ux0, -0.01, 1.72), (ux1, 0.02, 1.42), 0.050 * q, 0.046 * q, 'Undersuit', up, 10, 0.0)
        loft_rings(f'upper arm armor {side}', [
            hex_ring(ux1, 0.01, 1.46, 0.072 * q, 0.082 * q, 1.2, 1.1),
            hex_ring((ux0 + ux1) * 0.5, 0.00, 1.58, 0.088 * q, 0.098 * q, 1.2, 1.1),
            hex_ring(ux0, -0.01, 1.68, 0.082 * q, 0.090 * q, 1.15, 1.1),
        ], 'ArmorDark' if kind == 'ranger' else 'Armor', up, bevel=0.007)
        # Outer armor plate highlight
        plate_yz(f'upper arm outer {side}', [(-0.07, 1.48), (0.07, 1.49), (0.08, 1.66), (-0.06, 1.66)],
                 ux1 + sg * 0.068 * q, 0.026, 'ArmorLight', up, bevel=0.005)

        # Mechanical Elbow Joint + Rear Elbow Fin
        mech_joint(f'elbow joint {side}', (ux1, 0.02, 1.42), 'X', 0.062 * q, 0.11 * q, fo)
        plate_yz(f'elbow blade {side}', [(0.05, 1.38), (0.16, 1.44), (0.14, 1.50), (0.04, 1.46)],
                 ux1, 0.038 * q, 'Armor', fo, bevel=0.005)

        # --- Forearm Gauntlet (Tapered combat vambrace angling cleanly forward) ---
        fx = sg * (arm_x - 0.01)
        cyl_part(f'forearm frame {side}', (ux1, 0.02, 1.41), (fx, -0.16, 1.14), 0.044 * q, 0.040 * q, 'Metal', fo, 10, 0.0)
        loft_rings(f'forearm gauntlet {side}', [
            hex_ring(fx, -0.15, 1.15, 0.068 * q, 0.080 * q, 1.25, 1.15, tilt_x=0.52),
            hex_ring((ux1 + fx) * 0.5, -0.06, 1.28, 0.092 * q, 0.105 * q, 1.25, 1.15, tilt_x=0.52),
            hex_ring(ux1, 0.00, 1.39, 0.080 * q, 0.092 * q, 1.20, 1.10, tilt_x=0.52),
        ], 'Armor', fo, bevel=0.008, bevel_seg=2)
        # Gauntlet outer ridge + glowing conduit
        strut(f'gauntlet crest {side}', (ux1 + sg*0.075*q, 0.02, 1.38), (fx + sg*0.062*q, -0.15, 1.16),
              0.024 * q, 0.040 * q, 'ArmorLight', fo, 0.004)
        glow_strip(f'gauntlet glow {side}', [(ux1 + sg*0.088*q, -0.01, 1.34), (fx + sg*0.075*q, -0.14, 1.18)], 0.006, fo)

        # --- Sculpted Articulated Mecha Hand ---
        hx = sg * (arm_x - 0.02)
        box_part(f'hand palm {side}', (hx, -0.22, 1.09), (0.075 * q, 0.115 * q, 0.095 * q), 'ArmorDark', ha, 0.008, rot=(0.45, 0, 0))
        box_part(f'hand backplate {side}', (hx + sg*0.032*q, -0.22, 1.10), (0.026 * q, 0.095 * q, 0.082 * q), 'Armor', ha, 0.005, rot=(0.45, 0, 0))
        # Tapered mechanical fingers curled naturally in combat grip
        box_part(f'hand fingers {side}', (hx - sg*0.012*q, -0.27, 1.04), (0.064 * q, 0.070 * q, 0.055 * q), 'Metal', ha, 0.006, rot=(0.65, 0, 0))


# ---------------------------------------------------------------------------
# Sculpted Zero-G Aerodynamic Hover-Flight Legs (NO Brick Boots!)
# ---------------------------------------------------------------------------
def sculpt_legs(kind):
    heavy = kind == 'tank'
    slim  = kind == 'assassin'
    q = 1.24 if heavy else (0.84 if slim else 1.00)
    w_hip = 0.21 if heavy else (0.15 if slim else 0.17)

    for side, sg in [('L', -1), ('R', 1)]:
        th = 'thigh.' + side
        sn = 'shin.' + side
        ft = 'foot.' + side

        tx0 = sg * w_hip
        tx1 = sg * (w_hip + 0.04)
        sx1 = sg * (w_hip + 0.05)

        # Hip ball-axis axle
        mech_joint(f'hip joint {side}', (tx0, 0.00, 1.09), 'X', 0.070 * q, 0.14 * q, th)

        # --- Aerodynamic Tapered Thigh ---
        cyl_part(f'thigh endo {side}', (tx0, 0.00, 1.08), (tx1, -0.02, 0.67), 0.062 * q, 0.054 * q, 'Undersuit', th, 10, 0.0)
        loft_rings(f'thigh main armor {side}', [
            hex_ring(tx1, -0.02, 0.69, 0.082 * q, 0.100 * q, 1.28, 1.15),
            hex_ring((tx0 + tx1) * 0.5, -0.02, 0.87, 0.112 * q, 0.135 * q, 1.32, 1.15),
            hex_ring(tx0, -0.01, 1.05, 0.118 * q, 0.130 * q, 1.25, 1.12, tilt_y=sg * 0.16),
            hex_ring(tx0 + sg*0.01, 0.00, 1.12, 0.088 * q, 0.095 * q, 1.15, 1.08, tilt_y=sg * 0.22),
        ], 'Armor', th, bevel=0.010, bevel_seg=2)
        # Outer faceted thigh cowl + side thruster vent + glowing energy seam
        plate_yz(f'thigh outer plate {side}',
                 [(-0.09, 0.78), (0.07, 0.76), (0.09, 1.02), (-0.08, 1.04)],
                 tx1 + sg * 0.114 * q, 0.028 * q, 'ArmorDark' if kind == 'ranger' else 'ArmorLight', th, bevel=0.005)
        glow_strip(f'thigh seam {side}',
                   [(tx0 + sg*0.07*q, -0.115*q, 1.02), (tx1 + sg*0.08*q, -0.105*q, 0.75)],
                   0.006, th)

        # --- Knee Joint & Iconic Swept Forward Knee-Blade Guard ---
        mech_joint(f'knee joint {side}', (tx1, -0.02, 0.66), 'X', 0.066 * q, 0.13 * q, sn)
        # Razor forward knee-blade armor (strong vertical line + aggressive mecha silhouette)
        loft_rings(f'knee blade guard {side}', [
            hex_ring(tx1, -0.14 * q, 0.56, 0.048 * q, 0.075 * q, 1.45, 0.65),
            hex_ring(tx1, -0.17 * q, 0.67, 0.078 * q, 0.098 * q, 1.50, 0.70),
            hex_ring(tx1, -0.14 * q, 0.78, 0.042 * q, 0.068 * q, 1.45, 0.65),
        ], 'ArmorLight', sn, bevel=0.007, bevel_seg=2)

        # --- Sleek Swept Aero-Greave / Hover-Thruster Calf ---
        cyl_part(f'shin endo {side}', (tx1, -0.02, 0.65), (sx1, 0.05, 0.22), 0.054 * q, 0.042 * q, 'Metal', sn, 10, 0.0)
        # Tapered aerospace lower leg shell (flared mid-calf for heavy tank, ultra-sharp blade for assassin!)
        calf_flare = 1.45 if heavy else (0.95 if slim else 1.12)
        loft_rings(f'shin aero greave {side}', [
            hex_ring(sx1, 0.04, 0.23, 0.062 * q, 0.088 * q, 1.32, 1.25),
            hex_ring((tx1 + sx1) * 0.5, 0.03, 0.41, 0.104 * q * calf_flare, 0.142 * q * calf_flare, 1.35, 1.38),
            hex_ring(tx1, 0.00, 0.60, 0.095 * q, 0.122 * q, 1.32, 1.22),
        ], 'Armor', sn, bevel=0.010, bevel_seg=2)

        # Front shin vertical keel plate + plasma trace
        loft_rings(f'shin front keel {side}', [
            hex_ring(sx1, -0.05 * q, 0.25, 0.040 * q, 0.065 * q, 1.45, 0.6),
            hex_ring((tx1 + sx1) * 0.5, -0.09 * q, 0.44, 0.065 * q, 0.085 * q, 1.45, 0.6),
            hex_ring(tx1, -0.08 * q, 0.59, 0.055 * q, 0.075 * q, 1.40, 0.6),
        ], 'ArmorDark', sn, bevel=0.006)
        glow_strip(f'shin energy line {side}',
                   [(tx1, -0.155 * q, 0.55), (sx1, -0.125 * q, 0.29)],
                   0.007, sn)

        # Lateral Calf Aero-Stabilizer Fin (gives flying jet-fighter leg profile!)
        airfoil_wing(f'calf aero fin {side}', [
            ((sx1 + sg*0.08*q, 0.04, 0.48), (0, 1, -0.35), (sg*0.30, 0, 1), 0.16 * q, 0.016, 0.35),
            ((sx1 + sg*0.21*q, 0.14, 0.34), (0, 1, -0.35), (sg*0.35, 0, 1), 0.12 * q, 0.008, 0.35),
        ], 'ArmorLight', sn, bevel=0.003)

        # Integrated Rear Calf Hover-Vernier Thruster Assembly!
        thruster_bell(f'calf main jet {side}',
                      (sx1, 0.13 * q * calf_flare, 0.42),
                      (sg * 0.10, 0.62, -0.78),
                      0.044 * q, 0.062 * q, 0.15, sn)
        if heavy:
            # Tank gets twin wide heavy hover-skirt lateral thrusters on each greave!
            thruster_bell(f'tank calf side jet {side}',
                          (sx1 + sg * 0.14 * q, 0.08, 0.36),
                          (sg * 0.42, 0.35, -0.84),
                          0.042 * q, 0.058 * q, 0.14, sn)

        # Exposed hydraulic calf piston
        cyl_part(f'shin hydraulic {side}', (tx1 + sg*0.08*q, 0.09, 0.60), (sx1 + sg*0.07*q, 0.12, 0.25),
                 0.016, 0.014, 'Trim', sn, 8, 0.0)

        # --- Sleek Pointed Zero-G Hover-Spur Foot (NO Brick Boots!!) ---
        mech_joint(f'ankle joint {side}', (sx1, 0.05, 0.22), 'X', 0.050 * q, 0.10 * q, ft)
        # Forward-angled sleek pointed aero-talon toe
        loft_rings(f'zero-g toe blade {side}', [
            hex_ring(sx1,  0.02, 0.21, 0.064 * q, 0.095, 1.35, 1.15, tilt_x=0.35),
            hex_ring(sx1, -0.07, 0.12, 0.068 * q, 0.115, 1.45, 1.05, tilt_x=0.45),
            hex_ring(sx1, -0.18, 0.04, 0.040 * q, 0.078, 1.60, 0.90, tilt_x=0.55),
            hex_ring(sx1, -0.25, 0.01, 0.015 * q, 0.032, 1.65, 0.80, tilt_x=0.60),
        ], 'ArmorDark' if slim else 'Armor', ft, bevel=0.006, bevel_seg=2)
        # Upper ankle guard shield
        loft_rings(f'ankle guard {side}', [
            hex_ring(sx1, -0.04, 0.18, 0.066 * q, 0.068, 1.35, 0.8),
            hex_ring(sx1, -0.06, 0.26, 0.072 * q, 0.075, 1.35, 0.8),
        ], 'ArmorLight', ft, bevel=0.005)
        # Rear pointed flight heel-spur + sole hover-thruster!
        loft_rings(f'zero-g heel spur {side}', [
            hex_ring(sx1, 0.09, 0.18, 0.042 * q, 0.060, 0.8, 1.5),
            hex_ring(sx1, 0.18, 0.09, 0.028 * q, 0.055, 0.8, 1.6),
            hex_ring(sx1, 0.24, 0.04, 0.012 * q, 0.025, 0.8, 1.6),
        ], 'Metal', ft, bevel=0.004)
        thruster_bell(f'sole hover jet {side}', (sx1, 0.02, 0.11), (0, 0.25, -0.97),
                      0.036 * q, 0.048 * q, 0.08, ft, shroud=False)


# ---------------------------------------------------------------------------
# Class 1: RANGER ("AX-07 VALKYRIE") — Variable Aero-Wings & Twin-Rail Rifle
# ---------------------------------------------------------------------------
def sculpt_ranger_flight_and_weapons():
    # --- Central Dorsal Ion Flight Core ---
    bp = 'backpack'
    loft_rings('ranger pack housing', [
        hex_ring(0, 0.25, 1.44, 0.16, 0.11, 0.9, 1.30),
        hex_ring(0, 0.28, 1.64, 0.23, 0.15, 0.9, 1.35),
        hex_ring(0, 0.26, 1.82, 0.18, 0.12, 0.9, 1.25),
    ], 'ArmorDark', bp, bevel=0.010, bevel_seg=2)
    loft_rings('ranger pack dorsal cowl', [
        hex_ring(0, 0.34, 1.52, 0.14, 0.08, 0.9, 1.40),
        hex_ring(0, 0.36, 1.72, 0.17, 0.09, 0.9, 1.40),
        hex_ring(0, 0.33, 1.84, 0.11, 0.06, 0.9, 1.30),
    ], 'Armor', bp, bevel=0.008)
    # Glowing dorsal capacitor slit (proud of rear cowl so it gleams from behind & 50 deg top!)
    plate_xz('ranger pack core', [(-0.042, 1.56), (0.042, 1.56), (0.056, 1.75), (-0.056, 1.75)],
             0.482, 0.022, 'Glow', bp, bevel=0.003)

    # Twin primary dorsal vectored ion thruster bells
    for sg in (-1, 1):
        thruster_bell(f'ranger main ion jet {sg}', (sg * 0.13, 0.33, 1.54),
                      (sg * 0.14, 0.72, -0.68), 0.068, 0.096, 0.24, bp)

    # --- Iconic Articulated Variable-Geometry Aero-Wings (4-Wing Valkyrie Array!) ---
    for side, sg in [('L', -1), ('R', 1)]:
        wr = 'wing_root.' + side
        ws = 'wing_sub.' + side
        mech_joint(f'wing hinge {side}', (sg * 0.20, 0.30, 1.72), 'Y', 0.062, 0.11, wr)

        # Upper Primary Swept Valkyrie Aero-Wing (pearl white + slate + cyan plasma feather!)
        airfoil_wing(f'ranger main wing upper {side}', [
            ((sg * 0.22, 0.32, 1.74), (0, 1, -0.25), (0, 0.25, 1), 0.30, 0.036, 0.32),
            ((sg * 0.62, 0.48, 1.98), (0, 1, -0.20), (0, 0.20, 1), 0.34, 0.028, 0.32),
            ((sg * 1.18, 0.72, 2.26), (0, 1, -0.15), (0, 0.15, 1), 0.24, 0.016, 0.30),
            ((sg * 1.52, 0.92, 2.38), (0, 1, -0.10), (0, 0.12, 1), 0.06, 0.005, 0.30),
        ], 'Armor', wr, bevel=0.005)
        # Secondary navy-slate layered forward strake on top of main wing
        airfoil_wing(f'ranger wing strake {side}', [
            ((sg * 0.24, 0.29, 1.78), (0, 1, -0.25), (0, 0.25, 1), 0.18, 0.028, 0.30),
            ((sg * 0.76, 0.48, 2.07), (0, 1, -0.18), (0, 0.20, 1), 0.17, 0.018, 0.30),
            ((sg * 1.12, 0.65, 2.25), (0, 1, -0.14), (0, 0.16, 1), 0.05, 0.006, 0.30),
        ], 'ArmorLight', wr, bevel=0.004)
        # Glowing Cyan Plasma Trailing Feather-Blade (shimmers beautifully from 50 deg overhead!)
        airfoil_wing(f'ranger plasma feather {side}', [
            ((sg * 0.34, 0.48, 1.76), (0, 1, -0.22), (0, 0.22, 1), 0.14, 0.008, 0.35),
            ((sg * 0.88, 0.71, 2.06), (0, 1, -0.18), (0, 0.18, 1), 0.16, 0.007, 0.35),
            ((sg * 1.44, 0.98, 2.32), (0, 1, -0.12), (0, 0.14, 1), 0.04, 0.003, 0.35),
        ], 'Blade', wr, bevel=0.0)
        # Wing-mounted auxiliary booster pod
        thruster_bell(f'ranger wing pod {side}', (sg * 0.56, 0.48, 1.90),
                      (sg * 0.22, 0.78, -0.58), 0.044, 0.058, 0.18, wr)

        # Lower Swept Sub-Stabilizer Wing (completes iconic X-wing silhouette!)
        airfoil_wing(f'ranger sub wing {side}', [
            ((sg * 0.22, 0.30, 1.56), (0, 1, 0.22), (0, -0.20, 1), 0.22, 0.024, 0.32),
            ((sg * 0.62, 0.48, 1.40), (0, 1, 0.18), (0, -0.18, 1), 0.20, 0.015, 0.32),
            ((sg * 0.98, 0.68, 1.24), (0, 1, 0.14), (0, -0.14, 1), 0.05, 0.005, 0.32),
        ], 'ArmorDark', ws, bevel=0.004)
        glow_strip(f'ranger sub wing edge {side}',
                   [(sg * 0.28, 0.32, 1.54), (sg * 0.64, 0.48, 1.39), (sg * 0.95, 0.66, 1.25)],
                   0.007, ws)

    # --- HYPERION-7 Electromagnetic Twin-Rail Ion Sniper Rifle (Cleanly held by hand.R!) ---
    # Mounted squarely to forearm.R/hand.R (+X side = x≈0.50), pointing straight forward (-Y)!
    h = 'hand.R'
    rx, ry, rz = 0.50, -0.26, 1.07
    # Pistol grip cleanly inside hand.R
    strut('rifle grip', (rx, ry + 0.01, rz - 0.03), (rx, ry - 0.03, rz + 0.09), 0.042, 0.052, 'Undersuit', h, 0.005)
    # Sculpted receiver chassis extending neatly back past wrist & forward to barrels
    loft_rings('rifle receiver', [
        hex_ring(rx, ry + 0.34, rz + 0.10, 0.055, 0.068, 1.2, 1.1),
        hex_ring(rx, ry + 0.02, rz + 0.12, 0.074, 0.095, 1.2, 1.1),
        hex_ring(rx, ry - 0.34, rz + 0.12, 0.068, 0.088, 1.2, 1.1),
    ], 'ArmorDark', h, bevel=0.007)
    # Pearl-white outer receiver shroud panels
    box_part('rifle upper cowl', (rx, ry - 0.12, rz + 0.175), (0.115, 0.52, 0.068), 'Armor', h, 0.008)
    box_part('rifle rear stock', (rx, ry + 0.36, rz + 0.08), (0.070, 0.28, 0.105), 'Armor', h, 0.008)
    box_part('rifle capacitor mag', (rx, ry - 0.18, rz + 0.01), (0.062, 0.15, 0.145), 'ArmorLight', h, 0.006, rot=(0.18, 0, 0))
    # Twin parallel electromagnetic rail barrels (upper & lower rails with glowing cyan plasma channel!)
    for dz in (0.165, 0.082):
        box_part(f'rifle rail {dz:.2f}', (rx, ry - 0.78, rz + dz), (0.068, 0.92, 0.046), 'Armor', h, 0.006)
        cyl_part(f'rifle inner rod {dz:.2f}', (rx, ry - 0.34, rz + dz), (rx, ry - 1.26, rz + dz), 0.020, 0.018, 'Metal', h, 8, 0.0)
    # Glowing cyan magnetic accelerator core visible right between the twin rails!
    box_part('rifle plasma rail', (rx, ry - 0.78, rz + 0.123), (0.036, 0.88, 0.028), 'Glow', h, 0.002)
    # Barrel isolator clamp rings + angular muzzle accelerator fork
    for dy in (-0.52, -0.82, -1.12):
        box_part(f'rifle clamp {dy:.2f}', (rx, ry + dy, rz + 0.123), (0.092, 0.042, 0.142), 'ArmorDark', h, 0.005)
    box_part('rifle muzzle brake', (rx, ry - 1.28, rz + 0.123), (0.085, 0.12, 0.115), 'Trim', h, 0.006)
    # Long-range cyber-optics scope mounted on top rail
    cyl_part('rifle scope tube', (rx, ry - 0.02, rz + 0.245), (rx, ry - 0.38, rz + 0.245), 0.036, 0.044, 'ArmorDark', h, 10, 0.004)
    cyl_part('rifle scope lens', (rx, ry - 0.38, rz + 0.245), (rx, ry - 0.40, rz + 0.245), 0.036, 0.036, 'Visor', h, 10, 0.0)

    # Left Forearm Tactical Energy Stabilizer Buckler (gives crisp left-arm silhouette!)
    foL = 'forearm.L'
    airfoil_wing('ranger arm stabilizer', [
        ((-0.58, -0.02, 1.38), (0, -1, -0.60), (-1, 0, 0.15), 0.22, 0.022, 0.35),
        ((-0.64, -0.22, 1.14), (0, -1, -0.60), (-1, 0, 0.15), 0.26, 0.016, 0.35),
        ((-0.62, -0.34, 1.00), (0, -1, -0.60), (-1, 0, 0.15), 0.08, 0.006, 0.35),
    ], 'ArmorLight', foL, bevel=0.004)
    glow_strip('ranger buckler glow', [(-0.64, -0.06, 1.32), (-0.66, -0.26, 1.10)], 0.007, foL)


# ---------------------------------------------------------------------------
# Class 2: TANK ("BG-09 AEGIS VANGUARD") — Quad-Booster Fortress + Shield & Siege Cannon
# ---------------------------------------------------------------------------
def sculpt_tank_flight_and_weapons():
    bp = 'backpack'
    # Heavy central armored reactor spine
    loft_rings('tank pack core', [
        octagon_ring(0, 0.28, 1.42, 0.26, 0.16, 0.90, 0.95),
        octagon_ring(0, 0.32, 1.66, 0.32, 0.20, 0.90, 0.95),
        octagon_ring(0, 0.28, 1.88, 0.26, 0.16, 0.90, 0.95),
    ], 'ArmorDark', bp, bevel=0.012, bevel_seg=2)
    box_part('tank dorsal armor', (0, 0.42, 1.68), (0.34, 0.16, 0.34), 'Armor', bp, 0.012)
    for z in (1.58, 1.66, 1.74):
        box_part(f'tank radiator {z:.2f}', (0, 0.505, z), (0.24, 0.025, 0.032), 'Glow', bp, 0.003)

    # --- Twin Over-Shoulder Heavy Quad-Thruster Assault Boost-Binders! ---
    for side, sg in [('L', -1), ('R', 1)]:
        wr = 'wing_root.' + side
        ws = 'wing_sub.' + side
        mech_joint(f'tank binder arm {side}', (sg * 0.24, 0.34, 1.76), 'Y', 0.080, 0.14, wr)
        strut(f'tank binder pylon {side}', (sg * 0.24, 0.34, 1.76), (sg * 0.56, 0.50, 1.94), 0.085, 0.085, 'Metal', wr, 0.008)

        # Massive Angular Armored Booster Pod Housing (true thick aerospace AC assault thruster block!)
        bx, by, bz = sg * 0.62, 0.52, 1.94
        loft_rings(f'tank booster pod {side}', [
            hex_ring(bx - sg*0.04, by - 0.14, bz - 0.16, 0.21, 0.22, 1.15, 1.15, tilt_x=0.36, tilt_y=sg * -0.14),
            hex_ring(bx + sg*0.02, by - 0.02, bz + 0.00, 0.26, 0.26, 1.20, 1.18, tilt_x=0.36, tilt_y=sg * -0.14),
            hex_ring(bx + sg*0.06, by + 0.10, bz + 0.14, 0.23, 0.23, 1.15, 1.15, tilt_x=0.36, tilt_y=sg * -0.14),
            hex_ring(bx + sg*0.08, by + 0.18, bz + 0.22, 0.14, 0.15, 1.10, 1.10, tilt_x=0.36, tilt_y=sg * -0.14),
        ], 'ArmorDark', wr, bevel=0.012, bevel_seg=2)
        # Sculpted titanium outer reactive cowl embracing the pod + front intake glow
        box_part(f'tank pod shield {side}', (bx + sg*0.06, by - 0.02, bz + 0.06), (0.34, 0.34, 0.26),
                 'Armor', wr, 0.014, rot=(0.36, sg * -0.16, sg * 0.18))
        box_part(f'tank pod intake {side}', (bx + sg*0.04, by - 0.18, bz + 0.08), (0.20, 0.05, 0.12),
                 'Trim', wr, 0.006, rot=(0.36, sg * -0.16, sg * 0.18))
        box_part(f'tank pod glow {side}', (bx + sg*0.04, by - 0.205, bz + 0.08), (0.14, 0.025, 0.055),
                 'Glow', wr, 0.003, rot=(0.36, sg * -0.16, sg * 0.18))
        # Welded Upper Swept Stabilizer Fin emerging cleanly from the top of the booster pod
        airfoil_wing(f'tank binder fin {side}', [
            ((bx + sg*0.02, by + 0.02, bz + 0.12), (0, 1, -0.16), (sg*0.18, 0, 1), 0.36, 0.036, 0.32),
            ((bx + sg*0.42, by + 0.22, bz + 0.30), (0, 1, -0.14), (sg*0.24, 0, 1), 0.26, 0.020, 0.32),
            ((bx + sg*0.66, by + 0.38, bz + 0.38), (0, 1, -0.10), (sg*0.28, 0, 1), 0.08, 0.007, 0.32),
        ], 'ArmorLight', wr, bevel=0.006)
        glow_strip(f'tank binder glow {side}', [
            (bx + sg*0.04, by - 0.12, bz + 0.16),
            (bx + sg*0.40, by + 0.10, bz + 0.30),
            (bx + sg*0.60, by + 0.28, bz + 0.37),
        ], 0.010, wr)

        # Dual Heavy Vectored Thruster Bells per Binder (4 massive main thrusters total!)
        thruster_bell(f'tank main jet A {side}', (bx - sg*0.06, by + 0.12, bz - 0.10),
                      (sg * 0.12, 0.72, -0.68), 0.086, 0.118, 0.26, wr)
        thruster_bell(f'tank main jet B {side}', (bx + sg*0.14, by + 0.06, bz - 0.06),
                      (sg * 0.26, 0.70, -0.66), 0.074, 0.102, 0.24, wr)

        # Lower Armored Stabilizer Skirt-Flap on wing_sub
        airfoil_wing(f'tank lower flap {side}', [
            ((sg * 0.26, 0.38, 1.56), (0, 1, 0.25), (0, -0.25, 1), 0.26, 0.034, 0.32),
            ((sg * 0.68, 0.56, 1.38), (0, 1, 0.20), (0, -0.20, 1), 0.20, 0.020, 0.32),
        ], 'ArmorDark', ws, bevel=0.006)
        thruster_bell(f'tank lower vernier {side}', (sg * 0.46, 0.48, 1.46),
                      (sg * 0.22, 0.65, -0.72), 0.048, 0.064, 0.15, ws, shroud=False)

    # --- Left Forearm: AEGIS-IX Multi-Layered Angular Kite Shield ---
    shL = 'forearm.L'
    # Mounting bracket connecting cleanly to forearm.L (-X side)
    strut('shield mount', (-0.61, -0.06, 1.28), (-0.80, -0.14, 1.24), 0.08, 0.09, 'Metal', shL, 0.006)
    # Sculpted hexagonal-kite fortress shield angled sleekly forward-left!
    sx, sy, sz = -0.86, -0.18, 1.24
    rot_s = (0.28, 0.0, 0.48)
    plate_yz('aegis shield base', [
        (-0.34, sz + 0.42), (0.34, sz + 0.38),
        (0.42,  sz + 0.08), (0.30, sz - 0.48),
        (0.00,  sz - 0.68), (-0.30, sz - 0.48), (-0.42, sz + 0.08),
    ], sx, 0.085, 'ArmorDark', shL, bevel=0.012, rot=rot_s)
    # Raised outer armored ceramic plates (upper & lower reactive slabs!)
    plate_yz('aegis upper slab', [
        (-0.28, sz + 0.38), (0.28, sz + 0.34),
        (0.34,  sz + 0.06), (-0.34, sz + 0.06),
    ], sx - 0.048, 0.048, 'Armor', shL, bevel=0.009, rot=rot_s)
    plate_yz('aegis lower slab', [
        (-0.33, sz - 0.02), (0.33, sz - 0.02),
        (0.24,  sz - 0.44), (0.00, sz - 0.60), (-0.24, sz - 0.44),
    ], sx - 0.048, 0.048, 'ArmorLight', shL, bevel=0.009, rot=rot_s)
    # Anodized gold central structural keel + recessed glowing amber force-field energy matrix!
    plate_yz('aegis gold keel', [
        (-0.07, sz + 0.32), (0.07, sz + 0.32),
        (0.09,  sz - 0.02), (0.05, sz - 0.56), (-0.05, sz - 0.56), (-0.09, sz - 0.02),
    ], sx - 0.076, 0.032, 'Trim', shL, bevel=0.005, rot=rot_s)
    plate_yz('aegis energy emitter', [
        (-0.22, sz + 0.05), (0.22, sz + 0.05),
        (0.18,  sz - 0.05), (-0.18, sz - 0.05),
    ], sx - 0.078, 0.022, 'Glow', shL, bevel=0.003, rot=rot_s)
    plate_yz('aegis energy diamond', [
        (0.0, sz + 0.24), (0.14, sz + 0.02), (0.0, sz - 0.28), (-0.14, sz + 0.02),
    ], sx - 0.088, 0.018, 'Visor', shL, bevel=0.002, rot=rot_s)

    # --- Right Forearm/Hand: VULCAN-09 Heavy Twin-Rail Plasma Siege Cannon ---
    hR = 'forearm.R'
    cx, cy, cz = 0.68, -0.22, 1.14
    # Heavy cannon cradle mounting seamlessly onto forearm.R
    loft_rings('cannon receiver', [
        octagon_ring(cx, cy + 0.32, cz + 0.02, 0.115, 0.120),
        octagon_ring(cx, cy - 0.04, cz + 0.02, 0.145, 0.150),
        octagon_ring(cx, cy - 0.48, cz + 0.02, 0.130, 0.135),
    ], 'ArmorDark', hR, bevel=0.010, bevel_seg=2)
    # Ceramic-silver armored upper cowling + gold reinforcement side rails
    box_part('cannon upper shroud', (cx, cy - 0.26, cz + 0.125), (0.22, 0.64, 0.095), 'ArmorLight', hR, 0.010)
    box_part('cannon gold spine',   (cx, cy - 0.28, cz + 0.178), (0.075, 0.60, 0.028), 'Trim', hR, 0.004)
    # Twin Heavy Electromagnetic Accelerator Barrels extending forward!
    for dx in (-0.068, 0.068):
        cyl_part(f'siege barrel {dx:.2f}', (cx + dx, cy - 0.44, cz + 0.02), (cx + dx, cy - 1.08, cz + 0.02),
                 0.052, 0.044, 'Metal', hR, 12, 0.004)
        cyl_part(f'siege muzzle ring {dx:.2f}', (cx + dx, cy - 0.96, cz + 0.02), (cx + dx, cy - 1.07, cz + 0.02),
                 0.062, 0.056, 'Armor', hR, 10, 0.004)
        cyl_part(f'siege bore glow {dx:.2f}', (cx + dx, cy - 1.06, cz + 0.02), (cx + dx, cy - 1.095, cz + 0.02),
                 0.032, 0.032, 'Visor', hR, 10, 0.0)
    # Glowing solar-amber thermal accelerator coils between barrels
    for dy in (-0.56, -0.72, -0.88):
        box_part(f'siege coil {dy:.2f}', (cx, cy + dy, cz + 0.02), (0.19, 0.032, 0.088), 'Glow', hR, 0.003)
    # Rear heavy capacitor drum
    cyl_part('cannon capacitor', (cx, cy + 0.26, cz - 0.05), (cx, cy + 0.44, cz - 0.05), 0.088, 0.080, 'Trim', hR, 10, 0.005)


# ---------------------------------------------------------------------------
# Class 3: ASSASSIN ("PX-11 SERAPH PHANTOM") — Six-Blade Seraph Wings & Dual Plasma Tonfas
# ---------------------------------------------------------------------------
def sculpt_assassin_flight_and_weapons():
    bp = 'backpack'
    # Ultra-sleek diamond vertebral flight spine
    loft_rings('assassin dorsal spine', [
        hex_ring(0, 0.22, 1.44, 0.11, 0.09, 0.9, 1.45),
        hex_ring(0, 0.25, 1.66, 0.16, 0.12, 0.9, 1.50),
        hex_ring(0, 0.23, 1.82, 0.12, 0.09, 0.9, 1.40),
    ], 'ArmorDark', bp, bevel=0.008)
    plate_xz('assassin spine blade', [(0, 1.85), (0.045, 1.66), (0, 1.45), (-0.045, 1.66)],
             0.365, 0.024, 'Trim', bp, bevel=0.004)
    glow_strip('assassin dorsal core', [(0, 0.392, 1.50), (0, 0.405, 1.78)], 0.008, bp)

    # Twin sleek high-output stealth micro-thrusters
    for sg in (-1, 1):
        thruster_bell(f'assassin dorsal jet {sg}', (sg * 0.11, 0.28, 1.54),
                      (sg * 0.15, 0.72, -0.68), 0.052, 0.072, 0.22, bp)

    # --- Iconic SIX-BLADE Cyber-Seraph Articulated Wing Array (3 tiered razor blades per side!) ---
    for side, sg in [('L', -1), ('R', 1)]:
        wr = 'wing_root.' + side
        ws = 'wing_sub.' + side
        mech_joint(f'seraph wing pylon {side}', (sg * 0.17, 0.28, 1.72), 'Y', 0.052, 0.09, wr)

        # Tier 1 (Upper Long Crescent Seraph Wing Blade — obsidian/silver spar + electric violet plasma edge!)
        airfoil_wing(f'seraph wing upper spar {side}', [
            ((sg * 0.18, 0.30, 1.75), (0, 1, -0.30), (0, 0.28, 1), 0.20, 0.024, 0.28),
            ((sg * 0.68, 0.46, 2.08), (0, 1, -0.22), (0, 0.22, 1), 0.22, 0.018, 0.28),
            ((sg * 1.24, 0.72, 2.34), (0, 1, -0.15), (0, 0.15, 1), 0.16, 0.012, 0.28),
            ((sg * 1.62, 1.02, 2.40), (0, 1, -0.10), (0, 0.12, 1), 0.04, 0.004, 0.28),
        ], 'Armor', wr, bevel=0.004)
        # Razor Chrome Leading Edge Trim
        strut(f'seraph chrome edge {side}', (sg * 0.22, 0.22, 1.78), (sg * 1.20, 0.62, 2.35), 0.020, 0.026, 'Trim', wr, 0.003)
        # Luminous Electric-Violet Plasma Wing-Feather Sheet trailing behind Tier 1!
        airfoil_wing(f'seraph plasma feather 1 {side}', [
            ((sg * 0.28, 0.44, 1.76), (0, 1, -0.25), (0, 0.24, 1), 0.16, 0.007, 0.35),
            ((sg * 0.86, 0.66, 2.10), (0, 1, -0.18), (0, 0.18, 1), 0.22, 0.006, 0.35),
            ((sg * 1.54, 1.06, 2.34), (0, 1, -0.10), (0, 0.12, 1), 0.06, 0.003, 0.35),
        ], 'Blade', wr, bevel=0.0)

        # Tier 2 (Mid Swept Knife-Wing Feather on wing_root)
        airfoil_wing(f'seraph wing mid spar {side}', [
            ((sg * 0.20, 0.34, 1.66), (0, 1, -0.10), (0, 0.12, 1), 0.16, 0.018, 0.28),
            ((sg * 0.72, 0.58, 1.76), (0, 1, -0.06), (0, 0.10, 1), 0.18, 0.013, 0.28),
            ((sg * 1.28, 0.90, 1.80), (0, 1, -0.02), (0, 0.08, 1), 0.04, 0.004, 0.28),
        ], 'ArmorLight', wr, bevel=0.003)
        airfoil_wing(f'seraph plasma feather 2 {side}', [
            ((sg * 0.32, 0.46, 1.65), (0, 1, -0.08), (0, 0.10, 1), 0.12, 0.006, 0.35),
            ((sg * 0.84, 0.72, 1.74), (0, 1, -0.04), (0, 0.08, 1), 0.16, 0.005, 0.35),
            ((sg * 1.26, 0.96, 1.78), (0, 1, -0.02), (0, 0.06, 1), 0.04, 0.002, 0.35),
        ], 'Blade', wr, bevel=0.0)

        # Tier 3 (Lower Swept Tail-Fin Feather on wing_sub)
        airfoil_wing(f'seraph wing lower spar {side}', [
            ((sg * 0.18, 0.30, 1.54), (0, 1, 0.24), (0, -0.22, 1), 0.16, 0.018, 0.28),
            ((sg * 0.62, 0.52, 1.36), (0, 1, 0.20), (0, -0.18, 1), 0.16, 0.012, 0.28),
            ((sg * 1.02, 0.78, 1.18), (0, 1, 0.16), (0, -0.14, 1), 0.04, 0.004, 0.28),
        ], 'Armor', ws, bevel=0.003)
        airfoil_wing(f'seraph plasma feather 3 {side}', [
            ((sg * 0.28, 0.42, 1.50), (0, 1, 0.22), (0, -0.20, 1), 0.12, 0.006, 0.35),
            ((sg * 0.72, 0.66, 1.32), (0, 1, 0.18), (0, -0.16, 1), 0.14, 0.005, 0.35),
            ((sg * 1.00, 0.84, 1.16), (0, 1, 0.14), (0, -0.12, 1), 0.03, 0.002, 0.35),
        ], 'Blade', ws, bevel=0.0)

        # --- Dual Forearm-Integrated Plasma Twin-Blades ("PHANTOM EDGE") ---
        fo = 'forearm.' + side
        hx = sg * 0.55
        # Sleek metallic gauntlet blade emitter cradle along outer forearm
        strut(f'tonfa mount {side}', (sg * 0.56, -0.02, 1.34), (hx + sg*0.02, -0.24, 1.08),
              0.040, 0.065, 'ArmorLight', fo, 0.005)
        box_part(f'tonfa guard {side}', (hx + sg*0.03, -0.26, 1.06), (0.045, 0.12, 0.095), 'Trim', fo, 0.005, rot=(0.45, 0, 0))

        # Long Swept Forward-Outward Main Plasma Blade (dramatic predatory X-silhouette from 50 deg!)
        airfoil_wing(f'phantom blade fwd {side}', [
            ((hx + sg*0.03, -0.26, 1.06), (sg*0.25, 0.35, 1), (sg*0.92, -0.30, 0), 0.095, 0.011, 0.28),
            ((hx + sg*0.18, -0.58, 0.94), (sg*0.22, 0.32, 1), (sg*0.92, -0.30, 0), 0.125, 0.009, 0.28),
            ((hx + sg*0.32, -0.94, 0.84), (sg*0.18, 0.28, 1), (sg*0.92, -0.30, 0), 0.075, 0.006, 0.28),
            ((hx + sg*0.40, -1.20, 0.78), (sg*0.15, 0.25, 1), (sg*0.92, -0.30, 0), 0.012, 0.002, 0.28),
        ], 'Blade', fo, bevel=0.0)
        # Metallic inner blade spine reinforcing the root
        strut(f'phantom spine {side}', (hx + sg*0.03, -0.26, 1.07), (hx + sg*0.18, -0.64, 0.94), 0.018, 0.032, 'Trim', fo, 0.003)

        # Swept Backwards Forearm Tonfa-Winglet Plasma Spur (streams behind elbow!)
        airfoil_wing(f'phantom blade aft {side}', [
            ((sg * 0.56,  0.00, 1.34), (sg*0.20, -0.35, 1), (sg*0.92, 0.25, 0), 0.080, 0.009, 0.28),
            ((sg * 0.68,  0.30, 1.48), (sg*0.18, -0.30, 1), (sg*0.92, 0.25, 0), 0.092, 0.007, 0.28),
            ((sg * 0.78,  0.60, 1.58), (sg*0.14, -0.25, 1), (sg*0.92, 0.25, 0), 0.014, 0.002, 0.28),
        ], 'Blade', fo, bevel=0.0)


# ---------------------------------------------------------------------------
# AAA Zero-G Hover-Flight Animations (HoverIdle, HoverFlight, Fire, Dash)
# ---------------------------------------------------------------------------
def build_animations(kind):
    scene = bpy.context.scene
    scene.render.fps = 30
    ad = RIG.animation_data_create()
    ad.action = None

    def make_clip(name, end_frame, keyframes):
        action = bpy.data.actions.new(name)
        ad.action = action
        for frame, pose_dict in keyframes:
            scene.frame_set(frame)
            for pb in RIG.pose.bones:
                pb.rotation_mode = 'XYZ'
                pb.rotation_euler = pose_dict.get(pb.name, (0.0, 0.0, 0.0))
                pb.keyframe_insert(data_path='rotation_euler', frame=frame, group=pb.name)
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_frame_start = 1
        strip.action_frame_end = end_frame
        track.mute = False
        ad.action = None

    # Helper to merge base pose dict with dynamic delta
    def blend_pose(base, delta):
        out = dict(base)
        for k, v in delta.items():
            if k in out:
                out[k] = tuple(out[k][i] + v[i] for i in range(3))
            else:
                out[k] = v
        return out

    # --- 1. HoverIdle (Poised weightless Zero-G aerial combat stance!) ---
    # Wing bones (wing_root, wing_sub, skirt) have world-aligned orthogonal axes (+X right, +Y back, +Z up):
    #   +Z on R / -Z on L sweeps wings BACK symmetrically into high-speed delta!
    #   -Y on R / +Y on L lifts wing tips UP (dihedral flare) symmetrically!
    #   -X pitches wing rear DOWN / +X pitches wing rear UP symmetrically!
    if kind == 'ranger':
        idle_base = {
            'hips':        ( 0.05, 0.00,  0.04),
            'spine':       ( 0.05, 0.00, -0.04),
            'chest':       ( 0.03, 0.00, -0.02),
            'head':        (-0.09, 0.00,  0.02),
            # Iconic asymmetrical zero-G hover legs: R knee gracefully bent, L leg swept gently back, toes pointed!
            'thigh.R':     (-0.34,  0.05, -0.06),
            'shin.R':      ( 0.62,  0.00,  0.00),
            'foot.R':      ( 0.34,  0.00,  0.00),
            'thigh.L':     ( 0.18, -0.06,  0.06),
            'shin.L':      ( 0.24,  0.00,  0.00),
            'foot.L':      ( 0.42,  0.00,  0.00),
            # Combat-ready rifle arm aimed straight forward (-Y), ZERO body crossing!
            'shoulder.R':  ( 0.04,  0.00,  0.02),
            'upper_arm.R': (-0.28,  0.00, -0.05),
            'forearm.R':   (-0.24,  0.00,  0.00),
            'hand.R':      ( 0.48,  0.00,  0.00),
            'shoulder.L':  (-0.04,  0.00,  0.06),
            'upper_arm.L': (-0.10,  0.00, -0.16),
            'forearm.L':   (-0.26,  0.00, -0.08),
            # Valkyrie wings poised wide and symmetrical
            'wing_root.L': ( 0.00,  0.04,  0.08),
            'wing_root.R': ( 0.00, -0.04, -0.08),
            'wing_sub.L':  ( 0.00, -0.04,  0.06),
            'wing_sub.R':  ( 0.00,  0.04, -0.06),
            'skirt.L':     ( 0.10,  0.04, -0.04),
            'skirt.R':     ( 0.10, -0.04,  0.04),
        }
    elif kind == 'tank':
        idle_base = {
            'hips':        ( 0.04, 0.00, -0.04),
            'spine':       ( 0.04, 0.00,  0.04),
            'chest':       ( 0.03, 0.00,  0.02),
            'head':        (-0.07, 0.00, -0.02),
            # Commanding wide-poised Heavy Hover stance
            'thigh.R':     (-0.22,  0.08, -0.08),
            'shin.R':      ( 0.44,  0.00,  0.00),
            'foot.R':      ( 0.28,  0.00,  0.00),
            'thigh.L':     ( 0.16, -0.08,  0.08),
            'shin.L':      ( 0.28,  0.00,  0.00),
            'foot.L':      ( 0.34,  0.00,  0.00),
            # Shield held defensively forward-left, heavy siege cannon aimed straight forward-right!
            'shoulder.L':  ( 0.05,  0.00,  0.06),
            'upper_arm.L': (-0.22,  0.00, -0.10),
            'forearm.L':   (-0.24,  0.00,  0.08),
            'shoulder.R':  ( 0.03,  0.00,  0.02),
            'upper_arm.R': (-0.22,  0.00, -0.06),
            'forearm.R':   (-0.22,  0.00,  0.00),
            # Heavy quad-boosters angled symmetrically
            'wing_root.L': ( 0.00,  0.03,  0.04),
            'wing_root.R': ( 0.00, -0.03, -0.04),
            'wing_sub.L':  ( 0.00, -0.03,  0.04),
            'wing_sub.R':  ( 0.00,  0.03, -0.04),
            'skirt.L':     ( 0.08,  0.04, -0.03),
            'skirt.R':     ( 0.08, -0.04,  0.03),
        }
    else:  # assassin
        idle_base = {
            'hips':        ( 0.08, 0.00,  0.06),
            'spine':       ( 0.09, 0.00, -0.06),
            'chest':       ( 0.06, 0.00, -0.04),
            'head':        (-0.15, 0.00,  0.04),
            # Ultra-stylish predatory Zero-G floating crouch (Jehuty / Anubis vibe!)
            'thigh.R':     (-0.44,  0.06, -0.08),
            'shin.R':      ( 0.78,  0.00,  0.00),
            'foot.R':      ( 0.45,  0.00,  0.00),
            'thigh.L':     ( 0.24, -0.06,  0.06),
            'shin.L':      ( 0.34,  0.00,  0.00),
            'foot.L':      ( 0.50,  0.00,  0.00),
            # Dual plasma blades swept out aggressively
            'shoulder.L':  (-0.05,  0.00,  0.10),
            'upper_arm.L': ( 0.06,  0.00, -0.24),
            'forearm.L':   (-0.18,  0.00, -0.14),
            'shoulder.R':  (-0.05,  0.00, -0.10),
            'upper_arm.R': (-0.12,  0.00,  0.20),
            'forearm.R':   (-0.20,  0.00,  0.12),
            # Seraph six-blade wings fanned majestically and symmetrically!
            'wing_root.L': ( 0.00,  0.06,  0.10),
            'wing_root.R': ( 0.00, -0.06, -0.10),
            'wing_sub.L':  ( 0.00, -0.05,  0.08),
            'wing_sub.R':  ( 0.00,  0.05, -0.08),
            'skirt.L':     ( 0.14,  0.06, -0.05),
            'skirt.R':     ( 0.14, -0.06,  0.05),
        }

    # Subtle breathing/weightless floating cycle across 60 frames
    idle_frames = []
    for f, s in [(1, 0.0), (16, 1.0), (31, 0.0), (46, -1.0), (61, 0.0)]:
        idle_frames.append((f, blend_pose(idle_base, {
            'spine':       ( 0.025 * s, 0.0, 0.012 * s),
            'chest':       (-0.020 * s, 0.0, 0.0),
            'head':        (-0.018 * s, 0.0, 0.0),
            'thigh.R':     (-0.045 * s, 0.0, 0.0),
            'shin.R':      ( 0.060 * s, 0.0, 0.0),
            'thigh.L':     ( 0.035 * s, 0.0, 0.0),
            'shin.L':      ( 0.040 * s, 0.0, 0.0),
            'wing_root.L': ( 0.00,  0.055 * s,  0.060 * s),
            'wing_root.R': ( 0.00, -0.055 * s, -0.060 * s),
            'wing_sub.L':  ( 0.00, -0.040 * s,  0.045 * s),
            'wing_sub.R':  ( 0.00,  0.040 * s, -0.045 * s),
            'skirt.L':     ( 0.050 * s, 0.0, -0.025 * s),
            'skirt.R':     ( 0.050 * s, 0.0,  0.025 * s),
        })))
    make_clip('HoverIdle', 60, idle_frames)

    # --- 2. HoverFlight (Sleek High-Speed Zero-G Ace Boost-Glide!) ---
    sweep = 0.42 if kind != 'tank' else 0.22
    flight_base = {
        'hips':        ( 0.14, 0.00,  0.00),
        'spine':       ( 0.15, 0.00,  0.00),
        'chest':       ( 0.10, 0.00,  0.00),
        'head':        (-0.32, 0.00,  0.00),  # Eyes locked ahead despite forward glide!
        # Streamlined swept-back zero-G legs like a jet fighter / Armored Core Overboost!
        'thigh.R':     ( 0.34,  0.04, -0.04),
        'shin.R':      ( 0.42,  0.00,  0.00),
        'foot.R':      ( 0.56,  0.00,  0.00),
        'thigh.L':     ( 0.46, -0.04,  0.04),
        'shin.L':      ( 0.24,  0.00,  0.00),
        'foot.L':      ( 0.60,  0.00,  0.00),
        # Wings swept SYMMETRICALLY back & flattened into supersonic arrow-delta geometry!
        'wing_root.L': (-0.06, -0.20, -sweep),
        'wing_root.R': (-0.06,  0.20,  sweep),
        'wing_sub.L':  (-0.06,  0.10, -sweep * 0.72),
        'wing_sub.R':  (-0.06, -0.10,  sweep * 0.72),
        'skirt.L':     ( 0.34,  0.08, -0.16),
        'skirt.R':     ( 0.34, -0.08,  0.16),
    }
    if kind == 'ranger':
        flight_base.update({
            'upper_arm.R': (-0.30, 0.0, -0.06),
            'forearm.R':   (-0.22, 0.0,  0.00),
            'hand.R':      ( 0.44, 0.0,  0.00),
            'upper_arm.L': ( 0.34, 0.0, -0.22),
            'forearm.L':   (-0.14, 0.0, -0.10),
        })
    elif kind == 'tank':
        flight_base.update({
            'upper_arm.L': (-0.30, 0.0, -0.08),
            'forearm.L':   (-0.24, 0.0,  0.12),
            'upper_arm.R': (-0.26, 0.0, -0.06),
            'forearm.R':   (-0.20, 0.0,  0.00),
        })
    else:  # assassin — arms & twin plasma blades swept sharply back like jet wings!
        flight_base.update({
            'upper_arm.L': ( 0.46, 0.0, -0.28),
            'forearm.L':   (-0.10, 0.0, -0.16),
            'upper_arm.R': ( 0.44, 0.0,  0.28),
            'forearm.R':   (-0.10, 0.0,  0.16),
        })

    flight_frames = []
    for f, s in [(1, 0.0), (8, 1.0), (16, 0.0), (24, -1.0), (31, 0.0)]:
        flight_frames.append((f, blend_pose(flight_base, {
            'wing_root.L': ( 0.00,  0.025 * s, -0.035 * s),
            'wing_root.R': ( 0.00, -0.025 * s,  0.035 * s),
            'wing_sub.L':  ( 0.00, -0.020 * s, -0.025 * s),
            'wing_sub.R':  ( 0.00,  0.020 * s,  0.025 * s),
            'skirt.L':     ( 0.045 * s, 0.0,  0.0),
            'skirt.R':     ( 0.045 * s, 0.0,  0.0),
            'shin.R':      ( 0.040 * s, 0.0,  0.0),
            'shin.L':      (-0.040 * s, 0.0,  0.0),
        })))
    make_clip('HoverFlight', 30, flight_frames)

    # --- 3. Fire (Crisp upper-body recoil + symmetrical wing stabilization flare) ---
    fire_frames = []
    for f, v in [(1, 0.0), (3, 1.0), (6, 0.35), (11, 0.0)]:
        if kind == 'ranger':
            p = {
                'chest':       (-0.10 * v, 0.0,  0.06 * v),
                'shoulder.R':  (-0.16 * v, 0.0,  0.0),
                'upper_arm.R': (-0.18 * v, 0.0,  0.0),
                'forearm.R':   (-0.16 * v, 0.0,  0.0),
                'wing_root.L': ( 0.00,  0.08 * v,  0.12 * v),
                'wing_root.R': ( 0.00, -0.08 * v, -0.12 * v),
            }
        elif kind == 'tank':
            p = {
                'chest':       (-0.14 * v, 0.0,  0.08 * v),
                'shoulder.R':  (-0.22 * v, 0.0,  0.0),
                'upper_arm.R': (-0.20 * v, 0.0,  0.0),
                'forearm.L':   (-0.10 * v, 0.0,  0.06 * v),
                'wing_root.L': ( 0.00,  0.06 * v,  0.08 * v),
                'wing_root.R': ( 0.00, -0.06 * v, -0.08 * v),
            }
        else:  # assassin: stylish twin-blade cross-slash!
            p = {
                'chest':       ( 0.16 * v, 0.0,  0.34 * v),
                'upper_arm.R': (-0.82 * v, 0.0, -0.26 * v),
                'forearm.R':   (-0.34 * v, 0.0,  0.0),
                'upper_arm.L': ( 0.42 * v, 0.0,  0.22 * v),
                'forearm.L':   (-0.28 * v, 0.0,  0.0),
                'wing_root.L': ( 0.00,  0.10 * v,  0.22 * v),
                'wing_root.R': ( 0.00, -0.10 * v, -0.22 * v),
            }
        fire_frames.append((f, p))
    make_clip('Fire', 10, fire_frames)

    # --- 4. Dash (Explosive Quick-Boost Wing-Snap Maneuver) ---
    dash_frames = []
    for f, v in [(1, 0.0), (4, 1.0), (9, 0.55), (15, 0.0)]:
        dash_frames.append((f, blend_pose(flight_base, {
            'spine':       ( 0.16 * v, 0.0,  0.0),
            'head':        (-0.16 * v, 0.0,  0.0),
            'thigh.R':     ( 0.20 * v, 0.0,  0.0),
            'thigh.L':     ( 0.22 * v, 0.0,  0.0),
            'wing_root.L': (-0.06 * v, -0.10 * v, -0.26 * v),
            'wing_root.R': (-0.06 * v,  0.10 * v,  0.26 * v),
            'wing_sub.L':  (-0.06 * v,  0.08 * v, -0.20 * v),
            'wing_sub.R':  (-0.06 * v, -0.08 * v,  0.20 * v),
        })))
    make_clip('Dash', 14, dash_frames)

    scene.frame_set(1)


# ---------------------------------------------------------------------------
# Studio Multi-Angle Preview Renderer (Hero Front, Rear Wings, 50deg Top, Flight)
# ---------------------------------------------------------------------------
def render_preview(kind, view, action='HoverIdle', frame=1, filepath=None, res=1024):
    scene = bpy.context.scene
    if RIG.animation_data:
        RIG.animation_data.action = bpy.data.actions.get(action)
    scene.frame_set(frame)

    cam_map = {
        'hero':   ((3.2, -5.0, 2.55), Vector((0.0, 0.0, 1.38)), 3.65),
        'back':   ((-3.0, 4.8, 2.65), Vector((0.0, 0.1, 1.44)), 3.85),
        'top':    ((0.0, -4.4, 5.40), Vector((0.0, 0.0, 1.25)), 4.10),
        'flight': ((3.6, -4.4, 2.20), Vector((0.0, 0.1, 1.42)), 3.90),
    }
    loc, target, ortho = cam_map.get(view, cam_map['hero'])
    if kind == 'tank':
        ortho *= 1.12

    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.name = 'PreviewCamera'
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    scene.camera = cam

    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.color = (0.020, 0.028, 0.042)
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.view_settings.exposure = -0.35

    def add_light(l_loc, color, energy, size):
        bpy.ops.object.light_add(type='AREA', location=l_loc)
        o = bpy.context.object
        o.data.energy = energy
        o.data.color = color
        o.data.shape = 'DISK'
        o.data.size = size
        o.rotation_euler = (Vector((0, 0, 1.35)) - o.location).to_track_quat('-Z', 'Y').to_euler()
        return o

    lights = [
        add_light((-3.6, -4.5, 5.2), (1.00, 0.86, 0.72), 1800, 3.8),  # Warm aerospace key
        add_light(( 3.4,  3.8, 4.4), (0.38, 0.76, 1.00), 2200, 3.2),  # Crisp cyan studio rim
        add_light(( 0.0, -3.5, 0.8), (0.45, 0.68, 0.95),  450, 4.5),  # Subtle lower deck bounce
    ]

    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -0.38))
    floor = bpy.context.object
    floor.name = 'PreviewStage'
    fm = make_mat('StageMat', '#101925', metal=0.45, rough=0.42, coat=0.25)
    floor.data.materials.append(fm)

    scene.render.filepath = filepath or os.path.join(PRE, f'{kind}-{view}.png')
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(floor, do_unlink=True)
    bpy.data.materials.remove(fm)
    for o in lights:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)


# ---------------------------------------------------------------------------
# Transparent Card Portrait Renderer (Updates class selection / 2D portraits!)
# ---------------------------------------------------------------------------
def render_card_art(kind, filepath, res=512):
    scene = bpy.context.scene
    if RIG.animation_data:
        RIG.animation_data.action = bpy.data.actions.get('HoverIdle')
    scene.frame_set(16)

    loc = (2.6, -4.6, 2.25)
    target = Vector((0.0, 0.0, 1.48))
    ortho = 3.55 if kind != 'tank' else 4.05

    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho
    scene.camera = cam

    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.quality = 90
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.view_settings.exposure = -0.25

    def add_light(l_loc, color, energy, size):
        bpy.ops.object.light_add(type='AREA', location=l_loc)
        o = bpy.context.object
        o.data.energy = energy
        o.data.color = color
        o.data.shape = 'DISK'
        o.data.size = size
        o.rotation_euler = (Vector((0, 0, 1.4)) - o.location).to_track_quat('-Z', 'Y').to_euler()
        return o

    lights = [
        add_light((-3.4, -4.5, 5.0), (1.00, 0.88, 0.76), 2100, 3.8),
        add_light(( 3.4,  3.5, 4.2), (0.42, 0.78, 1.00), 2500, 3.2),
        add_light(( 0.0, -3.8, 1.2), (0.65, 0.82, 1.00),  650, 4.0),
    ]
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)

    for o in lights:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)


# ---------------------------------------------------------------------------
# Main Build & Export Pipeline
# ---------------------------------------------------------------------------
def build_robot(kind, scale, quick=False, export_cards=False):
    global S, PARTS
    S = kind
    PARTS = []
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for old_mat in list(bpy.data.materials):
        bpy.data.materials.remove(old_mat)

    setup_materials(kind)
    build_rig(kind)
    sculpt_head(kind)
    sculpt_torso(kind)
    sculpt_arms(kind)
    sculpt_legs(kind)
    {
        'ranger':   sculpt_ranger_flight_and_weapons,
        'tank':     sculpt_tank_flight_and_weapons,
        'assassin': sculpt_assassin_flight_and_weapons,
    }[kind]()

    if abs(scale - 1.0) > 1e-4:
        RIG.scale = (scale, scale, scale)
        bpy.context.view_layer.update()

    build_animations(kind)

    # Reset pose to neutral before exporting cleanly
    if RIG.animation_data:
        RIG.animation_data.action = None
    for pb in RIG.pose.bones:
        pb.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action='DESELECT')
    RIG.select_set(True)
    for o in PARTS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = RIG

    path = os.path.join(OUT, f'{kind}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_skins=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f'[export] {kind:9s} parts={len(PARTS):3d} size={os.path.getsize(path) / 1024:.1f} KiB', flush=True)

    render_preview(kind, 'hero',   'HoverIdle',   16)
    render_preview(kind, 'top',    'HoverIdle',   16)
    if not quick:
        render_preview(kind, 'back',   'HoverIdle',   16)
        render_preview(kind, 'flight', 'HoverFlight',  8)

    if export_cards:
        units_dir = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'units'))
        render_card_art(kind, os.path.join(units_dir, f'{kind}.webp'), res=512)


def main():
    quick = '--quick' in sys.argv
    export_cards = '--cards' in sys.argv
    only = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--only=')), None)

    specs = [
        ('ranger',   1.00),
        ('tank',     1.12),
        ('assassin', 0.98),
    ]
    for kind, scale in specs:
        if only and only != kind:
            continue
        build_robot(kind, scale, quick=quick, export_cards=export_cards)

    print('[done] all AAA player hover mecha built', flush=True)


if __name__ == '__main__':
    main()
