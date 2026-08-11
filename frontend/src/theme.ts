export const theme = {
  color: {
    surface: '#F9FAFB',
    onSurface: '#111827',
    surfaceSecondary: '#FFFFFF',
    onSurfaceSecondary: '#1F2937',
    surfaceTertiary: '#F3F4F6',
    onSurfaceTertiary: '#374151',
    surfaceInverse: '#1F2937',
    onSurfaceInverse: '#F9FAFB',
    brand: '#111827',
    brandPrimary: '#111827',
    onBrandPrimary: '#FFFFFF',
    brandSecondary: '#4B5563',
    onBrandSecondary: '#FFFFFF',
    brandTertiary: '#E5E7EB',
    onBrandTertiary: '#111827',
    success: '#059669',
    onSuccess: '#FFFFFF',
    warning: '#D97706',
    onWarning: '#FFFFFF',
    error: '#DC2626',
    onError: '#FFFFFF',
    border: '#E5E7EB',
    borderStrong: '#D1D5DB',
    divider: '#F3F4F6',
    profit: '#059669',
    loss: '#DC2626',
    muted: '#6B7280',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: {
    text: 'System',
    num: 'System',
  },
} as const;

export type Theme = typeof theme;

export function inr(n: number | null | undefined, opts: { showZero?: boolean } = {}): string {
  const v = Number(n ?? 0);
  if (!v && !opts.showZero) return '₹0';
  const isNeg = v < 0;
  const abs = Math.abs(Math.round(v));
  const s = abs.toString();
  // Indian grouping: 1,23,456
  let last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  if (rest) {
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    last3 = ',' + last3;
  }
  return `${isNeg ? '-' : ''}₹${rest}${last3}`;
}

export function inrCompact(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  if (abs >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${(v / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return inr(v);
}
