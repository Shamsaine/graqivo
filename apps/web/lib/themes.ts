import type { CSSProperties } from 'react';
export const workspaceThemes = {
  indigo: { label: 'Indigo', accent: '#4338ca', tint: '#eef2ff' },
  purple: { label: 'Purple', accent: '#6d28d9', tint: '#f5f3ff' },
  teal: { label: 'Teal', accent: '#0f766e', tint: '#f0fdfa' },
  blue: { label: 'Blue', accent: '#1d4ed8', tint: '#eff6ff' },
  rose: { label: 'Rose', accent: '#be123c', tint: '#fff1f2' },
} as const;
export function workspaceStyle(name?: string): CSSProperties {
  const theme =
    workspaceThemes[name as keyof typeof workspaceThemes] ??
    workspaceThemes.indigo;
  return {
    '--workspace-accent': theme.accent,
    '--workspace-tint': theme.tint,
  } as CSSProperties;
}
