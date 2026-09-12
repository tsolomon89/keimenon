'use client';

import React from 'react';
import { Text } from './Text';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

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

export interface BaseFieldProps {
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

export interface FieldOwnProps extends BaseFieldProps {
  type: FieldType;
  value?: any;
  onChange?: (value: any) => void;
  placeholder?: string;
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ label: string; value: any; description?: string }>;
  allowCustom?: boolean;
  className?: string;
}

export type FieldProps<C extends React.ElementType = 'div'> = PolymorphicComponentPropsWithRef<
  C,
  FieldOwnProps
>;

/**
 * Field Primitive - Unified form field renderer
 */
export const Field: PolymorphicForwardRef<'div', FieldOwnProps> = React.forwardRef(
  (
    {
      label,
      hint,
      error,
      disabled,
      mode = 'edit',
      as,
      type,
      value,
      onChange,
      placeholder,
      pattern,
      min,
      max,
      step,
      unit,
      options,
      allowCustom,
      className,
      ...props
    }: any,
    ref: any
  ) => {
    const Component = as || 'div';
    const fieldProps: any = {
      label,
      hint,
      error,
      disabled,
      mode,
      type,
      value,
      onChange,
      placeholder,
      pattern,
      min,
      max,
      step,
      unit,
      options,
      allowCustom,
    };

    // Read-only mode: just display the value
    if (mode === 'read') {
      return (
        <Component className={`space-y-1 ${className || ''}`.trim()} ref={ref} {...props}>
          {label && <Text role="label">{label}</Text>}
          <div className="text-sm text-white">{renderReadOnlyValue(fieldProps)}</div>
          {hint && (
            <Text role="hint" mode="muted">
              {hint}
            </Text>
          )}
        </Component>
      );
    }

    // Edit mode: render appropriate control
    return (
      <Component className={`space-y-2 ${className || ''}`.trim()} ref={ref} {...props}>
        {label && <Text role="label">{label}</Text>}
        {renderControl(fieldProps)}
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
      </Component>
    );
  }
) as any;

Field.displayName = 'Field';

/**
 * Render read-only value display
 */
function renderReadOnlyValue(props: any): React.ReactNode {
  const { type, value, unit } = props;

  if (value === undefined || value === null) {
    return <span className="text-slate-500 italic">Not set</span>;
  }

  switch (type) {
    case 'boolean':
      return value ? 'Enabled' : 'Disabled';
    case 'color':
      return (
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded border border-slate-600"
            style={{ backgroundColor: value }}
          />
          <span>{value}</span>
        </div>
      );
    case 'multiselect':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'json':
      return (
        <pre className="font-mono text-xs bg-slate-900 p-2 rounded">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    default:
      return `${value}${unit ? ` ${unit}` : ''}`;
  }
}

/**
 * Render control based on type
 */
function renderControl(props: any): React.ReactNode {
  const { type, ...controlProps } = props;

  switch (type) {
    case 'boolean':
      return <BooleanControl {...controlProps} />;
    case 'string':
      return <StringControl {...controlProps} />;
    case 'number':
      return <NumberControl {...controlProps} />;
    case 'select':
      return <SelectControl {...controlProps} />;
    case 'multiselect':
      return <MultiSelectControl {...controlProps} />;
    case 'color':
      return <ColorControl {...controlProps} />;
    case 'slider':
      return <SliderControl {...controlProps} />;
    case 'json':
      return <JsonControl {...controlProps} />;
    default:
      return null;
  }
}

function BooleanControl({ value, onChange, disabled }: any) {
  return (
    <label className="flex items-center space-x-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
      />
      <Text role="value">{value ? 'Enabled' : 'Disabled'}</Text>
    </label>
  );
}

function StringControl({ value, onChange, placeholder, pattern, disabled }: any) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      pattern={pattern}
      disabled={disabled}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    />
  );
}

function NumberControl({ value, onChange, min, max, step, placeholder, disabled }: any) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value === '' ? undefined : Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    />
  );
}

function SelectControl({ value, onChange, options = [], disabled }: any) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value} className="bg-slate-900">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectControl({ value = [], onChange, options = [], disabled }: any) {
  const handleToggle = (optValue: any) => {
    const current = Array.isArray(value) ? value : [];
    const next = current.includes(optValue)
      ? current.filter((v: any) => v !== optValue)
      : [...current, optValue];
    onChange?.(next);
  };

  return (
    <div className="space-y-2">
      {options.map((opt: any) => (
        <label key={opt.value} className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Array.isArray(value) && value.includes(opt.value)}
            onChange={() => handleToggle(opt.value)}
            disabled={disabled}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
          />
          <span className="text-sm text-slate-300">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function ColorControl({ value, onChange, disabled }: any) {
  return (
    <div className="flex items-center space-x-3">
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className="w-10 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50"
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        disabled={disabled}
        className="w-32 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />
    </div>
  );
}

function SliderControl({ value, onChange, min = 0, max = 100, step = 1, unit, disabled }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
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
          accentColor: 'rgb(147, 51, 234)',
        }}
      />
    </div>
  );
}

function JsonControl({ value, onChange, disabled }: any) {
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
