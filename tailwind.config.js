/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OpenClaw 品牌色
        claw: {
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#ffccc7',
          300: '#ffa8a0',
          400: '#ff7a6b',
          500: '#f94d3a',  // 主色 - 龙虾红
          600: '#e63024',
          700: '#c1241a',
          800: '#a02119',
          900: '#84221c',
          950: '#480d09',
        },
        // 语义化颜色 - 引用 CSS 变量
        surface: {
          app: 'var(--bg-app)',
          sidebar: 'var(--bg-sidebar)',
          card: 'var(--bg-card)',
          'card-hover': 'var(--bg-card-hover)',
          input: 'var(--bg-input)',
          elevated: 'var(--bg-elevated)',
          overlay: 'var(--bg-overlay)',
          code: 'var(--bg-code)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-inverse)',
        },
        edge: {
          DEFAULT: 'var(--border-primary)',
          secondary: 'var(--border-secondary)',
        },
        // 深色主题背景（保留兼容）
        dark: {
          900: '#0a0a0b',
          800: '#111113',
          700: '#1a1a1d',
          600: '#242428',
          500: '#2e2e33',
          400: '#3d3d44',
        },
        // 强调色
        accent: {
          cyan: '#22d3ee',
          purple: '#a78bfa',
          green: '#4ade80',
          amber: '#fbbf24',
        }
      },
      fontFamily: {
        sans: [
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'JetBrains Mono',
          'Fira Code',
          'Menlo',
          'monospace',
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(249, 77, 58, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(249, 77, 58, 0.8)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      boxShadow: {
        'glow-claw': '0 0 30px rgba(249, 77, 58, 0.3)',
        'glow-cyan': '0 0 30px rgba(34, 211, 238, 0.3)',
        'glow-green': '0 0 30px rgba(74, 222, 128, 0.3)',
        'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        'card': 'var(--shadow-card)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
