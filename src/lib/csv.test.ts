import { expect, it } from 'vitest';
import { labsFromText, labsFromCSV, normDate } from './csv';
it('parses pasted lab text', () => {
  const r = labsFromText('CRP   9.1  mg/L   0.0 - 5.0   H\nFerritin: 13 ng/mL (15-150) L\nTSH 4.3 mIU/L 0.4-4.0\nPatient: X 12', '2024-01-01', 'p');
  expect(r.map((x) => [x.test, x.value, x.unit, x.refLow, x.refHigh, x.flag])).toEqual([
    ['CRP', 9.1, 'mg/L', 0, 5, 'H'],
    ['Ferritin', 13, 'ng/mL', 15, 150, 'L'],
    ['TSH', 4.3, 'mIU/L', 0.4, 4, undefined],
  ]);
});
it('parses csv', () => {
  const { labs } = labsFromCSV('Date,Test,Result,Units,Reference\n03/02/2020,CRP,7,mg/L,0-5\n2021-01-01,ANA,Positive 1:160,,', 'p');
  expect(labs[0]).toMatchObject({ date: '2020-02-03', test: 'CRP', value: 7, refLow: 0, refHigh: 5 });
  expect(labs[1]).toMatchObject({ test: 'ANA', textValue: 'Positive 1:160', value: undefined });
  expect(normDate('2019-07')).toBe('2019-07-01');
});
