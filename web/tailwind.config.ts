import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Tokens are defined in src/styles/globals.css, derived from DESIGN.md (Binance).
// Dark is the default canvas; light is a token swap on <html class="dark">, never a second design.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          active: 'hsl(var(--primary-active))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--info-foreground))' },
        reserved: {
          DEFAULT: 'hsl(var(--reserved))',
          foreground: 'hsl(var(--reserved-foreground))',
        },
      },
      // DESIGN.md radius scale: buttons md, inputs/cards lg, elevated containers xl.
      borderRadius: { sm: '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // BinancePlex substitute for prices, quantities and stat counters.
        num: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      // DESIGN.md hierarchy: display-sm 32/600, title-md 20/600, title-sm 16/600, caption 12/500.
      fontSize: {
        display: ['2rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '0' }],
        h2: ['1.25rem', { lineHeight: '1.35', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.4', fontWeight: '600' }],
        small: ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
      },
      // Flat surfaces: the only shadow left is a faint lift for floating layers.
      boxShadow: { lg: '0 4px 16px -4px hsl(var(--shadow) / 0.25)' },
      keyframes: {
        'flash-success': { '0%,100%': { opacity: '0' }, '20%': { opacity: '0.2' } },
        'flash-error': { '0%,100%': { opacity: '0' }, '20%': { opacity: '0.25' } },
        'scan-line': { '0%': { top: '8%' }, '100%': { top: '92%' } },
      },
      animation: {
        'flash-success': 'flash-success 300ms ease-out',
        'flash-error': 'flash-error 300ms ease-out',
        'scan-line': 'scan-line 1.8s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [animate],
} satisfies Config
