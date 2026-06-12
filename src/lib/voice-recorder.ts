type CaptureOptions = {
  silenceMs?: number;
  maxMs?: number;
  silenceThreshold?: number;
  onLevel?: (level: number) => void;
};

type CaptureHandle = {
  stop: () => Promise<Blob | null>;
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
    silenceMs = 1600,
    maxMs = 45000,
    silenceThreshold = 0.012,
    onLevel,
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
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let cancelled = false;
  let finished = false;
  let resolveStop: (blob: Blob | null) => void = () => {};
  let silenceStartedAt: number | null = null;
  let startedAt = performance.now();
  let speechStartedAt: number | null = null;
  let heardSpeech = false;

  const cleanup = () => {
    stream.getTracks().forEach(track => track.stop());
    void audioContext.close();
  };

  const finish = (blob: Blob | null) => {
    if (finished) return;
    finished = true;
    cleanup();
    resolveStop(blob);
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
      heardSpeech = true;
      speechStartedAt ??= now;
      silenceStartedAt = null;
    } else if (heardSpeech && speechStartedAt && now - speechStartedAt >= 700) {
      silenceStartedAt ??= now;
      if (now - silenceStartedAt >= silenceMs && recorder.state === "recording") {
        recorder.stop();
        return;
      }
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  return {
    stop: () => new Promise<Blob | null>((resolve) => {
      resolveStop = resolve;
      if (recorder.state === "recording") recorder.stop();
      else finish(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
    }),
    cancel: () => {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      else finish(null);
    },
  };
}
