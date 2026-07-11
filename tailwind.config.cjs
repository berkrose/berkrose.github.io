module.exports = {
  content: ['./*.html', './*.js', './editor/server.js'],
  darkMode: 'class',
  theme: { extend: {
    colors: {
      'on-error-container': '#93000a', 'inverse-primary': '#c6c6c6', tertiary: '#000000', 'tertiary-fixed-dim': '#c6c6c6',
      'on-secondary-container': '#fffbff', 'primary-container': '#1b1b1b', 'tertiary-container': '#1a1c1c', outline: '#7e7576',
      'surface-container-highest': '#e2e2e2', 'on-surface': '#1a1c1c', 'outline-variant': '#cfc4c5', 'inverse-surface': '#2f3131',
      'secondary-container': 'var(--c-accent-strong)', surface: 'var(--c-surface)', 'on-tertiary-fixed': '#1a1c1c',
      'surface-container-lowest': '#ffffff', 'on-tertiary-container': '#838484', 'on-tertiary-fixed-variant': '#464747',
      'surface-variant': '#e2e2e2', 'on-secondary-fixed-variant': '#930010', 'primary-fixed': '#e2e2e2', 'on-background': '#1a1c1c',
      'on-secondary-fixed': '#410003', 'inverse-on-surface': '#f0f1f1', primary: '#000000', 'surface-tint': '#5e5e5e',
      'on-surface-variant': '#4c4546', 'on-primary-fixed': '#1b1b1b', 'surface-container-low': 'var(--c-surface-low)',
      secondary: 'var(--c-accent)', 'on-primary-fixed-variant': '#474747', 'surface-container': '#eeeeee',
      'surface-container-high': '#e8e8e8', 'secondary-fixed': '#ffdad6', 'tertiary-fixed': '#e3e2e2', 'surface-bright': '#f9f9f9',
      'on-secondary': '#ffffff', 'on-primary-container': '#848484', 'on-error': '#ffffff', error: '#ba1a1a', 'surface-dim': '#dadada',
      'primary-fixed-dim': '#c6c6c6', 'on-tertiary': '#ffffff', 'error-container': '#ffdad6',
      'secondary-fixed-dim': '#ffb3ac', background: 'var(--c-surface)', 'on-primary': '#ffffff'
    },
    borderRadius: { DEFAULT: '0px', lg: '0px', xl: '0px', full: '9999px' },
    fontFamily: { headline: ['var(--f-headline)'], body: ['var(--f-body)'], label: ['var(--f-label)'], quote: ['Cormorant Garamond', 'serif'] }
  } },
  plugins: [require('@tailwindcss/forms')]
};
