import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { forestEvent } from './forest-climate.js';
import { foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  FIBER_CORD as F,
  FIBER_CORD_SECTIONING as M,
} from './long-fiber-cord.js';

const ID = 'hand-twist-sectioned-cord';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Event names of this operation; the reused fiber-cord@1 modes are announced under them too. */
const PREFIX = 'sectioned-cord-';
/** Longest twisted span two hands hold and twist at once: the whole fiber-cord@1 cord (0.30 m). */
const SECTION = M.LENGTH.max;
/** Requested twisted span: the fiber-cord@1 minimum, up to two sections. */
const LENGTH = { min: M.LENGTH.min, max: 0.6 };
/** Paid rounds of each section in order; one release check follows the last section. */
const STEPS = ['separate-align', 'twist', 'counter-ply'];
const CHECK = 'release-check';
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  sample: ['materials'],
  make: ['materials', 'requestedLength', 'workId'],
  inspect: ['targetId', 'workId'],
  trial: ['targetId', 'trialForce', 'trialDuration'],
  cancel: ['workId'],
};

/** One section of the twisted span, measured from the end the hands start at. */
interface Section extends V7Data {
  section: number;
  from: number;
  to: number;
  aligned: boolean;
  twisted: boolean;
  plied: boolean;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: V7Json | undefined) => (typeof v === 'number' ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const tenths = (s: { quantity: number }) => foodTenths(s.quantity);
const sectionCount = (length: number) =>
  Math.max(1, Math.ceil(length / SECTION - 1e-9));
const roundsOf = (n: number) => STEPS.length * n + 1;
/** Paid round r (from 1) of n sections: its section and step; the last round is the release check. */
function stepOf(r: number, n: number) {
  return r > STEPS.length * n
    ? { section: n, step: CHECK }
    : {
        section: Math.floor((r - 1) / STEPS.length) + 1,
        step: STEPS[(r - 1) % STEPS.length] ?? '',
      };
}
/** Equal consecutive sections of the twisted span; the strands run through all of them unjoined. */
function plan(length: number, n: number): Section[] {
  return Array.from({ length: n }, (_, i) => ({
    section: i + 1,
    from: F.metres((length * i) / n),
    to: F.metres((length * (i + 1)) / n),
    aligned: false,
    twisted: false,
    plied: false,
  }));
}
function sectionsOf(p: V7Data): Section[] {
  return (Array.isArray(p.sections) ? p.sections : []).map((v) => {
    const r: V7Data = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    return {
      section: Number(r.section),
      from: Number(r.from),
      to: Number(r.to),
      aligned: r.aligned === true,
      twisted: r.twisted === true,
      plied: r.plied === true,
    };
  });
}
/** Twisted spans up to 0.60 m whose plies stay hand-twistable and within the strands, given the volume. */
function feasible(strand: number, volume: number): number[] | null {
  const length = (area: number) => (volume / 2 / area - 2 * F.END) / M.TAKEUP,
    low = Math.max(LENGTH.min, length((Math.PI * M.PLY.max ** 2) / 4)),
    high = Math.min(
      LENGTH.max,
      length((Math.PI * M.PLY.min ** 2) / 4),
      (strand - 2 * F.END) / M.TAKEUP,
    );
  return low <= high ? [F.metres(low), F.metres(high)] : null;
}
/** The fiber-cord@1 visual metadata, with the section geometry of unfinished work. */
function view(w: V7World, s: V7Stack): V7Data {
  const v = F.view(w, s),
    p = F.part(s),
    rounds = num(p.rounds),
    working = F.roleOf(s) === 'workpiece' && rounds !== null;
  return {
    ...v,
    ...(working
      ? {
          progress: v7RoundNumber(Number(p.stages ?? 0) / rounds),
          sections: sectionsOf(p),
          alignedLength: num(p.alignedLength),
          heldLength: num(p.heldLength),
          pliedLength: num(p.pliedLength),
        }
      : {}),
    untested: p.untested === true,
  };
}

const ownJobs = (w: V7World, a: V7Actor) =>
  collectiveJobs(w, ID).filter((j) => j.owner === a.id);
const current = (w: V7World, a: V7Actor) => ownJobs(w, a).find(open);
const workpieceOf = (w: V7World, j: CollectiveWork) =>
  j.target ? w.stacks.find((s) => s.id === j.target) : undefined;
/** Reserved input fiber of the work not yet handled. */
const pending = (w: V7World, j: CollectiveWork) =>
  w.stacks.filter(
    (s) => s.reservedFor === j.id && s.id !== j.target && s.quantity > 0,
  );
function summary(w: V7World, j: CollectiveWork): V7Data {
  const piece = workpieceOf(w, j),
    n = Number(j.sections),
    done = j.completedWork ? stepOf(j.completedWork, n) : null,
    next =
      open(j) && j.remainingWork > 0 ? stepOf(j.completedWork + 1, n) : null;
  return {
    workId: j.id,
    actor: j.owner,
    revision: str(j.revision),
    status: j.status,
    stage: done?.step ?? 'reserved',
    section: done?.section ?? null,
    nextStage: next?.step ?? null,
    nextSection: next?.section ?? null,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    totalRounds: j.initialWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    resource: str(j.resource),
    origin: str(j.origin),
    requestedLength: Number(j.cordLength ?? 0),
    sectionCount: n,
    sectionLength: Number(j.sectionLength ?? 0),
    workLength: Number(j.workLength ?? 0),
    reserved: pending(w, j).map((s) => ({ item: s.id, quantity: s.quantity })),
    workpiece: piece?.id ?? null,
    scrap: strings(j.scrap),
    position: { x: j.x, y: j.y },
    visual: piece ? view(w, piece) : null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
/** A released workpiece stays as the real unfinished or failed material it is. */
function settle(piece: V7Stack | undefined, status: string) {
  if (!piece || F.roleOf(piece) !== 'workpiece') return;
  const p = F.part(piece);
  p.status = status;
  p.workId = null;
}
function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    `${PREFIX}paused`,
    `${reason} Paid rounds, reserved fiber and the workpiece are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: M.STEP },
    j.target ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
function fail(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const w = c.world,
    piece = workpieceOf(w, j);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(w, c.actor, j, reason, false);
  settle(piece, 'failed');
  c.emit(
    `${PREFIX}failed`,
    `${reason} The actual loose, twisted or damaged fiber stays as it is; nothing is refunded.`,
    summary(w, j),
    piece?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** Round 1: measure all reserved fiber, set broken strands aside, separate two ply bundles and
 * align the first section. */
function align(
  c: V7ActionContext,
  j: CollectiveWork,
  inputs: V7Stack[],
): V7HandlerResult {
  const w = c.world,
    resource = str(j.resource) ?? '',
    r = F.material(w, resource),
    law = F.STRANDS[resource];
  if (!r || !law) throw new Error('Missing strand law.');
  const total = inputs.reduce((n, s) => n + tenths(s), 0),
    intact = inputs.reduce((n, s) => n + tenths(s) * F.conditionOf(s), 0),
    broken = Math.min(total, Math.floor(total - intact + 1e-9)),
    usable = total - broken,
    length = Number(j.cordLength),
    n = Number(j.sections),
    g = M.shape(r, law, usable, length),
    measured = {
      totalTenths: total,
      brokenTenths: broken,
      usableTenths: usable,
      requestedLength: length,
      sectionCount: n,
      sectionLength: Number(j.sectionLength),
      plyFiberLength: F.metres(g.plyFiberLength),
      plyDiameter: F.metres(g.plyDiameter),
      strandLength: law.length,
      waterShare: F.wetness(r),
      feasibleLength: feasible(law.length, g.volume),
    },
    problem =
      usable < 2
        ? 'too little intact fiber for two plies'
        : g.plyFiberLength > law.length
          ? `${String(law.length)} m strands are shorter than the ${String(F.metres(g.plyFiberLength))} m ply and no splices are made`
          : g.plyDiameter < M.PLY.min
            ? 'plies would be thinner than 1 mm, too fine to roll by hand'
            : g.plyDiameter > M.PLY.max
              ? 'plies would be thicker than 12 mm, too thick to twist tightly by hand'
              : null;
  if (problem) {
    workStop(
      w,
      c.actor,
      j,
      `Measured shortfall: ${problem}. All reserved fiber returned once; the round's energy is not refunded.`,
      false,
    );
    openRemember(c, {
      key: `${ID}:make:${resource}:shortfall:${problem.split(' ').slice(0, 3).join('-')}`,
      subject: resource,
      property: 'sectioned hand-twisted two-ply cord feasibility',
      value: v7Json({ outcome: 'shortfall', problem, ...measured }),
      method:
        'separating the reserved fiber into two bundles and aligning them',
      condition: `${String(usable / 10)} usable units for a ${String(length)} m cord`,
      verified: true,
    });
    c.emit(
      `${PREFIX}shortfall`,
      `Separating and aligning showed a shortfall: ${problem}. No cord was started; all reserved fiber is returned.`,
      { ...summary(w, j), ...measured, shortfall: problem },
      j.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, ...j.escrow] };
  }
  // Broken strands come out first, from the least intact lots, as owned damaged scrap.
  let left = broken;
  const scraps: V7Stack[] = [],
    classes = new Set<string>();
  for (const s of [...inputs].sort(
    (a, b) => F.conditionOf(a) - F.conditionOf(b) || (a.id < b.id ? -1 : 1),
  )) {
    for (const k of M.classesOf(s) ?? []) classes.add(k);
    const k = Math.min(tenths(s), left);
    left -= k;
    if (!k) continue;
    const scrap: V7Stack = {
      ...materialPortion(s, k),
      id: v7Id(w, 'item'),
      owner: c.actor.id,
      position: { ...c.actor.position },
      processing: {
        [F.PART]: {
          role: 'scrap',
          classes: M.classesOf(s) ?? [],
          condition: 0,
          from: s.id,
          workId: j.id,
          at: w.tick,
        },
      },
    };
    delete scrap.reservedFor;
    scraps.push(scrap);
  }
  const base = inputs[0];
  if (!base) throw new Error('Missing reserved fiber.');
  const sections = plan(length, n),
    first = sections[0];
  if (!first) throw new Error('Missing section plan.');
  first.aligned = true;
  const ages = inputs.flatMap((s) =>
      typeof s.harvestedAt === 'number' ? [s.harvestedAt] : [],
    ),
    piece: V7Stack = {
      ...v7Clone(base),
      id: v7Id(w, 'item'),
      quantity: usable / 10,
      quantityTenths: usable,
      owner: c.actor.id,
      reservedFor: j.id,
      position: { ...c.actor.position },
      processing: {
        [F.PART]: {
          role: 'workpiece',
          status: 'aligned',
          stage: STEPS[0] ?? '',
          section: 1,
          stages: 1,
          rounds: j.initialWork,
          workId: j.id,
          law: F.LAW,
          madeWith: REVISION,
          classes: [...classes].sort(),
          condition: v7RoundNumber(Math.min(1, intact / usable)),
          length,
          twisted: 0,
          plied: false,
          plies: 2,
          twist: { ply: 'S', lay: 'Z' },
          overall: F.metres(length + 2 * F.END),
          plyDiameter: g.plyDiameter,
          looseEnds: 4,
          frayedEnds: 0,
          sections,
          alignedLength: first.to,
          heldLength: 0,
          pliedLength: 0,
          from: inputs.map((s) => s.id),
          madeBy: c.actor.id,
          startedAt: w.tick,
        },
      },
    };
  if (ages.length) piece.harvestedAt = Math.min(...ages);
  w.stacks = w.stacks.filter((s) => !inputs.includes(s));
  w.stacks.push(piece, ...scraps);
  j.escrow.push(piece.id);
  j.target = piece.id;
  j.scrap = scraps.map((s) => s.id);
  c.emit(
    `${PREFIX}progress`,
    `Paid round 1 of ${String(j.initialWork)} (separate-align, section 1 of ${String(n)}): ${String(usable / 10)} units in two bundles${broken ? `, ${String(broken / 10)} broken set aside as scrap` : ''}; ${String(first.to)} m aligned. Unfinished work is no cord.`,
    {
      ...summary(w, j),
      round: 1,
      ...measured,
      handled: { incorporatedTenths: usable, scrapTenths: broken },
    },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, piece.id],
  };
}

/** Release check: two interlocked plies along every section must keep a coherent form. */
function check(
  c: V7ActionContext,
  j: CollectiveWork,
  piece: V7Stack,
): V7HandlerResult {
  const w = c.world,
    p = F.part(piece),
    r = F.material(w, piece.resource),
    sections = sectionsOf(p),
    holds =
      !!r &&
      F.conditionOf(piece) >= F.SOUND &&
      openMaterial(r).flexibility >= F.BEND &&
      p.plied === true &&
      sections.length > 0 &&
      sections.every((s) => s.plied) &&
      Number(p.length) > 0 &&
      Number(p.plyDiameter) > 0;
  delete piece.reservedFor;
  p.workId = null;
  p.stage = CHECK;
  p.stages = j.initialWork;
  p.heldLength = 0;
  if (holds) {
    p.role = 'cord';
    p.status = 'complete';
    p.untested = true;
    p.completedAt = w.tick;
    p.trials = [];
  } else p.status = 'failed';
  j.status = 'completed';
  j.outputs = [piece.id, ...strings(j.scrap)];
  const value = {
    outcome: holds ? 'complete' : 'unravelled',
    length: Number(p.length),
    overall: Number(p.overall),
    sectionCount: sections.length,
    plies: 2,
    plyDiameter: F.metres(Number(p.plyDiameter)),
    condition: F.conditionOf(piece),
  };
  openRemember(c, {
    key: `${ID}:make:${piece.resource}:${F.band(F.conditionOf(piece))}:${value.outcome}:${String(sections.length)}-section`,
    subject: piece.resource,
    property: 'sectioned hand-twisted two-ply cord form after release',
    value,
    method: `${String(j.initialWork)} paid rounds of separating, twisting and counter-plying ${String(sections.length)} section(s)${sections.length > 1 ? ' with regripping between them' : ''}`,
    condition: 'bare hands; no tool, anchor, water, splice or added fiber',
    verified: true,
  });
  c.emit(
    holds ? `${PREFIX}completed` : `${PREFIX}check-failed`,
    holds
      ? `Released: two interlocked plies kept one continuous ${String(value.length)} m cord made in ${String(value.sectionCount)} section(s), ply ${String(value.plyDiameter)} m thick. It is untested; no strength is known.`
      : 'Released: the plies did not keep their form; it stays a failed workpiece, not a cord.',
    { ...summary(w, j), ...value },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: true,
    remaining: 0,
    writes: [j.id, ...j.outputs],
  };
}

/** One paid round after rechecking hands, room, reservation and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world;
  if (!open(j)) throw new Error('This cord work is already settled.');
  const inputs = pending(w, j),
    piece = workpieceOf(w, j);
  if (
    j.completedWork === 0
      ? inputs.reduce((n, s) => n + tenths(s), 0) !== Number(j.reservedTenths)
      : piece?.reservedFor !== j.id
  )
    return fail(c, j, 'Reserved fiber or the workpiece is missing.');
  const blocked = F.crowded(w, c.actor, Number(j.workLength));
  if (blocked) return pause(c, j, `No room to work: ${blocked}.`);
  if (c.actor.vitals.energy < M.STEP)
    return pause(c, j, 'Not enough energy for the next paid round.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, M.STEP))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      `${PREFIX}resumed`,
      'Unfinished cord work resumed after rechecking hands, room, reserved fiber and energy.',
      summary(w, j),
      j.target ?? j.id,
    );
  const round = j.completedWork,
    n = Number(j.sections);
  if (round === 1) return align(c, j, inputs);
  if (!piece) throw new Error('Missing workpiece.');
  if (round >= j.initialWork) return check(c, j, piece);
  const { section, step } = stepOf(round, n),
    p = F.part(piece),
    r = F.material(w, piece.resource);
  // Regripping releases the counter-plied part, which must hold its own form; twisting needs sound strands.
  if (
    !r ||
    F.conditionOf(piece) < F.SOUND ||
    openMaterial(r).flexibility < F.BEND
  )
    return fail(
      c,
      j,
      step === 'separate-align'
        ? 'The counter-plied section did not keep its form when the hands moved on to the next section.'
        : 'Strands broke while being twisted.',
    );
  const sections = sectionsOf(p),
    s = sections[section - 1];
  if (!s) throw new Error('Missing section.');
  let done: string;
  if (step === 'separate-align') {
    s.aligned = true;
    p.alignedLength = s.to;
    p.status = 'aligned';
    done = `hands regripped past the counter-plied ${String(s.from)} m, which holds its own form; ${String(s.from)}-${String(s.to)} m aligned`;
  } else if (step === 'twist') {
    s.twisted = true;
    p.twisted = s.to;
    p.heldLength = F.metres(s.to - s.from);
    p.status = 'twisting';
    done = `${String(s.from)}-${String(s.to)} m twisted and held between both hands`;
  } else {
    s.plied = true;
    p.pliedLength = s.to;
    p.heldLength = 0;
    p.plied = section === n;
    p.status = section === n ? 'plied' : 'partly-plied';
    done = `${String(s.to)} m counter-plied and holding its own form`;
  }
  p.sections = sections;
  p.stage = step;
  p.section = section;
  p.stages = round;
  c.emit(
    `${PREFIX}progress`,
    `Paid round ${String(round)} of ${String(j.initialWork)} (${step}, section ${String(section)} of ${String(n)}): ${done}. Unfinished work is no cord.`,
    { ...summary(w, j), round, handled: { incorporatedTenths: 0 } },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, piece.id],
  };
}

function start(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  if (current(w, c.actor))
    throw new Error(
      'Unfinished sectioned cord work exists; resume it with make and its workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished sectioned cord work of yours has this workId; nothing was spent.',
    );
  const list = M.allocations(c),
    first = list[0]?.stack,
    length = F.metres(
      v7Number(
        c.action.args.requestedLength,
        'requestedLength',
        LENGTH.min,
        LENGTH.max,
      ),
    ),
    units = list.reduce((t, a) => t + foodTenths(a.quantity), 0);
  if (units < 2 || units > 10)
    throw new Error(
      'Select 0.2-1 unit in total, at least 0.1 per ply; nothing was reserved.',
    );
  if (
    !first ||
    list.some(
      (a) =>
        a.stack.resource !== first.resource || a.stack.origin !== first.origin,
    )
  )
    throw new Error(
      'Use one fiber material from one source; nothing was reserved.',
    );
  const r = F.material(w, first.resource),
    law = F.STRANDS[first.resource];
  if (!r || !law)
    throw new Error(
      'No strand law exists for this material, so no cord can be made from it; nothing was reserved.',
    );
  for (const { stack, quantity } of list) {
    const classes = M.classesOf(stack);
    if (!classes)
      throw new Error(
        'Treated material, scrap, cords and fragments cannot be twisted in this version; nothing was reserved.',
      );
    if (
      F.roleOf(stack) === 'workpiece' &&
      foodTenths(quantity) !== tenths(stack)
    )
      throw new Error(
        'Supply an unfinished workpiece whole; nothing was reserved.',
      );
    if (!M.covered(c.actor, stack, classes))
      throw new Error(
        `First pass a cord sample covering the source, processing and current condition of ${stack.id}; nothing was reserved.`,
      );
  }
  // Geometry the request alone rules out, even if every selected strand were intact.
  const best = M.shape(r, law, units, length);
  if (best.plyFiberLength > law.length)
    throw new Error(
      `${String(law.length)} m strands are shorter than the ${String(F.metres(best.plyFiberLength))} m ply of a ${String(length)} m cord and no splices are made; nothing was reserved.`,
    );
  if (best.plyDiameter < M.PLY.min)
    throw new Error(
      `Even with every strand intact the plies would be ${String(F.metres(best.plyDiameter))} m, thinner than 1 mm, too fine to roll by hand; nothing was reserved.`,
    );
  const room = F.metres(best.plyFiberLength),
    blocked = F.crowded(w, c.actor, room);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was reserved.`);
  if (c.actor.vitals.energy < M.STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  const n = sectionCount(length),
    j = workCreate(c, 'make', roundsOf(n));
  j.revision = REVISION;
  j.resource = first.resource;
  j.origin = first.origin;
  j.cordLength = length;
  j.sections = n;
  j.sectionLength = F.metres(length / n);
  j.workLength = room;
  j.reservedTenths = units;
  j.scrap = [];
  workReserve(c, j, list);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  c.emit(
    `${PREFIX}started`,
    `${String(units / 10)} unit(s) of sampled fiber reserved and held for one continuous ${String(length)} m two-ply cord in ${String(n)} section(s) of ${String(j.sectionLength)} m; no tool, anchor, water, splice or extra fiber is used.`,
    summary(w, j),
    j.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { workId, targetId } = c.action.args;
  if ((workId === undefined) === (targetId === undefined))
    throw new Error(
      'Inspect needs exactly one of targetId or workId; nothing was spent.',
    );
  const j =
      typeof workId === 'string'
        ? ownJobs(w, a).find((x) => x.id === workId)
        : undefined,
    s = j
      ? workpieceOf(w, j)
      : w.stacks.find((x) => x.id === targetId && x.owner === a.id);
  if (workId !== undefined && !j)
    throw new Error(
      'No sectioned cord work of yours has this workId; nothing was spent.',
    );
  if (!j && (!s || !F.roleOf(s)))
    throw new Error(
      'targetId must be your own item from fiber cord work (tested lot, scrap, workpiece, cord or fragment); nothing was spent.',
    );
  v7Spend(a, M.LOOK);
  const subject = j?.id ?? s?.id ?? '',
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      ...(s ? { ...F.look(w, s), ...view(w, s) } : {}),
    };
  if (s) F.part(s).inspectedAt = w.tick;
  openRemember(c, {
    key: `${subject}:fiber-cord-condition`,
    subject,
    property:
      'length, sections, plies, loose ends, fraying, damage, condition and work stage',
    value: v7Json(value),
    method: 'direct inspection',
    condition:
      'visible and measurable features only; breaking force and safe load stay unknown',
    verified: false,
  });
  c.emit(
    `${PREFIX}inspected`,
    'Only measurable length, sections, plies, loose ends, fraying, damage, condition and stage are reported; untested strength stays unknown and nothing was repaired.',
    value,
    subject,
  );
  return { complete: true, writes: [] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId !== j.id))
    throw new Error(
      'No unfinished sectioned cord work of yours to cancel; nothing was spent.',
    );
  const returned = pending(w, j).map((s) => s.id),
    piece = workpieceOf(w, j);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    w,
    c.actor,
    j,
    'Cancelled; unworked reserved fiber returned once and the workpiece stays as it is. Paid energy is not refunded.',
    false,
  );
  settle(piece, 'unfinished');
  c.emit(
    `${PREFIX}cancelled`,
    'Cord work cancelled: unworked fiber is returned once and any workpiece stays an owned unfinished item with its actual sections.',
    { ...summary(w, j), returned },
    piece?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** The unchanged fiber-cord@1 sample and trial, announced under this operation's event names. */
const announced = (c: V7ActionContext): V7ActionContext => ({
  ...c,
  emit: (type, description, data, target) => {
    c.emit(
      type.startsWith('fiber-cord-')
        ? `${PREFIX}${type.slice('fiber-cord-'.length)}`
        : type,
      description,
      data,
      target,
    );
  },
});

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  if (!ARGS[mode]) throw new Error('Unknown cord mode.');
  // The bound action continues each round; make naming the work resumes it.
  if (j && mode === 'make' && c.operation?.first === false)
    return advance(c, j);
  if (j && mode === 'make' && c.action.args.workId === j.id) {
    M.relevant(c, mode, ['workId']);
    return advance(c, j);
  }
  if (c.operation?.first === false && mode === 'make')
    throw new Error('The bound cord work is already settled.');
  M.relevant(c, mode, ARGS[mode]);
  if (mode === 'sample') return M.sample(announced(c));
  if (mode === 'make') return start(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return M.trial(announced(c));
  return cancel(c);
}

/** Reserved fiber stays in the owner's hands and an unworked round pauses. Worked fiber already
 * wears once per round through hand-twist-fiber-cord@1, which wears every fiber-cord item. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; paid rounds, reserved fiber and the workpiece are kept.';
      forestEvent(
        w,
        `${PREFIX}paused`,
        'Cord work paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        summary(w, j),
        j.target ?? j.id,
      );
    }
    sync(a, j);
  }
}

export const LONG_SECTIONED_CORD: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1', 'hand-twist-fiber-cord@1'],
  description:
    'General bare-hand twisting of one continuous two-ply cord up to 0.60 m in sections of at most 0.30 m under the unchanged fiber-cord@1 law: sample, staged paid making with a measured shortfall, inspection and bounded two-hand load trials. Its cords are ordinary fiber-cord@1 cords. No strength rating, reward or shelter effect.',
  reuse: {
    experiment:
      'ex16 hand-twist-fiber-cord@1 (revision hand-twist-fiber-cord@1, handler long.hand-twist-fiber-cord, law fiber-cord@1: strand law, conserved-volume ply geometry, sample records and coverage, exact allocations, round-1 measurement and shortfall, release rule, sample and trial modes, wear and visual metadata, through FIBER_CORD and a new append-only FIBER_CORD_SECTIONING export); ex16 hand-break-food@1 and hand-weave-fiber-mat@1 (staged escrowed work, pause, resume by workId, cancel, death)',
    source:
      'long-fiber-cord.ts FIBER_CORD and FIBER_CORD_SECTIONING (appended); collective-work.ts (escrow, paid work, stop); material-lots.ts; open-physical.ts (engine flexibility); open-foundation.ts (personal records); forest-climate.ts (events)',
    description:
      'Code reuse, not reinvention: hand-twist-fiber-cord@1 behavior, ability text and work records are unchanged, and its passing samples cover this operation. Only the section plan (ceil(length / 0.30) sections of align, twist and counter-ply rounds, then one release check), the regrip rule and the pre-cost refusal of geometry the request rules out are new. No ability, item, mastery or reward is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-twist sectioned fiber cord',
      function:
        'Sample owned fiber, hand-twist one continuous two-ply cord up to 0.60 m in sections, inspect it, load-trial it between both hands, or cancel; actual material and geometry decide results.',
      equivalence: 'cordage:hand-twisted-two-ply-fiber-cord:sectioned:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['sample', 'make', 'inspect', 'trial', 'cancel'],
          },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              stackId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          targetId: { type: 'string' },
          workId: { type: 'string' },
          requestedLength: {
            type: 'number',
            minimum: LENGTH.min,
            maximum: LENGTH.max,
          },
          trialForce: { type: 'number', minimum: 1 },
          trialDuration: {
            type: 'number',
            minimum: 1,
            maximum: F.ROUND_SECONDS,
          },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 3,
      learningEnergy: 0.2,
      costs:
        'Study: 3 rounds at 0.2 energy. materials: [{stackId: exact owned unreserved item id, quantity in 0.1 steps}]. sample: one non-food item, 0.1; 1 round, 0.5 energy. make (materials: 0.2-1 unit of one fiber and source, each covered by your passing cord sample of its source and processing at most 0.05 above its condition; requestedLength m): reserves it, then per section (ceil(length/0.30)) 3 paid rounds of 1 energy (separate-align, twist, counter-ply) and a final release-check: 4 rounds up to 0.30 m, 7 above; continues each round; resume with make and workId only. inspect (targetId: your item from cord work, or workId): 1 round, 0.2. trial (targetId: your cord or fragment of at least 0.2 unit and 0.12 m; trialForce N; trialDuration s): 1 round, 0.5. cancel: none. Work needs dry footing and nobody within your radius plus half the aligned ply length. Unworked rounds or low energy pause uncharged; refusals spend nothing; nothing is refunded.',
      effects:
        'fiber-cord@1 law unchanged: only reed has a strand law (1.8 m stems, 500 kg/m3, water share 0.9); two plies share the conserved solid volume over length x 1.155 + 0.02 m loose ends, so a longer cord of the same fiber has thinner plies. Strands run unjoined through all sections. Strands shorter than a ply, or plies under 1 mm even if all strands were intact, are refused before any cost. Round 1 sets broken strands aside as scrap and measures the cord; plies outside 1-12 mm or too little intact fiber is a measured shortfall returning all fiber. A section is at most the 0.30 m two hands twist at once; a counter-plied section holds its own form, so the hands regrip onto the next. Regrip, twist and release need condition 0.5. A finished cord is an ordinary owned untested fiber-cord@1 cord for knot, join and binding. Sample and trial are exactly those of hand-twist-fiber-cord; a trial break leaves two fragments. Worked fiber loses 0.0005 condition per round. Cancel or death releases unworked fiber once and leaves the workpiece. No reward or strength rating.',
      handler: 'long.hand-twist-sectioned-cord',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: a finished cord earns no milestone.
      practiceEvidence: `${PREFIX}completed`,
      dependencies: { abilities: [], resources: ['reed'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid rounds persist; resuming by workId pays only the next round after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-twist-sectioned-cord': execute },
  processes: {},
  visualComponents: [],
  events: [
    `${PREFIX}sampled`,
    `${PREFIX}started`,
    `${PREFIX}progress`,
    `${PREFIX}shortfall`,
    `${PREFIX}paused`,
    `${PREFIX}resumed`,
    `${PREFIX}failed`,
    `${PREFIX}completed`,
    `${PREFIX}check-failed`,
    `${PREFIX}cancelled`,
    `${PREFIX}inspected`,
    `${PREFIX}trial`,
    `${PREFIX}broken`,
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      const piece = workpieceOf(w, j);
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; reserved fiber and the workpiece were left where they died, once. Nothing is refunded.',
        true,
      );
      settle(piece, 'unfinished');
      forestEvent(
        w,
        `${PREFIX}failed`,
        'Cord work stopped by death; reserved fiber and the unfinished workpiece lie where the person died.',
        a.position,
        a.id,
        summary(w, j),
        piece?.id ?? j.id,
      );
      sync(a, j);
    }
  },
};
