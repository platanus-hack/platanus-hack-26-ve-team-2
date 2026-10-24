"""Globos con los logos de los sponsors para el final de la batalla (Blender sin UI).

Cada globo: cuerpo ovalado del color de la marca, el logo pegado adelante y atrás siguiendo la
curva del globo, nudo e hilo. El origen queda en el centro del globo; adelante es -Y en Blender
(+Z en la app, hacia el usuario).

Uso (desde frontend/):
  <blender> -b --python scripts/battle/build_balloons.py -- [--preview <carpeta>]

Escribe assets/models/globo-<marca>.glb. Para cambiar un logo basta reemplazar el PNG (con fondo
transparente) en assets/images/sponsors/ y volver a correr el script.
"""

import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOGOS = os.path.join(ROOT, "assets", "images", "sponsors")
MODELS = os.path.join(ROOT, "assets", "models")

RADIUS = 0.22  # el globo mide ~45 cm de ancho: se ve bien a varios metros
HEIGHT = 1.18  # más alto que ancho
LOGO_WIDTH = 0.30

BRANDS = {
    "yummy": {"color": (0.27, 0.06, 0.55), "logo": "yummy.png"},  # violeta, logo blanco
    "cashea": {"color": (0.98, 0.86, 0.05), "logo": "cashea.png"},  # amarillo, logo negro
}


def material(name: str, color: tuple, roughness: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def to_srgb(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def logo_material(name: str, path: str, color: tuple) -> bpy.types.Material:
    """Logo pintado sobre el color del globo en una textura opaca: no depende de cómo el
    visor mezcle la transparencia."""
    src = bpy.data.images.load(path)
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bg = np.array([to_srgb(c) for c in color], dtype=np.float32)
    alpha = px[..., 3:4]
    out = np.ones_like(px)
    out[..., :3] = px[..., :3] * alpha + bg * (1 - alpha)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(out.ravel())
    img.pack()

    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.22
    return mat


def balloon_body() -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=RADIUS)
    for v in bm.verts:
        v.co.z *= HEIGHT
        # Forma de gota: se angosta hacia el nudo
        if v.co.z < 0:
            k = 1 + 0.28 * v.co.z / (RADIUS * HEIGHT)
            v.co.x *= k
            v.co.y *= k
    return bm


def build(brand: str, spec: dict) -> list[bpy.types.Object]:
    body_bm = balloon_body()
    tree = BVHTree.FromBMesh(body_bm)
    bottom = min(v.co.z for v in body_bm.verts)
    mesh = bpy.data.meshes.new(f"globo_{brand}")
    body_bm.to_mesh(mesh)
    body_bm.free()
    for f in mesh.polygons:
        f.use_smooth = True
    mesh.materials.append(material(f"globo_{brand}", spec["color"], 0.22))
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Nudo e hilo, en el mismo material del globo y blanco
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.018, radius2=0.006, depth=0.03)
    bmesh.ops.translate(bm, vec=(0, 0, bottom - 0.012), verts=bm.verts)
    string = bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=0.0025, radius2=0.0025, depth=0.6)["verts"]
    bmesh.ops.translate(bm, vec=(0, 0, bottom - 0.03 - 0.3), verts=string)
    string_faces = {f for v in string for f in v.link_faces}
    for f in bm.faces:
        f.material_index = 1 if f in string_faces else 0
    extra = bpy.data.meshes.new(f"nudo_{brand}")
    bm.to_mesh(extra)
    bm.free()
    extra.materials.append(mesh.materials[0])
    extra.materials.append(material("hilo", (0.92, 0.92, 0.9), 0.8))
    knot = bpy.data.objects.new(extra.name, extra)
    bpy.context.scene.collection.objects.link(knot)

    # Logo: una grilla proyectada sobre la superficie, 3 mm afuera, adelante y atrás
    path = os.path.join(LOGOS, spec["logo"])
    img = bpy.data.images.load(path)
    aspect = img.size[1] / img.size[0]
    w, h = LOGO_WIDTH, LOGO_WIDTH * aspect
    logo_mat = logo_material(f"logo_{brand}", path, spec["color"])
    decals = []
    for side in (-1, 1):  # -1 = adelante (-Y)
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new()
        cols, rows = 16, 6
        grid = []
        for j in range(rows + 1):
            row = []
            for i in range(cols + 1):
                x = -w / 2 + w * i / cols
                z = 0.03 - h / 2 + h * j / rows
                # Desde atrás el logo se lee bien si se espeja en X
                px = x * -side
                hit, normal, *_ = tree.ray_cast(Vector((px, side * 1.0, z)), Vector((0, -side, 0)))
                row.append(bm.verts.new(hit + normal * 0.003))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                face = bm.faces.new(quad if side == -1 else list(reversed(quad)))
                corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
                if side == 1:
                    corners = list(reversed(corners))
                for loop, (ci, cj) in zip(face.loops, corners):
                    loop[uv].uv = (ci / cols, cj / rows)
        decal = bpy.data.meshes.new(f"logo_{brand}_{'frente' if side < 0 else 'atras'}")
        bm.to_mesh(decal)
        bm.free()
        decal.materials.append(logo_mat)
        d = bpy.data.objects.new(decal.name, decal)
        bpy.context.scene.collection.objects.link(d)
        decals.append(d)

    bpy.ops.object.select_all(action="DESELECT")
    for o in (obj, knot, *decals):
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    return [obj]


def main(args: list[str]) -> None:
    for brand, spec in BRANDS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        (obj,) = build(brand, spec)
        if "--preview" in args:
            folder = args[args.index("--preview") + 1]
            os.makedirs(folder, exist_ok=True)
            sc = bpy.context.scene
            sc.render.engine = "BLENDER_EEVEE"
            sc.render.resolution_x, sc.render.resolution_y = 400, 500
            world = bpy.data.worlds.new("w")
            world.color = (0.6, 0.65, 0.7)
            sc.world = world
            sun = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
            sun.data.energy = 3
            sun.rotation_euler = (0.7, 0.2, -0.5)
            sc.collection.objects.link(sun)
            cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
            sc.collection.objects.link(cam)
            sc.camera = cam
            cam.location = (0.35, -1.4, 0.0)
            cam.rotation_euler = (Vector((0, 0, -0.12)) - cam.location).to_track_quat("-Z", "Y").to_euler()
            sc.render.filepath = os.path.join(folder, f"globo_{brand}.png")
            bpy.ops.render.render(write_still=True)
        path = os.path.join(MODELS, f"globo-{brand}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path,
            use_selection=False,
            export_format="GLB",
            export_yup=True,
            export_animations=False,
            export_image_format="AUTO",
            export_draco_mesh_compression_enable=False,  # Viro no soporta Draco
        )
        print("EXPORT", path, f"{os.path.getsize(path) / 1e3:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
