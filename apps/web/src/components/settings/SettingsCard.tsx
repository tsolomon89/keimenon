'use client';

import { useState } from 'react';
import { RotateCcw, Info, Lock, AlertCircle } from 'lucide-react';
import {
  SettingControl,
  EffectiveSettingValue,
  ConfigScope,
} from '@canvas-memory/types/src/settings';

interface SettingsCardProps {
  control: SettingControl;
  effectiveValue: EffectiveSettingValue;
  onChange: (value: any) => void;
  onReset?: () => void;
  disabled?: boolean;
  error?: string;
}

/**
 * SettingsCard Component
 *
 * Comprehensive settings control component supporting all control types:
 * - string, number, boolean, select, multiselect, color, slider, json
 *
 * Features:
 * - Effective value display
 * - Source tracking (defaults/org/workspace/role/user/view/component)
 * - Default value indicator
 * - Reset functionality
 * - Permission-based editing
 * - Inline validation
 * - Help text and descriptions
 */
export function SettingsCard({
  control,
  effectiveValue,
  onChange,
  onReset,
  disabled,
  error,
}: SettingsCardProps) {
  const [localValue, setLocalValue] = useState(effectiveValue.value);
  const [showHelp, setShowHelp] = useState(false);

  const handleChange = (newValue: any) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleReset = () => {
    if (onReset && effectiveValue.canReset) {
      onReset();
    }
  };

  const isEditable = effectiveValue.canEdit && !disabled;
  const showReset = effectiveValue.canReset && !effectiveValue.isDefault;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-200">{control.label}</h3>
            {control.required && (
              <span className="text-xs text-red-400">*</span>
            )}
            {!isEditable && (
              <Lock className="w-3 h-3 text-slate-500" />
            )}
          </div>
          {control.description && (
            <p className="text-xs text-slate-400">{control.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Help button */}
          {control.helpUrl && (
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-300 transition-colors"
              title="Show help"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          {/* Reset button */}
          {showReset && (
            <button
              onClick={handleReset}
              disabled={!isEditable}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset to default"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Help text */}
      {showHelp && control.helpUrl && (
        <div className="mb-4 px-3 py-2 bg-blue-600/10 border border-blue-500/30 rounded text-xs text-blue-300">
          <a
            href={control.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Learn more →
          </a>
        </div>
      )}

      {/* Control Input */}
      <div className="mb-3">
        {control.type === 'boolean' && (
          <BooleanControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
          />
        )}

        {control.type === 'string' && (
          <StringControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
            placeholder={control.placeholder}
            pattern={control.pattern}
          />
        )}

        {control.type === 'number' && (
          <NumberControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
            min={control.min}
            max={control.max}
            step={control.step}
            unit={control.unit}
          />
        )}

        {control.type === 'select' && control.options && (
          <SelectControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
            options={control.options}
          />
        )}

        {control.type === 'multiselect' && control.options && (
          <MultiSelectControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
            options={control.options}
          />
        )}

        {control.type === 'color' && (
          <ColorControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
          />
        )}

        {control.type === 'slider' && (
          <SliderControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
            min={control.min || 0}
            max={control.max || 100}
            step={control.step || 1}
            unit={control.unit}
          />
        )}

        {control.type === 'json' && (
          <JsonControl
            value={localValue}
            onChange={handleChange}
            disabled={!isEditable}
          />
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metadata footer */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-700">
        <div className="flex items-center gap-4">
          <span>
            Source: <span className="text-slate-400">{formatScope(effectiveValue.source)}</span>
          </span>
          {effectiveValue.isDefault && (
            <span className="px-2 py-0.5 bg-slate-700 rounded text-slate-400">Default</span>
          )}
        </div>
        {control.requiresRestart && (
          <span className="text-yellow-400">Requires restart</span>
        )}
      </div>
    </div>
  );
}

/**
 * Boolean Control (Toggle/Checkbox)
 */
function BooleanControl({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer"
      />
      <span className="text-sm text-slate-300">{value ? 'Enabled' : 'Disabled'}</span>
    </label>
  );
}

/**
 * String Control (Text input)
 */
function StringControl({
  value,
  onChange,
  disabled,
  placeholder,
  pattern,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  pattern?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      pattern={pattern}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    />
  );
}

/**
 * Number Control (Number input)
 */
function NumberControl({
  value,
  onChange,
  disabled,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
      {unit && <span className="text-sm text-slate-400">{unit}</span>}
    </div>
  );
}

/**
 * Select Control (Dropdown)
 */
function SelectControl({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  options: Array<{ value: string | number; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/**
 * MultiSelect Control (Checkbox list)
 */
function MultiSelectControl({
  value,
  onChange,
  disabled,
  options,
}: {
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
  disabled?: boolean;
  options: Array<{ value: string | number; label: string }>;
}) {
  const toggleOption = (optionValue: string | number) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggleOption(opt.value)}
            disabled={disabled}
            className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer"
          />
          <span className="text-sm text-slate-300">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Color Control (Color picker)
 */
function ColorControl({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-12 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        pattern="^#[0-9A-Fa-f]{6}$"
        placeholder="#000000"
        className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
    </div>
  );
}

/**
 * Slider Control (Range input)
 */
function SliderControl({
  value,
  onChange,
  disabled,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min: number;
  max: number;
  step: number;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          {value}
          {unit}
        </span>
        <span className="text-slate-500">
          {min}
          {unit} - {max}
          {unit}
        </span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
        style={{
          accentColor: 'rgb(147, 51, 234)', // purple-600
        }}
      />
    </div>
  );
}

/**
 * JSON Control (Textarea with validation)
 */
function JsonControl({
  value,
  onChange,
  disabled,
}: {
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}) {
  const [jsonString, setJsonString] = useState(JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonChange = (newJson: string) => {
    setJsonString(newJson);
    try {
      const parsed = JSON.parse(newJson);
      setJsonError(null);
      onChange(parsed);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={jsonString}
        onChange={(e) => handleJsonChange(e.target.value)}
        disabled={disabled}
        rows={6}
        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
      {jsonError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Invalid JSON: {jsonError}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Format scope for display
 */
function formatScope(scope: ConfigScope): string {
  const scopeNames: Record<ConfigScope, string> = {
    defaults: 'System Default',
    org: 'Organization',
    workspace: 'Workspace',
    role: 'Role',
    user: 'User',
    view: 'View',
    component: 'Component',
  };
  return scopeNames[scope] || scope;
}
