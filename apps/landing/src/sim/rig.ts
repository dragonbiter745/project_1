import type { AnimKind } from './types';

/**
 * Joint angles for the procedural humanoid. Pitches are positive forward, knees positive
 * when bent, shoulder abduction positive away from the body. Pure maths, no three imports.
 */
export interface Pose {
  /** Hip joint height above the floor, metres at scale 1. */
  pelvisY: number;
  lean: number;
  twist: number;
  headPitch: number;
  headYaw: number;
  shL: number;
  shR: number;
  abL: number;
  abR: number;
  elL: number;
  elR: number;
  hipL: number;
  hipR: number;
  knL: number;
  knR: number;
  prop: 'none' | 'phone' | 'tray';
}

export const RIG = {
  hip: 0.9,
  thigh: 0.43,
  shin: 0.41,
  torso: 0.5,
  shoulderX: 0.19,
  shoulderY: 0.46,
  hipX: 0.09,
  upperArm: 0.28,
  forearm: 0.25,
} as const;

export function createPose(): Pose {
  return { pelvisY: RIG.hip, lean: 0, twist: 0, headPitch: 0, headYaw: 0, shL: 0, shR: 0, abL: 0.08, abR: 0.08, elL: 0.1, elR: 0.1, hipL: 0, hipR: 0, knL: 0, knR: 0, prop: 'none' };
}

const pulse = (x: number) => Math.max(0, Math.sin(x)) ** 3;

function stand(p: Pose, t: number) {
  p.pelvisY = RIG.hip - 0.004 + Math.sin(t * 1.7) * 0.003;
  p.hipL = 0.02;
  p.hipR = -0.02 + Math.sin(t * 0.4) * 0.03;
  p.knL = 0.04;
  p.knR = 0.06;
}

function sit(p: Pose, seatY: number, scale: number) {
  p.pelvisY = (seatY + 0.075) / scale;
  const high = seatY > 0.6;
  p.hipL = p.hipR = high ? 1.25 : 1.5;
  p.knL = p.knR = high ? 1.05 : 1.48;
}

function phoneArms(p: Pose) {
  p.shR = 0.55;
  p.elR = 1.8;
  p.abR = 0.12;
  p.shL = 0.42;
  p.elL = 1.6;
  p.abL = 0.18;
  p.headPitch = 0.42;
  p.prop = 'phone';
}

/**
 * @param phase walking phase (radians, advances with distance)
 * @param t     seconds, per-person offset already applied
 */
export function poseFor(p: Pose, anim: AnimKind, phase: number, t: number, seatY: number, scale: number, moving: boolean): Pose {
  p.lean = 0.02;
  p.twist = 0;
  p.headPitch = 0;
  p.headYaw = 0;
  p.abL = p.abR = 0.08;
  p.shL = p.shR = 0.04;
  p.elL = p.elR = 0.12;
  p.prop = 'none';

  if (moving && (anim === 'walk' || anim === 'carry' || anim === 'push')) {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    p.hipL = 0.46 * s;
    p.hipR = -0.46 * s;
    p.knL = 0.12 + 0.8 * Math.max(0, c);
    p.knR = 0.12 + 0.8 * Math.max(0, -c);
    p.pelvisY = RIG.hip - 0.022 * Math.abs(s);
    p.twist = 0.06 * s;
    p.headYaw = -0.05 * s;
    if (anim === 'walk') {
      p.shL = -0.42 * s;
      p.shR = 0.42 * s;
      p.elL = 0.22 + 0.2 * Math.max(0, -s);
      p.elR = 0.22 + 0.2 * Math.max(0, s);
    } else if (anim === 'carry') {
      p.shL = p.shR = 0.72;
      p.elL = p.elR = 1.2;
      p.abL = p.abR = 0.2;
      p.prop = 'tray';
    } else {
      p.shL = p.shR = 0.95;
      p.elL = p.elR = 0.5;
      p.abL = p.abR = 0.14;
      p.lean = 0.14;
    }
    return p;
  }

  switch (anim) {
    case 'sit':
      sit(p, seatY, scale);
      p.shL = p.shR = 0.42;
      p.elL = p.elR = 0.55;
      p.lean = 0.06;
      p.headYaw = Math.sin(t * 0.35) * 0.45;
      break;
    case 'sitPhone':
      sit(p, seatY, scale);
      phoneArms(p);
      p.lean = 0.1;
      break;
    case 'eat': {
      sit(p, seatY, scale);
      const k = (Math.sin(t * 2.3) + 1) / 2;
      p.shL = 0.5;
      p.elL = 0.62;
      p.shR = 0.45 + 0.55 * k;
      p.elR = 0.6 + 1.45 * k;
      p.abR = 0.12;
      p.lean = 0.14 - 0.06 * k;
      p.headPitch = 0.18 - 0.12 * k;
      break;
    }
    case 'phone':
      stand(p, t);
      phoneArms(p);
      break;
    case 'wave':
      stand(p, t);
      p.shR = 0.25;
      p.abR = 2.55;
      p.elR = 0.5 + 0.35 * Math.sin(t * 9);
      break;
    case 'cook':
      stand(p, t);
      p.lean = 0.12;
      p.shL = 0.85 + 0.08 * Math.sin(t * 3);
      p.shR = 0.85 - 0.08 * Math.sin(t * 3);
      p.elL = p.elR = 0.9;
      p.headPitch = 0.38;
      break;
    case 'flip': {
      stand(p, t);
      const k = pulse(t * 1.7);
      p.lean = 0.1;
      p.shL = 0.75;
      p.elL = 1.05;
      p.shR = 0.8 + 0.55 * k;
      p.elR = 0.75 - 0.55 * k;
      p.headPitch = 0.32;
      break;
    }
    case 'stir':
      stand(p, t);
      p.lean = 0.1;
      p.shR = 0.9 + 0.14 * Math.sin(t * 4.2);
      p.abR = 0.2 + 0.16 * Math.cos(t * 4.2);
      p.elR = 0.95;
      p.shL = 0.6;
      p.elL = 1.05;
      p.headPitch = 0.36;
      break;
    case 'wipe':
      stand(p, t);
      p.lean = 0.4;
      p.knL = p.knR = 0.14;
      p.shR = 1.3 + 0.16 * Math.sin(t * 5);
      p.abR = 0.22 + 0.26 * Math.cos(t * 5);
      p.elR = 0.3;
      p.shL = 0.9;
      p.elL = 0.5;
      p.headPitch = 0.3;
      break;
    case 'handover':
      stand(p, t);
      p.shL = p.shR = 1.12 + 0.08 * Math.sin(t * 2.2);
      p.elL = p.elR = 0.38;
      p.abL = p.abR = 0.14;
      p.lean = 0.06;
      break;
    case 'carry':
      stand(p, t);
      p.shL = p.shR = 0.72;
      p.elL = p.elR = 1.2;
      p.abL = p.abR = 0.2;
      p.prop = 'tray';
      break;
    case 'push':
      stand(p, t);
      p.shL = p.shR = 0.95;
      p.elL = p.elR = 0.5;
      p.lean = 0.12;
      break;
    default:
      stand(p, t);
      p.lean = 0.02 + Math.sin(t * 1.6) * 0.012;
      p.shL = 0.05 + Math.sin(t * 0.9) * 0.03;
      p.shR = 0.05 - Math.sin(t * 0.9) * 0.03;
      p.abL = p.abR = 0.1;
      p.headYaw = Math.sin(t * 0.3) * 0.5;
      p.headPitch = Math.sin(t * 0.21) * 0.08;
  }
  return p;
}
