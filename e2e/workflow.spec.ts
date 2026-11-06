import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Every write flow through the real UI against the live DB.
 * Credentials come from the environment only.
 */
const MANAGER_EMAIL = process.env['E2E_MANAGER_EMAIL'] ?? 'manager@demo.test';
const ASSIGNEE_EMAIL = process.env['E2E_ASSIGNEE_EMAIL'] ?? 'alice@demo.test';
const BOB_EMAIL = process.env['E2E_BOB_EMAIL'] ?? 'bob@demo.test';
const MANAGER_PASSWORD = process.env['DEMO_MANAGER_PASSWORD'] ?? '';
const ASSIGNEE_PASSWORD = process.env['DEMO_ASSIGNEE_PASSWORD'] ?? '';
const BOB_PASSWORD = process.env['DEMO_BOB_PASSWORD'] ?? ASSIGNEE_PASSWORD;

const SITE_NAME = 'Складской комплекс «Восток»';
const BUSY_SITE_NAME = 'ЖК «Северный парк», корпус 2';
const ASSIGNEE_NAME = 'Алиса Смирнова';

const stamp = Date.now();
const TITLE = `E2E ${stamp}`;
const EDITED_TITLE = `${TITLE} (ред.)`;
const DESCRIPTION = 'Проверка полного цикла задачи';
const EDITED_DESCRIPTION = 'Описание после редактирования';
const REWORK_COMMENT = `Исправить замечания ${stamp}`;
const NEW_SITE = `E2E site ${stamp}`;
const RENAMED_SITE = `${NEW_SITE} renamed`;

let currentTitle = TITLE;
let taskUrl = '';
let taskDeleted = false;
const contexts: BrowserContext[] = [];

async function login(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

const manager = (browser: Browser) => login(browser, MANAGER_EMAIL, MANAGER_PASSWORD);
const alice = (browser: Browser) => login(browser, ASSIGNEE_EMAIL, ASSIGNEE_PASSWORD);

async function openSite(page: Page, name: string) {
  await page.goto('/sites');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** The status badge sits in the page header next to the title. */
async function expectStatus(page: Page, label: string) {
  await expect(page.locator('header').getByText(label, { exact: true }).first()).toBeVisible();
}

async function pressAction(page: Page, name: string, nextStatus: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expectStatus(page, nextStatus);
  await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
}

const ACTION_NAMES = ['Принять', 'Вернуть на доработку', 'Взять в работу', 'Отправить на проверку', 'Вернуться к работе'];

async function expectNoActions(page: Page, names: string[]) {
  for (const name of names) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
}

async function confirmDeletion(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
}

async function removeCurrentTaskViaUi(page: Page) {
  await page.goto(taskUrl);
  await page.getByRole('button', { name: `Действия: ${currentTitle}` }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await confirmDeletion(page);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!MANAGER_PASSWORD || !ASSIGNEE_PASSWORD) {
    throw new Error('Set DEMO_MANAGER_PASSWORD and DEMO_ASSIGNEE_PASSWORD in the environment.');
  }
});

test.afterAll(async ({ browser }) => {
  if (taskUrl && !taskDeleted) {
    try {
      const page = await manager(browser);
      await removeCurrentTaskViaUi(page);
      await expect(page.getByText('Задача удалена', { exact: true })).toBeVisible();
    } catch {
      // Best effort only: the original failure is what matters.
    }
  }
  await Promise.all(contexts.map((c) => c.close()));
});

test('1. manager creates a task for Alice', async ({ browser }) => {
  const page = await manager(browser);
  await openSite(page, SITE_NAME);

  await page.getByRole('button', { name: 'Новая задача' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Новая задача' });
  await dialog.getByLabel('Название').fill(TITLE);
  await dialog.getByLabel('Описание').fill(DESCRIPTION);
  await dialog.getByRole('combobox', { name: 'Исполнитель' }).click();
  await page.getByRole('option', { name: ASSIGNEE_NAME }).click();
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Задача создана', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: TITLE, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  taskUrl = new URL(page.url()).pathname;
  await expectStatus(page, 'Новая');
  await expect(page.getByText('Задача создана:')).toBeVisible();
});

test('2. manager edits title and description', async ({ browser }) => {
  const page = await manager(browser);
  await page.goto(taskUrl);
  await page.getByRole('button', { name: `Действия: ${TITLE}` }).click();
  await page.getByRole('menuitem', { name: 'Изменить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Редактировать задачу' });
  await expect(dialog.getByLabel('Название')).toHaveValue(TITLE);
  await dialog.getByLabel('Название').fill(EDITED_TITLE);
  await dialog.getByLabel('Описание').fill(EDITED_DESCRIPTION);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Задача сохранена', { exact: true })).toBeVisible();
  currentTitle = EDITED_TITLE;
  await expect(page.getByRole('heading', { level: 1, name: EDITED_TITLE })).toBeVisible();
  await expect(page.getByText(EDITED_DESCRIPTION)).toBeVisible();
});

test('3. Alice takes the task and sends it for review', async ({ browser }) => {
  const page = await alice(browser);
  await expect(page).toHaveURL(/\/my-tasks/);
  await page.getByRole('link', { name: EDITED_TITLE, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: EDITED_TITLE })).toBeVisible();
  await expectStatus(page, 'Новая');

  await pressAction(page, 'Взять в работу', 'В работе');
  await pressAction(page, 'Отправить на проверку', 'На проверке');
  await expectNoActions(page, ACTION_NAMES);
});

test('4. manager sends it back; comment is required', async ({ browser }) => {
  const page = await manager(browser);
  await page.goto(taskUrl);
  await expectStatus(page, 'На проверке');
  await page.getByRole('button', { name: 'Вернуть на доработку', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Вернуть на доработку' });
  const submit = dialog.getByRole('button', { name: 'Вернуть на доработку' });
  const comment = dialog.getByLabel('Что нужно исправить');

  // Empty and whitespace-only comments are rejected: the dialog stays open and the status is unchanged.
  await submit.click();
  await expect(dialog.getByText('Опишите, что нужно исправить')).toBeVisible();
  await comment.fill('   \n  ');
  await submit.click();
  await expect(dialog.getByText('Опишите, что нужно исправить')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expectStatus(page, 'На проверке');

  await comment.fill(REWORK_COMMENT);
  await submit.click();
  await expect(dialog).toBeHidden();
  await expectStatus(page, 'На доработке');
  await expect(page.locator('blockquote').filter({ hasText: REWORK_COMMENT }).first()).toBeVisible();
});

test('5. Alice reworks, manager accepts', async ({ browser }) => {
  const alicePage = await alice(browser);
  await alicePage.goto(taskUrl);
  await expectStatus(alicePage, 'На доработке');
  await expect(alicePage.getByText(REWORK_COMMENT).first()).toBeVisible();
  await pressAction(alicePage, 'Вернуться к работе', 'В работе');
  await pressAction(alicePage, 'Отправить на проверку', 'На проверке');

  const page = await manager(browser);
  await page.goto(taskUrl);
  await pressAction(page, 'Принять', 'Принята');
  await expectNoActions(page, ACTION_NAMES);
  await page.getByRole('button', { name: `Действия: ${EDITED_TITLE}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Удалить' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Изменить' })).toHaveCount(0);
});

test('6a. another assignee cannot open the task', async ({ browser }) => {
  const page = await login(browser, BOB_EMAIL, BOB_PASSWORD);
  await page.goto(taskUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Задача не найдена' })).toBeVisible();
  await expect(page.getByText(EDITED_TITLE)).toHaveCount(0);
});

test('6b. site with tasks cannot be deleted', async ({ browser }) => {
  const page = await manager(browser);
  await page.goto('/sites');
  await page.getByRole('button', { name: `Действия: ${BUSY_SITE_NAME}` }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await confirmDeletion(page);
  await expect(page.getByText('Ошибка', { exact: true })).toBeVisible();
  await expect(page.getByText('Объект удалён', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: BUSY_SITE_NAME, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: BUSY_SITE_NAME, exact: true })).toBeVisible();
});

test('7. site create, edit, delete', async ({ browser }) => {
  const page = await manager(browser);
  await page.goto('/sites');
  await page.getByRole('button', { name: 'Новый объект' }).click();
  let dialog = page.getByRole('dialog', { name: 'Новый объект' });
  await dialog.getByLabel('Название').fill(NEW_SITE);
  await dialog.getByLabel('Адрес').fill('Тестовый адрес, 1');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Объект создан', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: NEW_SITE, exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Действия: ${NEW_SITE}` }).click();
  await page.getByRole('menuitem', { name: 'Изменить' }).click();
  dialog = page.getByRole('dialog', { name: 'Редактировать объект' });
  await dialog.getByLabel('Название').fill(RENAMED_SITE);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Объект сохранён', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: RENAMED_SITE, exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Действия: ${RENAMED_SITE}` }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await confirmDeletion(page);
  await expect(page.getByText('Объект удалён', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: RENAMED_SITE, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Объекты' })).toBeVisible();
  await expect(page.getByRole('link', { name: RENAMED_SITE, exact: true })).toHaveCount(0);
});

test('8. manager deletes the E2E task', async ({ browser }) => {
  const page = await manager(browser);
  await removeCurrentTaskViaUi(page);
  await expect(page.getByText('Задача удалена', { exact: true })).toBeVisible();
  taskDeleted = true;
  await expect(page).toHaveURL(/\/sites\/\d+/);
  await expect(page.getByRole('link', { name: EDITED_TITLE, exact: true })).toHaveCount(0);

  await page.goto(taskUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Задача не найдена' })).toBeVisible();

  const alicePage = await alice(browser);
  await expect(alicePage.getByRole('heading', { level: 1, name: 'Мои задачи' })).toBeVisible();
  await expect(alicePage.getByRole('link', { name: EDITED_TITLE })).toHaveCount(0);
});
