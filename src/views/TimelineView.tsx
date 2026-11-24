import { useMemo, useState } from 'react';
import { usePatient } from '../state';
import { EVENT_TYPE_LABEL, type EventType, type MedicalEvent } from '../types';
import { ageAt, fmtDate, toTime, today, yearOf } from '../lib/dates';
import { navigate } from '../lib/router';
import { regionGroup } from '../lib/taxonomy';
import { isAbnormal, labLabel, labStatus } from '../analysis/corpus';
import { Swimlane, type LaneItem } from '../components/charts';
import { useLocalState } from '../components/ui';

export const TYPE_COLOR: Record<EventType, string> = {
  symptom: 'var(--s2)',
  diagnosis: 'var(--s7)',
  visit: 'var(--s1)',
  imaging: 'var(--s3)',
  lab: 'var(--s4)',
  procedure: 'var(--s5)',
  surgery: 'var(--s5)',
  hospitalization: 'var(--s8)',
  injury: 'var(--s8)',
  illness: 'var(--s6)',
  life: 'var(--s6)',
  note: 'var(--muted)',
};

const TYPE_LANE: Record<EventType, string> = {
  symptom: 'Symptoms',
  diagnosis: 'Diagnoses',
  visit: 'Appointments',
  imaging: 'Scans & tests',
  lab: 'Scans & tests',
  procedure: 'Procedures',
  surgery: 'Procedures',
  hospitalization: 'Procedures',
  injury: 'Life & triggers',
  illness: 'Life & triggers',
  life: 'Life & triggers',
  note: 'Notes',
};

type Grouping = 'type' | 'system' | 'region' | 'specialty';
const RANGES = [
  { k: 'all', label: 'All', years: 0 },
  { k: '10', label: '10 y', years: 10 },
  { k: '5', label: '5 y', years: 5 },
  { k: '2', label: '2 y', years: 2 },
  { k: '1', label: '1 y', years: 1 },
] as const;

export function TimelineView() {
  const { patient, events, meds, labs, logs } = usePatient();
  const [group, setGroup] = useLocalState<Grouping>('tl:group', 'type');
  const [range, setRange] = useLocalState<string>('tl:range', 'all');
  const [showMeds, setShowMeds] = useLocalState('tl:meds', true);
  const [showLabs, setShowLabs] = useLocalState('tl:labs', true);
  const [onlyKey, setOnlyKey] = useState(false);
  const [filter, setFilter] = useState('');

  const now = toTime(today());
  const allTimes = [...events.map((e) => toTime(e.date)), ...meds.map((m) => toTime(m.startDate)), ...labs.map((l) => toTime(l.date)), ...logs.map((l) => toTime(l.date))];
  const minT = allTimes.length ? Math.min(...allTimes) : now - 365 * 86_400_000;
  const yrs = RANGES.find((r) => r.k === range)?.years ?? 0;
  const t0 = yrs ? Math.max(minT, now - yrs * 365.25 * 86_400_000) : Date.UTC(new Date(minT).getUTCFullYear(), 0, 1);
  const domain: [number, number] = [t0, now + 30 * 86_400_000];

  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return events.filter((e) => {
      if (onlyKey && e.importance !== 3) return false;
      if (!f) return true;
      return [e.title, e.findings, e.specialty, ...e.bodyRegions, ...e.systems, ...e.tags].join(' ').toLowerCase().includes(f);
    });
  }, [events, filter, onlyKey]);

  const { lanes, items } = useMemo(() => {
    const items: LaneItem[] = [];
    const laneOrder: string[] = [];
    const addLane = (l: string) => !laneOrder.includes(l) && laneOrder.push(l);
    const lanesFor = (e: MedicalEvent): string[] => {
      if (group === 'type') return [TYPE_LANE[e.type]];
      if (group === 'system') return e.systems.length ? e.systems : ['(no system)'];
      if (group === 'region') return e.bodyRegions.length ? [...new Set(e.bodyRegions.map(regionGroup))] : ['(no area)'];
      return [e.specialty || '(no specialty)'];
    };
    if (group === 'type') ['Symptoms', 'Diagnoses', 'Appointments', 'Scans & tests', 'Procedures', 'Life & triggers', 'Notes'].forEach(addLane);
    for (const e of visible) {
      const start = toTime(e.date);
      const end = e.endDate ? toTime(e.endDate) : e.type === 'diagnosis' && e.status === 'active' ? now : undefined;
      for (const lane of lanesFor(e)) {
        addLane(lane);
        items.push({
          id: `${e.id}:${lane}`,
          lane,
          start,
          end: e.type === 'symptom' || e.type === 'diagnosis' ? end : undefined,
          label: e.title,
          color: TYPE_COLOR[e.type],
          important: e.importance === 3,
          hollow: e.status === 'suspected' || e.status === 'ruled-out',
          detail: (
            <>
              {EVENT_TYPE_LABEL[e.type]}
              {e.status ? ` (${e.status})` : ''}
              {e.specialty ? ` · ${e.specialty}` : ''}
              {e.findings && <div style={{ marginTop: 4 }}>{e.findings.slice(0, 180)}{e.findings.length > 180 ? '…' : ''}</div>}
            </>
          ),
        });
      }
    }
    if (showMeds && meds.length) {
      addLane('Medications');
      for (const m of meds)
        items.push({
          id: `med:${m.id}`,
          lane: 'Medications',
          start: toTime(m.startDate),
          end: m.endDate ? toTime(m.endDate) : now,
          label: `${m.name}${m.dose ? ' ' + m.dose : ''}`,
          color: m.effectiveness !== undefined && m.effectiveness >= 1 ? 'var(--good)' : 'var(--s1)',
          detail: [m.reason && `for ${m.reason}`, m.effectiveness !== undefined && `effect: ${['made worse', 'slightly worse', 'no effect', 'helped', 'helped a lot'][m.effectiveness + 2]}`, m.stopReason && `stopped: ${m.stopReason}`].filter(Boolean).join(' · '),
        });
    }
    if (showLabs) {
      const ab = labs.filter((l) => isAbnormal(labStatus(l)));
      if (ab.length) {
        addLane('Abnormal labs');
        for (const l of ab)
          items.push({ id: `lab:${l.id}`, lane: 'Abnormal labs', start: toTime(l.date), label: labLabel(l), color: 'var(--critical)', detail: labStatus(l) });
      }
    }
    const used = new Set(items.map((i) => i.lane));
    return { lanes: laneOrder.filter((l) => used.has(l)).map((l) => ({ key: l, label: l.length > 17 ? l.slice(0, 16) + '…' : l })), items };
  }, [visible, group, meds, labs, showMeds, showLabs, now]);

  const heat = useMemo(() => {
    if (!logs.length) return undefined;
    const byMonth = new Map<string, number[]>();
    for (const l of logs) byMonth.set(l.date.slice(0, 7), [...(byMonth.get(l.date.slice(0, 7)) ?? []), l.pain]);
    return {
      label: 'Pain (diary)',
      cells: [...byMonth.entries()].map(([ym, ps]) => {
        const [y, m] = ym.split('-').map(Number);
        return { t0: Date.UTC(y, m - 1, 1), t1: Date.UTC(y, m, 1), v: ps.reduce((a, b) => a + b, 0) / ps.length, n: ps.length };
      }),
    };
  }, [logs]);

  const byYear = useMemo(() => {
    const m = new Map<number, MedicalEvent[]>();
    for (const e of visible) m.set(yearOf(e.date), [...(m.get(yearOf(e.date)) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [visible]);

  const select = (it: LaneItem) => {
    if (it.id.startsWith('med:')) navigate('meds', { id: it.id.slice(4) });
    else if (it.id.startsWith('lab:')) navigate('labs', { id: it.id.slice(4) });
    else navigate('records', { id: it.id.split(':')[0] });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Timeline</h1>
          <p className="muted">The whole history at a glance. Re-group by body system or area to see how problems spread over the years.</p>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12, gap: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>Group by</span>
          <div className="segmented">
            {(['type', 'system', 'region', 'specialty'] as Grouping[]).map((g) => (
              <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
                {{ type: 'Record type', system: 'Body system', region: 'Body area', specialty: 'Specialty' }[g]}
              </button>
            ))}
          </div>
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.k} className={range === r.k ? 'on' : ''} onClick={() => setRange(r.k)}>
                {r.label}
              </button>
            ))}
          </div>
          <input type="search" placeholder="Filter (e.g. hip, MRI)" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} />
          <label className="check"><input type="checkbox" checked={showMeds} onChange={(e) => setShowMeds(e.target.checked)} /> Medications</label>
          <label className="check"><input type="checkbox" checked={showLabs} onChange={(e) => setShowLabs(e.target.checked)} /> Abnormal labs</label>
          <label className="check"><input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> ★ Key events only</label>
        </div>
        {items.length || heat ? (
          <Swimlane lanes={lanes} items={items} domain={domain} onSelect={select} heat={heat} />
        ) : (
          <p className="muted">Add records, medications or labs to see the timeline.</p>
        )}
        <div className="legend">
          {(['symptom', 'diagnosis', 'visit', 'imaging', 'procedure', 'injury', 'illness'] as EventType[]).map((t) => (
            <span key={t}><span className="dot" style={{ background: TYPE_COLOR[t] }} />{EVENT_TYPE_LABEL[t].split(' /')[0]}</span>
          ))}
          <span><span className="dot" style={{ border: '2px solid var(--s7)', background: 'transparent' }} />Suspected / ruled out</span>
          <span><span className="dot" style={{ background: 'var(--good)' }} />Medication that helped</span>
          <span><span className="dot" style={{ background: 'var(--critical)' }} />Abnormal lab</span>
          <span>Bars = duration · bigger dot = ★ key event · click anything to open it</span>
        </div>
      </div>

      <h2 style={{ marginTop: 20 }}>Year by year</h2>
      {byYear.map(([y, evs]) => {
        const age = ageAt(patient.dob, `${y}-06-30`);
        const yearMeds = meds.filter((m) => yearOf(m.startDate) === y);
        const yearAbn = labs.filter((l) => yearOf(l.date) === y && isAbnormal(labStatus(l)));
        return (
          <div className="card" key={y}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>
                {y} {age !== undefined && <span className="faint" style={{ fontWeight: 400 }}>· age ~{age}</span>}
              </h3>
              <span className="faint" style={{ fontSize: 13 }}>
                {evs.length} record{evs.length > 1 ? 's' : ''}
                {yearMeds.length ? ` · started ${yearMeds.map((m) => m.name).join(', ')}` : ''}
                {yearAbn.length ? ` · ${yearAbn.length} abnormal lab${yearAbn.length > 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {evs.map((e) => (
                <div key={e.id} className="row" style={{ gap: 10, padding: '4px 0', flexWrap: 'nowrap', alignItems: 'baseline' }}>
                  <span className="faint tabnum" style={{ width: 88, flex: 'none', fontSize: 13 }}>{fmtDate(e.date, e.datePrecision)}</span>
                  <span className="dot" style={{ background: TYPE_COLOR[e.type] }} />
                  <a href={`#/records?id=${e.id}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                    <b>{e.title}</b>
                    {e.importance === 3 && ' ★'}
                    <span className="muted"> {e.specialty ? `· ${e.specialty}` : ''} {e.findings ? `– ${e.findings.slice(0, 120)}${e.findings.length > 120 ? '…' : ''}` : ''}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
