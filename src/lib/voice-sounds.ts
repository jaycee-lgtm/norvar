let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

async function ensureCtx(): Promise<AudioContext> {
  const ctx = getCtx();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

function tone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = "sine",
  volume = 0.12,
) {
  void ensureCtx().then(ctx => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  });
}

/** Short ascending chirp when mic recording starts. */
export function playVoiceStartSound() {
  void ensureCtx().then(ctx => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  });
}

/** Soft click when speech is detected. */
export function playVoiceDetectedSound() {
  tone(880, 60, "sine", 0.08);
}

/** Descending tone when recording stops. */
export function playVoiceStopSound() {
  void ensureCtx().then(ctx => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  });
}

/** Brief tone when transcription succeeds. */
export function playVoiceSentSound() {
  tone(523, 50, "triangle", 0.09);
  window.setTimeout(() => tone(784, 70, "triangle", 0.08), 55);
}

/** Low tone on error. */
export function playVoiceErrorSound() {
  tone(220, 140, "sine", 0.1);
}
