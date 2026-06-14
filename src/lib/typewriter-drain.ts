export const TYPEWRITER_TICK_MS = 8;

export type TypewriterDrain = {
  enqueue: (text: string) => void;
  reset: () => void;
};

function charsPerTick(queueLength: number): number {
  if (queueLength > 80) return 12;
  if (queueLength > 40) return 8;
  if (queueLength > 15) return 4;
  return 2;
}

export function createTypewriterDrain(
  onAppend: (char: string) => void,
  onIdle?: () => void,
): TypewriterDrain {
  const queue: string[] = [];
  let active = false;

  function tick() {
    if (queue.length === 0) {
      active = false;
      onIdle?.();
      return;
    }
    const batch = charsPerTick(queue.length);
    for (let i = 0; i < batch && queue.length > 0; i++) {
      onAppend(queue.shift()!);
    }
    setTimeout(tick, TYPEWRITER_TICK_MS);
  }

  return {
    enqueue(text: string) {
      if (!text) return;
      for (const ch of text) queue.push(ch);
      if (!active) {
        active = true;
        tick();
      }
    },
    reset() {
      queue.length = 0;
      active = false;
    },
  };
}
