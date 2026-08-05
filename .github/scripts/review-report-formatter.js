/**
 * Review Report Formatter
 *
 * Formats review findings into a GitHub-compatible markdown comment
 */

class ReviewReportFormatter {
  formatAsMarkdown(report) {
    let markdown = '';

    // Header
    markdown += `## 🔍 Frontend Automated Review\n\n`;
    markdown += `**Verdict:** ${this.getVerdictBadge(report.verdict)}\n\n`;

    // Checks summary
    markdown += this.formatChecksSection(report.checksRun);

    // Blocking findings
    if (report.blockingIssues && report.blockingIssues.length > 0) {
      markdown += this.formatBlockingSection(report.blockingIssues);
    }

    // Non-blocking findings
    if (report.nonBlockingIssues && report.nonBlockingIssues.length > 0) {
      markdown += this.formatNonBlockingSection(report.nonBlockingIssues);
    }

    // Regression assessment
    if (report.regressionAssessment && report.regressionAssessment.length > 0) {
      markdown += this.formatRegressionSection(report.regressionAssessment);
    }

    // Specification compliance
    if (
      report.specificationCompliance &&
      Object.keys(report.specificationCompliance).length > 0
    ) {
      markdown += this.formatSpecComplianceSection(report.specificationCompliance);
    }

    // Required action
    markdown += this.formatNextActionSection(report.requiredNextAction);

    // Footer
    markdown += `\n---\n`;
    markdown += `<details><summary>📋 Review Metadata</summary>\n\n`;
    markdown += `- **Review Run:** ${report.timestamp}\n`;
    markdown += `- **PR:** #${report.prNumber}\n`;
    markdown += `</details>\n`;

    return markdown;
  }

  getVerdictBadge(verdict) {
    const badges = {
      APPROVE: '✅ **APPROVE**',
      'APPROVE WITH FOLLOW-UP': '✔️ **APPROVE WITH FOLLOW-UP**',
      'REQUEST CHANGES': '❌ **REQUEST CHANGES**',
      ERROR: '⚠️ **REVIEW ERROR**'
    };
    return badges[verdict] || verdict;
  }

  formatChecksSection(checks) {
    let markdown = `### ✓ Automated Checks\n\n`;

    if (!checks) {
      return markdown + `No checks were run.\n\n`;
    }

    markdown += `| Check | Status |\n`;
    markdown += `|-------|--------|\n`;
    markdown += `| TypeScript | ${this.getCheckIcon(checks.typecheck)} |\n`;
    markdown += `| Linting | ${this.getCheckIcon(checks.lint)} |\n`;
    markdown += `| Build | ${this.getCheckIcon(checks.build)} |\n`;

    markdown += `\n`;
    return markdown;
  }

  getCheckIcon(passed) {
    return passed ? '✅ Pass' : '❌ Fail';
  }

  formatBlockingSection(issues) {
    let markdown = `### 🚨 Blocking Issues\n\n`;
    markdown += `**${issues.length}** issue(s) must be fixed before merge:\n\n`;

    for (const issue of issues) {
      markdown += `#### ${issue.title}\n`;
      markdown += `${issue.description}\n\n`;

      if (issue.affectedFiles && issue.affectedFiles.length > 0) {
        markdown += `**Affected files:**\n`;
        for (const file of issue.affectedFiles) {
          markdown += `- \`${file}\`\n`;
        }
        markdown += `\n`;
      }

      markdown += `<sub>Category: \`${issue.category}\`</sub>\n\n`;
    }

    return markdown;
  }

  formatNonBlockingSection(issues) {
    let markdown = `### ⚠️ Non-Blocking Findings\n\n`;
    markdown += `**${issues.length}** item(s) for future improvement:\n\n`;

    // Group by category
    const byCategory = this.groupByCategory(issues);

    for (const [category, items] of Object.entries(byCategory)) {
      markdown += `#### ${this.formatCategoryName(category)}\n\n`;

      for (const issue of items) {
        markdown += `- **${issue.title}:** ${issue.description}\n`;

        if (issue.affectedFiles && issue.affectedFiles.length > 0) {
          markdown += `  \`${issue.affectedFiles.join(', ')}\`\n`;
        }
      }

      markdown += `\n`;
    }

    return markdown;
  }

  formatRegressionSection(regressions) {
    let markdown = `### 🧪 Regression Assessment\n\n`;
    markdown += `**${regressions.length}** area(s) require verification:\n\n`;

    for (const regression of regressions) {
      const severity = regression.severity === 'high' ? '🔴' : '🟡';
      markdown += `${severity} **${regression.file}**\n`;
      markdown += `  ${regression.description}\n\n`;
    }

    return markdown;
  }

  formatSpecComplianceSection(compliance) {
    const specs = Object.entries(compliance);

    if (specs.length === 0) {
      return `### 📋 Specification Compliance\n\nNo specifications to verify.\n\n`;
    }

    let markdown = `### 📋 Specification Compliance\n\n`;
    markdown += `| Requirement | Status |\n`;
    markdown += `|-------------|--------|\n`;

    for (const [spec, status] of specs) {
      const icon =
        status === 'met' ? '✅' : status === 'partially_met' ? '⚠️' : '❓';
      markdown += `| ${spec} | ${icon} ${status} |\n`;
    }

    markdown += `\n`;
    return markdown;
  }

  formatNextActionSection(action) {
    let markdown = `### 📌 Required Next Action\n\n`;
    markdown += `**${action}**\n\n`;
    return markdown;
  }

  groupByCategory(issues) {
    return issues.reduce((acc, issue) => {
      const category = issue.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(issue);
      return acc;
    }, {});
  }

  formatCategoryName(category) {
    const names = {
      typescript: 'Type Safety',
      style: 'Code Style',
      architecture: 'Architecture',
      documentation: 'Documentation',
      maintainability: 'Maintainability',
      build: 'Build Issues',
      'manual-review': 'Manual Review Required'
    };

    return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }
}

module.exports = ReviewReportFormatter;
