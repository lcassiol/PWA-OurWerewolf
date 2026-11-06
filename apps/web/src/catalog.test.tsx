import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { gameRuleCatalog, roleCatalog } from './catalog';
import { LobbyScreen } from './components/LobbyScreen';
import { makeSnapshot } from './test/fixtures';
import { themeCatalog } from './themeCatalog';

describe('catálogo de regras', () => {
  it('documenta os onze papéis e as interações críticas em um catálogo', () => {
    expect(Object.keys(roleCatalog)).toHaveLength(11);
    for (const role of Object.values(roleCatalog)) {
      expect(role.targeting.length).toBeGreaterThan(10);
      expect(role.rules.length).toBeGreaterThan(0);
    }
    expect(roleCatalog.witch.rules.join(' ')).toMatch(/somente uma/i);
    expect(roleCatalog.cupid.rules.join(' ')).toMatch(/cadeia inteira/i);
    expect(gameRuleCatalog.resolutionPriority.join(' ')).toMatch(/Guardião/i);
    expect(gameRuleCatalog.specialVictories.join(' ')).toMatch(/Bobo/i);
  });

  it('usa somente as cinco paletas definidas para os temas', () => {
    expect(Object.values(themeCatalog)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'blue-moon',
          background: '#0B1020',
          panel: '#1B2942',
          primary: '#759CC9',
          accent: '#D4AF64',
          text: '#F3EBDD',
        }),
        expect.objectContaining({
          id: 'autumn-legend',
          background: '#231A16',
          panel: '#49362C',
          primary: '#B7653C',
          accent: '#D9AD61',
          text: '#F5ECD9',
        }),
      ]),
    );
    expect(Object.keys(themeCatalog)).toHaveLength(5);
  });

  it('expõe as regras completas também para quem não é anfitrião', async () => {
    const user = userEvent.setup();
    const snapshot = makeSnapshot({
      host: null,
      private: { ...makeSnapshot().private, playerId: 'p2' },
    });
    render(
      <LobbyScreen
        snapshot={snapshot}
        network="connected"
        busy={false}
        message={null}
        onReady={vi.fn()}
        onAvatarChange={vi.fn()}
        onSettings={vi.fn()}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Consultar regras dos 11 papéis'));
    expect(screen.getByRole('heading', { name: 'Bruxa' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Prioridade da resolução' }),
    ).toBeVisible();
    expect(screen.getByText(/somente uma das duas/i)).toBeVisible();
  });
});
