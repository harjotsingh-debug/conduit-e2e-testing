const { test, expect, knownBug } = require('./helpers');
const { API, newUserData, registerViaApi, registerViaUi, loginViaUi } = require('./helpers');

test.describe('Authentication', () => {
  test('TC01 - Register a new user [positive]', async ({ page, request }) => {
    const user = await registerViaUi(page);

    // DB/API check: the account really exists and can authenticate
    const res = await request.post(`${API}/users/login`, {
      data: { user: { email: user.email, password: user.password } },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).user.username).toBe(user.username);

    // Session persisted client-side
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('loggedUser')));
    expect(stored.isAuth).toBe(true);
    expect(stored.loggedUser.username).toBe(user.username);
  });

  test('TC02 - Reject login with incorrect credentials [negative]', async ({ page }) => {
    await page.goto('/#/login');
    await page.locator('input[name="email"]').fill('nonexistent@example.com');
    await page.locator('input[name="password"]').fill('WrongPassword123!');

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/users/login') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Login' }).click();
    const status = (await respPromise).status();

    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);
  });

  test('TC03 - Reject access to protected API without authentication [negative]', async ({ request }) => {
    const response = await request.get(`${API}/user`);
    expect(response.status()).toBe(401);
  });

  test('TC10 - Login with valid credentials [positive]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    await loginViaUi(page, user);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('loggedUser')));
    expect(stored.isAuth).toBe(true);
    expect(stored.loggedUser.token).toBeTruthy();
  });

  test('TC11 - Logout ends the session [positive]', async ({ page, request }) => {
    const user = await registerViaApi(request);
    await loginViaUi(page, user);

    await page.getByRole('navigation').getByText(user.username).click();
    await page.getByText('Logout', { exact: true }).click();

    // UI no longer shows authenticated links
    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);

    // Session data is removed from storage
    expect(await page.evaluate(() => localStorage.getItem('loggedUser'))).toBeNull();

    // Logout persists across a reload, and protected pages stay unusable
    await page.reload();
    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);
    await page.goto('/#/editor');
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
    });

  test('TC12 - Reject registration with a duplicate email [negative]', async ({ page, request }) => {
    const existing = await registerViaApi(request);
    const other = newUserData('dup');

    await page.goto('/#/register');
    await page.locator('input[name="username"]').fill(other.username);
    await page.locator('input[name="email"]').fill(existing.email);
    await page.locator('input[name="password"]').fill(other.password);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.getByRole('link', { name: /new article/i })).toHaveCount(0);
  });

  test('TC13 - Reject registration with an invalid email at API level [negative/bypass]', async ({ request }) => {
    knownBug('BUG-002', 'server accepts malformed e-mail addresses');
    const data = newUserData('bad');
    // Bypass the browser's type="email" check; unique value so "already exists" cannot mask the result
    const invalidEmail = `not-an-email-${data.username}`;
    const res = await request.post(`${API}/users`, {
      data: { user: { ...data, email: invalidEmail } },
    });
    expect(res.status()).toBe(422);
  });
});
