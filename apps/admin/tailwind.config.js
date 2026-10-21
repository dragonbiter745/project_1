import preset from '../../packages/ui/src/kit/tailwind-preset.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx}', '../../packages/finance-ui/src/**/*.{js,ts,jsx,tsx}'],
};
