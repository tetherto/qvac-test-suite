---
name: qts-skill-list
description: Catalog of the repo-local qts-* skills for qvac-test-suite with one-line purpose and when-to-use guidance. Use when the user asks what skills exist in this repository, which skill fits a task, or how to invoke a repo-specific skill.
---

# QTS Skill List

All custom repo skills live under `.cursor/skills/` and use the `qts-` prefix. Invoke them with `/qts-<name>` in chat or ask the agent to run the skill by name.

## Available skills

- [`qts-skill-list`](../qts-skill-list/SKILL.md) - quick index of the repo-specific skills
- [`qts-pr-review`](../qts-pr-review/SKILL.md) - framework-focused PR review for package-surface risk, CLI/versioning issues, workflow parity, docs accuracy, and template/runtime integrity
- [`qts-pr-create`](../qts-pr-create/SKILL.md) - PR title/body drafting for framework runtime, packaging, workflow, docs, and template changes

## How to use them

- `qts-pr-review` is manual-first. Use it when you want a deliberate framework review pass.
- `qts-pr-create` can be used when you want a repo-specific PR draft that follows the framework formatting rules.
- When unsure which skill fits, start with `qts-skill-list`.

## Scope notes

- These skills are only for the `qvac-test-suite` repository.
- They assume `framework/` is the product and avoid `tetherto/qvac`, pod-specific automation, release-branch side flows, and hidden helper scripts.
