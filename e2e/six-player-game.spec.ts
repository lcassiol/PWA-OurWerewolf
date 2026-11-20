import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test('six mobile clients finish a complete game', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The complete multi-client flow runs once.',
  );
  test.setTimeout(180_000);

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

    await pages[0]!.getByRole('button', { name: 'Criar sala' }).click();
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
    await expect(
      pages[0]!.getByText('Alterações são salvas automaticamente.'),
    ).toBeVisible();

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
    await wolfPage!.getByRole('button', { name: 'Confirmar meu voto' }).click();
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
        timeout: 110_000,
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

test('two eliminated players use the afterlife while living players stay isolated', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The multi-client afterlife flow runs once.',
  );
  test.setTimeout(180_000);

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const names = [
    'Host',
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
  ];
  try {
    for (let index = 0; index < names.length; index += 1) {
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

    await pages[0]!.getByRole('button', { name: 'Criar sala' }).click();
    await pages[0]!.getByLabel('Seu apelido').fill(names[0]!);
    await pages[0]!.getByRole('button', { name: 'Criar minha vila' }).click();
    const codeButton = pages[0]!.getByRole('button', {
      name: /Compartilhar sala/,
    });
    await expect(codeButton).toBeVisible();
    const code = (await codeButton.textContent())?.match(/[A-Z]{4}/)?.[0];
    expect(code).toMatch(/^[A-Z]{4}$/);

    for (let index = 1; index < pages.length; index += 1) {
      await pages[index]!.getByRole('button', {
        name: 'Entrar com código',
      }).click();
      await pages[index]!.getByLabel('Código da sala').fill(code!);
      await pages[index]!.getByLabel('Seu apelido').fill(names[index]!);
      await pages[index]!.getByRole('button', {
        name: 'Entrar na vila',
      }).click();
    }
    await pages[0]!.getByLabel('Discussão diurna').selectOption('1');
    await expect(
      pages[0]!.getByText('Alterações são salvas automaticamente.'),
    ).toBeVisible();
    for (const page of pages)
      await page.getByRole('button', { name: 'Estou pronto' }).click();
    await pages[0]!.getByRole('button', { name: 'Começar a crônica' }).click();

    let wolfIndex = -1;
    for (let index = 0; index < pages.length; index += 1) {
      await pages[index]!.getByRole('button', {
        name: 'Revelar minha carta',
      }).click();
      if (
        await pages[index]!.getByRole('heading', {
          name: 'Lobisomem',
        }).isVisible()
      )
        wolfIndex = index;
    }
    expect(wolfIndex).toBeGreaterThanOrEqual(0);
    const wolfPage = pages[wolfIndex]!;
    const firstTarget = wolfPage.locator('.target-option').first();
    const firstDeadName = (
      await firstTarget.locator('.target-label > span').first().textContent()
    )?.trim();
    expect(firstDeadName).toBeTruthy();
    await firstTarget.click();
    await wolfPage.getByRole('button', { name: 'Confirmar meu voto' }).click();

    await expect(
      pages[0]!.getByRole('heading', { name: 'A praça toma a palavra' }),
    ).toBeVisible({
      timeout: 40_000,
    });
    let readied = 0;
    for (const page of pages) {
      const ready = page.getByRole('button', {
        name: 'Estou pronto para votar',
      });
      if (!(await ready.isVisible())) continue;
      await ready.click();
      readied += 1;
      if (readied === 3) break;
    }
    await expect(
      pages[0]!.getByRole('heading', { name: 'Cada gesto pesa' }),
    ).toBeVisible();

    const secondDeadIndex = names.findIndex(
      (name, index) => index !== wolfIndex && name !== firstDeadName,
    );
    const secondDeadName = names[secondDeadIndex]!;
    for (const [index, page] of pages.entries()) {
      const vote = page.getByRole('button', { name: 'Confirmar voto' });
      if (!(await vote.isVisible())) continue;
      const abstaining = index === secondDeadIndex;
      await page
        .getByLabel(abstaining ? 'Abster-se desta ação' : secondDeadName)
        .click();
      await page
        .getByRole('button', {
          name: abstaining ? 'Confirmar abstenção' : 'Confirmar voto',
        })
        .click();
    }
    for (const page of pages) {
      const acknowledge = page.getByRole('button', { name: 'OK, continuar' });
      if (!(await acknowledge.isVisible())) continue;
      await acknowledge.click();
    }

    await expect(wolfPage.getByLabel('Abster-se desta ação')).toBeVisible();
    await wolfPage.getByLabel('Abster-se desta ação').click();
    await wolfPage.getByRole('button', { name: 'Confirmar abstenção' }).click();
    const firstDeadPage = pages[names.indexOf(firstDeadName!)]!;
    const secondDeadPage = pages[secondDeadIndex]!;
    await expect(
      firstDeadPage.getByRole('heading', { name: 'Oráculo do Além' }),
    ).toBeVisible();
    await expect(
      secondDeadPage.getByRole('heading', { name: 'Oráculo do Além' }),
    ).toBeVisible();
    const mobileLayout = await secondDeadPage.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.afterlife-panel')!;
      const prediction = document.querySelector<HTMLElement>(
        '.afterlife-prediction',
      )!;
      const choice = document.querySelector<HTMLElement>('.afterlife-choice')!;
      const input = choice.querySelector<HTMLInputElement>('input')!;
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        predictionFits:
          prediction.getBoundingClientRect().right <=
          panel.getBoundingClientRect().right,
        choiceHeight: choice.getBoundingClientRect().height,
        inputWidth: input.getBoundingClientRect().width,
        gameGridCount: document.querySelectorAll('.game-grid').length,
      };
    });
    expect(mobileLayout.pageOverflow).toBe(false);
    expect(mobileLayout.predictionFits).toBe(true);
    expect(mobileLayout.choiceHeight).toBeGreaterThanOrEqual(44);
    expect(mobileLayout.inputWidth).toBeLessThanOrEqual(20);
    expect(mobileLayout.gameGridCount).toBe(0);

    await firstDeadPage.setViewportSize({ width: 1280, height: 900 });
    const desktopLayout = await firstDeadPage.evaluate(() => {
      const chat = document.querySelector<HTMLElement>('.afterlife-chat')!;
      const prediction = document.querySelector<HTMLElement>(
        '.afterlife-prediction',
      )!;
      const exile = document.querySelector<HTMLElement>(
        '.afterlife-exile-pick',
      )!;
      const wolves = document.querySelector<HTMLElement>(
        '.afterlife-wolf-pick',
      )!;
      const chatRect = chat.getBoundingClientRect();
      const predictionRect = prediction.getBoundingClientRect();
      const exileRect = exile.getBoundingClientRect();
      const wolvesRect = wolves.getBoundingClientRect();
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        alignedPanels: Math.abs(chatRect.top - predictionRect.top) < 2,
        predictionIsWider: predictionRect.width > chatRect.width,
        alignedPickGroups: Math.abs(exileRect.top - wolvesRect.top) < 2,
        separatePickColumns: wolvesRect.left > exileRect.left,
      };
    });
    expect(desktopLayout).toEqual({
      pageOverflow: false,
      alignedPanels: true,
      predictionIsWider: true,
      alignedPickGroups: true,
      separatePickColumns: true,
    });

    await firstDeadPage
      .getByLabel('Mensagem aos mortos')
      .fill('A lua ainda nos escuta.');
    await firstDeadPage.getByRole('button', { name: 'Enviar ao Além' }).click();
    await expect(
      secondDeadPage.getByText('A lua ainda nos escuta.'),
    ).toBeVisible();
    for (const deadPage of [firstDeadPage, secondDeadPage]) {
      const exileGroup = deadPage.getByRole('group', {
        name: 'Quem será o próximo expulso?',
      });
      await exileGroup.getByRole('radio').first().click();
      await deadPage
        .getByRole('button', { name: 'Confirmar previsões' })
        .click();
      await expect(
        deadPage.getByText('Previsões confirmadas pelo servidor.'),
      ).toBeVisible();
    }
    const livingPage = pages.find(
      (_page, index) =>
        index !== wolfIndex &&
        index !== names.indexOf(firstDeadName!) &&
        index !== secondDeadIndex,
    )!;
    await expect(
      livingPage.getByRole('heading', { name: 'Oráculo do Além' }),
    ).toHaveCount(0);

    await expect(
      livingPage.getByRole('heading', { name: 'A praça toma a palavra' }),
    ).toBeVisible({
      timeout: 40_000,
    });
    readied = 0;
    for (const page of pages) {
      const ready = page.getByRole('button', {
        name: 'Estou pronto para votar',
      });
      if (!(await ready.isVisible())) continue;
      await ready.click();
      readied += 1;
      if (readied === 3) break;
    }
    await expect(
      livingPage.getByRole('heading', { name: 'Cada gesto pesa' }),
    ).toBeVisible();
    for (const [index, page] of pages.entries()) {
      const vote = page.getByRole('button', { name: 'Confirmar voto' });
      if (!(await vote.isVisible())) continue;
      const abstaining = index === wolfIndex;
      await page
        .getByLabel(abstaining ? 'Abster-se desta ação' : names[wolfIndex]!)
        .click();
      await page
        .getByRole('button', {
          name: abstaining ? 'Confirmar abstenção' : 'Confirmar voto',
        })
        .click();
    }

    await expect(
      firstDeadPage.getByRole('heading', { name: 'Oráculos do Além' }),
    ).toBeVisible();
    await expect(
      secondDeadPage.getByRole('heading', { name: 'Oráculos do Além' }),
    ).toBeVisible();
    await expect(
      livingPage.getByRole('heading', { name: 'Oráculos do Além' }),
    ).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
