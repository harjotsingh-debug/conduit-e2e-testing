# End-to-End Tests (CSE731 Final Project)

Application under test: RealWorld "Conduit": React (Vite) + Express + Sequelize + **PostgreSQL**.
Tool: **Playwright Test** (UI + API testing on Chromium, Firefox and WebKit). No AI agents or agentic frameworks are used.

Docs: [Architecture & strategy](docs/ARCHITECTURE.md) · [Test cases](docs/TEST_CASES.md) · [Bug reports](docs/BUG_REPORTS.md) · [Execution summary](docs/TEST_SUMMARY.md)

## Prerequisites
- Node.js >= 18.11 (tested on 22.x), npm, Git
- PostgreSQL running locally (tested on 18)

## Setup
```bash
git clone https://github.com/harjotsingh-debug/conduit-e2e-testing.git
cd conduit-e2e-testing
npm install
npx playwright install                     # downloads Chromium, Firefox, WebKit

# Database: create a login role once (as the postgres superuser)
psql -U postgres -c "CREATE ROLE conduit_user LOGIN CREATEDB PASSWORD 'conduit_local_pw';"

# Backend env file
cp backend/.env.example backend/.env
```
Edit `backend/.env`:
```
PORT=3001
JWT_KEY=any_long_random_string
DEV_DB_USERNAME=conduit_user
DEV_DB_PASSWORD=conduit_local_pw
DEV_DB_NAME=conduit_dev
DEV_DB_HOSTNAME=127.0.0.1
DEV_DB_DIALECT=postgres
DEV_DB_LOGGING=false
```
Then create the database. Tables are created automatically by `sequelize.sync` when the backend starts.
```bash
npm run sqlz -- db:create
```

## Run
Playwright starts the app itself (`npm run dev`) unless it is already running on :3000/:3001.
```bash
npx playwright test                              # all tests, all 3 browsers
npx playwright test --project=chromium           # one browser
npx playwright test tests/e2e/negative.spec.js   # one file
npx playwright test -g TC09                      # one test case
npx playwright show-report                       # open HTML report
node scripts/summarize.js                        # pass/fail table per browser
```
Confirmed defects are marked with `test.fail()`. They count as *expected failures*, so the default run stays green. To see them as real failures (with screenshots, video and trace for the bug reports), run:
```bash
# bash
SHOW_BUGS=1 npx playwright test
# PowerShell
$env:SHOW_BUGS=1; npx playwright test
```
Env overrides: `BASE_URL` (default http://localhost:3000), `API_URL` (default http://localhost:3001/api).

## Layout
```
tests/e2e/helpers.js         API/UI helpers, session injection, knownBug()
tests/e2e/auth.spec.js       TC01-03, TC10-13
tests/e2e/articles.spec.js   TC04-06, TC14-16
tests/e2e/negative.spec.js   TC07-09, TC17-30
playwright.config.js         3 browsers; HTML + JSON + JUnit reports; trace/screenshot/video on failure
scripts/summarize.js         pass/fail summary used in docs/TEST_SUMMARY.md
docs/                        architecture, test cases, bug reports, summary
```
Each test creates its own uniquely named users and articles, so the tests are independent and safe to run in parallel.
