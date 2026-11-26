// Throwaway: prints report tables from precomputed metrics JSON (not committed).
import { readFileSync } from 'node:fs';
import { cultureRow, CULTURE_COLUMNS } from './culture-metrics.js';
import type { CultureMetrics } from './culture-metrics.js';
const M = 'validation-results/metrics';
const files = process.argv.slice(2);
const load = (f: string) => JSON.parse(readFileSync(`${M}/${f}.json`, 'utf8')) as CultureMetrics;
const pct = (v: number | null) => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);
const t = (h: string[], rows: string[][]) =>
  [`| ${h.join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
console.log(t(['Cut', ...CULTURE_COLUMNS.slice(1)], files.map((f) => [f.replace('culture-', ''), ...cultureRow(load(f)).slice(1)])));
console.log();
console.log(
  t(
    ['Cut', 'Survival without rest', 'Idle (rest + wait)', 'People with a symbolic action', 'Adopted names / sayings / rules', 'Revised G2', 'Original G2'],
    files.map((f) => {
      const m = load(f), g = m.gate;
      return [
        f.replace('culture-', ''),
        pct(g.survival.share),
        `${String(m.idle.rounds)} / ${String(m.idle.actorRounds)} (${pct(m.idle.share)})`,
        `${String(g.symbolic.people.length)} of ${String(m.agents.length)}${g.symbolic.people.length < m.agents.length ? ` (not ${m.agents.filter((a) => !g.symbolic.people.includes(a)).join(', ')})` : ''}`,
        `${String(g.adoption.names.length)} / ${String(g.adoption.sayings.length)} / ${String(g.adoption.rules.length)}`,
        g.passed ? 'pass' : 'fail',
        `${g.original.passed ? 'pass' : 'fail'} (${pct(g.original.survivalShare)})`,
      ];
    }),
  ),
);
