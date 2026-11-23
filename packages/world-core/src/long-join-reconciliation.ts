import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Package,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7Record } from './continuous-data.js';
import { v7Observe } from './continuous-observation.js';
import { v7Distance, v7Visible } from './continuous-geometry.js';
import { collectiveJobs, workCreate } from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
const ID = 'joining-trial-state-reconciliation',
  TRIAL = 'manual-88-lin-522',
  ARRANGEMENT = 'loose-wrap-88-lin-523',
  SOURCES = ['item-66-lin-388', 'item-76-lin-448'];
function remember(
  a: V7Actor,
  j: CollectiveWork,
  evidence: string,
  tick: number,
) {
  const key = 'joining-reconciliation:' + j.id;
  a.memory.knowledge ??= {};
  a.memory.knowledge[key] = {
    key,
    subject: j.id,
    property: 'dated accessible trial and containment evidence',
    value: v7Json(j.report),
    method:
      'personal record comparison, with separately authorized local verification if recorded',
    condition:
      'accessible evidence only; historical markers are not current objects',
    verified: false,
    tick,
    evidence: evidence || a.memory.knowledge[key]?.evidence || '',
  };
  a.extensionState['long:last-reconciliation'] = v7Json({
    processId: j.id,
    stage: j.stage ?? null,
    verification: j.verification ?? null,
    remainingWork: 0,
    paidEnergy: j.paidEnergy,
  });
}
function execute(c: V7ActionContext) {
  if (c.actor.id !== 'lin')
    throw new Error('This comparison is scoped to Lin own nominated records.');
  const mode = c.action.args.mode;
  if (mode === 'review') {
    if (
      c.action.args.trialId !== TRIAL ||
      c.action.args.claimedArrangementId !== ARRANGEMENT ||
      c.action.args.vineStackId !== SOURCES[0] ||
      c.action.args.branchStackId !== SOURCES[1]
    )
      throw new Error(
        'Supply the exact nominated personal trial, claimed arrangement and source references.',
      );
    const trial = collectiveJobs(c.world, 'source-bound-joining-trial').find(
      (j) => j.id === TRIAL && j.owner === c.actor.id,
    );
    if (!trial)
      throw new Error('The nominated personal trial record is unavailable.');
    const seen = v7Observe(c.world, c.actor.id),
      arrangement = seen.objects.find((o) => o.id === ARRANGEMENT);
    const summaries = (c.actor.memory.important ?? []).filter(
      (e) => e.type.startsWith('joining-') && e.tick >= trial.lastPaid - 1,
    );
    const sources = SOURCES.map((id) => {
      const s = seen.stacks.find((s) => s.id === id);
      const claims = seen.objects
        .filter((o) => Array.isArray(o.data.parts) && o.data.parts.includes(id))
        .map((o) => o.id);
      return s
        ? {
            id,
            quantity: s.quantity,
            owner: s.owner,
            reservedFor: s.reservedFor ?? null,
            availableByInventoryControl:
              s.owner === c.actor.id && !s.reservedFor && s.quantity > 0,
            visibleContainmentClaims: claims,
            storedStackPosition: s.position,
            positionMeaning:
              s.owner === c.actor.id
                ? 'Owned carried identity; stored position is not a current arrangement location or proof of remote access.'
                : 'Currently observable ground position; local reach still required.',
          }
        : {
            id,
            status:
              'not in accessible current inventory/observation; no hidden search performed',
          };
    });
    const active =
      ['active', 'paused'].includes(trial.status) && trial.remainingWork > 0;
    const operations: V7Data[] = [];
    if (arrangement) {
      if (
        v7Distance(c.actor.position, arrangement.spatial) <= 0.65 &&
        v7Visible(c.world, c.actor.position, arrangement.spatial)
      ) {
        operations.push({
          interface: 'source-bound-joining-trial',
          mode: 'inspect',
          arrangementId: arrangement.id,
          energy: 0.2,
          rounds: 1,
          conditions:
            'Live original geometry/access and personal mastery still required.',
        });
        if (!arrangement.data.activeWork)
          operations.push({
            interface: 'source-bound-joining-trial',
            mode: 'recover',
            arrangementId: arrangement.id,
            energy: 0.5,
            rounds: 1,
            conditions:
              'Live original geometry/access, extant contained material and personal mastery still required.',
          });
      }
    }
    if (active)
      operations.push({
        interface: 'source-bound-joining-trial',
        processId: trial.id,
        mode: 'resume or cancel',
        conditions:
          'Only the verified unfinished stage; revalidate original execution contract and actual location.',
      });
    const report = {
      tick: c.world.tick,
      actor: c.actor.id,
      access:
        'Own trial ledger, full retained personal summaries and currently visible/owned identities only.',
      trial: {
        id: trial.id,
        status: trial.status,
        completedWork: trial.completedWork,
        remainingWork: trial.remainingWork,
        paidEnergy: trial.paidEnergy,
        lastPaid: trial.lastPaid,
        active,
        historicalOutput: trial.target,
        allocation: trial.sources,
      },
      summaries: v7Json(summaries),
      summaryLimit:
        'Retained event IDs/timestamps and summaries; not complete target/quantity transition payloads. A recovery summary is not an independently reconstructed exact containment history.',
      sources: v7Json(sources),
      arrangement: arrangement
        ? {
            status: 'currently observed',
            id: arrangement.id,
            position: arrangement.spatial,
            stage: arrangement.data.stage ?? null,
          }
        : {
            status: 'absent from currently accessible observation index',
            physicalNonexistenceProven: false,
            location: null,
          },
      priorClaims: v7Json(
        Object.values(c.actor.memory.projects ?? {}).filter((p) =>
          JSON.stringify(p).includes(ARRANGEMENT),
        ),
      ),
      unresolved: [
        'Actor project claims and dated completion do not establish current existence.',
        'Search absence does not prove nonexistence outside observation.',
        'Summaries do not contain complete source-linked recovery payloads; no reconstruction from hidden/global history.',
        'Inventory control availability and visible containment claims require separately selected local verification; no global exclusivity certificate.',
      ],
      supportedOperations: operations,
      verification: 'not requested',
      qualified: false,
    };
    if (c.actor.vitals.energy < 0.2)
      throw new Error('Record comparison requires0.2 energy.');
    const j = workCreate(c, 'record-review', 1);
    v7Spend(c.actor, 0.2);
    j.status = 'completed';
    j.completedWork = 1;
    j.remainingWork = 0;
    j.paidEnergy = 0.2;
    j.lastPaid = c.world.tick;
    j.stage = 'report-completed';
    j.verification = 'not-requested';
    j.report = v7Json(report);
    c.emit(
      'joining-report-completed',
      'Completed a paid private comparison of accessible records; no physical recovery or restoration performed.',
      { processId: j.id, paidEnergy: 0.2, remainingWork: 0, qualified: false },
      j.id,
    );
    remember(c.actor, j, c.world.events.at(-1)?.id ?? '', c.world.tick);
    return { complete: true, writes: [j.id] };
  }
  const j = collectiveJobs(c.world, ID).find(
    (j) => j.id === c.action.args.processId && j.owner === c.actor.id,
  );
  if (!j)
    throw new Error(
      'Supply the exact personal reconciliation processId, not the original joining process.',
    );
  if (j.verification !== 'not-requested')
    throw new Error(
      'This optional verification is already completed or cancelled. Make a new dated review for changed evidence.',
    );
  if (mode === 'cancel') {
    j.verification = 'cancelled';
    j.stage = 'report-retained';
    const report = v7Record(j.report);
    report.verification = 'cancelled without physical change or refund';
    j.report = v7Json(report);
    remember(c.actor, j, '', c.world.tick);
    return { complete: true, writes: [j.id] };
  }
  if (mode !== 'verify' && mode !== 'resume')
    throw new Error(
      'Choose review, explicit local verify/resume, or cancel. Atomic stages never run unattended.',
    );
  const target = c.action.args.target;
  if (typeof target !== 'string' || ![ARRANGEMENT, ...SOURCES].includes(target))
    throw new Error(
      'Select one exact nominated visible source or arrangement.',
    );
  const seen = v7Observe(c.world, c.actor.id),
    object = seen.objects.find((o) => o.id === target),
    stack = seen.stacks.find((s) => s.id === target);
  if (!object && !stack)
    throw new Error(
      'No currently observable exact target; a record is not a remote scan.',
    );
  const location =
    object?.spatial ??
    (stack?.owner === c.actor.id ? c.actor.position : stack?.position);
  if (
    !location ||
    v7Distance(c.actor.position, location) > 0.65 ||
    !v7Visible(c.world, c.actor.position, location)
  )
    throw new Error(
      'Reach the actual visible target within0.65; no automatic navigation.',
    );
  const finding = {
    tick: c.world.tick,
    target,
    location: { x: location.x, y: location.y },
    ownership: stack?.owner ?? null,
    quantity: stack?.quantity ?? null,
    reservedFor: stack?.reservedFor ?? null,
    visibleContainmentClaims: seen.objects
      .filter(
        (o) => Array.isArray(o.data.parts) && o.data.parts.includes(target),
      )
      .map((o) => o.id),
    stage: object?.data.stage ?? null,
    exclusiveWithinAccessibleRepresentation: stack
      ? stack.owner === c.actor.id &&
        !stack.reservedFor &&
        !seen.objects.some(
          (o) => Array.isArray(o.data.parts) && o.data.parts.includes(target),
        )
      : null,
    scope:
      'Direct current accessible identity/containment only, not hidden-world nonexistence, strength or history reconstruction.',
  };
  v7Spend(c.actor, 0.2);
  j.paidEnergy += 0.2;
  j.lastPaid = c.world.tick;
  j.verification = 'completed';
  j.stage = 'local-verification-completed';
  const report = v7Record(j.report);
  report.verification = v7Json(finding);
  j.report = v7Json(report);
  c.emit(
    'joining-observation-verified',
    'Completed one paid local identity/containment observation; no physical manipulation.',
    { processId: j.id, paidEnergy: 0.2, qualified: false },
    target,
  );
  remember(c.actor, j, c.world.events.at(-1)?.id ?? '', c.world.tick);
  return { complete: true, writes: [j.id] };
}
export const LONG_JOIN_RECONCILIATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['source-bound-joining-trial@1'],
  description:
    'Private read-only comparison of accessible joining records with separately authorized local verification; no physical state repair.',
  reuse: {
    experiment: 'ex13',
    source:
      'source-bound-joining-trial@1/long.joining; collective-work.ts; continuous-observation.ts; foundation-open@1/open.probe and consult semantics',
    description:
      'Reuses own ledger and current observation access. It does not invoke destructive probing or rewrite the original trial, restore objects or grant mastery. This is an interface diagnostic, not a new material function.',
  },
  abilities: [
    {
      id: ID,
      name: 'Reconcile personal joining records',
      function:
        'Compare Lin retained trial and material records without inferring physical existence from old markers, then optionally verify one currently accessible identity.',
      equivalence: 'control:personal-joining-reconciliation:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['review', 'verify', 'resume', 'cancel'],
          },
          trialId: { type: 'string' },
          claimedArrangementId: { type: 'string' },
          vineStackId: { type: 'string' },
          branchStackId: { type: 'string' },
          processId: { type: 'string' },
          target: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 round/0.2 energy. Review(trialId=manual-88-lin-522,claimedArrangementId=loose-wrap-88-lin-523,vineStackId=item-66-lin-388,branchStackId=item-76-lin-448):1 round/0.2 energy, no materials. Report yields new reconciliation processId. Verify/resume(processId,target):optional separate atomic round/0.2 energy, at most once per report, only nominated currently visible/owned identity within0.65 actual reach. Cancel(processId) closes an unperformed optional stage without refund. No hidden lookup or automatic next action.',
      effects:
        'Personal dated report distinguishes historical completion, unfinished work, observed existence, absent observation, retained recovery summaries and actual current inventory control. Complete accessible records only; incomplete target/quantity history remains unresolved. Original source positions do not prove an arrangement location. Conditional original inspect/recover references require their real current prerequisites and separate personal mastery. No material movement, reservation, consumption, reconstruction, restoration or change to original trial/project claims. Atomic stages charge only on commit; failed access leaves no paid finding. Explicit verify/resume revalidates and performs only the one optional stage. Cancellation/death retains reports and closes unperformed verification; no passive work, reward, maintenance or world-time during development.',
      handler: 'long.join-reconciliation',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'joining-report-qualified',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic paid review; optional separately selected atomic local verification. No unattended or duplicate settlement.',
      },
    },
  ],
  handlers: { 'long.join-reconciliation': execute },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'joining-report-completed',
    'joining-observation-verified',
    'joining-report-qualified',
  ],
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && j.verification === 'not-requested',
    )) {
      j.verification = 'cancelled';
      j.stage = 'report-retained-after-death';
      const report = v7Record(j.report);
      report.verification =
        'cancelled on death; historical paid report retained';
      j.report = v7Json(report);
      remember(a, j, '', w.tick);
    }
  },
};
