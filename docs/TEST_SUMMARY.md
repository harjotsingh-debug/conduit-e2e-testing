# Test Execution Summary

| Item | Value |
|---|---|
| Date | 26 Nov 2026 |
| Tool | Playwright Test 1.65 (6 parallel workers, 30 s timeout per test, 0 retries) |
| Browsers | Chromium 1255, Firefox 1572, WebKit 2388 (desktop profiles) |
| Platform | Windows 11, Node.js 22.14, PostgreSQL 18 |
| Database | `conduit_dev` dropped and re-created immediately before the run |
| Test cases | 31 → **93 executions** (31 × 3 browsers) |

## 1. Results against the specification (`SHOW_BUGS=1`)
This run treats every deviation from the expected behaviour as a failure. **It is the primary pass/fail result.**

| Browser | Executed | Passed | Failed | Pass rate |
|---|---|---|---|---|
| Chromium | 31 | 22 | 9 | 71.0 % |
| Firefox | 31 | 22 | 9 | 71.0 % |
| WebKit | 31 | 22 | 9 | 71.0 % |
| **Total** | **93** | **66** | **27** | **71.0 %** |

Duration: 85 s. Flaky: 0. Skipped: 0.

### By category
| Category | Cases | Passed | Failed | Pass rate |
|---|---|---|---|---|
| Positive (functional workflows) | 9 | 9 | 0 | 100 % |
| Negative (auth, validation, network) | 17 | 11 | 6 | 64.7 % |
| Edge (boundary, special chars, XSS, concurrency) | 5 | 2 | 3 | 40 % |

### By testing problem
| Problem area | Cases | Failed | Bugs |
|---|---|---|---|
| Registration / authentication | 6 | 1 | BUG-002 |
| Record create / edit / delete with DB verification | 6 | 0 | none |
| Unauthorized access (session technique) | 8 | 2 | BUG-003 |
| Form validation (incl. bypass) | 8 | 3 | BUG-002, BUG-004, BUG-005 |
| Network failures | 3 | 3 | BUG-001, BUG-006, BUG-007 |
| Concurrency | 1 | 1 | BUG-008 |

Some cases count under more than one problem area, so the "Cases" column adds up to more than 31.

### Failed executions
| TC | Chromium | Firefox | WebKit | Bug | Severity |
|---|---|---|---|---|---|
| TC07 | ✗ | ✗ | ✗ | BUG-003 | Medium |
| TC09 | ✗ | ✗ | ✗ | BUG-001 | Medium |
| TC13 | ✗ | ✗ | ✗ | BUG-002 | Medium |
| TC20 | ✗ | ✗ | ✗ | BUG-003 | Medium |
| TC24 | ✗ | ✗ | ✗ | BUG-006 | High |
| TC26 | ✗ | ✗ | ✗ | BUG-007 | High |
| TC27 | ✗ | ✗ | ✗ | BUG-004 | Low |
| TC29 | ✗ | ✗ | ✗ | BUG-005 | High |
| TC31 | ✗ | ✗ | ✗ | BUG-008 | High |

**Defects found: 8** (4 High, 3 Medium, 1 Low). 5 are in the backend and 3 in the frontend.

## 2. Regression run (default mode)
Confirmed defects are marked `test.fail()`, so the suite stays green and becomes red only if behaviour *changes*. That happens either when a bug is fixed (the test should then be un-marked) or when a new regression appears.

| Browser | Executed | As expected | Unexpected | Of which known-bug (expected fail) |
|---|---|---|---|---|
| Chromium | 31 | 31 | 0 | 9 |
| Firefox | 31 | 31 | 0 | 9 |
| WebKit | 31 | 31 | 0 | 9 |
| **Total** | **93** | **93 (100 %)** | **0** | **27** |

Duration: 76 s.

## 3. Cross-browser compatibility
All 31 test cases produced **identical outcomes on Chromium, Firefox and WebKit**. No browser-specific defects were found. Every defect lives in shared application logic (React error handling, Express/Sequelize validation, missing DB transactions), not in browser-dependent rendering.

## 4. Stability
- **Determinism.** Every run starts from a freshly created database. Each test creates its own uniquely named users, articles and tags, so tests are independent and parallel-safe.
- **TC31 (race condition).** Repeated 10× per browser in isolation, it detected the defect 30/30 times.
- **One flaky observation.** During an earlier full run, TC17 timed out once on WebKit; it then passed 10/10 when re-run alone. It is attributed to cold browser start while Vite re-optimised dependencies, and it did not recur in the final runs.

## 5. How to reproduce
```bash
npx playwright test && node scripts/summarize.js                 # regression mode
SHOW_BUGS=1 npx playwright test && node scripts/summarize.js     # spec mode (bash)
npx playwright show-report                                       # HTML report with traces
```
Archived reports from these runs: `reports/default/` and `reports/bugs/` (JSON + JUnit), and `reports/html-default/` and `reports/html-bugs/` (HTML).
