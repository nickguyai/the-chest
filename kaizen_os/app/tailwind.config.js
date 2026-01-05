/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: '#8B9467',
          light: 'rgba(139, 148, 103, 0.1)',
          lighter: 'rgba(139, 148, 103, 0.05)',
          border: 'rgba(139, 148, 103, 0.2)',
          'border-light': 'rgba(139, 148, 103, 0.08)',
        },
        zen: {
          bg: '#F5F1EB',
          card: 'rgba(254, 254, 254, 0.95)',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
