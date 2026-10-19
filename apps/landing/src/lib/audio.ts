// WebAudio only: a soft room hum and a two-note token chime. Off until the visitor turns sound on.
let ctx: AudioContext | null = null;
let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setAmbient(on: boolean) {
  const ac = context();
  if (!ac) return;
  if (!on) {
    if (hum) {
      hum.gain.gain.setTargetAtTime(0, ac.currentTime, 0.3);
      const h = hum;
      setTimeout(() => h.source.stop(), 1200);
      hum = null;
    }
    return;
  }
  if (hum) return;
  // Brown noise through a low-pass reads as distant chatter and extraction fans.
  const buffer = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.2;
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const gain = ac.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();
  gain.gain.setTargetAtTime(0.16, ac.currentTime, 0.6);
  hum = { source, gain };
}

export function chime() {
  const ac = context();
  if (!ac) return;
  const now = ac.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now + i * 0.16);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.9);
    osc.connect(g).connect(ac.destination);
    osc.start(now + i * 0.16);
    osc.stop(now + i * 0.16 + 1);
  });
}
