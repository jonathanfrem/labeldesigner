import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#141517',
        panel: '#1a1c1f',
        'panel-raised': '#212327',
        line: '#2c2f34',
        'line-strong': '#3a3d43',
        ink: '#e7e7e5',
        'ink-secondary': '#8b8d92',
        'ink-tertiary': '#5c5e63',
        paper: '#fafaf8',
        mat: '#6e7075',
        accent: '#5b8def',
        warn: '#d99a3d',
        danger: '#cc4b6b',
      },
    },
  },
  plugins: [],
} satisfies Config;
