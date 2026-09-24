# Frontend Review Automation

This system provides automated frontend code reviews based on comprehensive architectural and quality standards.

## Overview

The **Frontend Review Agent** automatically validates all frontend pull requests against:

1. **Compilation and Linting** - TypeScript, ESLint, Build
2. **Architecture** - Component boundaries, feature logic isolation, shared package integrity
3. **Regression Prevention** - Critical path detection, API contract changes
4. **Specification Compliance** - Requirement checklist verification
5. **Table Components** - Special validation for data table implementations

## Review Verdict Options

- **✅ APPROVE** - All checks passed, no blocking issues
- **✔️ APPROVE WITH FOLLOW-UP** - Approved but has non-blocking items for future improvement
- **❌ REQUEST CHANGES** - Blocking issues must be fixed before merge

## Review Priorities

Reviews are conducted in this order of priority:

1. **Behavior Regressions** - Ensure existing functionality is preserved
2. **Permission, Workflow, Route, and API-Contract Changes** - Critical paths must be verified
3. **Component Boundaries** - Proper separation of concerns
4. **Feature Logic Isolation** - No domain logic in shared components
5. **API Design** - Over-generalization and boolean-heavy APIs
6. **Type Safety** - TypeScript correctness and type definitions
7. **Accessibility and Responsive Design** - User experience across devices
8. **State Management** - Loading, empty, error, disabled, and success states
9. **Code Complexity** - Unnecessary abstraction and maintainability
10. **Style Concerns** - Code formatting and consistency

## Using the Automated Review

### PR Submission Requirements

When submitting a frontend PR, include:

```markdown
## Specification

List all implementation requirements:
- [ ] Component created at `src/components/...`
- [ ] Connects to API endpoint `/api/...`
- [ ] Supports keyboard navigation
- [ ] Handles error states
- [ ] Responsive on mobile screens

## Test Evidence

Link or describe validation:
- Manual testing results
- Affected user workflows
- Regression testing areas

## Architectural Notes

Explain key design decisions that might be non-obvious:
- Why component is in this location
- Shared vs app-specific dependencies
- Integration points with other components
```

### Review Report Interpretation

The automated review comment includes:

- **Automated Checks** - TypeScript, Linting, Build status
- **Blocking Issues** - Must fix before merge
- **Non-Blocking Findings** - Address in follow-up PRs
- **Regression Assessment** - Areas requiring manual testing
- **Specification Compliance** - Checklist verification status
- **Required Next Action** - Clear next steps

### Addressing Review Feedback

**For Blocking Issues:**
1. Fix all reported issues
2. Commit and push changes
3. Request re-review (automated review will re-run)

**For Non-Blocking Items:**
1. Can merge after fixing blocking issues
2. Create follow-up tickets for improvements
3. Incorporate improvements in next related PR

## Table Component Review Checklist

When table components are modified, the review verifies:

- [ ] Abstraction corresponds to proven use cases
- [ ] Table does not own feature queries, permissions, or navigation
- [ ] Server-side and client-side sorting/filtering/pagination are explicit
- [ ] Row keys are stable and unique
- [ ] Action and selection behavior is keyboard-accessible
- [ ] Loading, empty, and error states are distinct
- [ ] Overflow and small-screen behavior are intentional
- [ ] Columns remain strongly typed
- [ ] Incompatible screens are not forced into component
- [ ] Public API doesn't grow through boolean flags

## Running Locally

To simulate the review locally before pushing:

```bash
# Check TypeScript
npm run typecheck

# Run linting
npm run lint

# Test build
npm run build

# Review changed files
git diff origin/main --name-only
```

## Troubleshooting

**Review shows TypeScript errors but I see none locally:**
- Run `npm ci` to ensure exact dependency versions
- Clear build cache: `rm -rf dist/ .next/`
- Ensure using correct Node version (check `.nvmrc` or `package.json` engines)

**Linting fails but seems like false positives:**
- Check ESLint config in `.eslintrc.json`
- Run `npm run lint -- --fix` to auto-fix issues
- Some rules may require manual adjustment

**Build fails with module not found:**
- Run `npm ci` in root directory
- Check that monorepo setup is correct
- Verify workspace declarations in `package.json`

## Configuration

Review behavior is controlled by:

- `.github/workflows/frontend-review.yml` - GitHub Actions trigger and steps
- `.github/scripts/frontend-review-agent.js` - Core review logic
- `.github/scripts/review-report-formatter.js` - Report formatting
- `.eslintrc.json` - Linting rules
- `tsconfig.json` - TypeScript configuration

## Future Enhancements

Potential improvements to the review system:

- AI-powered semantic analysis of code changes
- Integration with accessibility testing tools (axe, pa11y)
- Automated visual regression testing
- Performance metrics tracking
- Custom rule plugins for domain-specific patterns
- Integration with Copilot code review capabilities
