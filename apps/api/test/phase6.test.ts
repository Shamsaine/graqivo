import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from '../../web/node_modules/react/index.js';
import { renderToStaticMarkup } from '../../web/node_modules/react-dom/server.node.js';
import { workspaceThemes, workspaceStyle } from '../../web/lib/themes';
import { Brand } from '../../web/components/brand';
import {
  WorkspaceNavigation,
  WorkspaceIdentity,
} from '../../web/components/workspace-chrome';
import { LoadingState, EmptyState } from '../../web/components/feedback-state';
import { ThemePicker } from '../../web/components/theme-picker';
import { AccountForm } from '../../web/components/account-form';
import Home from '../../web/app/page';
import RootLayout from '../../web/app/layout';
const render = (
  component: Parameters<typeof createElement>[0],
  props: object = {},
) => renderToStaticMarkup(createElement(component, props));
function luminance(hex: string) {
  const rgb = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('Phase 6 brand and accessible presentation contracts', () => {
  it('uses readable theme accents against white and selected-navigation surfaces', () => {
    for (const theme of Object.values(workspaceThemes)) {
      expect(contrast(theme.accent, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.accent, theme.tint)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#64748b', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#cbd5e1', '#0f172a')).toBeGreaterThanOrEqual(4.5);
    expect(workspaceStyle('unknown')).toEqual(workspaceStyle('indigo'));
  });
  it('renders the same navigation and privilege boundaries across workspace pages', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER'] as const) {
      const html = render(WorkspaceNavigation, {
        slug: 'test-workspace',
        current: 'registry',
        role,
      });
      for (const path of [
        'overview',
        'projects',
        'registry',
        'people',
        'reviews',
        'activity',
      ])
        expect(html).toContain('/app/test-workspace/' + path);
      expect(html.includes('/admin')).toBe(role !== 'MEMBER');
      expect(html.includes('/settings')).toBe(role === 'OWNER');
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toContain('aria-label="Workspace"');
    }
  });
  it('labels the brand and workspace identity without duplicating decorative image text', () => {
    const brand = render(Brand);
    expect(brand).toContain('aria-label="Graqivo home"');
    expect(brand).toContain('alt=""');
    expect(render(Brand, { light: true })).toContain('/brand/mark-white.svg');
    const identity = render(WorkspaceIdentity, {
      organization: { name: 'A & B', workspaceType: 'ORGANIZATION' },
      role: 'MEMBER',
    });
    expect(identity).toContain('<h1>A &amp; B</h1>');
    expect(identity).not.toContain('undefined');
  });
  it('provides registration and sign-in plus all required product context on the public landing page', () => {
    const html = render(Home);
    expect(html).toContain('Your organization’s work shouldn’t be');
    for (const section of [
      'Connect',
      'Understand',
      'Coordinate',
      'One resource registry',
      'Clear reviews and decisions',
      'For organizations',
      'For individuals',
      'Create your account',
    ])
      expect(html).toContain(section);
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('View development progress');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Main navigation"');
  });
  it('provides announced loading and actionable empty states', () => {
    const loading = render(LoadingState, { label: 'Loading reviews…' });
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('Loading reviews…');
    const empty = render(EmptyState, {
      title: 'No projects',
      description: 'Connect your first project',
      action: { label: 'Create project', href: '/app/demo/projects' },
    });
    expect(empty).toContain('href="/app/demo/projects"');
    expect(empty).toContain('Create project');
  });
  it('keeps every theme a labeled native radio choice with exactly one selected option', () => {
    const html = render(ThemePicker, { initial: 'teal' });
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain('<legend>Workspace theme</legend>');
    expect(html).toMatch(
      /name="theme"[^>]*checked=""[^>]*value="teal"|name="theme"[^>]*value="teal"[^>]*checked=""/,
    );
    for (const theme of Object.values(workspaceThemes))
      expect(html).toContain(theme.label);
  });
  it('retains accessible authentication labels and a focusable skip-link target', () => {
    for (const mode of ['register', 'login', 'forgot', 'reset'] as const) {
      const html = render(AccountForm, { mode });
      expect(html).toContain('id="main"');
      expect(html).toContain('tabindex="-1"');
      if (mode !== 'reset') expect(html).toContain('for="email"');
      if (mode !== 'forgot') expect(html).toContain('for="password"');
    }
    const html = render(RootLayout, {
      children: createElement('main', { id: 'main' }, 'Content'),
    });
    expect(html).toContain('href="#main"');
    expect(html).toContain('lang="en"');
  });
  it('ships real local font and icon assets with a redistribution license', () => {
    const font = readFileSync(
      new URL('../../web/public/fonts/InterVariable.woff2', import.meta.url),
    );
    expect(font.subarray(0, 4).toString()).toBe('wOF2');
    expect(font.length).toBeGreaterThan(10000);
    expect(
      readFileSync(
        new URL('../../web/public/fonts/Inter-LICENSE.txt', import.meta.url),
        'utf8',
      ),
    ).toContain('SIL OPEN FONT LICENSE');
    for (const path of ['apple-icon.png', 'brand/app-icon.png'])
      expect(
        readFileSync(new URL('../../web/public/' + path, import.meta.url))
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      ).toBe(true);
  });
});
