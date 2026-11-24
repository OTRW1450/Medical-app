// Clickable front/back body diagram. Patient's left is drawn on the viewer's
// right in the front view (as clinicians see it) and on the left in the back view.

type Shape = { region: string; d?: string; rect?: [number, number, number, number, number?]; ellipse?: [number, number, number, number] };

// Coordinates on a 120 x 300 figure.
function front(): Shape[] {
  return [
    { region: 'head', ellipse: [60, 22, 15, 17] },
    { region: 'face/jaw', ellipse: [60, 33, 9, 5] },
    { region: 'neck', rect: [52, 39, 16, 10, 3] },
    { region: 'right shoulder', ellipse: [36, 56, 11, 8] },
    { region: 'left shoulder', ellipse: [84, 56, 11, 8] },
    { region: 'chest', rect: [44, 50, 32, 34, 6] },
    { region: 'abdomen', rect: [44, 86, 32, 28, 6] },
    { region: 'pelvis', rect: [44, 116, 32, 20, 8] },
    { region: 'right arm', rect: [22, 64, 12, 62, 6] },
    { region: 'left arm', rect: [86, 64, 12, 62, 6] },
    { region: 'right hand/wrist', ellipse: [27, 136, 7, 10] },
    { region: 'left hand/wrist', ellipse: [93, 136, 7, 10] },
    { region: 'right hip', ellipse: [44, 134, 8, 8] },
    { region: 'left hip', ellipse: [76, 134, 8, 8] },
    { region: 'right leg', rect: [42, 144, 15, 56, 7] },
    { region: 'left leg', rect: [63, 144, 15, 56, 7] },
    { region: 'right knee', ellipse: [49.5, 208, 8, 8] },
    { region: 'left knee', ellipse: [70.5, 208, 8, 8] },
    { region: 'right leg', rect: [43, 217, 13, 52, 6] },
    { region: 'left leg', rect: [64, 217, 13, 52, 6] },
    { region: 'right foot/ankle', ellipse: [48, 278, 9, 7] },
    { region: 'left foot/ankle', ellipse: [72, 278, 9, 7] },
  ];
}

function back(): Shape[] {
  return [
    { region: 'head', ellipse: [60, 22, 15, 17] },
    { region: 'neck', rect: [52, 39, 16, 10, 3] },
    { region: 'left shoulder', ellipse: [36, 56, 11, 8] },
    { region: 'right shoulder', ellipse: [84, 56, 11, 8] },
    { region: 'upper back', rect: [44, 50, 32, 22, 6] },
    { region: 'mid back', rect: [44, 74, 32, 20, 4] },
    { region: 'lower back', rect: [44, 96, 32, 18, 4] },
    { region: 'sacrum/SI', rect: [48, 116, 24, 18, 8] },
    { region: 'left arm', rect: [22, 64, 12, 62, 6] },
    { region: 'right arm', rect: [86, 64, 12, 62, 6] },
    { region: 'left hand/wrist', ellipse: [27, 136, 7, 10] },
    { region: 'right hand/wrist', ellipse: [93, 136, 7, 10] },
    { region: 'left hip', ellipse: [44, 134, 8, 8] },
    { region: 'right hip', ellipse: [76, 134, 8, 8] },
    { region: 'left leg', rect: [42, 144, 15, 56, 7] },
    { region: 'right leg', rect: [63, 144, 15, 56, 7] },
    { region: 'left knee', ellipse: [49.5, 208, 8, 8] },
    { region: 'right knee', ellipse: [70.5, 208, 8, 8] },
    { region: 'left leg', rect: [43, 217, 13, 52, 6] },
    { region: 'right leg', rect: [64, 217, 13, 52, 6] },
    { region: 'left foot/ankle', ellipse: [48, 278, 9, 7] },
    { region: 'right foot/ankle', ellipse: [72, 278, 9, 7] },
  ];
}

function fillFor(v: number | undefined, max: number) {
  if (!v) return undefined;
  const pct = 18 + (v / max) * 72;
  return `color-mix(in srgb, var(--critical) ${pct}%, var(--surface-2))`;
}

export function BodyMap({
  values,
  onToggle,
  max = 10,
  title,
}: {
  values: Record<string, number>;
  onToggle?: (region: string) => void;
  max?: number;
  title?: string;
}) {
  const render = (shapes: Shape[], ox: number) =>
    shapes.map((s, i) => {
      const v = values[s.region];
      const p = {
        className: 'part',
        style: fillFor(v, max) ? { fill: fillFor(v, max) } : undefined,
        onClick: onToggle ? () => onToggle(s.region) : undefined,
        role: onToggle ? 'button' : undefined,
        'aria-label': `${s.region}${v ? `: ${v}` : ''}`,
        tabIndex: onToggle ? 0 : undefined,
        onKeyDown: onToggle ? (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle(s.region)) : undefined,
      };
      const t = <title>{`${s.region}${v ? ` – ${Number.isInteger(v) ? v : v.toFixed(1)}` : ''}`}</title>;
      if (s.ellipse) {
        const [cx, cy, rx, ry] = s.ellipse;
        return <ellipse key={i} cx={cx + ox} cy={cy} rx={rx} ry={ry} {...p}>{t}</ellipse>;
      }
      const [x, y, w, h, r = 0] = s.rect!;
      return <rect key={i} x={x + ox} y={y} width={w} height={h} rx={r} {...p}>{t}</rect>;
    });
  const widespread = values['widespread'];
  return (
    <div>
      {title && <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{title}</div>}
      <svg viewBox="0 0 260 300" className="bodymap" role="group" aria-label="Body map">
        <text x={60} y={298} textAnchor="middle">Front</text>
        <text x={200} y={298} textAnchor="middle">Back</text>
        <text x={14} y={10}>R</text>
        <text x={104} y={10}>L</text>
        <text x={154} y={10}>L</text>
        <text x={244} y={10}>R</text>
        {render(front(), 0)}
        {render(back(), 140)}
      </svg>
      {onToggle && (
        <button type="button" className={`chip${widespread ? ' on' : ''}`} onClick={() => onToggle('widespread')}>
          Widespread / all over{widespread ? ` (${widespread})` : ''}
        </button>
      )}
    </div>
  );
}
