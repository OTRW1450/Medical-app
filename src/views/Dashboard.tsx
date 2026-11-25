import { useMemo } from 'react';
import { usePatient } from '../state';
import { ageAt, daysBetween, fmtDate, fmtSpan, toTime, today } from '../lib/dates';
import { href } from '../lib/router';
import { isAbnormal, labStatus } from '../analysis/corpus';
import { firstAppearances } from '../analysis/timeline';
import { mean } from '../analysis/logs';
import { LineChart, BarList } from '../components/charts';
import { InsightCard } from './InsightsView';
import { Icon } from '../components/Icons';

export function Dashboard() {
  const { patient, events, meds, labs, logs, insights, insightStates } = usePatient();
  const now = today();
  const onsets = useMemo(() => firstAppearances(events), [events]);
  const first = onsets[0];
  const specialties = new Set(events.map((e) => e.specialty).filter(Boolean));
  const abnormal = labs.filter((l) => isAbnormal(labStatus(l)));
  const current = meds.filter((m) => !m.endDate || m.endDate >= now);
  const recent = logs.filter((l) => daysBetween(l.date, now) < 30);
  const problems = events.filter((e) => e.type === 'diagnosis' && (e.status === 'active' || e.status === 'suspected'));
  const top = insights.filter((i) => insightStates.get(i.key)?.state !== 'dismissed' && (i.level === 'important' || insightStates.get(i.key)?.state === 'pinned')).slice(0, 5);
  const openFollow = insights.filter((i) => i.category === 'followup' && insightStates.get(i.key)?.state !== 'dismissed').length;

  const bySystem = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of events) for (const s of e.systems) c.set(s, (c.get(s) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  const last90 = logs.filter((l) => daysBetween(l.date, logs[logs.length - 1]?.date ?? now) < 90);
  const age = ageAt(patient.dob, now);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{patient.name}</h1>
          <p className="muted">
            {age !== undefined && `${age} years · `}
            {first ? `First recorded problem ${fmtDate(first.date, first.datePrecision)} (${first.title})` : 'Add the first symptom to start the timeline'}
          </p>
        </div>
        <div className="spacer" />
        <a className="btn" href={href('import')}>
          <Icon.upload /> Import documents
        </a>
        <a className="btn" href={href('log')}>
          <Icon.log /> Log today
        </a>
        <a className="btn" href={href('records', { new: 'visit' })}>
          <Icon.plus /> Add record
        </a>
        <a className="btn" href={href('labs')}>
          <Icon.labs /> Add labs
        </a>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <Stat label="Living with this for" value={first ? fmtSpan(daysBetween(first.date, now)) : '–'} sub={`${onsets.length} distinct problems recorded`} />
        <Stat label="Specialties involved" value={String(specialties.size)} sub={`${events.filter((e) => e.type === 'visit').length} appointments · ${events.filter((e) => e.type === 'imaging').length} scans`} />
        <Stat label="Abnormal lab results" value={String(abnormal.length)} sub={`of ${labs.length} results`} />
        <Stat label="Average pain, last 30 days" value={recent.length ? mean(recent.map((l) => l.pain)).toFixed(1) : '–'} sub={recent.length ? `${recent.filter((l) => l.pain >= 7).length} bad days (7+) · ${recent.length} logged` : 'No diary entries this month'} />
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="row between" style={{ margin: '4px 0 8px' }}>
            <h2 style={{ margin: 0 }}>Most important patterns</h2>
            <a href={href('insights')}>All {insights.length} →</a>
          </div>
          {top.length ? top.map((i) => <InsightCard key={i.key} i={i} compact />) : (
            <div className="card muted">No strong patterns yet. Add more of the history – diagnoses, scan reports, labs, medications – and keep the diary for a few weeks.</div>
          )}
          {openFollow > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <b>▲ {openFollow} possible loose end{openFollow > 1 ? 's' : ''}</b>
              <p className="muted" style={{ margin: 0 }}>Recommended follow-ups, referrals and abnormal results with nothing recorded afterwards. <a href={href('insights')}>Review</a></p>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {logs.length > 0 && (
            <div className="card">
              <h3>Pain – last 90 days of diary</h3>
              <LineChart series={[{ id: 'p', label: 'Pain', color: 'var(--s8)', points: last90.map((l) => ({ t: toTime(l.date), v: l.pain })) }]} yMin={0} yMax={10} height={160} />
            </div>
          )}
          <div className="card">
            <h3>Active & suspected diagnoses</h3>
            {problems.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {problems.map((p) => (
                  <li key={p.id}>
                    <a href={href('records', { id: p.id })}>{p.title}</a> <span className="faint">· {fmtDate(p.date, p.datePrecision)}{p.status === 'suspected' ? ' · suspected' : ''}{p.specialty ? ` · ${p.specialty}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">None recorded.</p>}
          </div>
          <div className="card">
            <h3>Current medications</h3>
            {current.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {current.map((m) => <li key={m.id}>{m.name} <span className="faint">{m.dose} {m.reason ? `· ${m.reason}` : ''}</span></li>)}
              </ul>
            ) : <p className="muted">None recorded.</p>}
            <p className="faint" style={{ fontSize: 13, margin: '6px 0 0' }}>{meds.length - current.length} past treatments on file.</p>
          </div>
          {bySystem.length > 0 && (
            <div className="card">
              <h3>Records by body system</h3>
              <BarList rows={bySystem.map(([label, value]) => ({ label, value }))} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
