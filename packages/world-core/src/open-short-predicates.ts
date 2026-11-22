import type { V7Data } from './continuous-types.js';
export const SHORT_COUPON_REVISION = 'short-material-refuge@1';
export const SHORT_SLIP_LIMIT = 0.02;
export const SHORT_SAG_DIVISOR = 10;
/** The physical evaluator and historical explanation share these exact acceptance rules. */
export function shortCouponPass(
  broken: boolean,
  slip: number,
  sag: number,
  area: number,
): boolean {
  return (
    !broken &&
    slip <= SHORT_SLIP_LIMIT &&
    sag <= Math.sqrt(area) / SHORT_SAG_DIVISOR
  );
}
export function shortCouponChecks(record: V7Data, revision: string): V7Data[] {
  const supported = revision === SHORT_COUPON_REVISION;
  const number = (key: string): number | null =>
    supported && typeof record[key] === 'number' && Number.isFinite(record[key])
      ? record[key]
      : null;
  const broken =
      supported && typeof record.broken === 'boolean' ? record.broken : null,
    slip = number('slip'),
    sag = number('sag'),
    area = number('area'),
    sagLimit =
      area !== null && area >= 0 ? Math.sqrt(area) / SHORT_SAG_DIVISOR : null;
  return [
    {
      id: 'intact',
      expression: 'broken === false',
      value: broken,
      comparison: 'equals',
      threshold: false,
      units: 'boolean',
      result: broken === null ? 'unknown' : broken ? 'fail' : 'pass',
      dependencies: ['actual applied force', 'modeled breaking force'],
    },
    {
      id: 'slip',
      expression: 'slip <= 0.02',
      value: slip,
      comparison: '<=',
      threshold: SHORT_SLIP_LIMIT,
      units: 'dimensionless',
      result:
        slip === null ? 'unknown' : slip <= SHORT_SLIP_LIMIT ? 'pass' : 'fail',
      dependencies: [
        'actual load mass',
        'allocated grass dry mass',
        'trial wetness',
      ],
    },
    {
      id: 'sag',
      expression: 'sag <= sqrt(area) / 10',
      value: sag,
      comparison: '<=',
      threshold: sagLimit,
      area,
      units: 'simulation length',
      result:
        sag === null || sagLimit === null
          ? 'unknown'
          : sag <= sagLimit
            ? 'pass'
            : 'fail',
      dependencies: [
        'actual load mass',
        'allocated grass mass',
        'trial wetness',
      ],
    },
  ].map((row) => ({
    ...row,
    ...(!supported
      ? {
          expression: 'Unknown historical evaluator',
          comparison: 'unknown',
          threshold: null,
          units: 'unknown',
        }
      : {}),
    provenance:
      'Retained performed trial; response values are model-derived, thresholds are versioned model assumptions.',
    missing:
      row.result === 'unknown'
        ? `Original ${row.id} operand or supported evaluator revision is unavailable; a new paid trial would establish new evidence, not repair this history.`
        : '',
  }));
}
