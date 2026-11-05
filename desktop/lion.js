import * as T from './node_modules/three/build/three.module.js';
import {applyDance} from './dances.mjs';

const scene = new T.Scene();
const camera = new T.OrthographicCamera(-1.65, 1.65, 2.003, -2.003, .1, 40);
camera.position.set(0, 2.35, 8);
camera.lookAt(0, 1.8, 0);
const renderer = new T.WebGLRenderer({alpha:true, antialias:true});
renderer.setPixelRatio(Math.max(1.5, Math.min(devicePixelRatio, 2)));
renderer.setSize(280, 340);
document.body.append(renderer.domElement);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
scene.add(new T.HemisphereLight(0xffe5cc, 0x75627a, 1.05));
for (const [color, intensity, position] of [[0xffe8cd, 2.6, [-3,6,5]], [0xffb170, 3.1, [3,4,-4]]]) {
  const light = new T.DirectionalLight(color, intensity);
  light.position.set(...position);
  scene.add(light);
}

const lion = new T.Group();
scene.add(lion);
const ball = new T.SphereGeometry(1, 24, 16);
const materials = new Map();
function fur(color) {
  if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({color, roughness:.86}));
  return materials.get(color);
}
function oval(parent, color, x,y,z, sx,sy,sz, tilt=0) {
  const mesh = new T.Mesh(ball, fur(color));
  mesh.position.set(x,y,z);
  mesh.scale.set(sx,sy,sz);
  mesh.rotation.z = tilt;
  parent.add(mesh);
  return mesh;
}
let seed = 7231;
function random() {
  seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
  return seed / 4294967296;
}

const coats = new Map();
function groom(mesh, count, length, sweep, rootColor, tipColor, mask) {
  const parent = mesh.parent;
  if (!coats.has(parent)) coats.set(parent, {positions: [], colors: []});
  const {positions, colors} = coats.get(parent);
  const rootTint = new T.Color(rootColor), tipTint = new T.Color(tipColor);
  const lightDirection = new T.Vector3(-.46,.69,.55);
  const normal = new T.Vector3(), root = new T.Vector3(), point = new T.Vector3();
  const direction = new T.Vector3(), bend = new T.Vector3(), tint = new T.Color();
  mesh.updateMatrix();
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1, azimuth = random() * 2 * Math.PI;
    const radius = Math.sqrt(1 - y*y);
    normal.set(radius*Math.cos(azimuth), y, radius*Math.sin(azimuth));
    root.copy(normal).applyMatrix4(mesh.matrix);
    if (mask && mask(root)) continue;
    normal.divide(mesh.scale).applyEuler(mesh.rotation).normalize();
    direction.copy(sweep).addScaledVector(normal, -sweep.dot(normal)).normalize();
    bend.crossVectors(normal, direction);
    const flow = Math.sin(root.x*24 + root.y*16 + root.z*9);
    const size = length * (.81 + .14*flow + random()*.25);
    const lift = .12 + random()*.12;
    const key = Math.max(0, normal.dot(lightDirection));
    const sheen = Math.pow(Math.abs(direction.dot(lightDirection)), 3);
    const shade = (.33 + key*.54 + sheen*.11) * (.84 + flow*.09 + random()*.19);
    for (let segment = 0; segment < 3; segment++) {
      for (const step of [segment, segment + 1]) {
        const t = step / 3;
        point.copy(root).addScaledVector(direction, size*t)
          .addScaledVector(bend, size*t*t*(.23 + .18*flow))
          .addScaledVector(normal, .003 + size*(lift*t + .09*Math.sin(Math.PI*t)));
        positions.push(point.x, point.y, point.z);
        tint.copy(rootTint).lerp(tipTint, t*.70).multiplyScalar(shade);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
  }
}

function coat(parent, color, x,y,z, sx,sy,sz, count,length,sweep,tip,tilt=0,mask) {
  const mesh = oval(parent,color,x,y,z,sx,sy,sz,tilt);
  groom(mesh,count,length,new T.Vector3(...sweep),color,tip,mask);
  return mesh;
}

function strand(parent, color, points, radius) {
  const path = new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point)));
  parent.add(new T.Mesh(new T.TubeGeometry(path, 20, radius, 6), fur(color)));
}
const gold = 0x995423, tan = 0xd5a16a, dark = 0x241919;
coat(lion,gold,0,.93,0,.65,.88,.53,7500,.047,[0,-1,.1],0xb87947);
coat(lion,0xab6e3b,0,.84,.32,.46,.67,.25,5700,.059,[0,-1,0],0xcb955e);
const arms = [], feet = [];
for (const side of [-1,1]) {
  const arm = new T.Group();
  arm.position.set(side*.55,1.27,.23);
  lion.add(arm);
  coat(arm,gold,0,-.38,0,.19,.50,.22,1800,.055,[0,-1,.1],0xb67b49,-side*.17);
  arms.push(arm);
  const foot = new T.Group();
  foot.position.set(side*.41,.22,.26);
  lion.add(foot);
  coat(foot,gold,0,0,0,.31,.21,.37,1800,.043,[0,0,1],0xb68055);
  for (let i=-1;i<=1;i++) oval(foot,0x513325,i*.126,-.07,.339,.024,.039,.026);
  feet.push(foot);
}
const tail = new T.Group();
tail.position.set(-.36,.36,-.26);
lion.add(tail);
strand(tail,0x8c4c29,[[0,0,0],[-.42,-.17,0],[-.81,-.12,.03],[-1.01,.12,.10],[-.98,.39,.17]],.046);
coat(tail,0x4a271a,-.94,.45,.18,.086,.135,.079,2100,.18,[.4,1,.1],0x9d603c,-.45);

const head = new T.Group();
head.position.set(0,2.16,0);
lion.add(head);
coat(head,0x4b2517,0,-.04,-.12,.93,.91,.58,6800,.25,[0,-1,0],0x995933);
const shades = [0x5b301e,0x67361f,0x793f26,0x4e281a,0x884c2d];
for (let layer=0;layer<2;layer++) {
  const count = layer ? 14 : 21;
  for (let i=0;i<count;i++) {
    const angle = (i + layer*.48)*2*Math.PI/count;
    const dx = Math.sin(angle), dy = Math.cos(angle);
    const radius = layer ? .66 : .78;
    coat(head,shades[(i*7+layer)%5],dx*radius,dy*radius-.07,
      layer ? .25 : -.04,.105+random()*.03,.20+random()*.1,.125,
      layer ? 630 : 800,.17+random()*.12,[dx+.26,dy-.34,.12],0xb17b51,-angle-.4);
  }
}
const ears = [];
for (const side of [-1,1]) {
  const ear = new T.Group();
  ear.position.set(side*.67,.65,.34);
  head.add(ear);
  ears.push(ear);
  coat(ear,gold,0,0,0,.214,.225,.13,1900,.058,[side,.25,.16],0xd39758,-side*.24);
  coat(ear,0x44281f,side*.02,0,.106,.128,.141,.045,680,.035,[0,1,.1],0x79503b,-side*.24);
}
coat(head,gold,0,.05,.36,.71,.68,.44,10000,.033,[0,-1,.1],0xc58950,0,
  p => p.z > .67 && Math.abs(Math.abs(p.x)-.23) < .21 && p.y > .01 && p.y < .27);
for (let i=-3;i<=3;i++) {
  coat(head,shades[(i+3)%5],i*.119,.66+.12-Math.abs(i)*.036,.43,
    .093,.192,.12,900,.24,[.5,1,.22],0xab7048,-.46+i*.09);
}
const eyes = new T.Group();
eyes.position.set(0,.131,.814);
head.add(eyes);
const brows = [], pupils = [];
for (const s of [-1,1]) {
  oval(eyes,dark,s*.23,0,0,.179,.09,.045);
  oval(eyes,0xebd5b5,s*.23,-.008,.034,.152,.066,.025);
  const gaze = new T.Group();
  gaze.position.set(s*.23,-.005,.059);
  eyes.add(gaze);
  oval(gaze,0xa46527,0,0,0,.052,.059,.023);
  oval(gaze,0x170e0c,0,0,.019,.031,.044,.014);
  oval(gaze,0xffe9d6,-.014,.025,.032,.010,.011,.006);
  pupils.push(gaze);
  const brow = new T.Group();
  brow.position.set(s*.23,.204,.802);
  head.add(brow);
  coat(brow,0x905126,0,0,0,.207,.074,.074,1100,.059,[s,.27,.09],0xbd8650);
  brows.push(brow);
}
coat(head,0xbc8450,0,-.41,.59,.37,.255,.29,3800,.096,[0,-1,.17],0xe1b888);
for (const s of [-1,1]) {
  coat(head,tan,s*.192,-.219,.71,.29,.205,.26,3700,.056,[s*.48,-1,.13],0xe9c399,s*.14);
  for (let i=0;i<3;i++) {
    oval(head,0xa36b41,s*(.3+i*.044),-.19-i*.035,.929,.018,.016,.012);
    strand(head,0xffdcaa,[[s*.34,-.24-i*.028,.92],[s*.59,-.22-i*.08,.88],[s*(.81+i*.018),-.19-i*.15,.77]],.006);
  }
}
const nose = oval(head,dark,0,-.101,.95,.181,.105,.105);
nose.material = new T.MeshStandardMaterial({color:0x2f2426, roughness:.36});
for (const side of [-1,1]) {
  oval(head,0x1a1213,side*.094,-.101,1.025,.047,.025,.018,side*.27);
  strand(head,0x63412d,[[0,-.17,1.011],[side*.021,-.29,.964],[side*.135,-.365,.934],[side*.232,-.353,.895]],.011);
}
for (const [parent, {positions, colors}] of coats) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3));
  const fibers = new T.LineSegments(geometry,new T.LineBasicMaterial({vertexColors:true}));
  fibers.raycast = () => {};
  parent.add(fibers);
}

const ray = new T.Raycaster(), pointer = new T.Vector2();
const canvas = renderer.domElement, bubble = document.querySelector('#bubble');
let lookX = 0, lookY = 0, nearby = false, hovering = false;
let press, bubbleTimer, lastTap, holdTimer;
let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0;
let reaction = {time: -Infinity, strength: 0, side: 0, lift: 0};

let dance;
const dancePose = {lion,head,tail,arms,feet};
window.buddy.onDance(selection => {
  const now = performance.now()/1000;
  if (selection) {
    dance = {...selection, start:now, stop:now+selection.duration};
    clearTimeout(bubbleTimer);
    bubble.textContent = '♪ ' + selection.label;
    bubble.hidden = false;
    bubbleTimer = setTimeout(() => {bubble.hidden = true;},1700);
  } else if (dance) {
    dance.stop = Math.min(dance.stop,now+.28);
  }
});

const voiceStatus = document.querySelector('#voice-status');
const voiceReply = document.querySelector('#voice-reply');
let voiceTimer, voiceUrl;

window.buddy.onVoice(({phase,value}) => {
  clearTimeout(voiceTimer);
  if (phase === 'starting') {
    voiceReply.pause();
    bubble.hidden = true;
  }
  voiceStatus.dataset.phase = phase;
  voiceStatus.hidden = false;
  const labels = {
    starting:'🎙 正在连接麦克风…', recording:'🎙 正在录音', listening:'🎙 仍在听 · 说完自动发送',
    transcribing:'正在识别语音…', thinking:'正在处理…', speaking:'正在生成语音…'
  };
  if (phase === 'done') {
    const {reply,hasPending,audio} = value;
    voiceStatus.textContent = hasPending ? '有操作待确认 · 双击查看' : reply.slice(0,90);
    if (audio) {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      const bytes = Uint8Array.from(atob(audio),char => char.charCodeAt(0));
      voiceUrl = URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
      voiceReply.src = voiceUrl;
      void voiceReply.play().catch(() => {});
    }
  } else {
    voiceStatus.textContent = labels[phase] ?? value;
  }
  if (phase === 'done' || phase === 'error') {
    voiceTimer = setTimeout(() => {voiceStatus.hidden = true;},4800);
  }
});

function setHover(value) {
  if (hovering !== value) window.buddy.hit(value);
  hovering = value;
  canvas.style.cursor = value ? 'grab' : '';
}

function hit(event) {
  pointer.set(event.clientX / 140 - 1, 1 - event.clientY / 170);
  ray.setFromCamera(pointer,camera);
  const surface = ray.intersectObject(lion,true)[0];
  if (surface) return surface;
  if (Math.hypot((event.clientX-140)/68,(event.clientY-165)/106) < 1) {
    return {point:ray.ray.at(8,new T.Vector3())};
  }
}

function react(event, gesture) {
  const now = performance.now();
  const rapid = lastTap && now-lastTap.time < 350
    && Math.hypot(event.screenX-lastTap.x,event.screenY-lastTap.y) < 26;
  const heavy = Boolean(rapid);
  lastTap = heavy ? null : {time:now,x:event.screenX,y:event.screenY};
  const {x,y,z} = gesture.point;
  reaction = {time:now/1000, strength:heavy ? 1 : .46, side:Math.sign(x), lift:y > 2.16 ? 1 : -1};
  bubble.textContent = heavy ? '嗷呜！' : z < -.22 ? '谁在后面？' :
    y > 2.16 ? '摸头？' : y < .63 ? '爪子痒！' : x < -.30 ? '左边？' : x > .30 ? '右边？' : '哼？';
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 1300);
  return heavy;
}

let held = 0;
window.buddy.track((x, y, screenX, screenY, mask, overWindow) => {
  nearby = x > -140 && x < 420 && y > -120 && y < 460;
  lookX = T.MathUtils.clamp((x-140)/95,-1,1);
  lookY = T.MathUtils.clamp((150-y)/150,-1,1);
  const buttons = mask & (256 | 1024);
  const changed = held ^ buttons;
  held = buttons;
  const point = {clientX:x, clientY:y, screenX, screenY};
  if (press) {
    updateDrag(point);
    if (!(buttons & press.mask)) finishGesture(point);
    return;
  }
  const intersection = x >= 0 && x < 280 && y >= 0 && y < 340 && hit(point);
  setHover(Boolean(intersection));
  if (!intersection || !overWindow || !(changed & buttons)) return;
  const button = changed & buttons & 256 ? 0 : 2;
  press = {button, mask:button === 0 ? 256 : 1024,
    point:lion.worldToLocal(intersection.point), x, y, sx:screenX, sy:screenY,
    moved:false, yaw:targetYaw, pitch:targetPitch};
  if (button === 0) {
    const gesture = press;
    holdTimer = setTimeout(() => {
      if (press !== gesture || gesture.moved) return;
      gesture.recording = true;
      lastTap = null;
      window.buddy.holdVoice(true);
    },480);
  }
});
function updateDrag(event) {
  if (!press || press.recording) return;
  const dx = event.screenX-press.sx, dy = event.screenY-press.sy;
  press.moved ||= Math.hypot(dx,dy)>5;
  if (!press.moved) return;
  clearTimeout(holdTimer);
  if (press.button === 2) {
    targetYaw = press.yaw + dx*.021;
    targetPitch = T.MathUtils.clamp(press.pitch + dy*.012,-1.1,1.1);
  } else {
    window.buddy.drag(press.x, press.y);
  }
}
function finishGesture(event) {
  const gesture = press;
  press = null;
  clearTimeout(holdTimer);
  if (gesture.recording) {
    window.buddy.holdVoice(false);
  } else if (gesture.moved) {
    lastTap = null;
  } else if (gesture.button === 2) {
    window.buddy.menu();
  } else {
    if (react(event, gesture)) window.buddy.assistant();
  }
}
canvas.oncontextmenu = event => event.preventDefault();
renderer.setAnimationLoop(ms => {
  const t = ms/1000, elapsed = t-reaction.time;
  yaw += (targetYaw-yaw)*.24;
  pitch += (targetPitch-pitch)*.24;
  const horizontal = 8*Math.cos(pitch);
  camera.position.set(horizontal*Math.sin(yaw), 1.8 + 8*Math.sin(pitch+.068), horizontal*Math.cos(yaw));
  camera.lookAt(0,1.8,0);
  const bounce = elapsed >= 0 && elapsed < .72 ? Math.sin(Math.PI*elapsed/.72)*.36*reaction.strength : 0;
  lion.position.y = bounce;
  const recoil = elapsed >= 0 && elapsed < .35 ? Math.sin(elapsed*19)*Math.exp(-elapsed*8)*reaction.strength : 0;
  lion.scale.y = 1 + Math.sin(t*2.4)*.012 - Math.abs(recoil)*.13;
  lion.rotation.z = recoil*.21*reaction.side;
  lion.rotation.y = .13*Math.sin(t*.82) + (bounce ? .44*Math.sin(elapsed*8) : 0);
  head.rotation.z = Math.sin(t*1.35)*.035 - bounce*.45*reaction.side;
  tail.rotation.y = Math.sin(t*3)*.38;
  head.rotation.y += ((nearby ? lookX*.21 : Math.sin(t*.56)*.08) - head.rotation.y)*.10;
  head.rotation.x += (((nearby ? -lookY*.10 : Math.sin(t*.89)*.033) + recoil*.24*reaction.lift) - head.rotation.x)*.10;
  const surprise = elapsed >= 0 && elapsed < 1.1 ? Math.min(1, elapsed*18, (1.1-elapsed)*4)*reaction.strength : 0;
  const blink = Math.max(0,1-Math.abs((t%3.8)-3.48)/.16);
  const glance = Math.tanh(2.8*Math.sin(t*1.26));
  for (let i=0;i<brows.length;i++) {
    const side = i*2-1;
    const twitch = Math.pow(Math.max(0, Math.sin(t*1.1+i*.9)), 24);
    ears[i].rotation.z = side*(twitch*.12 - bounce*.25);
    brows[i].rotation.z = side*(.23 - surprise*.29) + Math.sin(t*1.6+i)*.04;
    brows[i].position.y = .218 + surprise*(i ? .123 : .092) + glance*side*.018;
    pupils[i].position.x += (side*.23 + (nearby ? lookX*.077 : glance*.048) - pupils[i].position.x)*.15;
    pupils[i].position.y += ((nearby ? lookY*.028 : -.006) - pupils[i].position.y)*.15;
  }
  eyes.scale.y = (.91 + surprise*.56) * (1 - .95*blink*(1-surprise));
  lion.position.x = 0;
  lion.rotation.x = 0;
  for (let i=0;i<2;i++) {
    arms[i].rotation.set(0,0,0);
    feet[i].rotation.set(0,0,0);
    feet[i].position.set((i*2-1)*.41,.22,.26);
  }
  if (dance && t >= dance.stop) dance = undefined;
  if (dance) {
    const weight = T.MathUtils.clamp(Math.min((t-dance.start)/.28,(dance.stop-t)/.28),0,1);
    applyDance(dance.id,t-dance.start,weight,dancePose);
  }
  renderer.render(scene,camera);
});
