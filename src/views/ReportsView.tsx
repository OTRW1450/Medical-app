import { useMemo, useState } from 'react';
import { usePatient } from '../state';
import { navigate } from '../lib/router';
import { ageAt, fmtDate, today, yearOf } from '../lib/dates';
import { BODY_SYSTEMS } from '../lib/taxonomy';
import { EVENT_TYPES, EVENT_TYPE_LABEL, type EventType } from '../types';
import { download } from '../db/backup';
import { narrative, sectionsToText, timetable, timetableCSV, type ReportFilter, type TimetableOptions } from '../reports/build';
import { useLocalState } from '../components/ui';
import { SummaryView } from './SummaryView';
import { TYPE_COLOR } from './TimelineView';

const TABS = [
  { k: 'written', label: 'Written summary' },
  { k: 'timetable', label: 'Timetable of events' },
  { k: 'doctor', label: 'Doctor one-pager' },
  { k: 'card', label: 'Emergency card' },
] as const;
const AREAS = ['Head & face', 'Neck', 'Spine & back', 'Upper limbs', 'Lower limbs', 'Trunk & pelvis', 'Widespread'];

export function ReportsView({ params }: { params: URLSearchParams }) {
  const tab = params.get('tab') ?? 'written';
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 14, gap: 6 }}>
        {TABS.map((t) => (
          <button key={t.k} className={`chip${tab === t.k ? ' on' : ''}`} style={{ fontSize: 14, padding: '6px 14px' }} onClick={() => navigate('reports', { tab: t.k })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'timetable' ? <Timetable /> : tab === 'doctor' ? <SummaryView /> : tab === 'card' ? <EmergencyCard /> : <Written />}
    </>
  );
}

function Scope({ f, setF }: { f: ReportFilter; setF: (f: ReportFilter) => void }) {
  const { events } = usePatient();
  const systems = [...new Set([...events.flatMap((e) => e.systems), ...BODY_SYSTEMS])].filter((s) => events.some((e) => e.systems.includes(s)));
  return (
    <>
      <label className="field">
        <span>From</span>
        <input type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
      </label>
      <label className="field">
        <span>To</span>
        <input type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
      </label>
      <label className="field">
        <span>Body system</span>
        <select value={f.system ?? ''} onChange={(e) => setF({ ...f, system: e.target.value || undefined })}>
          <option value="">All</option>
          {systems.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Body area</span>
        <select value={f.area ?? ''} onChange={(e) => setF({ ...f, area: e.target.value || undefined })}>
          <option value="">All</option>
          {AREAS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
    </>
  );
}

function Written() {
  const d = usePatient();
  const [f, setF] = useLocalState<ReportFilter>('rep:written:filter', {});
  const [detail, setDetail] = useLocalState<'brief' | 'detailed'>('rep:written:detail', 'brief');
  const [copied, setCopied] = useState(false);
  const sections = useMemo(() => narrative(d, d.insights, f, detail), [d, f, detail]);
  const title = `Medical history summary – ${d.patient.name}`;
  const copy = async () => {
    await navigator.clipboard.writeText(sectionsToText(`${title} (${fmtDate(today())})`, sections));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Written summary</h1>
          <p className="muted no-print">A plain-language summary assembled from everything recorded – every sentence comes from your own records. Narrow it by date or body system for a specific specialist.</p>
        </div>
      </div>
      <div className="card no-print" style={{ marginBottom: 12 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Scope f={f} setF={setF} />
          <label className="field">
            <span>Length</span>
            <div className="segmented">
              <button className={detail === 'brief' ? 'on' : ''} onClick={() => setDetail('brief')}>Brief</button>
              <button className={detail === 'detailed' ? 'on' : ''} onClick={() => setDetail('detailed')}>Detailed</button>
            </div>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => window.print()}>Print / save as PDF</button>
          <button onClick={copy}>{copied ? '✓ Copied' : 'Copy as text'}</button>
          <button onClick={() => download(new Blob([sectionsToText(title, sections)], { type: 'text/plain' }), `summary-${today()}.txt`)}>Download .txt</button>
          {(f.from || f.to || f.system || f.area) && <button className="ghost" onClick={() => setF({})}>Clear filters</button>}
        </div>
      </div>
      <article className="card report">
        <h2 style={{ borderBottom: 0 }}>{title}</h2>
        <p className="faint">Prepared {fmtDate(today())}{detail === 'detailed' ? ' · detailed' : ''}</p>
        {sections.map((s) => (
          <section key={s.heading}>
            <h3>{s.heading}</h3>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            {s.bullets && s.bullets.length > 0 && <ul>{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          </section>
        ))}
      </article>
    </>
  );
}

function Timetable() {
  const d = usePatient();
  const [o, setO] = useLocalState<TimetableOptions>('rep:tt:opts', { types: [], meds: true, labs: 'abnormal', keyOnly: false, detail: 'compact' });
  const [landscape, setLandscape] = useLocalState('rep:tt:landscape', false);
  const [newestFirst, setNewestFirst] = useLocalState('rep:tt:newest', false);
  const rows0 = useMemo(() => timetable(d, o), [d, o]);
  const rows = newestFirst ? [...rows0].reverse() : rows0;
  const usedTypes = EVENT_TYPES.filter((t) => d.events.some((e) => e.type === t));
  const toggleType = (t: EventType) => setO({ ...o, types: o.types.includes(t) ? o.types.filter((x) => x !== t) : [...o.types, t] });
  let lastYear = 0;
  const color = (k: string) => (k === 'lab' ? 'var(--critical)' : k in TYPE_COLOR ? TYPE_COLOR[k as EventType] : k === 'med-start' ? 'var(--good)' : 'var(--muted)');

  return (
    <>
      {landscape && <style>{'@media print { @page { size: landscape; margin: 12mm; } }'}</style>}
      <div className="page-head">
        <div>
          <h1>Timetable of events</h1>
          <p className="muted no-print">A clean chronological table of everything – ready to print, save as PDF or open in a spreadsheet.</p>
        </div>
      </div>
      <div className="card no-print" style={{ marginBottom: 12 }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Scope f={o} setF={(f) => setO({ ...o, ...f, from: f.from, to: f.to, system: f.system, area: f.area })} />
          <label className="field">
            <span>Lab results</span>
            <select value={o.labs} onChange={(e) => setO({ ...o, labs: e.target.value as TimetableOptions['labs'] })}>
              <option value="abnormal">Abnormal only</option>
              <option value="all">All</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="field">
            <span>Details</span>
            <div className="segmented">
              <button className={o.detail === 'compact' ? 'on' : ''} onClick={() => setO({ ...o, detail: 'compact' })}>Short</button>
              <button className={o.detail === 'full' ? 'on' : ''} onClick={() => setO({ ...o, detail: 'full' })}>Full text</button>
            </div>
          </label>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {usedTypes.map((t) => (
            <button key={t} className={`chip${o.types.includes(t) ? ' on' : ''}`} onClick={() => toggleType(t)}>
              <span className="dot" style={{ background: TYPE_COLOR[t] }} /> {EVENT_TYPE_LABEL[t].split(' /')[0]}
            </button>
          ))}
          {o.types.length > 0 && <button className="chip" onClick={() => setO({ ...o, types: [] })}>All types</button>}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 16 }}>
          <label className="check"><input type="checkbox" checked={o.meds} onChange={(e) => setO({ ...o, meds: e.target.checked })} /> Medication starts/stops</label>
          <label className="check"><input type="checkbox" checked={o.keyOnly} onChange={(e) => setO({ ...o, keyOnly: e.target.checked })} /> ★ Key events only</label>
          <label className="check"><input type="checkbox" checked={newestFirst} onChange={(e) => setNewestFirst(e.target.checked)} /> Newest first</label>
          <label className="check"><input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} /> Print landscape</label>
        </div>
        {(o.system || o.area) && <p className="faint" style={{ fontSize: 13, margin: '8px 0 0' }}>Medications and labs aren’t tagged by body system, so they’re left out when filtering by system or area.</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => window.print()}>Print / save as PDF</button>
          <button onClick={() => download(new Blob(['﻿' + timetableCSV(rows)], { type: 'text/csv' }), `timetable-${today()}.csv`)}>Download spreadsheet (CSV)</button>
          <span className="faint" style={{ fontSize: 13 }}>{rows.length} rows</span>
        </div>
      </div>
      <div className="card report">
        <div className="print-only" style={{ marginBottom: 8 }}>
          <b>{d.patient.name}</b>{d.patient.dob ? ` · born ${fmtDate(d.patient.dob)}` : ''} · Timetable of medical events · printed {fmtDate(today())}
        </div>
        <table className="timetable">
          <thead>
            <tr>
              <th style={{ width: 96 }}>Date</th>
              {d.patient.dob && <th className="num" style={{ width: 40 }}>Age</th>}
              <th style={{ width: 130 }}>Type</th>
              <th>Event</th>
              <th style={{ width: 150 }}>Who / where</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const y = yearOf(r.date);
              const header = y !== lastYear;
              lastYear = y;
              return [
                header && (
                  <tr key={`y${y}`} className="year-row">
                    <td colSpan={d.patient.dob ? 6 : 5}>{y}{r.age !== undefined ? ` · age ${r.age}` : ''}</td>
                  </tr>
                ),
                <tr key={r.id} className={r.key ? 'key-row' : ''}>
                  <td className="tabnum" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date, r.precision)}</td>
                  {d.patient.dob && <td className="num">{r.age}</td>}
                  <td><span className="dot" style={{ background: color(r.kind), marginRight: 6 }} />{r.kindLabel}</td>
                  <td><b>{r.what}</b>{r.key && ' ★'}{r.flag && <div className="badge notable" style={{ marginTop: 3 }}>▲ {r.flag}</div>}</td>
                  <td className="muted">{r.who}</td>
                  <td style={{ fontSize: 13 }}>{r.details}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
        {!rows.length && <p className="muted">Nothing matches these filters.</p>}
      </div>
    </>
  );
}

function EmergencyCard() {
  const { patient, events, meds } = usePatient();
  const now = today();
  const current = meds.filter((m) => !m.endDate || m.endDate >= now);
  const dx = events.filter((e) => e.type === 'diagnosis' && (e.status === 'active' || !e.status));
  const surgeries = events.filter((e) => e.type === 'surgery');
  const intolerant = meds.filter((m) => m.effectiveness !== undefined && m.effectiveness < 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emergency card</h1>
          <p className="muted no-print">The essentials for an ER visit or a new clinician, on one small page. Print it and keep it in a wallet or bag.</p>
        </div>
        <div className="spacer" />
        <button className="primary no-print" onClick={() => window.print()}>Print</button>
      </div>
      <div className="card report" style={{ maxWidth: 560, border: '2px solid var(--critical)' }}>
        <h2 style={{ borderBottom: 0, margin: 0 }}>{patient.name}</h2>
        <p className="muted">{patient.dob ? `Born ${fmtDate(patient.dob)} (age ${ageAt(patient.dob, now)})` : ''} · updated {fmtDate(now)}</p>
        <h3 style={{ color: 'var(--critical)' }}>⚠ Allergies & reactions</h3>
        <p>{patient.allergies || 'None recorded'}{intolerant.length ? `. Did not tolerate: ${intolerant.map((m) => `${m.name}${m.sideEffects ? ` (${m.sideEffects})` : ''}`).join(', ')}` : ''}</p>
        <h3>Current medications</h3>
        {current.length ? <ul>{current.map((m) => <li key={m.id}>{m.name} {m.dose} {m.reason && <span className="muted">– {m.reason}</span>}</li>)}</ul> : <p>None recorded</p>}
        <h3>Diagnoses</h3>
        <p>{dx.length ? dx.map((e) => e.title).join(' · ') : 'None recorded'}</p>
        {surgeries.length > 0 && (<><h3>Surgeries</h3><p>{surgeries.map((s) => `${s.title} (${fmtDate(s.date, 'year')})`).join(' · ')}</p></>)}
        <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>Emergency contact: ______________________ &nbsp; Phone: _______________</p>
      </div>
    </>
  );
}
