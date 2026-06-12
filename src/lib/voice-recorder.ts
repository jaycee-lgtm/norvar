type CaptureOptions = {
  silenceMs?: number;
  maxMs?: number;
  silenceThreshold?: number;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
};

export type CaptureHandle = {
  /** Resolves when recording finishes (silence detected, max time, or manual stop). */
  finished: Promise<Blob | null>;
  stop: () => void;
  cancel: () => void;
};

function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type));
}

export async function startVoiceCapture(options: CaptureOptions = {}): Promise<CaptureHandle> {
  const {
    silenceMs = 2200,
    maxMs = 60000,
    silenceThreshold = 0.008,
    onLevel,
    onSpeechStart,
  } = options;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let cancelled = false;
  let finished = false;
  let resolveFinish: (blob: Blob | null) => void = () => {};
  const finishedPromise = new Promise<Blob | null>(resolve => {
    resolveFinish = resolve;
  });

  let silenceStartedAt: number | null = null;
  let startedAt = performance.now();
  let speechStartedAt: number | null = null;
  let heardSpeech = false;
  let speechNotified = false;
  let rafId = 0;

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    stream.getTracks().forEach(track => track.stop());
    void audioContext.close();
  };

  const finish = (blob: Blob | null) => {
    if (finished) return;
    finished = true;
    cleanup();
    resolveFinish(blob);
  };

  recorder.onstop = () => {
    if (cancelled) {
      finish(null);
      return;
    }
    const type = recorder.mimeType || mimeType || "audio/webm";
    finish(chunks.length > 0 ? new Blob(chunks, { type }) : null);
  };

  recorder.start(250);

  const tick = () => {
    if (finished || cancelled) return;

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    onLevel?.(rms);

    const now = performance.now();
    if (now - startedAt >= maxMs) {
      if (recorder.state === "recording") recorder.stop();
      return;
    }

    if (rms >= silenceThreshold) {
      if (!speechNotified) {
        speechNotified = true;
        onSpeechStart?.();
      }
      heardSpeech = true;
      speechStartedAt ??= now;
      silenceStartedAt = null;
    } else if (heardSpeech && speechStartedAt && now - speechStartedAt >= 500) {
      silenceStartedAt ??= now;
      if (now - silenceStartedAt >= silenceMs && recorder.state === "recording") {
        recorder.stop();
        return;
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    finished: finishedPromise,
    stop: () => {
      if (finished || cancelled) return;
      if (recorder.state === "recording") recorder.stop();
    },
    cancel: () => {
      if (finished) return;
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      else finish(null);
    },
  };
}
