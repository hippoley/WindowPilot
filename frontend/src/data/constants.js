// Design tokens that mirror CSS variables for JS usage
export const COLORS = {
  accent: '#D4A574',
  accent2: '#C4956A',
  accent3: '#E8C99A',
  bg: '#0A0806',
  surface: 'rgba(255, 235, 200, 0.04)',
  glass: 'rgba(255, 235, 200, 0.07)',
  glassBorder: 'rgba(212, 165, 116, 0.12)',
  success: '#7EC8A0',
  warning: '#E8B86D',
  danger: '#E07070',
  text: '#F5ECD7',
  textSub: '#A89070',
  textMuted: '#5C4A35',
}

export const WS_URL = 'ws://' + (typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost') + ':8001/ws'
