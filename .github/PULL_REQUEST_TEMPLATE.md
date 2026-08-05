---
name: Frontend Implementation Review
description: Submit a frontend refactoring or feature implementation for automated review
title: "[FRONTEND] "
labels: ["frontend", "review"]
---

## 📋 Specification

**What is being implemented?**

Describe the core changes and intended behavior:

- [ ] List requirement 1
- [ ] List requirement 2
- [ ] List requirement 3

### Component Locations

Where are the main changes?

- **Components:** `apps/admin/src/components/...` or `apps/portal/src/components/...`
- **Pages:** `apps/admin/src/pages/...` or `apps/portal/src/pages/...`
- **Hooks:** `packages/shared/hooks/...`
- **Utils:** `packages/shared/utils/...`
- **Types:** `packages/shared/types/...`

### Architecture Decisions

**Why were these choices made?**

- Shared vs app-specific components: _(explain the boundary)_
- Dependencies on other modules: _(list integration points)_
- State management approach: _(describe how state flows)_
- API integration: _(list endpoints used)_

---

## ✅ Validation

**How was this tested?**

### Manual Testing
- [ ] Tested in admin app (if applicable)
- [ ] Tested in portal app (if applicable)
- [ ] Tested on mobile screen sizes
- [ ] Tested keyboard navigation
- [ ] Tested with empty data state
- [ ] Tested with error conditions
- [ ] Tested with loading states

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast sufficient
- [ ] Focus indicators visible

### Regression Testing
**What existing workflows could be affected?**

- Workflow 1: _(tested/verified status)_
- Workflow 2: _(tested/verified status)_
- Permission checks: _(any permission logic changed?)_

**Critical paths affected:**
- `apps/admin/src/pages/...`
- `apps/portal/src/pages/...`

---

## 📝 Table Component Review (if applicable)

If this PR includes table changes, verify:

- [ ] Table abstraction is based on proven use cases
- [ ] Table doesn't own feature queries, permissions, or navigation
- [ ] Server-side vs client-side sorting/filtering is explicit
- [ ] Row keys are stable (not array indices)
- [ ] Keyboard navigation works (arrow keys, enter, space)
- [ ] Loading, empty, error states are visually distinct
- [ ] Small-screen behavior is intentional (overflow/scrolling)
- [ ] Columns have strong TypeScript typing
- [ ] No forced incompatible screen sizes
- [ ] API stays focused (no new boolean flags for edge cases)

---

## 🔍 Code Review Notes

**For reviewers:**

- Key files to focus on: _(list 2-3 files)_
- Known edge cases: _(any gotchas?)_
- Dependencies to verify: _(list related changes or PRs)_
- Performance considerations: _(any optimizations or concerns?)_

---

## 📚 Related Documentation

- **Design Spec:** _(link or attach)_
- **AGENTS.md:** _(applicable agent documentation)_
- **Related Issues:** Closes #___ , Relates to #___
- **Related PRs:** Builds on #___

---

## ✨ Checklist

Before submitting for review:

- [ ] Code follows project style guide (run `npm run format`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console errors or warnings
- [ ] No secrets or sensitive data committed
- [ ] Tested on actual devices/browsers where possible
- [ ] Updated relevant documentation
- [ ] PR title is descriptive

---

**Review Bot Configuration:** This PR will be automatically reviewed against architectural standards, TypeScript correctness, and specification compliance. See [Frontend Review Documentation](.github/FRONTEND_REVIEW.md) for details.
