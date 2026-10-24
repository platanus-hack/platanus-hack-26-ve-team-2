"""Motor de animación procedural para los rigs de Mixamo (Bolívar y Monteverde).

La coreografía se escribe como keyframes de alto nivel (posición y giro del cuerpo, inclinación del
torso, dónde van las manos y los pies, hacia dónde apunta el sable) y este módulo:
  - interpola cada campo por separado (un key solo mueve lo que nombra),
  - resuelve brazos y piernas con IK de dos huesos (los pies quedan plantados en el piso),
  - hornea el resultado frame a frame en una acción de Blender, lista para exportar a glTF.

Coordenadas de Blender, en metros: Z arriba, piso en z = 0. Los personajes en reposo miran hacia -Y.
`F(adelante, izquierda, arriba)` escribe vectores en el marco del personaje.
"""

import math

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

FPS = 24
P = "mixamorig:"
SWORD = "Sword"
SIDES = (("r", "Right"), ("l", "Left"))


def F(fwd: float, left: float, up: float = 0.0) -> Vector:
    """Vector en el marco del personaje (sin girar): -Y es adelante, +X su izquierda."""
    return Vector((left, -fwd, up))


def smooth(u: float) -> float:
    return u * u * (3 - 2 * u)


EASE = {
    "io": smooth,
    "lin": lambda u: u,
    "in": lambda u: u * u,
    "out": lambda u: 1 - (1 - u) * (1 - u),
}


def rot(axis: str, deg: float) -> Matrix:
    return Matrix.Rotation(math.radians(deg), 3, axis)


def body_rotation(yaw: float, pitch: float, roll: float) -> Matrix:
    """Giro del cuerpo: yaw en Z (positivo = gira a su izquierda), pitch se inclina hacia adelante, roll hacia su izquierda."""
    return rot("Z", yaw) @ rot("X", pitch) @ rot("Y", roll)


def spine_rotation(p: float, y: float, r: float) -> Matrix:
    return rot("X", p) @ rot("Z", y) @ rot("Y", r)


def lerp(a, b, u: float):
    return a + (b - a) * u


def lerp3(a: tuple, b: tuple, u: float) -> tuple:
    return tuple(lerp(x, y, u) for x, y in zip(a, b))


def nlerp(a: Vector, b: Vector, u: float) -> Vector:
    v = a.lerp(b, u)
    return v.normalized() if v.length > 1e-6 else b.normalized()


def with_rotation(m: Matrix, r: Matrix) -> Matrix:
    """Misma posición (cabeza del hueso), orientación `r`."""
    out = r.to_4x4()
    out.translation = m.translation
    return out


def rotate(m: Matrix, r: Matrix) -> Matrix:
    """Gira el hueso `r` (en coordenadas del mundo) alrededor de su cabeza."""
    return with_rotation(m, r @ m.to_3x3())


def aim(m: Matrix, direction: Vector) -> Matrix:
    """Apunta el eje Y del hueso hacia `direction` con el giro mínimo (sin torcerlo de más)."""
    current = m.col[1].xyz.normalized()
    q = current.rotation_difference(direction.normalized())
    return rotate(m, q.to_matrix())


def two_bone_ik(root: Vector, target: Vector, l1: float, l2: float, pole: Vector) -> tuple[Vector, Vector]:
    """Codo/rodilla y punto final reales para alcanzar `target` desde `root`, doblando hacia `pole`."""
    d = target - root
    dist = max(min(d.length, (l1 + l2) * 0.999), abs(l1 - l2) + 1e-3)
    n = d.normalized()
    end = root + n * dist
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    side = pole - n * pole.dot(n)
    if side.length < 1e-6:
        side = n.orthogonal()
    joint = root + n * a + side.normalized() * h
    return joint, end


class Track:
    """Valores de un campo en el tiempo; cada segmento usa el easing del key en que termina."""

    def __init__(self, default):
        self.keys: list[tuple[float, object, str]] = []
        self.default = default

    def add(self, t: float, value, ease: str) -> None:
        self.keys.append((t, value, ease))
        self.keys.sort(key=lambda k: k[0])

    def segment(self, t: float):
        """(valor anterior, valor siguiente, u con easing)."""
        ks = self.keys
        if not ks:
            return self.default, self.default, 0.0
        if t <= ks[0][0]:
            return ks[0][1], ks[0][1], 0.0
        for (t0, v0, _), (t1, v1, e) in zip(ks, ks[1:]):
            if t < t1:
                return v0, v1, EASE[e]((t - t0) / (t1 - t0))
        return ks[-1][1], ks[-1][1], 0.0

    def value(self, t: float, mix=lerp):
        a, b, u = self.segment(t)
        return mix(a, b, u)

    def step(self, t: float):
        """Valor del último key en o antes de t (para booleanos y modos)."""
        out = self.default
        for k in self.keys:
            if k[0] <= t + 1e-6:
                out = k[1]
        return out

    def times(self) -> list[float]:
        return [k[0] for k in self.keys]


class Rig:
    """Datos de reposo de un armature de Mixamo y la coreografía de su personaje."""

    def __init__(self, arm: bpy.types.Object):
        self.arm = arm
        bones = arm.data.bones
        self.order: list[str] = []

        def visit(b):
            self.order.append(b.name)
            for c in b.children:
                visit(c)

        for b in bones:
            if b.parent is None:
                visit(b)
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.rel = {n: self.rest[p].inverted() @ self.rest[n] for n, p in self.parent.items() if p}
        self.hips_z = self.rest[P + "Hips"].translation.z

        def length(a: str, b: str) -> float:
            return (self.rest[P + b].translation - self.rest[P + a].translation).length

        self.arm_len = {s: (length(f"{S}Arm", f"{S}ForeArm"), length(f"{S}ForeArm", f"{S}Hand")) for s, S in SIDES}
        self.leg_len = {s: (length(f"{S}UpLeg", f"{S}Leg"), length(f"{S}Leg", f"{S}Foot")) for s, S in SIDES}
        self.ankle_z = {s: self.rest[P + f"{S}Foot"].translation.z for s, S in SIDES}
        # Muñecas con los brazos colgando relajados (el modelo está en pose A)
        self.relax = {}
        for s, S in SIDES:
            shoulder = self.rest[P + f"{S}Arm"].translation
            reach = sum(self.arm_len[s]) * 0.97
            self.relax[s] = Vector((math.copysign(0.21, shoulder.x), -0.03, shoulder.z - reach))

        self.tracks: dict[str, Track] = {}
        self.feet: dict[str, Track] = {"l": Track(None), "r": Track(None)}
        self.overrides: list = []  # funciones (rig, t, des) que pisan matrices después del FK
        self.phase = 0.0

    # --- coreografía -------------------------------------------------------------------------

    DEFAULTS = {
        "x": 0.0, "y": 0.0, "dz": 0.0, "yaw": 0.0, "pitch": 0.0, "roll": 0.0, "scale": 1.0,
        "spine": (0.0, 0.0, 0.0), "head": (0.0, 0.0, 0.0),
        "rh": None, "lh": None, "sword": False, "gait": None,
        "blade": F(0.6, 0, -0.8), "edge": F(0.8, 0, 0.6),
    }

    def track(self, name: str) -> Track:
        if name not in self.tracks:
            self.tracks[name] = Track(self.DEFAULTS[name])
        return self.tracks[name]

    def keys(self, keys: list[dict]) -> None:
        for k in keys:
            t, e = k["t"], k.get("e", "io")
            for name, v in k.items():
                if name in ("t", "e", "feet"):
                    continue
                self.track(name).add(t, v, e)
        # Los pies se escriben relativos al cuerpo en ese key y se guardan en el mundo: quedan
        # plantados hasta que otro key los mueva
        for k in keys:
            if "feet" not in k:
                continue
            t, e = k["t"], k.get("e", "io")
            x, y, yaw = (self.num("x", t), self.num("y", t), self.num("yaw", t))
            for s in ("l", "r"):
                if s not in k["feet"]:
                    continue
                local = k["feet"][s]
                w = rot("Z", yaw) @ Vector((local.x, local.y, 0))
                foot_yaw = yaw + k["feet"].get(s + "yaw", 0.0)
                self.feet[s].add(t, (Vector((x + w.x, y + w.y, 0)), foot_yaw), e)

    def num(self, name: str, t: float) -> float:
        return self.track(name).value(t) if name in self.tracks else self.DEFAULTS[name]

    def state(self, t: float, dt: float) -> dict:
        st = {n: self.num(n, t) for n in ("x", "y", "dz", "yaw", "pitch", "roll", "scale")}
        for n in ("spine", "head"):
            st[n] = self.track(n).value(t, lerp3)
        st["blade"] = self.track("blade").value(t, nlerp)
        st["edge"] = self.track("edge").value(t, nlerp)
        st["sword"] = self.track("sword").step(t)
        st["hands"] = {s: self.track(s + "h").segment(t) for s in ("r", "l")}
        gait = self.track("gait").step(t)
        st["gait"] = gait
        if gait:
            # Velocidad del cuerpo: la zancada se ajusta para que los pies no patinen
            vx = (self.num("x", t + dt) - self.num("x", t)) / dt
            vy = (self.num("y", t + dt) - self.num("y", t)) / dt
            st["speed"] = math.hypot(vx, vy)
            self.phase = (self.phase + gait["cadence"] * dt) % 1.0
            st["dz"] += gait.get("bob", 0.03) * (math.cos(4 * math.pi * self.phase) - 1) / 2
        st["phase"] = self.phase
        st["t"] = t
        return st

    # --- pose ---------------------------------------------------------------------------------

    def gait_foot(self, st: dict, s: str) -> tuple[Vector, float, float]:
        g = st["gait"]
        amp = min(st["speed"] / (4 * g["cadence"]), g.get("max_stride", 0.45))
        p = (st["phase"] + (0.5 if s == "l" else 0.0)) % 1.0
        if p < 0.5:  # apoyo: el pie va de adelante hacia atrás a la velocidad del cuerpo
            fwd, lift = amp * (1 - 4 * p), 0.0
        else:  # vuelo
            q = (p - 0.5) / 0.5
            fwd, lift = -amp + 2 * amp * smooth(q), g.get("lift", 0.12) * math.sin(math.pi * q)
        side = 0.1 if s == "l" else -0.1
        w = rot("Z", st["yaw"]) @ F(fwd, side, 0)
        return Vector((st["x"] + w.x, st["y"] + w.y, 0)), lift, st["yaw"]

    def planted_foot(self, t: float, s: str) -> tuple[Vector, float, float]:
        a, b, u = self.feet[s].segment(t)
        (pa, ya), (pb, yb) = a, b
        moving = (pb - pa).length
        lift = 0.09 * math.sin(math.pi * u) * min(1.0, moving / 0.12) if moving > 0.02 else 0.0
        return pa.lerp(pb, u), lift, lerp(ya, yb, u)

    def foot(self, st: dict, s: str) -> tuple[Vector, float, float]:
        t = st["t"]
        g = self.track("gait")
        if not self.feet[s].keys:
            return self.gait_foot(st, s)
        if st["gait"]:
            gf = self.gait_foot(st, s)
            # Al terminar la carrera los pies llegan a la postura del key donde se detiene
            nxt = [k for k in g.keys if k[0] > t and not k[1]]
            if nxt and nxt[0][0] - t < 0.3:
                pf = self.planted_foot(nxt[0][0], s)
                u = smooth(1 - (nxt[0][0] - t) / 0.3)
                return gf[0].lerp(pf[0], u), gf[1] * (1 - u), lerp(gf[2], pf[2], u)
            start = max(k[0] for k in g.keys if k[0] <= t + 1e-6)
            if t - start < 0.2:
                pf = self.planted_foot(start, s)
                u = smooth((t - start) / 0.2)
                return pf[0].lerp(gf[0], u), gf[1] * u, lerp(pf[2], gf[2], u)
            return gf
        return self.planted_foot(t, s)

    def hand_target(self, st: dict, s: str, spec, hips: Vector, torso: Matrix) -> Vector:
        if spec is None:
            if st["gait"]:
                swing = 0.22 * math.cos(2 * math.pi * (st["phase"] + (0.5 if s == "l" else 0.0)))
                v = F(0.08 - swing, 0.2 if s == "l" else -0.2, 1.0 + 0.08 * abs(swing) / 0.22)
            else:
                v = self.relax[s]
            spec = ("t", v)
        mode, v = spec
        if mode == "t":  # en el marco del torso, alturas como si estuviera de pie
            return hips + torso @ (v - Vector((0, 0, self.hips_z)))
        # "w": en el piso, relativo al cuerpo (solo su posición y giro)
        w = rot("Z", st["yaw"]) @ v
        return Vector((st["x"] + w.x, st["y"] + w.y, v.z))

    def solve(self, st: dict) -> dict[str, Matrix]:
        rest = self.rest
        des: dict[str, Matrix] = {}
        body = body_rotation(st["yaw"], st["pitch"], st["roll"])
        spine = spine_rotation(*st["spine"])
        torso = body @ spine
        hips_pos = Vector((st["x"], st["y"], self.hips_z + st["dz"]))
        hand = {}
        for s in ("r", "l"):
            a, b, u = st["hands"][s]
            hand[s] = self.hand_target(st, s, a, hips_pos, torso).lerp(self.hand_target(st, s, b, hips_pos, torso), u)
        feet = {s: self.foot(st, s) for s in ("l", "r")}
        poles = {
            "rArm": torso @ F(-0.5, -0.6, -0.6), "lArm": torso @ F(-0.5, 0.6, -0.6),
            "rUpLeg": body @ F(1, -0.12, 0.25), "lUpLeg": body @ F(1, 0.12, 0.25),
        }
        ik = {}
        spine_bones = {P + "Spine", P + "Spine1", P + "Spine2"}
        head_bones = {P + "Neck", P + "Head"}

        for name in self.order:
            if self.parent[name] is None:
                m = Matrix.Translation(hips_pos) @ (body @ rest[name].to_3x3()).to_4x4()
            else:
                m = des[self.parent[name]] @ self.rel[name]
            short = name[len(P):] if name.startswith(P) else name
            if name in spine_bones:
                third = spine_rotation(*(c / 3 for c in st["spine"]))
                m = rotate(m, body @ third @ body.inverted())
            elif name in head_bones:
                half = spine_rotation(*(c / 2 for c in st["head"]))
                m = rotate(m, torso @ half @ torso.inverted())
            elif short in ("RightArm", "LeftArm"):
                s = short[0].lower()
                joint, end = two_bone_ik(m.translation, hand[s], *self.arm_len[s], poles[s + "Arm"])
                ik[s + "arm"] = (joint, end)
                m = aim(m, joint - m.translation)
            elif short in ("RightForeArm", "LeftForeArm"):
                joint, end = ik[short[0].lower() + "arm"]
                m = aim(m, end - joint)
            elif short in ("RightUpLeg", "LeftUpLeg"):
                s = short[0].lower()
                pos, lift, _ = feet[s]
                target = Vector((pos.x, pos.y, self.ankle_z[s] + lift))
                joint, end = two_bone_ik(m.translation, target, *self.leg_len[s], poles[s + "UpLeg"])
                ik[s + "leg"] = (joint, end)
                m = aim(m, joint - m.translation)
            elif short in ("RightLeg", "LeftLeg"):
                joint, end = ik[short[0].lower() + "leg"]
                m = aim(m, end - joint)
            elif short in ("RightFoot", "LeftFoot"):
                # Planta paralela al piso, girada hacia donde apunta el pie
                yaw = feet[short[0].lower()][2]
                m = with_rotation(m, rot("Z", yaw) @ rest[name].to_3x3())
            elif name == SWORD:
                h = des[P + "RightHand"]
                grip = h.translation + h.col[1].xyz.normalized() * 0.075
                y = (torso @ st["blade"]).normalized()
                z = torso @ st["edge"]
                z = z - y * z.dot(y)
                if z.length < 1e-4:
                    z = y.orthogonal()
                z.normalize()
                x = y.cross(z)
                m = Matrix((x, y, z)).transposed().to_4x4()
                m.translation = grip
            des[name] = m
        for fn in self.overrides:
            fn(self, st, des)
        return des

    def basis(self, des: dict[str, Matrix], st: dict) -> dict[str, tuple[Vector, Quaternion, Vector]]:
        out = {}
        for name in self.order:
            p = self.parent[name]
            if p is None:
                b = self.rest[name].inverted() @ des[name]
            else:
                b = self.rel[name].inverted() @ (des[p].inverted() @ des[name])
            loc, q, sca = b.decompose()
            if p is None:
                sca = Vector((st["scale"],) * 3)
            if name == SWORD and not st["sword"]:
                sca = Vector((1e-4,) * 3)
            out[name] = (loc, q, sca)
        return out

    # --- horneado -----------------------------------------------------------------------------

    def bake(self, action_name: str, duration: float) -> bpy.types.Action:
        frames = int(round(duration * FPS)) + 1
        dt = 1.0 / FPS
        self.phase = 0.0
        samples = {n: ([], [], []) for n in self.order}
        last_q: dict[str, Quaternion] = {}
        for f in range(frames):
            t = f / FPS
            st = self.state(t, dt)
            for name, (loc, q, sca) in self.basis(self.solve(st), st).items():
                # Mismo hemisferio que el frame anterior: la interpolación no da la vuelta larga
                if name in last_q and last_q[name].dot(q) < 0:
                    q = -q
                last_q[name] = q
                samples[name][0].append(loc)
                samples[name][1].append(q)
                samples[name][2].append(sca)

        arm = self.arm
        if arm.animation_data is None:
            arm.animation_data_create()
        action = bpy.data.actions.new(action_name)
        arm.animation_data.action = action
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
        for name, (locs, quats, scas) in samples.items():
            base = f'pose.bones["{name}"]'
            for path, values, size in (("location", locs, 3), ("rotation_quaternion", quats, 4), ("scale", scas, 3)):
                for i in range(size):
                    fc = action.fcurve_ensure_for_datablock(arm, f"{base}.{path}", index=i, group_name=name)
                    co = np.empty(frames * 2, dtype=np.float32)
                    co[0::2] = np.arange(frames)
                    co[1::2] = [v[i] for v in values]
                    fc.keyframe_points.add(frames)
                    fc.keyframe_points.foreach_set("co", co)
                    fc.keyframe_points.foreach_set("interpolation", [1] * frames)  # LINEAR
                    fc.update()
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = action_name
        track.strips.new(action_name, 0, action)
        return action
