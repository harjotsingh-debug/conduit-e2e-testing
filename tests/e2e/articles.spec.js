const { test, expect, knownBug } = require('./helpers');
const {
  API, authHeaders, registerViaApi, registerViaUi, injectSession,
  createArticleViaApi, slugFromUrl, uid,
} = require('./helpers');

test.describe('Article workflows', () => {
  test('TC04 - Create a new article [positive]', async ({ page, request }) => {
    const user = await registerViaUi(page, 'author');
    const title = `Test Article ${uid()}`;
    const tag = `tag${uid()}`;

    await page.getByRole('link', { name: /new article/i }).click();
    await page.locator('input[name="title"]').fill(title);
    await page.locator('input[name="description"]').fill('Article for testing');
    await page.locator('textarea[name="body"]').fill('Original article content.');
    await page.locator('input[name="tags"]').fill(tag);
    await page.getByRole('button', { name: /publish article/i }).click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // DB check via API
    const res = await request.get(`${API}/articles/${slugFromUrl(page)}`);
    expect(res.status()).toBe(200);
    const { article } = await res.json();
    expect(article.title).toBe(title);
    expect(article.description).toBe('Article for testing');
    expect(article.body).toBe('Original article content.');
    expect(article.tagList).toContain(tag);
    expect(article.author.username).toBe(user.username);
  });

  test('TC05 - Edit an existing article [positive]', async ({ page, request }) => {
    const user = await registerViaApi(request, 'author');
    const original = await createArticleViaApi(request, user.token);
    await injectSession(page, user);

    await page.goto(`/#/article/${original.slug}`);
    await page.getByRole('link', { name: /edit article/i }).first().click();

    const newTitle = `${original.title} Updated`;
    await page.locator('input[name="title"]').fill(newTitle);
    await page.locator('input[name="description"]').fill('Updated description');
    await page.locator('textarea[name="body"]').fill('Updated body content.');
    await page.getByRole('button', { name: /update article/i }).click();

    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();

    // Persistence: survives reload and is stored in the DB
    await page.reload();
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();

    const res = await request.get(`${API}/articles/${slugFromUrl(page)}`);
    expect(res.status()).toBe(200);
    const { article } = await res.json();
    expect(article.title).toBe(newTitle);
    expect(article.description).toBe('Updated description');
    expect(article.body).toBe('Updated body content.');
  });

  test('TC06 - Delete an existing article [positive]', async ({ page, request }) => {
    const user = await registerViaApi(request, 'author');
    const article = await createArticleViaApi(request, user.token);
    await injectSession(page, user);

    await page.goto(`/#/article/${article.slug}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /delete article/i }).first().click();

    await expect(page).not.toHaveURL(/\/article\//);
    await expect(page.getByRole('heading', { name: article.title })).toHaveCount(0);

    // DB check: record is gone
    const res = await request.get(`${API}/articles/${article.slug}`);
    expect(res.status()).toBe(404);
  });

  test('TC14 - Add and delete a comment [positive]', async ({ page, request }) => {
    const author = await registerViaApi(request, 'author');
    const commenter = await registerViaApi(request, 'commenter');
    const article = await createArticleViaApi(request, author.token);
    await injectSession(page, commenter);

    await page.goto(`/#/article/${article.slug}`);
    const text = `Great read ${uid()}`;
    await page.getByPlaceholder(/comment/i).fill(text);
    await page.getByRole('button', { name: /post comment/i }).click();
    await expect(page.getByText(text)).toBeVisible();

    // DB check
    const list = await request.get(`${API}/articles/${article.slug}/comments`);
    const comments = (await list.json()).comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe(text);
    expect(comments[0].author.username).toBe(commenter.username);

    // Delete (API) and confirm removal
    const del = await request.delete(`${API}/articles/${article.slug}/comments/${comments[0].id}`, {
      headers: authHeaders(commenter.token),
    });
    expect(del.ok()).toBeTruthy();
    const after = await request.get(`${API}/articles/${article.slug}/comments`);
    expect((await after.json()).comments).toHaveLength(0);
  });

  test('TC15 - Update profile settings [positive]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    await injectSession(page, user);

    await page.goto('/#/settings');
    const bio = `Bio ${uid()}`;
    await page.locator('textarea[name="bio"]').fill(bio);

    const respPromise = page.waitForResponse(
      (r) => /\/api\/user$/.test(r.url()) && r.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: /update settings/i }).click();
    expect((await respPromise).status()).toBe(200);

    // DB check
    const res = await request.get(`${API}/user`, { headers: authHeaders(user.token) });
    expect((await res.json()).user.bio).toBe(bio);
  });

  test('TC16 - Favorite and follow workflows [positive]', async ({ request }) => {
    const author = await registerViaApi(request, 'author');
    const fan = await registerViaApi(request, 'fan');
    const article = await createArticleViaApi(request, author.token);

    // Favorite
    let res = await request.post(`${API}/articles/${article.slug}/favorite`, { headers: authHeaders(fan.token) });
    expect(res.ok(), `favorite failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    let body = (await res.json()).article;
    expect(body.favorited).toBe(true);
    expect(body.favoritesCount).toBe(1);

    res = await request.get(`${API}/articles?favorited=${fan.username}`);
    expect((await res.json()).articles.map((a) => a.slug)).toContain(article.slug);

    res = await request.delete(`${API}/articles/${article.slug}/favorite`, { headers: authHeaders(fan.token) });
    expect((await res.json()).article.favoritesCount).toBe(0);

    // Follow
    res = await request.post(`${API}/profiles/${author.username}/follow`, { headers: authHeaders(fan.token) });
    expect((await res.json()).profile.following).toBe(true);
    res = await request.delete(`${API}/profiles/${author.username}/follow`, { headers: authHeaders(fan.token) });
    expect((await res.json()).profile.following).toBe(false);
  });
});
