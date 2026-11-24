import type { PatientData } from '../types';
import { buildCorpus } from './corpus';
import { baselineInsight, clusterInsights } from './clusters';
import { followupInsights } from './followups';
import { labInsights } from './labs';
import { correlationInsights, treatmentInsights } from './logs';
import { onsetInsights, overviewInsights, recurrenceInsights } from './timeline';
import type { Insight } from './types';

const LEVEL_RANK = { important: 0, notable: 1, info: 2 } as const;

export function analyze(d: PatientData): Insight[] {
  const facts = buildCorpus(d);
  const all: Insight[] = [];
  const run = (name: string, f: () => Insight[] | Insight | undefined) => {
    try {
      const r = f();
      if (Array.isArray(r)) all.push(...r);
      else if (r) all.push(r);
    } catch (err) {
      console.error(`analysis step ${name} failed`, err);
    }
  };
  run('overview', () => overviewInsights(d));
  run('clusters', () => clusterInsights(d, facts));
  run('labs', () => labInsights(d));
  run('baseline', () => baselineInsight(d));
  run('followups', () => followupInsights(d));
  run('treatment', () => treatmentInsights(d));
  run('correlations', () => correlationInsights(d));
  run('onset', () => onsetInsights(d));
  run('recurrence', () => recurrenceInsights(d));
  const seen = new Set<string>();
  return all
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (b.score ?? 0) - (a.score ?? 0));
}

export * from './types';
