"""Le hace una boca de verdad al GLB de Bolívar para el lipsync (se corre con Blender, sin UI).

El modelo de Meshy no tiene boca: los labios están solo pintados en la textura y la malla es
continua. Este script:
  1. corta la malla en la línea entre los labios (los labios se pueden separar),
  2. agrega detrás un interior oscuro y dientes arriba y abajo, pegados al hueso de la cabeza,
  3. crea la shape key "boca_abierta": la mandíbula (labio inferior, mentón y dientes de abajo)
     rota hacia abajo alrededor de una bisagra a la altura de las orejas.
La app maneja el peso de "boca_abierta" con los visemas (`morphTargets` de Viro).

Uso (desde frontend/):
  <blender> -b --python scripts/add-mouth.py -- <modelo-original.glb> assets/models/bolivar.glb

Coordenadas de Blender, en metros: Z arriba, la cara mira hacia -Y, pies en z = 0 (mide 1,7 m).
Las medidas de la boca se tomaron mirando la textura del modelo.
"""

import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

TARGET_NAME = "boca_abierta"
HEAD_BONE = "mixamorig:Head"

MOUTH_X = -0.003  # centro de la boca pintada
MOUTH_Z = 1.501  # línea entre los labios
MOUTH_HALF_WIDTH = 0.022  # el corte llega hasta las comisuras
# Bisagra de la mandíbula (a la altura de las orejas) y cuánto rota con peso 1
JAW_PIVOT = Vector((0.0, -0.01, 1.535))
JAW_OPEN_DEG = 9.5
# Hasta dónde se mueve la piel con la mandíbula: mejillas, cuello y nuca quedan quietos
JAW_HALF_WIDTH = (0.035, 0.06)  # rota completo / ya no rota
JAW_BOTTOM_Z = (1.472, 1.452)  # debajo del mentón: rota completo / ya no rota
FACE_Y = (-0.07, -0.04)  # solo la parte de adelante de la cabeza

TEETH_HALF_WIDTH = 0.017
TEETH_DEPTH = 0.004  # detrás de la superficie de los labios
INNER_COLOR = (0.045, 0.008, 0.01, 1)
TEETH_COLOR = (0.86, 0.83, 0.74, 1)


def smooth(edge0: float, edge1: float, x: float) -> float:
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def material(name: str, color: tuple, roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0
    return mat


def main(src: str, dst: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    body = bpy.data.objects["Mesh0"]
    if body.data.shape_keys:
        sys.exit(f"{src} ya tiene shape keys: usá el modelo original de Meshy")
    # El importador agrega una esfera para mostrar los huesos: no va en el modelo
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj is not body:
            bpy.data.objects.remove(obj)
    assert body.matrix_world == Matrix.Identity(4), "se esperaba el mesh en el origen"

    head_group = body.vertex_groups[HEAD_BONE].index
    body.data.materials.append(material("boca_interior", INNER_COLOR, 1.0))
    body.data.materials.append(material("dientes", TEETH_COLOR, 0.45))
    inner_mat, teeth_mat = len(body.data.materials) - 2, len(body.data.materials) - 1

    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.verify()
    jaw = bm.verts.layers.float.new("jaw")  # 0 = quieto, 1 = rota con la mandíbula
    surface = BVHTree.FromBMesh(bm)

    def face_y(x: float, z: float) -> float:
        """Y de la piel de la cara en (x, z), tirando un rayo desde adelante."""
        hit, *_ = surface.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        assert hit, f"sin cara en x={x:.3f} z={z:.3f}"
        return hit.y

    # 1. Corte entre los labios
    region = [
        f
        for f in bm.faces
        if abs(f.calc_center_median().x - MOUTH_X) < MOUTH_HALF_WIDTH + 0.012
        and abs(f.calc_center_median().z - MOUTH_Z) < 0.012
        and f.calc_center_median().y < FACE_Y[0]
    ]
    geom = list({e for f in region for e in f.edges}) + list({v for f in region for v in f.verts}) + region
    cut = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, MOUTH_Z), plane_no=(0, 0, 1))["geom_cut"]
    lip_edges = [
        e
        for e in cut
        if isinstance(e, bmesh.types.BMEdge)
        and all(abs(v.co.x - MOUTH_X) < MOUTH_HALF_WIDTH for v in e.verts)
    ]
    assert lip_edges, "el corte no encontró la boca"
    bmesh.ops.split_edges(bm, edges=lip_edges)

    def is_lower(v: bmesh.types.BMVert) -> bool:
        if v.co.z < MOUTH_Z - 1e-5:
            return True
        # Vértices sobre el corte: son del labio inferior si todas sus caras están abajo
        on_line = abs(v.co.z - MOUTH_Z) <= 1e-5
        return on_line and bool(v.link_faces) and all(f.calc_center_median().z < MOUTH_Z for f in v.link_faces)

    for v in bm.verts:
        if not is_lower(v):
            continue
        x, y, z = v.co
        # Las comisuras quedan quietas: el labio inferior se abre en óvalo, el mentón baja entero
        dx = min(abs(x - MOUTH_X) / MOUTH_HALF_WIDTH, 1.0)
        oval = math.sqrt(1 - dx * dx)
        lip = oval + (1 - oval) * smooth(MOUTH_Z, MOUTH_Z - 0.014, z)
        v[jaw] = (
            lip
            * (1 - smooth(*JAW_HALF_WIDTH, abs(x - MOUTH_X)))
            * smooth(JAW_BOTTOM_Z[1], JAW_BOTTOM_Z[0], z)
            * (1 - smooth(*FACE_Y, y))
        )

    def add_verts(points: list[Vector], jaw_weight: float) -> list[bmesh.types.BMVert]:
        verts = [bm.verts.new(p) for p in points]
        for v in verts:
            v[deform][head_group] = 1.0
            v[jaw] = jaw_weight
        return verts

    def add_face(verts: list, mat: int) -> None:
        face = bm.faces.new(verts)
        face.material_index = mat
        face.normal_update()
        if face.normal.y > 0:  # que mire hacia afuera de la cara (-Y)
            face.normal_flip()

    # 2a. Dientes: una tira curva que sigue la cara, un poco detrás de los labios
    def teeth(z_top: float, z_bottom: float, extra_depth: float, jaw_weight: float) -> None:
        cols = 10
        xs = [MOUTH_X - TEETH_HALF_WIDTH + 2 * TEETH_HALF_WIDTH * i / cols for i in range(cols + 1)]
        top, bottom = [], []
        for x in xs:
            # En los costados los dientes se meten más hacia atrás, como una arcada
            curve = 0.006 * ((x - MOUTH_X) / TEETH_HALF_WIDTH) ** 2
            y = face_y(x, MOUTH_Z) + TEETH_DEPTH + extra_depth + curve
            top.append(Vector((x, y, z_top)))
            bottom.append(Vector((x, y, z_bottom)))
        top_v, bottom_v = add_verts(top, jaw_weight), add_verts(bottom, jaw_weight)
        for i in range(cols):
            add_face([top_v[i], top_v[i + 1], bottom_v[i + 1], bottom_v[i]], teeth_mat)

    teeth(MOUTH_Z + 0.004, MOUTH_Z - 0.006, 0.0, 0.0)  # de arriba: fijos
    teeth(MOUTH_Z + 0.001, MOUTH_Z - 0.008, 0.0015, 1.0)  # de abajo: bajan con la mandíbula

    # 2b. Interior: un elipsoide oscuro detrás de los labios, para no ver a través de la cabeza
    rx, ry, rz = 0.03, 0.022, 0.026
    center = Vector((MOUTH_X, face_y(MOUTH_X, MOUTH_Z) + TEETH_DEPTH + 0.003 + ry, MOUTH_Z - 0.008))
    sphere = bmesh.ops.create_uvsphere(
        bm,
        u_segments=16,
        v_segments=10,
        radius=1.0,
        matrix=Matrix.Translation(center) @ Matrix.Diagonal((rx, ry, rz, 1)),
    )
    for v in sphere["verts"]:
        v[deform][head_group] = 1.0
        v[jaw] = 0.0
        for f in v.link_faces:
            f.material_index = inner_mat
    poking = [v for v in sphere["verts"] if v.co.y < face_y(v.co.x, v.co.z) + 0.001]
    assert not poking, f"el interior de la boca sale por la cara en {len(poking)} vértices"

    bm.to_mesh(body.data)
    bm.free()

    # 3. Shape key: la mandíbula rota alrededor de la bisagra (abrir = el mentón baja y va hacia atrás)
    body.shape_key_add(name="Basis")
    key = body.shape_key_add(name=TARGET_NAME)
    weights = body.data.attributes["jaw"].data
    moved = 0
    for i, vert in enumerate(body.data.vertices):
        w = weights[i].value
        if w <= 0:
            continue
        rot = Matrix.Rotation(math.radians(JAW_OPEN_DEG * w), 3, "X")
        key.data[i].co = JAW_PIVOT + rot @ (vert.co - JAW_PIVOT)
        moved += 1
    body.data.attributes.remove(body.data.attributes["jaw"])

    bpy.ops.export_scene.gltf(
        filepath=dst,
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
    print(f"'{TARGET_NAME}' lista en {dst}: {moved} vértices rotan con la mandíbula")


if __name__ == "__main__":
    main(*sys.argv[sys.argv.index("--") + 1 :])
