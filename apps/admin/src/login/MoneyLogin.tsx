import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { StaffLogin } from '@foodcourt/ui';
import { staffSignIn } from '@foodcourt/firebase-client/staff';
import type { MoneyScene } from './moneyScene';
import { playFailure, playLaunch, playSuccess, setSoundOn, soundOn } from './sound';

/**
 * The shop admin sign-in with 3D rupees around the card. `onHold(true)` keeps this screen up
 * after Firebase signs in, so the money can finish flying out before the earnings page appears.
 */
export default function MoneyLogin({ onHold }: { onHold: (holding: boolean) => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MoneyScene | null>(null);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [sound, setSound] = useState(soundOn);

  // three.js loads in its own chunk after the form is on screen; without WebGL the plain form stays.
  // Each scene gets its own canvas: a remount (or StrictMode's double effect) must never share a
  // WebGL context with a scene that is being disposed.
  useEffect(() => {
    let alive = true;
    let scene: MoneyScene | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'h-full w-full';
    layerRef.current?.appendChild(canvas);
    import('./moneyScene')
      .then(({ createMoneyScene }) => createMoneyScene(canvas, () => document.querySelector<HTMLElement>('[data-login-card]')))
      .then((s) => {
        if (!alive) return s.dispose();
        scene = s;
        sceneRef.current = s;
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      scene?.dispose();
      sceneRef.current = null;
      canvas.remove();
    };
  }, []);

  const submit = async (email: string, password: string) => {
    onHold(true);
    playLaunch();
    sceneRef.current?.launch();
    try {
      await staffSignIn(email, password);
    } catch (err) {
      playFailure();
      sceneRef.current?.fail();
      onHold(false);
      throw err;
    }
    playSuccess();
    setExiting(true);
    await sceneRef.current?.land();
    onHold(false);
  };

  const toggleSound = () => {
    setSoundOn(!sound);
    setSound(!sound);
  };

  return (
    <StaffLogin
      title="Shop admin"
      subtitle="Manage your menu, shop details and earnings. Use your shop's admin login, not the kitchen one."
      onSubmit={submit}
      exiting={exiting}
      corner={
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
          title={sound ? 'Sound on' : 'Sound off'}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.96]"
        >
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      }
      scene={
        <div
          ref={layerRef}
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 z-float transition-opacity duration-700 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      }
    />
  );
}
