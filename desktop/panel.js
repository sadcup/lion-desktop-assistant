const byId = id => document.getElementById(id);
const {request} = window.assistant;
const history = byId('history'), message = byId('message'), mic = byId('mic');
const recentFiles = byId('recent-files');
const voice = byId('voice'), pending = byId('pending'), status = byId('status');
let busy = false, recording, playbackUrl, voiceTurn = false;
let holdState, holdRevision = 0, lastVoiceAvailable;

function updateControls() {
  const locked = busy || Boolean(recording || holdState);
  const waiting = Boolean(pending.children.length);
  mic.textContent = ['recording','listening'].includes(holdState?.phase) ? '🎙 正在录音' :
    recording ? '■ 停止并发送' : '🎙 说话';
  mic.setAttribute('aria-pressed', String(Boolean(recording || ['recording','listening'].includes(holdState?.phase))));
  mic.disabled = busy || Boolean(holdState) || waiting;
  byId('send').disabled = locked || waiting;
  byId('reset').disabled = locked;
  byId('look').disabled = locked || waiting;
  const available = !locked && !waiting;
  if (available !== lastVoiceAvailable) {
    lastVoiceAvailable = available;
    window.assistant.voiceAvailable(available);
  }
  byId('recent').disabled = byId('look').disabled;
  recentFiles.querySelectorAll('button').forEach(button => {button.disabled = byId('recent').disabled;});
  pending.querySelectorAll('button').forEach(button => {button.disabled = locked;});
}

function addTurn(role, text) {
  const turn = document.createElement('p');
  turn.className = 'turn ' + role;
  turn.textContent = text;
  history.append(turn);
  history.scrollTop = history.scrollHeight;
}

function showPending(items) {
  pending.replaceChildren();
  for (const item of items ?? []) {
    const card = document.createElement('article');
    const label = document.createElement('strong');
    const names = {close_window:'关闭窗口', write_note:'创建笔记', create_folder:'新建文件夹', move_image:'移动图片', move_images:'批量移动图片', press_key:'发送快捷键', type_text:'输入文字', click:'点击屏幕'};
    label.textContent = (names[item.name] ?? item.name) + (item.target ? ' · ' + item.target.title : '');
    const argumentsText = document.createElement('pre');
    argumentsText.textContent = Object.entries(item.arguments).map(([key,value]) => ({path:"路径",source:"原图片",destination:"目标文件夹"}[key] ?? key) + "  " + value).join("\n");
    if (item.preview) {
      argumentsText.textContent = item.preview.map(file => file.source + '\n→ ' + file.target).join('\n\n');
    }
    card.append(label, argumentsText);
    for (const approve of [true, false]) {
      const button = document.createElement('button');
      button.textContent = approve ? '确认执行' : '拒绝';
      button.onclick = () => perform('处理中…', async () => {
        await showReply(await request('confirm', {id:item.id, approve}), voiceTurn);
      });
      card.append(button);
    }
    pending.append(card);
  }
  updateControls();
}

async function perform(label, task) {
  if (busy) return;
  busy = true;
  status.textContent = label;
  updateControls();
  try {
    await task();
  } catch (error) {
    status.textContent = error.message.replace(/^.*?Error: /, '');
  } finally {
    busy = false;
    updateControls();
    processHold();
  }
}

function showEvents(events) {
  const records = [];
  const labels = {close_window:'关闭窗口',create_folder:'新建文件夹',move_image:'移动图片',move_images:'批量移动图片',
    write_note:'保存笔记',open_path:'打开文件或文件夹'};
  for (const event of events ?? []) {
    const label = labels[event.name];
    if (!label) continue;
    const result = event.result?.result;
    if (!event.result?.ok) records.push(label + '失败 · ' + (event.result?.error ?? '未知错误'));
    else if (result.moved) for (const file of result.moved) records.push(label + ' · ' + file.moved_from + '\n→ ' + file.moved_to);
    else if (result.moved_to) records.push(label + ' · ' + result.moved_from + '\n→ ' + result.moved_to);
    else records.push(label + ' · ' + (result.created ?? result.opened ?? result.closed ?? result.requested_close));
  }
  if (records.length) {
    const details = document.createElement('details');
    details.className = 'file-events turn';
    const title = document.createElement('summary');
    title.textContent = '文件操作记录 · ' + records.length + ' 项';
    const list = document.createElement('ul');
    for (const record of records) {
      const item = document.createElement('li');
      item.textContent = record;
      list.append(item);
    }
    details.append(title,list);
    history.append(details);
  }
  const sources = new Set();
  for (const event of events ?? []) {
    const result = event.result?.result;
    for (const entry of result?.sources ?? []) if (entry.readable) sources.add(entry.path);
    if (event.name === 'read_text' && result?.path) sources.add(result.path);
  }
  if (sources.size) {
    const details = document.createElement('details');
    details.className = 'sources turn';
    const summary = document.createElement('summary');
    summary.textContent = '已读取 ' + sources.size + ' 份来源';
    const list = document.createElement('ul');
    for (const path of sources) {
      const item = document.createElement('li');
      item.textContent = path;
      list.append(item);
    }
    details.append(summary,list);
    history.append(details);
    history.scrollTop = history.scrollHeight;
  }
  history.scrollTop = history.scrollHeight;
}

async function showReply(data, readAloud) {
  addTurn('assistant', data.reply);
  showEvents(data.events);
  showPending(data.pending);
  status.textContent = '';
  if (!readAloud || !byId('speak').checked || !data.reply.trim()) return;
  status.textContent = '正在生成语音…';
  try {
    const {audio} = await request('speak', data.reply.slice(0, 180));
    const bytes = Uint8Array.from(atob(audio), char => char.charCodeAt(0));
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = URL.createObjectURL(new Blob([bytes], {type:'audio/wav'}));
    voice.src = playbackUrl;
    voice.hidden = false;
    status.textContent = '';
    await voice.play();
  } catch {
    status.textContent = '文字回复已完成，语音播放失败。';
  }
}

async function send(text, fromVoice) {
  voice.pause();
  voiceTurn = fromVoice;
  addTurn('user', text);
  status.textContent = 'BOLT 正在处理…';
  await showReply(await request('chat', text), fromVoice);
}

byId('compose').onsubmit = event => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text || recording || holdState || pending.children.length) return;
  perform('BOLT 正在处理…', async () => {
    message.value = '';
    await send(text, false);
  });
};
message.onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    byId('compose').requestSubmit();
  }
};

function processHold() {
  if (!holdState) return;
  const {phase,value} = holdState;
  if (phase === 'starting') status.textContent = '正在连接麦克风…';
  if (phase === 'recording') status.textContent = '正在录音。';
  if (phase === 'listening') status.textContent = '松开后仍在听，说完会自动发送。';
  if (phase === 'transcribing') status.textContent = '正在本机识别语音…';
  if (phase === 'thinking') status.textContent = 'BOLT 正在处理…';
  if (phase === 'speaking') status.textContent = '正在生成语音…';
  if (busy || !['done','error'].includes(phase)) return;
  holdState = undefined;
  if (phase === 'error') {
    status.textContent = value;
  } else {
    if (!history.lastElementChild?.textContent.includes(value.result.reply)) {
      addTurn('user',value.text);
      void showReply(value.result,false);
    }
    voiceTurn = byId('speak').checked;
  }
  updateControls();
}

function receiveHold(state) {
  if (!state || state.revision <= holdRevision) return;
  holdRevision = state.revision;
  holdState = state;
  if (state.phase === 'starting') voice.pause();
  updateControls();
  processHold();
}

window.assistant.onHold(receiveHold);
byId('speak').onchange = () => void request('voice-playback',byId('speak').checked);

function finishRecording() {
  if (!recording || busy) return;
  clearTimeout(recording);
  recording = undefined;
  perform('正在本机识别语音…', async () => {
    const {text} = await request('record-stop');
    if (!text?.trim()) throw new Error('没听清，请再说一遍。');
    await send(text.trim(), true);
  });
}

mic.onclick = () => {
  if (recording) {finishRecording(); return;}
  perform('正在连接麦克风…', async () => {
    voice.pause();
    await request('record-start');
    recording = setTimeout(finishRecording, 11500);
    status.textContent = '正在录音，说完点击停止。最长约 12 秒。';
  });
};

byId('look').onclick = () => perform('正在本机读取屏幕…', async () => {
  voice.pause();
  voiceTurn = false;
  addTurn('user','看看当前屏幕');
  await showReply(await request('look'),false);
});

byId('recent').onclick = () => {
  if (!recentFiles.hidden) {recentFiles.hidden = true; return;}
  perform('正在读取最近文件…', async () => {
    const {files,truncated} = await request('recent');
    recentFiles.replaceChildren();
    const heading = document.createElement('p');
    heading.textContent = files.length ? '最近七天修改的文件' + (truncated ? ' · 部分目录达到扫描上限' : '') : '最近七天没有找到可打开的文件。';
    recentFiles.append(heading);
    for (const file of files) {
      const row = document.createElement('div');
      row.className = 'recent-file';
      const text = document.createElement('div');
      text.textContent = file.name;
      const path = document.createElement('small');
      path.textContent = file.path;
      text.append(path);
      const button = document.createElement('button');
      button.textContent = '打开';
      button.onclick = () => perform('正在打开文件…', async () => {
        await showReply(await request('open-recent',file.path),false);
      });
      row.append(text,button);
      recentFiles.append(row);
    }
    recentFiles.hidden = false;
    status.textContent = '';
  });
};

byId('reset').onclick = () => perform('正在新建对话…', async () => {
  await request('reset');
  voice.pause();
  voice.hidden = true;
  recentFiles.hidden = true;
  recentFiles.replaceChildren();
  history.querySelectorAll('.turn').forEach(turn => turn.remove());
  showPending([]);
  status.textContent = '';
  message.focus();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') window.assistant.close();
});
window.addEventListener('pagehide', () => {
  clearTimeout(recording);
  if (playbackUrl) URL.revokeObjectURL(playbackUrl);
});
perform('正在连接 BOLT…', async () => {
  const session = await request('session');
  byId('speak').checked = await request('voice-playback');
  receiveHold(await request('hold-state'));
  for (const turn of session.turns ?? []) {
    addTurn(turn.role,turn.text);
    showEvents(turn.events);
  }
  showPending(session.pending);
  status.textContent = '';
  message.focus();
});
