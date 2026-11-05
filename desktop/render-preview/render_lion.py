"""Render the desktop buddy's neutral pose with physically shaded hair."""
import argparse
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--cpu", action="store_true")
parser.add_argument("--samples", type=int, default=32)
args = parser.parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 7
if not args.cpu:
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = "OPTIX"
    preferences.refresh_devices()
    for device in preferences.devices:
        device.use = device.type == "OPTIX"
    if not any(device.use for device in preferences.devices):
        raise RuntimeError("No OptiX GPU found. Use --cpu for CPU rendering.")
    scene.cycles.device = "GPU"

model = json.loads(args.model.read_text())
for surface in model["meshes"]:
    vertices = np.asarray(surface["vertices"]).reshape(-1, 3)
    faces = np.asarray(surface["indices"]).reshape(-1, 3)
    mesh = bpy.data.meshes.new("Lion surface")
    mesh.from_pydata(vertices.tolist(), [], faces.tolist())
    mesh.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    material = bpy.data.materials.new("Lion surface")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*surface["color"], 1)
    shader.inputs["Roughness"].default_value = surface["roughness"]
    mesh.materials.append(material)
    scene.collection.objects.link(bpy.data.objects.new(mesh.name, mesh))

def srgb_to_linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4

hair_materials = {}
for group in model["hair"]:
    points = np.asarray(group["points"], dtype=np.float32).reshape(-1, 4, 3)
    colors = np.asarray(group["colors"])
    for color in np.unique(colors):
        strands = points[colors == color]
        count = len(strands)
        curves = bpy.data.hair_curves.new("Groom")
        curves.add_curves([4] * count)
        curves.attributes["position"].data.foreach_set("vector", strands.ravel())
        radii = curves.attributes.get("radius") or curves.attributes.new("radius", "FLOAT", "POINT")
        radii.data.foreach_set("value", np.tile([.0022, .0018, .0012, .0003], count))
        if color not in hair_materials:
            material = bpy.data.materials.new(f"Hair {color:06x}")
            material.use_nodes = True
            nodes = material.node_tree.nodes
            hair = nodes.new("ShaderNodeBsdfHairPrincipled")
            hair.parametrization = "COLOR"
            rgb = [srgb_to_linear(((int(color) >> shift) & 255) / 255) for shift in (16, 8, 0)]
            hair.inputs["Color"].default_value = (*rgb, 1)
            hair.inputs["Roughness"].default_value = .32
            hair.inputs["Radial Roughness"].default_value = .46
            material.node_tree.links.new(hair.outputs[0], nodes.get("Material Output").inputs["Surface"])
            hair_materials[color] = material
        curves.materials.append(hair_materials[color])
        scene.collection.objects.link(bpy.data.objects.new(curves.name, curves))

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()

camera_data = bpy.data.cameras.new("Portrait")
scene.camera = bpy.data.objects.new("Portrait", camera_data)
scene.collection.objects.link(scene.camera)
scene.camera.location = (-.67, -8, 2.42)
aim(scene.camera, (-.06, 0, 1.72))
camera_data.type = "ORTHO"
camera_data.ortho_scale = 3.87

for name, position, power, size, color in [
    ("Soft key", (-3.6,-4.3,5.6), 460, 3.4, (1,.84,.70)),
    ("Warm rim", (2.1,1.9,4.0), 630, 2.4, (1,.64,.37)),
    ("Cool fill", (3.2,-4.0,2.5), 140, 2.6, (.72,.83,1)),
]:
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.size, light.color = power, size, color
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, (0,0,1.8))

scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.21,.15,.11,1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .38
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 680, 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(args.output.resolve())
bpy.ops.render.render(write_still=True)
