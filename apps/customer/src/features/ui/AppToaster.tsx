import { lazy, Suspense, useEffect, useState } from 'react';
import { registerToasterMount } from '../../lib/toast';

const SonnerToaster = lazy(() => import('./SonnerToaster'));

export function AppToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mount = () => setMounted(true);
    registerToasterMount(mount);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(mount, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(mount, 2000);
    return () => clearTimeout(t);
  }, []);

  return mounted ? (
    <Suspense fallback={null}>
      <SonnerToaster />
    </Suspense>
  ) : null;
}
