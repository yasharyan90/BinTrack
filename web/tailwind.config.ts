import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Tokens are defined in src/styles/globals.css (UI/UX doc §2).
// Dark mode is a token swap on <html class="dark">, never a second design.
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
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--info-foreground))' },
        reserved: 'hsl(var(--reserved))',
      },
      borderRadius: { lg: '10px', md: '8px', sm: '6px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        small: ['0.75rem', { lineHeight: '1rem' }],
      },
      boxShadow: { lg: '0 8px 28px -6px hsl(var(--shadow) / 0.18)' },
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
