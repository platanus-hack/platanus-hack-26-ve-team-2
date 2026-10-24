"""Arma la batalla entre Bolívar y Monteverde con Blender (sin UI) y exporta un GLB por personaje.

  Monteverde llega corriendo (tira el sombrero y desenvaina), Bolívar se gira y saca su sable,
  cruzan sables, Bolívar empuja a Monteverde, Monteverde contraataca y lo tumba, Bolívar se levanta
  y sale corriendo (al alejarse desaparece). Ambos modelos traen la animación "batalla", de la misma
  duración y en el mismo marco: la app los monta en el mismo punto y los arranca a la vez.

Uso (desde frontend/):
  <blender> -b --python scripts/battle/build_battle.py -- [--preview <carpeta>] [--video]

Lee los modelos originales (assets/models/bolivar.glb y domingo-montereal-v3.glb, sin tocarlos) y
escribe assets/models/bolivar-batalla.glb, assets/models/monteverde-batalla.glb y
src/data/battle.json (duración y en qué momento suena cada efecto).

Marco de la escena: Bolívar empieza en el origen mirando al usuario (-Y en Blender, +Z en la app);
pelean sobre el eje X, de perfil para quien mira. Monteverde llega desde +X.
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig import FPS, P, SWORD, F, Rig, smooth  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "assets", "models")
DURATION = 14.0
ACTION = "batalla"
HAT_BONE = "Bone_083"  # el bicornio que Monteverde lleva en la mano derecha

# --- escena ---------------------------------------------------------------------------------------


def import_character(path: str, name: str) -> tuple[bpy.types.Object, bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = set(bpy.data.objects) - before
    # El importador agrega una esfera para dibujar los huesos: no va en el modelo
    for o in [o for o in new if o.type == "MESH" and o.name.startswith("Icosphere")]:
        new.discard(o)
        bpy.data.objects.remove(o)
    arm = next(o for o in new if o.type == "ARMATURE")
    body = next(o for o in new if o.type == "MESH")
    arm.name = arm.data.name = name
    # Las animaciones que trae quedan en el NLA, apagadas: solo se exportan
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    arm.animation_data.action = None
    return arm, body


def add_sword_bone(arm: bpy.types.Object, head: Vector, direction: Vector) -> None:
    """Hueso del sable, hijo de la cadera. En reposo queda envainado en la cadera izquierda."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones.new(SWORD)
    eb.head = head
    eb.tail = head + direction.normalized() * 0.2
    eb.parent = arm.data.edit_bones[P + "Hips"]
    eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")


def material(name: str, color: tuple, metallic: float, roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def build_saber(arm: bpy.types.Object, body: bpy.types.Object) -> None:
    """Sable de caballería (hoja curva, guarda y pomo de latón), pegado 100 % al hueso Sword.

    Se modela en el espacio del hueso: Y a lo largo de la hoja, el filo hacia +Z. Se une a la malla del
    cuerpo para que viaje en el mismo skin (una sola malla es lo más seguro con Viro).
    """
    bm = bmesh.new()
    mats = {"acero": 0, "laton": 1, "cuero": 2}

    def ring(y: float, r: float, n: int = 8, z0: float = 0.0, sx: float = 1.0, sz: float = 1.0):
        return [bm.verts.new((sx * r * math.cos(2 * math.pi * i / n), y, z0 + sz * r * math.sin(2 * math.pi * i / n))) for i in range(n)]

    def bridge(a, b, mat):
        n = len(a)
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            f.material_index = mat

    def cap(r, mat, flip=False):
        f = bm.faces.new(list(reversed(r)) if flip else r)
        f.material_index = mat

    # Empuñadura de cuero y pomo
    g0, g1 = ring(-0.105, 0.0135), ring(-0.005, 0.0125)
    bridge(g0, g1, mats["cuero"])
    p0, p1, p2 = ring(-0.132, 0.008), ring(-0.122, 0.019), ring(-0.106, 0.015)
    bridge(p0, p1, mats["laton"])
    bridge(p1, p2, mats["laton"])
    cap(p0, mats["laton"], flip=True)
    cap(p2, mats["laton"])
    cap(g0, mats["cuero"], flip=True)
    cap(g1, mats["cuero"])
    # Guarda: una cruz chata que cruza hacia el filo y el lomo
    guard = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.scale(bm, vec=(0.014, 0.012, 0.11), verts=guard)
    bmesh.ops.translate(bm, vec=(0, 0.002, 0.0), verts=guard)
    for f in {f for v in guard for f in v.link_faces}:
        f.material_index = mats["laton"]
    # Hoja curva: se angosta hacia la punta y se curva hacia el lomo (-Z)
    length, segments = 0.80, 14
    prev = None
    for i in range(segments + 1):
        s = i / segments
        y = 0.012 + length * s
        zc = -0.05 * s * s
        width = 0.034 * (1 - 0.55 * s) if i < segments else 0.0
        thick = 0.0065 * (1 - 0.6 * s)
        if i == segments:
            tip = bm.verts.new((0, y + 0.03, zc - 0.006))
            for j in range(4):
                f = bm.faces.new((prev[j], prev[(j + 1) % 4], tip))
                f.material_index = mats["acero"]
            break
        cur = [
            bm.verts.new((0, y, zc + width * 0.55)),  # filo
            bm.verts.new((thick / 2, y, zc - width * 0.25)),
            bm.verts.new((0, y, zc - width * 0.45)),  # lomo
            bm.verts.new((-thick / 2, y, zc - width * 0.25)),
        ]
        if prev:
            bridge(prev, cur, mats["acero"])
        else:
            cap(cur, mats["acero"], flip=True)
        prev = cur
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(f"{arm.name}_sable")
    bm.to_mesh(mesh)
    bm.free()
    for mat in (
        material("sable_acero", (0.78, 0.79, 0.82), 0.85, 0.28),
        material("sable_laton", (0.83, 0.62, 0.24), 1.0, 0.35),
        material("sable_cuero", (0.13, 0.07, 0.04), 0.0, 0.8),
    ):
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = arm.data.bones[SWORD].matrix_local
    group = obj.vertex_groups.new(name=SWORD)
    group.add(range(len(mesh.vertices)), 1.0, "REPLACE")
    # Unir a la malla del cuerpo (que ya tiene el modificador Armature)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()


def hide_sword_in_other_actions(arm: bpy.types.Object, keep: str) -> None:
    """En las otras animaciones (saludo, hablar, caminar) el sable va escondido."""
    for track in arm.animation_data.nla_tracks:
        for strip in track.strips:
            action = strip.action
            if action is None or action.name.startswith(keep):
                continue
            arm.animation_data.action = action
            start, end = action.frame_range
            base = f'pose.bones["{SWORD}"]'
            for path, values in (("location", (0, 0, 0)), ("rotation_quaternion", (1, 0, 0, 0)), ("scale", (1e-4,) * 3)):
                for i, v in enumerate(values):
                    fc = action.fcurve_ensure_for_datablock(arm, f"{base}.{path}", index=i, group_name=SWORD)
                    fc.keyframe_points.insert(start, v)
                    fc.keyframe_points.insert(end, v)
            arm.animation_data.action = None


# --- sombrero de Monteverde -----------------------------------------------------------------------


def isolate_hat(body: bpy.types.Object) -> None:
    """El sombrero comparte vértices y pesos con la mano: al soltarlo, las caras entre ambos se
    estirarían hasta el piso. Se corta la malla en el borde del sombrero y cada lado queda con sus pesos."""
    hat = body.vertex_groups[HAT_BONE].index
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active

    def hat_ratio(v) -> float:
        d = v[deform]
        total = sum(d.values())
        return d.get(hat, 0.0) / total if total else 0.0

    hat_faces = [f for f in bm.faces if sum(hat_ratio(v) > 0.3 for v in f.verts) * 2 >= len(f.verts)]
    # Separa las caras del sombrero (también donde solo se tocan en un vértice)
    out = bmesh.ops.split(bm, geom=hat_faces, use_only_faces=False)["geom"]
    hat_verts = {v for f in out if isinstance(f, bmesh.types.BMFace) for v in f.verts}
    for v in bm.verts:
        d = v[deform]
        if v in hat_verts:
            d.clear()
            d[hat] = 1.0
        elif hat in d:
            del d[hat]
            total = sum(d.values())
            for g in list(d.keys()):
                d[g] = d[g] / total if total else 0.0
    bm.to_mesh(body.data)
    bm.free()


def hat_override(body: bpy.types.Object, rig: Rig, toss_at: float, throw: Vector):
    """El bicornio sigue a la mano hasta `toss_at`; después vuela (parabólico) y queda en el piso.
    Sale con la velocidad del cuerpo (va corriendo) más la del lanzamiento."""
    dt = 1 / 24
    body_v = Vector(
        ((rig.num("x", toss_at + dt) - rig.num("x", toss_at)) / dt, (rig.num("y", toss_at + dt) - rig.num("y", toss_at)) / dt, 0)
    )
    velocity = body_v + throw
    names = {g.index: g.name for g in body.vertex_groups}
    rest = rig.rest[HAT_BONE]
    inv = rest.inverted()
    pts = []
    for v in body.data.vertices:
        if v.groups and names[max(v.groups, key=lambda g: g.weight).group] == HAT_BONE:
            pts.append(inv @ v.co)
    pts = np.array([p[:] for p in pts])
    # El eje más corto del sombrero (su espesor) termina vertical: queda acostado en el piso
    cov = np.cov((pts - pts.mean(0)).T)
    thin = Vector(np.linalg.eigh(cov)[1][:, 0])
    state = {}

    def apply(rig: Rig, st: dict, des: dict) -> None:
        t = st["t"]
        if t < toss_at:
            state["start"] = des[HAT_BONE].copy()
            return
        m0 = state["start"]
        r0 = m0.to_3x3()
        lie = (r0 @ thin).rotation_difference(Vector((0, 0, 1)) if (r0 @ thin).z >= 0 else Vector((0, 0, -1)))
        lowest = min((lie.to_matrix() @ r0 @ Vector(p)).z for p in pts)
        # Vuelo: posición balística hasta que la base toca el piso
        g = 9.8
        z0 = m0.translation.z
        land = (velocity.z + math.sqrt(velocity.z**2 + 2 * g * (z0 + lowest))) / g
        s = min(t - toss_at, land)
        pos = m0.translation + velocity * s + Vector((0, 0, -0.5 * g * s * s))
        if s >= land:
            pos.z = -lowest
        # Gira en el aire y aterriza acostado (girar en Z no cambia la altura de su base)
        u = smooth(min(s / land, 1.0))
        spin = Matrix.Rotation(u * math.radians(300), 3, "Z")
        m = (spin @ Quaternion().slerp(lie, u).to_matrix() @ r0).to_4x4()
        m.translation = pos
        des[HAT_BONE] = m

    return apply


# --- coreografía ----------------------------------------------------------------------------------

RUN = {"cadence": 1.4, "lift": 0.16, "bob": 0.04, "max_stride": 0.48}
NEUTRAL = {"l": F(0, 0.11), "r": F(0, -0.11)}
GUARD = {"r": F(0.30, -0.09), "l": F(-0.24, 0.12), "lyaw": 45}
GUARD_HAND = ("t", F(0.33, -0.15, 1.12))
GUARD_BLADE = F(0.8, 0.05, 0.6)
GUARD_EDGE = F(0.6, 0, -0.8)
GUARD_OFFHAND = ("t", F(-0.05, 0.30, 1.15))
SHEATH_BLADE = F(-0.3, 0.25, -0.9)

# Monteverde llega en diagonal desde atrás a la izquierda de Bolívar (en la app: al fondo a la
# derecha de quien mira), así entra en el cuadro de la cámara. Corre en línea recta hasta su guardia
RUN_FROM = Vector((5.2, 4.2, 0))
GUARD_AT = Vector((1.55, 0.0, 0))
RUN_DIR = (GUARD_AT - RUN_FROM).normalized()
# yaw de quien mira en la dirección d: adelante = (sin yaw, -cos yaw)
RUN_YAW = math.degrees(math.atan2(RUN_DIR.x, -RUN_DIR.y))
LOOK_AT_ARRIVAL = math.degrees(math.atan2(RUN_FROM.x, -RUN_FROM.y))

# Sonidos (segundos desde que arranca la animación); la app los toma de src/data/battle.json
CUES = [
    (0.0, "run_in"),
    (0.92, "draw"),
    (1.05, "draw"),
    (2.45, "cry"),
    (3.0, "clash_heavy"),
    (3.55, "clash"),
    (4.15, "clash_2"),
    (4.75, "clash"),
    (5.0, "clash_heavy"),
    (5.75, "push"),
    (7.0, "clash_heavy"),
    (7.3, "push"),
    (8.27, "fall"),
    (11.25, "run_away"),
]


# Golpes que recibe cada uno: el torso cede hacia atrás y vuelve solo (resorte amortiguado).
# (segundo, velocidad angular en °/s; negativo = hacia atrás)
BOLIVAR_HITS = [(3.0, -75), (4.15, -60), (5.0, -30), (7.0, -95)]
MONTEVERDE_HITS = [(3.55, -60), (4.75, -60), (5.0, -30)]
# Empujones: (desde, hasta, metros que retrocede)
MONTEVERDE_STAGGER = (5.75, 6.55, 0.9)
BOLIVAR_STAGGER = (7.3, 7.95, 0.75)


def bolivar_keys() -> list[dict]:
    return [
        dict(t=0.0, x=0.0, y=0.0, yaw=0, feet=NEUTRAL, sword=False, blade=SHEATH_BLADE, edge=F(1, 0, 0)),
        # Apenas empieza oye a Monteverde: lo mira y se gira hacia donde viene (atrás a su izquierda)
        dict(t=0.1, head=(0, 0, 0), spine=(0, 0, 0), yaw=0),
        dict(t=0.3, head=(-4, 45, 0), spine=(0, 15, 0)),
        dict(t=0.45, feet={"l": F(-0.06, 0.15), "lyaw": 45}),
        dict(t=0.75, yaw=LOOK_AT_ARRIVAL, head=(0, 0, 0), spine=(0, 0, 0), dz=-0.04, feet={"r": F(0.30, -0.09)}),
        dict(t=0.92, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        # Desenvaina: la mano derecha cruza a la cadera izquierda, la izquierda sujeta la vaina
        dict(t=0.85, rh=("t", F(0.18, 0.13, 0.97)), lh=("t", F(0.06, 0.2, 0.93))),
        dict(t=1.05, sword=True),
        dict(t=1.35, rh=("t", F(0.28, -0.05, 1.45)), blade=F(0.45, -0.35, 0.82), edge=F(0.8, 0, -0.5)),
        dict(t=1.65, rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, lh=GUARD_OFFHAND, dz=-0.07),
        # En guardia, lo sigue mientras se acerca y queda de frente cuando llega
        dict(t=1.9, yaw=LOOK_AT_ARRIVAL),
        dict(t=2.3, yaw=90, feet={"r": F(0.30, -0.09)}),
        dict(t=2.45, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        dict(t=2.8, rh=("t", F(0.33, -0.12, 1.25))),
        # 1) Bloqueo alto contra el tajo de arriba
        dict(t=3.0, rh=("t", F(0.30, -0.10, 1.62)), blade=F(0.15, 1.0, 0.12), edge=F(0, 0, 1), dz=-0.13, spine=(-4, 0, 0), e="in"),
        dict(t=3.12, dz=-0.10),
        # 2) Tajo horizontal desde su derecha
        dict(t=3.3, rh=("t", F(0.05, -0.45, 1.25)), blade=F(-0.3, -0.8, 0.5), edge=F(0.6, 0.6, 0), spine=(0, -30, 0), dz=-0.07),
        dict(t=3.55, rh=("t", F(0.40, -0.12, 1.20)), blade=F(0.95, -0.1, 0.2), edge=F(0, 1, 0), spine=(6, 10, 0), feet={"r": F(0.42, -0.09)}, e="in"),
        dict(t=3.7, rh=("t", F(0.33, 0.05, 1.18)), blade=F(0.7, 0.4, 0.55), spine=(2, 5, 0)),
        dict(t=3.95, rh=("t", F(0.33, 0.0, 1.25)), blade=F(0.6, 0.1, 0.8), feet={"r": F(0.30, -0.09)}),
        # 3) Bloqueo diagonal a su izquierda
        dict(t=4.15, rh=("t", F(0.35, 0.20, 1.30)), blade=F(0.25, 0.15, 0.95), edge=F(0, 1, 0), spine=(0, 12, 0), e="in"),
        # 4) Estocada baja
        dict(t=4.45, rh=("t", F(0.15, -0.2, 1.0)), blade=F(0.9, 0.1, 0.1), edge=F(0, 0, -1), dz=-0.1, spine=(0, -10, 0)),
        dict(t=4.75, x=0.12, rh=("t", F(0.60, -0.05, 1.05)), blade=F(0.95, 0.05, -0.1), spine=(12, 0, 0), pitch=8, dz=-0.17, feet={"r": F(0.55, -0.09)}, e="in"),
        # Sables trabados en alto
        dict(t=5.0, x=0.15, rh=("t", F(0.30, -0.05, 1.45)), blade=F(0.55, -0.1, 0.85), edge=F(0.85, 0, -0.55), pitch=4, spine=(8, 0, 0), dz=-0.1, feet={"r": F(0.32, -0.09)}),
        dict(t=5.15, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        dict(t=5.25, spine=(4, 0, 0)),
        dict(t=5.45, spine=(10, 0, 0)),
        # Empuja a Monteverde con la mano izquierda
        dict(t=5.6, x=0.15, lh=("t", F(0.05, 0.22, 1.2)), rh=("t", F(0.22, -0.28, 1.25)), blade=F(0.5, -0.4, 0.75)),
        dict(t=5.75, x=0.3, lh=("t", F(0.58, 0.05, 1.25)), spine=(14, -8, 0), pitch=6, feet={"l": F(0.12, 0.12), "lyaw": 0}, e="in"),
        dict(t=6.05, lh=GUARD_OFFHAND, rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, spine=(0, 0, 0), pitch=0),
        dict(t=6.2, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        dict(t=6.8, dz=-0.1),
        # Bloquea el contraataque y le desvían el sable
        dict(t=7.0, x=0.3, rh=("t", F(0.30, 0.10, 1.35)), blade=F(0.3, 0.3, 0.9), edge=F(0, 1, 0), e="in"),
        dict(t=7.12, rh=("t", F(0.08, -0.48, 1.0)), blade=F(0.1, -0.8, -0.3), edge=F(0, 0, 1), spine=(0, -15, 0), e="out"),
        # Lo empujan (BOLIVAR_STAGGER): retrocede trastabillando, pierde el equilibrio y cae sentado
        dict(t=7.3, x=0.3, lh=("t", F(0.15, 0.45, 1.5)), rh=("t", F(0.1, -0.5, 1.35)), blade=F(0.2, -0.6, 0.75)),
        dict(t=7.95, pitch=-12, spine=(-6, 0, 0), head=(-6, 0, 0), dz=-0.1),
        dict(t=8.3, x=-0.75, dz=-0.76, pitch=-25, spine=(-15, 0, 0), head=(-5, 0, 0),
             lh=("w", F(-0.2, 0.30, 0.06)), rh=("w", F(-0.15, -0.32, 0.08)), blade=F(0.5, -0.85, -0.3),
             feet={"l": F(0.62, 0.13), "r": F(0.60, -0.13), "lyaw": 0}, e="in"),
        dict(t=8.42, dz=-0.73, pitch=-21),
        dict(t=9.0, head=(-15, 0, 0)),
        # Se levanta
        dict(t=9.6, pitch=18, spine=(15, 0, 0), dz=-0.70, head=(0, 0, 0),
             rh=("w", F(0.12, -0.30, 0.1)), lh=("w", F(0.18, 0.30, 0.06)),
             feet={"l": F(0.33, 0.14), "r": F(0.38, -0.14)}),
        dict(t=10.1, x=-0.62, dz=-0.42, pitch=30, rh=("w", F(0.22, -0.28, 0.25)), lh=("w", F(0.25, 0.28, 0.25))),
        dict(t=10.6, x=-0.52, dz=-0.03, pitch=6, spine=(0, 0, 0), rh=("t", F(0.15, -0.25, 1.0)), blade=F(0.4, -0.5, -0.75), edge=F(1, 0, 0), lh=None,
             feet={"l": F(0.0, 0.11), "r": F(0.0, -0.11)}),
        # Se da vuelta y sale corriendo (lejos de Monteverde y del usuario)
        dict(t=10.85, yaw=90),
        dict(t=11.05, yaw=170, feet={"r": F(0.0, -0.11)}),
        dict(t=11.25, yaw=233, x=-0.6, y=0.05, pitch=14, rh=None, gait=RUN, blade=F(-0.2, -0.3, -0.93), feet={"l": F(0.0, 0.11)}),
        dict(t=13.75, x=-0.6 - 0.8 * 7.8, y=0.05 + 0.6 * 7.8, e="lin"),
        dict(t=13.35, scale=1.0),
        dict(t=13.7, scale=0.001),  # 0 exacto deja una matriz degenerada
    ]


def monteverde_keys() -> list[dict]:
    return [
        # Llega corriendo; tira el sombrero y desenvaina mientras corre
        dict(t=0.0, x=RUN_FROM.x, y=RUN_FROM.y, yaw=RUN_YAW, pitch=14, spine=(5, 0, 0), head=(-5, 0, 0), gait=RUN, sword=False, blade=SHEATH_BLADE, edge=F(1, 0, 0)),
        dict(t=0.4, rh=("t", F(0.10, -0.30, 1.05))),
        dict(t=0.55, rh=("t", F(0.20, -0.55, 1.50))),
        dict(t=0.85, rh=("t", F(0.20, 0.10, 0.98))),
        dict(t=0.92, sword=True),
        dict(t=1.25, rh=("t", F(0.35, -0.18, 1.30)), blade=F(0.55, -0.05, 0.83), edge=F(0.83, 0, -0.55)),
        # Corre parejo y frena en el último medio metro, girándose hacia Bolívar
        dict(t=1.9, x=(GUARD_AT - RUN_DIR * 0.55).x, y=(GUARD_AT - RUN_DIR * 0.55).y, yaw=RUN_YAW, e="lin"),
        dict(t=2.4, x=GUARD_AT.x, y=GUARD_AT.y, yaw=-90, pitch=3, spine=(0, 0, 0), head=(0, 0, 0), gait=None, feet=GUARD, dz=-0.07,
             rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, lh=GUARD_OFFHAND, e="out"),
        # 1) Tajo desde arriba
        dict(t=2.6, rh=("t", F(0.05, -0.12, 1.82)), blade=F(-0.55, 0.05, 0.83), edge=F(0.83, 0, 0.55), pitch=-6, spine=(-8, 0, 0)),
        dict(t=2.8, x=1.45, feet={"r": F(0.42, -0.09)}),
        dict(t=3.0, x=1.32, rh=("t", F(0.45, -0.05, 1.48)), blade=F(0.85, 0.05, 0.4), edge=F(0.4, 0, -0.9), pitch=10, spine=(10, 0, 0), e="in"),
        dict(t=3.15, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        dict(t=3.1, rh=("t", F(0.38, -0.1, 1.4)), pitch=4, spine=(3, 0, 0)),
        dict(t=3.3, rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE),
        # 2) Bloquea a su izquierda el tajo horizontal
        dict(t=3.55, rh=("t", F(0.35, 0.25, 1.20)), blade=F(0.2, 0.1, 1.0), edge=F(0, 1, 0), spine=(0, 15, 0), e="in"),
        dict(t=3.7, rh=("t", F(0.33, 0.05, 1.25)), blade=F(0.5, 0.0, 0.85), edge=F(0.85, 0, -0.5)),
        # 3) Tajo diagonal desde su derecha
        dict(t=3.92, rh=("t", F(0.05, -0.42, 1.72)), blade=F(-0.2, -0.5, 0.85), edge=F(0.7, 0.5, 0), spine=(-5, -25, 0)),
        dict(t=4.15, rh=("t", F(0.42, -0.05, 1.30)), blade=F(0.8, -0.4, 0.1), edge=F(0, 1, 0), spine=(8, 10, 0), e="in"),
        dict(t=4.3, rh=("t", F(0.35, 0.1, 1.2)), blade=F(0.75, 0.2, 0.4)),
        # 4) Para la estocada baja
        dict(t=4.75, x=1.32, rh=("t", F(0.32, 0.12, 1.05)), blade=F(0.45, 0.05, -0.85), edge=F(1, 0, 0), spine=(10, 5, 0), dz=-0.12),
        # Sables trabados
        dict(t=4.92, feet={"r": F(0.30, -0.09)}),
        dict(t=5.0, x=1.0, rh=("t", F(0.30, 0.05, 1.45)), blade=F(0.55, 0.1, 0.85), edge=F(0.85, 0, -0.55), spine=(8, 0, 0), dz=-0.1),
        dict(t=5.1, feet={"l": F(-0.24, 0.12), "lyaw": 45}),
        dict(t=5.25, spine=(12, 0, 0), rh=("t", F(0.32, 0.05, 1.47))),
        dict(t=5.45, spine=(6, 0, 0), rh=("t", F(0.28, 0.05, 1.44))),
        dict(t=5.62, x=1.0, pitch=4, spine=(10, 0, 0)),
        # Bolívar lo empuja (MONTEVERDE_STAGGER): retrocede trastabillando y abre los brazos para no caer
        dict(t=5.75, pitch=0, spine=(0, 0, 0), head=(-10, 0, 0), rh=("t", F(0.05, -0.45, 1.50)), blade=F(-0.3, -0.5, 0.8),
             lh=("t", F(0.1, 0.45, 1.40)), e="out"),
        dict(t=6.45, pitch=0, spine=(0, 0, 0), head=(0, 0, 0), rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, lh=GUARD_OFFHAND),
        # Contraataque: carga, tajo fuerte y empujón
        dict(t=6.6, x=1.9, rh=("t", F(0.05, -0.38, 1.80)), blade=F(-0.3, -0.4, 0.85), edge=F(0.6, 0.6, 0), spine=(-6, -22, 0)),
        dict(t=6.75, feet={"r": F(0.45, -0.09)}),
        dict(t=6.95, feet={"l": F(-0.2, 0.12), "lyaw": 45}),
        dict(t=6.98, x=1.18, e="in"),
        dict(t=7.0, rh=("t", F(0.45, 0.05, 1.25)), blade=F(0.8, 0.3, -0.3), edge=F(0, 1, 0), spine=(12, 15, 0), pitch=8, e="in"),
        dict(t=7.15, rh=("t", F(0.15, -0.3, 1.25)), blade=F(0.2, -0.4, 0.9), edge=GUARD_EDGE, lh=("t", F(0.15, 0.25, 1.2))),
        dict(t=7.25, feet={"l": F(0.20, 0.12), "lyaw": 0}),
        dict(t=7.3, x=0.92, lh=("t", F(0.58, 0.0, 1.25)), spine=(10, -10, 0), e="in"),
        dict(t=7.6, lh=("t", F(0.2, 0.25, 1.05)), spine=(0, 0, 0), pitch=2),
        dict(t=7.8, feet={"r": F(0.25, -0.09)}),
        dict(t=8.2, rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, lh=GUARD_OFFHAND, dz=-0.05),
        # Avanza sobre Bolívar caído, apuntándole con el sable
        dict(t=8.4, x=0.92),
        dict(t=8.7, feet={"r": F(0.42, -0.09)}),
        dict(t=9.05, feet={"l": F(-0.05, 0.12), "lyaw": 30}),
        dict(t=9.4, x=0.25, rh=("t", F(0.42, -0.05, 1.15)), blade=F(0.8, 0, -0.5), edge=F(1, 0, 0), head=(12, 0, 0)),
        dict(t=9.45, feet={"r": F(0.30, -0.09)}),
        dict(t=10.6, rh=GUARD_HAND, blade=GUARD_BLADE, edge=GUARD_EDGE, head=(0, 0, 0)),
        # Lo ve huir y levanta el sable
        dict(t=11.3, yaw=-90),
        dict(t=11.9, yaw=-122, head=(0, -10, 0), feet={"r": F(0.25, -0.09), "l": F(-0.2, 0.12)}),
        dict(t=12.6, rh=("t", F(0.08, -0.25, 1.95)), blade=F(0.05, -0.1, 1.0), edge=F(1, 0, 0), lh=("t", F(0.08, 0.24, 1.0)),
             spine=(-6, 0, 0), head=(-12, 0, 0), dz=0.0),
        dict(t=13.4, rh=("t", F(0.08, -0.25, 1.9))),
        dict(t=DURATION, rh=("t", F(0.08, -0.25, 1.95))),
    ]


# --- vista previa ---------------------------------------------------------------------------------


def preview(folder: str, video: bool, close: bool = False, times: list[float] | None = None) -> None:
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 0, int(DURATION * FPS)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.show_shadows = True
    world = bpy.data.worlds.new("preview")
    world.color = (0.62, 0.66, 0.70)
    sc.world = world
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    # Donde estaría el usuario (+Z en la app); `close` acerca la cámara al cruce de sables
    cam.location = Vector((0.5, -2.6, 1.35)) if close else Vector((0.4, -4.2, 1.55))
    cam.data.lens = 32 if close else 26
    target = Vector((0.5, 0, 1.0)) if close else Vector((0.3, 0, 0.85))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

    w, h = 400, 300
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.image_settings.file_format = "PNG"
    times = times or [0.3, 1.0, 1.6, 2.1, 2.6, 3.0, 3.3, 3.55, 4.15, 4.75, 5.2, 5.8, 6.3, 7.0, 7.35, 7.8, 8.4, 9.4, 10.1, 10.6, 11.4, 12.2, 13.0, 13.9]
    cols = 6
    rows = math.ceil(len(times) / cols)
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    for i, t in enumerate(times):
        sc.frame_set(int(round(t * FPS)))
        path = os.path.join(folder, f"f_{t:05.2f}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, c = divmod(i, cols)
        sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
        bpy.data.images.remove(img)
    out = bpy.data.images.new("sheet", cols * w, rows * h, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(folder, "sheet.png")
    out.file_format = "PNG"
    out.save()
    print("PREVIEW", out.filepath_raw, "tiempos:", times)

    if video:
        sc.render.resolution_x, sc.render.resolution_y = 640, 360
        settings = sc.render.image_settings
        if hasattr(settings, "media_type"):
            settings.media_type = "VIDEO"
        settings.file_format = "FFMPEG"
        sc.render.ffmpeg.format = "MPEG4"
        sc.render.ffmpeg.codec = "H264"
        sc.render.filepath = os.path.join(folder, "batalla.mp4")
        bpy.ops.render.render(animation=True)
        print("VIDEO", sc.render.filepath)


# --- exportación ----------------------------------------------------------------------------------


def export(arm: bpy.types.Object, body: bpy.types.Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_tangents=True,
        export_image_format="AUTO",
        export_draco_mesh_compression_enable=False,  # Viro no soporta Draco
    )
    print("EXPORT", path, f"{os.path.getsize(path) / 1e6:.1f} MB")


def build_bolivar() -> tuple[bpy.types.Object, bpy.types.Object]:
    arm, body = import_character(os.path.join(MODELS, "bolivar.glb"), "Bolivar")
    # Sable envainado en la cadera izquierda (ahí tiene el suyo modelado)
    add_sword_bone(arm, Vector((0.14, -0.04, 0.88)), Vector((0.0, 0.45, -0.89)))
    build_saber(arm, body)
    rig = Rig(arm)
    rig.keys(bolivar_keys())
    for t, w in BOLIVAR_HITS:
        rig.impulse(t, w)
    rig.stagger(*BOLIVAR_STAGGER, kick=-180)
    rig.bake(ACTION, DURATION)
    hide_sword_in_other_actions(arm, ACTION)
    return arm, body


def build_monteverde() -> tuple[bpy.types.Object, bpy.types.Object]:
    arm, body = import_character(os.path.join(MODELS, "domingo-montereal-v3.glb"), "Monteverde")
    add_sword_bone(arm, Vector((0.16, -0.02, 0.86)), Vector((0.0, 0.45, -0.89)))
    build_saber(arm, body)
    isolate_hat(body)
    rig = Rig(arm)
    rig.keys(monteverde_keys())
    for t, w in MONTEVERDE_HITS:
        rig.impulse(t, w)
    rig.stagger(*MONTEVERDE_STAGGER, kick=-170)
    # Tira el sombrero hacia atrás y a su derecha mientras corre
    right = Vector((-math.cos(math.radians(RUN_YAW)), -math.sin(math.radians(RUN_YAW)), 0))
    rig.overrides.append(hat_override(body, rig, toss_at=0.55, throw=right * 1.2 - RUN_DIR * 0.6 + Vector((0, 0, 2.4))))
    rig.bake(ACTION, DURATION)
    hide_sword_in_other_actions(arm, ACTION)
    return arm, body


def fresh_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def main(args: list[str]) -> None:
    if "--preview" in args:
        fresh_scene()
        for arm, _ in (build_bolivar(), build_monteverde()):
            arm.animation_data.action = next(
                t.strips[0].action for t in arm.animation_data.nla_tracks if t.strips[0].action.name.startswith(ACTION)
            )
        times = [float(x) for x in args[args.index("--times") + 1].split(",")] if "--times" in args else None
        preview(args[args.index("--preview") + 1], "--video" in args, "--close" in args, times)
        if "--no-export" in args:
            return

    # Cada personaje se exporta desde una escena propia: el exportador de glTF incluye todas las
    # acciones compatibles con el esqueleto, y los dos tienen los mismos huesos de Mixamo
    for build, name in ((build_bolivar, "bolivar-batalla.glb"), (build_monteverde, "monteverde-batalla.glb")):
        fresh_scene()
        arm, body = build()
        export(arm, body, os.path.join(MODELS, name))

    timeline = {
        "animation": ACTION,
        "durationMs": int(DURATION * 1000),
        "cues": [{"atMs": int(t * 1000), "sound": s} for t, s in CUES],
    }
    with open(os.path.join(ROOT, "src", "data", "battle.json"), "w") as fh:
        json.dump(timeline, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("TIMELINE", timeline["durationMs"], "ms,", len(CUES), "sonidos")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
