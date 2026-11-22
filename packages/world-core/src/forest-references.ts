import type {
  V7Action,
  V7Actor,
  V7ReferenceScope,
  V7World,
  V7Data,
} from './continuous-types.js';
import { v7Observe } from './continuous-observation.js';

export class ForestReferenceError extends Error {
  constructor(
    readonly code: string,
    readonly candidates: string[],
    detail: string,
    readonly details?: V7Data,
  ) {
    super(
      `Reference ${code}: ${detail}. Observable candidates: ${candidates.join(', ') || 'none'}.`,
    );
  }
}

/** Exactly one observed identity. Resource categories never silently select a stack. */
export function forestResolveReference(
  world: V7World,
  actor: V7Actor,
  reference: string,
  scope: V7ReferenceScope,
  quantity = 0,
): string {
  const o = v7Observe(world, actor.id);
  if (scope === 'optional-exact-surface') {
    const cell = /^river:([0-9]+):([0-9]+)$/.exec(reference);
    if (cell && world.state.riverWater === 1) {
      if (
        !o.terrain.some(
          (t) =>
            t.x === Number(cell[1]) &&
            t.y === Number(cell[2]) &&
            ['~', '='].includes(t.kind),
        )
      )
        throw new ForestReferenceError(
          'unavailable',
          [],
          'no personally visible represented river surface',
        );
      return reference;
    }
    scope = 'optional-exact-visible';
  }
  const stacks =
    scope === 'known'
      ? [
          ...o.stacks,
          ...actor.memory.stacks
            .filter((m) => !o.stacks.some((s) => s.id === m.stack.id))
            .map((m) => m.stack),
        ]
      : o.stacks;
  const objects =
    scope === 'known'
      ? [
          ...o.objects,
          ...actor.memory.objects
            .filter((m) => !o.objects.some((s) => s.id === m.object.id))
            .map((m) => m.object),
        ]
      : o.objects;
  const prefix =
    scope === 'optional-exact-visible' &&
    world.state.refugeDiagnostics !== 1 &&
    world.state.foodPreservation !== 1 &&
    world.state.shortRefuge !== 1 &&
    world.state.riverWater !== 1
      ? undefined
      : /^(item|object|resource):/.exec(reference)?.[1];
  const value = prefix ? reference.slice(prefix.length + 1) : reference;
  const observed = [
    ...stacks.map((s) => ({
      id: s.id,
      kind: 'item',
      resource: s.resource,
      owner: s.owner,
      quantity: s.quantity,
      reserved: !!s.reservedFor,
    })),
    ...objects.map((s) => ({
      id: s.id,
      kind: 'object',
      resource: typeof s.data.resource === 'string' ? s.data.resource : '',
      owner: null,
      quantity: Number(s.data.stock ?? 0),
      reserved: false,
    })),
  ];
  // Bare exact identities take priority; only otherwise is a bare resource ID an alias.
  const exact = observed.filter(
    (x) => x.id === value && (!prefix || prefix === x.kind),
  );
  const matched =
    scope !== 'optional-exact-visible' &&
    (prefix === 'resource' || (!prefix && !exact.length))
      ? observed.filter((x) => x.resource === value)
      : exact;
  const permitted = matched.filter((x) =>
    scope === 'owned' || scope === 'optional-owned'
      ? x.kind === 'item' && x.owner === actor.id
      : scope === 'ground'
        ? x.kind === 'item' && x.owner === null
        : scope === 'object'
          ? x.kind === 'object'
          : scope === 'known'
            ? x.kind === 'object' || x.owner === null
            : true,
  );
  const candidates = permitted.map((x) => `${x.kind}:${x.id}`);
  if (
    scope === 'optional-exact-visible' &&
    (world.state.refugeDiagnostics === 1 ||
      world.state.foodPreservation === 1 ||
      world.state.shortRefuge === 1 ||
      world.state.riverWater === 1)
  ) {
    const malformed =
      prefix === 'resource' || /^(item|object|resource):/.test(value);
    const code = malformed
      ? 'malformed-reference'
      : !permitted.length
        ? 'absent-or-inaccessible-identity'
        : permitted.length > 1
          ? 'ambiguous-identity'
          : permitted[0]?.reserved
            ? 'reserved-material'
            : quantity > (permitted[0]?.quantity ?? 0) + 1e-8
              ? 'insufficient-quantity'
              : null;
    const accessibleCandidates = candidates.length
      ? candidates
      : observed
          .filter((x) => x.kind === 'item' && x.owner === actor.id)
          .slice(0, 12)
          .map((x) => `item:${x.id}`);
    if (code)
      throw new ForestReferenceError(
        code,
        accessibleCandidates,
        'Reference resolution failed independently of material suitability.',
        {
          contract:
            world.state.refugeDiagnostics === 1
              ? 'shelter-reference-diagnostics@1'
              : 'exact-preservation-identity',
          reasonCode: code,
          suppliedReference: reference,
          resolvedId:
            permitted.length === 1 ? (permitted[0]?.id ?? null) : null,
          requiredCondition:
            'One exact personally accessible persistent identity; resource aliases are not identities.',
          observedObstruction: code,
          candidates: accessibleCandidates,
          paidEnergy: 0,
          remainingWork: 1,
          operationId: `shelter-inspection:${actor.id}:${String(world.tick)}`,
        },
      );
  }
  if (!permitted.length)
    throw new ForestReferenceError(
      matched.length ? 'wrong-kind-or-ownership' : 'unavailable',
      matched.map((x) => `${x.kind}:${x.id}`),
      'no valid personally observed reference',
    );
  if (permitted.length > 1)
    throw new ForestReferenceError(
      'ambiguous',
      candidates,
      'choose an explicit identity',
    );
  const item = permitted[0];
  if (!item) throw new Error('Missing resolved reference.');
  if (item.reserved)
    throw new ForestReferenceError(
      'reserved',
      candidates,
      'material belongs to ongoing work',
    );
  if (quantity > item.quantity + 1e-8)
    throw new ForestReferenceError(
      'insufficient-quantity',
      candidates,
      `requested ${String(quantity)}, available ${String(item.quantity)}`,
    );
  return item.id;
}

export const FOREST_REFERENCE_SCOPES: Record<
  string,
  Record<string, V7ReferenceScope>
> = {
  eat: { target: 'owned' },
  drop: { target: 'owned' },
  give: { target: 'owned' },
  pickup: { target: 'ground' },
  gather: { target: 'object' },
  navigate: { target: 'known' },
  'inspect-route': { target: 'known' },
  'assess-food': { target: 'owned' },
  'observe-wildlife': { target: 'object' },
  'shelter-maintain': { target: 'object' },
};

export function forestResolveAction(
  world: V7World,
  actor: V7Actor,
  action: V7Action,
): V7Action {
  if (!world.config.experience) return action;
  const ability = world.abilities.find((a) => a.id === action.interface);
  const references =
    ability?.references ?? FOREST_REFERENCE_SCOPES[action.interface] ?? {};
  const args = { ...action.args };
  for (const [parameter, scope] of Object.entries(references)) {
    const value = args[parameter];
    if (
      value === undefined &&
      !ability?.parameters.required?.includes(parameter)
    )
      continue;
    if (
      Array.isArray(value) &&
      ability?.parameters.properties?.[parameter]?.type === 'array'
    ) {
      args[parameter] = value.map((entry) => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          typeof entry.target !== 'string' ||
          typeof entry.quantity !== 'number'
        )
          throw new ForestReferenceError(
            'invalid',
            [],
            parameter + ' requires target and quantity entries',
          );
        return {
          ...entry,
          target: forestResolveReference(
            world,
            actor,
            entry.target,
            scope,
            entry.quantity,
          ),
        };
      });
      continue;
    }
    if (typeof value !== 'string')
      throw new ForestReferenceError(
        'invalid',
        [],
        `${parameter} must be a reference string`,
      );
    if (
      !value &&
      (scope === 'known' ||
        scope === 'optional-owned' ||
        scope === 'optional-exact-surface' ||
        scope === 'optional-exact-visible')
    )
      continue;
    args[parameter] = forestResolveReference(
      world,
      actor,
      value,
      scope,
      parameter === 'target' &&
        ['eat', 'drop', 'give', 'pickup', 'gather'].includes(action.interface)
        ? Number(args.quantity ?? 1)
        : 0,
    );
  }
  return { ...action, args };
}
