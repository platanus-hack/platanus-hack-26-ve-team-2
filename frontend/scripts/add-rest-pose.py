"""Agrega al GLB la animación "reposo": la pose quieta, de pie, del último cuadro de otra animación.

Viro no tiene una pose de reposo: al detener una animación el modelo se queda congelado en el cuadro
donde iba (al dejar de caminar quedaba a mitad del paso). La app reproduce "reposo" al detenerse para
volver a la pose normal. Por defecto se copia el final de "saludo", que termina de pie y con los
brazos abajo.

No necesita Blender, solo Python 3. Si "reposo" ya existe, se reemplaza.

Uso (desde frontend/):
  python3 scripts/add-rest-pose.py assets/models/bolivar.glb [animacion-origen]
"""

import json
import struct
import sys

REST_NAME = "reposo"
# La pose se mantiene igual entre estos dos instantes (s): un solo cuadro no siempre se reproduce
REST_TIMES = (0.0, 0.25)
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
FLOAT = 5126


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, "no es un GLB 2.0"
    offset = 12
    gltf = binary = None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = bytearray(chunk)
        offset += 8 + length
    return gltf, binary


def write_glb(path, gltf, binary):
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(text), 0x4E4F534A) + text)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + bytes(binary))


def last_value(gltf, binary, sampler):
    """Último valor de la salida de un sampler (si es CUBICSPLINE, el valor, no las tangentes)."""
    accessor = gltf["accessors"][sampler["output"]]
    assert accessor["componentType"] == FLOAT and not accessor.get("normalized"), "solo floats"
    view = gltf["bufferViews"][accessor["bufferView"]]
    assert not view.get("byteStride"), "no soporta datos intercalados"
    size = COMPONENTS[accessor["type"]]
    index = accessor["count"] - 1
    if sampler.get("interpolation") == "CUBICSPLINE":
        index -= 1
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0) + index * size * 4
    return accessor["type"], struct.unpack_from(f"<{size}f", binary, start)


def main():
    path = sys.argv[1]
    source_name = sys.argv[2] if len(sys.argv) > 2 else "saludo"
    gltf, binary = read_glb(path)
    animations = gltf["animations"]
    source = next(a for a in animations if a["name"] == source_name)
    animations[:] = [a for a in animations if a["name"] != REST_NAME]

    # Todos los datos nuevos van al final del buffer, en un bufferView propio
    binary += b"\0" * (-len(binary) % 4)
    view_index = len(gltf["bufferViews"])
    view_start = len(binary)
    chunk = bytearray()

    def add_accessor(kind, values, with_bounds=False):
        size = COMPONENTS[kind]
        accessor = {
            "bufferView": view_index,
            "byteOffset": len(chunk),
            "componentType": FLOAT,
            "count": len(values) // size,
            "type": kind,
        }
        if with_bounds:
            accessor["min"] = [min(values[i::size]) for i in range(size)]
            accessor["max"] = [max(values[i::size]) for i in range(size)]
        chunk.extend(struct.pack(f"<{len(values)}f", *values))
        gltf["accessors"].append(accessor)
        return len(gltf["accessors"]) - 1

    times = add_accessor("SCALAR", list(REST_TIMES), with_bounds=True)
    samplers, channels = [], []
    for channel in source["channels"]:
        kind, value = last_value(gltf, binary, source["samplers"][channel["sampler"]])
        output = add_accessor(kind, list(value) * len(REST_TIMES))
        samplers.append({"input": times, "output": output, "interpolation": "STEP"})
        channels.append({"sampler": len(samplers) - 1, "target": dict(channel["target"])})

    binary += chunk
    gltf["bufferViews"].append({"buffer": 0, "byteOffset": view_start, "byteLength": len(chunk)})
    gltf["buffers"][0]["byteLength"] = len(binary) + (-len(binary) % 4)
    animations.append({"name": REST_NAME, "samplers": samplers, "channels": channels})
    write_glb(path, gltf, binary)
    print(f'"{REST_NAME}" agregada a {path} con {len(channels)} canales (desde el final de "{source_name}")')


if __name__ == "__main__":
    main()
