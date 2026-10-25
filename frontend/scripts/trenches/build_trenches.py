"""Arma las trincheras de La Victoria (1814) con Blender (sin UI) y exporta los GLB de la escena.

  Patriotas a la izquierda del usuario y realistas a la derecha, cada bando tras su parapeto. Se
  disparan por descargas: cada soldado sube el fusil al hombro, dispara (fogonazo y retroceso), lo
  baja, lo recarga con la culata en el piso (cartucho, baqueta) y vuelve a apuntar. Cae uno de cada
  bando; al final los realistas se retiran corriendo y los patriotas festejan.

  Cada soldado trae 4 variantes de la animación ("trincheras_a"…"d"), con disparos desfasados: la
  app carga el mismo GLB en los 4 puestos de su bando y a cada uno le toca una variante.

Uso (desde frontend/):
  <blender> -b --python scripts/trenches/build_trenches.py -- [--preview <carpeta>] [--video] [--no-export]

Lee los modelos de Meshy ya comprimidos (assets/models/*-meshy.glb, sin tocarlos) y escribe
assets/models/soldado-patriota.glb, soldado-realista.glb, parapeto.glb y src/data/trenches.json
(puestos, parapetos, duración y cada disparo con su posición).

Marco de cada soldado: el de rig.py (mira hacia -Y en Blender = +Z en la app); la app lo gira hacia
el otro bando. Marco del campo (el de la app): origen entre las trincheras, +Z hacia el usuario, +X a
su derecha. Patriotas en -X mirando a +X, realistas en +X mirando a -X.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "battle"))
from build_battle import RUN, add_sword_bone, fresh_scene, import_character, material  # noqa: E402
from rig import FPS, P, SWORD, F, Rig, rot, spine_rotation  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "assets", "models")
DURATION = 30.0
ACTION = "trincheras"
VARIANTS = "abcd"
FLASH = "Flash"

# --- campo ----------------------------------------------------------------------------------------

# Campo para una tarima de ~6 m, a tamaño real: ~6,4 m de ancho (de un bando al otro) por ~3,3 m de
# fondo. Los soldados quedan 0,4 m detrás de la cara de su parapeto (al caer se desploman contra él)
SOLDIER_X = 2.85
PARAPET_X = 2.05
SLOT_Z = {"a": -1.2, "b": -0.4, "c": 0.4, "d": 1.2}
SIDES = {"patriota": (-1, 90), "realista": (1, -90)}  # lado (signo de X) y giro en la app
# Desfase de cada variante dentro de una descarga (s): no disparan todos a la vez
OFFSET = {"a": 0.0, "b": 0.18, "c": 0.42, "d": 0.65}
# Descargas de cada bando (s) y quién no dispara en cada una
VOLLEYS = {"realista": [3.0, 9.0, 15.0, 21.0], "patriota": [6.0, 12.0, 18.0, 24.0]}
# Caídos: (bando, variante, segundo); el disparo que lo alcanza es la descarga anterior del otro bando
FALLS = [("realista", "c", 12.9), ("patriota", "b", 15.8)]
RETREAT_AT = 26.2  # realistas
CHEER_AT = 26.6  # patriotas

# --- fusil ----------------------------------------------------------------------------------------
# fusil-meshy.glb: largo sobre X (culata en +X, bayoneta en -X), Z arriba. La empuñadura (la mano
# derecha, detrás de la llave) está en x = 0,60; la boca del cañón, 1,18 m más adelante y 6 cm más arriba
RIFLE_GRIP = Vector((0.60, 0.0, 0.0))
MUZZLE = Vector((0.0, 1.18, 0.06))  # en el espacio del hueso del fusil (Y a lo largo del cañón)
RIFLE_TEXTURE = 512

# --- parapeto -------------------------------------------------------------------------------------
# parapeto-meshy.glb mide 1,9 × 0,66 × 0,39 m: escalado a ~3,3 m de largo (cubre a los 4 soldados),
# 0,8 m de fondo y 1 m de alto (cubre a un agachado)
PARAPET_SCALE = Vector((1.75, 1.2, 2.6))
PARAPET_DECIMATE = 0.5


class SoldierRig(Rig):
    """Rig con fusil: `hold` pasa el fusil de la mano derecha (0) a la izquierda (1, para recargar)
    y `fore` es a qué distancia de la empuñadura lo toma la mano izquierda."""

    DEFAULTS = {**Rig.DEFAULTS, "hold": 0.0, "fore": 0.35}


# --- posturas -------------------------------------------------------------------------------------
# Se escriben en el marco del cuerpo (F: adelante, izquierda, arriba; alturas como de pie) y `pose`
# las pasa al marco del torso que usa rig.py (girado por el torso y la columna)

H = Vector((0, 0, 0.904))  # cadera en reposo (igual en los dos soldados de Meshy)


def torso(pitch: float, spine: tuple) -> Matrix:
    return rot("X", pitch) @ spine_rotation(*spine)


def pose(*, grip=None, d=None, up=None, fore=None, lh=None, rh=None, hold=None, pitch=0.0, spine=(0, 0, 0), head=(0, 0, 0), dz=0.0, **extra) -> dict:
    """Postura con el fusil. Con hold=0 el fusil va en la mano derecha (en `grip`, apuntando a `d`) y
    la izquierda lo toma `fore` m más adelante; con hold=1 lo lleva la izquierda (en `lh`) y la
    derecha queda libre (`rh`)."""
    inv = torso(pitch, spine).inverted()

    def pt(u):
        return ("t", inv @ (u - H) + H)

    out = dict(pitch=pitch, spine=spine, head=head, dz=dz, **extra)
    if d is not None:
        dn = d.normalized()
        out["blade"] = inv @ dn
        out["edge"] = inv @ up
        if fore is not None:
            out["fore"] = fore
        if hold:
            out["hold"] = 1.0
            out["lh"] = pt(lh)
            out["rh"] = pt(rh) if rh is not None else None
        else:
            out["hold"] = 0.0
            out["rh"] = pt(grip)
            out["lh"] = pt(lh if lh is not None else grip + dn * (fore if fore is not None else 0.35))
    else:
        if rh is not None:
            out["rh"] = pt(rh)
        if lh is not None:
            out["lh"] = pt(lh)
    return out


STANCE = {"l": F(0.12, 0.13), "r": F(-0.10, -0.13), "lyaw": 20, "ryaw": 40}

# De pie, fusil cruzado frente al pecho
PORT = dict(grip=F(0.20, -0.12, 1.0), d=F(0.3, 0.55, 0.78), up=F(1, 0, 0.2), fore=0.35)
# Agachado tras el parapeto (la bayoneta asoma por encima)
COVER = dict(PORT, dz=-0.42, pitch=12, head=(-5, 0, 0))
# Al hombro, de perfil (hombro izquierdo adelante) y la cara sobre la culata
AIM_SPINE = (6, -50, 0)
AIM = dict(grip=F(0.30, -0.10, 1.37), d=F(1, 0.03, 0.01), up=F(0, 0, 1), fore=0.24, pitch=4, spine=AIM_SPINE, head=(5, 44, 0))
RECOIL = dict(AIM, grip=F(0.25, -0.10, 1.39), d=F(1, 0.03, 0.15), spine=(0, -50, 0), head=(-4, 44, 0))
# Recarga: culata en el piso, la izquierda sostiene el cañón y la derecha trabaja en la boca
RELOAD_D = F(0.10, -0.03, 1)
RELOAD_LH = F(0.36, 0.02, 1.02)
RELOAD = dict(d=RELOAD_D, up=F(-1, 0, 0), fore=0.62, hold=1, lh=RELOAD_LH, pitch=10, spine=(8, 0, 0), head=(18, 0, 0))
CARTRIDGE = F(-0.02, -0.22, 0.98)  # cartuchera, en la cadera derecha
MOUTH = F(0.40, 0.0, 1.52)
RAM_UP = F(0.39, 0.0, 1.72)
# Para volver a tomar el fusil con la derecha: la izquierda lo sube hasta la postura PORT
PORT_LH = PORT["grip"] + PORT["d"].normalized() * PORT["fore"]


def key(t: float, base: dict, **over) -> dict:
    spec = dict(base)
    spec.update(over)
    extra = {k: spec.pop(k) for k in ("feet", "e", "gait", "x", "y", "yaw", "scale", "sword") if k in spec}
    out = pose(**spec)
    out.update(extra)
    out["t"] = t
    return out


def fire_times(side: str, v: str) -> list[float]:
    fall = next((t for s, vv, t in FALLS if s == side and vv == v), None)
    return [t + OFFSET[v] for t in VOLLEYS[side] if fall is None or t + OFFSET[v] < fall]


def soldier_keys(side: str, v: str) -> tuple[list[dict], list[tuple[float, float]]]:
    """Keys de un soldado y los golpes (retroceso de cada disparo, el balazo del caído)."""
    keys = [key(0.0, COVER, feet=STANCE, sword=True, x=0.0, y=0.0, yaw=0.0)]
    hits = []
    fires = fire_times(side, v)
    for i, T in enumerate(fires):
        last = i == len(fires) - 1
        # Se levanta (si estaba agachado) y apunta
        keys += [
            key(T - 1.4, PORT),
            key(T - 0.75, AIM),
            key(T - 0.08, AIM, grip=F(0.30, -0.10, 1.372)),
            # Dispara: el fusil patea hacia arriba y atrás
            key(T + 0.07, RECOIL, e="out"),
            key(T + 0.4, AIM),
            key(T + 0.8, PORT),
        ]
        hits.append((T, -70))
        if last:
            continue
        # Recarga: pasa el fusil a la izquierda (las dos manos ya lo tienen) y apoya la culata
        r = T + 0.9
        keys += [
            key(r, PORT),
            key(r + 0.05, PORT, hold=1, lh=PORT_LH, rh=PORT["grip"]),
            key(r + 0.55, RELOAD, rh=CARTRIDGE),
            key(r + 0.75, RELOAD, rh=CARTRIDGE + F(0.02, 0, -0.03)),
            key(r + 1.2, RELOAD, rh=MOUTH),
            key(r + 1.45, RELOAD, rh=MOUTH + F(0, 0, 0.03)),
            # Dos golpes de baqueta
            key(r + 1.8, RELOAD, rh=RAM_UP),
            key(r + 2.05, RELOAD, rh=MOUTH, e="in"),
            key(r + 2.35, RELOAD, rh=RAM_UP),
            key(r + 2.6, RELOAD, rh=MOUTH, e="in"),
            key(r + 2.9, RELOAD, rh=RAM_UP + F(0, 0, 0.05)),
            # Sube el fusil con la izquierda y lo vuelve a tomar con la derecha
            key(r + 3.4, PORT, hold=1, lh=PORT_LH, rh=PORT["grip"]),
            key(r + 3.5, PORT),
        ]
        # Si falta para la próxima descarga, se agacha
        if fires[i + 1] - 1.4 - (r + 3.5) > 1.5:
            keys.append(key(r + 4.0, COVER))
    return keys, hits


def fall_keys(T: float) -> list[dict]:
    """Recibe el balazo: el golpe lo echa atrás, se le doblan las rodillas y se desploma de rodillas
    contra su parapeto, con el fusil caído (cabe en el campo chico: no cae de espaldas)."""
    flung = dict(grip=F(0.12, -0.32, 1.3), d=F(0.3, -0.5, 0.8), up=F(1, 0, 0), lh=F(0.2, 0.35, 1.55))
    slump = dict(grip=F(0.30, -0.24, 0.30), d=F(0.5, -0.4, -0.75), up=F(1, 0, 0), lh=F(0.32, 0.22, 0.32),
                 pitch=50, spine=(15, 0, 0), head=(25, 10, 0))
    kneel = {"l": F(-0.42, 0.14), "r": F(-0.40, -0.14), "lyaw": 0, "ryaw": 0}
    return [
        key(T + 0.12, flung, head=(-20, 0, 0)),
        key(T + 0.55, flung, dz=-0.35, pitch=8, head=(10, 0, 0)),
        key(T + 1.0, dict(slump, dz=-0.55), feet=kneel, e="in"),
        key(T + 1.25, dict(slump, dz=-0.57, pitch=55)),
    ]


def retreat_keys(T: float) -> list[dict]:
    """Se da vuelta y sale corriendo hacia atrás (lejos del otro bando); al alejarse desaparece."""
    carry = dict(grip=F(0.12, -0.22, 0.95), d=F(0.6, -0.1, 0.45), up=F(0, 0, 1), fore=0.35)
    return [
        key(T, PORT),
        key(T + 0.35, PORT, yaw=180, feet={"l": F(0.0, 0.11), "r": F(0.0, -0.11), "lyaw": 0, "ryaw": 0}),
        key(T + 0.55, carry, lh=None, gait=RUN, pitch=12, x=0.0, y=0.0),
        # Unos pocos metros (el campo es chico) y desaparece
        key(T + 1.95, carry, lh=None, x=0.0, y=3.0, e="lin"),
        key(T + 1.6, carry, lh=None, scale=1.0),
        key(T + 1.9, carry, lh=None, scale=0.001),  # 0 exacto deja una matriz degenerada
    ]


def cheer_keys(T: float) -> list[dict]:
    """Fusil en alto con la derecha, puño arriba y saltitos."""
    up = dict(grip=F(0.05, -0.2, 1.92), d=F(0.05, 0, 1), up=F(1, 0, 0), lh=F(0.08, 0.28, 1.85), spine=(-6, 0, 0), head=(-15, 0, 0))
    keys = [key(T, PORT), key(T + 0.4, up)]
    for i, t in enumerate((0.7, 1.4, 2.1, 2.8)):
        keys += [
            key(T + t, up, dz=0.06, grip=F(0.05, -0.2, 1.97), e="out"),
            key(T + t + 0.18, up, dz=0.0, grip=F(0.05, -0.2, 1.80 + 0.02 * i), e="in"),
        ]
    return keys


# --- fusil y fogonazo -----------------------------------------------------------------------------


def attach_musket(arm: bpy.types.Object, body: bpy.types.Object) -> None:
    """Pega el fusil (y el fogonazo en la boca) al hueso del sable de rig.py, unido a la malla del cuerpo."""
    hand = arm.data.bones[P + "RightHand"]
    add_sword_bone(arm, hand.head_local.copy(), hand.y_axis.copy())
    rest = arm.data.bones[SWORD].matrix_local.copy()

    # Fogonazo: hueso hijo del fusil en la boca del cañón
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones.new(FLASH)
    head = rest @ MUZZLE
    eb.head = head
    eb.tail = head + rest.col[1].xyz.normalized() * 0.1
    eb.parent = arm.data.edit_bones[SWORD]
    eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    flash_rest = arm.data.bones[FLASH].matrix_local.copy()

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "fusil-meshy.glb"))
    rifle = next(o for o in set(bpy.data.objects) - before if o.type == "MESH")
    rifle.data.transform(rifle.matrix_world)
    # Al espacio del hueso: Y hacia la boca (-X del modelo), Z hacia arriba, origen en la empuñadura
    to_bone = Matrix(((0, 1, 0), (-1, 0, 0), (0, 0, 1))).to_4x4() @ Matrix.Translation(-RIFLE_GRIP)
    rifle.data.transform(to_bone)
    rifle.matrix_world = rest
    for slot in rifle.material_slots:
        for node in slot.material.node_tree.nodes if slot.material and slot.material.node_tree else []:
            if node.type == "TEX_IMAGE" and node.image and node.image.size[0] > RIFLE_TEXTURE:
                node.image.scale(RIFLE_TEXTURE, RIFLE_TEXTURE)
    rifle.vertex_groups.new(name=SWORD).add(range(len(rifle.data.vertices)), 1.0, "REPLACE")

    flash = build_flash(flash_rest)
    bpy.ops.object.select_all(action="DESELECT")
    for o in (rifle, flash, body):
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()


def build_flash(rest: Matrix) -> bpy.types.Object:
    """Fogonazo: tres hojas cruzadas en forma de llama, a lo largo del cañón (Y del hueso)."""
    bm = bmesh.new()
    length, width = 0.32, 0.16
    for k in range(3):
        a = math.pi * k / 3
        side = Vector((math.cos(a), 0, math.sin(a))) * width / 2
        v = [bm.verts.new(p) for p in (-side * 0.4, side * 0.4 + Vector((0, 0, 0)), side + Vector((0, length * 0.35, 0)), Vector((0, length, 0)), -side + Vector((0, length * 0.35, 0)))]
        bm.faces.new((v[0], v[1], v[2], v[3], v[4]))
    mesh = bpy.data.meshes.new("fogonazo")
    bm.to_mesh(mesh)
    bm.free()
    mat = material("fogonazo", (1.0, 0.78, 0.35), 0.0, 1.0)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.7, 0.25, 1)
    bsdf.inputs["Emission Strength"].default_value = 4.0
    mat.use_backface_culling = False
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("fogonazo", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = rest
    obj.vertex_groups.new(name=FLASH).add(range(len(mesh.vertices)), 1.0, "REPLACE")
    return obj


def musket_override(shots: list[float]):
    """Con hold > 0 el fusil sigue a la palma izquierda (la derecha queda libre para recargar); el
    fogonazo solo se ve un instante en cada disparo."""

    def apply(rig: Rig, st: dict, des: dict) -> None:
        t = st["t"]
        h = rig.num("hold", t)
        if h > 1e-3:
            hand = des[P + "LeftHand"]
            palm = hand.translation + hand.col[1].xyz.normalized() * 0.075
            m = des[SWORD].copy()
            barrel = m.col[1].xyz.normalized()
            m.translation = m.translation.lerp(palm - barrel * rig.num("fore", t), h)
            des[SWORD] = m
        flash = des[SWORD] @ rig.rel[FLASH]
        on = next((s for s in shots if 0 <= t - s < 0.09), None)
        size = 1.0 + 0.4 * math.sin(97 * on) if on is not None else 1e-4
        spin = Matrix.Rotation(on * 211.0 if on is not None else 0.0, 4, "Y")
        des[FLASH] = flash @ spin @ Matrix.Scale(size, 4)

    return apply


def build_soldier(side: str) -> tuple[bpy.types.Object, bpy.types.Object, dict, dict]:
    """Importa el soldado, le pega el fusil y hornea sus 4 variantes. Devuelve también, por variante,
    los disparos con la posición de la boca del cañón (marco del soldado, en Blender) y la acción."""
    before = set(bpy.data.actions)
    arm, body = import_character(os.path.join(MODELS, f"soldado-{side}-meshy.glb"), side.capitalize())
    # Las animaciones de Meshy (caminar, correr) no se usan: fuera, así el GLB solo trae las de la escena
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    for action in set(bpy.data.actions) - before:
        bpy.data.actions.remove(action)
    attach_musket(arm, body)

    shots = {}
    actions = {}
    for v in VARIANTS:
        keys, hits = soldier_keys(side, v)
        fall = next((t for s, vv, t in FALLS if s == side and vv == v), None)
        if fall is not None:
            keys = [k for k in keys if k["t"] < fall] + fall_keys(fall)
            hits.append((fall, -220))
        elif side == "realista":
            keys += retreat_keys(RETREAT_AT + OFFSET[v] * 0.4)
        else:
            keys += cheer_keys(CHEER_AT + OFFSET[v] * 0.3)
        times = fire_times(side, v)
        rig = SoldierRig(arm)
        rig.keys(keys)
        for t, w in hits:
            rig.impulse(t, w)
        rig.overrides.append(musket_override(times))
        actions[v] = rig.bake(f"{ACTION}_{v}", DURATION)
        shots[v] = []
        for t in times:
            st = rig.state(t, 1 / FPS)
            des = rig.solve(st)
            shots[v].append((t, des[SWORD] @ MUZZLE))
    return arm, body, shots, actions


# --- parapeto -------------------------------------------------------------------------------------


def build_parapet() -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "parapeto-meshy.glb"))
    obj = next(o for o in set(bpy.data.objects) - before if o.type == "MESH")
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    # Centrado, apoyado en el piso, escalado y con el largo sobre Y (= Z de la app, a lo largo del campo)
    obj.data.transform(Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Diagonal((*PARAPET_SCALE, 1)) @ Matrix.Translation(-center))
    bpy.context.view_layer.objects.active = obj
    dec = obj.modifiers.new("decimate", "DECIMATE")
    dec.ratio = PARAPET_DECIMATE
    bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.name = "parapeto"
    return obj


# --- exportación y datos para la app --------------------------------------------------------------


def export(objects: list[bpy.types.Object], path: str, animations: bool) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_skins=animations,
        export_animations=animations,
        export_animation_mode="ACTIONS",
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_draco_mesh_compression_enable=False,  # Viro no soporta Draco
    )
    print("EXPORT", path, f"{os.path.getsize(path) / 1e6:.1f} MB")


def to_field(side: str, v: str, p: Vector) -> list[float]:
    """Punto del marco del soldado (Blender) al marco del campo (app)."""
    sign, yaw = SIDES[side]
    x, z = p.x, -p.y  # Blender (x, y, z) -> glTF (x, z, -y)
    a = math.radians(yaw)
    fx = x * math.cos(a) + z * math.sin(a) + sign * SOLDIER_X
    fz = -x * math.sin(a) + z * math.cos(a) + SLOT_Z[v]
    return [round(fx, 2), round(p.z, 2), round(fz, 2)]


def timeline(shots: dict) -> dict:
    slots = [
        {"id": f"{side}_{v}", "side": side, "variant": v, "position": [sign * SOLDIER_X, 0, SLOT_Z[v]], "yaw": yaw}
        for side, (sign, yaw) in SIDES.items()
        for v in VARIANTS
    ]
    cues = []
    for side in SIDES:
        for v in VARIANTS:
            for i, (t, muzzle) in enumerate(shots[side][v]):
                sound = "disparo" if (i + "abcd".index(v)) % 2 == 0 else "disparo_2"
                cues.append({"atMs": int(t * 1000), "sound": sound, "at": to_field(side, v, muzzle), "effect": "humo"})
    for side, v, t in FALLS:
        head = to_field(side, v, Vector((0, 0, 1.5)))
        cues.append({"atMs": int(t * 1000), "sound": "cry", "at": head})
        cues.append({"atMs": int((t + 1.1) * 1000), "sound": "fall", "at": to_field(side, v, Vector((0, 0.8, 0.3)))})
    cues.append({"atMs": int((RETREAT_AT + 0.5) * 1000), "sound": "run_away", "at": to_field("realista", "a", Vector((0, 0, 1)))})
    cues.append({"atMs": int((CHEER_AT + 0.4) * 1000), "sound": "cry", "at": to_field("patriota", "a", Vector((0, 0, 1.6)))})
    cues.sort(key=lambda c: c["atMs"])
    return {
        "animation": ACTION,
        "layout": "field",
        "durationMs": int(DURATION * 1000),
        "slots": slots,
        "parapets": [
            {"id": "parapeto_patriota", "position": [-PARAPET_X, 0, 0], "yaw": 0},
            {"id": "parapeto_realista", "position": [PARAPET_X, 0, 0], "yaw": 180},
        ],
        "cues": cues,
    }


# --- vista previa ---------------------------------------------------------------------------------


def place(obj: bpy.types.Object, position: list[float], yaw: float) -> None:
    """Pone un objeto en el marco del campo de la app (Y arriba) dentro de la escena de Blender (Z arriba)."""
    obj.location = (position[0], -position[2], position[1])
    # El importador de glTF deja los objetos en cuaterniones: así rotation_euler no haría nada
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (0, 0, math.radians(yaw))


def preview(folder: str, video: bool, soldiers: dict, parapet: bpy.types.Object, data: dict) -> None:
    import numpy as np

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
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))

    # Un soldado por puesto, cada uno con su variante
    for slot in data["slots"]:
        arm, body, actions = soldiers[slot["side"]]
        a, b = arm.copy(), body.copy()
        sc.collection.objects.link(a)
        sc.collection.objects.link(b)
        b.parent = a
        next(m for m in b.modifiers if m.type == "ARMATURE").object = a
        for track in a.animation_data.nla_tracks:
            track.mute = True
        action = actions[slot["variant"]]
        a.animation_data.action = action
        if a.animation_data.action_slot is None:
            a.animation_data.action_slot = action.slots[0]
        place(a, slot["position"], slot["yaw"])
    for arm, body, _ in soldiers.values():
        arm.hide_render = body.hide_render = True
    for p in data["parapets"]:
        c = parapet.copy()
        sc.collection.objects.link(c)
        place(c, p["position"], p["yaw"])
    parapet.hide_render = True

    cams = {
        # Todo el campo, desde atrás y arriba del usuario (él lo ve girando la cabeza a cada lado)
        "general": (Vector((0, -6.5, 3.2)), Vector((0, 0, 0.7)), 20),
        # De costado y cerca de cada bando, para revisar las posturas
        "patriotas": (Vector((-SOLDIER_X + 1.2, -3.4, 1.3)), Vector((-SOLDIER_X + 0.4, 0, 0.95)), 30),
        "realistas": (Vector((SOLDIER_X - 1.2, -3.4, 1.3)), Vector((SOLDIER_X - 0.4, 0, 0.95)), 30),
    }
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    w, h = 480, 270
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.image_settings.file_format = "PNG"
    times = [0.5, 2.0, 2.4, 3.0, 3.05, 3.6, 4.6, 5.4, 6.4, 8.0, 12.95, 13.6, 14.5, 16.5, 17.2, 24.1, 27.0, 27.7, 28.6, 29.6]
    cols = 5
    rows = math.ceil(len(times) / cols)
    for name, (loc, target, lens) in cams.items():
        cam.location = loc
        cam.data.lens = lens
        cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
        sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
        for i, t in enumerate(times):
            sc.frame_set(int(round(t * FPS)))
            path = os.path.join(folder, f"{name}_{t:05.2f}.png")
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            r, c = divmod(i, cols)
            sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
            bpy.data.images.remove(img)
        out = bpy.data.images.new(f"sheet_{name}", cols * w, rows * h, alpha=True)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(folder, f"{name}.png")
        out.file_format = "PNG"
        out.save()
        print("PREVIEW", out.filepath_raw, "tiempos:", times)

    if video:
        cam.location, cam.data.lens = cams["general"][0], cams["general"][2]
        cam.rotation_euler = (cams["general"][1] - cams["general"][0]).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x, sc.render.resolution_y = 960, 540
        settings = sc.render.image_settings
        if hasattr(settings, "media_type"):
            settings.media_type = "VIDEO"
        settings.file_format = "FFMPEG"
        sc.render.ffmpeg.format = "MPEG4"
        sc.render.ffmpeg.codec = "H264"
        sc.render.filepath = os.path.join(folder, "trincheras.mp4")
        bpy.ops.render.render(animation=True)
        print("VIDEO", sc.render.filepath)


def main(args: list[str]) -> None:
    export_files = "--no-export" not in args
    shots = {}
    if export_files:
        # Cada soldado sale con sus acciones: el exportador incluye todas las compatibles con el
        # esqueleto, así que se exporta cada uno desde una escena propia
        for side in SIDES:
            fresh_scene()
            arm, body, shots[side], _ = build_soldier(side)
            export([arm, body], os.path.join(MODELS, f"soldado-{side}.glb"), animations=True)
        fresh_scene()
        export([build_parapet()], os.path.join(MODELS, "parapeto.glb"), animations=False)

    if "--preview" in args:
        # Los dos bandos en la misma escena, cada soldado con sus acciones
        fresh_scene()
        soldiers = {}
        for side in SIDES:
            arm, body, shots[side], actions = build_soldier(side)
            soldiers[side] = (arm, body, actions)
        preview(args[args.index("--preview") + 1], "--video" in args, soldiers, build_parapet(), timeline(shots))

    if export_files:
        data = timeline(shots)
        with open(os.path.join(ROOT, "src", "data", "trenches.json"), "w") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print("TIMELINE", data["durationMs"], "ms,", len(data["cues"]), "sonidos")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
