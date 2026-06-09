// mynclex/lib/programmes/form-controls.tsx
//
// Shared modal form controls used by the programme + cohort modals:
//   • <Segmented> — either/or choice as a pill toggle (replaces a
//     <select> for small enums like delivery mode / unit / currency).
//     Supports a `disabled` state (e.g. delivery mode is locked in
//     edit mode).
//   • <Switch> — on/off toggle (replaces a checkbox for show-price,
//     online checkout, allow-late-join).
//
// Presentational only; the owning modal holds the value + handles
// onChange. Styles live in styles/programmes.css (.prog-seg / .prog-switch).

'use client';

export type SegmentedOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={'prog-seg' + (disabled ? ' is-disabled' : '')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={'prog-switch' + (on ? ' is-on' : '')}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      disabled={disabled}
    />
  );
}
