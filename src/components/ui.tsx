import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { InsightLevel } from '../analysis';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="actions">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Chip input with suggestions. Enter or comma adds; suggestions are clickable. */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  showSuggestions = true,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  showSuggestions?: boolean;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const add = (t: string) => {
    const s = t.trim();
    if (s && !value.includes(s)) onChange([...value, s]);
    setText('');
  };
  const remaining = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {value.length > 0 && (
        <div className="chips">
          {value.map((v) => (
            <span className="chip" key={v}>
              {v}
              <button type="button" className="x" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        list={listId}
        value={text}
        placeholder={placeholder ?? 'Type and press Enter'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {remaining.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {showSuggestions && remaining.length > 0 && (
        <div className="chips">
          {remaining.slice(0, 14).map((s) => (
            <button type="button" className="chip" key={s} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_TEXT: Record<InsightLevel, string> = { important: 'Look at this', notable: 'Worth noting', info: 'FYI' };
const LEVEL_ICON: Record<InsightLevel, string> = { important: '●', notable: '▲', info: 'i' };

export function LevelBadge({ level }: { level: InsightLevel }) {
  return (
    <span className={`badge ${level}`}>
      <span aria-hidden>{LEVEL_ICON[level]}</span>
      {LEVEL_TEXT[level]}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 10, step = 1, label }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <label className="field">
      <span className="row between">
        <span>{label}</span>
        <b className="tabnum" style={{ color: 'var(--ink)' }}>{value ?? '–'}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(v));
  }, [key, v]);
  return [v, setV] as const;
}
