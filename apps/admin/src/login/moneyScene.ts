import {
  AmbientLight,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { DENOMINATIONS, drawCoinEdge, drawCoinFace, drawNoteBack, drawNoteFront, fontsReady } from './currency';

// The login's money: rupee notes and ₹10 coins drifting around the sign-in card. Each piece rides
// a spring along one path: 0 is its resting spot, 1 is swirling just in front of the screen while
// the password is checked, 2 is past the camera. Signing in pushes everything to 2 ("out of the
// screen"); a wrong password springs everything back to 0.

export interface MoneyScene {
  /** Sign-in started: the money lifts and swirls toward the viewer. */
  launch(): void;
  /** Sign-in failed: the money flows back to where it was. */
  fail(): void;
  /** Signed in: the money rushes out past the screen. Resolves when it has gone. */
  land(): Promise<void>;
  dispose(): void;
}

const CAM_Z = 10;
const FOV = 40;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
/** The sign-in card sits on this plane; money behind it is hidden by it. */
const CARD_Z = 2;
const NOTE = { w: 1.6, h: 0.7 };

interface Piece {
  mesh: number;
  slot: number;
  home: Vector3;
  gatherR: number;
  gatherA: number;
  gatherZ: number;
  exit: Vector3;
  base: Euler;
  spinRate: number;
  /** Extra turns over the whole flight, so pieces tumble as they travel and untumble coming back. */
  flight: number;
  phase: number;
  swirl: number;
  p: number;
  v: number;
  target: number;
  next: number;
  at: number;
}

const halfHeightAt = (z: number) => (CAM_Z - z) * TAN;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function roundedRect(w: number, h: number, r: number): ShapeGeometry {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new ShapeGeometry(s, 6);
}

function texture(c: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export async function createMoneyScene(canvas: HTMLCanvasElement, card: () => HTMLElement | null): Promise<MoneyScene> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 640;
  await fontsReady();

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 60);
  camera.position.set(0, 0, CAM_Z);
  scene.add(new AmbientLight(0xffffff, 0.9));
  scene.add(new HemisphereLight(0xfff4e8, 0xd9c2b0, 0.8));
  const sun = new DirectionalLight(0xffe2c4, 1.7);
  sun.position.set(-4, 6, 8);
  scene.add(sun);

  const disposables: Array<BufferGeometry | Material | Texture> = [];
  const keep = <T extends BufferGeometry | Material | Texture>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Notes flutter in the vertex shader: a travelling wave plus a slight curl, with normals to match
  // so the light glints across the paper. Each instance gets its own phase from gl_InstanceID.
  const shared = { uTime: { value: 0 } };
  const noteMaterial = (front: Texture, back: Texture) => {
    const m = keep(new MeshStandardMaterial({ map: front, side: DoubleSide, roughness: 0.82, metalness: 0 }));
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uBack = { value: back };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <beginnormal_vertex>',
          `float fPh = float(gl_InstanceID) * 1.618;
          float fA = position.x * 2.4 + uTime * 3.2 + fPh;
          float fB = position.y * 3.0 + uTime * 2.1 + fPh * 0.7;
          vec3 objectNormal = normalize(vec3(-(cos(fA) * 0.144 + position.x * 0.12), -(cos(fB) * 0.075), 1.0));`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position);\ntransformed.z += sin(fA) * 0.06 + sin(fB) * 0.025 + position.x * position.x * 0.06;');
      // The back face shows the back of the note, mirrored so it reads the right way round.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uBack;')
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D(map, vMapUv) : texture2D(uBack, vec2(1.0 - vMapUv.x, vMapUv.y));
            diffuseColor *= sampledDiffuseColor;
          #endif`
        );
    };
    return m;
  };

  const noteCount = reduced ? (small ? 14 : 24) : small ? 30 : 52;
  const coinCount = reduced ? (small ? 4 : 8) : small ? 10 : 16;
  const noteGeo = keep(new PlaneGeometry(NOTE.w, NOTE.h, 14, 5));
  const coinGeo = keep(new CylinderGeometry(0.3, 0.3, 0.05, 40, 1));
  coinGeo.rotateX(Math.PI / 2);

  const counts = DENOMINATIONS.map((d) => Math.max(2, Math.round(noteCount * d.weight)));
  const group = new Group();
  scene.add(group);
  const meshes: InstancedMesh[] = DENOMINATIONS.map((d, i) => {
    const mat = noteMaterial(keep(texture(drawNoteFront(d), aniso)), keep(texture(drawNoteBack(d), aniso)));
    return new InstancedMesh(noteGeo, mat, counts[i]!);
  });
  const face = keep(texture(drawCoinFace(), aniso));
  const edge = keep(texture(drawCoinEdge(), aniso));
  edge.wrapS = RepeatWrapping;
  edge.repeat.set(6, 1);
  const coinSide = keep(new MeshStandardMaterial({ map: edge, metalness: 0.55, roughness: 0.35 }));
  const coinFace = keep(new MeshStandardMaterial({ map: face, metalness: 0.45, roughness: 0.32 }));
  meshes.push(new InstancedMesh(coinGeo, [coinSide, coinFace, coinFace], coinCount));
  for (const m of meshes) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    group.add(m);
  }

  // Depth-only stand-in for the sign-in card: money behind it disappears behind the card, money in
  // front of it passes over the card.
  const occluderMat = keep(new MeshBasicMaterial({ colorWrite: false }));
  const occluder = new Mesh(roundedRect(1, 1, 0.1), occluderMat);
  occluder.renderOrder = -1;
  occluder.position.z = CARD_Z;
  scene.add(occluder);
  let cardSize = { w: 0, h: 0 };

  const pieces: Piece[] = [];
  meshes.forEach((m, mesh) => {
    for (let slot = 0; slot < m.count; slot++) {
      pieces.push({
        mesh,
        slot,
        home: new Vector3(),
        gatherR: rand(0.35, 0.95),
        gatherA: rand(0, Math.PI * 2),
        gatherZ: rand(CARD_Z + 1.2, 6),
        exit: new Vector3(),
        base: new Euler(rand(-0.9, 0.9), rand(0, Math.PI * 2), rand(-0.6, 0.6)),
        spinRate: rand(-0.35, 0.35),
        flight: rand(Math.PI * 1.5, Math.PI * 3.5) * (Math.random() > 0.5 ? 1 : -1),
        phase: rand(0, Math.PI * 2),
        swirl: Math.random() > 0.5 ? 1 : -1,
        p: 0,
        v: 0,
        target: 0,
        next: 0,
        at: 0,
      });
    }
  });

  const px = { w: innerWidth, h: innerHeight };
  /** Screen pixels to world units on the plane at depth z. */
  const toWorld = (x: number, y: number, z: number, out = new Vector3()) => {
    const k = (2 * halfHeightAt(z)) / px.h;
    return out.set((x - px.w / 2) * k, -(y - px.h / 2) * k, z);
  };

  // Resting spots: anywhere behind the card plane (the card hides what is behind it), or in front of
  // it only where the piece would not cover the card.
  const placeHomes = () => {
    const rect = card()?.getBoundingClientRect();
    for (const piece of pieces) {
      let placed = false;
      for (let tries = 0; tries < 30 && !placed; tries++) {
        const front = Math.random() < 0.45;
        const z = front ? rand(CARD_Z + 0.5, 3.6) : rand(-7, CARD_Z - 0.6);
        const x = rand(-0.05, 1.05) * px.w;
        const y = rand(-0.05, 1.05) * px.h;
        if (front && rect) {
          const pad = (NOTE.w * 0.55 * px.h) / (2 * halfHeightAt(z));
          if (x > rect.left - pad && x < rect.right + pad && y > rect.top - pad && y < rect.bottom + pad) continue;
        }
        toWorld(x, y, z, piece.home);
        placed = true;
      }
      if (!placed) toWorld(rand(0, px.w), rand(0, px.h), rand(-7, CARD_Z - 0.8), piece.home);
      // Out of the screen: past the camera, fanned out so pieces brush past the edges and through the middle.
      const a = rand(0, Math.PI * 2);
      const spread = rand(0.2, 2.6);
      piece.exit.set(Math.cos(a) * spread * Math.min(px.w / px.h, 1.6), Math.sin(a) * spread, CAM_Z + rand(0.5, 3));
    }
  };

  // Follows the card every frame, so the hiding stays exact through its entrance and shake.
  const syncCard = () => {
    const el = card();
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - cardSize.w) > 0.5 || Math.abs(r.height - cardSize.h) > 0.5) {
      cardSize = { w: r.width, h: r.height };
      const k = (2 * halfHeightAt(CARD_Z)) / px.h;
      occluder.geometry.dispose();
      occluder.geometry = roundedRect(r.width * k, r.height * k, 28 * k);
    }
    toWorld(r.left + r.width / 2, r.top + r.height / 2, CARD_Z, occluder.position);
  };

  const resize = () => {
    px.w = innerWidth;
    px.h = innerHeight;
    renderer.setSize(px.w, px.h, false);
    camera.aspect = px.w / px.h;
    camera.updateProjectionMatrix();
    cardSize = { w: 0, h: 0 };
    placeHomes();
  };
  resize();

  const pointer = { x: 0, y: 0 };
  const onPointer = (ev: PointerEvent) => {
    pointer.x = (ev.clientX / px.w) * 2 - 1;
    pointer.y = (ev.clientY / px.h) * 2 - 1;
  };
  addEventListener('resize', resize);
  addEventListener('pointermove', onPointer, { passive: true });

  let t = rand(0, 20);
  let clock = 0;
  let spring = { k: 26, c: 9 };
  const m4 = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const one = new Vector3(1, 1, 1);
  const g = new Vector3();
  const ctrl = new Vector3();

  const place = (piece: Piece) => {
    const p = piece.p;
    // Swirling spot in front of the screen, orbiting the middle while sign-in is checked.
    const hh = halfHeightAt(piece.gatherZ);
    const a = piece.gatherA + t * 0.9 * piece.swirl;
    g.set(Math.cos(a) * piece.gatherR * hh * Math.min(camera.aspect, 1.5), Math.sin(a) * piece.gatherR * hh * 0.8, piece.gatherZ);
    // Idle bob around the resting spot.
    const h = piece.home;
    const hx = h.x + Math.sin(t * 0.42 + piece.phase) * 0.28;
    const hy = h.y + Math.sin(t * 0.55 + piece.phase * 1.3) * 0.36;
    const hz = h.z + Math.sin(t * 0.31 + piece.phase) * 0.2;
    if (p <= 1) {
      // Curved path home → swirl: the control point bows sideways so the money flows rather than slides.
      ctrl.set((hx + g.x) / 2 - (g.y - hy) * 0.35 * piece.swirl, (hy + g.y) / 2 + (g.x - hx) * 0.35 * piece.swirl, (hz + g.z) / 2 + 1.2);
      const u = 1 - p;
      pos.set(u * u * hx + 2 * u * p * ctrl.x + p * p * g.x, u * u * hy + 2 * u * p * ctrl.y + p * p * g.y, u * u * hz + 2 * u * p * ctrl.z + p * p * g.z);
    } else {
      const s = Math.pow(p - 1, 1.6);
      pos.set(g.x + (piece.exit.x - g.x) * s, g.y + (piece.exit.y - g.y) * s, g.z + (piece.exit.z - g.z) * s);
    }
    const b = piece.base;
    const fl = piece.flight * Math.min(p, 2);
    e.set(b.x + Math.sin(t * 0.6 + piece.phase) * 0.55 + fl * 0.45, b.y + t * piece.spinRate + fl, b.z + Math.sin(t * 0.4 + piece.phase) * 0.35 + fl * 0.2);
    q.setFromEuler(e);
    m4.compose(pos, q, one);
    meshes[piece.mesh]!.setMatrixAt(piece.slot, m4);
  };

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    clock += dt;
    if (!reduced) t += dt;
    shared.uTime.value = t;
    syncCard();
    if (!reduced) {
      group.rotation.y += (pointer.x * 0.1 - group.rotation.y) * 0.04;
      group.rotation.x += (pointer.y * 0.06 - group.rotation.x) * 0.04;
    }
    for (const piece of pieces) {
      if (clock >= piece.at) piece.target = piece.next;
      if (!reduced) {
        piece.v += ((piece.target - piece.p) * spring.k - piece.v * spring.c) * dt;
        piece.p += piece.v * dt;
      }
      place(piece);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  /** Sends every piece toward `to`, one after another in a shuffled order so the money flows. */
  const send = (to: number, stagger: number, k: number, c: number) => {
    spring = { k, c };
    const order = [...pieces].sort(() => Math.random() - 0.5);
    order.forEach((piece, i) => {
      piece.next = to;
      piece.at = clock + i * stagger;
    });
  };

  let disposed = false;
  return {
    launch: () => send(1, 0.75 / pieces.length, 24, 8.5),
    fail: () => send(0, 0.35 / pieces.length, 30, 7.5),
    land: () =>
      new Promise<void>((resolve) => {
        if (reduced || disposed) return resolve();
        send(2.15, 0.45 / pieces.length, 28, 9);
        // Once the money is in front of the card, stop hiding what is behind it.
        setTimeout(() => (occluder.visible = false), 180);
        const started = performance.now();
        const check = () => {
          if (disposed || pieces.every((p) => p.p > 1.95) || performance.now() - started > 1700) return resolve();
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onPointer);
      occluder.geometry.dispose();
      for (const m of meshes) m.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
