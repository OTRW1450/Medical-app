import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fmtDate, fromTime } from '../lib/dates';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Point {
  t: number;
  v: number;
  label?: string;
}
export interface Series {
  id: string;
  label: string;
  color: string;
  points: Point[];
  dashed?: boolean;
}
export interface Marker {
  t: number;
  label: string;
  color?: string;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

export function timeTicks(t0: number, t1: number, width: number): { t: number; label: string }[] {
  const days = (t1 - t0) / 86_400_000;
  const maxTicks = Math.max(2, Math.floor(width / 80));
  const out: { t: number; label: string }[] = [];
  if (days > 600) {
    const y0 = new Date(t0).getUTCFullYear();
    const y1 = new Date(t1).getUTCFullYear();
    const step = Math.max(1, Math.ceil((y1 - y0 + 1) / maxTicks));
    for (let y = y0; y <= y1 + 1; y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t >= t0 && t <= t1) out.push({ t, label: String(y) });
    }
  } else {
    const d = new Date(t0);
    const step = Math.max(1, Math.ceil(days / 30 / maxTicks));
    for (let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); m <= t1; ) {
      if (m >= t0) out.push({ t: m, label: fmtDate(fromTime(m), 'month') });
      const md = new Date(m);
      m = Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + step, 1);
    }
  }
  return out;
}

/** Line chart with optional reference band, event markers and a hover crosshair. One y-axis only. */
export function LineChart({
  series,
  height = 220,
  yMin,
  yMax,
  band,
  markers = [],
  yLabel,
  domain,
  showPoints,
}: {
  series: Series[];
  height?: number;
  yMin?: number;
  yMax?: number;
  band?: { lo?: number; hi?: number };
  markers?: Marker[];
  yLabel?: string;
  domain?: [number, number];
  showPoints?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  const pad = { l: 38, r: 12, t: 10, b: 24 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const ts = all.map((p) => p.t);
  const t0 = domain?.[0] ?? Math.min(...ts, ...markers.map((m) => m.t));
  const t1 = domain?.[1] ?? Math.max(...ts, ...markers.map((m) => m.t));
  const vs = all.map((p) => p.v).concat(band?.lo ?? [], band?.hi ?? []);
  let lo = yMin ?? Math.min(...vs);
  let hi = yMax ?? Math.max(...vs);
  if (yMin === undefined || yMax === undefined) {
    const padV = (hi - lo || Math.abs(hi) || 1) * 0.12;
    if (yMin === undefined) lo -= padV;
    if (yMax === undefined) hi += padV;
  }
  const x = (t: number) => pad.l + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const yt = niceTicks(lo, hi, 4);
  const xt = timeTicks(t0, t1, iw);
  if (!all.length) return <div className="faint" style={{ padding: 20 }}>No data to chart yet.</div>;

  const hovered =
    hover === null
      ? null
      : series
          .map((s) => {
            let best: Point | undefined;
            for (const p of s.points) if (!best || Math.abs(p.t - hover) < Math.abs(best.t - hover)) best = p;
            return best ? { s, p: best } : undefined;
          })
          .filter((x): x is { s: Series; p: Point } => !!x && Math.abs(x.p.t - hover) < (t1 - t0) / 20 + 86_400_000 * 2);

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        className="chart"
        width={width}
        height={height}
        role="img"
        aria-label={`Line chart of ${series.map((s) => s.label).join(', ')}`}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - r.left;
          if (px < pad.l || px > width - pad.r) return setHover(null);
          setHover(t0 + ((px - pad.l) / iw) * (t1 - t0));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <g className="grid">
          {yt.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="tabnum">
                {v}
              </text>
            </g>
          ))}
        </g>
        {band && (band.lo !== undefined || band.hi !== undefined) && (
          <rect
            x={pad.l}
            width={iw}
            y={y(Math.min(band.hi ?? hi, hi))}
            height={Math.max(0, y(Math.max(band.lo ?? lo, lo)) - y(Math.min(band.hi ?? hi, hi)))}
            fill="var(--good)"
            opacity={0.09}
          />
        )}
        <line className="axis" x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
        {xt.map((tk) => (
          <text key={tk.t} x={x(tk.t)} y={height - 6} textAnchor="middle">
            {tk.label}
          </text>
        ))}
        {yLabel && (
          <text x={4} y={pad.t + 2} textAnchor="start" dominantBaseline="hanging">
            {yLabel}
          </text>
        )}
        {markers.map((m, i) => (
          <g key={i}>
            <line x1={x(m.t)} x2={x(m.t)} y1={pad.t} y2={pad.t + ih} stroke={m.color ?? 'var(--muted)'} strokeDasharray="3 3" strokeWidth={1.5} />
            <text x={x(m.t) + 3} y={pad.t + 10 + (i % 3) * 12} style={{ fill: 'var(--ink-2)' }}>
              {m.label}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.t - b.t);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />
              {(showPoints || pts.length < 40) &&
                pts.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          );
        })}
        {hovered && hovered.length > 0 && (
          <g pointerEvents="none">
            <line x1={x(hovered[0].p.t)} x2={x(hovered[0].p.t)} y1={pad.t} y2={pad.t + ih} stroke="var(--axis)" />
            {hovered.map(({ s, p }) => (
              <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hovered && hovered.length > 0 && (
        <div className="tooltip" style={{ left: Math.min(x(hovered[0].p.t) + 12, width - 200), top: 8 }}>
          <div className="faint">{fmtDate(fromTime(hovered[0].p.t))}</div>
          {hovered.map(({ s, p }) => (
            <div key={s.id} className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: s.color }} />
              <span>{s.label}</span>
              <b className="tabnum" style={{ marginLeft: 'auto' }}>
                {p.label ?? p.v}
              </b>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.id}>
              <span className="dot" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Swimlane timeline ----------------

export interface LaneItem {
  id: string;
  lane: string;
  start: number;
  end?: number;
  label: string;
  color: string;
  detail?: ReactNode;
  important?: boolean;
  /** Draw as a ring only (e.g. suspected/ruled-out) */
  hollow?: boolean;
}

export function Swimlane({
  lanes,
  items,
  domain,
  onSelect,
  heat,
}: {
  lanes: { key: string; label: string }[];
  items: LaneItem[];
  domain: [number, number];
  onSelect?: (item: LaneItem) => void;
  /** Optional monthly heat strip (e.g. mean pain), values 0-10 */
  heat?: { label: string; cells: { t0: number; t1: number; v: number; n: number }[] };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ item: LaneItem; x: number; y: number } | null>(null);
  const labelW = 120;
  const pad = { r: 16, t: 8, b: 26 };
  const iw = width - labelW - pad.r;
  const [t0, t1] = domain;
  const x = (t: number) => labelW + Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1))) * iw;

  // Stack overlapping ranged items into sub-rows within a lane.
  const layout = useMemo(() => {
    const rowsByLane = new Map<string, { item: LaneItem; row: number }[]>();
    for (const lane of lanes) {
      const its = items.filter((i) => i.lane === lane.key).sort((a, b) => a.start - b.start);
      const rowEnds: number[] = [];
      const placed: { item: LaneItem; row: number }[] = [];
      for (const it of its) {
        const sx = x(it.start);
        const ex = Math.max(x(it.end ?? it.start) , sx + 10);
        let r = rowEnds.findIndex((e) => e + 3 < sx);
        if (r < 0) {
          r = rowEnds.length;
          rowEnds.push(ex);
        } else rowEnds[r] = ex;
        placed.push({ item: it, row: Math.min(r, 5) });
      }
      rowsByLane.set(lane.key, placed);
    }
    return rowsByLane;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, items, t0, t1, width]);

  const ROW = 14;
  let yCursor = pad.t;
  const laneY: { key: string; label: string; y: number; h: number }[] = [];
  if (heat) {
    laneY.push({ key: '__heat', label: heat.label, y: yCursor, h: 22 });
    yCursor += 26;
  }
  for (const l of lanes) {
    const rows = Math.max(1, ...(layout.get(l.key) ?? []).map((p) => p.row + 1));
    const h = 10 + rows * ROW;
    laneY.push({ key: l.key, label: l.label, y: yCursor, h });
    yCursor += h + 4;
  }
  const height = yCursor + pad.b;
  const ticks = timeTicks(t0, t1, iw);

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Timeline of medical history by category">
        <g className="grid">
          {ticks.map((tk) => (
            <line key={tk.t} x1={x(tk.t)} x2={x(tk.t)} y1={pad.t} y2={height - pad.b} />
          ))}
        </g>
        {laneY.map((l, i) => (
          <g key={l.key}>
            {i > 0 && <line x1={0} x2={width - pad.r} y1={l.y - 2} y2={l.y - 2} stroke="var(--grid)" />}
            <text className="swimlane-label" x={0} y={l.y + l.h / 2 + 4}>
              {l.label}
            </text>
          </g>
        ))}
        {heat &&
          heat.cells.map((c, i) => {
            const v = Math.max(0, Math.min(10, c.v));
            return (
              <rect
                key={i}
                x={x(c.t0)}
                y={laneY[0].y + 2}
                width={Math.max(2, x(c.t1) - x(c.t0) - 1)}
                height={18}
                rx={2}
                fill={`color-mix(in srgb, var(--s8) ${15 + v * 8.5}%, var(--surface-2))`}
                onMouseEnter={(e) =>
                  setHover({
                    item: { id: 'h' + i, lane: '', start: c.t0, label: `Avg pain ${v.toFixed(1)}/10`, color: 'var(--s8)', detail: `${c.n} logged days` },
                    x: e.nativeEvent.offsetX,
                    y: laneY[0].y,
                  })
                }
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        {laneY
          .filter((l) => l.key !== '__heat')
          .map((l) =>
            (layout.get(l.key) ?? []).map(({ item, row }) => {
              const cy = l.y + 5 + row * ROW + ROW / 2;
              const sx = x(item.start);
              const common = {
                style: { cursor: onSelect ? 'pointer' : 'default' },
                onClick: () => onSelect?.(item),
                onMouseEnter: () => setHover({ item, x: sx, y: cy }),
                onMouseLeave: () => setHover(null),
              };
              if (item.end !== undefined && x(item.end) - sx > 8) {
                return (
                  <g key={item.id} {...common}>
                    <rect x={sx} y={cy - 4} width={x(item.end) - sx} height={8} rx={4} fill={item.color} opacity={item.hollow ? 0.35 : 0.85} />
                    <rect x={sx} y={cy - 8} width={x(item.end) - sx} height={16} fill="transparent" />
                  </g>
                );
              }
              return (
                <g key={item.id} {...common}>
                  <circle cx={sx} cy={cy} r={12} fill="transparent" />
                  <circle
                    cx={sx}
                    cy={cy}
                    r={item.important ? 6 : 4.5}
                    fill={item.hollow ? 'var(--surface)' : item.color}
                    stroke={item.hollow ? item.color : 'var(--surface)'}
                    strokeWidth={2}
                  />
                </g>
              );
            }),
          )}
        <line className="axis" x1={labelW} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} />
        {ticks.map((tk) => (
          <text key={tk.t} x={x(tk.t)} y={height - 8} textAnchor="middle">
            {tk.label}
          </text>
        ))}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 300), top: hover.y + 12 }}>
          <div className="faint">
            {fmtDate(fromTime(hover.item.start))}
            {hover.item.end ? ` → ${fmtDate(fromTime(hover.item.end))}` : ''}
          </div>
          <b>{hover.item.label}</b>
          {hover.item.detail && <div className="muted">{hover.item.detail}</div>}
        </div>
      )}
    </div>
  );
}

export function BarList({ rows, max, color = 'var(--s1)' }: { rows: { label: string; value: number; sub?: string }[]; max?: number; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${r.value}`}>
          <div className="row between" style={{ fontSize: 13 }}>
            <span>{r.label}</span>
            <span className="tabnum muted">{r.sub ?? r.value}</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4 }}>
            <div style={{ width: `${(r.value / m) * 100}%`, height: 8, background: color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
