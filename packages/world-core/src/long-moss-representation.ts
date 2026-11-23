import type { V7Object } from './continuous-types.js';
import { v7Number, v7Record } from './continuous-data.js';
import { preparedPortions } from './long-prepared-portions.js';
const SOURCE = 'surface-38-moss-234',
  DEPOSIT = 'residue-deposit-49-moss-298';
export function mossRepresentation(
  source: V7Object,
  deposit: V7Object | undefined,
) {
  if (
    !deposit ||
    deposit.revision !== 'moss-surface-residue-transfer@1' ||
    deposit.data.source !== source.id
  )
    throw new Error('The nominated conserved deposit record is incomplete.');
  const cover = v7Number(source.data.coverMass, 'cover mass', 0),
    residue = v7Number(source.data.residueMass, 'residue mass', 0),
    initial = v7Number(source.data.initialCoverMass, 'initial cover mass', 0),
    mass = v7Number(deposit.data.mass, 'deposited mass', 0);
  if (
    !Array.isArray(source.data.residues) ||
    !Array.isArray(deposit.data.deposits)
  )
    throw new Error('Complete constituent records are required.');
  const original = source.data.residues.map((e) => v7Record(e)),
    moved = deposit.data.deposits.map((e) => v7Record(e));
  const sum = (records: ReturnType<typeof v7Record>[]) =>
    records.reduce((n, e) => n + v7Number(e.mass, 'constituent mass', 0), 0);
  if (
    Math.abs(sum(original) - residue) > 1e-8 ||
    Math.abs(sum(moved) - mass) > 1e-8 ||
    Math.abs(cover + residue + mass - initial) > 1e-8 ||
    moved.some(
      (e) =>
        e.sourceId !== SOURCE ||
        !Number.isSafeInteger(e.sourceEntry) ||
        !original[Number(e.sourceEntry)] ||
        e.source !== original[Number(e.sourceEntry)]?.source,
    )
  )
    throw new Error(
      'Conserved source links or mass cannot be established from the complete records.',
    );
  return {
    cover,
    residue,
    mass,
    initial,
    parts: [
      ...preparedPortions(source.data.residues).map((shape) => ({
        ref: SOURCE,
        shape,
      })),
      ...preparedPortions(deposit.data.deposits).map((shape) => ({
        ref: DEPOSIT,
        shape,
      })),
    ],
  };
}
