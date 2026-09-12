"""Optimize the complete supplied defeat models, preserving their outfits and full animation."""
import bpy,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
paths=sys.argv[sys.argv.index('--')+1:]
if len(paths)!=2:raise SystemExit('Usage: blender -b --python tools/process_defeat_models.py -- MARV_GLB STEVE_GLB')
for name,source in zip(['marv','steve'],paths):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=source)
 arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 action=max(bpy.data.actions,key=lambda a:a.frame_range[1]-a.frame_range[0])
 action.name='defeat';action.use_fake_user=True
 arm.animation_data_clear();arm.animation_data_create();arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
 for a in list(bpy.data.actions):
  if a!=action:bpy.data.actions.remove(a)
 for o in bpy.data.objects:
  if o.type=='MESH' and len(o.data.vertices)>35000:
   bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Mobile mesh budget','DECIMATE');mod.ratio=30000/len(o.data.vertices);bpy.ops.object.modifier_apply(modifier=mod.name)
 for image in bpy.data.images:
  if image.size[0]>1024:image.scale(1024,1024);image.pack()
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets'/(name+'-defeat.glb')),export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_image_format='JPEG',export_jpeg_quality=85)
 print('DEFEAT_MODEL_EXPORTED',name)
