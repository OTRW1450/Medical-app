import { useMemo, useState } from 'react';
import { store } from '../db/store';
import { usePatient } from '../state';
import { uid } from '../lib/id';
import { ageAt, daysBetween, fmtDate, today } from '../lib/dates';
import { EVENT_TYPE_LABEL } from '../types';
import { groupLabs } from '../analysis/labs';
import { isAbnormal, labLabel, labStatus } from '../analysis/corpus';
import { firstAppearances } from '../analysis/timeline';
import { mean } from '../analysis/logs';

const EFFECT = ['made worse', 'slightly worse', 'no effect', 'helped', 'helped a lot'];

export function SummaryView() {
  const { patient, events, meds, labs, logs, questions, insights, insightStates } = usePatient();
  const [newQ, setNewQ] = useState('');
  const now = today();
  const age = ageAt(patient.dob, now);
  const diagnoses = events.filter((e) => e.type === 'diagnosis');
  const active = diagnoses.filter((d) => d.status === 'active' || d.status === 'suspected' || !d.status);
  const ruledOut = diagnoses.filter((d) => d.status === 'ruled-out');
  const keyEvents = useMemo(() => {
    const ids = new Set([...events.filter((e) => e.importance === 3), ...firstAppearances(events).filter((e) => e.type === 'symptom')].map((e) => e.id));
    return events.filter((e) => ids.has(e.id));
  }, [events]);
  const imaging = events.filter((e) => e.type === 'imaging').slice(-8).reverse();
  const abnormalByTest = useMemo(() => {
    const out: { test: string; n: number; total: number; latest: string; latestDate: string; status: string }[] = [];
    for (const [test, rs] of groupLabs(labs)) {
      const ab = rs.filter((r) => isAbnormal(labStatus(r)));
      if (!ab.length) continue;
      const last = rs[rs.length - 1];
      out.push({ test, n: ab.length, total: rs.length, latest: labLabel(last).split(': ')[1], latestDate: last.date, status: labStatus(last) });
    }
    return out;
  }, [labs]);
  const current = meds.filter((m) => !m.endDate || m.endDate >= now);
  const failed = meds.filter((m) => m.endDate && m.endDate < now);
  const recentLogs = logs.filter((l) => daysBetween(l.date, logs[logs.length - 1]?.date ?? now) < 90);
  const topRegions = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of recentLogs) for (const r of l.regions) c.set(r.region, (c.get(r.region) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recentLogs]);
  const patterns = insights.filter((i) => {
    const s = insightStates.get(i.key)?.state;
    return s === 'pinned' || (s !== 'dismissed' && i.level === 'important');
  });
  const openQs = questions.filter((q) => !q.done).sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Doctor summary</h1>
          <p className="muted no-print">A concise, printable overview for a new specialist or a long appointment. Use your browser’s print dialog to save as PDF.</p>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <div className="card">
        <h2>{patient.name}</h2>
        <p>
          {patient.dob && <>Born {fmtDate(patient.dob)} (age {age}) · </>}
          {patient.sex && patient.sex !== 'unspecified' && <>{patient.sex} · </>}
          Summary generated {fmtDate(now)}
        </p>
        {patient.background && <p><b>History in brief:</b> {patient.background}</p>}
        {patient.goals && <p><b>Main question:</b> {patient.goals}</p>}
        {patient.allergies && <p><b>Allergies / reactions:</b> {patient.allergies}</p>}
        {patient.familyHistory && <p><b>Family history:</b> {patient.familyHistory}</p>}
      </div>

      <div className="card">
        <h2>Problem list</h2>
        {active.length ? (
          <table>
            <thead><tr><th>Diagnosis</th><th>Since</th><th>Status</th><th>By</th></tr></thead>
            <tbody>{active.map((d) => <tr key={d.id}><td>{d.title}</td><td className="tabnum">{fmtDate(d.date, d.datePrecision)}</td><td>{d.status ?? 'active'}</td><td>{d.specialty}</td></tr>)}</tbody>
          </table>
        ) : <p className="muted">No diagnoses recorded.</p>}
        {ruledOut.length > 0 && <p style={{ marginTop: 8 }}><b>Ruled out:</b> {ruledOut.map((d) => `${d.title} (${fmtDate(d.date, d.datePrecision)})`).join('; ')}</p>}
      </div>

      <div className="card">
        <h2>Key timeline</h2>
        <table>
          <tbody>
            {keyEvents.map((e) => (
              <tr key={e.id}>
                <td className="tabnum" style={{ width: 110 }}>{fmtDate(e.date, e.datePrecision)}{patient.dob ? <div className="faint">age {ageAt(patient.dob, e.date)}</div> : null}</td>
                <td><b>{e.title}</b> <span className="faint">· {EVENT_TYPE_LABEL[e.type]}{e.specialty ? ` · ${e.specialty}` : ''}</span>{e.findings && <div className="muted" style={{ fontSize: 13 }}>{e.findings}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {imaging.length > 0 && (
        <div className="card">
          <h2>Imaging & investigations (most recent {imaging.length})</h2>
          <table>
            <tbody>
              {imaging.map((e) => (
                <tr key={e.id}><td className="tabnum" style={{ width: 110 }}>{fmtDate(e.date, e.datePrecision)}</td><td><b>{e.title}</b>{e.findings && <div className="muted" style={{ fontSize: 13 }}>{e.findings}</div>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abnormalByTest.length > 0 && (
        <div className="card">
          <h2>Abnormal lab results</h2>
          <table>
            <thead><tr><th>Test</th><th className="num">Abnormal</th><th>Latest</th><th>Latest status</th></tr></thead>
            <tbody>{abnormalByTest.map((a) => <tr key={a.test}><td>{a.test}</td><td className="num">{a.n} of {a.total}</td><td className="tabnum">{a.latest} ({fmtDate(a.latestDate)})</td><td>{a.status}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Medications</h2>
        <p><b>Current:</b> {current.length ? current.map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}${m.reason ? ` (${m.reason})` : ''}`).join('; ') : 'none'}</p>
        {failed.length > 0 && (
          <table>
            <thead><tr><th>Previously tried</th><th>When</th><th>Effect</th><th>Why stopped</th></tr></thead>
            <tbody>
              {failed.map((m) => (
                <tr key={m.id}><td>{m.name} {m.dose}</td><td className="tabnum">{m.startDate.slice(0, 7)} → {m.endDate!.slice(0, 7)}</td><td>{m.effectiveness !== undefined ? EFFECT[m.effectiveness + 2] : ''}</td><td>{[m.stopReason, m.sideEffects].filter(Boolean).join('; ')}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {recentLogs.length > 0 && (
        <div className="card">
          <h2>Symptom diary (last 90 days)</h2>
          <p>
            {recentLogs.length} days logged · average pain <b>{mean(recentLogs.map((l) => l.pain)).toFixed(1)}/10</b> · {recentLogs.filter((l) => l.pain >= 7).length} days at 7+.
            {topRegions.length > 0 && <> Most frequent areas: {topRegions.map(([r, n]) => `${r} (${n} days)`).join(', ')}.</>}
          </p>
        </div>
      )}

      {patterns.length > 0 && (
        <div className="card">
          <h2>Patterns I would like to discuss</h2>
          <p className="faint" style={{ fontSize: 13 }}>Generated by a pattern-finding tool from my own records; offered as questions, not conclusions.</p>
          <ul>
            {patterns.map((i) => (
              <li key={i.key} style={{ marginBottom: 6 }}><b>{i.title}.</b> <span className="muted">{i.detail}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Questions for this appointment</h2>
        <ol>
          {openQs.map((q) => (
            <li key={q.id} style={{ marginBottom: 4 }}>
              {q.text} {q.forSpecialty && <span className="faint">({q.forSpecialty})</span>}
              <span className="no-print">
                {' '}
                <button className="small ghost" onClick={() => store.update('questions', q.id, { done: true })}>✓ Asked</button>
                <button className="small ghost" onClick={() => store.remove('questions', q.id)}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
        {!openQs.length && <p className="muted">No questions yet – add them here or from the Patterns page.</p>}
        <form
          className="row no-print"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newQ.trim()) return;
            await store.put('questions', { id: uid(), patientId: patient.id, text: newQ.trim(), done: false, createdAt: Date.now() });
            setNewQ('');
          }}
        >
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Add a question…" style={{ flex: 1 }} />
          <button type="submit">Add</button>
        </form>
        {questions.some((q) => q.done) && (
          <details className="no-print" style={{ marginTop: 10 }}>
            <summary>Already asked ({questions.filter((q) => q.done).length})</summary>
            <ul>{questions.filter((q) => q.done).map((q) => <li key={q.id}>{q.text} <button className="small ghost" onClick={() => store.update('questions', q.id, { done: false })}>Re-open</button></li>)}</ul>
          </details>
        )}
      </div>
    </>
  );
}
