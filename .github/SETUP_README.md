# Frontend Automated Review System

Complete CI/CD automation for frontend code reviews based on comprehensive architectural and quality standards.

## 🎯 What This Does

This system automatically reviews all frontend pull requests and provides detailed reports covering:

- ✅ **Automated Checks** - TypeScript compilation, linting, build success
- 🏗️ **Architecture** - Component boundaries, feature isolation, shared package integrity
- 🔄 **Regressions** - Critical path detection, API contract changes
- 📋 **Specifications** - Requirements checklist verification
- 📊 **Tables** - Special validation for data table implementations
- 🎨 **Code Quality** - Complexity, accessibility, responsive design

## 📦 Components

### GitHub Actions Workflow
**File:** `.github/workflows/frontend-review.yml`

Triggers automatically on:
- Pull requests targeting main branches
- Changes to frontend code (`apps/admin/**`, `apps/portal/**`, `packages/**`)
- Excludes documentation and test files

### Review Agent
**File:** `.github/scripts/frontend-review-agent.js`

Core review logic implementing:
- Context collection (PR details, specifications, affected files)
- Automated checks (TypeScript, lint, build)
- Architecture analysis (component boundaries, feature logic)
- Regression assessment (critical paths, API changes)
- Specification validation (requirements checklist)

### Report Formatter
**File:** `.github/scripts/review-report-formatter.js`

Formats findings into readable GitHub comments with:
- Verdict badge (APPROVE / APPROVE WITH FOLLOW-UP / REQUEST CHANGES)
- Severity-based issue grouping
- Affected file references
- Actionable next steps

### Documentation
- `.github/FRONTEND_REVIEW.md` - Detailed guide for reviewers and developers
- `.github/PULL_REQUEST_TEMPLATE.md` - Standard PR template with review guidelines

## 🚀 Getting Started

### 1. Enable GitHub Actions

Ensure GitHub Actions are enabled in your repository settings:
- Go to **Settings → Actions → General**
- Ensure actions are enabled and workflow approval isn't required

### 2. Commit Files

Add all created files to your repository:

```bash
git add .github/
git commit -m "Add automated frontend review system"
git push
```

### 3. Create a Test PR

Create a pull request to test the system:
- Make a simple change to `apps/admin/src/` or `apps/portal/src/`
- The workflow will automatically run
- Review the automated comment on your PR

## 📊 Review Verdicts

### ✅ APPROVE
- All automated checks pass
- No blocking issues found
- Safe to merge

### ✔️ APPROVE WITH FOLLOW-UP
- All automated checks pass
- Non-blocking issues identified
- Can merge but should address items in follow-up PRs
- Clear next action provided

### ❌ REQUEST CHANGES
- Blocking issues must be fixed
- TypeScript errors, build failures, or critical architectural problems
- Developer must fix and re-request review

## 🔧 Blocking Issues

Issues that stop merge approval:

| Issue Type | Description |
|-----------|-------------|
| TypeScript Errors | Type checking failed |
| Build Failure | Build doesn't compile |
| Architecture Violations | Component boundaries wrong |
| Feature Logic Leak | Domain logic in shared packages |

## ⚠️ Non-Blocking Issues

Improvements for future work:

| Category | Example |
|----------|---------|
| Code Style | Naming conventions, formatting |
| Maintainability | High complexity, premature abstraction |
| Documentation | Missing specs or comments |
| Architecture | Recommendations for better design |

## 📝 PR Requirements

### Essential Specification

When submitting a PR, include in the description:

```markdown
## Specification

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Validation

Manual testing evidence:
- Tested in admin/portal apps
- Keyboard navigation verified
- Error states handled
```

### Component Location Clarity

Specify where changes are:
- **Shared components:** `packages/shared/components/...`
- **App-specific:** `apps/admin/src/...` or `apps/portal/src/...`
- **Hooks/Utils:** Location and whether shared or app-specific

### Test Evidence

Describe validation:
- Manual testing in both apps (if applicable)
- Affected user workflows
- State coverage (loading, error, empty, success)

## 🧪 Table Component Reviews

Special validation for table components:

### Checklist
- Row keys are stable (never use array indices)
- Sorting/filtering responsibility is explicit
- Keyboard navigation works
- States are distinct (loading, empty, error, data)
- Small-screen behavior is intentional
- API doesn't grow through boolean flags

### Example

```markdown
## Table Component Review

- [x] Row keys are `id` field (stable)
- [x] Server-side pagination implemented
- [x] Keyboard: arrow keys + enter for actions
- [x] Empty state: "No results" message
- [x] Mobile: Horizontal scroll with sticky first column
- [x] No new boolean props added
```

## 🔍 Review Priorities

Reviews check in this order:

1. **Behavior Regressions** - Existing workflows preserved
2. **Permissions & Routes** - API contracts intact
3. **Component Boundaries** - Proper separation
4. **Feature Isolation** - No logic in shared code
5. **API Design** - No over-generalization
6. **Type Safety** - TypeScript correctness
7. **Accessibility** - Keyboard, screen readers, responsive
8. **State Coverage** - Loading, error, empty, disabled states
9. **Complexity** - Unnecessary abstraction
10. **Style** - Formatting and consistency

## 🛠️ Workflow Steps

### For Developers

1. **Create PR** with detailed specification and validation evidence
2. **Review Comment** - Automated review runs within 2-5 minutes
3. **Address Issues** - Fix blocking issues or create follow-up tickets
4. **Re-request Review** - System automatically re-runs on new commits
5. **Merge** - Once verdict is APPROVE or APPROVE WITH FOLLOW-UP

### For Reviewers

1. **Review Report** - Read automated findings
2. **Manual Verification** - Check regression areas marked for testing
3. **Approve** - GitHub approval when confident
4. **Monitor** - Check follow-up tickets are addressed in next PRs

## 📋 Configuration

### Trigger Paths

Edit `.github/workflows/frontend-review.yml` to change what triggers reviews:

```yaml
paths:
  - 'apps/admin/**'
  - 'apps/portal/**'
  - 'packages/**'
  - '!**/*.md'
  - '!**/*.test.ts'
```

### Automated Checks

All checks defined in `frontend-review-agent.js`:
- TypeScript: `npm run typecheck`
- Linting: `npm run lint`
- Build: `npm run build`

These must pass for APPROVE verdict (unless explicitly adjusted).

### Report Format

Edit `review-report-formatter.js` to customize:
- Badge styles
- Section organization
- Category names
- Markdown formatting

## 🐛 Troubleshooting

### Workflow Not Running

**Problem:** PR created but no review comment appears

**Solutions:**
1. Check `.github/workflows/frontend-review.yml` exists and is valid
2. Check GitHub Actions are enabled in repo settings
3. Check the PR's base branch matches workflow triggers
4. Check file paths - PR must modify files in `apps/` or `packages/`

### TypeScript Errors in CI but not Locally

**Solutions:**
1. Run `npm ci` (not `npm install`) to use exact lock file versions
2. Clear cache: `rm -rf dist/ node_modules/.cache`
3. Verify Node version matches `.nvmrc` or `package.json` engines field

### Build Passes Locally but Fails in CI

**Solutions:**
1. Check CI uses same build command: `npm run build`
2. Verify all dependencies in `package.json` (not manually installed)
3. Check for environment-specific code
4. Test build in clean `node_modules`: `rm -rf node_modules && npm ci && npm run build`

### Review Report Not Posted

**Solutions:**
1. Check `GITHUB_TOKEN` has `pull-requests: write` permission (already set)
2. Check PR has no merge conflicts
3. Review agent errors are noted in Actions log - check workflow run details

## 📚 Examples

### Good PR Description

```markdown
## Specification

Implement user profile card component for admin app:
- [ ] Show user name, email, role
- [ ] Display avatar with fallback
- [ ] Show last login time
- [ ] Handle loading and error states

## Validation

- ✓ Tested in admin app at /users page
- ✓ Keyboard navigation verified (tab, enter)
- ✓ Error state: Shows message when API fails
- ✓ Loading state: Skeleton display confirmed
- ✓ Mobile: Responsive at 320px width
- ✓ Accessibility: Screen reader tested with NVDA

## Architecture

- Component: `apps/admin/src/components/UserProfileCard.tsx`
- Uses shared: `packages/shared/hooks/useUserData`
- API: `GET /api/users/:id`
- No new dependencies added
```

### Good Table Component PR

```markdown
## Table Component Review

- [x] Abstraction: Proven use case (user list filtering)
- [x] Query ownership: Server handles sorting/filtering
- [x] Row keys: Uses unique `userId` field
- [x] Keyboard: Arrow keys navigate, Enter selects
- [x] States: Loading spinner, empty message, error toast
- [x] Responsive: Horizontal scroll on mobile
- [x] Types: Columns fully typed with TypeScript
- [x] Screens: Admin-only component, no portal use
- [x] API: No new boolean props, stays focused
```

## 🚦 Next Steps

1. **Merge to main branch** - Get workflow into production
2. **Test with real PRs** - Refine based on actual usage
3. **Team communication** - Train team on PR requirements and review process
4. **Monitor and iterate** - Adjust rules based on what provides most value

## 🔗 See Also

- [Frontend Review Documentation](.github/FRONTEND_REVIEW.md)
- [PR Template Guide](.github/PULL_REQUEST_TEMPLATE.md)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

**Status:** ✅ Ready to use  
**Last Updated:** 2025  
**Maintainer:** Frontend Team
