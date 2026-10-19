let ctx: AudioContext | null = null;

// Browsers only allow audio after a user gesture, so the kitchen taps "Start service" once.
export function unlockAudio(): void {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  ctx ??= new Ctx();
  void ctx.resume();
}

// Three bright notes, loud enough to cut through a busy kitchen.
export function playNewOrderChime(): void {
  const audio = ctx;
  if (!audio || audio.state !== 'running') return;
  const start = audio.currentTime;
  const notes: Array<[number, number]> = [
    [880, 0],
    [1175, 0.16],
    [880, 0.32],
  ];
  for (const [frequency, offset] of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(audio.destination);
    const t = start + offset;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
