// Shared vocabularies so records can be compared across years and providers.

export const BODY_REGIONS = [
  'head',
  'face/jaw',
  'neck',
  'upper back',
  'mid back',
  'lower back',
  'sacrum/SI',
  'chest',
  'abdomen',
  'pelvis',
  'left shoulder',
  'right shoulder',
  'left arm',
  'right arm',
  'left hand/wrist',
  'right hand/wrist',
  'left hip',
  'right hip',
  'left leg',
  'right leg',
  'left knee',
  'right knee',
  'left foot/ankle',
  'right foot/ankle',
  'widespread',
] as const;

export type BodyRegion = (typeof BODY_REGIONS)[number];

export const BODY_SYSTEMS = [
  'musculoskeletal',
  'neurological',
  'gastrointestinal',
  'cardiovascular',
  'autonomic',
  'immune/allergic',
  'endocrine',
  'reproductive/gynecologic',
  'urinary',
  'skin',
  'respiratory',
  'psychological',
  'eyes',
  'ENT',
  'sleep',
  'blood',
] as const;

export const PAIN_QUALITIES = [
  'aching',
  'burning',
  'stabbing',
  'shooting',
  'throbbing',
  'electric',
  'pins & needles',
  'numb',
  'cramping',
  'pressure',
  'stiff',
  'deep',
] as const;

export const COMMON_TRIGGERS = [
  'poor sleep',
  'stress',
  'weather change',
  'cold',
  'heat',
  'prolonged sitting',
  'prolonged standing',
  'exercise',
  'overexertion',
  'travel',
  'illness',
  'alcohol',
  'gluten',
  'dairy',
  'high-histamine food',
  'menstrual cycle',
  'screen time',
  'missed medication',
] as const;

export const COMMON_SYMPTOMS = [
  'fatigue',
  'brain fog',
  'headache',
  'dizziness on standing',
  'palpitations',
  'nausea',
  'bloating',
  'diarrhea',
  'constipation',
  'joint swelling',
  'morning stiffness',
  'numbness/tingling',
  'muscle weakness',
  'rash/hives',
  'flushing',
  'dry eyes/mouth',
  'night sweats',
  'fever',
  'insomnia',
  'anxiety',
  'low mood',
  'easy bruising',
  'cold hands/feet',
  'color change in fingers',
  'light sensitivity',
  'tinnitus',
] as const;

/** Map region → coarse grouping for heatmaps. */
export function regionGroup(region: string): string {
  const r = region.toLowerCase();
  if (r.includes('head') || r.includes('face') || r.includes('jaw')) return 'Head & face';
  if (r.includes('neck')) return 'Neck';
  if (r.includes('back') || r.includes('sacrum') || r.includes('si')) return 'Spine & back';
  if (r.includes('shoulder') || r.includes('arm') || r.includes('hand') || r.includes('wrist'))
    return 'Upper limbs';
  if (r.includes('hip') || r.includes('leg') || r.includes('knee') || r.includes('foot') || r.includes('ankle'))
    return 'Lower limbs';
  if (r.includes('chest') || r.includes('abdomen') || r.includes('pelvis')) return 'Trunk & pelvis';
  return 'Widespread';
}

export const MODALITIES = ['MRI', 'CT', 'X-ray', 'Ultrasound', 'EMG/NCS', 'Bone scan', 'DEXA', 'PET', 'Endoscopy', 'Echo', 'ECG/Holter', 'Tilt table', 'Sleep study', 'Other'];
