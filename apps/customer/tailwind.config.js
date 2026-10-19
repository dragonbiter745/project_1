const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        accent: {
          DEFAULT: token('accent'),
          ink: token('accent-ink'),
          tint: token('accent-tint'),
          line: token('accent-line'),
        },
        veg: token('veg'),
        nonveg: token('nonveg'),
        ready: { DEFAULT: token('ready'), tint: token('ready-tint') },
        prep: { DEFAULT: token('prep'), tint: token('prep-tint') },
        danger: { DEFAULT: token('danger'), tint: token('danger-tint') },
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['15px', { lineHeight: '21px' }],
        md: ['16px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '23px' }],
        xl: ['20px', { lineHeight: '26px' }],
        '2xl': ['24px', { lineHeight: '30px' }],
        '3xl': ['30px', { lineHeight: '34px' }],
      },
      borderRadius: {
        field: '12px',
        card: '16px',
        sheet: '24px',
      },
      boxShadow: {
        float: 'var(--shadow-float)',
        sheet: 'var(--shadow-sheet)',
        thumb: 'var(--shadow-thumb)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        drawer: 'var(--ease-drawer)',
      },
      zIndex: {
        header: '20',
        search: '25',
        float: '30',
        sheet: '40',
      },
    },
  },
  plugins: [],
};
