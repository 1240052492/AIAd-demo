/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0d0f12',
        panel: '#161a20',
        'panel-2': '#20262f',
        line: 'rgba(255,255,255,0.1)',
        text: '#f4f7fb',
        muted: '#a8b1c0',
        blue: '#4aa8ff',
        green: '#34d399',
        amber: '#f7b955',
        red: '#ff6b6b',
        border: 'rgba(255,255,255,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'Microsoft YaHei', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'pill': '9px',
        'btn': '12px'},
      },},
  plugins: [],
}
