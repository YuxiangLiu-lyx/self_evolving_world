# ex5: Heterogeneous Survival and World Evolution

## Goal

Observe heterogeneous autonomous survival and persistent World Agent-designed resource, ecology and mechanic growth across four actors over120 synchronous rounds, retaining failures, deaths, exploration and actual individual experience.

## Fixed protocol

Four ordinary actors share one prompt and autonomy on a seeded 48 by 48 map. 120 synchronous rounds; 60 ordinary attempts per actor; 48 World Agent attempts, two per batch. Initial health 100, satiety 60; action first, zero-satiety damage 10, then satiety loss 2. No refill, rescue, forced destination or required skill. ChatGPT-plan OAuth; no paid API-key fallback. Each model decision, ecological assignment and executable implementation is retained. World development finishes before advancing time.

## Results

140 model attempts (25 world); 135 accepted, 3 failed/rejected. 7 shared skills, 3 new resource types, 4 ecological rules. 0/4 survivors. 121 reconstructed snapshots; zero invariant failures.

| Actor | Health | Satiety | Learned | Uses | Cells visited | Death round |
| --- | --- | --- | --- | --- | --- | --- |
| lin | 0 | 0 | ability-1, ability-2, ability-5 | 21 | 68 | 102 |
| moss | 0 | 0 | ability-1, ability-2, ability-4, ability-5, ability-6 | 9 | 27 | 55 |
| sol | 0 | 0 | ability-1, ability-2, ability-5 | 8 | 45 | 64 |
| reed | 0 | 0 | ability-1, ability-2, ability-3, ability-5, ability-7 | 11 | 57 | 85 |

Goal observations: realWorldReview=true; generatedSkillExecuted=true; resourceVocabularyExpanded=true; survivedBeyondIdle=true. An unsuccessful survival outcome remains a valid experiment. The all-wait control is descriptive, not a causal estimate of learning benefit. New mechanics use a constrained executable operation language; unrestricted new physics is outside this prototype.

## Evidence

[Replay](replay.json), [full model ledger](model-calls.json), [durable execution](execution.json), [world registry](skills.json), [measurements and curves](results.json), [chart](overview.svg). The required behavioral analysis is indexed under ../analyses. The offline all-wait control dies at round 40; the integration smoke is a simulated test, never real-model evidence.
