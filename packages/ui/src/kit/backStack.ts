import { useEffect, useRef } from 'react';

// Each open layer (sheet, search) owns one history entry, so the Android back gesture
// closes the top layer instead of leaving the app.
interface Layer {
  close: () => void;
}

const stack: Layer[] = [];
let ignorePops = 0;
let listening = false;

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  stack.pop()?.close();
}

export function useBackDismiss(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const layer: Layer = { close: () => closeRef.current() };
    let pushed = false;
    const push = () => {
      if (pushed) return;
      pushed = true;
      stack.push(layer);
      window.history.pushState({ fcLayer: stack.length }, '');
    };
    // Chrome makes the back button skip a page that pushed history without a tap (the tracking
    // sheet opens itself once payment confirms), which would exit the app. Wait for a tap instead.
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) {
      window.addEventListener('pointerdown', push, { capture: true, once: true });
      window.addEventListener('keydown', push, { capture: true, once: true });
    } else {
      push();
    }
    return () => {
      window.removeEventListener('pointerdown', push, { capture: true });
      window.removeEventListener('keydown', push, { capture: true });
      if (!pushed) return;
      const index = stack.indexOf(layer);
      if (index === -1) return; // already removed by a back gesture
      stack.splice(index, 1);
      ignorePops++;
      window.history.back();
    };
  }, [open]);
}
