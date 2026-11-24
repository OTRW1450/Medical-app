export type InsightCategory =
  | 'cluster'
  | 'labs'
  | 'followup'
  | 'treatment'
  | 'correlation'
  | 'onset'
  | 'recurrence'
  | 'overview';

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  cluster: 'Possible unifying patterns',
  labs: 'Lab results',
  followup: 'Loose ends & follow-ups',
  treatment: 'Treatment response',
  correlation: 'Daily-log correlations',
  onset: 'What started when',
  recurrence: 'Recurring findings',
  overview: 'Big picture',
};

export type EvidenceKind = 'event' | 'med' | 'lab' | 'log' | 'patient';

export interface Evidence {
  kind: EvidenceKind;
  id?: string;
  date?: string;
  label: string;
  /** The snippet of text that matched, if any. */
  quote?: string;
}

export type InsightLevel = 'info' | 'notable' | 'important';

export interface Insight {
  key: string; // stable across re-runs so pin/dismiss can persist
  category: InsightCategory;
  level: InsightLevel;
  title: string;
  detail: string;
  evidence: Evidence[];
  suggestions?: string[];
  /** 0..1 strength (for clusters: share of features matched). */
  score?: number;
  /** For clusters: features not (yet) found in the record – worth asking about. */
  missing?: string[];
  specialty?: string;
}
