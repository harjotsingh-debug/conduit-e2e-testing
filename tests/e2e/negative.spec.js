const { test, expect, knownBug } = require('./helpers');
const {
  API, authHeaders, registerViaApi, loginViaUi, injectSession, createArticleViaApi, uid,
} = require('./helpers');

const isPostArticles = (r) => /\/api\/articles$/.test(r.url()) && r.request().method() === 'POST';
const fillEditor = async (page, { title = '', description = '', body = '' } = {}) => {
  if (title) await page.locator('input[name="title"]').fill(title);
  if (description) await page.locator('input[name="description"]').fill(description);
  if (body) await page.locator('textarea[name="body"]').fill(body);
};

/* ------------------------------------------------------------------ */
test.describe('Session-data technique (localStorage manipulation)', () => {
    test('TC07 - Reject article creation with an invalid session token [negative]', async ({ page, request }) => {
        knownBug('BUG-003', 'invalid JWT returns 500 instead of 401');
        await injectSession(page, { token: 'invalid_test_token', username: 'fakeuser', email: 'fake@example.com' });
        await page.goto('/#/editor');
        await fillEditor(page, { title: 'Unauthorized Article', description: 'Testing invalid token', body: 'This should not be saved.' });

        const respPromise = page.waitForResponse(isPostArticles);
        await page.getByRole('button', { name: /publish article/i }).click();
        expect.soft((await respPromise).status()).toBe(401);
        await expect(page.locator('.error-messages')).toBeVisible();

        const res = await request.get(`${API}/articles?author=fakeuser`);
        expect((await res.json()).articles).toHaveLength(0);
    });

  test('TC18 - Protected pages are not usable without a session [negative]', async ({ page }) => {
    await page.goto('/#/editor');
    await expect(page.locator('input[name="title"]')).toHaveCount(0);

    await page.goto('/#/settings');
    await expect(page.locator('textarea[name="bio"]')).toHaveCount(0);
  });

  test('TC19 - Clearing session data mid-use logs the user out [negative]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    await loginViaUi(page, user);

    await page.evaluate(() => localStorage.removeItem('loggedUser'));
    await page.reload();

    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);
    await page.goto('/#/editor');
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
  });

  test('TC20 - Tampered token is rejected on write operations [negative]', async ({ request }) => {
    knownBug('BUG-003', 'tampered JWT returns 500 instead of 401');
    const user = await registerViaApi(request, 'author');
    const article = await createArticleViaApi(request, user.token);
    const tampered = user.token.slice(0, -3) + (user.token.endsWith('abc') ? 'xyz' : 'abc');

    let res = await request.put(`${API}/articles/${article.slug}`, {
        headers: authHeaders(tampered), data: { article: { title: 'Hacked' } },
    });
    expect.soft(res.status(), 'PUT').toBe(401);
    res = await request.delete(`${API}/articles/${article.slug}`, { headers: authHeaders(tampered) });
    expect.soft(res.status(), 'DELETE').toBe(401);
    res = await request.get(`${API}/user`, { headers: authHeaders(tampered) });
    expect.soft(res.status(), 'GET /user').toBe(401);

    // Article untouched
    res = await request.get(`${API}/articles/${article.slug}`);
    expect((await res.json()).article.title).toBe(article.title);
  });
});

/* ------------------------------------------------------------------ */
test.describe('Unauthorized access / authorization', () => {
  test('TC21 - Unauthenticated write requests are rejected [negative]', async ({ request }) => {
    const user = await registerViaApi(request, 'author');
    const article = await createArticleViaApi(request, user.token);

    const calls = [
      request.post(`${API}/articles`, { data: { article: { title: 't', description: 'd', body: 'b' } } }),
      request.put(`${API}/articles/${article.slug}`, { data: { article: { title: 'x' } } }),
      request.delete(`${API}/articles/${article.slug}`),
      request.post(`${API}/articles/${article.slug}/comments`, { data: { comment: { body: 'hi' } } }),
      request.post(`${API}/articles/${article.slug}/favorite`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status()).toBe(401);
  });

  test('TC22 - A user cannot edit or delete another user\'s article [negative]', async ({ request }) => {
    const owner = await registerViaApi(request, 'owner');
    const intruder = await registerViaApi(request, 'intruder');
    const article = await createArticleViaApi(request, owner.token);

    let res = await request.put(`${API}/articles/${article.slug}`, {
      headers: authHeaders(intruder.token), data: { article: { title: 'Hijacked' } },
    });
    expect(res.status()).toBe(403);
    res = await request.delete(`${API}/articles/${article.slug}`, { headers: authHeaders(intruder.token) });
    expect(res.status()).toBe(403);

    res = await request.get(`${API}/articles/${article.slug}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).article.title).toBe(article.title);
  });

  test('TC23 - Edit/Delete controls are hidden from non-authors [negative]', async ({ page, request }) => {
    const owner = await registerViaApi(request, 'owner');
    const viewer = await registerViaApi(request, 'viewer');
    const article = await createArticleViaApi(request, owner.token);
    await injectSession(page, viewer);

    await page.goto(`/#/article/${article.slug}`);
    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();
    await expect(page.getByRole('link', { name: /edit article/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /delete article/i })).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ */
test.describe('Form validation (native + bypass technique)', () => {
  test('TC08 - Prevent article submission with missing required fields (client-side) [negative]', async ({ page, request }) => {
    const user = await registerViaApi(request, 'author');
    await injectSession(page, user);
    await page.goto('/#/editor');

    await page.getByRole('button', { name: /publish article/i }).click();

    const title = page.locator('input[name="title"]');
    await expect(title).toBeFocused();
    expect(await title.evaluate((el) => el.validity.valueMissing)).toBe(true);
  });

  test('TC17 - Server rejects empty article when client validation is bypassed [negative/bypass]', async ({ page, request }) => {
    const user = await registerViaApi(request, 'author');
    await injectSession(page, user);
    await page.goto('/#/editor');

    // Bypass: strip HTML5 validation so the form posts empty values
    await page.evaluate(() => {
      document.querySelectorAll('[required]').forEach((el) => el.removeAttribute('required'));
      document.querySelectorAll('form').forEach((f) => (f.noValidate = true));
    });

    const respPromise = page.waitForResponse(isPostArticles);
    await page.getByRole('button', { name: /publish article/i }).click();
    expect((await respPromise).status()).toBe(422);
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page).toHaveURL(/editor/);
  });

  test('TC25 - API rejects articles with missing fields [negative/bypass]', async ({ request }) => {
    const user = await registerViaApi(request);
    const payloads = [
      {},
      { title: 'only title' },
      { title: 'no body', description: 'desc' },
      { description: 'no title', body: 'body' },
    ];
    for (const article of payloads) {
      const res = await request.post(`${API}/articles`, { headers: authHeaders(user.token), data: { article } });
      expect(res.status(), JSON.stringify(article)).toBe(422);
    }
  });
});

/* ------------------------------------------------------------------ */
test.describe('Network failures', () => {
  test('TC09 - Failed network request on publish must show an error, not navigate [negative]', async ({ page, request }) => {
    // Known defect BUG-001: app navigates to /article/undefined with no error.
    // Default run marks this as an expected failure; run with SHOW_BUGS=1 to see it FAIL.
    knownBug('BUG-001', 'silent failure + navigation to /article/undefined');

    const user = await registerViaApi(request, 'author');
    await injectSession(page, user);
    await page.goto('/#/editor');
    const title = `Network Failure ${uid()}`;
    await fillEditor(page, { title, description: 'Testing network failure', body: 'This request will fail.' });

    await page.route('**/api/articles', (route) => route.abort());
    await page.getByRole('button', { name: /publish article/i }).click();

    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page).not.toHaveURL(/article\/undefined/);
    const res = await request.get(`${API}/articles?author=${user.username}`);
    expect((await res.json()).articles).toHaveLength(0);
  });

  test('TC24 - Server error (500) on login keeps user logged out [negative]', async ({ page, request }) => {
    knownBug('BUG-006', 'no user feedback on server 500 at login');
    const user = await registerViaApi(request);
    await page.route('**/api/users/login', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ errors: { server: ['boom'] } }) })
    );

    await page.goto('/#/login');
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);
    await expect(page.locator('.error-messages')).toBeVisible(); // user feedback expected
  });

  test('TC26 - Offline login must not leave the login page or create a session [negative]', async ({ page, context, request }) => {
    knownBug('BUG-007', 'failed (offline) login navigates away from /login');
    const user = await registerViaApi(request);
    await page.goto('/#/login');
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForTimeout(1500);
    await context.setOffline(false);

    const stored = await page.evaluate(() => localStorage.getItem('loggedUser'));
    expect.soft(stored && JSON.parse(stored).isAuth, 'no session should be stored').toBeFalsy();
    expect.soft(await page.getByRole('link', { name: /new article/i }).count(), 'user must not look logged in').toBe(0);
    await expect(page).toHaveURL(/login/);
    });
});

/* ------------------------------------------------------------------ */
test.describe('Edge cases', () => {
  test('TC27 - Very long title is rejected cleanly, not with a 500 [edge]', async ({ request }) => {
    knownBug('BUG-004', '5000-char title causes 500');
    const user = await registerViaApi(request);
    const res = await request.post(`${API}/articles`, {
        headers: authHeaders(user.token),
        data: { article: { title: 'A'.repeat(5000), description: 'd', body: 'b' } },
    });
    expect(res.status()).toBeLessThan(500);
    });

    test('TC30 - Special characters in title render literally [edge]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    const special = `Ünïcödé 测试 ✓ "q" & <b>x</b> ${uid()}`;
    const article = await createArticleViaApi(request, user.token, { title: special });
    await page.goto(`/#/article/${article.slug}`);
    await expect(page.getByRole('heading', { name: special })).toBeVisible();
    });

  test('TC28 - Script injection in article body is not executed [edge/security]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    const payload = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1;alert(1)">';
    const article = await createArticleViaApi(request, user.token, { body: payload });

    let dialogSeen = false;
    page.on('dialog', (d) => { dialogSeen = true; d.dismiss(); });

    await page.goto(`/#/article/${article.slug}`);
    await expect(page.getByRole('heading', { name: article.title })).toBeVisible();
    await page.waitForTimeout(500);

    expect(dialogSeen).toBe(false);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('TC29 - Whitespace-only title is rejected by the API [edge/negative]', async ({ request }) => {
    knownBug('BUG-005', 'whitespace title -> 500 and an orphan article row is saved');
    const user = await registerViaApi(request);
    const res = await request.post(`${API}/articles`, {
      headers: authHeaders(user.token),
      data: { article: { title: '     ', description: 'd', body: 'b', tagList: [] } },
    });
    expect(res.status()).toBe(422);
    // A 422 must come from "title is required", not from a leftover duplicate record
    const msg = (await res.json()).errors.body[0];
    expect(msg).toMatch(/title/i);
    expect(msg).not.toMatch(/already exists/i);
  });

  test('TC31 - Concurrent articles introducing the same new tag all succeed [edge/concurrency]', async ({ request, playwright }) => {
    knownBug('BUG-008', 'race on Tag insert -> 500 and orphan articles (no transaction)');
    test.setTimeout(60_000);
    const user = await registerViaApi(request, 'racer');
    const ROUNDS = 5; // a race is timing-dependent: several rounds make detection reliable
    const N = 10;     // concurrent creates per round, each sharing one brand-new tag
    const failures = [];

    for (let round = 0; round < ROUNDS; round++) {
      const tag = `race${uid()}`;
      // One request context per call = separate connections, so requests truly overlap on the server
      const clients = await Promise.all(Array.from({ length: N }, () => playwright.request.newContext()));
      const statuses = await Promise.all(
        clients.map((c, i) =>
          c.post(`${API}/articles`, {
            headers: authHeaders(user.token),
            data: { article: { title: `Race ${tag} ${i}`, description: 'd', body: 'b', tagList: [tag] } },
          }).then((r) => r.status())
        )
      );
      await Promise.all(clients.map((c) => c.dispose()));

      // Every article must be stored under its author and carry the tag
      const body = await (await request.get(`${API}/articles?tag=${tag}&limit=50`)).json();
      const stored = body.articles.filter((a) => a.author && a.author.username === user.username).length;
      if (statuses.some((st) => st !== 201) || stored !== N) failures.push({ round, statuses, stored });
    }
    expect(failures, 'rounds where a create failed or an article lost its author/tag').toEqual([]);
  });
});
