import { useState } from 'react';
import { db } from '../db/db';
import { usePatient } from '../state';
import { uid } from '../lib/id';
import { fmtDate } from '../lib/dates';
import { CATEGORY_LABEL, type Evidence, type Insight, type InsightCategory } from '../analysis';
import { LevelBadge } from '../components/ui';

export function evidenceHref(e: Evidence): string | undefined {
  if (!e.id) return e.kind === 'log' ? '#/log' : e.kind === 'patient' ? '#/data' : undefined;
  if (e.kind === 'event') return `#/records?id=${e.id}`;
  if (e.kind === 'med') return `#/meds?id=${e.id}`;
  if (e.kind === 'lab') return `#/labs?id=${e.id}`;
  if (e.kind === 'log') return '#/log';
  return undefined;
}

export function InsightCard({ i, compact }: { i: Insight; compact?: boolean }) {
  const { patient, insightStates, questions } = usePatient();
  const st = insightStates.get(i.key);
  const setState = async (state: 'pinned' | 'dismissed' | null) => {
    const id = `${patient.id}:${i.key}`;
    if (!state) await db.insightStates.delete(id);
    else await db.insightStates.put({ id, patientId: patient.id, key: i.key, state });
  };
  const asked = questions.some((q) => q.source === i.key);
  const addQuestion = async () => {
    const text =
      i.category === 'cluster'
        ? `Could ${i.title.split(' features of ')[1] ?? 'this pattern'} explain several of my problems? (${i.evidence.length} clues in my record)`
        : `${i.title} – what does this mean and does it need follow-up?`;
    await db.questions.add({ id: uid(), patientId: patient.id, text, forSpecialty: i.specialty, source: i.key, done: false, createdAt: Date.now() });
  };
  return (
    <div className={`card insight ${i.level}`} style={st?.state === 'dismissed' ? { opacity: 0.55 } : undefined}>
      <div className="head">
        <h3>
          {st?.state === 'pinned' && '📌 '}
          {i.title}
        </h3>
        <LevelBadge level={i.level} />
      </div>
      {i.score !== undefined && (
        <div className="row" style={{ margin: '6px 0', gap: 8 }}>
          <div className="meter" aria-label={`${Math.round(i.score * 100)}% of features found`}>
            <div style={{ width: `${i.score * 100}%` }} />
          </div>
          <span className="faint" style={{ fontSize: 12 }}>{Math.round(i.score * 100)}% of listed features found{i.specialty ? ` · ${i.specialty}` : ''}</span>
        </div>
      )}
      <p style={{ marginTop: 6 }}>{i.detail}</p>
      {!compact && (
        <>
          {i.evidence.length > 0 && (
            <details open={i.category === 'cluster'}>
              <summary>Evidence in the record ({i.evidence.length})</summary>
              <ul>
                {i.evidence.map((e, k) => {
                  const h = evidenceHref(e);
                  return (
                    <li key={k}>
                      {e.date && <span className="faint tabnum">{fmtDate(e.date)} · </span>}
                      {h ? <a href={h}>{e.label}</a> : e.label}
                      {e.quote && e.kind !== 'lab' && <div className="quote">“{e.quote}”</div>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {i.missing && i.missing.length > 0 && (
            <details>
              <summary>Other features of this pattern not found in the record ({i.missing.length}) – worth asking about</summary>
              <ul>{i.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </details>
          )}
          {i.suggestions && i.suggestions.length > 0 && (
            <details open={i.category !== 'cluster'}>
              <summary>Things to ask / check</summary>
              <ul>{i.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
            </details>
          )}
        </>
      )}
      <div className="row no-print" style={{ marginTop: 10, gap: 6 }}>
        <button className="small" onClick={addQuestion} disabled={asked}>{asked ? '✓ In question list' : '+ Add to questions for doctor'}</button>
        <button className="small" onClick={() => setState(st?.state === 'pinned' ? null : 'pinned')}>{st?.state === 'pinned' ? 'Unpin' : '📌 Pin'}</button>
        <button className="small ghost" onClick={() => setState(st?.state === 'dismissed' ? null : 'dismissed')}>{st?.state === 'dismissed' ? 'Restore' : 'Not relevant'}</button>
      </div>
    </div>
  );
}

export function InsightsView() {
  const { insights, insightStates } = usePatient();
  const [cat, setCat] = useState<InsightCategory | 'all' | 'pinned'>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const counts = new Map<string, number>();
  for (const i of insights) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const visible = insights.filter((i) => {
    const st = insightStates.get(i.key)?.state;
    if (st === 'dismissed' && !showDismissed) return false;
    if (cat === 'pinned') return st === 'pinned';
    return cat === 'all' || i.category === cat;
  });
  const pinnedFirst = [...visible].sort((a, b) => Number(insightStates.get(b.key)?.state === 'pinned') - Number(insightStates.get(a.key)?.state === 'pinned'));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Patterns & loose ends</h1>
          <p className="muted">Connections across years, specialists and data types that are easy to miss when each appointment looks at one piece.</p>
        </div>
      </div>
      <div className="banner">
        These are <b>prompts for a conversation with your clinicians, not diagnoses</b>. They come from keyword matching and simple statistics on what has been entered here – they can be wrong, and missing records can hide or create patterns. The more complete and verbatim the records, the better the results.
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All · {insights.length}</button>
        <button className={`chip${cat === 'pinned' ? ' on' : ''}`} onClick={() => setCat('pinned')}>📌 Pinned</button>
        {(Object.keys(CATEGORY_LABEL) as InsightCategory[]).filter((c) => counts.get(c)).map((c) => (
          <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
            {CATEGORY_LABEL[c]} · {counts.get(c)}
          </button>
        ))}
        <label className="check" style={{ marginLeft: 8 }}><input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show dismissed</label>
      </div>
      {!pinnedFirst.length ? (
        <div className="card"><p className="muted">Nothing here yet. Add records, labs, medications and diary entries – patterns appear as the picture fills in.</p></div>
      ) : (
        pinnedFirst.map((i) => <InsightCard key={i.key} i={i} />)
      )}
    </>
  );
}
