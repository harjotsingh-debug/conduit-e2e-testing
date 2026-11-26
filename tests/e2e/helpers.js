const base = require('@playwright/test');
const { expect } = base;

// Block third-party requests (fonts/CDNs) so the 'load' event fires reliably
const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route(
      (url) => /^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname),
      (route) => route.abort()
    );
    await use(page);
  },
});

// Marks a confirmed defect: expected-fail by default, real FAIL with SHOW_BUGS=1
const knownBug = (id, note) =>
  base.test.fail(process.env.SHOW_BUGS !== '1', `${id}: ${note}`);

const API = process.env.API_URL || 'http://localhost:3001/api';
const PASSWORD = 'TestPassword123!';

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

function newUserData(prefix = 'user') {
  const id = uid();
  return { username: `${prefix}${id}`, email: `${prefix}${id}@example.com`, password: PASSWORD };
}

const authHeaders = (token) => ({ Authorization: `Token ${token}` });

/** Register through the API (fast set-up; keeps UI tests focused). */
async function registerViaApi(request, prefix = 'user') {
  const data = newUserData(prefix);
  const res = await request.post(`${API}/users`, { data: { user: data } });
  expect(res.ok(), `API register failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return { ...data, token: body.user.token };
}

/** Register through the real UI form. */
async function registerViaUi(page, prefix = 'user') {
  const data = newUserData(prefix);
  await page.goto('/#/register');
  await page.locator('input[name="username"]').fill(data.username);
  await page.locator('input[name="email"]').fill(data.email);
  await page.locator('input[name="password"]').fill(data.password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('link', { name: /new article/i })).toBeVisible();
  return data;
}

async function loginViaUi(page, user) {
  await page.goto('/#/login');
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('link', { name: /new article/i })).toBeVisible();
}

/**
 * Session-data technique: write a session straight into localStorage
 * (same shape the app itself stores under "loggedUser") before any page script runs.
 */
async function injectSession(page, { token, username, email }) {
  const session = {
    headers: { Authorization: `Token ${token}` },
    isAuth: true,
    loggedUser: { username, email, token },
  };
  await page.addInitScript((s) => localStorage.setItem('loggedUser', JSON.stringify(s)), session);
}

async function createArticleViaApi(request, token, overrides = {}) {
  const article = {
    title: `Article ${uid()}`,
    description: 'Article for testing',
    body: 'Original article content.',
    tagList: [`tag${uid()}`], // unique tag avoids BUG-008 race in unrelated tests
    ...overrides,
  };
  const res = await request.post(`${API}/articles`, {
    headers: authHeaders(token),
    data: { article },
  });
  expect(res.ok(), `API create article failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).article;
}

const slugFromUrl = (page) =>
  decodeURIComponent(new URL(page.url()).hash.split('/article/')[1].split('?')[0]);

module.exports = {
  API, PASSWORD, uid, newUserData, authHeaders,
  registerViaApi, registerViaUi, loginViaUi, injectSession,
  createArticleViaApi, slugFromUrl, test, expect, knownBug
};
