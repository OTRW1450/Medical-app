// A fictional demo patient so the app can be explored without entering real data.
// Any resemblance to a real person is coincidental.
import type { DailyLog, LabResult, MedicalEvent, Medication, PatientData } from '../types';
import { addDays } from '../lib/dates';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildDemo(now = Date.now()): PatientData {
  const pid = 'demo-patient';
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const ev = (e: Partial<MedicalEvent> & Pick<MedicalEvent, 'type' | 'date' | 'title'>): MedicalEvent => ({
    id: id('ev'),
    patientId: pid,
    datePrecision: 'day',
    bodyRegions: [],
    systems: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...e,
  });
  const events: MedicalEvent[] = [
    ev({ type: 'injury', date: '2005-06-01', datePrecision: 'year', title: 'Recurrent ankle sprains (teens)', bodyRegions: ['left foot/ankle', 'right foot/ankle'], systems: ['musculoskeletal'], notes: 'Sprained ankles several times a year as a teen. Always "double-jointed".' }),
    ev({ type: 'visit', date: '2006-03-10', title: 'Physio – ankle instability', specialty: 'Physiotherapy', provider: 'Community physio', bodyRegions: ['right foot/ankle'], systems: ['musculoskeletal'], findings: 'Generalised joint hypermobility noted. Ankle instability. Strengthening programme.' }),
    ev({ type: 'symptom', date: '2011-02-01', datePrecision: 'month', title: 'Low back pain', bodyRegions: ['lower back'], systems: ['musculoskeletal'], notes: 'Gradual onset, age 20. Stiff in the morning for over an hour, better with movement.', importance: 3 }),
    ev({ type: 'visit', date: '2011-05-14', title: 'GP – back pain', specialty: 'General practice', provider: 'Dr. A', bodyRegions: ['lower back'], systems: ['musculoskeletal'], findings: 'Mechanical low back pain. Advised ibuprofen and physio.' }),
    ev({ type: 'symptom', date: '2012-09-01', datePrecision: 'month', title: 'Heel pain', bodyRegions: ['left foot/ankle'], systems: ['musculoskeletal'] }),
    ev({ type: 'diagnosis', date: '2012-11-02', title: 'Plantar fasciitis', status: 'resolved', specialty: 'Podiatry', provider: 'Podiatry clinic', bodyRegions: ['left foot/ankle'], systems: ['musculoskeletal'], findings: 'Left plantar fasciitis, insoles provided. Flat feet (pes planus).' }),
    ev({ type: 'visit', date: '2013-04-20', title: 'Eye casualty – red painful eye', specialty: 'Ophthalmology', provider: 'Eye hospital', bodyRegions: ['head'], systems: ['eyes'], findings: 'Acute anterior uveitis right eye. Treated with steroid drops. Recurrence possible.', importance: 3 }),
    ev({ type: 'diagnosis', date: '2013-04-20', title: 'Anterior uveitis', status: 'resolved', specialty: 'Ophthalmology', systems: ['eyes'] }),
    ev({ type: 'illness', date: '2014-06-10', title: 'Glandular fever (EBV)', specialty: 'General practice', systems: ['immune/allergic'], findings: 'Monospot positive. Off university for 6 weeks.', importance: 3 }),
    ev({ type: 'symptom', date: '2014-09-01', datePrecision: 'month', title: 'Persistent fatigue', systems: ['neurological'], notes: 'Never fully recovered energy after glandular fever. Brain fog.' }),
    ev({ type: 'symptom', date: '2015-01-15', datePrecision: 'month', title: 'Dizziness on standing', systems: ['autonomic', 'cardiovascular'], notes: 'Lightheaded on standing, palpitations, near-fainting in hot showers.' }),
    ev({ type: 'diagnosis', date: '2015-03-08', title: 'Irritable bowel syndrome', status: 'active', specialty: 'General practice', systems: ['gastrointestinal'], findings: 'Bloating, alternating diarrhea/constipation. IBS diagnosed clinically.' }),
    ev({ type: 'imaging', date: '2015-07-02', title: 'X-ray lumbar spine', modality: 'X-ray', specialty: 'General practice', bodyRegions: ['lower back', 'sacrum/SI'], systems: ['musculoskeletal'], findings: 'Mild degenerative change at L4/5. SI joints unremarkable.' }),
    ev({ type: 'imaging', date: '2016-02-18', title: 'MRI lumbar spine', modality: 'MRI', specialty: 'Orthopedics', provider: 'Spine clinic', bodyRegions: ['lower back', 'sacrum/SI'], systems: ['musculoskeletal'], findings: 'Disc desiccation L4/5 with small disc bulge, no nerve root compression. Incidental note of bone marrow oedema at the right sacroiliac joint; clinical correlation recommended.', importance: 3 }),
    ev({ type: 'visit', date: '2016-03-01', title: 'Orthopedic spine review', specialty: 'Orthopedics', provider: 'Spine clinic', bodyRegions: ['lower back'], systems: ['musculoskeletal'], findings: 'Not a surgical candidate. Degenerative disc disease. Refer to pain clinic.' }),
    ev({ type: 'visit', date: '2017-01-12', title: 'GP – gut symptoms', specialty: 'General practice', systems: ['gastrointestinal'], findings: 'Ongoing bloating and loose stools. Referred to gastroenterology.' }),
    ev({ type: 'diagnosis', date: '2017-06-05', title: 'Scalp psoriasis', status: 'active', specialty: 'Dermatology', bodyRegions: ['head'], systems: ['skin'], findings: 'Plaque psoriasis of scalp. Topical treatment.' }),
    ev({ type: 'visit', date: '2018-02-20', title: 'Pain clinic', specialty: 'Pain medicine', provider: 'Pain clinic', bodyRegions: ['lower back', 'widespread'], systems: ['musculoskeletal', 'neurological'], findings: 'Widespread pain, poor sleep, fatigue. Impression: fibromyalgia / central sensitization.' }),
    ev({ type: 'diagnosis', date: '2018-02-20', title: 'Fibromyalgia', status: 'active', specialty: 'Pain medicine', systems: ['musculoskeletal'] }),
    ev({ type: 'imaging', date: '2019-05-11', title: 'MRI left knee', modality: 'MRI', specialty: 'Orthopedics', bodyRegions: ['left knee'], systems: ['musculoskeletal'], findings: 'Small joint effusion. Patellar tendinopathy at the inferior pole. Menisci intact.' }),
    ev({ type: 'visit', date: '2020-03-03', title: 'Allergy clinic', specialty: 'Allergy/Immunology', bodyRegions: ['widespread'], systems: ['immune/allergic', 'skin'], findings: 'Episodes of flushing and hives after certain foods and in heat. Skin prick tests negative. Cetirizine helps.' }),
    ev({ type: 'diagnosis', date: '2020-03-03', title: 'Mast cell activation syndrome', status: 'suspected', specialty: 'Allergy/Immunology', systems: ['immune/allergic'] }),
    ev({ type: 'life', date: '2021-04-15', title: 'Birth of first child', systems: ['reproductive/gynecologic'], importance: 3 }),
    ev({ type: 'symptom', date: '2021-08-01', datePrecision: 'month', title: 'Neck pain', bodyRegions: ['neck'], systems: ['musculoskeletal'] }),
    ev({ type: 'symptom', date: '2021-11-01', datePrecision: 'month', title: 'Burning feet', bodyRegions: ['left foot/ankle', 'right foot/ankle'], systems: ['neurological'], notes: 'Burning and tingling in both feet, worse at night.' }),
    ev({ type: 'imaging', date: '2022-03-09', title: 'EMG / nerve conduction study', modality: 'EMG/NCS', specialty: 'Neurology', bodyRegions: ['left leg', 'right leg'], systems: ['neurological'], findings: 'Nerve conduction studies normal. No large-fiber neuropathy.' }),
    ev({ type: 'visit', date: '2023-06-14', title: 'Rheumatology', specialty: 'Rheumatology', provider: 'Dr. R', bodyRegions: ['lower back', 'sacrum/SI'], systems: ['musculoskeletal'], findings: 'Back pain and widespread pain. SI joint X-ray normal. Inflammatory markers normal today. Impression: fibromyalgia with hypermobility, no inflammatory arthritis. Discharged.' }),
    ev({ type: 'imaging', date: '2024-09-22', title: 'MRI right hip', modality: 'MRI', specialty: 'Orthopedics', bodyRegions: ['right hip'], systems: ['musculoskeletal'], findings: 'Bone marrow edema at the greater trochanter at the gluteal tendon insertion (enthesis). Gluteal tendinopathy. Trochanteric bursitis.' }),
  ];

  const lab = (date: string, test: string, value: number | undefined, unit: string, refLow?: number, refHigh?: number, textValue?: string): LabResult => ({
    id: id('lab'), patientId: pid, date, test, value, unit, refLow, refHigh, textValue, createdAt: now,
  });
  const labs: LabResult[] = [
    lab('2012-01-10', 'CRP', 6.1, 'mg/L', 0, 5),
    lab('2012-01-10', 'ESR', 14, 'mm/h', 0, 20),
    lab('2012-01-10', 'Hemoglobin', 12.4, 'g/dL', 12, 15.5),
    lab('2015-08-01', 'Ferritin', 24, 'ng/mL', 15, 150),
    lab('2016-03-01', 'CRP', 8.2, 'mg/L', 0, 5),
    lab('2016-03-01', 'Vitamin D 25-OH', 18, 'ng/mL', 30, 100),
    lab('2016-03-01', 'TSH', 1.8, 'mIU/L', 0.4, 4.0),
    lab('2019-02-11', 'CRP', 4.2, 'mg/L', 0, 5),
    lab('2019-02-11', 'Ferritin', 19, 'ng/mL', 15, 150),
    lab('2019-02-11', 'TSH', 2.6, 'mIU/L', 0.4, 4.0),
    lab('2022-01-20', 'Vitamin B12', 290, 'pg/mL', 200, 900),
    lab('2022-01-20', 'TSH', 3.4, 'mIU/L', 0.4, 4.0),
    lab('2023-06-14', 'CRP', 3.8, 'mg/L', 0, 5),
    lab('2023-06-14', 'ESR', 12, 'mm/h', 0, 20),
    lab('2023-06-14', 'ANA', undefined, '', undefined, undefined, 'Positive 1:80 speckled'),
    lab('2023-06-14', 'Ferritin', 13, 'ng/mL', 15, 150),
    lab('2024-09-30', 'CRP', 9.1, 'mg/L', 0, 5),
    lab('2024-09-30', 'TSH', 4.3, 'mIU/L', 0.4, 4.0),
  ];

  const med = (m: Partial<Medication> & Pick<Medication, 'name' | 'startDate'>): Medication => ({ id: id('med'), patientId: pid, createdAt: now, ...m });
  const meds: Medication[] = [
    med({ name: 'Ibuprofen', dose: '400 mg TDS', reason: 'back pain', startDate: '2011-05-14', endDate: '2013-01-01', effectiveness: 2, stopReason: 'stomach upset', drugClass: 'NSAID' }),
    med({ name: 'Amitriptyline', dose: '10–25 mg nocte', reason: 'pain / sleep', startDate: '2018-02-20', endDate: '2018-11-01', effectiveness: 0, sideEffects: 'drowsy, dry mouth', stopReason: 'no benefit' }),
    med({ name: 'Tramadol', dose: '50 mg PRN', reason: 'back pain', startDate: '2018-04-01', endDate: '2018-09-01', effectiveness: 0, stopReason: 'no benefit, nausea' }),
    med({ name: 'Duloxetine', dose: '60 mg', reason: 'fibromyalgia', startDate: '2019-01-05', endDate: '2019-08-01', effectiveness: -1, sideEffects: 'nausea, sweating', stopReason: 'side effects' }),
    med({ name: 'Pregabalin', dose: '75 mg BD', reason: 'fibromyalgia', startDate: '2020-01-10', endDate: '2020-12-01', effectiveness: 0, sideEffects: 'weight gain, brain fog', stopReason: 'no benefit' }),
    med({ name: 'Cetirizine', dose: '10 mg BD', reason: 'hives / flushing', startDate: '2020-03-03', effectiveness: 2, drugClass: 'antihistamine' }),
    med({ name: 'Naproxen', dose: '500 mg BD', reason: 'back pain flare', startDate: '2026-08-15', effectiveness: 1, drugClass: 'NSAID' }),
  ];

  // ~200 days of daily logs with built-in patterns: poor sleep → next-day pain,
  // sitting trigger, menstrual flares, improvement after naproxen.
  const rand = rng(42);
  const logs: DailyLog[] = [];
  let prevSleep = 6;
  const start = '2026-05-01';
  for (let i = 0; i < 204; i++) {
    const date = addDays(start, i);
    if (rand() < 0.08) continue; // missed days
    const sleepQuality = Math.max(0, Math.min(10, Math.round(3 + rand() * 6)));
    const sitting = rand() < 0.3;
    const weather = rand() < 0.25;
    const cycleDay = i % 28;
    const menstruating = cycleDay < 5;
    const onNaproxen = date >= '2026-08-29';
    let pain = 5.2 + (6 - prevSleep) * 0.45 + (sitting ? 1.4 : 0) + (menstruating ? 1.6 : 0) - (onNaproxen ? 1.7 : 0) + (rand() - 0.5) * 1.6;
    pain = Math.max(0, Math.min(10, Math.round(pain)));
    const symptoms: string[] = [];
    if (pain >= 6 && rand() < 0.8) symptoms.push('morning stiffness');
    if (rand() < 0.45) symptoms.push('fatigue');
    if (rand() < 0.15) symptoms.push('dizziness on standing');
    if (pain >= 7 && rand() < 0.5) symptoms.push('brain fog');
    if (rand() < 0.1) symptoms.push('flushing');
    const triggers: string[] = [];
    if (sitting) triggers.push('prolonged sitting');
    if (weather) triggers.push('weather change');
    if (sleepQuality <= 4) triggers.push('poor sleep');
    logs.push({
      id: id('log'),
      patientId: pid,
      date,
      pain,
      regions: [
        { region: 'lower back', intensity: pain, qualities: ['stiff', 'aching'] },
        ...(pain >= 6 ? [{ region: 'sacrum/SI', intensity: pain - 1, qualities: ['deep'] }] : []),
        ...(rand() < 0.3 ? [{ region: 'right foot/ankle', intensity: 4, qualities: ['burning'] }] : []),
      ],
      sleepQuality,
      sleepHours: Math.round((5 + sleepQuality * 0.3) * 2) / 2,
      fatigue: Math.min(10, Math.round(4 + rand() * 4)),
      stress: Math.round(rand() * 8),
      mood: Math.round(4 + rand() * 4),
      activity: Math.round(2 + rand() * 6),
      function: Math.max(0, 10 - pain),
      symptoms,
      triggers,
      menstruating,
      createdAt: now,
    });
    prevSleep = sleepQuality;
  }

  return {
    patient: {
      id: pid,
      name: 'Demo patient (fictional)',
      dob: '1990-04-12',
      sex: 'female',
      allergies: 'Codeine – vomiting. Reacts to some foods with flushing.',
      familyHistory: 'Mother: psoriasis, hypothyroidism. Uncle: "bad back" from his 20s.',
      background:
        'Back pain since age 20 with morning stiffness. Many specialists over 15 years; each looked at one part. Wants to know if there is one explanation.',
      goals: 'Find out whether the back, eye, gut, skin and fatigue problems are connected.',
      createdAt: now,
    },
    events,
    meds,
    labs,
    logs,
    questions: [],
  };
}
