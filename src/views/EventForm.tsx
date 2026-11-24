import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { uid } from '../lib/id';
import { today } from '../lib/dates';
import { BODY_REGIONS, BODY_SYSTEMS, MODALITIES } from '../lib/taxonomy';
import { EVENT_TYPES, EVENT_TYPE_LABEL, type MedicalEvent } from '../types';
import { Field, Modal, TagInput } from '../components/ui';
import { usePatient } from '../state';

export function blankEvent(patientId: string, type: MedicalEvent['type'] = 'visit'): MedicalEvent {
  return {
    id: uid(),
    patientId,
    type,
    date: today(),
    datePrecision: 'day',
    title: '',
    bodyRegions: [],
    systems: [],
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function EventForm({ event, onClose }: { event: MedicalEvent; onClose: () => void }) {
  const { events } = usePatient();
  const [e, setE] = useState<MedicalEvent>(event);
  const [files, setFiles] = useState<File[]>([]);
  const isNew = !events.some((x) => x.id === event.id);
  const set = <K extends keyof MedicalEvent>(k: K, v: MedicalEvent[K]) => setE((p) => ({ ...p, [k]: v }));
  const attachments = useLiveQuery(() => db.attachments.where('eventId').equals(event.id).toArray(), [event.id]);
  const specialties = useMemo(() => [...new Set(events.map((x) => x.specialty).filter(Boolean) as string[])].sort(), [events]);
  const providers = useMemo(() => [...new Set(events.map((x) => x.provider).filter(Boolean) as string[])].sort(), [events]);
  const tags = useMemo(() => [...new Set(events.flatMap((x) => x.tags))].sort(), [events]);

  const save = async () => {
    if (!e.title.trim()) return;
    // normalise partial dates
    let date = e.date;
    if (e.datePrecision === 'year') date = `${date.slice(0, 4)}-01-01`;
    if (e.datePrecision === 'month') date = `${date.slice(0, 7)}-01`;
    await db.transaction('rw', db.events, db.attachments, async () => {
      await db.events.put({ ...e, date, title: e.title.trim(), updatedAt: Date.now() });
      for (const f of files)
        await db.attachments.add({ id: uid(), patientId: e.patientId, eventId: e.id, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, blob: f, addedAt: Date.now() });
    });
    onClose();
  };
  const remove = async () => {
    if (!confirm(`Delete "${e.title}" and its attachments?`)) return;
    await db.transaction('rw', db.events, db.attachments, async () => {
      await db.attachments.where('eventId').equals(e.id).delete();
      await db.events.delete(e.id);
    });
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'Add to the record' : 'Edit record'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button className="danger" onClick={remove} style={{ marginRight: 'auto' }}>
              Delete
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={!e.title.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="What kind of record?">
          <select value={e.type} onChange={(x) => set('type', x.target.value as MedicalEvent['type'])}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" hint="Not sure? Choose month or year precision.">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {e.datePrecision === 'year' ? (
              <input type="number" min={1900} max={2100} value={e.date.slice(0, 4)} onChange={(x) => set('date', `${x.target.value}-01-01`)} />
            ) : e.datePrecision === 'month' ? (
              <input type="month" value={e.date.slice(0, 7)} onChange={(x) => set('date', `${x.target.value}-01`)} />
            ) : (
              <input type="date" value={e.date} onChange={(x) => set('date', x.target.value)} />
            )}
            <select value={e.datePrecision} onChange={(x) => set('datePrecision', x.target.value as MedicalEvent['datePrecision'])} style={{ width: 100 }} aria-label="Date precision">
              <option value="day">Exact</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        </Field>
        {['symptom', 'diagnosis', 'hospitalization', 'illness', 'life'].includes(e.type) && (
          <Field label="End date (if it ended)" hint="Leave empty if ongoing">
            <input type="date" value={e.endDate ?? ''} onChange={(x) => set('endDate', x.target.value || undefined)} />
          </Field>
        )}
        <Field label="Title" full>
          <input
            value={e.title}
            placeholder={e.type === 'imaging' ? 'e.g. MRI lumbar spine' : e.type === 'diagnosis' ? 'e.g. Fibromyalgia' : e.type === 'symptom' ? 'e.g. Burning feet' : 'e.g. Rheumatology consult'}
            onChange={(x) => set('title', x.target.value)}
          />
        </Field>
        {e.type === 'diagnosis' && (
          <Field label="Diagnosis status">
            <select value={e.status ?? 'active'} onChange={(x) => set('status', x.target.value as MedicalEvent['status'])}>
              <option value="active">Active / confirmed</option>
              <option value="suspected">Suspected / query</option>
              <option value="resolved">Resolved</option>
              <option value="ruled-out">Ruled out</option>
            </select>
          </Field>
        )}
        {e.type === 'imaging' && (
          <Field label="Modality">
            <select value={e.modality ?? ''} onChange={(x) => set('modality', x.target.value || undefined)}>
              <option value="">–</option>
              {MODALITIES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Specialty" hint="e.g. Rheumatology, Neurology">
          <input list="specialties" value={e.specialty ?? ''} onChange={(x) => set('specialty', x.target.value || undefined)} />
          <datalist id="specialties">
            {[...new Set([...specialties, 'General practice', 'Rheumatology', 'Neurology', 'Orthopedics', 'Gastroenterology', 'Cardiology', 'Pain medicine', 'Physiotherapy', 'Allergy/Immunology', 'Dermatology', 'Gynecology', 'Endocrinology', 'Ophthalmology', 'Psychiatry/Psychology', 'Emergency', 'Radiology'])].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Clinician / provider">
          <input list="providers" value={e.provider ?? ''} onChange={(x) => set('provider', x.target.value || undefined)} />
          <datalist id="providers">{providers.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Body areas" full>
          <TagInput value={e.bodyRegions} onChange={(v) => set('bodyRegions', v)} suggestions={BODY_REGIONS} placeholder="Choose or type a body area" />
        </Field>
        <Field label="Body systems" full>
          <TagInput value={e.systems} onChange={(v) => set('systems', v)} suggestions={BODY_SYSTEMS} placeholder="Choose or type a body system" />
        </Field>
        <Field
          label={e.type === 'imaging' ? 'Report findings & impression' : 'Findings / what was said'}
          hint="Paste the exact wording of reports and letters where possible – the pattern finder reads this text."
          full
        >
          <textarea value={e.findings ?? ''} onChange={(x) => set('findings', x.target.value)} style={{ minHeight: 120 }} />
        </Field>
        <Field label="Your notes" hint="How you felt, what you'd like to ask, what wasn't addressed" full>
          <textarea value={e.notes ?? ''} onChange={(x) => set('notes', x.target.value)} />
        </Field>
        <Field label="Tags" full>
          <TagInput value={e.tags} onChange={(v) => set('tags', v)} suggestions={tags} showSuggestions={false} />
        </Field>
        <div className="full row" style={{ gap: 18 }}>
          <label className="check">
            <input type="checkbox" checked={!!e.followUpRecommended} onChange={(x) => set('followUpRecommended', x.target.checked)} />
            Follow-up was recommended
          </label>
          <label className="check">
            <input type="checkbox" checked={!!e.followUpDone} onChange={(x) => set('followUpDone', x.target.checked)} />
            Follow-up done / dealt with
          </label>
          <label className="check">
            <input type="checkbox" checked={e.importance === 3} onChange={(x) => set('importance', x.target.checked ? 3 : undefined)} />
            ★ Key event
          </label>
        </div>
        <Field label="Attachments (reports, scan images, letters)" hint="Files stay on this device." full>
          <input type="file" multiple onChange={(x) => setFiles([...(x.target.files ?? [])])} />
          {(attachments?.length ?? 0) > 0 && <AttachmentList ids={attachments!.map((a) => a.id)} editable />}
        </Field>
      </div>
    </Modal>
  );
}

export function AttachmentList({ ids, editable }: { ids: string[]; editable?: boolean }) {
  const atts = useLiveQuery(() => db.attachments.bulkGet(ids), [ids.join(',')]);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  return (
    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
      <div className="chips">
        {atts?.filter(Boolean).map((a) => (
          <span className="chip" key={a!.id}>
            <button
              type="button"
              className="x"
              style={{ color: 'var(--accent)', fontSize: 13 }}
              onClick={() => setPreview({ url: URL.createObjectURL(a!.blob), mime: a!.mime, name: a!.name })}
            >
              📎 {a!.name}
            </button>
            <span className="faint">{Math.ceil(a!.size / 1024)} KB</span>
            {editable && (
              <button type="button" className="x" aria-label={`Delete ${a!.name}`} onClick={() => confirm(`Delete ${a!.name}?`) && db.attachments.delete(a!.id)}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {preview && (
        <div className="card" style={{ padding: 8 }}>
          <div className="row between">
            <b>{preview.name}</b>
            <div className="row">
              <a className="btn small" href={preview.url} download={preview.name}>Download</a>
              <button type="button" className="small" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
          {preview.mime.startsWith('image/') ? (
            <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', marginTop: 8 }} />
          ) : preview.mime === 'application/pdf' ? (
            <iframe src={preview.url} title={preview.name} style={{ width: '100%', height: 520, border: 0, marginTop: 8 }} />
          ) : (
            <p className="muted">No preview for this file type – use Download.</p>
          )}
        </div>
      )}
    </div>
  );
}
