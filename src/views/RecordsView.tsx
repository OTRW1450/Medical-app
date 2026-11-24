import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { attachments as attStore, type AttachmentMeta } from '../db/store';
import { usePatient } from '../state';
import { EVENT_TYPES, EVENT_TYPE_LABEL, type EventType, type MedicalEvent } from '../types';
import { ageAt, fmtDate } from '../lib/dates';
import { Icon } from '../components/Icons';
import { Empty } from '../components/ui';
import { AttachmentList, blankEvent, EventForm } from './EventForm';
import { TYPE_COLOR } from './TimelineView';

export function RecordsView({ params }: { params: URLSearchParams }) {
  const { patient, events } = usePatient();
  const [editing, setEditing] = useState<MedicalEvent | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [types, setTypes] = useState<EventType[]>([]);
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const focusId = params.get('id');
  const attachments = useLiveQuery(() => attStore.metaByPatient(patient.id), [patient.id]);
  const attByEvent = useMemo(() => {
    const m = new Map<string, AttachmentMeta[]>();
    for (const a of attachments ?? []) if (a.eventId) m.set(a.eventId, [...(m.get(a.eventId) ?? []), a]);
    return m;
  }, [attachments]);

  useEffect(() => {
    if (focusId) document.getElementById(`ev-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId, events.length]);
  useEffect(() => {
    if (params.get('new')) setEditing(blankEvent(patient.id, (params.get('new') as EventType) || 'visit'));
  }, [params, patient.id]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = events.filter((e) => {
      if (types.length && !types.includes(e.type)) return false;
      if (!words.length) return true;
      const hay = [e.title, e.findings, e.notes, e.provider, e.specialty, e.facility, e.modality, ...e.tags, ...e.bodyRegions, ...e.systems].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return sort === 'new' ? [...list].reverse() : list;
  }, [events, q, types, sort]);

  const typeCounts = useMemo(() => {
    const c = new Map<EventType, number>();
    for (const e of events) c.set(e.type, (c.get(e.type) ?? 0) + 1);
    return c;
  }, [events]);

  const highlight = (text: string) => {
    const words = q.split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return text;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Records & scans</h1>
          <p className="muted">Every appointment, scan, diagnosis, procedure and life event – in one searchable list.</p>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => setEditing(blankEvent(patient.id))}>
          <Icon.plus /> Add record
        </button>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input type="search" placeholder="Search all text – e.g. “oedema”, “left hip”, “Dr. R”, “incidental”" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <div className="segmented">
            <button className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>Newest</button>
            <button className={sort === 'old' ? 'on' : ''} onClick={() => setSort('old')}>Oldest</button>
          </div>
        </div>
        <div className="chips">
          {EVENT_TYPES.filter((t) => typeCounts.get(t)).map((t) => (
            <button key={t} className={`chip${types.includes(t) ? ' on' : ''}`} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}>
              <span className="dot" style={{ background: TYPE_COLOR[t] }} /> {EVENT_TYPE_LABEL[t]} · {typeCounts.get(t)}
            </button>
          ))}
          {types.length > 0 && <button className="chip" onClick={() => setTypes([])}>Clear</button>}
        </div>
      </div>
      <div className="card">
        {!events.length ? (
          <Empty title="No records yet">
            <p>Start with the big things you remember: when the pain began, key diagnoses, scans and surgeries. Rough dates are fine.</p>
            <button className="primary" onClick={() => setEditing(blankEvent(patient.id, 'symptom'))}>Add the first symptom</button>
          </Empty>
        ) : !filtered.length ? (
          <Empty title="Nothing matches" />
        ) : (
          filtered.map((e) => {
            const age = ageAt(patient.dob, e.date);
            return (
              <div key={e.id} id={`ev-${e.id}`} className={`record${focusId === e.id ? ' flash' : ''}`}>
                <div className="date">
                  {fmtDate(e.date, e.datePrecision)}
                  {age !== undefined && <div className="faint">age {age}</div>}
                </div>
                <div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="dot" style={{ background: TYPE_COLOR[e.type] }} />
                    <span className="faint" style={{ fontSize: 12 }}>{EVENT_TYPE_LABEL[e.type]}{e.modality ? ` · ${e.modality}` : ''}</span>
                    {e.status && <span className={`badge ${e.status === 'suspected' ? 'notable' : e.status === 'ruled-out' ? 'info' : 'good'}`}>{e.status}</span>}
                    {e.importance === 3 && <span title="Key event">★</span>}
                    {e.followUpRecommended && !e.followUpDone && <span className="badge notable">▲ follow-up open</span>}
                  </div>
                  <div className="title">{highlight(e.title)}</div>
                  <div className="meta">{[e.specialty, e.provider, e.facility].filter(Boolean).join(' · ')}</div>
                  {e.findings && <div className="findings">{highlight(e.findings)}</div>}
                  {e.notes && <div className="findings muted">📝 {highlight(e.notes)}</div>}
                  {(e.bodyRegions.length > 0 || e.systems.length > 0 || e.tags.length > 0) && (
                    <div className="chips" style={{ marginTop: 6 }}>
                      {e.bodyRegions.map((r) => <span className="chip" key={r}>📍 {r}</span>)}
                      {e.systems.map((r) => <span className="chip" key={r}>{r}</span>)}
                      {e.tags.map((r) => <span className="chip" key={r}>#{r}</span>)}
                    </div>
                  )}
                  {attByEvent.get(e.id) && <AttachmentList items={attByEvent.get(e.id)!} />}
                </div>
                <div>
                  <button className="small" onClick={() => setEditing(e)}>Edit</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {editing && <EventForm event={editing} onClose={() => { setEditing(null); if (params.get('new')) history.replaceState(null, '', '#/records'); }} />}
    </>
  );
}
