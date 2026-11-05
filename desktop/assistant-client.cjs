const bolt = 'http://127.0.0.1:18082';
const omni = 'http://127.0.0.1:18682';
let session;

async function request(base, path, body, headers = {}, timeout = 45000) {
  let response;
  try {
    response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {...headers, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeout)
    });
  } catch (error) {
    const service = base === bolt ? 'BOLT 桌面服务' : 'LFM3-Omni 语音服务';
    if (error.name === 'TimeoutError') throw new Error(service + '响应超时，请先检查操作是否已执行。');
    throw new Error(service + '连接失败，请检查本机服务。');
  }
  const data = await response.json();
  return {response, data};
}

async function getSession() {
  const {response, data} = await request(bolt, '/api/session', undefined,
    session ? {Cookie: session.cookie} : {});
  if (!response.ok) throw new Error(data.error);
  session = {cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrf};
  return {turns: data.turns, pending: data.pending};
}

async function boltAction(path, body) {
  if (!session) await getSession();
  const {response, data} = await request(bolt, path, body,
    {Cookie: session.cookie, 'X-Bolt-CSRF': session.csrf}, 180000);
  if (response.status === 403) {
    session = undefined;
    throw new Error('BOLT 会话已重启，请重新发送指令。');
  }
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function voice(path, body) {
  const {response, data} = await request(omni, path, body);
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function dispatch(action, data) {
  switch (action) {
    case 'session': return getSession();
    case 'chat':
      if (typeof data !== 'string' || !data.trim() || data.length > 4000) throw new Error('请输入 1–4000 字。');
      return boltAction('/api/chat', {message: data.trim()});
    case 'confirm':
      if (!/^[a-f0-9]{32}$/.test(data?.id ?? '') || typeof data.approve !== 'boolean') throw new Error('确认参数无效。');
      return boltAction('/api/confirm', {id: data.id, approve: data.approve});
    case 'recent': return boltAction('/api/recent', {});
    case 'open-recent':
      if (typeof data !== 'string' || !data || data.length > 4096) throw new Error('文件路径无效。');
      return boltAction('/api/open-recent', {path:data});
    case 'reset': return boltAction('/api/reset', {});
    case 'transcribe':
      if (typeof data !== 'string' || !data || data.length > 1400000) throw new Error('录音为空或太长。');
      return voice('/api/transcribe', {recording: data});
    case 'speak':
      if (typeof data !== 'string' || !data.trim() || data.length > 180) throw new Error('朗读文本无效。');
      return voice('/api/speak', {text: data});
    default: throw new Error('未知操作。');
  }
}

module.exports = {dispatch};
