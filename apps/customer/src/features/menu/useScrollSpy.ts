import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/format';

export const sectionDomId = (categoryId: string) => `section-${categoryId}`;
export const MENU_END_ID = 'menu-end';
const ID_PREFIX = 'section-';

// The active section is whichever one crosses a 1px line just under the sticky header
// (sections are contiguous). Above the first section the first is active; once the page
// bottom is reached the last is, since short final sections never reach the line.
export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const jumpTarget = useRef<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    setActive((current) => (ids.includes(current) ? current : ids[0] ?? ''));
    const elements = ids
      .map((id) => document.getElementById(sectionDomId(id)))
      .filter((el): el is HTMLElement => el !== null);
    const end = document.getElementById(MENU_END_ID);
    if (elements.length === 0) return;

    const firstId = ids[0]!;
    const lastId = ids[ids.length - 1]!;
    const lineY =
      Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-h')) || 0) + 16;
    const onLine = new Set<string>();
    let atBottom = false;

    const resolve = () => {
      let next: string;
      if (atBottom) next = lastId;
      else {
        const crossing = elements.find((el) => onLine.has(el.id));
        if (crossing) next = crossing.id.slice(ID_PREFIX.length);
        else next = elements[0]!.getBoundingClientRect().top > lineY ? firstId : lastId;
      }
      if (jumpTarget.current) {
        if (next !== jumpTarget.current) return;
        jumpTarget.current = null;
      }
      setActive(next);
    };

    const lineObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLine.add(entry.target.id);
          else onLine.delete(entry.target.id);
        }
        resolve();
      },
      { rootMargin: `-${lineY}px 0px -${Math.max(0, window.innerHeight - lineY - 1)}px 0px` }
    );
    elements.forEach((el) => lineObserver.observe(el));

    const endObserver = new IntersectionObserver((entries) => {
      atBottom = entries.some((e) => e.isIntersecting);
      resolve();
    });
    if (end) endObserver.observe(end);

    return () => {
      lineObserver.disconnect();
      endObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(sectionDomId(id));
    if (!el) return;
    setActive(id);
    jumpTarget.current = id;
    // If the target can't reach the line (page bottom), keep the tapped chip and unlock.
    window.setTimeout(() => {
      if (jumpTarget.current === id) jumpTarget.current = null;
    }, 1000);

    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const target = el.getBoundingClientRect().top + window.scrollY - margin;
    const distance = target - window.scrollY;

    if (prefersReducedMotion()) {
      window.scrollTo({ top: target, behavior: 'instant' });
      return;
    }
    // Long jumps snap most of the way so the glide stays short, keeping the tap feeling instant.
    if (Math.abs(distance) > window.innerHeight * 1.5) {
      window.scrollTo({ top: target - Math.sign(distance) * window.innerHeight * 0.5, behavior: 'instant' });
    }
    window.scrollTo({ top: target, behavior: 'smooth' });
  }, []);

  return { active, jumpTo };
}
