import { useEffect, useMemo, useRef, useState } from 'react';
import { usePatient } from '../state';
import { attachments as attStore } from '../db/store';
import { extractText, fileKind, sha256, stopOcr, type Extracted, type ExtractProgress } from '../importer/extract';
import { DOC_KIND_LABEL, parseDocument, type DocKind, type ParsedDoc } from '../importer/parse';
import type { DateOrder } from '../importer/text';
import { saveImport, type SaveResult } from '../importer/save';
import { fmtDate, today } from '../lib/dates';
import { href } from '../lib/router';
import { uid } from '../lib/id';
import { BODY_REGIONS } from '../lib/taxonomy';
import { EVENT_TYPE_LABEL, type DiagnosisStatus, type EventType } from '../types';
import { labStatus } from '../analysis/corpus';
import { Field, Modal, TagInput, useLocalState } from '../components/ui';
import { StatusBadge } from './LabsView';

type Status = 'waiting' | 'reading' | 'ready' | 'saving' | 'saved' | 'skipped' | 'error';
interface Item {
  id: string;
  file: File;
  status: Status;
  progress?: ExtractProgress;
  extracted?: Extracted;
  parsed?: ParsedDoc;
  sha?: string;
  duplicateFile?: boolean;
  error?: string;
  result?: SaveResult;
  kind?: DocKind; // user override
  order?: DateOrder; // user override
}

const localeOrder = (): DateOrder => (/^en-(US|PH|CA)|^es-US/i.test(navigator.language) ? 'mdy' : 'dmy');

function progressText(p?: ExtractProgress) {
  if (!p) return 'Waiting…';
  if (p.stage === 'reading') return `Reading page ${p.page} of ${p.pages}…`;
  if (p.stage === 'ocr-loading') return `Loading the text-recognition engine (first time only)… ${Math.round((p.pct ?? 0) * 100)}%`;
  return `Recognising text${p.pages && p.pages > 1 ? ` on page ${p.page} of ${p.pages}` : ''}… ${Math.round((p.pct ?? 0) * 100)}%`;
}

export function ImportView() {
  const data = usePatient();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [defaultOrder, setDefaultOrder] = useLocalState<DateOrder>('imp:order', localeOrder());
  const [drag, setDrag] = useState(false);
  const busy = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const parse = (it: Item, text: string, over: Partial<Pick<Item, 'kind' | 'order'>> = {}) =>
    parseDocument(text, {
      data: dataRef.current,
      fileName: it.file.name,
      forceKind: over.kind ?? it.kind,
      dateOrder: over.order ?? it.order,
      defaultOrder,
      today: today(),
    });

  // Process the queue one file at a time.
  useEffect(() => {
    if (busy.current) return;
    const next = items.find((i) => i.status === 'waiting');
    if (!next) {
      if (!items.some((i) => i.status === 'reading')) stopOcr();
      return;
    }
    busy.current = true;
    (async () => {
      patch(next.id, { status: 'reading' });
      try {
        const buf = await next.file.arrayBuffer();
        const sha = await sha256(buf);
        const known = await attStore.metaByPatient(dataRef.current.patient.id);
        const extracted = await extractText(next.file, (progress) => patch(next.id, { progress }));
        const parsed = parse(next, extracted.text);
        if (extracted.ocrPages && (extracted.ocrConfidence ?? 100) < 70)
          parsed.warnings.unshift(`This looks like a scan or photo and the text was hard to read (confidence ${Math.round(extracted.ocrConfidence ?? 0)}%). Please check everything carefully.`);
        if (!extracted.text.trim()) parsed.warnings.unshift('No text could be read from this file.');
        patch(next.id, { status: 'ready', extracted, parsed, sha, duplicateFile: known.some((k) => k.sha256 === sha) });
        setSelected((s) => s ?? next.id);
      } catch (e) {
        patch(next.id, { status: 'error', error: (e as Error).message });
      } finally {
        busy.current = false;
        setItems((xs) => [...xs]); // trigger next
      }
    })();
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | File[]) => {
    const list = [...files].map((file): Item => ({
      id: uid(),
      file,
      status: fileKind(file) === 'unsupported' ? 'error' : 'waiting',
      error: fileKind(file) === 'unsupported' ? 'This file type can’t be read. Use PDF, a photo (JPG/PNG) or a text file.' : undefined,
    }));
    setItems((xs) => [...xs, ...list]);
  };

  const current = items.find((i) => i.id === selected);
  const pending = items.filter((i) => i.status === 'waiting' || i.status === 'reading').length;
  const goNext = (afterId: string) => {
    const idx = items.findIndex((i) => i.id === afterId);
    const nxt = [...items.slice(idx + 1), ...items.slice(0, idx)].find((i) => i.status === 'ready');
    setSelected(nxt?.id ?? afterId);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import documents</h1>
          <p className="muted">Add PDFs or photos of lab results, scan reports, visit notes, letters and discharge summaries. They’re read <b>on this device</b> – nothing is uploaded – and you check everything before it’s saved.</p>
        </div>
      </div>

      <label
        className={`dropzone no-print${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <input type="file" multiple accept=".pdf,application/pdf,image/*,.txt,text/plain" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        <div style={{ fontSize: 28 }}>📄</div>
        <b>Choose files or drop them here</b>
        <span className="muted">PDF, JPG/PNG photos of paper records, or text · as many as you like</span>
      </label>
      <div className="row faint" style={{ fontSize: 13, margin: '8px 0 14px' }}>
        Dates like 03/05/2024 mean:
        <div className="segmented">
          <button className={defaultOrder === 'dmy' ? 'on' : ''} onClick={() => setDefaultOrder('dmy')}>3 May (DD/MM)</button>
          <button className={defaultOrder === 'mdy' ? 'on' : ''} onClick={() => setDefaultOrder('mdy')}>March 5 (MM/DD)</button>
        </div>
        <span>– used when a document doesn’t make it clear.</span>
      </div>

      {items.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr', alignItems: 'start' }}>
          <div className="card" style={{ padding: 8 }}>
            <div className="faint" style={{ fontSize: 12, padding: '2px 6px 6px' }}>{items.length} file{items.length > 1 ? 's' : ''}{pending ? ` · ${pending} being read` : ''}</div>
            {items.map((it) => (
              <button key={it.id} className={`queue-item${it.id === selected ? ' on' : ''}`} onClick={() => setSelected(it.id)} disabled={it.status === 'waiting'}>
                <span className="qi-name">{it.file.name}</span>
                <span className="qi-status">
                  {it.status === 'reading' ? progressText(it.progress) : it.status === 'ready' ? `▶ Ready to check · ${it.parsed ? DOC_KIND_LABEL[it.parsed.kind] : ''}` : it.status === 'saved' ? '✓ Saved' : it.status === 'skipped' ? 'Skipped' : it.status === 'error' ? `⚠ ${it.error}` : it.status === 'saving' ? 'Saving…' : 'Waiting…'}
                </span>
              </button>
            ))}
          </div>
          <div>
            {current?.status === 'ready' && current.parsed ? (
              <Review
                key={current.id + (current.kind ?? '') + (current.order ?? '')}
                item={current}
                onChange={(parsed) => patch(current.id, { parsed })}
                onReparse={(over) => patch(current.id, { ...over, parsed: parse(current, current.extracted!.text, over) })}
                onSkip={() => { patch(current.id, { status: 'skipped' }); goNext(current.id); }}
                onSave={async () => {
                  patch(current.id, { status: 'saving' });
                  const result = await saveImport(current.parsed!, dataRef.current, { file: current.file, sha256: current.sha });
                  patch(current.id, { status: 'saved', result });
                }}
              />
            ) : current?.status === 'saved' && current.result ? (
              <div className="card">
                <h3>✓ Saved from {current.file.name}</h3>
                <p>
                  1 record{current.result.diagnoses ? `, ${current.result.diagnoses} diagnos${current.result.diagnoses > 1 ? 'es' : 'is'}` : ''}
                  {current.result.labs ? `, ${current.result.labs} lab result${current.result.labs > 1 ? 's' : ''}` : ''}
                  {current.result.meds ? `, ${current.result.meds} medication update${current.result.meds > 1 ? 's' : ''}` : ''}
                  {current.result.allergies ? `, ${current.result.allergies} allerg${current.result.allergies > 1 ? 'ies' : 'y'}` : ''}. The original file is attached to the record.
                </p>
                <div className="row">
                  <a className="btn" href={href('records', { id: current.result.mainEventId })}>Open the record</a>
                  <a className="btn" href={href('timeline')}>See the timeline</a>
                  {items.some((i) => i.status === 'ready') && <button className="primary" onClick={() => goNext(current.id)}>Next document →</button>}
                </div>
              </div>
            ) : current?.status === 'error' ? (
              <div className="card"><h3>⚠ Couldn’t read {current.file.name}</h3><p className="muted">{current.error}</p></div>
            ) : current?.status === 'skipped' ? (
              <div className="card"><p className="muted">Skipped – nothing was saved from this file.</p><button onClick={() => patch(current.id, { status: 'ready' })}>Check it again</button></div>
            ) : (
              <div className="card muted">{pending ? progressText(items.find((i) => i.status === 'reading')?.progress) : 'Choose a file on the left.'}</div>
            )}
          </div>
        </div>
      )}

      {!items.length && (
        <div className="card">
          <h3>How it works</h3>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            <li><b>Read</b> – typed PDFs are read directly; scans and photos go through text recognition on this device.</li>
            <li><b>Sort</b> – each document is recognised as lab results, a scan report, a visit note/letter or a discharge summary, and dates, results, diagnoses, medications, referrals and follow-ups are picked out.</li>
            <li><b>Check</b> – you see everything it found next to the original, fix anything and untick what you don’t want.</li>
            <li><b>Save</b> – it goes into the timeline, patterns, lab trends and reports. The original file is attached to the record.</li>
          </ol>
          <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>Works best with computer-generated PDFs from patient portals and labs. Scans and photos need more checking; handwriting usually can’t be read.</p>
        </div>
      )}
    </>
  );
}

const STATUSES: DiagnosisStatus[] = ['active', 'suspected', 'resolved', 'ruled-out'];
const ACTION_LABEL = { start: 'Start', stop: 'Stop', change: 'Dose change', list: 'On medication list' } as const;

function Review({ item, onChange, onReparse, onSkip, onSave }: {
  item: Item;
  onChange: (p: ParsedDoc) => void;
  onReparse: (over: Partial<Pick<Item, 'kind' | 'order'>>) => void;
  onSkip: () => void;
  onSave: () => void;
}) {
  const p = item.parsed!;
  const [showOriginal, setShowOriginal] = useState(false);
  const url = useMemo(() => URL.createObjectURL(item.file), [item.file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const ev = p.main.event;
  const setMain = (patch: Partial<typeof ev>) => onChange({ ...p, main: { ...p.main, event: { ...ev, ...patch } } });
  const setDate = (date: string) => {
    if (!date) return;
    const old = ev.date;
    onChange({
      ...p,
      date,
      main: { ...p.main, event: { ...ev, date } },
      diagnoses: p.diagnoses.map((d) => (d.event.date === old ? { ...d, event: { ...d.event, date } } : d)),
      labs: p.labs.map((l) => (l.lab.date === old ? { ...l, lab: { ...l.lab, date } } : l)),
      meds: p.meds.map((m) => ({ ...m, med: { ...m.med, startDate: m.med.startDate === old ? date : m.med.startDate, endDate: m.med.endDate === old ? date : m.med.endDate } })),
    });
  };
  const count = 1 + [...p.diagnoses, ...p.labs, ...p.meds, ...p.allergies].filter((x) => x.include).length;
  const toggleAll = (key: 'diagnoses' | 'labs' | 'meds' | 'allergies', on: boolean) =>
    onChange({ ...p, [key]: (p[key] as { include: boolean }[]).map((x) => ({ ...x, include: on })) });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>{item.file.name}</h2>
            <div className="faint" style={{ fontSize: 13 }}>
              {item.extracted!.pages} page{item.extracted!.pages > 1 ? 's' : ''}
              {item.extracted!.ocrPages ? ` · text recognised from ${item.extracted!.ocrPages} scanned page${item.extracted!.ocrPages > 1 ? 's' : ''}${item.extracted!.ocrConfidence !== undefined ? ` (confidence ${Math.round(item.extracted!.ocrConfidence)}%)` : ''}` : ''}
            </div>
          </div>
          <button onClick={() => setShowOriginal(true)}>View original</button>
        </div>
        {item.duplicateFile && <div className="banner warn" style={{ marginTop: 10 }}>This exact file has been imported before.</div>}
        {p.warnings.map((w) => <div key={w} className="banner warn" style={{ marginTop: 10 }}>▲ {w}</div>)}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="What kind of document is this?">
            <select value={p.kind} onChange={(e) => onReparse({ kind: e.target.value as DocKind })}>
              {(Object.keys(DOC_KIND_LABEL) as DocKind[]).map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label={ev.type === 'hospitalization' ? 'Admitted' : 'Date'} hint={p.dates.length ? `Dates found: ${[...new Set(p.dates.filter((d) => d.role !== 'dob').map((d) => fmtDate(d.iso)))].slice(0, 4).join(', ')}` : undefined}>
            <input type="date" value={ev.date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {ev.type === 'hospitalization' && (
            <Field label="Discharged"><input type="date" value={ev.endDate ?? ''} onChange={(e) => setMain({ endDate: e.target.value || undefined })} /></Field>
          )}
          <Field label="Numeric dates in this document">
            <div className="segmented">
              <button className={p.dateOrder === 'dmy' ? 'on' : ''} onClick={() => onReparse({ order: 'dmy' })}>DD/MM</button>
              <button className={p.dateOrder === 'mdy' ? 'on' : ''} onClick={() => onReparse({ order: 'mdy' })}>MM/DD</button>
            </div>
          </Field>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ fontSize: 13.5 }}>Show the text that was read</summary>
          <pre className="extracted">{item.extracted!.text}</pre>
        </details>
      </div>

      <div className="card">
        <h3>Record for the timeline</h3>
        <div className="form-grid">
          <Field label="Type">
            <select value={ev.type} onChange={(e) => setMain({ type: e.target.value as EventType })}>
              {(['visit', 'imaging', 'lab', 'hospitalization', 'procedure', 'surgery', 'note'] as EventType[]).map((t) => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Title" full><input value={ev.title} onChange={(e) => setMain({ title: e.target.value })} /></Field>
          <Field label="Specialty"><input value={ev.specialty ?? ''} onChange={(e) => setMain({ specialty: e.target.value || undefined })} /></Field>
          <Field label="Clinician"><input value={ev.provider ?? ''} onChange={(e) => setMain({ provider: e.target.value || undefined })} /></Field>
          <Field label="Body areas" full><TagInput value={ev.bodyRegions} onChange={(v) => setMain({ bodyRegions: v })} suggestions={BODY_REGIONS} showSuggestions={false} /></Field>
          <Field label="Text kept with the record" hint="The pattern finder reads this wording." full>
            <textarea value={ev.findings ?? ''} onChange={(e) => setMain({ findings: e.target.value })} style={{ minHeight: 140 }} />
          </Field>
          <label className="check full"><input type="checkbox" checked={!!ev.followUpRecommended} onChange={(e) => setMain({ followUpRecommended: e.target.checked })} /> Follow-up was recommended</label>
        </div>
        {p.planItems.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>Plan items found (kept in the text above; the pattern finder will flag them if nothing follows):</div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 14 }}>{p.planItems.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      </div>

      {p.diagnoses.length > 0 && (
        <Group title="Diagnoses" n={p.diagnoses.filter((d) => d.include).length} total={p.diagnoses.length} onAll={(on) => toggleAll('diagnoses', on)}>
          {p.diagnoses.map((d, i) => (
            <div className={`prop-row${d.include ? '' : ' off'}`} key={d.id}>
              <input type="checkbox" checked={d.include} aria-label={`Include ${d.event.title}`} onChange={(e) => onChange({ ...p, diagnoses: p.diagnoses.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input value={d.event.title} onChange={(e) => onChange({ ...p, diagnoses: p.diagnoses.map((x, j) => (j === i ? { ...x, event: { ...x.event, title: e.target.value } } : x)) })} />
                  <select value={d.event.status} style={{ width: 130 }} onChange={(e) => onChange({ ...p, diagnoses: p.diagnoses.map((x, j) => (j === i ? { ...x, event: { ...x.event, status: e.target.value as DiagnosisStatus } } : x)) })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {(d.note || (d.source && d.source !== d.event.title)) && <div className="prop-note">{d.note && <b>{d.note}. </b>}{d.source && d.source !== d.event.title && <>From: “{d.source}”</>}</div>}
              </div>
            </div>
          ))}
        </Group>
      )}

      {p.meds.length > 0 && (
        <Group title="Medications" n={p.meds.filter((d) => d.include).length} total={p.meds.length} onAll={(on) => toggleAll('meds', on)}>
          {p.meds.map((m, i) => (
            <div className={`prop-row${m.include ? '' : ' off'}`} key={m.id}>
              <input type="checkbox" checked={m.include} aria-label={`Include ${m.med.name}`} onChange={(e) => onChange({ ...p, meds: p.meds.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className={`badge ${m.action === 'stop' ? 'notable' : m.action === 'start' ? 'good' : 'info'}`} style={{ width: 120, justifyContent: 'center' }}>{ACTION_LABEL[m.action]}</span>
                  <input value={m.med.name} onChange={(e) => onChange({ ...p, meds: p.meds.map((x, j) => (j === i ? { ...x, med: { ...x.med, name: e.target.value } } : x)) })} style={{ maxWidth: 200 }} />
                  <input value={m.med.dose ?? ''} placeholder="dose" onChange={(e) => onChange({ ...p, meds: p.meds.map((x, j) => (j === i ? { ...x, med: { ...x.med, dose: e.target.value || undefined } } : x)) })} />
                </div>
                <div className="prop-note">{m.note && <b>{m.note}. </b>}{m.med.stopReason && <>Reason: {m.med.stopReason}. </>}{m.source && <>From: “{m.source}”</>}</div>
              </div>
            </div>
          ))}
        </Group>
      )}

      {p.labs.length > 0 && (
        <Group title="Lab results" n={p.labs.filter((d) => d.include).length} total={p.labs.length} onAll={(on) => toggleAll('labs', on)}>
          <div className="table-wrap">
            <table>
              <thead><tr><th /><th>Test</th><th className="num">Result</th><th>Unit</th><th>Range</th><th>Status</th><th>Read from</th></tr></thead>
              <tbody>
                {p.labs.map((l, i) => {
                  const set = (patch: Partial<typeof l.lab>) => onChange({ ...p, labs: p.labs.map((x, j) => (j === i ? { ...x, lab: { ...x.lab, ...patch } } : x)) });
                  return (
                    <tr key={l.id} className={l.include ? '' : 'off'}>
                      <td><input type="checkbox" checked={l.include} aria-label={`Include ${l.lab.test}`} onChange={(e) => onChange({ ...p, labs: p.labs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} /></td>
                      <td><input value={l.lab.test} onChange={(e) => set({ test: e.target.value })} style={{ minWidth: 120 }} /></td>
                      <td className="num"><input value={l.lab.value ?? l.lab.textValue ?? ''} style={{ width: 90, textAlign: 'right' }} onChange={(e) => { const v = e.target.value; const n = Number(v); set(v.trim() !== '' && Number.isFinite(n) ? { value: n, textValue: undefined } : { value: undefined, textValue: v }); }} /></td>
                      <td><input value={l.lab.unit ?? ''} style={{ width: 70 }} onChange={(e) => set({ unit: e.target.value || undefined })} /></td>
                      <td className="tabnum" style={{ whiteSpace: 'nowrap' }}>{l.lab.refLow ?? ''}{l.lab.refLow !== undefined || l.lab.refHigh !== undefined ? '–' : ''}{l.lab.refHigh ?? ''}</td>
                      <td><StatusBadge s={labStatus(l.lab)} />{l.duplicate && <div className="faint" style={{ fontSize: 12 }}>already saved</div>}</td>
                      <td className="faint" style={{ fontSize: 12, maxWidth: 220 }}>{l.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Group>
      )}

      {p.allergies.length > 0 && (
        <Group title="Allergies" n={p.allergies.filter((d) => d.include).length} total={p.allergies.length} onAll={(on) => toggleAll('allergies', on)}>
          {p.allergies.map((a, i) => (
            <div className={`prop-row${a.include ? '' : ' off'}`} key={a.id}>
              <input type="checkbox" checked={a.include} aria-label={`Include ${a.text}`} onChange={(e) => onChange({ ...p, allergies: p.allergies.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} />
              <div style={{ flex: 1 }}>{a.text}{a.note && <div className="prop-note"><b>{a.note}</b></div>}</div>
            </div>
          ))}
        </Group>
      )}

      <div className="card row between" style={{ position: 'sticky', bottom: 8, zIndex: 5 }}>
        <span className="muted">{count} item{count > 1 ? 's' : ''} will be saved, with the original file attached.</span>
        <div className="row">
          <button onClick={onSkip}>Skip this document</button>
          <button className="primary" onClick={onSave} disabled={!ev.title.trim() || !ev.date}>Save {count} item{count > 1 ? 's' : ''}</button>
        </div>
      </div>

      {showOriginal && (
        <Modal title={item.file.name} onClose={() => setShowOriginal(false)}>
          {item.file.type.startsWith('image/') ? <img src={url} alt={item.file.name} style={{ maxWidth: '100%' }} /> : fileKind(item.file) === 'pdf' ? <iframe src={url} title={item.file.name} style={{ width: '100%', height: '75vh', border: 0 }} /> : <pre className="extracted">{item.extracted!.text}</pre>}
        </Modal>
      )}
    </div>
  );
}

function Group({ title, n, total, onAll, children }: { title: string; n: number; total: number; onAll: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{title} <span className="faint" style={{ fontWeight: 400 }}>· {n} of {total} selected</span></h3>
        <div className="row">
          <button className="small ghost" onClick={() => onAll(true)}>Select all</button>
          <button className="small ghost" onClick={() => onAll(false)}>None</button>
        </div>
      </div>
      {children}
    </div>
  );
}
