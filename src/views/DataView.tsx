import { useEffect, useState } from 'react';
import { deletePatient } from '../db/db';
import { download, exportPatient, importBackup, importData, isEncryptedBackup } from '../db/backup';
import { buildDemo } from '../db/demo';
import { useAppState, usePatient } from '../state';
import { Field } from '../components/ui';
import { PatientForm } from './PatientForm';
import { today } from '../lib/dates';

export function DataView() {
  const { patient } = usePatient();
  const { setPatientId, patients } = useAppState();
  const [editing, setEditing] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState<string | null>(null);
  const [importPass, setImportPass] = useState('');
  const [usage, setUsage] = useState<string>('');
  const [persisted, setPersisted] = useState<boolean | undefined>();

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used`));
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const doExport = async (encrypt: boolean) => {
    if (encrypt && (pass.length < 8 || pass !== pass2)) return setMsg('Passphrases must match and be at least 8 characters.');
    setBusy(true);
    try {
      const blob = await exportPatient(patient.id, encrypt ? pass : undefined);
      const safe = patient.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      download(blob, `${safe}-${today()}.${encrypt ? 'pchron.enc' : 'pchron.json'}`);
      setMsg(encrypt ? 'Encrypted backup downloaded. Keep the passphrase safe – it cannot be recovered.' : 'Backup downloaded. This file is NOT encrypted – store it somewhere private.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!importText) return;
    setBusy(true);
    try {
      const id = await importBackup(importText, importPass || undefined);
      setPatientId(id);
      setImportText(null);
      setMsg('Backup imported as a new patient.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data & privacy</h1>
          <p className="muted">Your records never leave this device unless you export them.</p>
        </div>
      </div>
      {msg && <div className="banner">{msg}</div>}
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Patient profile</h3>
          <p className="muted">Name, date of birth, allergies, family history and the story so far.</p>
          <button onClick={() => setEditing(true)}>Edit profile</button>
        </div>
        <div className="card">
          <h3>How your data is stored</h3>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>Saved in this browser’s private storage (IndexedDB) on this device only.</li>
            <li>The app makes no network requests; the built version enforces this with a Content-Security-Policy.</li>
            <li>Clearing browser data or using private/incognito mode can erase it – <b>export backups regularly</b>.</li>
            <li>Anyone with access to this browser profile can open the records. Use a device password.</li>
          </ul>
          <p className="faint" style={{ fontSize: 13, marginTop: 6 }}>{usage}{persisted !== undefined && ` · ${persisted ? 'protected from automatic cleanup' : 'browser may clear storage under pressure'}`}</p>
        </div>
        <div className="card">
          <h3>Export a backup</h3>
          <p className="muted">Includes all records, labs, medications, diary entries, questions and attached files for <b>{patient.name}</b>.</p>
          <div className="form-grid">
            <Field label="Passphrase (for encrypted backup)"><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></Field>
            <Field label="Repeat passphrase"><input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" /></Field>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" disabled={busy} onClick={() => doExport(true)}>🔒 Encrypted backup</button>
            <button disabled={busy} onClick={() => doExport(false)}>Unencrypted backup</button>
          </div>
          <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>AES-256-GCM, key derived from your passphrase with PBKDF2 (600,000 iterations).</p>
        </div>
        <div className="card">
          <h3>Import a backup</h3>
          <p className="muted">Restores into a new patient entry (nothing is overwritten). Use this to move records to another device.</p>
          <input type="file" accept=".json,.enc,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImportText(await f.text()); }} />
          {importText && (
            <div className="stack" style={{ marginTop: 8 }}>
              {isEncryptedBackup(importText) && <Field label="Passphrase"><input type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} /></Field>}
              <button className="primary" disabled={busy} onClick={doImport}>Import</button>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Demo</h3>
          <p className="muted">Add the fictional demo patient to see how patterns appear in a rich 20-year record.</p>
          <button onClick={async () => setPatientId(await importData(buildDemo()))} disabled={patients?.some((p) => p.name.startsWith('Demo patient'))}>Add demo patient</button>
        </div>
        <div className="card">
          <h3>Delete</h3>
          <p className="muted">Permanently removes <b>{patient.name}</b> and all their records from this device.</p>
          <button
            className="danger"
            onClick={async () => {
              if (prompt(`Type DELETE to permanently remove ${patient.name} and all records.`) === 'DELETE') {
                await deletePatient(patient.id);
                setPatientId(undefined);
                location.hash = '#/dashboard';
              }
            }}
          >
            Delete this patient…
          </button>
        </div>
      </div>
      {editing && <PatientForm patient={patient} onClose={() => setEditing(false)} />}
    </>
  );
}
