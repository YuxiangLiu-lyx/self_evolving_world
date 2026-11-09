# ADR-0009: Static Experiment Catalogue and Read-Only Replay Navigation

- Date: 2026-11-07
- Status: Accepted
- Extends: [ADR-0004](0004-fixed-world-and-replay.md) and [ADR-0008](0008-numbered-experiments-and-task-routing.md).

## Context

The user wants one local webpage with a dropdown for numbered experiments. Retained records already contain validated replay data and charts, but require manual import. The existing viewer has all required timeline and agent-inspection controls.

## Decision

Use repository tooling from Vite configuration to validate completed records and emit a static catalogue, exact replay JSON and overview SVG. Serve the same assets during local development. Omit running/failed records to allow capture/resume builds, while retaining their failure in the full experiment/task gate. Publish no credentials, simulator source or private model output.

Use a labeled dropdown in World Observatory and a query parameter for direct links, refresh and browser navigation. Validate fetched data before replacing history; preserve the current world on failure and discard obsolete asynchronous results. Keep saved experiments read-only at every frame. Local demos, new worlds and file imports retain manual actions.

## Alternatives and reasons

- A separate page per experiment duplicates UI and does not provide a single navigation point.
- A database or application server adds persistence and deployment requirements beyond local browsing.
- Importing simulator/filesystem modules into browser source violates the established application boundary. Build tooling may inspect the archive while browser source consumes data only.
- Requiring manual import repeats the usability problem; catalogue discovery removes that step without changing the replay format.

## Costs and consequences

The archive catalogue is a snapshot at dev startup/build time. Restart development or rebuild after completing another experiment. Static output grows with replay/chart data. Full validation still checks every archived run and current screenshots. Direct URLs restore the whole history, not the selected frame or local session edits. No remote publication, backend persistence, core change or new model interaction is introduced.
