import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, loadPatientData } from './db/db';
import { analyze, type Insight } from './analysis';
import type { InsightState, Patient, PatientData } from './types';

interface Ctx {
  patients: Patient[] | undefined;
  patientId: string | undefined;
  setPatientId: (id: string | undefined) => void;
  data: PatientData | undefined;
  insights: Insight[];
  insightStates: Map<string, InsightState>;
}

const C = createContext<Ctx | null>(null);
const KEY = 'pain-chronicle:patient';

export function StateProvider({ children }: { children: ReactNode }) {
  const patients = useLiveQuery(() => db.patients.orderBy('name').toArray(), []);
  const [patientId, setPid] = useState<string | undefined>(() => localStorage.getItem(KEY) ?? undefined);
  const setPatientId = (id: string | undefined) => {
    setPid(id);
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  };
  useEffect(() => {
    if (!patients) return;
    if (!patients.length) {
      if (patientId) setPatientId(undefined);
    } else if (!patientId || !patients.some((p) => p.id === patientId)) setPatientId(patients[0].id);
  }, [patients, patientId]);

  const data = useLiveQuery(() => (patientId ? loadPatientData(patientId) : undefined), [patientId]);
  const states = useLiveQuery(
    () => (patientId ? db.insightStates.where('patientId').equals(patientId).toArray() : []),
    [patientId],
  );
  const insights = useMemo(() => (data ? analyze(data) : []), [data]);
  const insightStates = useMemo(() => new Map((states ?? []).map((s) => [s.key, s])), [states]);

  return (
    <C.Provider value={{ patients, patientId, setPatientId, data, insights, insightStates }}>{children}</C.Provider>
  );
}

export function useAppState() {
  const c = useContext(C);
  if (!c) throw new Error('StateProvider missing');
  return c;
}

/** Use inside views that require a loaded patient. */
export function usePatient(): PatientData & { insights: Insight[]; insightStates: Map<string, InsightState> } {
  const { data, insights, insightStates } = useAppState();
  if (!data) throw new Error('No patient loaded');
  return { ...data, insights, insightStates };
}
