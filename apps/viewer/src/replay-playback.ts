/** Playback has one outstanding seek. Slow verification never accumulates
 * timer requests that supersede frames before they can be displayed. */
export function replayPlayback(
  step: () => Promise<boolean>,
  changed: (playing: boolean) => void,
  delay = 900,
) {
  let generation = 0;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | undefined;
  function stop(): void {
    generation++;
    playing = false;
    clearTimeout(timer);
    changed(false);
  }
  function start(): void {
    if (playing) return;
    playing = true;
    changed(true);
    const token = ++generation;
    const advance = async (): Promise<void> => {
      try {
        if (inFlight) await inFlight;
        if (token !== generation) return;
        const current = step();
        inFlight = current;
        let more: boolean;
        try {
          more = await current;
        } finally {
          if (inFlight === current) inFlight = undefined;
        }
        if (token !== generation) return;
        if (!more) stop();
        else
          timer = setTimeout(() => {
            void advance();
          }, delay);
      } catch {
        if (token === generation) stop();
      }
    };
    timer = setTimeout(() => {
      void advance();
    }, delay);
  }
  return {
    start,
    stop,
    get playing() {
      return playing;
    },
  };
}
