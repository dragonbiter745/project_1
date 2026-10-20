import { useState } from 'react';
import { cx } from '../../lib/format';

/** The Google photo when there is one (and it loads), else the first letter of the name. */
export function Avatar({ name, photoURL, size = 36, className }: { name: string; photoURL?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (photoURL && !broken) {
    return (
      <img
        src={photoURL}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={style}
        className={cx('shrink-0 rounded-full object-cover ring-2 ring-surface', className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={cx('grid shrink-0 place-items-center rounded-full bg-accent-tint font-semibold text-accent-ink ring-1 ring-inset ring-accent-line', className)}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
