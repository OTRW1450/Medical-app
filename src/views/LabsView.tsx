import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { usePatient } from '../state';
import { uid } from '../lib/id';
import { fmtDate, toTime, today } from '../lib/dates';
import { labsFromCSV, labsFromText } from '../lib/csv';
import type { LabResult } from '../types';
import { groupLabs, normalizeTest } from '../analysis/labs';
import { labStatus, type LabStatus } from '../analysis/corpus';
import { LineChart } from '../components/charts';
import { Empty, Field, Modal } from '../components/ui';
import { Icon } from '../components/Icons';

const STATUS_BADGE: Record<LabStatus, [string, string]> = {
  high: ['important', '▲ High'],
  low: ['important', '▼ Low'],
  positive: ['important', '● Positive'],
  negative: ['good', '✓ Negative'],
  normal: ['good', '✓ In range'],
  unknown: ['info', '–'],
};

export function StatusBadge({ s }: { s: LabStatus }) {
  const [cls, txt] = STATUS_BADGE[s];
  return <span className={`badge ${cls}`}>{txt}</span>;
}

export function LabsView({ params }: { params: URLSearchParams }) {
  const { patient, labs } = usePatient();
  const groups = useMemo(() => groupLabs(labs), [labs]);
  const focusLab = labs.find((l) => l.id === params.get('id'));
  const [sel, setSel] = useState<string | null>(focusLab ? normalizeTest(focusLab.test) : null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<LabResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [onlyAbn, setOnlyAbn] = useState(false);

  const list = [...groups.entries()]
    .map(([test, rs]) => {
      const last = rs[rs.length - 1];
      const abn = rs.filter((r) => ['high', 'low', 'positive'].includes(labStatus(r))).length;
      return { test, rs, last, abn };
    })
    .filter((x) => (!q || x.test.toLowerCase().includes(q.toLowerCase())) && (!onlyAbn || x.abn))
    .sort((a, b) => b.abn - a.abn || a.test.localeCompare(b.test));

  const effSel = sel ?? list[0]?.test ?? null;
  const selected = effSel ? groups.get(effSel) : undefined;
  const numeric = selected?.filter((r) => typeof r.value === 'number') ?? [];
  const ref = [...numeric].reverse().find((r) => r.refLow !== undefined || r.refHigh !== undefined);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lab results</h1>
          <p className="muted">Every result in one place, with trends across years and labs. A value can be “in range” each time and still be drifting.</p>
        </div>
        <div className="spacer" />
        <button onClick={() => setImporting(true)}>Paste / import results</button>
        <button className="primary" onClick={() => setAdding({ id: uid(), patientId: patient.id, date: today(), test: effSel ?? '', createdAt: Date.now() })}>
          <Icon.plus /> Add result
        </button>
      </div>
      {!labs.length ? (
        <div className="card">
          <Empty title="No lab results yet">
            <p>Paste lines straight from a lab report – e.g. <code>CRP 9.1 mg/L 0-5 H</code> – and they are parsed into results you can review.</p>
            <button className="primary" onClick={() => setImporting(true)}>Paste results</button>
          </Empty>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr', alignItems: 'start' }}>
          <div className="card" style={{ padding: 8 }}>
            <input type="search" placeholder="Find test" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="check" style={{ margin: '6px 4px' }}><input type="checkbox" checked={onlyAbn} onChange={(e) => setOnlyAbn(e.target.checked)} /> Only tests with abnormal results</label>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <table>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.test} className="clickable" onClick={() => setSel(x.test)} style={effSel === x.test ? { background: 'var(--accent-soft)' } : undefined}>
                      <td>
                        <b>{x.test}</b>
                        <div className="faint" style={{ fontSize: 12 }}>{x.rs.length} result{x.rs.length > 1 ? 's' : ''}{x.abn ? ` · ${x.abn} abnormal` : ''}</div>
                      </td>
                      <td className="num">
                        {x.last.value ?? x.last.textValue} <span className="faint">{x.last.unit}</span>
                        <div><StatusBadge s={labStatus(x.last)} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            {!selected ? (
              <Empty title="Choose a test to see its history" />
            ) : (
              <>
                <h2>{effSel}</h2>
                {ref && <p className="muted">Reference range (latest): {ref.refLow ?? '–'} – {ref.refHigh ?? '–'} {ref.unit}. Shaded band = in range.</p>}
                {numeric.length >= 1 && (
                  <LineChart
                    series={[{ id: 'v', label: effSel!, color: 'var(--s1)', points: numeric.map((r) => ({ t: toTime(r.date), v: r.value!, label: `${r.value} ${r.unit ?? ''}` })) }]}
                    band={ref ? { lo: ref.refLow, hi: ref.refHigh } : undefined}
                    showPoints
                  />
                )}
                <table style={{ marginTop: 12 }}>
                  <thead><tr><th>Date</th><th className="num">Result</th><th>Range</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {[...selected].reverse().map((r) => (
                      <tr key={r.id} className={r.id === focusLab?.id ? 'flash' : ''}>
                        <td className="tabnum">{fmtDate(r.date)}</td>
                        <td className="num">{r.value ?? r.textValue} {r.unit}</td>
                        <td className="tabnum muted">{r.refLow !== undefined || r.refHigh !== undefined ? `${r.refLow ?? ''}–${r.refHigh ?? ''}` : ''}</td>
                        <td><StatusBadge s={labStatus(r)} /></td>
                        <td><button className="small" onClick={() => setAdding(r)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
      {adding && <LabForm lab={adding} onClose={() => setAdding(null)} />}
      {importing && <ImportLabs onClose={() => setImporting(false)} />}
    </>
  );
}

function LabForm({ lab, onClose }: { lab: LabResult; onClose: () => void }) {
  const { labs } = usePatient();
  const [l, setL] = useState(lab);
  const [raw, setRaw] = useState(lab.value !== undefined ? String(lab.value) : lab.textValue ?? '');
  const isNew = !labs.some((x) => x.id === lab.id);
  const tests = useMemo(() => [...new Set(labs.map((x) => x.test))].sort(), [labs]);
  const set = <K extends keyof LabResult>(k: K, v: LabResult[K]) => setL({ ...l, [k]: v });
  const num = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));
  const save = async () => {
    const n = num(raw);
    await db.labs.put({ ...l, test: l.test.trim(), value: n, textValue: n === undefined ? raw.trim() || undefined : undefined });
    onClose();
  };
  return (
    <Modal
      title={isNew ? 'Add lab result' : 'Edit lab result'}
      onClose={onClose}
      footer={
        <>
          {!isNew && <button className="danger" style={{ marginRight: 'auto' }} onClick={async () => { await db.labs.delete(l.id); onClose(); }}>Delete</button>}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={!l.test.trim() || !raw.trim()}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Test"><input list="lab-tests" value={l.test} onChange={(e) => set('test', e.target.value)} /><datalist id="lab-tests">{tests.map((t) => <option key={t} value={t} />)}</datalist></Field>
        <Field label="Date"><input type="date" value={l.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Result" hint="Number, or text like “positive 1:160”"><input value={raw} onChange={(e) => setRaw(e.target.value)} /></Field>
        <Field label="Unit"><input value={l.unit ?? ''} onChange={(e) => set('unit', e.target.value || undefined)} /></Field>
        <Field label="Reference low"><input inputMode="decimal" value={l.refLow ?? ''} onChange={(e) => set('refLow', num(e.target.value))} /></Field>
        <Field label="Reference high"><input inputMode="decimal" value={l.refHigh ?? ''} onChange={(e) => set('refHigh', num(e.target.value))} /></Field>
        <Field label="Lab flag">
          <select value={l.flag ?? ''} onChange={(e) => set('flag', e.target.value as LabResult['flag'])}>
            <option value="">None</option><option value="H">H (high)</option><option value="L">L (low)</option><option value="A">A (abnormal)</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function ImportLabs({ onClose }: { onClose: () => void }) {
  const { patient } = usePatient();
  const [mode, setMode] = useState<'text' | 'csv'>('text');
  const [text, setText] = useState('');
  const [date, setDate] = useState(today());
  const [monthFirst, setMonthFirst] = useState(false);
  const [rows, setRows] = useState<LabResult[] | null>(null);
  const [err, setErr] = useState('');
  const parse = () => {
    setErr('');
    try {
      const r = mode === 'text' ? labsFromText(text, date, patient.id) : labsFromCSV(text, patient.id, monthFirst).labs;
      if (!r.length) setErr('No results recognised. Each line should look like “Test  value  unit  low-high”.');
      setRows(r);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const save = async () => {
    if (!rows) return;
    await db.labs.bulkAdd(rows);
    onClose();
  };
  return (
    <Modal
      title="Import lab results"
      onClose={onClose}
      footer={rows?.length ? <><button onClick={() => setRows(null)}>Back</button><button className="primary" onClick={save}>Save {rows.length} results</button></> : <><button onClick={onClose}>Cancel</button><button className="primary" onClick={parse} disabled={!text}>Preview</button></>}
    >
      {!rows?.length ? (
        <>
          <div className="segmented" style={{ marginBottom: 10 }}>
            <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>Paste from a report</button>
            <button className={mode === 'csv' ? 'on' : ''} onClick={() => setMode('csv')}>CSV / spreadsheet</button>
          </div>
          {mode === 'text' ? (
            <>
              <p className="muted">Copy the results table from a PDF or patient-portal page and paste it below. One test per line. You’ll review everything before saving.</p>
              <Field label="Date the sample was taken"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} /></Field>
            </>
          ) : (
            <>
              <p className="muted">Needs columns for <b>date</b>, <b>test</b> and <b>value/result</b>; optional <b>unit</b>, <b>range</b> (e.g. 0-5) or <b>low</b>/<b>high</b>, and <b>flag</b>.</p>
              <input type="file" accept=".csv,.tsv,.txt" onChange={async (e) => e.target.files?.[0] && setText(await e.target.files[0].text())} />
              <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={monthFirst} onChange={(e) => setMonthFirst(e.target.checked)} /> Dates are month-first (US)</label>
            </>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'text' ? 'CRP           9.1   mg/L    0.0 - 5.0   H\nFerritin      13    ng/mL   15 - 150    L\nTSH           4.3   mIU/L   0.4 - 4.0' : 'date,test,result,unit,range\n2024-01-05,CRP,9.1,mg/L,0-5'} style={{ marginTop: 8, minHeight: 180, fontFamily: 'monospace', fontSize: 12.5 }} />
          {err && <div className="banner warn" style={{ marginTop: 8 }}>{err}</div>}
        </>
      ) : (
        <div className="table-wrap">
          <p className="muted">Check these before saving. Remove any line that was mis-read.</p>
          <table>
            <thead><tr><th>Date</th><th>Test</th><th className="num">Value</th><th>Unit</th><th>Range</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="tabnum">{r.date}</td><td>{r.test}</td><td className="num">{r.value ?? r.textValue}</td><td>{r.unit}</td>
                  <td className="tabnum">{r.refLow ?? ''}{r.refLow !== undefined || r.refHigh !== undefined ? '–' : ''}{r.refHigh ?? ''}</td>
                  <td><StatusBadge s={labStatus(r)} /></td>
                  <td><button className="small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
