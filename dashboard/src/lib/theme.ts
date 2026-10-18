/**
 * Chart colors (hex mirrors of the CSS tokens in index.css). Series 1/2 are
 * validated as a pair against the dark surface (CVD ΔE 26.8, contrast ≥ 3:1).
 * Status colors are reserved for state and always ship with an icon + label.
 */
export const color = {
  page: '#0d0d0d',
  surface: '#1a1a19',
  grid: '#2c2c2a',
  axis: '#383835',
  ink: '#f0efec',
  ink2: '#c3c2b7',
  muted: '#898781',
  series1: '#3987e5',
  series2: '#d95926',
  negative: '#e66767', // diverging pole opposite series1 (rewards below zero)
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

export const axisTick = { fill: color.muted, fontSize: 11 }

export const ease = [0.22, 1, 0.36, 1] as const
