# EX13: bounded context, early accumulation and an engineering-budget stop

## Outcome

The single fresh formal run reached **280 of 1600 target rounds**, then paused
before round 281 because its **40 conversation development attempts were spent**.
All three people were alive at health 100. The 200-round checkpoint continued
automatically. No seed replacement, outcome-selected rerun, extra budget, rescue
resources or historical model replay occurred. This is an early observation,
not a completed long-horizon or full-season experiment.

There is evidence of paid, persistent intermediate work and subsequent reuse:
examining a surface, moving its cover, relocating the actual residue, then placing
an actual root on that surface. There is also a real dietary change: Moss chose
a one-tenth apple trial at 264, followed by ordinary apple meals at 266, 274 and 280. Those actions supplied **71 total nutrition**, including one from the trial.
The original apple food profile already existed; this is personal testing and
subsequent use, not invented nutrition or demonstrated general food safety.

No productive cultivation, useful shelter, sustained tool savings, entertainment,
culture or stable division of labor was demonstrated. Conservative source-specific
precursors and repeated diagnostic requests consumed much of the development
budget before a difficult season could be observed.

## Reproducible configuration and retained state

The [protocol](../../../LONG_DEVELOPMENT.md), [archive manifest](../../../../experiment/ex13/manifest.json),
[execution/checkpoint](../../../../experiment/ex13/execution.json),
[replay index](../../../../experiment/ex13/replay.json) and
[source history](../../../../experiment/ex13/source-history.json) retain the fixed
configuration and exact continuation state. The seed is 20261123, map 48 by 36,
vision radius 5, three independent people with finite lives, and model
`gpt-6.1-sol` through the existing ChatGPT OAuth channel. Scope `long-ex13` starts
with `inheritSkills=false`; no previous generated skill is automatically active.

The authored baseline is navigation, rest, wait, pickup, gathering, eating, dropping,
giving, messaging, requesting a capability, learning, probing, consulting personal
records and exchange. Known berry/root food is supplied baseline knowledge, not a
discovery. These 14 interfaces and their physical costs remain distinct from the
28 subsequently installed capability IDs. Registry, private knowledge, operation
state, effects and retrieval remain scoped to this run.

Hunger costs 0.9 per round. The frozen 800-round environmental cycle is mild
0–219, increasing pressure 220–379, difficulty 380–599, recovery 600–739 and mild
740–799, then repeats. Cooling is 1.5 degrees, rain floor 0.8 and growth floor 0.3
in the relevant stages; local drought starts at 260/1060 and waterlogging at
520/1320. Only early summer, the first pressure stage and the start of drought
were observed. Neither the difficult stage nor a full seasonal cycle was reached.

The retained no-model calibration uses the actual fresh baseline: a privileged
mobile controller survived 1600 rounds with no failed actions and 74.9% spare
rounds, whereas stationary single-source strategies depleted food at 82/82/174
and first died at 227/227/292. A failed 3-degree draft remains archived. The final
1.5-degree setting was chosen before the first formal call. These controllers,
fixtures and routes never entered formal decision context and are not autonomous
results. No optional technical model probe was used.

The run was started and advanced through `pnpm task -- start`, `submit` and `next`
for `pr-31-long-open-development`; development work returned to this conversation.
There are 38 retained source versions: initial source plus 37 accepted handoffs.
Every accepted revision reconstructed the committed prefix with identical world
and event hashes. Three rejected development attempts remain charged. Nine accepted
handoffs were technical repairs without a new capability; the other 28 installed
reviewed capabilities. Source-specific modeling assumptions and implementation reuse
are documented in development-01 through development-40 in this directory.

The final pending Lin request, `bounded-outdoor-rest-protection-trial`, received a
world development decision in call524 but cannot be implemented within the frozen
cap. Its round-281 action was not committed. Sol's final branch feasibility ability
was learned at280 but never used. The world is recoverable; this delivery does not
authorize resuming beyond the exhausted cap or imply that paused people kept waiting.

## Context and inference cost

[Before/after measurements](context-before-after.json), [final raw-derived metrics](outcome-metrics.json)
and the complete call files distinguish actual provider usage, BPE estimates and
unknown-use reservations. Token estimation uses pinned `js-tiktoken`/`o200k_base`;
it is not billing truth. Complete requests include instructions, schema and query
results. Individual module estimates overlap their containing packet and must not
be summed twice.

Fresh complete-request estimates fell from 10876/10086/10820 to 3875/3710/3843.
An offline projection of ex10's retained last state fell from 21057/23277/23204 to
9077/10039/10158; the expanded 5000-entry fixture was about4027. No historical model
was called. Semantic indexing and stable personal-record pagination repaired two
retained pre-inference input-guard pauses at56 and157. Active work, exact material
identities, progress, cancellation and escrow remain lossless.

| Metric                                         |             Ordinary |               World |
| ---------------------------------------------- | -------------------: | ------------------: |
| Attempts, including failed/rejected            |                  433 |                  91 |
| Accepted / rejected / failed                   |          426 / 0 / 7 |          88 / 2 / 1 |
| Parsed query batches / decisions / no response |        215 / 211 / 7 |         59 / 31 / 1 |
| Actual input median / p95 / max                | 8639 / 10558 / 11736 |  6573 / 8248 / 9333 |
| Complete BPE estimate median / p95 / max       | 9857 / 12115 / 13922 | 7509 / 9502 / 11384 |
| Known input tokens                             |              3620774 |              579356 |
| Known output tokens                            |               158590 |               54927 |
| Unknown reservations                           |               214039 |               42929 |
| Known tokens spent on query responses          |              1798039 |              352446 |
| Elapsed-call median / p95                      |       8.08s / 21.69s |      5.50s / 60.32s |

The total charged ledger is **4670615 / 10000000**: actual known usage4413647 plus
256968 conservative reservations. The input distribution does **not** meet the
ordinary 4k–8k typical target; its median is8639. It is smaller than the retained
ex10 median19140 and ex12 median10665, but different protocols/windows prevent a
causal comparison. The complete complex-input guard remained14000 and output3500.

Ordinary median estimated modules were instructions661, output schema168,
observation2198, memory2310, current abilities1421, execution471, inventory157 and
retrieval201 (p95 retrieval1917). World median applicant1929, registry2209 and
retrieval603 (p95 retrieval3265) still impose material cost. Full distributions
are retained in outcome-metrics.json.

Queries consumed **2150485 known tokens, 48.72% of known usage**. The pre-run
8398400-token forecast assumed20% query overhead and understated this behavior.
There were211 distinct ordinary `(person, round, reason)` decision opportunities,
433 attempts and1.55 ordinary calls per environment round across all three people.
The 211 completed plans correspond to about3.98 person-action rounds per plan;
this is a descriptive ratio, not a productivity measure.

The commonest reason was task completion (112 distinct opportunities). Nine
opportunities followed an out-of-range message failure; successful outgoing messages
did not themselves force replanning. Three ambiguity opportunities (at18,191,265)
used four attempts, with actual candidate IDs rather than silent substitution.
Two insufficient-quantity opportunities remain visible. Program preflight failures
and the 28 committed failed actions are separate populations. One settled-operation
retry at41 correctly failed; no observed double material debit or duplicated output
is established by these records. Execution regressions cover those boundaries, not
proof of every possible generated implementation.

Seven ordinary failures retain aborted, parsing, empty-commentary, transport,
overload and service503 cases. Two world responses used quoted learning durations
and were rejected; one world timeout remains charged. The later successful attempt
never overwrote a failure. Known elapsed calls sum to about115.3 minutes; development,
validation and waiting time are additional. Development, Codex internal reasoning,
review and tool token/cash costs are **unknown**, not zero and not included in the
10-million ordinary/world ledger. The subscription ceiling is not a percentage of
an account's allowance. Frozen caps were1800/100/40 ordinary/world/development
attempts; unused ordinary or token allowance does not waive the development cap.

## Individual behavior and actual experience

| Person | Final satiety / energy | Navigation / rest / gather / eat rounds | Requests / mastery events | Successful messages | Ordinary attempts / known tokens |
| ------ | ---------------------- | --------------------------------------- | ------------------------- | ------------------: | -------------------------------- |
| Lin    | 68 / 28.66             | 102 / 64 / 17 / 17                      | 12 / 15                   |                   7 | 159 / 1408597                    |
| Moss   | 63 / 36.25             | 110 / 67 / 15 / 18                      | 12 / 13                   |                   5 | 127 / 1156801                    |
| Sol    | 62 / 32.82             | 120 / 68 / 17 / 16                      | 5 / 9                     |                   5 | 147 / 1213966                    |

Each person has280 committed action slots. Navigation is not all subsistence: it
also approaches trial sites and other people. Rest/gather/eat alone take98,100,101
rounds (35.0%,35.7%,36.1%); including all navigation gives71.4%,75.0%,78.9%, an upper
bound that deliberately overcounts survival travel. No defensible counterfactual
time saving is available. Failed committed actions total8/8/12; site occupancy,
reach, ordinary-soil compatibility and observed navigation obstacles are real limits.

Lin persisted through cover clearing, residue transfer and root placement, then
pursued joining and opening a nut. The recovered loose wrap at91 retained material
identity and condition, but the personal project later still described an arrangement.
A requested reconciliation at113–114 corrected that discrepancy; persistent memory
is not guaranteed accurate progress. Lin later sought other food and outdoor rest
protection. The last request remains pending, not a shelter result.

Moss began a root trial, adopted the current run's site methods through personal
learning, finished a prepared placement at103, then examined and opened a separately
acquired nut. Source applicability required additional implementation rather than
instant skill inheritance. The exposed nut was recovered whole at184 and its stone
at185; no edible interior was detached. After a separate apple assessment263 and
explicit dose authorization, the264 bite consumed0.1 of the actual owned apple,
left0.9, raised satiety7.3 to8.3 before metabolism, and used0.9975733 energy. Subsequent
meals at266/274/280 provided20/30/20 nutrition. There is no modeled delayed physiology
or general safety conclusion; the existing fruit parameters remain unchanged.

Sol repeatedly investigated moss, learned site methods and retained a root specimen.
A press at19 consumed0.1 moss, failed load0.3 and measured flexibility0.8. A loose
arrangement at25 retained0.9 but produced no additional rest benefit. Birchy material
and later branches prompted container/rain-screen feasibility requests; missing
geometry and support were reported rather than invented finished objects. The last
ability was mastered but unused. This is persistence with weak practical payoff,
not evidence that a useful project was completed.

All three ended health100, with no deaths or revivals. Final total wellbeing was
9.287/8.767/8.489; physical comfort supplies most of this small score and it is not
itself a depression indicator. Slow mental state ended0.0782/0.0260/0.0468. Actual
rest mental multipliers ranged1.00060–1.00757,1.00062–1.00387 and1.00063–1.00477.
Additional recovered energy above the nominal uncapped recovery attributable to the
small multiplier summed0.993/0.548/0.691. Sol has69 rest events but68 baseline rest
actions because an actual arrangement contact also rested; it had no facility bonus.
Thus psychological recovery effects were real but very small in this window.

Recorded confirmed-information events number4/4/3, with actual failed tests able
to yield bounded knowledge. There was no reward for requesting, registering,
learning, naming or querying. Meal monotony ended0/0.429/0; transient pleasure,
slow state and physical nutrition remain distinct. The run supplies no evidence
of sustained hobbies, entertainment or rich social satisfaction.

## Capability and dependency evidence

There are29 committed requests,28 installed capability IDs,37 personal mastery
events and27 IDs with at least one successful action. These are **not** 28 independent
inventions. The [complete functional grouping](functional-groups.json) groups18 IDs
into11 physical families and separates10 diagnostic/control IDs. It is transparent
analyst classification, not a model-independent novelty score. Five IDs were mastered
by multiple people; four were actually used successfully by multiple people. Source
adapters and reused code remain explicitly marked in development records.

| Evidence chain       | Real sequence and result                                                                                                                    | Limit                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Soil compatibility   | Lin failed14/15, examined17, displaced cover21–23, transferred0.04 residue31–32, placed a paid root38–39                                    | Retained root, no propagation rule or food yield                         |
| Same-run reuse       | Moss learned site interfaces, transferred actual residue50–51, resolved applicability and placed101–103; Sol placed90–91                    | Personal learning required; no automatic shared mastery                  |
| Joining and recovery | Lin tested vine70, measured87, placed88, wrapped89, inspected90 and recovered91                                                             | No load-bearing strength, maintenance saving or comfort established      |
| Nut contact          | Lin examined124 and paid contacts138–139; Moss independently obtained inputs, learned the adapted method, contacted178–179 and inspected180 | Limited exposed region; no detached edible yield or safety claim         |
| Dietary change       | Moss requested at261, learned262, assessed263, explicitly tried264, ate266/274/280                                                          | Existing nutrition, no causal claim that the new interface was necessary |
| Last precursor       | Sol gathered279, requested review, learned branch assessment280                                                                             | No execution before budget pause                                         |

At280 ten generated persistent objects remain: four root trials, three prepared
surfaces, two residue deposits and one loose-moss arrangement. The wrap was
intentionally recovered. There is no active generated production process and no
harvest. Specimen age/spoilage continues normally; displayed trial markers do not
prove living plants. No building, durable productive facility or demonstrated
maintenance cycle was completed. Material conservation and dependency identity are
stronger evidence here than productivity.

Seventeen actual messages include advice and later reports of depleted/remaining
food. They do not transfer inventory or mastery. No actual give/exchange or formal
teaching event occurred. Similar choices may reflect shared goals/interfaces and
nearby conditions; these observations do not isolate personality effects or prove
coordination caused later behavior.

## Interpretation and next experiment

The interface now supports bounded, permission-scoped retrieval, persistent paid
work and auditable source changes. Some projects continued after survival actions;
later work depended on earlier physical state. Those are limited foundations for
accumulation. The observed run does not establish development across thousands of
rounds, adaptive culture or sustained production. The engineering cap was reached
while more than half the token budget remained.

A major limiting factor is overly narrow source/person applicability plus incomplete
material geometry and food-trial representation. Several reasonable requests become
another assessment, a compatibility adapter or a paginated quote. This interpretation
is supported by the handoff log and high retrieval cost, but is not a randomized
causal finding. Environmental difficulty also remains largely unobserved, so it
cannot explain absence of later inventions by itself.

The most valuable next experiment is one clean, fixed-budget run after making
source applicability and physical/control records concise and reusable while
preserving personal learning and observation permissions. Test conserved multi-step
work against several independently acquired sources offline, then measure developer
handoffs and query tokens per actually useful outcome under the same budget. Do not
preload successful projects or grant these ex13 abilities into that fresh run.

## Presentation and delivery evidence

The [Ashen guide](../../../presentation/ex13/README.md) lists twelve actual-event
bookmarks and the independent local URL. Original ex9 and all historical archives
remain available. Dynamic browser evidence and final scoped acceptance/CI records
are retained separately from experiment outcomes; their completed status must be
read from the final delivery record rather than inferred from this scientific report.

The final delivery lint check required an explicit body for the prepared-placement
`afterEnvironment` callback. This syntax-only repository fix happened after the
budget stop; it changes neither simulation effects nor any retained source snapshot.
No inference resumed. Frozen revision38 remains the actual last execution source;
source-bound continuation must still match that retained version and satisfy its
budget policy. Current-code replay validation independently checks the same outcomes.
