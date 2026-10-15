/**
 * Gradient generation utilities for event cover images.
 * Produces Luma-style soft, blendable gradients.
 */

export interface GradientConfig {
  seed: string;
  colors: string[];
  angle: number;
}

const PALETTE = [
  // Soft pinks
  '#ff9a9e',
  '#fecfef',
  '#f6c0d0',
  // Lavenders
  '#a18cd1',
  '#c3a6e0',
  '#d4bbf0',
  // Peaches & warm oranges
  '#fad0c4',
  '#fbc2a2',
  '#f6d365',
  '#fda085',
  // Teals & mints
  '#84fab0',
  '#a1e3d8',
  '#96e6a1',
  // Sky blues
  '#a6c1ee',
  '#89c4f4',
  '#b8d0eb',
  // Warm yellows
  '#ffecd2',
  '#fcb69f',
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateGradientConfig(): GradientConfig {
  const colorCount = Math.random() < 0.5 ? 3 : 4;
  const colors = pickRandom(PALETTE, colorCount);
  const angle = Math.floor(Math.random() * 360);
  const seed = crypto.randomUUID();

  return { seed, colors, angle };
}

export function gradientConfigToCSS(config: GradientConfig): string {
  const { colors, angle } = config;
  const step = 100 / (colors.length - 1);
  const stops = colors
    .map((color, i) => `${color} ${Math.round(step * i)}%`)
    .join(', ');

  return `linear-gradient(${angle}deg, ${stops})`;
}

export function serializeGradient(config: GradientConfig): string {
  return 'gradient:' + JSON.stringify(config);
}

export function parseGradient(value: string): GradientConfig | null {
  if (!value.startsWith('gradient:')) return null;
  try {
    return JSON.parse(value.slice('gradient:'.length)) as GradientConfig;
  } catch {
    return null;
  }
}

export function isGradient(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('gradient:');
}
