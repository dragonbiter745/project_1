// Menu category names in seed data carry decorative symbols ("⭐ Featured Specials").
export const cleanLabel = (name: string): string => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export const pluralize = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');
