export { formatClock } from '../store/sim';

export const waitLabel = (min: number | null) => (min === null ? 'Settling in' : `${Math.max(1, Math.round(min))} min`);
