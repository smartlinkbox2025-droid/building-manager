/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { 600: '#0f766e', 800: '#134e4a' } },
      fontFamily: { arabic: ['Tahoma', 'Arial', 'sans-serif'] }
    }
  },
  plugins: []
}
