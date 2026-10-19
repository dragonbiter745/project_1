/** Shared per-frame state written by the sim driver before anything else renders. */
export const frame = {
  alpha: 1,
  /** Seconds since the scene started, for decorative motion. */
  t: 0,
  /** 0 at midday, 1 at night. */
  night: 0,
  /** Unit vector pointing at the sun. */
  sun: { x: 0.6, y: 0.7, z: -0.2 },
  /** 0 when the sun is down or clouded over, 1 in clear daylight. */
  daylight: 1,
};
