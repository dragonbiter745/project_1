export { cx, prefersReducedMotion } from '@foodcourt/ui';

// Menu category names in seed data carry decorative symbols ("⭐ Featured Specials").
export const cleanLabel = (name: string): string => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export const pluralize = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;
