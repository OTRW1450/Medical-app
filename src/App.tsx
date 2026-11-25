import { useState } from 'react';
import { useAppState } from './state';
import { href, useRoute } from './lib/router';
import { Icon } from './components/Icons';
import { Dashboard } from './views/Dashboard';
import { TimelineView } from './views/TimelineView';
import { RecordsView } from './views/RecordsView';
import { LogView } from './views/LogView';
import { MedsView } from './views/MedsView';
import { LabsView } from './views/LabsView';
import { InsightsView } from './views/InsightsView';
import { ReportsView } from './views/ReportsView';
import { ImportView } from './views/ImportView';
import { lock } from './db/keys';
import { applyUpdate, promptInstall, usePwa } from './pwa';
import { DataView } from './views/DataView';
import { Welcome } from './views/Welcome';
import { PatientForm } from './views/PatientForm';

const NAV = [
  { path: 'dashboard', label: 'Overview', icon: Icon.dashboard },
  { path: 'timeline', label: 'Timeline', icon: Icon.timeline },
  { path: 'insights', label: 'Patterns', icon: Icon.insights },
  { path: 'import', label: 'Import documents', icon: Icon.upload },
  { path: 'records', label: 'Records & scans', icon: Icon.records },
  { path: 'log', label: 'Pain diary', icon: Icon.log },
  { path: 'meds', label: 'Medications', icon: Icon.meds },
  { path: 'labs', label: 'Lab results', icon: Icon.labs },
  { path: 'reports', label: 'Reports & printouts', icon: Icon.summary },
  { path: 'data', label: 'Data & privacy', icon: Icon.data },
] as const;

export function App() {
  const { patients, patientId, setPatientId, data, insights, insightStates } = useAppState();
  const route = useRoute();
  const [newPatient, setNewPatient] = useState(false);
  const pwa = usePwa();

  if (patients === undefined) return null; // loading
  if (!patients.length) return <Welcome />;

  const open = insights.filter((i) => i.level === 'important' && insightStates.get(i.key)?.state !== 'dismissed').length;
  const counts: Record<string, number | undefined> = {
    records: data?.events.length,
    log: data?.logs.length,
    meds: data?.meds.length,
    labs: data?.labs.length,
    insights: open || undefined,
  };

  let view = null;
  if (data) {
    switch (route.path) {
      case 'timeline': view = <TimelineView />; break;
      case 'records': view = <RecordsView params={route.params} />; break;
      case 'log': view = <LogView />; break;
      case 'meds': view = <MedsView params={route.params} />; break;
      case 'labs': view = <LabsView params={route.params} />; break;
      case 'insights': view = <InsightsView />; break;
      case 'reports': view = <ReportsView params={route.params} />; break;
      case 'import': view = <ImportView />; break;
      case 'summary': view = <ReportsView params={new URLSearchParams('tab=doctor')} />; break;
      case 'data': view = <DataView />; break;
      default: view = <Dashboard />;
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Icon.logo /> Pain Chronicle
        </div>
        <label className="field" style={{ padding: '0 4px 10px' }}>
          <span>Patient</span>
          <select
            value={patientId}
            onChange={(e) => (e.target.value === '__new' ? setNewPatient(true) : setPatientId(e.target.value))}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">+ Add another patient…</option>
          </select>
        </label>
        <nav className="nav stack" style={{ gap: 2 }}>
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} className={route.path === n.path || (n.path === 'dashboard' && !NAV.some((x) => x.path === route.path)) ? 'active' : ''}>
              <n.icon />
              {n.label}
              {counts[n.path] ? <span className="count">{counts[n.path]}</span> : null}
            </a>
          ))}
        </nav>
        <div className="row" style={{ padding: '10px 4px 0', gap: 6 }}>
          <button className="small" onClick={lock} title="Lock now – requires the passcode to reopen">🔒 Lock</button>
          {pwa.canInstall && <button className="small" onClick={promptInstall}>⬇ Install app</button>}
        </div>
        <div className="spacer-flex" />
        <p className="faint" style={{ fontSize: 11.5, padding: '8px 6px 0' }}>
          🔒 Encrypted on this device. Works offline. Nothing is uploaded. Pattern hints are prompts for discussion with clinicians, not diagnoses.
        </p>
      </aside>
      <main className="main">
        {pwa.updateReady && (
          <div className="banner no-print row between">
            <span>A new version of the app is ready. Your records are not affected.</span>
            <button className="small primary" onClick={applyUpdate}>Update now</button>
          </div>
        )}
        {view}
      </main>
      {newPatient && <PatientForm onClose={() => setNewPatient(false)} />}
    </div>
  );
}
