// Builds the submission PDF from the Markdown docs.
// Usage: node scripts/build-report.js   (edit docs/report/team.json first)
// Output: docs/report/<ROLL1>_<ROLL2>.pdf
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
const team = JSON.parse(fs.readFileSync(path.join(docs, 'report', 'team.json'), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const img = (file, caption) => {
  const p = path.join(docs, file);
  const ext = path.extname(p).slice(1).replace('svg', 'svg+xml');
  const data = fs.readFileSync(p).toString('base64');
  return `<figure><img src="data:image/${ext};base64,${data}"/><figcaption>${esc(caption)}</figcaption></figure>`;
};

/** Minimal Markdown → HTML (headings, tables, lists, code, paragraphs, hr). */
function md(text, { shift = 0, onMermaid } = {}) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const lang = l.slice(3).trim();
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      out.push(lang === 'mermaid' && onMermaid ? onMermaid() : `<pre>${esc(buf.join('\n'))}</pre>`);
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*)/.exec(l))) {
      const lvl = Math.min(6, m[1].length + shift);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr/>'); i++; continue; }
    if (/^\|/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [l];
    for (i++; i < lines.length && lines[i].trim() && !/^(#|\||```|\s*[-*]\s|\s*\d+\.\s|---)/.test(lines[i]); i++) buf.push(lines[i]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const read = (f) => fs.readFileSync(path.join(docs, f), 'utf8');
const evidence = {
  'BUG-001': ['evidence/BUG-001_TC09_publish_network_failure.png', 'BUG-001 / TC09: after the aborted publish request the app lands on #/article/undefined (404).'],
  'BUG-003': ['evidence/BUG-003_TC07_invalid_token.png', 'BUG-003 / TC07: editor after publishing with a forged token (server answered 500, not 401).'],
  'BUG-006': ['evidence/BUG-006_TC24_login_500_blank_screen.png', 'BUG-006 / TC24: login receives a 500, and the whole React app unmounts (blank screen).'],
  'BUG-007': ['evidence/BUG-007_TC26_offline_login.png', 'BUG-007 / TC26: login while offline navigates to #/ and renders a blank screen.'],
};
// Put each screenshot right after its bug section's table
let bugs = md(read('BUG_REPORTS.md'), { shift: 1 });
for (const [id, [file, cap]] of Object.entries(evidence)) {
  const start = bugs.indexOf(`<h3>${id}:`);
  if (start < 0) continue;
  const end = bugs.indexOf('</table>', start) + '</table>'.length;
  bugs = bugs.slice(0, end) + img(file, cap) + bugs.slice(end);
}

const members = team.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.roll)}</td></tr>`).join('');
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report</title><style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #1b1b1b; line-height: 1.45; }
  h1 { font-size: 20pt; color: #1d3f73; border-bottom: 2px solid #1d3f73; padding-bottom: 4px; page-break-before: always; }
  h2 { font-size: 14pt; color: #1d3f73; margin-top: 18px; }
  h3 { font-size: 12pt; color: #333; margin-top: 16px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9pt; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #c8ced6; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #eef2f7; }
  code { font-family: Consolas, monospace; font-size: 8.8pt; background: #f3f4f6; padding: 0 3px; border-radius: 3px; word-break: break-word; }
  pre { font-family: Consolas, monospace; font-size: 8.5pt; background: #f6f8fa; border: 1px solid #e1e4e8; padding: 8px; white-space: pre-wrap; }
  figure { margin: 8px 0 14px; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; max-height: 300px; border: 1px solid #bbb; }
  figcaption { font-size: 8.5pt; color: #555; margin-top: 3px; }
  .cover { text-align: center; padding-top: 60px; }
  .cover h1 { page-break-before: avoid; border: none; font-size: 24pt; }
  .cover table { width: 60%; margin: 24px auto; font-size: 11pt; }
  .toc li { margin: 3px 0; }
</style></head><body>
<section class="cover">
  <p style="font-size:12pt">${esc(team.institute)}</p>
  <p style="font-size:12pt;font-weight:bold">${esc(team.course)}</p>
  <h1>End-to-End Functional Testing of the<br/>Conduit (RealWorld) Full-Stack Web Application</h1>
  <p>React 19 · Express 5 / Node.js · Sequelize · PostgreSQL &nbsp;|&nbsp; Tested with Playwright (Chromium, Firefox, WebKit)</p>
  <table><thead><tr><th>Team member</th><th>Roll number</th></tr></thead><tbody>${members}</tbody></table>
  <p><strong>Repository (application + tests):</strong><br/><a href="${esc(team.repoUrl)}">${esc(team.repoUrl)}</a></p>
  <p><strong>Upstream application:</strong> https://github.com/TonyMckes/conduit-realworld-example-app (MIT)</p>
  <div style="text-align:left;width:70%;margin:30px auto 0">
  <h2>Contents</h2><ol class="toc">
    <li>Architecture, testing problems &amp; choice of tool</li>
    <li>Test cases</li>
    <li>Bug reports</li>
    <li>Test execution summary (pass/fail rates)</li>
    <li>Repository, installation &amp; execution</li>
  </ol>
  <h2>Key results</h2><ul>
    <li>31 automated test cases × 3 browsers = <strong>93 executions</strong></li>
    <li>Against specification: <strong>66 passed / 27 failed (71.0 %)</strong>, identical on all browsers</li>
    <li><strong>8 defects</strong> found: 4 High, 3 Medium, 1 Low (incl. data-integrity and race-condition bugs)</li>
    <li>All positive workflows (registration, login, create/edit/delete with DB verification) pass: 100 %</li>
  </ul></div>
</section>
<h1>1. Architecture, testing problems &amp; tool choice</h1>
${md(read('ARCHITECTURE.md').replace(/^# .*\n/, ''), { shift: 0, onMermaid: () => img('architecture.svg', 'Figure 1: Application architecture (3 tiers) and test harness') })}
<h1>2. Test cases</h1>
${md(read('TEST_CASES.md').replace(/^# .*\n/, ''), { shift: 0 })}
<h1>3. Bug reports</h1>
${bugs.replace(/<h2>Bug Reports<\/h2>/, '')}
<h1>4. Test execution summary</h1>
${md(read('TEST_SUMMARY.md').replace(/^# .*\n/, ''), { shift: 0 })}
<h1>5. Repository, installation &amp; execution</h1>
<p><strong>Repository:</strong> <a href="${esc(team.repoUrl)}">${esc(team.repoUrl)}</a>. It contains the application source (<code>backend/</code>, <code>frontend/</code>), the tests (<code>tests/e2e/</code>), the configuration (<code>playwright.config.js</code>), these documents (<code>docs/</code>) and the raw results (<code>reports/default</code>, <code>reports/bugs</code>).</p>
${md(read('../TESTING_README.md').replace(/^# .*\n/, '').replace(/^Docs:.*\n/m, ''), { shift: 1 })}
</body></html>`;

(async () => {
  const outHtml = path.join(docs, 'report', 'report.html');
  fs.writeFileSync(outHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + outHtml);
  const name = team.members.map((m) => m.roll).join('_') + '.pdf';
  const outPdf = path.join(docs, 'report', name);
  await page.pdf({
    path: outPdf, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#777">CSE731 Final Project · ${esc(team.members.map((m) => m.roll).join(' & '))} · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });
  await browser.close();
  console.log('Wrote', path.relative(root, outPdf));
})();
