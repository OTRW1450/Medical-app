import { useMemo, useState } from 'react';
import { store } from '../db/store';
import { usePatient } from '../state';
import { uid } from '../lib/id';
import { addDays, daysBetween, fmtDate, toTime, today } from '../lib/dates';
import { COMMON_SYMPTOMS, COMMON_TRIGGERS, PAIN_QUALITIES } from '../lib/taxonomy';
import { logsFromCSV } from '../lib/csv';
import type { DailyLog, RegionPain } from '../types';
import { BodyMap } from '../components/BodyMap';
import { LineChart, BarList } from '../components/charts';
import { Field, Modal, Slider, TagInput } from '../components/ui';
import { mean } from '../analysis/logs';

function blank(patientId: string, date: string): DailyLog {
  return { id: uid(), patientId, date, pain: 0, regions: [], symptoms: [], triggers: [], createdAt: Date.now() };
}

export function LogView() {
  const { patient, logs, meds } = usePatient();
  const [date, setDate] = useState(today());
  const existing = logs.find((l) => l.date === date);
  const [importing, setImporting] = useState(false);
  const [span, setSpan] = useState(90);

  const last = logs.length ? logs[logs.length - 1].date : today();
  const shown = logs.filter((l) => span === 0 || daysBetween(l.date, last) < span);

  const series = useMemo(() => {
    const pts = shown.map((l) => ({ t: toTime(l.date), v: l.pain }));
    const avg = shown.map((l, i) => {
      const w = shown.filter((x, j) => j <= i && daysBetween(x.date, l.date) < 7);
      return { t: toTime(l.date), v: Math.round(mean(w.map((x) => x.pain)) * 10) / 10 };
    });
    return [
      { id: 'pain', label: 'Daily pain', color: 'var(--s8)', points: pts },
      { id: 'avg', label: '7-day average', color: 'var(--s1)', points: avg },
    ];
  }, [shown]);

  const markers = meds
    .flatMap((m) => [
      { t: toTime(m.startDate), label: `+${m.name}`, color: 'var(--good)' },
      ...(m.endDate ? [{ t: toTime(m.endDate), label: `−${m.name}`, color: 'var(--muted)' }] : []),
    ])
    .filter((m) => shown.length && m.t >= toTime(shown[0].date) && m.t <= toTime(last));

  const regionAgg = useMemo(() => {
    const sums: Record<string, number[]> = {};
    for (const l of shown) for (const r of l.regions) (sums[r.region] ??= []).push(r.intensity);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(sums)) out[k] = (mean(v) * v.length) / Math.max(1, shown.length);
    return out;
  }, [shown]);

  const qualityCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of shown) for (const r of l.regions) for (const q of r.qualities) c.set(q, (c.get(q) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [shown]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pain diary</h1>
          <p className="muted">A quick daily check-in. After a few weeks the Patterns page can test which factors really move the pain.</p>
        </div>
        <div className="spacer" />
        <button onClick={() => setImporting(true)}>Import CSV</button>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <LogForm key={date} initial={existing ?? blank(patient.id, date)} isNew={!existing} date={date} setDate={setDate} showCycle={patient.sex !== 'male'} allLogs={logs} />
        <div className="stack" style={{ gap: 12 }}>
          <div className="card">
            <div className="row between">
              <h3>Pain over time</h3>
              <div className="segmented">
                {[30, 90, 365, 0].map((w) => (
                  <button key={w} className={span === w ? 'on' : ''} onClick={() => setSpan(w)}>
                    {w ? `${w}d` : 'All'}
                  </button>
                ))}
              </div>
            </div>
            <LineChart series={series} yMin={0} yMax={10} markers={markers.slice(0, 8)} height={220} />
            <p className="faint" style={{ fontSize: 12 }}>Dashed lines: medication started (+) / stopped (−).</p>
          </div>
          <div className="card">
            <h3>Where it hurts{span ? ` (last ${span} days)` : ''}</h3>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <BodyMap values={regionAgg} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>How it feels</div>
                {qualityCounts.length ? <BarList rows={qualityCounts.map(([label, value]) => ({ label, value, sub: `${value} days` }))} /> : <p className="faint">No pain qualities logged yet.</p>}
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Recent entries</h3>
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Date</th><th className="num">Pain</th><th className="num">Sleep</th><th>Symptoms / triggers</th></tr>
                </thead>
                <tbody>
                  {[...logs].reverse().slice(0, 60).map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => setDate(l.date)}>
                      <td className="tabnum">{fmtDate(l.date)}</td>
                      <td className="num">{l.pain}</td>
                      <td className="num">{l.sleepQuality ?? '–'}</td>
                      <td className="muted" style={{ fontSize: 13 }}>{[...l.symptoms, ...l.triggers.map((t) => `⚡${t}`)].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {importing && <ImportLogs onClose={() => setImporting(false)} />}
    </>
  );
}

function LogForm({ initial, isNew, date, setDate, showCycle, allLogs }: { initial: DailyLog; isNew: boolean; date: string; setDate: (d: string) => void; showCycle: boolean; allLogs: DailyLog[] }) {
  const [l, setL] = useState<DailyLog>(initial);
  const [saved, setSaved] = useState(false);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const set = <K extends keyof DailyLog>(k: K, v: DailyLog[K]) => {
    setSaved(false);
    setL((p) => ({ ...p, [k]: v }));
  };
  const usedSymptoms = useMemo(() => [...new Set([...allLogs.flatMap((x) => x.symptoms), ...COMMON_SYMPTOMS])], [allLogs]);
  const usedTriggers = useMemo(() => [...new Set([...allLogs.flatMap((x) => x.triggers), ...COMMON_TRIGGERS])], [allLogs]);
  const regionValues = Object.fromEntries(l.regions.map((r) => [r.region, r.intensity || 1]));
  const toggleRegion = (region: string) => {
    const has = l.regions.find((r) => r.region === region);
    if (has && activeRegion === region) {
      set('regions', l.regions.filter((r) => r.region !== region));
      setActiveRegion(null);
    } else {
      if (!has) set('regions', [...l.regions, { region, intensity: Math.max(1, l.pain), qualities: [] }]);
      setActiveRegion(region);
    }
  };
  const updRegion = (region: string, patch: Partial<RegionPain>) => set('regions', l.regions.map((r) => (r.region === region ? { ...r, ...patch } : r)));
  const active = l.regions.find((r) => r.region === activeRegion);
  const prev = allLogs.filter((x) => x.date < date).pop();

  const save = async () => {
    await store.put('logs', { ...l, date });
    setSaved(true);
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="row">
          <button className="small" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160 }} />
          <button className="small" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label="Next day">›</button>
        </div>
        <span className="faint" style={{ fontSize: 13 }}>{isNew ? 'New entry' : 'Editing saved entry'}</span>
      </div>
      {isNew && prev && (
        <button className="small" style={{ marginBottom: 8 }} onClick={() => setL({ ...prev, id: l.id, date, notes: '', createdAt: Date.now() })}>
          Copy from {fmtDate(prev.date)}
        </button>
      )}
      <Slider label="Overall pain today (0 = none, 10 = worst imaginable)" value={l.pain} onChange={(v) => set('pain', v)} />
      <div style={{ margin: '12px 0' }}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Tap where it hurts (tap again to edit / remove)</div>
        <div className="row" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <BodyMap values={regionValues} onToggle={toggleRegion} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            {active ? (
              <div className="stack">
                <b>{active.region}</b>
                <Slider label="Intensity" value={active.intensity} onChange={(v) => updRegion(active.region, { intensity: v })} />
                <div className="chips">
                  {PAIN_QUALITIES.map((q) => (
                    <button type="button" key={q} className={`chip${active.qualities.includes(q) ? ' on' : ''}`} onClick={() => updRegion(active.region, { qualities: active.qualities.includes(q) ? active.qualities.filter((x) => x !== q) : [...active.qualities, q] })}>
                      {q}
                    </button>
                  ))}
                </div>
                <button type="button" className="small danger" onClick={() => { set('regions', l.regions.filter((r) => r.region !== active.region)); setActiveRegion(null); }}>Remove area</button>
              </div>
            ) : (
              <div className="chips">
                {l.regions.map((r) => (
                  <button type="button" key={r.region} className="chip" onClick={() => setActiveRegion(r.region)}>
                    {r.region} · {r.intensity}{r.qualities.length ? ` · ${r.qualities.join(', ')}` : ''}
                  </button>
                ))}
                {!l.regions.length && <span className="faint" style={{ fontSize: 13 }}>No areas selected.</span>}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="form-grid">
        <Slider label="Fatigue" value={l.fatigue} onChange={(v) => set('fatigue', v)} />
        <Slider label="Sleep quality last night" value={l.sleepQuality} onChange={(v) => set('sleepQuality', v)} />
        <Slider label="Hours slept" value={l.sleepHours} min={0} max={14} step={0.5} onChange={(v) => set('sleepHours', v)} />
        <Slider label="Stress" value={l.stress} onChange={(v) => set('stress', v)} />
        <Slider label="Mood (10 = great)" value={l.mood} onChange={(v) => set('mood', v)} />
        <Slider label="Physical activity" value={l.activity} onChange={(v) => set('activity', v)} />
        <Slider label="Could do what I needed (10 = all)" value={l.function} onChange={(v) => set('function', v)} />
        <Field label="Other symptoms today" full>
          <TagInput value={l.symptoms} onChange={(v) => set('symptoms', v)} suggestions={usedSymptoms} />
        </Field>
        <Field label="Possible triggers / exposures" full>
          <TagInput value={l.triggers} onChange={(v) => set('triggers', v)} suggestions={usedTriggers} />
        </Field>
        {showCycle && (
          <label className="check full">
            <input type="checkbox" checked={!!l.menstruating} onChange={(e) => set('menstruating', e.target.checked)} /> Period today
          </label>
        )}
        <Field label="Notes" full>
          <textarea value={l.notes ?? ''} onChange={(e) => set('notes', e.target.value)} style={{ minHeight: 50 }} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={save}>Save day</button>
        {!isNew && <button className="danger" onClick={() => confirm('Delete this day?') && store.remove('logs', l.id)}>Delete</button>}
        {saved && <span className="badge good">✓ Saved</span>}
      </div>
    </div>
  );
}

function ImportLogs({ onClose }: { onClose: () => void }) {
  const { patient, logs } = usePatient();
  const [text, setText] = useState('');
  const [monthFirst, setMonthFirst] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    try {
      const { logs: parsed, skipped } = logsFromCSV(text, patient.id, monthFirst);
      const existing = new Set(logs.map((l) => l.date));
      const fresh = parsed.filter((l) => !existing.has(l.date));
      await store.bulkPut('logs', fresh);
      setMsg(`Imported ${fresh.length} days. ${parsed.length - fresh.length} already existed, ${skipped} rows skipped.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <Modal title="Import diary from CSV" onClose={onClose} footer={<><button onClick={onClose}>Close</button><button className="primary" onClick={run} disabled={!text}>Import</button></>}>
      <p className="muted">Columns recognised: <code>date, pain, sleep hours, sleep quality, fatigue, mood, stress, activity, symptoms, triggers, period, notes</code>. Separate multiple symptoms with <code>|</code> or <code>;</code>. Works with exports from most symptom-tracking apps after renaming columns.</p>
      <input type="file" accept=".csv,.tsv,.txt" onChange={async (e) => e.target.files?.[0] && setText(await e.target.files[0].text())} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste CSV here" style={{ marginTop: 8, minHeight: 140, fontFamily: 'monospace', fontSize: 12 }} />
      <label className="check"><input type="checkbox" checked={monthFirst} onChange={(e) => setMonthFirst(e.target.checked)} /> Dates are month-first (US: 03/14/2024)</label>
      {msg && <div className="banner" style={{ marginTop: 10 }}>{msg}</div>}
    </Modal>
  );
}
