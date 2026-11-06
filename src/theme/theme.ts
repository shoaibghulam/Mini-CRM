import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

/**
 * Visual direction: a calm, flat work tool for site managers and foremen.
 * Teal carries identity and the primary action, orange marks "needs attention"
 * (rework), red is reserved for destructive actions. Filled buttons use shade 7
 * so white text stays above 4.5:1 (teal-7 5.47:1, orange-7 5.18:1, red-7 6.47:1).
 */
const teal: MantineColorsTuple = [
  '#F0FDFA', '#CCFBF1', '#99F6E4', '#5EEAD4', '#2DD4BF',
  '#14B8A6', '#0D9488', '#0F766E', '#115E59', '#134E4A',
];

const ember: MantineColorsTuple = [
  '#FFF7ED', '#FFEDD5', '#FED7AA', '#FDBA74', '#FB923C',
  '#F97316', '#EA580C', '#C2410C', '#9A3412', '#7C2D12',
];

const red: MantineColorsTuple = [
  '#FEF2F2', '#FEE2E2', '#FECACA', '#FCA5A5', '#F87171',
  '#EF4444', '#DC2626', '#B91C1C', '#991B1B', '#7F1D1D',
];

/** Cool slate dark scale: 0 text, 2 dimmed, 4 border, 6 inputs, 7 surfaces. */
const dark: MantineColorsTuple = [
  '#E6EAEE', '#C3CAD3', '#9AA4B1', '#6B7684', '#3A4552',
  '#2A333D', '#222A33', '#1A2027', '#12161B', '#0B0E11',
];

const FONT_STACK = "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: { light: 7, dark: 7 },
  colors: { teal, ember, red, dark },
  black: '#111827',
  fontFamily: FONT_STACK,
  respectReducedMotion: true,
  cursorType: 'pointer',
  focusRing: 'auto',
  defaultRadius: 'md',
  radius: { xs: '0.25rem', sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
  spacing: { xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  headings: {
    fontFamily: FONT_STACK,
    fontWeight: '650',
    textWrap: 'pretty',
    sizes: {
      h1: { fontSize: '1.625rem', lineHeight: '1.25' },
      h2: { fontSize: '1.25rem', lineHeight: '1.3' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.35' },
    },
  },
  components: {
    Button: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm' }, styles: { label: { textTransform: 'none', letterSpacing: 0 } } },
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.55, blur: 2 } } },
    Menu: { defaultProps: { radius: 'md', shadow: 'md', position: 'bottom-end' } },
    Tooltip: { defaultProps: { openDelay: 400, withArrow: true } },
    Notification: { defaultProps: { radius: 'md' } },
  },
});

/** Overrides Mantine's low-contrast defaults (gray-6 dimmed is 3.3:1 on white). */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#FFFFFF',
    '--mantine-color-text': '#111827',
    '--mantine-color-dimmed': '#556171',
    '--mantine-color-default-border': '#D5DBE1',
  },
  dark: {
    '--mantine-color-body': 'var(--mantine-color-dark-7)',
    '--mantine-color-dimmed': 'var(--mantine-color-dark-2)',
  },
});
