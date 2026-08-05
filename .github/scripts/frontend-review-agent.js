/**
 * Frontend Review Agent
 *
 * Independently reviews frontend implementations against:
 * - Architecture specifications
 * - Repository rules and patterns
 * - Preserved behavior and regressions
 * - Performance and accessibility standards
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class FrontendReviewAgent {
  constructor(config) {
    this.github = config.github;
    this.context = config.context;
    this.prNumber = config.prNumber;
    this.baseRef = config.baseRef;
    this.headRef = config.headRef;
    this.changedFiles = config.changedFiles || [];
    this.findings = {
      blocking: [],
      nonBlocking: [],
      regressions: [],
      specCompliance: {}
    };
  }

  async review() {
    console.log(`Starting Frontend Review for PR #${this.prNumber}`);
    console.log(`Changed files: ${this.changedFiles.join(', ')}`);

    try {
      // Phase 1: Collect context
      await this.collectReviewContext();

      // Phase 2: Run automated checks
      await this.runAutomatedChecks();

      // Phase 3: Analyze code patterns and boundaries
      await this.analyzeArchitecture();

      // Phase 4: Check for regressions
      await this.assessRegressions();

      // Phase 5: Validate specifications
      await this.validateSpecifications();

      // Phase 6: Generate report
      const report = this.generateReport();

      return report;
    } catch (error) {
      console.error('Review agent error:', error);
      return this.generateErrorReport(error);
    }
  }

  async collectReviewContext() {
    console.log('\n[PHASE 1] Collecting review context...');

    // Get PR details
    const pr = await this.github.rest.pulls.get({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number: this.prNumber
    });

    this.prData = pr.data;

    // Get all changed files with details
    const files = await this.github.rest.pulls.listFiles({
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
      pull_number: this.prNumber,
      per_page: 100
    });

    this.changedFilesDetails = files.data;

    // Extract specs from PR description
    this.extractSpecifications();

    // Find related AGENTS.md files
    await this.findAgentDocumentation();

    console.log(`✓ Collected context for ${this.changedFilesDetails.length} files`);
  }

  extractSpecifications() {
    const body = this.prData.body || '';
    const specMatch = body.match(/## Specification[\s\S]*?(?=##|$)/);

    if (specMatch) {
      this.specification = specMatch[0];
      this.parseSpecRequirements();
    } else {
      this.addNonBlockingFinding(
        'Missing Specification',
        'PR description does not include a Specification section',
        'documentation'
      );
    }
  }

  parseSpecRequirements() {
    const requirements = [];
    const lines = this.specification.split('\n');

    for (const line of lines) {
      if (line.match(/^[-*]\s+\[?\s*[\sx]\s*\]?/)) {
        requirements.push({
          text: line.replace(/^[-*]\s+\[?\s*[\sx]\s*\]?\s*/, ''),
          status: 'not_verified'
        });
      }
    }

    this.specRequirements = requirements;
  }

  async findAgentDocumentation() {
    try {
      const tree = await this.github.rest.git.getTree({
        owner: this.context.repo.owner,
        repo: this.context.repo.repo,
        tree_sha: this.prData.head.sha,
        recursive: true
      });

      this.agentDocs = tree.data.tree
        .filter(item => item.path.includes('AGENTS.md'))
        .map(item => item.path);
    } catch (error) {
      console.log('Could not retrieve AGENTS.md files');
      this.agentDocs = [];
    }
  }

  async runAutomatedChecks() {
    console.log('\n[PHASE 2] Running automated checks...');

    this.checksRun = {
      typecheck: false,
      lint: false,
      build: false
    };

    // Check TypeScript compilation
    try {
      execSync('npm run typecheck 2>&1', { stdio: 'pipe' });
      this.checksRun.typecheck = true;
      console.log('✓ TypeScript check passed');
    } catch (error) {
      this.addBlockingFinding(
        'TypeScript Errors',
        'TypeScript compilation failed. Code has type errors that must be fixed.',
        'typescript',
        ['src/']
      );
      console.log('✗ TypeScript check failed');
    }

    // Check linting
    try {
      execSync('npm run lint 2>&1', { stdio: 'pipe' });
      this.checksRun.lint = true;
      console.log('✓ Linting passed');
    } catch (error) {
      this.addNonBlockingFinding(
        'Linting Issues',
        'Some linting rules were violated. Consider fixing these for consistency.',
        'style'
      );
      console.log('✗ Linting check failed');
    }

    // Check build
    try {
      execSync('npm run build 2>&1', { stdio: 'pipe' });
      this.checksRun.build = true;
      console.log('✓ Build succeeded');
    } catch (error) {
      this.addBlockingFinding(
        'Build Failure',
        'The build failed. All code must compile successfully before merge.',
        'build',
        ['apps/', 'packages/']
      );
      console.log('✗ Build check failed');
    }
  }

  async analyzeArchitecture() {
    console.log('\n[PHASE 3] Analyzing architecture...');

    for (const file of this.changedFilesDetails) {
      const filePath = file.filename;

      // Skip non-source files
      if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue;

      // Check for component boundary violations
      this.checkComponentBoundaries(filePath, file);

      // Check for feature logic leaking
      this.checkFeatureLogicLeaking(filePath);

      // Analyze complexity and abstraction
      this.analyzeComplexity(filePath);

      // Check table-related changes
      if (filePath.includes('table') || filePath.includes('Table')) {
        this.analyzeTableComponent(filePath, file);
      }
    }

    console.log('✓ Architecture analysis complete');
  }

  checkComponentBoundaries(filePath, fileData) {
    const pathParts = filePath.split('/');
    const fileName = path.basename(filePath);

    // Verify component directory structure
    if (
      filePath.includes('/components/') &&
      !fileName.match(/^[A-Z].*\.(tsx?|jsx?)$/)
    ) {
      this.addNonBlockingFinding(
        'Component Naming',
        `Component file "${fileName}" should start with uppercase letter`,
        'style',
        [filePath]
      );
    }

    // Check for utilities in shared packages
    if (filePath.includes('packages/shared')) {
      if (
        fileData.changes > 100 &&
        !filePath.includes('__tests__') &&
        !filePath.includes('.test.')
      ) {
        this.addNonBlockingFinding(
          'Large Shared Package Change',
          `Shared package file changed significantly (${fileData.changes} lines). Verify it does not contain app-specific logic.`,
          'architecture',
          [filePath]
        );
      }
    }
  }

  checkFeatureLogicLeaking(filePath) {
    // Check for domain-specific logic in shared components
    if (
      filePath.includes('packages/shared/components') ||
      filePath.includes('packages/shared/hooks')
    ) {
      // This would need actual file content analysis
      // For now, flag for manual review if component is complex
      if (filePath.includes('portal') || filePath.includes('admin')) {
        this.addNonBlockingFinding(
          'Potential Feature Logic in Shared',
          `Review "${filePath}" to ensure it contains only generic, reusable logic`,
          'architecture',
          [filePath]
        );
      }
    }
  }

  analyzeComplexity(filePath) {
    // Flag files with excessive changes
    const file = this.changedFilesDetails.find(f => f.filename === filePath);
    if (file && file.changes > 500) {
      this.addNonBlockingFinding(
        'High Complexity Change',
        `File has ${file.changes} changes. Consider breaking into smaller, focused changes for easier review.`,
        'maintainability',
        [filePath]
      );
    }
  }

  analyzeTableComponent(filePath, fileData) {
    console.log(`  → Analyzing table component: ${filePath}`);

    // Table-specific checks per the spec
    const checks = [
      {
        name: 'Table Abstraction',
        description: 'Verify table abstraction corresponds to proven use cases'
      },
      {
        name: 'Query Ownership',
        description: 'Ensure table does not own feature queries/permissions/navigation'
      },
      {
        name: 'Sorting/Filtering',
        description: 'Verify server/client responsibilities are explicit'
      },
      {
        name: 'Row Keys',
        description: 'Ensure row keys are stable and unique'
      },
      {
        name: 'Keyboard Accessibility',
        description: 'Verify action and selection behavior is keyboard-accessible'
      },
      {
        name: 'State Coverage',
        description: 'Ensure loading, empty, and error states are distinct'
      },
      {
        name: 'Responsive Design',
        description: 'Verify overflow and small-screen behavior are intentional'
      },
      {
        name: 'Type Safety',
        description: 'Ensure columns remain strongly typed'
      },
      {
        name: 'Screen Compatibility',
        description: 'Ensure incompatible screens are not forced into component'
      },
      {
        name: 'API Design',
        description: 'Verify public API does not grow through boolean flags'
      }
    ];

    // Mark these as items to manually verify
    for (const check of checks) {
      this.findings.specCompliance[check.name] = 'not_verified';
    }

    this.addNonBlockingFinding(
      'Table Component Review Required',
      'Table component changes require manual verification against table checklist',
      'manual-review',
      [filePath]
    );
  }

  async assessRegressions() {
    console.log('\n[PHASE 4] Assessing potential regressions...');

    const criticalPaths = [
      'apps/admin/src/pages/',
      'apps/portal/src/pages/',
      'apps/admin/src/components/Core',
      'apps/portal/src/components/Core'
    ];

    for (const file of this.changedFilesDetails) {
      // Check if critical paths are affected
      if (criticalPaths.some(path => file.filename.includes(path))) {
        console.log(`  ⚠ Critical path modified: ${file.filename}`);
        this.findings.regressions.push({
          severity: 'high',
          file: file.filename,
          description: 'Changes to critical path - manual regression testing recommended'
        });
      }

      // Check for API contract changes
      if (file.filename.includes('types.ts') || file.filename.includes('types.d.ts')) {
        this.findings.regressions.push({
          severity: 'medium',
          file: file.filename,
          description: 'Type definitions changed - verify all consumers updated'
        });
      }
    }

    console.log(`✓ Identified ${this.findings.regressions.length} potential regression areas`);
  }

  async validateSpecifications() {
    console.log('\n[PHASE 5] Validating specifications...');

    if (!this.specRequirements || this.specRequirements.length === 0) {
      this.addNonBlockingFinding(
        'No Specification Checklist',
        'PR lacks detailed specification requirements to validate',
        'documentation'
      );
      return;
    }

    // Basic check: changed files should cover spec areas
    for (const req of this.specRequirements) {
      this.findings.specCompliance[req.text] = 'not_verified';
    }

    console.log(`✓ Identified ${this.specRequirements.length} specification requirements for verification`);
  }

  generateReport() {
    const verdict = this.determineVerdict();

    const report = {
      verdict,
      timestamp: new Date().toISOString(),
      prNumber: this.prNumber,
      prTitle: this.prData.title,
      checksRun: this.checksRun,
      blockingIssues: this.findings.blocking,
      nonBlockingIssues: this.findings.nonBlocking,
      regressionAssessment: this.findings.regressions,
      specificationCompliance: this.findings.specCompliance,
      requiredNextAction: this.determineNextAction()
    };

    console.log(`\n[REPORT] Verdict: ${verdict}`);
    console.log(`  Blocking issues: ${this.findings.blocking.length}`);
    console.log(`  Non-blocking issues: ${this.findings.nonBlocking.length}`);
    console.log(`  Regression risks: ${this.findings.regressions.length}`);

    return report;
  }

  determineVerdict() {
    if (this.findings.blocking.length > 0) {
      return 'REQUEST CHANGES';
    }

    if (
      this.findings.nonBlocking.length > 0 ||
      this.findings.regressions.length > 0
    ) {
      return 'APPROVE WITH FOLLOW-UP';
    }

    return 'APPROVE';
  }

  determineNextAction() {
    const blocking = this.findings.blocking.length;
    const nonBlocking = this.findings.nonBlocking.length;

    if (blocking > 0) {
      return `Fix ${blocking} blocking issue(s) and request re-review`;
    }

    if (nonBlocking > 0) {
      return `Address ${nonBlocking} non-blocking item(s) in follow-up PRs and proceed to next migration batch`;
    }

    return 'Proceed to next approved migration batch';
  }

  addBlockingFinding(title, description, category, affectedFiles = []) {
    this.findings.blocking.push({
      title,
      description,
      category,
      affectedFiles,
      severity: 'blocking'
    });
  }

  addNonBlockingFinding(title, description, category, affectedFiles = []) {
    this.findings.nonBlocking.push({
      title,
      description,
      category,
      affectedFiles
    });
  }

  generateErrorReport(error) {
    return {
      verdict: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString(),
      blockingIssues: [
        {
          title: 'Review Agent Error',
          description: `Failed to complete review: ${error.message}`,
          category: 'system',
          severity: 'blocking'
        }
      ]
    };
  }
}

module.exports = FrontendReviewAgent;
