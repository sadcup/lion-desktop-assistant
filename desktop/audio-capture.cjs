const {execFile, spawn} = require('node:child_process');
const {existsSync} = require('node:fs');
const {promisify} = require('node:util');

const exec = promisify(execFile);
const tool = name => ['/usr/bin/', '/home/linuxbrew/.linuxbrew/bin/']
  .map(directory => directory + name).find(existsSync) ?? name;
const rate = 16000;

let capture;

async function inputDevice() {
  const pactl = tool('pactl');
  const {stdout} = await exec(pactl,['list','short','sources'],{timeout:3000});
  const sources = stdout.trim().split('\n').map(line => line.split('\t')[1]).filter(Boolean);
  const {stdout: defaultSource} = await exec(pactl,['get-default-source'],{timeout:3000});
  const preferred = process.env.LION_AUDIO_SOURCE || defaultSource.trim();
  if (sources.includes(preferred) && !preferred.endsWith('.monitor')) return preferred;
  const input = sources.find(name => !name.endsWith('.monitor'));
  if (!input) throw new Error('找不到麦克风，请检查系统声音输入设置。');
  return input;
}

async function start(maxSeconds = 11.8) {
  if (capture) throw new Error('麦克风正在录音。');
  const recording = {chunks:[], size:0, lastSpeech:0, maxBytes:Math.floor(rate * maxSeconds) * 2};
  capture = recording;
  try {
    const input = await inputDevice();
    if (capture !== recording) throw new Error('录音已取消。');
    const child = spawn(tool('parec'), [
      '--device=' + input, '--latency-msec=60', '--raw', '--rate=' + rate,
      '--channels=1', '--format=s16le'
    ], {stdio:['ignore','pipe','ignore']});
    recording.child = child;
    recording.closed = new Promise(resolve => child.once('close',resolve));
    child.stdout.on('data', chunk => {
      const remaining = recording.maxBytes - recording.size;
      if (remaining > 0) {
        const bytes = chunk.subarray(0,remaining);
        const startOffset = recording.size;
        recording.chunks.push(bytes);
        recording.size += bytes.length;
        // Local energy check only. No audio is transmitted until the utterance ends.
        let energy = 0, samples = 0;
        for (let i=0;i+1<bytes.length;i+=8) {
          const sample = bytes.readInt16LE(i);
          energy += sample*sample;
          samples++;
        }
        if (samples && energy/samples > (32768*.005)**2) {
          recording.lastSpeech = Date.now();
          recording.firstSpeechOffset ??= startOffset;
          recording.lastSpeechOffset = recording.size;
        }
      }
    });
    await new Promise((resolve,reject) => {
      child.once('error', () => reject(new Error('无法启动本机录音程序。')));
      child.once('spawn',resolve);
    });
    recording.timer = setTimeout(() => child.kill(),maxSeconds*1000);
  } catch (error) {
    if (capture === recording) cancel();
    throw error;
  }
}

function cancel() {
  const recording = capture;
  capture = undefined;
  if (!recording) return;
  clearTimeout(recording.timer);
  recording.child?.kill();
}

async function stop(trimSilence = false) {
  const recording = capture;
  if (!recording?.child) throw new Error('录音已结束，请再试一次。');
  cancel();
  await recording.closed;
  let pcm = Buffer.concat(recording.chunks);
  if (trimSilence && recording.firstSpeechOffset !== undefined) {
    const padding = rate * 2 * .25;
    const from = Math.max(0,recording.firstSpeechOffset-padding);
    pcm = pcm.subarray(from,recording.lastSpeechOffset+padding);
  }
  if (pcm.length < rate * 2 * .2) throw new Error('没有录到声音或录音太短。');
  const wav = Buffer.alloc(44);
  wav.write('RIFF',0);
  wav.writeUInt32LE(pcm.length+36,4);
  wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);
  wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24);
  wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);
  wav.write('data',36);
  wav.writeUInt32LE(pcm.length,40);
  return Buffer.concat([wav,pcm]).toString('base64');
}

module.exports = {start,stop,cancel,lastSpeech:() => capture?.lastSpeech ?? 0};
