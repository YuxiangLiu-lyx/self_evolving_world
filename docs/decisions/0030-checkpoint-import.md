# ADR-0030: Import a retained checkpoint as a new genesis

- Date: 2026-11-26
- Decision status: Accepted (implementation; first use is experiment C)
- Builds on: [ADR-0029](0029-culture-v2.md)

## Context

Experiment C asks whether newcomers can learn what a settled group has made: a place name, a
shared tale, ways of being together. That needs a world that already has a history. Earlier
runs always started from a fresh genesis, and continuing an archive cannot add people.
Changing ex18 itself is not allowed: archives are immutable.

## Decision

- A new experiment may start from the exact world of a completed window of another archive. The
  source is read only. The new archive records `importedFrom` with the world hash, the hash
  reconstructed by exact replay, the recorded round hash, the checkpoint hash and the source
  revision; allocation refuses any mismatch.
- Only listed changes are applied at genesis, and each is recorded in `importChanges`: the run
  policy and budgets, the new development scope, the window target and the added people.
  Everything else stays byte-identical, including memories, signs, plants and items.
- A world may list inherited development scopes (`development.inherited`). The registry then
  also includes those scopes' packages, so abilities that residents mastered keep working.
  `v7Install` still refuses every foreign scope, so new handoffs belong to the new scope only.
  Worlds without the field have exactly the registry they had before.
- Replay, analysis and the viewer start at the imported round.

## Alternatives and reasons

- **Continuing ex18 with extra people.** It would change an immutable archive and mix two
  configurations in one record.
- **Rebuilding a similar world by hand.** It would not be the same history, so it could not
  test whether this history is learnable.
- **Copying the inherited packages into the new scope.** It would duplicate code and change
  the residents' ability revisions, which the imported memories refer to.

## Costs and consequences

The 1,600-round genesis oracle cannot pass on an imported world, whose positions and stocks
are no longer the genesis ring, so an import's preflight covers its own window only. An
imported archive cannot itself be imported yet. The World Agent's rules block shows the
inherited scope. See [Import and newcomers](../CULTURE_SCENARIO.md#import-and-newcomers) and the experiment C plan.
