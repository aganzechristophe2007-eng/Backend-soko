/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#FF6B00', hover: '#E85F00', soft: '#FFF1E7' },
        soko: { green: '#10B981' },
      },
    },
  },
  plugins: [],
}
