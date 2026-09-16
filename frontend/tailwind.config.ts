import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#040b15',
        ocean: '#081d2a',
        glow: '#7ce7ff',
        accent: '#ff9f6e',
        mint: '#7ef0d8',
      },
    },
  },
  plugins: [],
}

export default config
