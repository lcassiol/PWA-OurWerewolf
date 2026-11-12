import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('mobile browser layout, install metadata, rotation, and offline shell', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Vila da Lua' }),
  ).toBeVisible();

  const portrait = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    smallestButton: Math.min(
      ...Array.from(document.querySelectorAll('button')).map(
        (button) => button.getBoundingClientRect().height,
      ),
    ),
  }));
  expect(portrait.scrollWidth).toBeLessThanOrEqual(portrait.innerWidth);
  expect(portrait.smallestButton).toBeGreaterThanOrEqual(44);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return (await response.json()) as {
      display: string;
      icons: Array<{ type: string; sizes: string }>;
    };
  });
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image/png', sizes: '192x192' }),
      expect.objectContaining({ type: 'image/png', sizes: '512x512' }),
    ]),
  );

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole('button', { name: 'Criar minha vila' }),
  ).toBeVisible();
  const landscapeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(landscapeOverflow).toBe(false);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) location.reload();
  });
  await page.waitForLoadState('networkidle');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByLabel('Seu apelido').fill('Cache Check');
  await page.getByRole('button', { name: 'Criar minha vila' }).click();
  await expect(
    page.getByRole('button', { name: /Compartilhar sala/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /A vila se reúne em .+ durante [oa]\.\.\./,
    }),
  ).toBeVisible();
  const lobbyLayout = await page.evaluate(() => {
    const code = document.querySelector<HTMLElement>('.room-code')!;
    const occupancy = document.querySelector<HTMLElement>('.room-occupancy')!;
    const artwork = document.querySelector<HTMLElement>('.room-theme-art')!;
    const participants =
      document.querySelector<HTMLElement>('.participant-panel')!;
    const occupancyRect = occupancy.getBoundingClientRect();
    return {
      codeFontSize: Number.parseFloat(getComputedStyle(code).fontSize),
      occupancyRight: window.innerWidth - occupancyRect.right,
      artworkTop: artwork.getBoundingClientRect().top,
      participantsTop: participants.getBoundingClientRect().top,
    };
  });
  expect(lobbyLayout.codeFontSize).toBeLessThanOrEqual(30);
  expect(lobbyLayout.occupancyRight).toBeLessThanOrEqual(24);
  expect(lobbyLayout.artworkTop).toBeLessThan(lobbyLayout.participantsTop);
  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });
  expect(cachedUrls.some((url) => url.includes('/api/'))).toBe(false);
  expect(cachedUrls.some((url) => url.includes('/rooms/'))).toBe(false);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Você está offline' }),
  ).toBeVisible();
  await context.setOffline(false);
});
