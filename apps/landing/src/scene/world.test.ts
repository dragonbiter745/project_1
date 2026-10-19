import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHOPS } from '../data/shops';
import { staticWorld } from './buildWorld';

// Materials are created from canvas textures (browser only); their names are checked from source
// so a typo in a builder fails here instead of crashing the scene at runtime.
function declaredMaterials(): Set<string> {
  const src = readFileSync(fileURLToPath(new URL('./materials.ts', import.meta.url)), 'utf8');
  const keys = new Set([...src.matchAll(/m\.set\(\s*'([^']+)'/g)].map((m) => m[1]!));
  for (const s of SHOPS) keys.add(`lacquer:${s.id}`).add(`trim:${s.id}`);
  return keys;
}

describe('static world', () => {
  const world = staticWorld();

  it('only uses materials that exist', () => {
    const known = declaredMaterials();
    const unknown = world.meshes.map((m) => m.key).filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
  });

  it('merges into a small number of draw calls with valid geometry', () => {
    expect(world.meshes.length).toBeLessThan(90);
    for (const { key, geometry } of world.meshes) {
      const pos = geometry.attributes.position!;
      expect(pos.count, key).toBeGreaterThan(0);
      expect(geometry.attributes.normal, key).toBeDefined();
      expect(geometry.attributes.uv, key).toBeDefined();
      const arr = pos.array as Float32Array;
      expect(arr.every(Number.isFinite), `${key} has NaN vertices`).toBe(true);
    }
  });

  it('gives every hot kitchen its animated fire or steam', () => {
    expect(world.fx).toHaveLength(SHOPS.length);
    for (const { shopId, fx } of world.fx) {
      if (SHOPS.find((s) => s.id === shopId)!.equipment === 'juice') continue; // cold kitchen
      expect(fx.flames.length + fx.steam.length, shopId).toBeGreaterThan(0);
    }
  });
});
