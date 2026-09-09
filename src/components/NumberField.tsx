import { useEffect, useState } from 'react';
import { formatNumber, parseLocaleNumber } from '../lib/number';

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  className?: string;
}

/** Accepts either a dot or a Norwegian decimal comma ("8,5" parses as 8.5). */
export function NumberField({ label, value, onChange, suffix, className }: NumberFieldProps) {
  const [text, setText] = useState(() => formatNumber(value));

  // Only resync from the prop when it diverges from what the current text
  // already parses to — otherwise a value round-tripped straight back from
  // the parent on every keystroke would erase an in-progress "8," before
  // the user gets to type the digit after the comma.
  useEffect(() => {
    setText((prev) => (parseLocaleNumber(prev) === value ? prev : formatNumber(value)));
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);
    const parsed = parseLocaleNumber(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  }

  return (
    <label className={className}>
      <span className="block text-ink-tertiary text-[11px] mb-1">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          className="w-full bg-panel-raised border border-line rounded px-2 py-1.5 text-sm font-mono tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setText(formatNumber(value))}
        />
        {suffix && <span className="text-ink-tertiary text-xs">{suffix}</span>}
      </div>
    </label>
  );
}
