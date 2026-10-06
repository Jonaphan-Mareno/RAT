/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    borderRadius: {
      none: '0px',
      full: '9999px',
      DEFAULT: '0px',
    },
    extend: {
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        bau: {
          red: '#D02020',
          'red-dark': '#E24A4A',
          blue: '#1040C0',
          'blue-dark': '#5C82E8',
          yellow: '#F0C020',
          canvas: '#F0F0F0',
          'canvas-dark': '#121212',
          surface: '#FFFFFF',
          'surface-dark': '#1B1B1B',
          ink: '#121212',
          'ink-light': '#F0F0F0',
          muted: '#E0E0E0',
          'muted-dark': '#2A2A2A',
          success: '#0B7A3B',
          warn: '#B45309',
        },
      },
      boxShadow: {
        'hard-sm': '3px 3px 0 0 #121212',
        hard: '4px 4px 0 0 #121212',
        'hard-lg': '8px 8px 0 0 #121212',
        'hard-sm-light': '3px 3px 0 0 #F0F0F0',
        'hard-light': '4px 4px 0 0 #F0F0F0',
        'hard-lg-light': '8px 8px 0 0 #F0F0F0',
        'hard-yellow': '4px 4px 0 0 #F0C020',
        'hard-blue': '4px 4px 0 0 #1040C0',
        'hard-red': '4px 4px 0 0 #D02020',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-out',
      },
      lineHeight: {
        tight: '0.95',
      },
    },
  },
  plugins: [],
};
