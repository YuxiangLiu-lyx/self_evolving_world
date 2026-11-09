# Programmatic Task Harness

Use `pnpm task` for development, documentation, experiment and mixed tasks. The thin TypeScript coordinator owns execution order; the current Codex conversation owns interpretation, implementation and actual review. It returns JSON and exits whenever conversation work is needed. There is no second agent, model call, service or background repair loop.

## Start and continue

Inspect Git status, preserve unrelated work, read the project/architecture/feature documents, and record the user's requirements in an English numbered plan before implementation. Save the original request and its choices in an ignored intent file, then run:

```bash
pnpm task -- start validation-results/intent.json
pnpm task -- status task-id
pnpm task -- submit task-id validation-results/response.json
pnpm task -- next task-id
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

| Information                                                   | Source and propagation                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task ID, original request, English plan, requirement revision | User intent recorded before preparation; amendments retain prior intent and invalidate acceptance                                                                                       |
| Requested category                                            | `code`, `documentation`, `experiment` or `mixed`; informational, never a check bypass                                                                                                   |
| Actual route                                                  | Existing `taskRoute` reads committed, staged, unstaged, deleted and untracked files; documentation remains code; numbered archives and their analysis companions remain experiment work |
| Experiment                                                    | `none` for code-only work; explicit `random` or `survival` plus `new`/`reuse` and instruction basis; new IDs cannot be supplied by callers                                              |
| Random parameters                                             | Existing defaults: seed 20261107 and 160 rounds; same permitted ranges; no model calls                                                                                                  |
| Survival parameters                                           | Existing fixed 60 rounds and at most five attempted calls per actor; explicit authorization required; checks/recovery never replay inference                                            |
| Reuse                                                         | Explicit ID and actual user basis, also recorded using the current plan's reuse contract; existing resume only repairs incomplete saved-data capture                                    |
| Retrospective analysis                                        | `analyze: ["ex3"]` reads that archive without allocating, executing or overwriting it; new/changed experiment targets are derived automatically                                         |
| Commit and publication                                        | Derived from actual plan policy; default all routes require both; explicit local-only preserves the existing reviewed dirty-worktree/no-network exception                               |
| Merge                                                         | Plan policy expresses the requested delivery; a separate `missing`, `granted` or `forbidden` authority records the actual instruction and scope. Green CI is never authorization        |
| Version and evidence                                          | Actual branch, base/head, source/plan/intent hashes, validation run, log paths, exact reviewed files, current-head PR body, publication and final receipt                               |
| Continuation                                                  | Current step, status, reason, handoff and command journal; state directories use existing fingerprint exclusions                                                                        |

Plan exceptions remain authoritative and must agree with intent. PR-only and local-only require an explicit prohibition in the task context. Default merge with missing evidence of permission publishes and checks the PR, then returns `needs_authorization`; it cannot merge or complete. Already recorded grants do not ask for identical permission again. Publication uses the unchanged prepare-only publisher; an authorized merge is handed to the current Codex GitHub connector with the exact reviewed SHA and `merge_method=merge`. The existing verify-only and final gates independently inspect the remote PR, current checks and main ancestry. A successful tool response alone is insufficient.

## Conversation protocol

Every request includes its ID, task ID, step, requirement revision, source and intent fingerprints, materials, question and continuation command. Copy `request.id`, `request.requirementsVersion` and `request.sourceHash` into a response as `requestId`, `requirementsVersion` and `sourceHash`. A response cannot select a different stage. Stale requests are rejected.

| Requested step        | Response fields beyond the common binding                         | Current conversation's responsibility                                                                                                                          |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`             | `kind: "prepared"`, substantive `notes`                           | Implement scope, synchronize plan/docs, protect unrelated work; this is not validation approval                                                                |
| `analysis`            | `kind: "analysis"`, `file`                                        | Inspect actual experiment inputs/outputs/actions and write the [analysis record](../experiment/README.md#behavioral-analysis); no recommendations are executed |
| `review`              | `kind: "review"`, `file`, exact complete `files`, `commitMessage` | Inspect every current screenshot, behavior log and complete changed files against requirements; submit the original review schema with actual judgments        |
| `pr-body`             | `kind: "pr-body"`, `file`, `title`                                | Prepare the unchanged PR template and requirement/file/evidence matrix for the already reviewed commit                                                         |
| `merge` without grant | `kind: "authorization"`, actual `authority`                       | Record a real scoped grant if one exists; otherwise leave the task pending                                                                                     |
| `merge` with grant    | `kind: "merge-result"`, actual tool `result`                      | Perform the specified authorized GitHub operation and return its result; code verifies remote facts                                                            |

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

## Execution and recovery contract

The [coordinator](../scripts/task-flow.ts) is the executable sequence. [Runtime effects](../scripts/task-runtime.ts) invoke existing allocation, complete validation, local review, PR preflight, publication and independent completion commands. The [migration map](exec-plans/completed/pr-13-programmatic-harness.md#migration-map) records their previous triggers and counterparts. No original test, screenshot, PR template requirement, CI check or conflict rule is removed.

`running` records an executing deterministic step without claiming completion. `needs_review` returns actual conversation work. `needs_fix` records a failed local gate. `needs_authorization` stops before an unauthorized merge. `blocked` records an unresolved publication/integration/environment failure. `completed` requires an independently accepted completion receipt, including explicit exception semantics. None is an agent-supplied whole-task verdict.

Logs and journals are saved before commands. New experiments reconcile the before/after archive IDs before continuing. A known exited failure before allocation may retry on an explicit continuation; an uncertain interruption requires process/allocation investigation first. Completed simulations use existing capture-only resume; incomplete/corrupt simulation data stays failed. No inference is retried to obtain passing evidence. A command restart reuses the existing PR lookup/update and commit state; it does not blindly create another PR or experiment. The shared validation lock prevents two coordinator commands from writing current evidence concurrently; legacy direct commands must not be run concurrently with the coordinator.

Source, documentation, requirement or relevant artifact changes invalidate current acceptance. New validation still runs the **complete unfiltered suite** and replaces review/delivery evidence. There is no automatic repair loop. The existing publisher retains its bounded 90-attempt, ten-second CI polling and request timeouts. Fix failures in the conversation, then explicitly continue. Environment, authentication and service failures remain incomplete.

Legacy `harness`, `validate`, `task:review`, `pr:check`, `task:publish`, `task:finish` and experiment commands remain available and share the same gate implementations. Direct `task:publish` retains its existing default merge behavior and must only be used with actual authorization; the unified entry always separates publication and merge. No standalone command can prove that a person genuinely inspected evidence. The coordinator adds structured continuity, not a security boundary against dishonest local file edits.
