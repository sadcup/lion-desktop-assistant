"""Read AT-SPI names/roles/rectangles, excluding password fields. No input injection."""
import gi,json,sys,time
gi.require_version('Atspi','2.0')
from gi.repository import Atspi
root=Atspi.get_desktop(0);filter_name=sys.argv[1].lower() if len(sys.argv)>1 else '';nodes=[];start=time.monotonic()
def visit(node,app,depth,path):
 if node is None or depth>6 or len(nodes)>=140 or time.monotonic()-start>4:return
 try:
  role=node.get_role_name();name=node.get_name() or ''
  if 'password' in role.lower():return
  row={'app':app,'name':name[:200],'role':role,'path':path}
  try:
   rect=node.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
   if rect.width>0 and rect.height>0:row['bounds']={'x':rect.x,'y':rect.y,'width':rect.width,'height':rect.height}
  except Exception:pass
  if name or depth<2:nodes.append(row)
  for j in range(min(node.get_child_count(),50)):visit(node.get_child_at_index(j),app,depth+1,path+'/'+str(j))
 except Exception:pass
apps=[]
for i in range(root.get_child_count()):
 app=root.get_child_at_index(i);name=app.get_name();apps.append(name)
 if (filter_name and filter_name in name.lower()) or (not filter_name and name not in ['gnome-shell','gjs']):visit(app,name,0,str(i))
print(json.dumps({'apps':apps,'nodes':nodes,'limited':len(nodes)>=140,'note':'无障碍树可能不完整；bounds为原始屏幕坐标，不是缩略图坐标。'},ensure_ascii=False))
