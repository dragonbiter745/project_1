import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { toasterMounted } from '../../lib/toast';

// Top-center keeps toasts clear of the cart bar and the thumb zone.
export default function SonnerToaster() {
  useEffect(() => {
    toasterMounted();
  }, []);

  return (
    <Toaster
      position="top-center"
      gap={8}
      visibleToasts={3}
      mobileOffset={{ top: 'max(12px, env(safe-area-inset-top))' }}
      toastOptions={{
        duration: 4000,
        style: { fontFamily: 'inherit' },
        classNames: {
          toast: '!rounded-card !border-line !bg-surface !text-ink !shadow-float !gap-3 !px-4 !py-3.5',
          title: '!text-base !font-semibold !leading-snug',
          description: '!text-sm !text-ink-3',
          actionButton: '!h-9 !rounded-full !bg-ink !px-3.5 !text-sm !font-semibold !text-white',
          error: '[&_[data-icon]]:!text-danger',
          success: '[&_[data-icon]]:!text-ready',
        },
      }}
    />
  );
}
