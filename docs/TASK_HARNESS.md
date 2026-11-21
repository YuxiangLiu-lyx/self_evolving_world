# Programmatic Task Harness

Use `pnpm task` for development, documentation, experiment and mixed tasks. The thin TypeScript coordinator owns execution order; the current Codex conversation owns interpretation, implementation and actual review. It returns JSON and exits whenever conversation work is needed. There is no second agent, model call, service or background repair loop.

## Start and continue

Inspect Git status, preserve unrelated work, read the project/architecture/feature documents, and record the user's requirements in an English numbered plan before implementation. Save the original request and its choices in an ignored intent file, then run:

```bash
pnpm task -- start validation-results/intent.json
pnpm task -- status task-id
pnpm task -- submit task-id validation-results/response.json
pnpm task -- next task-id
# A captured computation-only pause in this task's own unfinished run:
pnpm task -- repair task-id
# Changed requirements or plan location require a higher requirementsVersion:
pnpm task -- amend task-id validation-results/revised-intent.json
```

`start` returns a preparation request. Complete implementation and documentation in the current conversation, then submit `prepared`. Submission and continuation run every decidable remaining step, stopping at the next handoff or failure. They do not wait for Codex while holding a process open. `status` is read-only: stored remote observations are not a fresh remote check. `next` rechecks prerequisites. Never edit derived state to claim success.

A minimal **explicit PR-only example** follows; replace every fixture instruction with the actual request. Default delivery is `merge` under the existing [delivery policy](PULL_REQUESTS.md#automatic-pr-delivery-for-every-task), not PR-only. Record the real applicable instruction and task scope for every choice. Do not copy this example's permission into another task.

```json
{
  "id": "task-id",
  "task": "Concrete English task name",
  "request": "The actual original user request, including its constraints.",
  "plan": "docs/exec-plans/active/pr-99-concrete-task.md",
  "requirementsVersion": 1,
  "requestedType": "code",
  "experiment": { "mode": "none" },
  "analyze": [],
  "delivery": {
    "mode": "pr-only",
    "basis": {
      "source": "task-instruction",
      "reference": "Current task request, delivery paragraph",
      "quote": "Publish a reviewed PR for this task, but do not merge it."
    }
  },
  "merge": {
    "status": "forbidden",
    "basis": {
      "source": "task-instruction",
      "reference": "Current task only; no merge grant",
      "quote": "Publish a reviewed PR for this task, but do not merge it."
    }
  }
}
```

The original intent and later amendments remain in `validation-results/tasks/<id>.json`. Private/original user text belongs in ignored state; tracked plans and reviews remain English. Sources of choices are `task-instruction` or `standing-instruction`; `reference` identifies the applicable scope and `quote` preserves the instruction. These are evidence supplied by the conversation, not permissions minted by code. A schema cannot establish that an authorization quote is truthful.

## Parameters, derived facts and evidence

The [typed context](../scripts/task-context.ts) separates `intent`, `derived`, and actual execution records. Unknown input parameters are rejected; there are no skip-check, automatic-approval or arbitrary command options.

| Information                                                   | Source and propagation                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task ID, original request, English plan, requirement revision | User intent recorded before preparation; amendments retain prior intent and invalidate acceptance                                                                                                |
| Requested category                                            | `code`, `documentation`, `experiment` or `mixed`; informational, never a check bypass                                                                                                            |
| Actual route                                                  | Existing `taskRoute` reads committed, staged, unstaged, deleted and untracked files; documentation remains code; numbered archives and their analysis companions remain experiment work          |
| Experiment                                                    | `none` for code-only work; explicit `random`, `survival`, `learning`, `evolution`, `coevolution` or `continuous` plus `new`/`reuse` and instruction basis; new IDs cannot be supplied by callers |
| Random parameters                                             | Existing defaults: seed 20261107 and 160 rounds; same permitted ranges; no model calls                                                                                                           |
| Survival parameters                                           | Existing fixed 60 rounds and at most five attempted calls per actor; explicit authorization required; checks/recovery never replay inference                                                     |
| Learning parameters                                           | Fixed 18 rounds, 12 ordinary calls per actor and 12 world attempts; two attempts per batch; source-bound durable continuation and conversation development handoff                               |
| Evolution parameters                                          | Fixed 120 rounds, four actors, 60 ordinary attempts each and 48 world attempts; offline smoke, source-bound continuation, existing development handoff; see [protocol](EVOLUTION_EXPERIMENT.md)  |
| Reuse                                                         | Explicit ID and actual user basis, also recorded using the current plan's reuse contract; existing resume only repairs incomplete saved-data capture                                             |
| Retrospective analysis                                        | `analyze: ["ex3"]` reads that archive without allocating, executing or overwriting it; new/changed experiment targets are derived automatically                                                  |
| Commit and publication                                        | Derived from actual plan policy; default all routes require both; explicit local-only preserves the existing reviewed dirty-worktree/no-network exception                                        |
| Merge                                                         | Plan policy expresses the requested delivery; a separate `missing`, `granted` or `forbidden` authority records the actual instruction and scope. Green CI is never authorization                 |
| Version and evidence                                          | Actual branch, base/head, source/plan/intent hashes, validation run, log paths, exact reviewed files, current-head PR body, publication and final receipt                                        |
| Continuation                                                  | Current step, status, reason, handoff and command journal; state directories use existing fingerprint exclusions                                                                                 |

Plan exceptions remain authoritative and must agree with intent. PR-only and local-only require an explicit prohibition in the task context. Default merge with missing evidence of permission publishes and checks the PR, then returns `needs_authorization`; it cannot merge or complete. Already recorded grants do not ask for identical permission again. Publication uses the coordinator-bound prepare-only publisher; an authorized merge is handed to the current Codex GitHub connector with the exact reviewed SHA and `merge_method=merge`. A current GitHub COMMENT self-review is required before PR-only completion or a merge handoff. The verify-only and final gates independently inspect that review, the remote PR, current checks and main ancestry. A successful tool response alone is insufficient.

## Conversation protocol

Every request includes its ID, task ID, step, requirement revision, source and intent fingerprints, materials, question and continuation command. Copy `request.id`, `request.requirementsVersion` and `request.sourceHash` into a response as `requestId`, `requirementsVersion` and `sourceHash`. A response cannot select a different stage. Stale requests are rejected.

| Requested step        | Response fields beyond the common binding                         | Current conversation's responsibility                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`             | `kind: "prepared"`, substantive `notes`                           | Implement scope, synchronize plan/docs, protect unrelated work; this is not validation approval                                                                                                                      |
| `development`         | `kind: "development"`, `file`                                     | Inspect the saved learning barrier and submit exact pending reviews, constrained code and actual review notes; no elapsed development time advances the world                                                        |
| `analysis`            | `kind: "analysis"`, `file`                                        | Inspect actual experiment inputs/outputs/actions and write the [analysis record](../experiment/README.md#behavioral-analysis); no recommendations are executed                                                       |
| `review`              | `kind: "review"`, `file`, exact complete `files`, `commitMessage` | Inspect every newly selected screenshot, verify reused review provenance and inspect affected behavior logs and complete changed files against requirements; submit the original review schema with actual judgments |
| `pr-body`             | `kind: "pr-body"`, `file`, `title`                                | Prepare the unchanged PR template and requirement/file/evidence matrix for the already reviewed commit                                                                                                               |
| `remote-review`       | `kind: "remote-review-result"`, actual tool `result`              | Publish the supplied findings using GitHub COMMENT on the exact commit; the program reads the remote record before accepting it                                                                                      |
| `merge` without grant | `kind: "authorization"`, actual `authority`                       | Record a real scoped grant if one exists; otherwise leave the task pending                                                                                                                                           |
| `merge` with grant    | `kind: "merge-result"`, actual tool `result`                      | Perform the specified authorized GitHub operation and return its result; code verifies remote facts                                                                                                                  |

All submitted files live under `validation-results/`. For example, a preparation response is:

```json
{
  "requestId": "COPY_CURRENT_REQUEST_ID",
  "requirementsVersion": 1,
  "sourceHash": "COPY_CURRENT_SOURCE_HASH",
  "kind": "prepared",
  "notes": "Implemented the numbered scope and synchronized the current English plan."
}
```

The review handoff includes a patch and **all** changed paths: untracked contents must also be opened. Use the existing [visual and behavior criteria](VALIDATION.md#visual-review), not an automatic PASS generator. The program checks completeness and bindings but cannot prove judgment quality.

The version-bound GitHub COMMENT lists every reviewed file and combines each screenshot's actual judgment with its original path and SHA-256 in one record. This avoids duplicate paths within the bounded review body; the full original local review remains hash-bound and all freshness/completeness gates still apply.

## Execution and recovery contract

The [coordinator](../scripts/task-flow.ts) is the executable sequence. [Runtime effects](../scripts/task-runtime.ts) invoke existing allocation, scoped validation, local review, PR preflight, publication and independent completion commands. The [migration map](exec-plans/completed/pr-13-programmatic-harness.md#migration-map) records their previous triggers and counterparts. Tests and scene contracts remain available; the impact planner selects relevant checks. Required CI names, actual review and conflict/integration gates remain enforced.

`running` records an executing deterministic step without claiming completion. `needs_review` returns actual conversation work. `needs_fix` records a failed local gate. `needs_authorization` stops before an unauthorized merge. `blocked` records an unresolved publication/integration/environment failure. `completed` requires an independently accepted completion receipt, including explicit exception semantics. None is an agent-supplied whole-task verdict.

Logs and journals are saved before commands. New experiments reconcile the before/after archive IDs before continuing. A known exited failure before allocation may retry on an explicit continuation; an uncertain interruption requires process/allocation investigation first. After confirming an interrupted process stopped, explicit `pnpm experiment:resume -- exN` routes to `pnpm task -- recover ID exN` and journals capture-only recovery for that allocated incomplete record; it never reissues inference. Completed simulations use existing capture-only resume; incomplete/corrupt simulation data stays failed. No inference is retried to obtain passing evidence. A command restart reuses the existing PR lookup/update and commit state; it does not blindly create another PR or experiment. The shared validation lock prevents two coordinator commands from writing current evidence concurrently; compatibility commands use the same coordinator lock. Internal workers additionally require the executing task lease, matching step, intent, checkout and evidence.

A captured continuous computation-budget pause may use `repair` only while the task's own newly allocated run is unpublished, below its original target and development limit, with no pending or uncertain model call or actor review. The coordinator retains the failed capture under `technical-pauses/round-N/`, opens a counted technical development barrier and retains the original pending actions, calls, source history, seed and limits. The conversation supplies no fabricated actor request or world approval. Source validation reconstructs every committed round before a repair can resume the same unsettled round. This is not a budget-exhaustion override or a replacement experiment.

Changes require a current impact plan and renewed diff review. Dependency-bound check evidence remains reusable when its own inputs and output bytes match; missing or invalidated selected evidence reruns. Code changes retain all unit tests. Explicit audits select the full suite. There is no automatic repair loop. The existing publisher retains its bounded 90-attempt, ten-second CI polling and request timeouts. Fix failures in the conversation, then explicitly continue. Environment, authentication and service failures remain incomplete.

## Supported entries and self-review boundary

`pnpm harness -- start intent.json` and the other unified subcommands are aliases of `pnpm task`. The older `pnpm harness -- "task name"`, `task:review`, `task:finish`, `task:publish -- body title`, `experiment:run`, `experiment:survival`, `experiment:learning` and `experiment:resume` resolve an existing task and continue the same state machine. Missing or ambiguous task context fails before any operation. Experiment arguments must agree with recorded intent. The legacy review command returns the structured review request; only an explicit review submission with exact changed-file coverage can accept it. The publication wrapper can submit a body only for the current PR-body request. It cannot independently merge. Its legacy `--verify-only` option routes to `pnpm task -- verify ID`: fresh independent completion checks only, with no preparation, commit, publication, experiment allocation or merge. Missing prerequisites fail closed.

`pnpm validate`, `pnpm check`, `pr:check`, `experiment:check` and individual debugging checks remain standalone so CI and diagnostics can produce evidence. They cannot publish, merge or complete a task. The one-round diagnostic and OAuth login remain explicit separate tools; numbered experiments are coordinator-bound. Calling internal acceptance/publication/completion or numbered-experiment scripts directly requires the live coordinator lease and matching context. The publisher accepts only prepare-only/verify-only worker modes; its former automatic HTTP merge branch is removed.

The `remote-review` handoff contains the exact GitHub COMMENT payload: task/revision/plan, reviewed commit, validation run, source and review hashes, every reviewed path, actual visual/behavior/requirement findings, and screenshot paths/hashes. Publish it through the current conversation's GitHub connector and submit the tool result. The program queries the PR reviews and requires a submitted COMMENT with identical body and commit; it records the GitHub account, review ID and URL. A matching record is reused after interruption. Missing, dismissed, altered or wrong-head records block delivery. Changes to local review evidence require review again. Local-only tasks remain offline.

This is explicitly **current-conversation Codex self-review**, never independent approval. The connected account is the publisher identity, not evidence of a second reviewer. The record makes the findings and their provenance auditable; it cannot prove that screenshots were seen or that semantic/causal conclusions are correct. Complete visual and semantic review remains the conversation's responsibility. No extra reviewer, model service or approval is introduced. A COMMENT does not invalidate exact-head quality evidence; PR contract checks remain bound to the reviewed body revision.

The supported command boundary prevents accidental alternate-entry bypass. It is not a security sandbox against editing repository source/state or invoking GitHub directly with credentials. Do not fabricate authorization or review evidence.

## Learning experiment continuation

The [learning-v1 protocol](SKILL_LEARNING_EXPERIMENT.md) is an explicit new-experiment mode. It preserves accepted ordinary and World Agent decisions across process exits. A development handoff saves the same-round snapshot and returns control; submitting its exact result validates code and batch completeness before continuation. `next` reuses the allocated ID and recorded decisions. Changed core/simulator source or an uncertain started model call blocks execution; no automatic resend occurs. Completed simulations use the same capture-only recovery and required analysis. New mode parameters cannot alter validation, publication or merge authority.

## Coevolution protocol adapter

`experiment.mode: "coevolution"` selects the separately versioned [180-round target protocol](COEVOLUTION_EXPERIMENT.md), using the same allocation, current-conversation development, analysis, validation and delivery steps. Its guarded alias is `pnpm experiment:coevolution`. Three actors share120 ordinary attempts and20 world attempts; exhausted budgets freeze the world and retain its observed window. Ten development interventions cap the measurable conversation handoffs; actual internal development model usage remains unavailable. Version6 archives preserve target versus observed rounds and all existing acceptance gates.

When a real coevolution request needs a new interpreter effect, first run `next` with the unchanged registered engine to retain the development baseline. The development file may include an `implementation` review alongside the usual barrier, tick, proposal and notes. The adapter verifies the allowed source boundary, unchanged full executed/call prefix and complete unit/type/lint/architecture/build checks before accepting the new source revision. A source change outside that boundary requires a new run. The same coordinator handles declaration-only work, analysis and final selected browser/PR gates; source extension validation does not complete the task.

The independent `continuous` mode uses the same experiment/development/analysis/capture/delivery stages. Its fixed initial observation and shared budgets are defined in [Continuous World](CONTINUOUS_WORLD.md); `pnpm experiment:continuous` is a coordinator-bound compatibility entry, not a standalone inference bypass.
