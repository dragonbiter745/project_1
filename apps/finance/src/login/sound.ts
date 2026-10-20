// Login sound effects, synthesised with WebAudio so there are no audio files to download.
// Every sound starts from the sign-in tap, which is the user gesture browsers need for audio.

const KEY = 'fc.finance.sound';
let ctx: AudioContext | null = null;
let counter: { stop: () => void } | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  if (!on) stopCounting();
}

function context(): AudioContext | null {
  if (!soundOn()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(ac: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  return src;
}

/** Air moving past: band-passed noise sweeping up (out) or down (back). */
function whoosh(ac: AudioContext, at: number, seconds: number, from: number, to: number, level: number) {
  const src = noise(ac, seconds);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + seconds * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(band).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + seconds);
}

/** One paper flick: a few milliseconds of bright noise. */
function flick(ac: AudioContext, at: number, level: number) {
  const src = noise(ac, 0.04);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600 + Math.random() * 1800;
  const g = ac.createGain();
  g.gain.setValueAtTime(level, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
  src.connect(hp).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + 0.04);
}

function tone(ac: AudioContext, at: number, freq: number, seconds: number, level: number, type: OscillatorType = 'sine', glideTo?: number) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + seconds);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/** The notes lift off: a rising whoosh, then a note-counting machine whirs until the answer comes back. */
export function playLaunch() {
  const ac = context();
  if (!ac) return;
  const now = ac.currentTime;
  whoosh(ac, now, 0.7, 300, 2400, 0.22);
  for (let i = 0; i < 7; i++) flick(ac, now + 0.05 + i * 0.07 + Math.random() * 0.03, 0.12);
  stopCounting();
  // The counting machine: fast paper flicks over a low motor hum. Capped at 6 s in case nothing answers.
  const motor = ac.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.value = 74;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  const mg = ac.createGain();
  mg.gain.setValueAtTime(0.0001, now + 0.25);
  mg.gain.exponentialRampToValueAtTime(0.035, now + 0.45);
  motor.connect(lp).connect(mg).connect(ac.destination);
  motor.start(now + 0.25);
  motor.stop(now + 6);
  let t = now + 0.3;
  const timer = window.setInterval(() => {
    const until = ac.currentTime + 0.12;
    while (t < until) {
      flick(ac, t, 0.05 + Math.random() * 0.03);
      t += 0.034;
    }
  }, 60);
  const stopAt = window.setTimeout(() => stopCounting(), 6000);
  counter = {
    stop: () => {
      window.clearInterval(timer);
      window.clearTimeout(stopAt);
      const end = ac.currentTime;
      mg.gain.cancelScheduledValues(end);
      mg.gain.setTargetAtTime(0.0001, end, 0.04);
      try {
        motor.stop(end + 0.2);
      } catch {
        // Already past its 6 s cap.
      }
    },
  };
}

function stopCounting() {
  counter?.stop();
  counter = null;
}

/** Signed in: the cash drawer clunks open with a "cha-ching" and the notes rush out past the screen. */
export function playSuccess() {
  const ac = context();
  if (!ac) return;
  stopCounting();
  const now = ac.currentTime;
  // Drawer clunk.
  tone(ac, now, 140, 0.16, 0.25, 'triangle', 70);
  const thud = noise(ac, 0.08);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const tg = ac.createGain();
  tg.gain.setValueAtTime(0.25, now);
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  thud.connect(lp).connect(tg).connect(ac.destination);
  thud.start(now);
  // Bell: "cha" then "ching", with inharmonic partials so it rings like metal.
  for (const [at, base] of [
    [0.06, 1568],
    [0.2, 2093],
  ] as const) {
    tone(ac, now + at, base, 1.1, 0.12);
    tone(ac, now + at, base * 2.76, 0.6, 0.04);
    tone(ac, now + at, base * 5.4, 0.25, 0.015);
  }
  whoosh(ac, now + 0.12, 0.9, 500, 5200, 0.3);
  for (let i = 0; i < 10; i++) flick(ac, now + 0.15 + i * 0.05 + Math.random() * 0.03, 0.1);
}

/** Wrong password: the notes are sucked back in (a falling whoosh) with a soft two-tone "no". */
export function playFailure() {
  const ac = context();
  if (!ac) return;
  stopCounting();
  const now = ac.currentTime;
  whoosh(ac, now, 0.75, 2800, 260, 0.24);
  for (let i = 0; i < 6; i++) flick(ac, now + 0.1 + i * 0.08, 0.08);
  tone(ac, now + 0.08, 330, 0.22, 0.09, 'triangle');
  tone(ac, now + 0.3, 247, 0.38, 0.09, 'triangle', 220);
}
