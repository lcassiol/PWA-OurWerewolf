import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test('six mobile clients finish a complete game', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The complete multi-client flow runs once.',
  );
  test.setTimeout(120_000);

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < 6; index += 1) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
      });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await page.goto('/');
    }

    await pages[0]!.getByLabel('Seu apelido').fill('Host');
    await pages[0]!.getByRole('button', { name: 'Criar minha vila' }).click();
    const codeButton = pages[0]!.getByRole('button', {
      name: /Compartilhar sala/,
    });
    await expect(codeButton).toBeVisible();
    const code = (await codeButton.textContent())?.match(/[A-Z]{4}/)?.[0];
    expect(code).toMatch(/^[A-Z]{4}$/);

    for (let index = 1; index < pages.length; index += 1) {
      const page = pages[index]!;
      await page.getByRole('button', { name: 'Entrar com código' }).click();
      await page.getByLabel('Código da sala').fill(code!);
      await page.getByLabel('Seu apelido').fill(`Player ${index}`);
      await page.getByRole('button', { name: 'Entrar na vila' }).click();
      await expect(
        page.getByRole('button', { name: `Compartilhar sala ${code}` }),
      ).toBeVisible();
    }

    await pages[0]!.getByLabel('Discussão diurna').selectOption('1');
    await pages[0]!
      .getByRole('button', { name: 'Salvar configuração' })
      .click();
    await expect(pages[0]!.getByText('Configuração salva.')).toBeVisible();

    for (const page of pages) {
      await page.getByRole('button', { name: 'Estou pronto' }).click();
      await expect(
        page.getByRole('button', { name: 'Ainda não estou pronto' }),
      ).toBeVisible();
    }
    await expect(
      pages[0]!.getByRole('button', { name: 'Começar a crônica' }),
    ).toBeEnabled();
    await pages[0]!.getByRole('button', { name: 'Começar a crônica' }).click();

    let wolfPage: Page | undefined;
    let wolfName = '';
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!;
      await expect(
        page.getByRole('button', { name: 'Revelar minha carta' }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Revelar minha carta' }).click();
      if (await page.getByRole('heading', { name: 'Lobisomem' }).isVisible()) {
        wolfPage = page;
        wolfName = index === 0 ? 'Host' : `Player ${index}`;
      }
    }
    expect(wolfPage).toBeDefined();

    const wolfIndex = pages.indexOf(wolfPage!);
    const coverPage = await contexts[wolfIndex]!.newPage();
    await coverPage.goto('about:blank');
    await coverPage.bringToFront();
    await wolfPage!.bringToFront();
    await wolfPage!.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(
      wolfPage!.getByRole('button', { name: 'Aguardando conexão segura' }),
    ).toBeDisabled();
    await wolfPage!.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      wolfPage!.getByRole('button', { name: 'Revelar minha carta' }),
    ).toBeEnabled();
    await wolfPage!
      .getByRole('button', { name: 'Revelar minha carta' })
      .click();
    await coverPage.close();

    let acceptedWithoutResponse = 0;
    await wolfPage!.route('**/api/rooms/*/commands', async (route) => {
      await route.fetch();
      acceptedWithoutResponse += 1;
      await route.abort('internetdisconnected');
    });
    const firstWolfTarget = wolfPage!.locator('.target-option').first();
    await firstWolfTarget.click();
    await wolfPage!
      .getByRole('button', { name: 'Confirmar voto da alcateia' })
      .click();
    await expect.poll(() => acceptedWithoutResponse).toBe(1);
    await contexts[wolfIndex]!.setOffline(true);
    await expect(
      wolfPage!.getByRole('button', { name: 'Aguardando conexão segura' }),
    ).toBeDisabled();
    await contexts[wolfIndex]!.setOffline(false);
    await expect(
      wolfPage!.getByRole('button', { name: 'Revelar minha carta' }),
    ).toBeEnabled();
    await wolfPage!.unroute('**/api/rooms/*/commands');
    expect(acceptedWithoutResponse).toBe(1);

    for (const page of pages) {
      await expect(
        page.getByRole('heading', { name: 'Cada gesto pesa' }),
      ).toBeVisible({
        timeout: 85_000,
      });
    }

    for (const page of pages) {
      const voteButton = page.getByRole('button', { name: 'Confirmar voto' });
      if (!(await voteButton.isVisible())) continue;
      const selfIsWolf = page === wolfPage;
      const target = selfIsWolf
        ? page
            .locator('.target-option')
            .filter({ hasNotText: wolfName })
            .first()
        : page.getByLabel(wolfName);
      await target.click();
      await voteButton.click();
    }

    for (const page of pages) {
      await expect(
        page.getByRole('heading', { name: 'A Cidade venceu' }),
      ).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole('heading', { name: 'Papéis revelados' }),
      ).toBeVisible();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
