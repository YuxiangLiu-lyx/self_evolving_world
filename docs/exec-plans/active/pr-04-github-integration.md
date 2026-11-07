# PR-04: GitHub Version Control and CI Integration

## Objective and scope

Connect the existing project to `YuxiangLiu-lyx/self_evolving_world`, establish its first version on `main`, and run the existing full validation in GitHub Actions. Preserve all current project files and runtime behavior. Store browser reports and screenshots as CI artifacts rather than committing generated output.

## Acceptance

- [x] Inspect local and remote history; preserve any existing commits.
- [x] Configure `origin` with the requested GitHub repository and use `main` for the initial version.
- [ ] Verify workflow action references and add report retention and manual dispatch.
- [ ] Update repository metadata and development instructions in English.
- [ ] Run full local validation, inspect all five screenshots, and pass the completion gate.
- [ ] Commit and push the project, establish upstream tracking, and inspect remote CI results.
- [ ] Record actual results, archive this plan, and validate the final state.

## Findings and progress

The local repository had no commits or remote. The target GitHub repository was empty with `main` as its default branch; the connected account has push access. Configured HTTPS `origin` and renamed the unborn local branch to `main`.

The existing workflow already runs the full validation on pushes and pull requests. Verification found that its pnpm action SHA identified an annotated tag object rather than a commit. Resolved the tag to its release commit and pinned that commit before publishing. Added manual dispatch and 14-day artifact retention with a verified upload-artifact release commit.

## Validation and limitations

Pending execution for this task. Local passing results do not establish remote CI success. Branch protection and release publishing are separate repository policies and are not configured by this task.
