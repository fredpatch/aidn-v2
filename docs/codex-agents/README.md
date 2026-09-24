# Codex frontend agent workflow

This directory defines three complementary roles for improving the AIDN frontend safely:

1. `frontend-architect.md` — audits and specifies; does not edit code.
2. `frontend-implementer.md` — implements one approved batch.
3. `frontend-reviewer.md` — independently reviews the batch.

The repository and application-specific constraints live in:

- `/AGENTS.md`
- `/apps/admin/AGENTS.md`
- `/apps/portal/AGENTS.md`

## Recommended operating loop

### Step 1 — Architecture audit

Start a Codex task with:

```text
Act as the Frontend Architect defined in docs/codex-agents/frontend-architect.md.
Read all applicable AGENTS.md files.
Audit only apps/admin for component health and table patterns.
Do not modify code.
Produce the required report and recommend exactly one first implementation batch.
```

For portal work, replace `apps/admin` with `apps/portal`. Do not audit both applications together unless the goal is explicitly to compare them.

### Step 2 — Approve one batch

Review the architect report yourself. Confirm:

- the abstraction is supported by real use cases;
- business behavior remains explicit;
- the batch is small enough to review;
- one representative screen is selected;
- validation criteria are concrete.

Record the approved specification in the task, issue, or a repository document.

### Step 3 — Implement

Start a new Codex task with:

```text
Act as the Frontend Implementer defined in docs/codex-agents/frontend-implementer.md.
Read all applicable AGENTS.md files.
Implement only the approved batch below.

[PASTE APPROVED SPECIFICATION]

Do not continue to another migration batch. Run the relevant checks and return the required implementation report.
```

### Step 4 — Review independently

Start another Codex task or subagent with:

```text
Act as the Frontend Reviewer defined in docs/codex-agents/frontend-reviewer.md.
Read all applicable AGENTS.md files.
Review the implementation against the approved specification below.

[PASTE APPROVED SPECIFICATION]

Inspect the diff and all affected call sites. Do not modify code. Return the required verdict and findings.
```

### Step 5 — Continue or correct

- `APPROVE`: proceed to one compatible migration batch.
- `APPROVE WITH FOLLOW-UP`: record the follow-up, then proceed only if it is genuinely non-blocking.
- `REQUEST CHANGES`: send only the blocking findings back to the implementer.

## Recommended first experiment

Use the admin table system as the first controlled experiment:

1. Architect inventories all table-like implementations in `apps/admin`.
2. Architect classifies them by interaction contract.
3. Architect proposes the smallest justified component set.
4. You approve one abstraction and one representative screen.
5. Implementer builds and migrates only that screen.
6. Reviewer validates the API, behavior, accessibility, and migration suitability.
7. Only then migrate additional compatible screens.

## Parallel work

Safe parallel audits:

- admin tables;
- admin forms;
- portal loading/error/empty states.

Avoid parallel implementation when tasks touch shared UI primitives, routing, global styles, query infrastructure, or the same feature folders.

## Definition of done for one batch

A batch is complete only when:

- its scope matches the approved specification;
- relevant call sites were inspected;
- typecheck and build pass, or failures are explained precisely;
- no workflow, permission, route, API, or wording regression is introduced;
- the reviewer has no blocking findings;
- the next batch is explicitly selected rather than started automatically.
