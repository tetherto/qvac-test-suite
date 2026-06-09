---
name: qts-pr-create
description: Generate qvac-test-suite pull request titles and descriptions for framework runtime changes, packaging or export changes, workflow or publish changes, docs-only cleanup, and template or mobile runtime updates. Use when creating a framework PR or refining its title/body.
---

# QTS PR Create

Generate PR titles and descriptions for `qvac-test-suite` without relying on SDK-only or pod-specific workflows.

## When to use this skill

Use when:
- creating a PR for `qvac-test-suite`
- the user asks to generate or refine a PR description
- the change touches `framework/`, publish workflows, repo docs, or package-facing templates

## Workflow

1. Classify the change: runtime or CLI, packaging or exports, workflow or publish behavior, docs-only cleanup, or mobile template/runtime changes
2. Infer ticket, type, and tags from the branch name, commits, and diff
3. Ask the user only when inference confidence is low
4. Generate the PR title using the framework format rule
5. Start from `.github/pull_request_template.md` and keep only the sections that apply
6. Validate tag requirements such as `[bc]` and `[api]`
7. Output a copy-ready PR title and body

## Format references

- PR title format: `.cursor/rules/framework/commit-and-pr-format.mdc`
- PR body template: `.github/pull_request_template.md`
- Repo context: `.cursor/rules/framework/main.mdc`

## Title format

Use:

`TICKET type[tags]: subject`

If there is no ticket, use `type[notask]: subject`.

Defaults:
- `feat` for new capability
- `fix` for behavior correction
- `doc` for documentation-only changes
- `test` for test-only changes
- `chore` for maintenance
- `infra` for workflow, publish, or repository automation changes

Tags:
- `[api]` for public package surface changes
- `[bc]` for breaking or migration-required changes
- `[skiplog]` for internal maintenance that should not produce release notes

Examples:
- `QVAC-1842 fix[api]: read CLI version from framework package metadata`
- `infra[notask]: restore publish workflow parity with current release flow`
- `doc[notask]: trim README to framework-only guidance`

## PR body template

Base the PR body on `.github/pull_request_template.md`.

Keep these core sections:

```markdown
## What problem does this PR solve?

## How does it solve it?

## How was this PR verified?
```

Add or keep these sections only when they are relevant:
- `## 💥 Breaking Changes`
- `## 📦 Package Surface Changes`
- `## 🚀 Workflow / Publish Changes`
- `## 📚 Docs Changes`
- `## 🔄 Migration Notes`

## Required details by change type

- For workflow or publish changes, state explicitly whether behavior changed or whether parity was preserved.
- For package-surface changes, call out affected exports, CLI commands, config fields, templates, or report formats.
- For docs-only changes, keep the scope honest and avoid implying runtime changes.
- When `[bc]` is present, include before/after examples or a clear migration note.
- When `[api]` is present, include a consumer-facing usage example or release-note-friendly summary.

## Output format

Always output the PR in this copy-ready format:

~~~
## PR Title
```
TICKET type[tags]: subject
```

## PR Body
```markdown
## What problem does this PR solve?
...
```
~~~

## Constraints

- Keep the PR specific to `qvac-test-suite`; do not reference SDK pod sync flows, release-branch dual-PR logic, or hidden helper scripts.
- Delete template sections that do not apply instead of filling them with noise.
- Prefer precise subjects that describe framework behavior, not vague cleanup language.
