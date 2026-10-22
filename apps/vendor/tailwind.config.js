import preset from '../../packages/ui/src/kit/tailwind-preset.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Geist Variable"', 'system-ui', 'sans-serif'],
      },
    },
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx}'],
};
