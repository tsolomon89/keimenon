'use client';

import React from 'react';
import { Text } from './Text';

/**
 * Field Types - Extracted from SettingsCard.tsx lines 121-196
 * All 8 control types from the existing implementation
 */
export type FieldType =
  | 'boolean' // Toggle/checkbox
  | 'string' // Text input
  | 'number' // Number input
  | 'select' // Dropdown
  | 'multiselect' // Checkbox list
  | 'color' // Color picker
  | 'slider' // Range input
  | 'json'; // JSON textarea

/**
 * Field Mode - Read-only vs editable
 */
export type FieldMode = 'read' | 'edit';

interface BaseFieldProps {
  /** Label for the field */
  label?: string;

  /** Helper text */
  hint?: string;

  /** Error message */
  error?: string;

  /** Disabled state */
  disabled?: boolean;

  /** Mode (read-only or editable) */
  mode?: FieldMode;
}

interface BooleanFieldProps extends BaseFieldProps {
  type: 'boolean';
  value: boolean;
  onChange?: (value: boolean) => void;
}

interface StringFieldProps extends BaseFieldProps {
  type: 'string';
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  pattern?: string;
}

interface NumberFieldProps extends BaseFieldProps {
  type: 'number';
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

interface SelectFieldProps extends BaseFieldProps {
  type: 'select';
  value: string | number;
  onChange?: (value: string | number) => void;
  options: Array<{ value: string | number; label: string }>;
}

interface MultiSelectFieldProps extends BaseFieldProps {
  type: 'multiselect';
  value: (string | number)[];
  onChange?: (value: (string | number)[]) => void;
  options: Array<{ value: string | number; label: string }>;
}

interface ColorFieldProps extends BaseFieldProps {
  type: 'color';
  value: string;
  onChange?: (value: string) => void;
}

interface SliderFieldProps extends BaseFieldProps {
  type: 'slider';
  value: number;
  onChange?: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface JsonFieldProps extends BaseFieldProps {
  type: 'json';
  value: any;
  onChange?: (value: any) => void;
}

export type FieldProps =
  | BooleanFieldProps
  | StringFieldProps
  | NumberFieldProps
  | SelectFieldProps
  | MultiSelectFieldProps
  | ColorFieldProps
  | SliderFieldProps
  | JsonFieldProps;

/**
 * Field Primitive - Universal form control
 *
 * Features:
 * - Automatic read/edit mode switching
 * - Inline validation
 * - Consistent styling across all types
 * - Error state handling
 */
export function Field(props: FieldProps) {
  const { label, hint, error, disabled, mode = 'edit' } = props;

  // Read-only mode: just display the value
  if (mode === 'read') {
    return (
      <div className="space-y-1">
        {label && <Text role="label">{label}</Text>}
        <div className="text-sm text-white">{renderReadOnlyValue(props)}</div>
        {hint && (
          <Text role="hint" mode="muted">
            {hint}
          </Text>
        )}
      </div>
    );
  }

  // Edit mode: render appropriate control
  return (
    <div className="space-y-2">
      {label && <Text role="label">{label}</Text>}
      {renderControl(props)}
      {error && (
        <Text role="hint" mode="error">
          {error}
        </Text>
      )}
      {!error && hint && (
        <Text role="hint" mode="muted">
          {hint}
        </Text>
      )}
    </div>
  );
}

/**
 * Render read-only value display
 */
function renderReadOnlyValue(props: FieldProps): React.ReactNode {
  switch (props.type) {
    case 'boolean':
      return props.value ? 'Enabled' : 'Disabled';
    case 'string':
      return props.value || '—';
    case 'number':
      return `${props.value}${props.unit || ''}`;
    case 'select':
      const selectedOption = props.options.find((o) => o.value === props.value);
      return selectedOption?.label || props.value;
    case 'multiselect':
      return props.value.length > 0 ? props.value.join(', ') : '—';
    case 'color':
      return (
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded border border-slate-700"
            style={{ backgroundColor: props.value }}
          />
          <span>{props.value}</span>
        </div>
      );
    case 'slider':
      return `${props.value}${props.unit || ''}`;
    case 'json':
      return (
        <pre className="text-xs font-mono text-slate-300">
          {JSON.stringify(props.value, null, 2)}
        </pre>
      );
    default:
      return '—';
  }
}

/**
 * Render editable control
 */
function renderControl(props: FieldProps): React.ReactNode {
  switch (props.type) {
    case 'boolean':
      return <BooleanControl {...props} />;
    case 'string':
      return <StringControl {...props} />;
    case 'number':
      return <NumberControl {...props} />;
    case 'select':
      return <SelectControl {...props} />;
    case 'multiselect':
      return <MultiSelectControl {...props} />;
    case 'color':
      return <ColorControl {...props} />;
    case 'slider':
      return <SliderControl {...props} />;
    case 'json':
      return <JsonControl {...props} />;
    default:
      return null;
  }
}

// Control components

function BooleanControl({ value, onChange, disabled }: BooleanFieldProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer"
      />
      <Text role="value" mode="muted">
        {value ? 'Enabled' : 'Disabled'}
      </Text>
    </label>
  );
}

function StringControl({ value, onChange, disabled, placeholder, pattern }: StringFieldProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      pattern={pattern}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    />
  );
}

function NumberControl({ value, onChange, disabled, min, max, step, unit }: NumberFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
      {unit && (
        <Text role="value" mode="muted">
          {unit}
        </Text>
      )}
    </div>
  );
}

function SelectControl({ value, onChange, disabled, options }: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
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

function MultiSelectControl({ value, onChange, disabled, options }: MultiSelectFieldProps) {
  const toggleOption = (optionValue: string | number) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange?.(newValue);
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
          <Text role="value" mode="muted">
            {opt.label}
          </Text>
        </label>
      ))}
    </div>
  );
}

function ColorControl({ value, onChange, disabled }: ColorFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className="w-12 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        pattern="^#[0-9A-Fa-f]{6}$"
        placeholder="#000000"
        className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
    </div>
  );
}

function SliderControl({ value, onChange, disabled, min, max, step, unit }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Text role="value" mode="muted">
          {value}
          {unit}
        </Text>
        <Text role="hint">
          {min}
          {unit} - {max}
          {unit}
        </Text>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
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

function JsonControl({ value, onChange, disabled }: JsonFieldProps) {
  const [jsonString, setJsonString] = React.useState(JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  const handleJsonChange = (newJson: string) => {
    setJsonString(newJson);
    try {
      const parsed = JSON.parse(newJson);
      setJsonError(null);
      onChange?.(parsed);
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
        <Text role="hint" mode="error">
          Invalid JSON: {jsonError}
        </Text>
      )}
    </div>
  );
}
