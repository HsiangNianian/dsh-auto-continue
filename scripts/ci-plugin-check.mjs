/**
 * CI runner for the dsh-plugin-check health check
 * (https://github.com/omdsh-dev/dsh-plugin-check).
 *
 * The checker is a dsh tool rather than a CLI, so this script drives its
 * `checkRepo` export directly. It exits non-zero when the verdict is `fail`,
 * which makes it usable as a daily push / PR check and as a release gate.
 *
 * Environment:
 *   CHECKER_DIR    where the checker repo was cloned (default /tmp/dsh-plugin-check)
 *   CHECK_TARGET   the plugin repo directory to check (default process.cwd())
 */
const checkerDir = process.env.CHECKER_DIR ?? '/tmp/dsh-plugin-check';
const target = process.env.CHECK_TARGET ?? process.cwd();

const { checkRepo } = await import(`${checkerDir}/lib/index.js`);

const report = await checkRepo(target, false);

console.log(`repo: ${report.repo} | kind: ${report.kind} | verdict: ${report.verdict}`);
console.log(
  `checks: total=${report.checks.total} passed=${report.checks.passed} ` +
    `failed=${report.checks.failed} warned=${report.checks.warned} skipped=${report.checks.skipped}`,
);
for (const error of report.errors) console.log(`ERROR   ${error.code} - ${error.detail}`);
for (const warning of report.warnings) console.log(`WARNING ${warning.code} - ${warning.detail}`);
for (const skipped of report.skipped) console.log(`SKIPPED ${skipped}`);

if (report.verdict === 'fail') {
  console.error('plugin_check: FAIL — fix the errors above');
  process.exit(1);
}
console.log('plugin_check: PASS');
