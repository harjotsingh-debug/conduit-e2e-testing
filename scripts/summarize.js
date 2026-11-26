// Usage: npx playwright test && node scripts/summarize.js
const results = require('../reports/results.json');
const tally = {};

function walk(suite) {
  (suite.specs || []).forEach((spec) =>
    spec.tests.forEach((t) => {
      const row = (tally[t.projectName] ??= { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0, knownBugs: 0 });
      row.total++;
      const knownBug = (t.annotations || []).some((a) => a.type === 'fail');
      if (t.status === 'expected') { row.passed++; if (knownBug) row.knownBugs++; }
      else if (t.status === 'unexpected') row.failed++;
      else if (t.status === 'flaky') row.flaky++;
      else row.skipped++;
    })
  );
  (suite.suites || []).forEach(walk);
}
results.suites.forEach(walk);

console.table(
  Object.fromEntries(
    Object.entries(tally).map(([k, v]) => [k, { ...v, passRate: `${((v.passed / v.total) * 100).toFixed(1)}%` }])
  )
);
console.log('knownBugs = tests marked test.fail() (defect confirmed, counted as "expected failure").');
