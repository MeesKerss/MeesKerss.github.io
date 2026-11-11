// Idle globe spin speed (degrees of longitude per second) for a zoom level:
// full speed when the whole globe is in view, fading to a stop as you zoom in.
const FULL = 0.6;
const FADE_START = 2.5;
const STOP = 3.5;

export function spinSpeed(zoom) {
  if (zoom <= FADE_START) return FULL;
  if (zoom >= STOP) return 0;
  return FULL * (STOP - zoom) / (STOP - FADE_START);
}
