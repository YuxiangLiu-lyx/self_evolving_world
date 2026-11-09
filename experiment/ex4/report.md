# ex4: Survival-driven Skill Learning

## Goal

Observe whether primitive-era actors request, learn and use generated resource-backed skills to improve health and survival under sustained hunger over 18 synchronous rounds; preserve real model evidence and a separate deterministic no-action control.

## Protocol

Three actors, 18 synchronous rounds, at most 12 ordinary calls per actor and 12 World Agent attempts total; two attempts per review batch. ChatGPT-plan OAuth, no API-key fallback. World review and constrained-code development complete before the round barrier. The deterministic all-wait control makes no model calls.

## Results

27 model attempts (3 World Agent); 26 accepted, 0 failed/rejected. 2 registered implementations; 3/3 survivors; 1 conversation development barriers. 19 reconstructed snapshots and zero invariant failures.

| Actor | Health | Satiety | Learned | Successful uses | Death round |
| --- | --- | --- | --- | --- | --- |
| lin | 100 | 81 | skill-1, skill-2 | 9 | Alive |
| moss | 100 | 81 | skill-1, skill-2 | 9 | Alive |
| sol | 100 | 81 | skill-1, skill-2 | 9 | Alive |

Goal checks: realWorldReview=true; generatedSkillExecuted=true; survivedBeyondIdle=true. A completed execution does not imply every scientific objective was achieved.

All-wait offline control: health100 at round5, health90 at round6, death at round15. The idle control demonstrates the starvation baseline, not a causal estimate of learning benefit. Model decisions and additional actions differ together. See the required conversation analysis for hypotheses and proposed improvements.

## Evidence

[Replay](replay.json), [model inputs and outputs](model-calls.json), [durable decisions and development](execution.json), [executable registry](skills.json), [measurements](results.json), [chart](overview.svg). The replay retains detailed requests, review reasons, individual progress and actual use outcomes. Prompts and model response identifiers are retained; credentials and hidden reasoning are not.
