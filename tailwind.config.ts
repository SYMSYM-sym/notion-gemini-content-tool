import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#f6f7f6',
          100: '#e3e7e3',
          200: '#c6cfc6',
          300: '#a3b0a3',
          400: '#7d8f7d',
          500: '#627462',
          600: '#4d5c4d',
          700: '#404b40',
          800: '#363e36',
          900: '#2e342e',
        },
        blush: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f4a9b8',
          400: '#ec7a93',
          500: '#df4f71',
          600: '#cc2f5a',
          700: '#ab2149',
          800: '#8f1e41',
          900: '#7a1d3c',
        },
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
