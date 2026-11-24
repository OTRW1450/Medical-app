import { useState } from 'react';
import { store } from '../db/store';
import { uid } from '../lib/id';
import { useAppState } from '../state';
import type { Patient } from '../types';
import { Field, Modal } from '../components/ui';

export function PatientForm({ patient, onClose }: { patient?: Patient; onClose: () => void }) {
  const { setPatientId } = useAppState();
  const [p, setP] = useState<Patient>(
    patient ?? { id: uid(), name: '', createdAt: Date.now(), sex: 'unspecified' },
  );
  const set = <K extends keyof Patient>(k: K, v: Patient[K]) => setP({ ...p, [k]: v });
  const save = async () => {
    if (!p.name.trim()) return;
    await store.put('patients', p);
    setPatientId(p.id);
    onClose();
  };
  return (
    <Modal
      title={patient ? 'Edit patient profile' : 'New patient'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={!p.name.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name or nickname" hint="Can be initials only">
          <input value={p.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Date of birth" hint="Used for age at each event">
          <input type="date" value={p.dob ?? ''} onChange={(e) => set('dob', e.target.value || undefined)} />
        </Field>
        <Field label="Sex">
          <select value={p.sex} onChange={(e) => set('sex', e.target.value as Patient['sex'])}>
            <option value="unspecified">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="intersex">Intersex</option>
          </select>
        </Field>
        <Field label="Allergies & drug reactions" full>
          <textarea value={p.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} style={{ minHeight: 50 }} />
        </Field>
        <Field label="Family history" hint="Conditions in blood relatives – autoimmune, joint, thyroid, bowel, etc." full>
          <textarea value={p.familyHistory ?? ''} onChange={(e) => set('familyHistory', e.target.value)} style={{ minHeight: 50 }} />
        </Field>
        <Field label="The story so far" hint="A few lines in your own words. Words here are also searched for patterns." full>
          <textarea value={p.background ?? ''} onChange={(e) => set('background', e.target.value)} />
        </Field>
        <Field label="What do you most want answered?" full>
          <textarea value={p.goals ?? ''} onChange={(e) => set('goals', e.target.value)} style={{ minHeight: 50 }} />
        </Field>
      </div>
    </Modal>
  );
}
