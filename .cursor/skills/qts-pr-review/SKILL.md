---
name: qts-pr-review
description: Reviews qvac-test-suite pull requests and diffs for package-surface risk, CLI/versioning behavior, dist hygiene, workflow parity, docs accuracy, and mobile template/runtime integrity. Use when reviewing a PR, a branch diff, or doing a senior engineer pass on framework changes.
disable-model-invocation: true
---

# QTS PR Review

Use this skill for `qvac-test-suite` only.

## Review flow

1. Gather context from a PR URL or the current branch diff.
2. Read the touched files plus adjacent package metadata, README, workflow files, and `.github/pull_request_template.md` when the diff affects public behavior.
3. Review in this order:
   - correctness and regression risk
   - publish/package surface (`exports`, package metadata, install assumptions)
   - CLI and config contract
   - build reproducibility and `framework/dist` hygiene
   - workflow parity versus intended behavior
   - mobile template/runtime integrity
   - documentation accuracy for package consumers
4. Validate the PR title/body against `.cursor/rules/framework/commit-and-pr-format.mdc` and `.github/pull_request_template.md` when they are relevant to the review.
5. Flag hidden breaking changes such as renamed commands, changed config keys, changed publish semantics, moved entrypoints, or docs that promise behavior the package does not implement.

## Output format

- Findings first, ordered by severity, with concrete file references.
- Then open questions or assumptions.
- Then a short summary of what changed well.

## Review heuristics

- Treat workflow diffs conservatively; accidental trigger, token, or registry changes are high risk.
- A docs-only change is still incorrect if it documents behavior that does not exist.
- A build change is suspect if it can leave stale artifacts or alter published contents unexpectedly.
- A PR description is incomplete if it skips relevant template sections such as package surface changes, workflow or publish changes, docs changes, or migration notes.
- Do not assume helper scripts, PR comment bots, team metadata, or downstream repo automation exist.
