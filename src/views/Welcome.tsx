import { useState } from 'react';
import { importData } from '../db/backup';
import { buildDemo } from '../db/demo';
import { useAppState } from '../state';
import { Icon } from '../components/Icons';
import { PatientForm } from './PatientForm';

export function Welcome() {
  const { setPatientId } = useAppState();
  const [create, setCreate] = useState(false);
  const loadDemo = async () => setPatientId(await importData(buildDemo()));
  return (
    <div style={{ maxWidth: 760, margin: '6vh auto', padding: 16 }}>
      <div className="row" style={{ gap: 12, marginBottom: 16 }}>
        <Icon.logo />
        <h1 style={{ margin: 0 }}>Pain Chronicle</h1>
      </div>
      <p style={{ fontSize: 17 }}>
        One place for a long, complicated medical history: every appointment, scan, lab result, medication and daily
        symptom on a single timeline – with pattern-finding that looks <i>across</i> specialists and years for the clues
        that get missed when each doctor sees only one piece.
      </p>
      <div className="grid cols-3" style={{ margin: '20px 0' }}>
        <div className="card"><h3>Synthesize</h3><p className="muted">Records, scan reports, labs, meds and a pain diary, organised by date, body area and body system.</p></div>
        <div className="card"><h3>Spot patterns</h3><p className="muted">Multi-system condition clusters, lab trends, unfinished follow-ups, triggers and treatment response.</p></div>
        <div className="card"><h3>Take it to the doctor</h3><p className="muted">A printable one-page summary and a question list for your next appointment.</p></div>
      </div>
      <div className="banner">
        🔒 <b>Private by design.</b> Everything is encrypted with your passcode and stored only on this device. The app works offline, makes no network requests and sends nothing anywhere. Use <i>Data &amp; privacy → Export</i> to keep encrypted backups.
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="primary" onClick={() => setCreate(true)}>
          <Icon.plus /> Start a new patient record
        </button>
        <button onClick={loadDemo}>Explore with a fictional demo patient</button>
      </div>
      <p className="faint" style={{ marginTop: 20, fontSize: 13 }}>
        Pain Chronicle is an organisational tool. Its pattern hints are keyword- and statistics-based prompts for discussion with qualified clinicians – they are not diagnoses or medical advice.
      </p>
      {create && <PatientForm onClose={() => setCreate(false)} />}
    </div>
  );
}
