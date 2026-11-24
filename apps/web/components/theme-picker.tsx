'use client';
import { useState } from 'react';
import { workspaceStyle, workspaceThemes } from '../lib/themes';
export function ThemePicker({
  initial,
  disabled = false,
}: {
  initial: string;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(
    initial in workspaceThemes ? initial : 'indigo',
  );
  return (
    <fieldset className="theme-picker" disabled={disabled}>
      <legend>Workspace theme</legend>
      <div className="theme-options">
        {Object.entries(workspaceThemes).map(([key, theme]) => (
          <label
            key={key}
            className={
              selected === key ? 'theme-option selected' : 'theme-option'
            }
          >
            <input
              type="radio"
              name="theme"
              value={key}
              checked={selected === key}
              onChange={() => setSelected(key)}
            />
            <span
              className="theme-color"
              style={{ background: theme.accent }}
              aria-hidden="true"
            />
            <span>{theme.label}</span>
          </label>
        ))}
      </div>
      <div className="theme-preview" style={workspaceStyle(selected)}>
        <span>Preview</span>
        <strong>Your workspace</strong>
        <div>
          <span className="preview-active">Overview</span>
          <span>Projects</span>
          <span>Registry</span>
        </div>
      </div>
    </fieldset>
  );
}
