export const TYPEWRITER_TICK_MS = 25;

export type TypewriterDrain = {
  enqueue: (text: string) => void;
  reset: () => void;
};

export function createTypewriterDrain(onAppend: (char: string) => void): TypewriterDrain {
  const queue: string[] = [];
  let active = false;

  function tick() {
    if (queue.length === 0) {
      active = false;
      return;
    }
    onAppend(queue.shift()!);
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
