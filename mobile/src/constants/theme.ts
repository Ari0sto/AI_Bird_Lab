export const COLORS = {
  background: '#F1F5F1',
  surface: '#FFFFFF',

  dark: '#102B2C',
  darkCard: '#173638',
  textOnDark: '#D9EBE6',

  primary: '#197D60',
  primaryPressed: '#12624B',
  accent: '#72E0AD',

  text: '#203334',
  heading: '#193B37',
  textSecondary: '#789087',
  textMuted: '#8CA19A',

  border: '#E1E9E2',
  uploadBackground: '#F7FBF7',
  uploadBorder: '#B6D5C7',

  success: '#13835B',
  danger: '#B34242',

  white: '#FFFFFF',
};

export const Colors = {
  light: {
    text: COLORS.text,
    textSecondary: COLORS.textSecondary,

    background: COLORS.background,
    backgroundElement: COLORS.surface,
    backgroundSelected: '#E2F4E8',

    tint: COLORS.primary,
    icon: COLORS.textSecondary,

    tabIconDefault: COLORS.textMuted,
    tabIconSelected: COLORS.primary,
  },

  dark: {
    text: COLORS.white,
    textSecondary: COLORS.textOnDark,

    background: COLORS.dark,
    backgroundElement: COLORS.darkCard,
    backgroundSelected: '#28514B',

    tint: COLORS.accent,
    icon: COLORS.textOnDark,

    tabIconDefault: COLORS.textMuted,
    tabIconSelected: COLORS.accent,
  },
};

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = {
  sans: 'System',
  serif: 'serif',
  rounded: 'sans-serif-medium',
  mono: 'monospace',
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
};

export const MaxContentWidth = 960;

export const BottomTabInset = 64;