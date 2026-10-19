import type { ExternalToast } from 'sonner';

// Toasts only follow a diner action, so Sonner stays out of the initial bundle. The
// Toaster mounts on idle; a toast requested earlier mounts it first and waits.
type SonnerModule = typeof import('sonner');

let sonnerModule: Promise<SonnerModule> | null = null;
let mountToaster: (() => void) | null = null;
let markMounted: () => void = () => {};
const mounted = new Promise<void>((resolve) => {
  markMounted = resolve;
});

export const loadSonner = (): Promise<SonnerModule> => (sonnerModule ??= import('sonner'));

export function registerToasterMount(mount: () => void): void {
  mountToaster = mount;
}

export function toasterMounted(): void {
  markMounted();
}

async function ready(): Promise<SonnerModule> {
  mountToaster?.();
  const [module] = await Promise.all([loadSonner(), mounted]);
  return module;
}

export function notify(message: string, options?: ExternalToast): void {
  void ready().then(({ toast }) => toast(message, options));
}

export function notifyError(message: string, options?: ExternalToast): void {
  void ready().then(({ toast }) => toast.error(message, options));
}
