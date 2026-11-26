import type { CSSProperties } from 'react';

/** A category chip: its palette colour as the border, and a light tint of it behind the name. */
export function categoryChipStyle(colorIndex: number): CSSProperties {
  const color = `var(--color-category-${colorIndex + 1})`;
  return {
    borderColor: `color-mix(in srgb, ${color} 30%, var(--color-surface))`,
    background: `color-mix(in srgb, ${color} 14%, var(--color-surface))`,
  };
}
