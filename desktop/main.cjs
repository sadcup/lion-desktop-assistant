const path = require('node:path');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const capture = require('./audio-capture.cjs');
const {dispatch} = require('./assistant-client.cjs');
const {app, BrowserWindow, screen, ipcMain, Menu} = require('electron');

if (!app.requestSingleInstanceLock()) app.exit();

const dances = [
  {id:'subject3',label:'科目三',duration:14},
  {id:'fairy',label:'小仙摇',duration:13},
  {id:'crisp',label:'宠坏脆脆摇',duration:12}
];

app.whenReady().then(() => {
  let panel, heldVoice, holdState, revision = 0;
  let voiceAvailable = true, voicePlayback = true;

  function publishHold(phase, value) {
    holdState = {phase,value,revision:++revision};
    if (!buddy.isDestroyed()) {
      buddy.webContents.send('assistant:hold-state',{...holdState,
        value:phase === 'done' ? {reply:value.result.reply,hasPending:Boolean(value.result.pending?.length),audio:value.audio} : value});
    }
    if (panel && !panel.isDestroyed()) {
      panel.webContents.send('assistant:hold-state',{...holdState,
        value:phase === 'done' ? {text:value.text,result:value.result} : value});
    }
  }

  function cancelHold() {
    clearTimeout(heldVoice?.limit);
    clearTimeout(heldVoice?.silence);
    heldVoice = undefined;
    holdState = undefined;
    capture.cancel();
  }

  async function stopHeldVoice() {
    const attempt = heldVoice;
    if (!attempt || attempt.finishing) return;
    attempt.finishing = true;
    clearTimeout(attempt.limit);
    clearTimeout(attempt.silence);
    publishHold('transcribing');
    try {
      await attempt.started;
      if (heldVoice !== attempt) return;
      const {text} = await dispatch('transcribe',await capture.stop(true));
      if (heldVoice !== attempt) return;
      if (!text?.trim()) throw new Error('没听清，请再说一遍。');
      publishHold('thinking');
      const result = await submitChat(text.trim());
      let audio;
      if (voicePlayback && result.reply.trim()) {
        publishHold('speaking');
        try {
          ({audio} = await dispatch('speak',result.reply.slice(0,180)));
        } catch {
          // Keep the successful desktop result visible when audio fails.
        }
      }
      if (heldVoice === attempt) publishHold('done',{text:text.trim(),result,audio});
    } catch (error) {
      if (heldVoice === attempt) publishHold('error',error.message);
    } finally {
      if (heldVoice === attempt) heldVoice = undefined;
    }
  }

  function releaseHeldVoice() {
    const attempt = heldVoice;
    if (!attempt || attempt.releasedAt || attempt.finishing) return;
    attempt.releasedAt = Date.now();
    publishHold('listening');
    function waitForSilence() {
      if (heldVoice !== attempt || attempt.finishing) return;
      const lastSpeech = capture.lastSpeech();
      const quietSince = Math.max(attempt.releasedAt,lastSpeech);
      const quietRequired = lastSpeech ? 2400 : 5000;
      if (Date.now()-quietSince >= quietRequired) void stopHeldVoice();
      else attempt.silence = setTimeout(waitForSilence,120);
    }
    attempt.silence = setTimeout(waitForSilence,120);
  }

  function startHeldVoice() {
    if (heldVoice) return;
    if (!voiceAvailable) {
      if (!holdState || ['done','error'].includes(holdState.phase)) {
        publishHold('error','助手正在处理请求，或有操作待确认。');
      }
      return;
    }
    const attempt = {started:capture.start(30)};
    heldVoice = attempt;
    publishHold('starting');
    attempt.started.then(() => {
      if (heldVoice !== attempt || attempt.finishing) return;
      if (!attempt.releasedAt) publishHold('recording');
      attempt.limit = setTimeout(stopHeldVoice,29900);
    }, error => {
      if (heldVoice !== attempt || attempt.finishing) return;
      clearTimeout(attempt.silence);
      heldVoice = undefined;
      publishHold('error',error.message);
    });
  }

  function openPanel() {
    if (panel) {panel.show(); panel.focus(); return;}
    const bounds = buddy.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(420, area.width), height = Math.min(570, area.height);
    const left = bounds.x - width - 14;
    const x = Math.max(area.x, Math.min(left >= area.x ? left : bounds.x + bounds.width + 14, area.x + area.width - width));
    const y = Math.max(area.y, Math.min(bounds.y + bounds.height - height, area.y + area.height - height));
    panel = new BrowserWindow({
      x, y, width, height, minWidth:Math.min(340,width), minHeight:Math.min(390,height),
      title:'小狮子桌面助手', show:false, alwaysOnTop:true, backgroundColor:'#211814',
      webPreferences:{preload:path.join(__dirname,'panel-preload.cjs'), partition:'lion-assistant'}
    });
    panel.setMenu(null);
    const contents = panel.webContents;
    contents.session.setPermissionRequestHandler((_requester,_permission,done) => done(false));
    contents.setWindowOpenHandler(() => ({action:'deny'}));
    contents.on('will-navigate', event => event.preventDefault());
    panel.once('ready-to-show', () => panel?.show());
    panel.on('closed', () => {
      if (!heldVoice) capture.cancel();
      voiceAvailable = true;
      panel = undefined;
    });
    panel.loadFile('panel.html');
  }

  function submitChat(data) {
    if (typeof data === 'string') {
      const text = data.replace(/[\s，。！,!?？]/g,'');
      const command = text.match(/^(?:小狮子)?(?:请|帮我|给我)?(?:跳(?:一下|一段)?|来(?:一段|支))(科目[三3]|小仙摇|宠坏脆脆摇|舞)$/);
      const stop = /^(?:小狮子)?(?:请)?(?:停止跳舞|停舞|别跳了)$/.test(text);
      if (command || stop) {
        const selection = stop ? null : dances.find(dance => dance.label === command[1].replace('3','三')) ?? dances[0];
        buddy.webContents.send('dance',selection);
        return {reply:selection ? '开始跳「'+selection.label+'」。' : '已停止跳舞。',pending:[],events:[]};
      }
    }
    return dispatch('chat',data);
  }

  ipcMain.handle('assistant:request', async (event, action, data) => {
    if (!panel || event.sender !== panel.webContents || event.senderFrame !== panel.webContents.mainFrame) {
      throw new Error('来源无效。');
    }
    if (action === 'hold-state') return heldVoice ? holdState : undefined;
    if (action === 'voice-playback') {
      if (typeof data === 'boolean') voicePlayback = data;
      return voicePlayback;
    }
    if (heldVoice && action !== 'session') throw new Error('正在处理长按语音，请稍等。');
    if (action === 'chat') return submitChat(data);
    if (action === 'look') {
      const readingPanel = panel;
      readingPanel.hide();
      try {
        await new Promise(resolve => setTimeout(resolve,220));
        return await dispatch('chat','看看当前屏幕');
      } finally {
        if (!readingPanel.isDestroyed()) readingPanel.show();
      }
    }
    if (action === 'record-start') return capture.start();
    if (action === 'record-stop') return dispatch('transcribe',await capture.stop());
    return dispatch(action,data);
  });
  ipcMain.on('assistant:hold-voice', (event, pressed) => {
    if (event.sender !== buddy.webContents) return;
    if (pressed === true) startHeldVoice();
    if (pressed === false) releaseHeldVoice();
  });
  ipcMain.on('assistant:voice-available', (event, available) => {
    if (panel && event.sender === panel.webContents) voiceAvailable = available === true;
  });
  ipcMain.on('assistant:open', event => {if (event.sender === buddy.webContents) openPanel();});
  ipcMain.on('assistant:close', event => {if (panel && event.sender === panel.webContents) panel.close();});
  const {x, y, width, height} = screen.getPrimaryDisplay().workArea;
  const buddy = new BrowserWindow({
    x: x + width - 302, y: y + height - 362, width: 280, height: 340,
    transparent: true, frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, show: false,
    webPreferences: {backgroundThrottling: false, autoplayPolicy:'no-user-gesture-required', preload: require('node:path').join(__dirname, 'preload.cjs')}
  });
  buddy.setIgnoreMouseEvents(true);
  ipcMain.on('hit', (event, hit) => {
    if (event.sender === buddy.webContents) buddy.setIgnoreMouseEvents(!hit);
  });
  ipcMain.on('drag', (event, dx, dy) => {
    if (event.sender !== buddy.webContents) return;
    const cursor = pointerPosition();
    buddy.setPosition(cursor.x - dx, cursor.y - dy);
  });
  ipcMain.on('menu', event => {
    if (event.sender !== buddy.webContents) return;
    Menu.buildFromTemplate([
      {label:'打开桌面助手',click:openPanel},
      {label:'跳舞',submenu:[
        ...dances.map(dance => ({label:dance.label,click:() => buddy.webContents.send('dance',dance)})),
        {type:'separator'},
        {label:'停止跳舞',click:() => buddy.webContents.send('dance',null)}
      ]},
      {label:'退出小狮子',click:() => app.quit()}
    ]).popup({window:buddy});
  });
  // Chromium's cached cursor position can stop updating while an X11
  // window ignores input. Query the X server so hovering can re-enable clicks.
  let nativePointer;
  const probe = spawn('/usr/bin/python3', [path.join(__dirname,'x11-pointer.py')],
    {stdio:['ignore','pipe','inherit']});
  createInterface({input:probe.stdout}).on('line', line => {
    const [x,y,mask,child] = line.split(' ').map(Number);
    if (![x,y,mask,child].every(Number.isFinite)) return;
    nativePointer = {x,y,mask,child};
    trackPointer();
  });
  probe.on('error', error => console.error('X11 pointer:',error.message));
  probe.on('exit', () => {nativePointer = undefined;});
  function pointerPosition() {
    if (!nativePointer) return screen.getCursorScreenPoint();
    const display = screen.getAllDisplays().find(({nativeOrigin,bounds,scaleFactor}) =>
      nativeOrigin && nativePointer.x >= nativeOrigin.x && nativePointer.y >= nativeOrigin.y &&
      nativePointer.x < nativeOrigin.x + bounds.width*scaleFactor &&
      nativePointer.y < nativeOrigin.y + bounds.height*scaleFactor);
    if (!display) return screen.screenToDipPoint({x:nativePointer.x,y:nativePointer.y});
    return {
      x:display.bounds.x + Math.round((nativePointer.x-display.nativeOrigin.x)/display.scaleFactor),
      y:display.bounds.y + Math.round((nativePointer.y-display.nativeOrigin.y)/display.scaleFactor)
    };
  }
  const windowId = buddy.getNativeWindowHandle().readUInt32LE();
  function trackPointer() {
    if (buddy.isDestroyed() || buddy.webContents.isLoading()) return;
    const cursor = pointerPosition();
    const bounds = buddy.getContentBounds();
    buddy.webContents.send('cursor', cursor.x-bounds.x, cursor.y-bounds.y,
      cursor.x, cursor.y, nativePointer?.mask ?? 0, nativePointer?.child === windowId);
  }
  buddy.webContents.on('did-finish-load',trackPointer);
  buddy.on('move',trackPointer);
  screen.on('display-metrics-changed',trackPointer);
  buddy.on('closed', () => {
    screen.removeListener('display-metrics-changed',trackPointer);
    probe.kill();
    cancelHold();
    panel?.close();
  });
  buddy.once('ready-to-show', () => {
    buddy.showInactive();
    if (process.argv.includes('--panel')) openPanel();
  });
  app.on('second-instance', (_event, args) => {
    if (args.includes('--panel')) openPanel();
  });
  buddy.webContents.on('console-message', event => console.log(event.message));
  buddy.loadFile('index.html');
});
app.on('before-quit',capture.cancel);
app.on('window-all-closed', () => app.quit());
