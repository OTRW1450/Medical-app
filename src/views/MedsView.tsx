import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { usePatient } from '../state';
import { uid } from '../lib/id';
import { fmtDate, fmtSpan, daysBetween, toTime, today } from '../lib/dates';
import type { Medication } from '../types';
import { Swimlane } from '../components/charts';
import { Empty, Field, Modal } from '../components/ui';
import { Icon } from '../components/Icons';
import { medEffects } from '../analysis/logs';
import { medClassWords } from '../analysis/corpus';

const EFFECT = ['Made it worse', 'Slightly worse', 'No effect', 'Helped', 'Helped a lot'];
const EFFECT_COLOR = ['var(--critical)', 'var(--serious)', 'var(--muted)', 'var(--s3)', 'var(--good)'];

export function MedsView({ params }: { params: URLSearchParams }) {
  const d = usePatient();
  const { patient, meds } = d;
  const [editing, setEditing] = useState<Medication | null>(null);
  const focus = params.get('id');
  const effects = useMemo(() => new Map(medEffects(d).map((e) => [e.medId, e])), [d]);
  const current = meds.filter((m) => !m.endDate || m.endDate >= today());
  const past = meds.filter((m) => m.endDate && m.endDate < today());

  const now = toTime(today());
  const t0 = meds.length ? Math.min(...meds.map((m) => toTime(m.startDate))) : now;
  const lanes = useMemo(() => {
    const groups = new Map<string, Medication[]>();
    for (const m of meds) {
      const k = medClassWords(m)[0] ?? m.drugClass ?? 'Other';
      groups.set(k, [...(groups.get(k) ?? []), m]);
    }
    return groups;
  }, [meds]);

  const row = (m: Medication) => {
    const e = effects.get(m.id);
    return (
      <tr key={m.id} className={`clickable${focus === m.id ? ' flash' : ''}`} onClick={() => setEditing(m)}>
        <td>
          <b>{m.name}</b> {m.dose && <span className="muted">{m.dose}</span>}
          <div className="faint" style={{ fontSize: 12 }}>{medClassWords(m).join(', ')}</div>
        </td>
        <td>{m.reason}</td>
        <td className="tabnum" style={{ whiteSpace: 'nowrap' }}>
          {fmtDate(m.startDate)} {m.endDate ? `→ ${fmtDate(m.endDate)}` : '→ now'}
          <div className="faint" style={{ fontSize: 12 }}>{fmtSpan(daysBetween(m.startDate, m.endDate ?? today()))}</div>
        </td>
        <td>
          {m.effectiveness !== undefined && (
            <span className="row" style={{ gap: 5 }}>
              <span className="dot" style={{ background: EFFECT_COLOR[m.effectiveness + 2] }} />
              {EFFECT[m.effectiveness + 2]}
            </span>
          )}
          {e && (
            <div className="faint" style={{ fontSize: 12 }} title={`${e.nBefore} days before vs ${e.nAfter} days after`}>
              Diary: pain {e.before.toFixed(1)} → {e.after.toFixed(1)}
            </div>
          )}
        </td>
        <td className="muted" style={{ fontSize: 13 }}>{[m.sideEffects, m.stopReason && `Stopped: ${m.stopReason}`].filter(Boolean).join(' · ')}</td>
      </tr>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Medications & treatments</h1>
          <p className="muted">Everything tried, when, why and whether it helped – so nothing gets re-tried blindly and responses can be used as clues.</p>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => setEditing({ id: uid(), patientId: patient.id, name: '', startDate: today(), createdAt: Date.now() })}>
          <Icon.plus /> Add medication
        </button>
      </div>
      {!meds.length ? (
        <div className="card"><Empty title="No medications recorded">Include past ones – especially ones that didn’t work or caused side effects.</Empty></div>
      ) : (
        <>
          <div className="card">
            <h3>Treatment history</h3>
            <Swimlane
              lanes={[...lanes.keys()].map((k) => ({ key: k, label: k }))}
              domain={[Date.UTC(new Date(t0).getUTCFullYear(), 0, 1), now + 30 * 86_400_000]}
              items={meds.map((m) => ({
                id: m.id,
                lane: medClassWords(m)[0] ?? m.drugClass ?? 'Other',
                start: toTime(m.startDate),
                end: m.endDate ? toTime(m.endDate) : now,
                label: `${m.name} ${m.dose ?? ''}`,
                color: m.effectiveness !== undefined ? EFFECT_COLOR[m.effectiveness + 2] : 'var(--s1)',
                detail: m.effectiveness !== undefined ? EFFECT[m.effectiveness + 2] : m.reason,
              }))}
              onSelect={(it) => setEditing(meds.find((m) => m.id === it.id) ?? null)}
            />
            <div className="legend">
              {EFFECT.map((e, i) => <span key={e}><span className="dot" style={{ background: EFFECT_COLOR[i] }} />{e}</span>)}
              <span><span className="dot" style={{ background: 'var(--s1)' }} />Not rated</span>
            </div>
          </div>
          <div className="card">
            <h3>Current ({current.length})</h3>
            <div className="table-wrap"><table><thead><tr><th>Medication</th><th>For</th><th>When</th><th>Effect</th><th>Side effects / notes</th></tr></thead><tbody>{current.map(row)}</tbody></table></div>
          </div>
          <div className="card">
            <h3>Past ({past.length})</h3>
            <div className="table-wrap"><table><thead><tr><th>Medication</th><th>For</th><th>When</th><th>Effect</th><th>Side effects / notes</th></tr></thead><tbody>{[...past].reverse().map(row)}</tbody></table></div>
          </div>
        </>
      )}
      {editing && <MedForm med={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MedForm({ med, onClose }: { med: Medication; onClose: () => void }) {
  const { meds } = usePatient();
  const [m, setM] = useState(med);
  const isNew = !meds.some((x) => x.id === med.id);
  const set = <K extends keyof Medication>(k: K, v: Medication[K]) => setM({ ...m, [k]: v });
  const save = async () => {
    if (!m.name.trim()) return;
    await db.meds.put({ ...m, name: m.name.trim() });
    onClose();
  };
  return (
    <Modal
      title={isNew ? 'Add medication / treatment' : `Edit ${med.name}`}
      onClose={onClose}
      footer={
        <>
          {!isNew && <button className="danger" style={{ marginRight: 'auto' }} onClick={async () => { if (confirm('Delete?')) { await db.meds.delete(m.id); onClose(); } }}>Delete</button>}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={!m.name.trim()}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" hint="Medication, supplement, injection or therapy"><input value={m.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Dose"><input value={m.dose ?? ''} onChange={(e) => set('dose', e.target.value || undefined)} placeholder="e.g. 50 mg twice daily" /></Field>
        <Field label="Drug class (optional)"><input value={m.drugClass ?? ''} onChange={(e) => set('drugClass', e.target.value || undefined)} placeholder="e.g. NSAID, SNRI, biologic" /></Field>
        <Field label="Reason"><input value={m.reason ?? ''} onChange={(e) => set('reason', e.target.value || undefined)} /></Field>
        <Field label="Prescriber"><input value={m.prescriber ?? ''} onChange={(e) => set('prescriber', e.target.value || undefined)} /></Field>
        <Field label="Started"><input type="date" value={m.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Stopped" hint="Leave empty if still taking"><input type="date" value={m.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || undefined)} /></Field>
        <Field label="Did it help?">
          <select value={m.effectiveness ?? ''} onChange={(e) => set('effectiveness', e.target.value === '' ? undefined : (Number(e.target.value) as Medication['effectiveness']))}>
            <option value="">Not rated</option>
            {EFFECT.map((x, i) => <option key={x} value={i - 2}>{x}</option>)}
          </select>
        </Field>
        <Field label="Side effects" full><input value={m.sideEffects ?? ''} onChange={(e) => set('sideEffects', e.target.value || undefined)} /></Field>
        <Field label="Why stopped" full><input value={m.stopReason ?? ''} onChange={(e) => set('stopReason', e.target.value || undefined)} /></Field>
      </div>
    </Modal>
  );
}
