# PR-04: GitHub Version Control and CI Integration

## Objective and scope

Connect the existing project to `YuxiangLiu-lyx/self_evolving_world`, establish its first version on `main`, and run the existing full validation in GitHub Actions. Preserve all current project files and runtime behavior. Store browser reports and screenshots as CI artifacts rather than committing generated output.

## Acceptance

- [x] Inspect local and remote history; preserve any existing commits.
- [x] Configure `origin` with the requested GitHub repository and use `main` for the initial version.
- [x] Verify workflow action references and add report retention and manual dispatch.
- [x] Update repository metadata and development instructions in English.
- [x] Run full local validation, inspect all five screenshots, and pass the completion gate.
- [x] Commit and push the project, establish upstream tracking, and inspect remote CI results.
- [x] Record actual results and archive this plan. Revalidate the final documentation state before completion.

## Findings and progress

The local repository had no commits or remote. The target GitHub repository was empty with `main` as its default branch; the connected account has push access. Configured HTTPS `origin` and renamed the unborn local branch to `main`.

The existing workflow already runs the full validation on pushes and pull requests. Verification found that its pnpm action SHA identified an annotated tag object rather than a commit. Resolved the tag to its release commit and pinned that commit before publishing. Added manual dispatch and 14-day artifact retention with a verified upload-artifact release commit.

## Results

Created and pushed initial commit `0ce31ca80400385c9d386a2db371d16f4698260c` to `main`. The local branch tracks `origin/main`; both refs matched after the push. The baseline contains 68 project files, excluding dependencies, builds, credentials, and generated evidence. Added canonical repository metadata, clone instructions, a live CI badge, contribution instructions, and agent guidance.

Local validation on macOS arm64 with Node 24.22.2, pnpm 10.34.9, and Chromium:

- `pnpm validate -- "PR-04 GitHub integration"` passed types, lint, formatting, architecture checks, all 77 unit tests, builds, compiled CLI verification, all 7 browser tests, and validation of 23 Markdown files.
- Inspected all five current screenshots: desktop panels and controls aligned; the 390 px layout fit; agent vision hid distant entities; pickup and repeated unavailable attempts matched the inventory and log; historical frames disabled actions and displayed the correct state. No visual regression was found.
- Behavior assertions passed for movement, boundaries, collisions, ownership, visibility, unavailable attempts, replay invariance, and import/export. Browser runtime and resource health checks passed.
- Recorded the English review and passed `pnpm task:finish -- "PR-04 GitHub integration"` for local run `e59d54b5-bf3a-4bc8-b3bc-6343f7bee298`.

Remote validation ran on GitHub's Ubuntu 24.04 runner for the initial commit. [CI run 42327746973](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions/runs/42327746973) completed successfully: dependency and Chromium installation, full validation, and evidence upload all passed. Its logs confirm 77 unit tests, 7 browser tests, and 23 Markdown files. Downloaded artifact `13555818281` and verified the ZIP integrity, HTML report, validation report, and all five referenced screenshots. The remote report correctly remains `awaiting-review`; automated CI does not fabricate visual acceptance.

The archive and feature-status updates require fresh local validation, screenshot review, and a completion-gate pass before their final commit. Inspect the CI run for that final commit as well; the initial green run is evidence for the initial commit only. Current CI results are available from the repository's [Actions page](https://github.com/YuxiangLiu-lyx/self_evolving_world/actions).

## Limitations and follow-up

Branch protection, required reviews, releases, and package publishing are independent policies and were not configured. No PR was necessary to initialize an empty remote; subsequent work should use focused branches and PRs targeting `main`. Validation covers local macOS and remote Ubuntu Chromium; Firefox, WebKit, and Windows were not tested. CI artifacts expire after 14 days. No runtime or world-rule changes were made.
