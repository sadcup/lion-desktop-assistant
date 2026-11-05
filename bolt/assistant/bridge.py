"""User-session desktop bridge. Private Unix socket; no shell command endpoint."""
import base64,errno,io,sys,urllib.request,urllib.error
import ctypes as C,ctypes.util,datetime,http.server,json,os,pathlib,re,shutil,socketserver,subprocess,time,uuid
from urllib.parse import urlparse
ROOT=pathlib.Path(__file__).resolve().parent;RUN=ROOT/'run';RUN.mkdir(exist_ok=True);IMAGES=RUN/'images';IMAGES.mkdir(exist_ok=True)
HOME=pathlib.Path.home();ROOTS=[HOME/x for x in ['Desktop','Documents','Downloads','Pictures','projects'] if (HOME/x).is_dir()];NOTES=HOME/'Documents/Bolt Notes'
APPS={k:v for k,v in {'files':'org.gnome.Nautilus.desktop','browser':'google-chrome.desktop','editor':'org.gnome.TextEditor.desktop','code':'code.desktop','settings':'org.gnome.Settings.desktop','calculator':'org.gnome.Calculator.desktop','monitor':'org.gnome.SystemMonitor.desktop','terminal':'org.gnome.Terminal.desktop','pdf':'org.gnome.Evince.desktop'}.items() if (pathlib.Path('/usr/share/applications')/v).exists()}
# The distro uses nautilus.desktop on some installations.
if 'files' not in APPS:APPS['files']='nautilus.desktop' if pathlib.Path('/usr/share/applications/nautilus.desktop').exists() else 'org.gnome.Nautilus.desktop'
ENV={**os.environ,'DISPLAY':os.getenv('DISPLAY',':0'),'DBUS_SESSION_BUS_ADDRESS':os.getenv('DBUS_SESSION_BUS_ADDRESS',f'unix:path=/run/user/{os.getuid()}/bus')}
def run(args,timeout=10):
 p=subprocess.run(args,env=ENV,text=True,capture_output=True,timeout=timeout)
 if p.returncode:raise ValueError((p.stderr or p.stdout or 'command failed')[:500])
 return p.stdout.strip()
def launch(args):
 p=subprocess.Popen(args,env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 try:
  code=p.wait(timeout=4)
  if code:raise ValueError('桌面启动器退出码 '+str(code))
 except subprocess.TimeoutExpired:pass
 return '启动请求已提交，使用窗口列表核对'
def safe_path(s):
 p=pathlib.Path(os.path.expanduser(s)).resolve()
 if not any(p==r or r in p.parents for r in ROOTS):raise ValueError('路径仅允许 Desktop、Documents、Downloads、Pictures、projects')
 if any(x.startswith('.') or x.lower().split('.')[0] in ['credentials','secrets','secret','auth','token','tokens','node_modules'] or x.lower().endswith(('.pem','.key')) for x in p.parts[len(HOME.parts):]):raise ValueError('不读取隐藏目录或凭证文件')
 return p
xlib=C.CDLL(ctypes.util.find_library('X11'));xtst=C.CDLL(ctypes.util.find_library('Xtst'));xlib.XInitThreads();xlib.XOpenDisplay.restype=C.c_void_p
xlib.XOpenDisplay.argtypes=[C.c_char_p];display=xlib.XOpenDisplay(ENV['DISPLAY'].encode())
if not display:raise RuntimeError('无法连接X11桌面')
xlib.XDefaultRootWindow.argtypes=[C.c_void_p];xlib.XDefaultRootWindow.restype=C.c_ulong;root=xlib.XDefaultRootWindow(display)
xlib.XInternAtom.argtypes=[C.c_void_p,C.c_char_p,C.c_int];xlib.XInternAtom.restype=C.c_ulong
xlib.XGetWindowProperty.argtypes=[C.c_void_p,C.c_ulong,C.c_ulong,C.c_long,C.c_long,C.c_int,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_int),C.POINTER(C.c_ulong),C.POINTER(C.c_ulong),C.POINTER(C.POINTER(C.c_ubyte))]
xlib.XFree.argtypes=[C.c_void_p];xlib.XFlush.argtypes=[C.c_void_p]
class XErrorEvent(C.Structure):
 _fields_=[('type',C.c_int),('display',C.c_void_p),('resourceid',C.c_ulong),
           ('serial',C.c_ulong),('error_code',C.c_ubyte),('request_code',C.c_ubyte),
           ('minor_code',C.c_ubyte)]

@C.CFUNCTYPE(C.c_int,C.c_void_p,C.POINTER(XErrorEvent))
def handle_x_error(_display,error):
 info=error.contents
 # A window can disappear between enumerating clients and reading its metadata.
 if info.error_code!=3:
  print(f'X11 error {info.error_code}, request {info.request_code}',file=sys.stderr)
 return 0

xlib.XSetErrorHandler.argtypes=[type(handle_x_error)]
xlib.XSetErrorHandler(handle_x_error)

def prop(win,name):
 actual=C.c_ulong();fmt=C.c_int();n=C.c_ulong();remaining=C.c_ulong();ptr=C.POINTER(C.c_ubyte)()
 xlib.XGetWindowProperty(display,win,xlib.XInternAtom(display,name.encode(),0),0,4096,0,0,C.byref(actual),C.byref(fmt),C.byref(n),C.byref(remaining),C.byref(ptr))
 if not ptr:return [] if fmt.value==32 else ''
 try:
  if fmt.value==32:return list(C.cast(ptr,C.POINTER(C.c_ulong))[:n.value])
  return C.string_at(ptr,n.value).decode('utf-8',errors='replace')
 finally:xlib.XFree(ptr)
def windows():
 ids=prop(root,'_NET_CLIENT_LIST') or [];active=prop(root,'_NET_ACTIVE_WINDOW') or []
 return [{'id':str(w),'title':prop(w,'_NET_WM_NAME') or '(无标题)','active':w in active} for w in ids][:80]
xtst.XTestFakeKeyEvent.argtypes=[C.c_void_p,C.c_uint,C.c_int,C.c_ulong];xtst.XTestFakeButtonEvent.argtypes=[C.c_void_p,C.c_uint,C.c_int,C.c_ulong];xtst.XTestFakeMotionEvent.argtypes=[C.c_void_p,C.c_int,C.c_int,C.c_int,C.c_ulong]
xlib.XStringToKeysym.argtypes=[C.c_char_p];xlib.XStringToKeysym.restype=C.c_ulong;xlib.XKeysymToKeycode.argtypes=[C.c_void_p,C.c_ulong];xlib.XKeysymToKeycode.restype=C.c_uint
KEYS={'ctrl':'Control_L','alt':'Alt_L','shift':'Shift_L','super':'Super_L','enter':'Return','escape':'Escape','tab':'Tab','backspace':'BackSpace','delete':'Delete','left':'Left','right':'Right','up':'Up','down':'Down','home':'Home','end':'End','space':'space'}
def press(combo):
 parts=combo.lower().split('+')
 if len(parts)>4:raise ValueError('快捷键过长')
 codes=[]
 for part in parts:
  name=KEYS.get(part) or (part if re.fullmatch('[a-z0-9]|f(?:[1-9]|1[0-2])',part) else None)
  if not name:raise ValueError('不支持的按键')
  if re.fullmatch('f[0-9]+',name):name=name.upper()
  code=xlib.XKeysymToKeycode(display,xlib.XStringToKeysym(name.encode()))
  if not code:raise ValueError('无法映射按键')
  codes.append(code)
 for code in codes:xtst.XTestFakeKeyEvent(display,code,1,0)
 for code in reversed(codes):xtst.XTestFakeKeyEvent(display,code,0,0)
 xlib.XFlush(display)
DOCUMENTS = {'.md', '.txt', '.pdf', '.docx', '.odt', '.rtf', '.csv', '.xlsx', '.pptx'}
SKIP_DIRS = {'node_modules', '__pycache__', 'venv', 'models', 'runtime', 'vendor', 'go'}
TEXT_DOCUMENTS = {'.md', '.txt', '.csv'}

def document_text(path, deadline):
 if path.suffix.lower() in TEXT_DOCUMENTS:
  with path.open('rb') as stream:
   return stream.read(96_000).decode('utf-8', errors='replace')
 if path.suffix.lower() in {'.docx', '.odt'}:
  import zipfile
  import xml.etree.ElementTree as ET
  member='word/document.xml' if path.suffix.lower()=='.docx' else 'content.xml'
  with zipfile.ZipFile(path) as archive, archive.open(member) as stream:
   xml=stream.read(300_001)
   if len(xml)>300_000 or b'<!DOCTYPE' in xml.upper():return ''
   return ' '.join(ET.fromstring(xml).itertext())
 if path.suffix.lower()=='.pdf' and path.stat().st_size<16_000_000:
  return run(['/usr/bin/pdftotext','-f','1','-l','3',str(path),'-'],
             timeout=min(1.5,max(.1,deadline-time.monotonic())))[:96_000]
 return ''

def find_documents(query, days):
 query=str(query).strip().casefold()
 if not 1<=len(query)<=100 or type(days)!=int or not 0<=days<=365:
  raise ValueError('关键词须为1–100字符，天数须为0–365')
 terms=query.split()
 def includes(text):
  folded=text.casefold()
  return all(term in folded for term in terms)
 cutoff=time.time()-days*86400 if days else 0
 deadline=time.monotonic()+5
 candidates=[];seen=set();truncated=False
 # Search likely personal-document locations first.
 for root in sorted(ROOTS,key=lambda path:['Documents','Desktop','Downloads','Pictures','projects'].index(path.name)):
  count=0
  for parent,dirs,files in os.walk(root,followlinks=False):
   dirs[:]=sorted(d for d in dirs if not d.startswith('.') and d not in SKIP_DIRS)
   count+=len(dirs)+len(files)
   if count>14000 or time.monotonic()>deadline-1:
    truncated=True;break
   for name in files:
    candidate=pathlib.Path(parent)/name
    if candidate.suffix.lower() not in DOCUMENTS:continue
    try:
     path=safe_path(str(candidate))
     if path in seen or not path.is_file():continue
     modified=path.stat().st_mtime
    except (OSError,ValueError):continue
    seen.add(path)
    if modified>=cutoff:candidates.append((includes(name),modified,path))
 matches=[];body_checks=0
 for title_match,modified,path in sorted(candidates,reverse=True):
  if len(matches)>=10:truncated=True;break
  if not title_match:
   if body_checks>=160 or time.monotonic()>deadline:
    truncated=True;break
   body_checks+=1
   try:
    if not includes(document_text(path,deadline)):continue
   except Exception:continue
  matches.append({'name':path.name,'path':str(path),'match':'title' if title_match else 'content',
                  'modified':datetime.datetime.fromtimestamp(modified).astimezone().isoformat(timespec='minutes')})
 return {'matches':matches,'truncated':truncated,'days':days}

def collect_documents(query, days):
 search=find_documents(query,days)
 entries=[]
 deadline=time.monotonic()+5
 for match in search['matches'][:4]:
  path=safe_path(match['path'])
  try:
   text=document_text(path,deadline)
  except (OSError,ValueError,subprocess.SubprocessError):
   text=''
  entries.append({**match,'text':text[:8000], 'readable':bool(text.strip()),
                  'partial':path.suffix.lower()=='.pdf' or len(text)>8000})
 return {'sources':entries,'limited':search['truncated'] or len(search['matches'])>len(entries),
         'untrusted_file_content':True}

def describe_screen(question):
 from PIL import ImageGrab
 if not isinstance(question,str) or not 1<=len(question.strip())<=400:
  raise ValueError('画面问题须为 1–400 字')
 image=ImageGrab.grab(xdisplay=ENV['DISPLAY']).convert('RGB')
 image.thumbnail((1600,1200))
 stream=io.BytesIO()
 image.save(stream,format='JPEG',quality=87)
 request=urllib.request.Request('http://127.0.0.1:18682/api/describe',
  data=json.dumps({'question':question,'image':base64.b64encode(stream.getvalue()).decode('ascii')}).encode(),
  headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=14) as response:
   result=json.load(response)
 except urllib.error.HTTPError as exc:
  raise ValueError('本地读屏暂不可用，请稍后重试。') from exc
 active=next((window for window in windows() if window['active']),None)
 return {'description':result['text'],'active_window':active,'untrusted_screen_content':True}

IMAGE_EXTENSIONS = {'.jpg','.jpeg','.png','.gif','.webp','.bmp','.tif','.tiff','.heic','.heif','.avif','.svg','.ico'}

def create_folder(path):
 target=safe_path(path)
 if not target.parent.is_dir():raise ValueError('上级目录不存在，请先创建上级目录')
 try:target.mkdir()
 except FileExistsError as exc:raise ValueError('目标位置已存在同名文件或文件夹') from exc
 return {'created':str(target)}

def recent_files():
 cutoff=time.time()-7*86400
 matches={}
 deadline=time.monotonic()+4
 truncated=False
 for root in ROOTS:
  count=0
  for parent,dirs,files in os.walk(root,followlinks=False):
   dirs[:]=sorted(d for d in dirs if not d.startswith('.') and d not in SKIP_DIRS)
   count+=len(dirs)+len(files)
   if count>14000 or time.monotonic()>deadline:
    truncated=True;break
   for name in files:
    candidate=pathlib.Path(parent)/name
    if candidate.suffix.lower() not in DOCUMENTS | IMAGE_EXTENSIONS:continue
    try:
     if candidate.is_symlink():continue
     path=safe_path(str(candidate))
     if not path.is_file():continue
     modified=path.stat().st_mtime
     if modified>=cutoff:matches[path]=modified
    except (OSError,ValueError):continue
 entries=[{'name':path.name,'path':str(path),
           'modified':datetime.datetime.fromtimestamp(modified).astimezone().isoformat(timespec='minutes')}
          for path,modified in sorted(matches.items(),key=lambda entry:(-entry[1],str(entry[0])))[:8]]
 return {'files':entries,'truncated':truncated}

def image_source(source):
 original=pathlib.Path(os.path.expanduser(source))
 if original.is_symlink():raise ValueError('请选择图片文件本身')
 image=safe_path(source)
 if not image.is_file() or image.suffix.lower() not in IMAGE_EXTENSIONS:raise ValueError('来源必须是已有的图片文件')
 return image

def move_plan(args):
 folder=safe_path(args['destination'])
 if not folder.is_dir():raise ValueError('目标文件夹不存在')
 if ('source_folder' in args)==('sources' in args):raise ValueError('请选择一个来源目录或明确列出来源图片')
 if 'source_folder' in args:
  source_folder=safe_path(args['source_folder'])
  if not source_folder.is_dir():raise ValueError('来源目录不存在')
  if source_folder==folder:raise ValueError('来源和目标文件夹相同')
  sources=[]
  for entry in source_folder.iterdir():
   if not entry.name.startswith('.') and not entry.is_symlink() and entry.suffix.lower() in IMAGE_EXTENSIONS and entry.is_file():
    sources.append(str(entry))
    if len(sources)>20:raise ValueError('目录中超过20张图片，请明确选择至多20张')
  sources.sort()
 else:sources=args['sources']
 if not isinstance(sources,list) or not 1<=len(sources)<=20:raise ValueError('每批须包含1–20张图片')
 entries=[]
 used=set()
 folder_stat=folder.stat()
 for source in sources:
  image=image_source(source)
  target=folder/image.name
  if image==target:raise ValueError(f'图片已在目标文件夹中：{image.name}')
  if target in used or target.is_symlink() or target.exists():
   raise ValueError(f'目标位置存在同名文件或批次内名称重复：{image.name}')
  safe_path(str(target))
  stat=image.stat()
  if stat.st_dev!=folder_stat.st_dev:raise ValueError('来源和目标位于不同文件系统，未移动图片')
  used.add(target)
  entries.append({'source':str(image),'target':str(target),
                  'identity':[stat.st_dev,stat.st_ino,stat.st_size,stat.st_mtime_ns]})
 return {'files':entries,'directory_identity':[folder_stat.st_dev,folder_stat.st_ino]}

def rename_without_replace(source,target):
 rename=C.CDLL(None,use_errno=True).renameat2
 rename.argtypes=[C.c_int,C.c_char_p,C.c_int,C.c_char_p,C.c_uint]
 rename.restype=C.c_int
 if rename(-100,os.fsencode(source),-100,os.fsencode(target),1):
  error=C.get_errno()
  if error==errno.EEXIST:raise ValueError('目标位置已存在同名文件，原图片已保留')
  if error==errno.EXDEV:raise ValueError('来源和目标位于不同文件系统，未移动图片')
  raise OSError(error,os.strerror(error))

def move_images(args, expected):
 plan=move_plan(args)
 if expected!=plan:raise ValueError('确认后文件或目录发生变化，请重新生成计划')
 moved=[]
 try:
  for entry in plan['files']:
   current=pathlib.Path(entry['source']).lstat()
   if [current.st_dev,current.st_ino,current.st_size,current.st_mtime_ns]!=entry['identity']:
    raise ValueError('图片在执行期间发生变化')
   rename_without_replace(entry['source'],entry['target'])
   moved.append(entry)
 except (OSError,ValueError) as error:
  remaining=[]
  for entry in reversed(moved):
   try:
    destination=pathlib.Path(entry['target'])
    current=destination.lstat()
    if [current.st_dev,current.st_ino]!=entry['identity'][:2]:
     raise ValueError('目标文件已发生变化')
    rename_without_replace(entry['target'],entry['source'])
   except (OSError,ValueError):remaining.append(entry['target'])
  if remaining:raise ValueError(f'批量移动中断，以下文件未能恢复：{", ".join(remaining)}') from error
  raise ValueError(f'批量移动已停止，已完成的移动已撤回。{error}') from error
 return {'moved':[{'moved_from':entry['source'],'moved_to':entry['target']} for entry in moved]}

def move_image(source,destination):
 args={'sources':[source],'destination':destination}
 plan=move_plan(args)
 return move_images(args,plan)['moved'][0]

def close_window_target(window_id):
 target=next((window for window in windows() if window['id']==str(window_id)),None)
 if not target or target['title'] in {'小狮子桌宠','小狮子桌面助手'}:
  raise ValueError('请选择一个仍然存在的应用窗口')
 wid=int(target['id'])
 return {'window':target,'identity':[target['id'],target['title'],prop(wid,'WM_CLASS'),prop(wid,'_NET_WM_PID')]}

class ClientMessage(C.Structure):
 _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',C.c_void_p),
           ('window',C.c_ulong),('message_type',C.c_ulong),('format',C.c_int),('data',C.c_long*5)]

class XEvent(C.Union):
 _fields_=[('message',ClientMessage),('padding',C.c_long*24)]

def close_window(window_id,expected):
 target=close_window_target(window_id)
 if target['identity']!=expected:raise ValueError('窗口已变化，请重新确认')
 event=XEvent()
 message=event.message
 message.type=33 # X11 ClientMessage
 message.display=display
 message.window=int(window_id)
 message.message_type=xlib.XInternAtom(display,b'_NET_CLOSE_WINDOW',0)
 message.format=32
 message.data[1]=2 # Pager or desktop utility request
 xlib.XSendEvent.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.c_long,C.POINTER(XEvent)]
 if not xlib.XSendEvent(display,root,0,(1<<19)|(1<<20),C.byref(event)):
  raise ValueError('系统未接收关闭请求')
 xlib.XFlush(display)
 for _ in range(12):
  if int(window_id) not in (prop(root,'_NET_CLIENT_LIST') or []):
   return {'closed':target['window']['title'],'window_id':window_id}
  time.sleep(.1)
 return {'requested_close':target['window']['title'],'window_id':window_id,
         'note':'窗口仍存在，可能在等待保存确认或正在关闭。'}

def execute(name,a):
 if name=='system_info':
  mem={k:int(v.split()[0]) for k,v in (line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())};disk=shutil.disk_usage(HOME)
  return {'hostname':os.uname().nodename,'cpu':next(l.split(':',1)[1].strip() for l in pathlib.Path('/proc/cpuinfo').read_text().splitlines() if l.startswith('model name')),'logical_cpus':os.cpu_count(),'memory_total_GiB':round(mem['MemTotal']/1048576,1),'memory_available_GiB':round(mem['MemAvailable']/1048576,1),'disk_free_GiB':round(disk.free/2**30,1),'gpu':run(['nvidia-smi','--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu','--format=csv,noheader']),'file_roots':[str(x) for x in ROOTS]}
 if name=='list_files':
  p=safe_path(a['path']);entries=[]
  for child in sorted(p.iterdir(),key=lambda x:(not x.is_dir(),x.name.lower())):
   try:safe_path(str(child))
   except ValueError:continue
   entries.append({'name':child.name,'path':str(child),'directory':child.is_dir(),'bytes':child.stat().st_size if child.is_file() else None})
   if len(entries)>=100:break
  return {'path':str(p),'entries':entries}
 if name=='search_files':
  p=safe_path(a['path']);q=str(a['query']).lower();results=[];count=0;start=time.monotonic();truncated=False
  if not q or len(q)>100:raise ValueError('搜索词须为1–100字符')
  for parent,dirs,files in os.walk(p,followlinks=False):
   dirs[:]=[d for d in dirs if not d.startswith('.') and d not in ['node_modules','__pycache__','venv','models','go','.bench-venv']]
   for item in dirs+files:
    count+=1
    if count>12000 or time.monotonic()-start>4:truncated=True;break
    if q in item.lower():
     try:found=safe_path(str(pathlib.Path(parent)/item))
     except ValueError:continue
     results.append({'name':item,'path':str(found),'directory':found.is_dir()})
    if len(results)>=50:truncated=True;break
   if truncated:break
  return {'matches':results,'truncated':truncated,'searched_entries':count}
 if name=='plan_close_window':return close_window_target(a['window_id'])
 if name=='close_window':return close_window(a['window_id'],a['expected'])
 if name=='recent_files':return recent_files()
 if name=='plan_move_images':return move_plan(a)
 if name=='move_images':
  expected=a.pop('expected')
  return move_images(a,expected)
 if name=='create_folder':return create_folder(a['path'])
 if name=='move_image':return move_image(a['source'],a['destination'])
 if name=='describe_screen':return describe_screen(a['question'])
 if name=='collect_documents':return collect_documents(a['query'],a.get('days',0))
 if name=='find_documents':return find_documents(a['query'],a.get('days',0))
 if name=='read_text':
  p=safe_path(a['path'])
  if p.is_file() and p.suffix.lower() in {'.docx','.odt','.pdf'}:
   text=document_text(p,time.monotonic()+3)
   if not text.strip():raise ValueError('未能提取正文，可能是扫描版或格式不受支持')
   return {'path':str(p),'text':text[:24000],'truncated':len(text)>24000 or p.suffix.lower()=='.pdf','untrusted_file_content':True}
  if not p.is_file() or p.stat().st_size>1024*1024:raise ValueError('仅读取1MiB以内的文本文件')
  with p.open('rb') as f:raw=f.read(24000)
  if b'\x00' in raw:raise ValueError('不是文本文件')
  return {'path':str(p),'text':raw.decode('utf-8',errors='replace'),'truncated':p.stat().st_size>len(raw),'untrusted_file_content':True}
 if name=='list_apps':return {'apps':[{'id':k,'desktop_id':v} for k,v in APPS.items()]}
 if name=='open_app':
  key=a['app'].strip()
  if key.casefold() in {'chrome','google','google chrome','google browser','google浏览器','谷歌','谷歌浏览器','chrome浏览器','浏览器'}:
   key='browser'
  if key in APPS.values():key=next(k for k,v in APPS.items() if v==key)
  if key not in APPS:raise ValueError('支持的应用ID：'+', '.join(APPS))
  desktop=pathlib.Path('/usr/share/applications')/APPS[key]
  if not desktop.exists():raise ValueError('应用未安装')
  launch(['/usr/bin/gio','launch',str(desktop)])
  if key=='browser':
   for _ in range(30):
    for window in windows():
     if 'google-chrome' in str(prop(int(window['id']),'WM_CLASS')).casefold():
      return {'requested':key,'status':'Chrome 窗口已打开','window':window}
    time.sleep(.1)
  return {'requested':key,'status':'启动请求已提交；尚未核对到窗口'}
 if name=='open_url':
  u=urlparse(a['url'])
  if u.scheme not in ['http','https'] or not u.hostname or u.username or u.password:raise ValueError('仅允许无内嵌凭证的HTTP(S)网址')
  launch(['/usr/bin/gio','open',a['url']]);return {'opened_url':a['url']}
 if name=='open_path':
  p=safe_path(a['path'])
  if not p.exists():raise ValueError('路径不存在')
  if p.is_file() and p.suffix.lower() not in DOCUMENTS | IMAGE_EXTENSIONS | {'.json'}:raise ValueError('不直接启动可执行文件或脚本')
  if p.is_file() and p.suffix.lower() in ['.txt','.md','.json','.csv']:
   launch(['/usr/bin/gio','launch',str(pathlib.Path('/usr/share/applications')/APPS['editor']),str(p)])
  else:launch(['/usr/bin/gio','open',str(p)])
  return {'opened':str(p),'application':'text_editor' if p.is_file() and p.suffix.lower() in ['.txt','.md','.json','.csv'] else 'default'}
 if name=='write_note':
  title=str(a['title']).strip()
  if not 1<=len(title)<=80 or any(c in title for c in '/\\\x00') or title.startswith('.'):raise ValueError('无效笔记标题')
  text=str(a['text'])
  if len(text)>12000:raise ValueError('笔记过长')
  NOTES.mkdir(parents=True,exist_ok=True);p=NOTES/(title+'.md')
  if p.exists():p=NOTES/(title+'-'+uuid.uuid4().hex[:6]+'.md')
  with p.open('x') as f:f.write(text)
  return {'created':str(p),'bytes':p.stat().st_size}
 if name=='list_windows':return {'windows':windows()}
 if name=='inspect_ui':return json.loads(run(['/usr/bin/python3',str(ROOT/'ui_tree.py'),a.get('app_name','')],timeout=8))
 if name=='focus_window':
  wid=str(a['window_id'])
  if wid not in [x['id'] for x in windows()]:raise ValueError('窗口不存在，请刷新窗口列表')
  xlib.XRaiseWindow.argtypes=[C.c_void_p,C.c_ulong];xlib.XSetInputFocus.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.c_ulong]
  xlib.XRaiseWindow(display,int(wid));xlib.XSetInputFocus(display,int(wid),1,0);xlib.XFlush(display);return {'focused':wid}
 if name=='screenshot':
  from PIL import ImageGrab
  im=ImageGrab.grab(xdisplay=ENV['DISPLAY']);size=im.size;im.thumbnail((1600,1000));id=uuid.uuid4().hex;im.save(IMAGES/(id+'.png'))
  for old in sorted(IMAGES.glob('*.png'),key=lambda p:p.stat().st_mtime)[:-12]:old.unlink()
  return {'image_id':id,'screen_width':size[0],'screen_height':size[1],'preview_width':im.width,'preview_height':im.height,'note':'截图供用户查看。本模型纯文本，无法识别图像。'}
 if name=='press_key':press(a['keys']);return {'pressed':a['keys']}
 if name=='type_text':
  text=str(a['text'])
  if len(text)>4000:raise ValueError('输入过长')
  # GTK owns the clipboard while paste is being delivered; restore previous text afterwards.
  helper='''import gi,sys,time\ngi.require_version("Gtk","3.0")\nfrom gi.repository import Gtk,Gdk,GLib\nc=Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);old=c.wait_for_text();c.set_text(sys.stdin.read(),-1)\nloop=GLib.MainLoop()\ndef done():\n if old is not None:c.set_text(old,-1);c.store()\n loop.quit();return False\nGLib.timeout_add(2000,done);print("ready",flush=True);loop.run()'''
  process=subprocess.Popen(['/usr/bin/python3','-c',helper],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
  process.stdin.write(text);process.stdin.close();ready=process.stdout.readline()
  if 'ready' not in ready:raise ValueError('无法设置桌面剪贴板')
  time.sleep(.15);press('ctrl+v');process.wait(timeout=5)
  return {'typed_characters':len(text),'note':'粘贴到当前焦点窗口，先前文本剪贴板已尝试恢复。'}
 if name=='click':
  x,y=int(a['x']),int(a['y'])
  from PIL import ImageGrab
  w,h=ImageGrab.grab(xdisplay=ENV['DISPLAY']).size
  if not (0<=x<w and 0<=y<h):raise ValueError('坐标超出屏幕范围')
  button={'left':1,'middle':2,'right':3}.get(a.get('button','left'))
  if not button:raise ValueError('无效鼠标键')
  xtst.XTestFakeMotionEvent(display,-1,x,y,0);xtst.XTestFakeButtonEvent(display,button,1,0);xtst.XTestFakeButtonEvent(display,button,0,0);xlib.XFlush(display);return {'clicked':[x,y],'button':a.get('button','left')}
 raise ValueError('未知工具')
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  try:
   n=int(self.headers.get('Content-Length','0'))
   if n>64000:raise ValueError('请求过大')
   data=json.loads(self.rfile.read(n));result=execute(data['name'],data.get('arguments',{}));self.send(200,{'ok':True,'result':result})
  except Exception as e:self.send(400,{'ok':False,'error':str(e)[:700]})
 def do_GET(self):
  id=self.path.removeprefix('/image/')
  if self.path.startswith('/image/') and re.fullmatch('[0-9a-f]{32}',id) and (IMAGES/(id+'.png')).exists():
   b=(IMAGES/(id+'.png')).read_bytes();self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
  else:self.send(404,{'error':'not found'})
 def send(self,status,data):
  b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
class Server(socketserver.UnixStreamServer):allow_reuse_address=True
if __name__=='__main__':
 os.environ.update(ENV);sock=RUN/'desktop.sock';sock.unlink(missing_ok=True)
 with Server(str(sock),Handler) as server:os.chmod(sock,0o600);server.serve_forever()
