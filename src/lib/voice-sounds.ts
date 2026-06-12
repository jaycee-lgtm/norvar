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

/** Soft futuristic pulse when the mic turns on. */
export function playVoiceStartSound() {
  void ensureCtx().then(ctx => {
    const t = ctx.currentTime;
    const duration = 0.42;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(0.11, t + 0.035);
    master.gain.exponentialRampToValueAtTime(0.001, t + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.85;
    filter.frequency.setValueAtTime(620, t);
    filter.frequency.exponentialRampToValueAtTime(2800, t + 0.1);
    filter.frequency.exponentialRampToValueAtTime(900, t + duration);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(185, t);
    body.frequency.exponentialRampToValueAtTime(277, t + 0.14);

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.55;

    const halo = ctx.createOscillator();
    halo.type = "triangle";
    halo.frequency.setValueAtTime(370, t);
    halo.frequency.exponentialRampToValueAtTime(415, t + 0.1);

    const haloGain = ctx.createGain();
    haloGain.gain.value = 0.22;

    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(880, t + 0.02);
    shimmer.frequency.exponentialRampToValueAtTime(988, t + 0.12);

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0, t);
    shimmerGain.gain.linearRampToValueAtTime(0.07, t + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    body.connect(bodyGain);
    halo.connect(haloGain);
    shimmer.connect(shimmerGain);
    bodyGain.connect(filter);
    haloGain.connect(filter);
    shimmerGain.connect(filter);
    filter.connect(master);
    master.connect(ctx.destination);

    const stop = t + duration + 0.05;
    for (const osc of [body, halo, shimmer]) {
      osc.start(t);
      osc.stop(stop);
    }
  });
}
