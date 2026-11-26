# Bug Reports

**Environment (all bugs):**
- OS: Windows 11
- Software: Node.js 22.14, PostgreSQL 18, Playwright 1.65
- Browsers: Chromium, Firefox and WebKit (desktop profiles)
- App: frontend on `localhost:3000` (Vite), backend on `localhost:3001` (Express)
- Database: fresh `conduit_dev` before each run

**Evidence:**
- `docs/evidence/` holds the committed screenshots and video.
- `reports/html-bugs/` is the full Playwright HTML report from the `SHOW_BUGS=1` run, with a trace, screenshot and video per failure. Open it with `npx playwright show-report reports/html-bugs`.

**Reproducibility:** in the final clean `SHOW_BUGS=1` run, every bug below failed on **all three browsers** (27/27 executions). TC31 was also repeated 10× per browser and detected the race 30/30 times.

| ID | Title | Severity | Priority | Layer | Found by |
|---|---|---|---|---|---|
| BUG-001 | Failed publish (network error) navigates to `/article/undefined` (404) with no error | Medium | High | Frontend | TC09 |
| BUG-002 | Server accepts malformed e-mail addresses at registration | Medium | Medium | Backend | TC13 |
| BUG-003 | Invalid / tampered JWT returns **500** instead of **401** | Medium | High | Backend | TC07, TC20 |
| BUG-004 | Title longer than 255 characters causes **500** instead of 422 | Low | Medium | Backend | TC27 |
| BUG-005 | Whitespace-only title causes 500 **and saves an orphan article** with empty slug and no author | High | High | Backend | TC29 |
| BUG-006 | Login receiving an unexpected 500 crashes the app (blank white screen) | High | High | Frontend | TC24 |
| BUG-007 | Login while offline navigates away and crashes the app (blank white screen) | High | Medium | Frontend | TC26 |
| BUG-008 | Concurrent article creation with the same new tag returns 500 **and saves orphan articles** | High | High | Backend (DB) | TC31 |

---

## BUG-001: Failed article publish silently navigates to `/article/undefined`
| Field | Value |
|---|---|
| Severity / Priority | Medium / High |
| Found by | TC09 (network failure, `page.route(...).abort()`) |
| Preconditions | Logged-in user on `#/editor` |
| Steps | 1. Fill in title, description and body. 2. Make `POST /api/articles` fail at the network level. 3. Click **Publish Article**. |
| Expected | An error message is shown. The user stays on the editor with the form data intact, and nothing is created. |
| Actual | No error message (`.error-messages` not found). The app navigates to `#/article/undefined`, which renders **404 Not Found**, and the user's draft is lost. |
| Root cause | `frontend/src/helpers/errorHandler.js` only `console.log`s errors that have no `response`, so it does not rethrow them. `setArticle()` therefore resolves to `undefined`, and `ArticleEditorForm` navigates to `/article/${undefined}`. |
| Evidence | `docs/evidence/BUG-001_TC09_publish_network_failure.png`, `docs/evidence/BUG-001_TC09_video.webm` |
| Suggested fix | Rethrow non-HTTP errors (e.g. `throw "Network error, please retry"`) and only navigate when `slug` is truthy. |
| Status | Open |

## BUG-002: Malformed e-mail addresses are accepted at registration
| Field | Value |
|---|---|
| Severity / Priority | Medium / Medium |
| Found by | TC13 (bypass technique: request sent directly to the API, skipping the browser's `type="email"` check) |
| Steps | `POST /api/users` with `{"user":{"username":"u1","email":"not-an-email-u1","password":"TestPassword123!"}}` |
| Expected | `422` with an "invalid email" message |
| Actual | `201 Created`. The user is stored with the invalid e-mail and receives a token. |
| Root cause | The server does no format validation: `email: DataTypes.STRING` in `backend/models/User.js` has no `isEmail` validator, and the controller only checks presence and uniqueness. |
| Suggested fix | Add `validate: { isEmail: true }` to the Sequelize `email` attribute, and map `SequelizeValidationError` to 422. |
| Status | Open |

## BUG-003: Invalid or tampered JWT returns 500 Internal Server Error instead of 401
| Field | Value |
|---|---|
| Severity / Priority | Medium / High |
| Found by | TC07 (session-data technique: forged token injected into `localStorage`), TC20 (tampered signature) |
| Steps | 1. Put `{"isAuth":true,"headers":{"Authorization":"Token invalid_test_token"},...}` in `localStorage.loggedUser`. 2. Open `#/editor` and publish. *Or:* `PUT`/`DELETE /api/articles/:slug` or `GET /api/user` with a token whose last 3 characters are altered. |
| Expected | `401 Unauthorized` |
| Actual | `500` for POST, PUT, DELETE and GET /user. Nothing is written to the database (data integrity holds), but the status code is wrong. Monitoring would see server faults instead of auth failures, and clients cannot tell "please log in again" apart from "server broken". |
| Root cause | In `backend/middleware/authentication.js`, `jwt.verify` throws `JsonWebTokenError`. The error middleware doesn't recognise this type, so `errorHandler` maps it to 500. |
| Evidence | `docs/evidence/BUG-003_TC07_invalid_token.png` |
| Suggested fix | Catch `JsonWebTokenError` / `TokenExpiredError` in `verifyToken` and throw `UnauthorizedError`. |
| Status | Open |

## BUG-004: Article title longer than 255 characters returns 500
| Field | Value |
|---|---|
| Severity / Priority | Low / Medium |
| Found by | TC27 (boundary value) |
| Steps | `POST /api/articles` with a valid token and `title` = 5000 × `"A"` |
| Expected | `422` with a "title too long" message |
| Actual | `500`. PostgreSQL raises *value too long for type character varying(255)*. The editor input has no `maxlength`, so a user can trigger this from the UI too. |
| Root cause | `title` and `slug` are `DataTypes.STRING` (VARCHAR 255), and neither the client nor the server checks the length. |
| Suggested fix | Add `maxlength="255"` in the editor, and a `len: [1,255]` validator returning 422 on the server. |
| Status | Open |

## BUG-005: Whitespace-only title returns 500 and leaves an orphan article in the database
| Field | Value |
|---|---|
| Severity / Priority | **High** / High (data integrity) |
| Found by | TC29 (edge case, bypass technique) |
| Steps | 1. `POST /api/articles` with `title: "     "`. 2. Repeat with any user. |
| Expected | `422 "A title is required"`; nothing stored. |
| Actual | First request: **500**, *yet a row is inserted* into `Articles` with `slug = ''`, `title = '     '` and `userId = NULL`. Every later whitespace title (from any user) then gets `422 "Title already exists"`, a misleading message caused by the orphan row. |
| DB evidence | `SELECT id, slug, title, "userId" FROM "Articles" WHERE trim(title)='';` returned a row with slug `''`, title `'     '` and `userId` NULL |
| Root cause | `if (!title)` treats `"     "` as present. `slugify()` trims it to `''`. `Article.create` succeeds, then a later step fails, and because there is no transaction nothing is rolled back. `setAuthor` is never reached. |
| Suggested fix | Validate `title.trim()`, and wrap the whole create in `sequelize.transaction()`. |
| Status | Open |

## BUG-006: Unexpected server error on login crashes the whole app (blank screen)
| Field | Value |
|---|---|
| Severity / Priority | **High** / High |
| Found by | TC24 (network technique: `page.route` fulfils `POST /api/users/login` with HTTP 500 and body `{"errors":{"server":["boom"]}}`, as a proxy/gateway might) |
| Steps | 1. Open `#/login`. 2. Enter valid credentials. 3. Server/gateway answers 500 with a body that is not `{errors:{body:[...]}}`. |
| Expected | Stay on login and show "Something went wrong, please try again". |
| Actual | The page turns **completely blank** (React tree unmounted) and no error is shown. The user is not logged in, but the app is unusable until a manual reload. |
| Root cause | `errorHandler.js` does `throw data.errors.body[0]` without checking that `body` exists. The resulting `TypeError` object is passed to `setErrorMessage`, and rendering an Error object as a React child crashes the tree (browser console: *Objects are not valid as a React child (found: [object Error])*). There is no error boundary. |
| Evidence | `docs/evidence/BUG-006_TC24_login_500_blank_screen.png` |
| Suggested fix | Use a defensive message such as `data?.errors?.body?.[0] ?? "Unexpected error"`, and add a React error boundary. |
| Status | Open |

## BUG-007: Logging in while offline navigates away from login and crashes the app
| Field | Value |
|---|---|
| Severity / Priority | High / Medium |
| Found by | TC26 (network technique: `context.setOffline(true)`) |
| Steps | 1. Open `#/login` and fill in valid credentials. 2. Lose network connectivity. 3. Click **Login**. |
| Expected | Stay on `#/login` with a "network error" message; no session created. |
| Actual | The URL changes to `#/` and the screen goes **blank**. No session is stored (security holds), but the user gets no feedback and the app is broken until a reload. |
| Root cause | Same as BUG-001: the network error is swallowed, so `userLogin()` resolves `undefined`. `LoginForm` then calls `setAuthState(undefined)` and `navigate("/")`, and the components reading the auth state crash (browser console: *Cannot read properties of undefined (reading 'headers')*). |
| Evidence | `docs/evidence/BUG-007_TC26_offline_login.png` |
| Status | Open |

## BUG-008: Race condition: concurrent articles with the same new tag fail and leave orphan rows
| Field | Value |
|---|---|
| Severity / Priority | **High** / High (data integrity, real multi-user scenario) |
| Found by | TC31 (5 rounds × 10 parallel `POST /api/articles` over separate connections, all introducing one new tag). It was first noticed as an intermittent 500 in TC06 setup during parallel test runs. |
| Steps | Send ≥2 simultaneous create requests whose `tagList` contains a tag that does not exist yet. |
| Expected | All return `201`; each article is stored with its author and the tag. |
| Actual | Typically 3–9 of 10 requests return **`500 "Validation error"`**. The failed articles **are still inserted**, but without author or tags (orphans). Server log: `SequelizeUniqueConstraintError: duplicate key value violates unique constraint "Tags_pkey"`. |
| Root cause | A check-then-insert race: `Tag.findByPk(tag)` and then `Tag.create(...)`, with no transaction and no `findOrCreate`. |
| Suggested fix | Use `Tag.findOrCreate` (or `INSERT ... ON CONFLICT DO NOTHING`), and do the whole create inside `sequelize.transaction()`. |
| Status | Open |

---

## Non-defect observations
- **Cross-site scripting (XSS):** TC28 injected a script tag into an article body. `<script>` and `onerror` payloads are **not** executed in any browser, so the app is safe here.
- **Cross-user authorization:** TC22 tried to edit and delete another user's article and got 403 as expected. TC23 confirmed the edit and delete controls are hidden from non-authors. Authorization is correct.
- **Flaky test observation:** in one of three full runs, TC17 timed out (30 s) on WebKit. It passed 10/10 when re-run alone. The cause was cold browser start while Vite re-optimised dependencies under 4 parallel workers. This is an environment effect, not an application defect.
- **Test-design lesson:** in the first execution, TC13 and TC29 passed on Firefox and WebKit *for the wrong reason*. The defect inserted a record (BUG-002/BUG-005), so the next browser's identical request got a "duplicate" 422. The tests now use unique data and check the error message, not just the status code.
- **Environment issue (fixed):** the root `npm run dev` script used single quotes, which `cmd.exe` on Windows does not understand, so the app would not start. Changed to escaped double quotes so it works on all OSes.
