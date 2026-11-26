# Test Case List

**Technique codes:**
- **UI**: real browser flow.
- **API**: direct HTTP via Playwright `request`; also used to verify database state.
- **Session**: localStorage session injection, removal or forging.
- **Bypass**: client-side validation disabled or skipped.
- **Route**: network mocking (`page.route` abort/fulfil) or `context.setOffline`.

**Result** is the outcome of the final clean run with `SHOW_BUGS=1`. Every test ran on Chromium, Firefox and WebKit, and the result was identical on all three. A **Fail** means the application's behaviour differs from the expected result; the linked bug report gives the details.

| ID | Title | Type | Technique | Spec file | Expected result | Result |
|----|-------|------|-----------|-----------|-----------------|--------|
| TC01 | Register a new user | Positive | UI + API | auth | Account created, session stored in localStorage, login via API works (DB record exists) | Pass |
| TC02 | Login with wrong credentials | Negative | UI | auth | 4xx response, error message shown, not logged in | Pass |
| TC03 | Protected API without auth | Negative | API | auth | `GET /api/user` → 401 | Pass |
| TC04 | Create article | Positive | UI + API | articles | Article page shown; title, description, body, tag and author persisted | Pass |
| TC05 | Edit article | Positive | Session + UI + API | articles | Title/description/body updated; persists after reload and in DB | Pass |
| TC06 | Delete article | Positive | Session + UI + API | articles | Confirm dialog accepted; leaves article page; `GET` → 404 | Pass |
| TC07 | Create article with forged session token | Negative | Session | negative | `POST` → 401, error shown, nothing saved | **Fail: BUG-003** (500) |
| TC08 | Submit editor with required fields empty | Negative | UI (HTML5 validation) | negative | Browser blocks submit; title focused, `valueMissing` | Pass |
| TC09 | Network failure on publish | Negative | Route (abort) | negative | Error shown, stays on editor, nothing saved | **Fail: BUG-001** |
| TC10 | Login with valid credentials | Positive | UI | auth | Logged in, token stored | Pass |
| TC11 | Logout | Positive | UI | auth | Auth links gone, session cleared, editor unusable after reload | Pass |
| TC12 | Duplicate email registration | Negative | UI | auth | Error shown, not logged in | Pass |
| TC13 | Invalid email registration | Negative | Bypass + API | auth | 422 | **Fail: BUG-002** (201) |
| TC14 | Add & delete a comment | Positive | Session + UI + API | articles | Comment persisted with correct author, then removed | Pass |
| TC15 | Update profile settings (bio) | Positive | Session + UI + API | articles | `PUT /api/user` 200; bio persisted | Pass |
| TC16 | Favorite/unfavorite & follow/unfollow | Positive | API | articles | Flags and counts update and revert | Pass |
| TC17 | Empty article with client validation bypassed | Negative | Bypass | negative | Server 422, error shown, stays on editor | Pass |
| TC18 | Protected pages without a session | Negative | Session | negative | Editor/settings forms not rendered | Pass |
| TC19 | Session cleared mid-use | Negative | Session | negative | Logged out after reload; editor unusable | Pass |
| TC20 | Tampered token on PUT/DELETE/GET user | Negative | Session + API | negative | All → 401; article unchanged | **Fail: BUG-003** (500; data unchanged ✓) |
| TC21 | Unauthenticated write requests | Negative | API | negative | 5 write endpoints → 401 | Pass |
| TC22 | Edit/delete another user's article | Negative | API | negative | 403; article unchanged | Pass |
| TC23 | Edit/delete controls hidden from non-author | Negative | Session + UI | negative | Controls absent | Pass |
| TC24 | Server 500 on login | Negative | Route (fulfil) | negative | Stays on login, error message shown | **Fail: BUG-006** (blank screen) |
| TC25 | API rejects incomplete article payloads | Negative | Bypass + API | negative | 422 for each of 4 payloads | Pass |
| TC26 | Offline during login | Negative | Route (offline) | negative | Stays on login, no session | **Fail: BUG-007** |
| TC27 | 5000-character title | Edge (boundary) | API | negative | Clean 4xx, no 5xx | **Fail: BUG-004** (500) |
| TC28 | Script injection in article body | Edge / Security | API + UI | negative | No script executed, no dialog | Pass |
| TC29 | Whitespace-only title | Edge | Bypass + API | negative | 422 "title is required" | **Fail: BUG-005** |
| TC30 | Unicode / special characters in title | Edge | API + UI | negative | Characters rendered literally | Pass |
| TC31 | 10 concurrent creates sharing a new tag (×5 rounds) | Edge / Concurrency | API | negative | All 201; every article stored with author and tag | **Fail: BUG-008** |

## Totals
| | Count |
|---|---|
| Test cases | 31 (9 positive, 17 negative, 5 edge) |
| Executions per run | 31 × 3 browsers = **93** |
| Pass | 22 per browser (66 executions) |
| Fail (confirmed defects) | 9 per browser (27 executions) → 8 distinct bugs |

## Coverage of the assignment requirements
| Requirement | Test cases |
|---|---|
| User registration / authentication | TC01, TC02, TC10, TC11, TC12, TC13 |
| Adding / editing records with DB updates | TC04, TC05, TC06, TC14, TC15, TC16 (each verifies via API read-back) |
| Critical workflow across the app | register → create → edit → comment → delete (TC01, TC04–06, TC14) |
| Session-data technique | TC05–07, TC14, TC15, TC18–20, TC23 |
| Bypass technique | TC13, TC17, TC25, TC29 |
| Network failures | TC09, TC24, TC26 |
| Unauthorized access | TC03, TC07, TC18–23 |
| Form validation errors | TC02, TC08, TC12, TC13, TC17, TC25, TC27, TC29 |
