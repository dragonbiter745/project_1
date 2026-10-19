export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
