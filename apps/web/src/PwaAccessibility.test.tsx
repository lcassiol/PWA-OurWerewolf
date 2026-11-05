import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './components/HomeScreen';
import {
  canActivateUpdate,
  InstallGuide,
  type InstallState,
} from './components/InstallGuide';

const readProjectFile = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('política do service worker', () => {
  it('versiona o cache pela versão do pacote/build e exclui dados privados', () => {
    const worker = readProjectFile('../public/sw.js');
    const vite = readProjectFile('../vite.config.ts');
    const install = readProjectFile('./components/InstallGuide.tsx');

    expect(worker).toContain("searchParams.get('v')");
    expect(worker).not.toContain('vila-da-lua-shell-v1');
    expect(vite).toContain('process.env.npm_package_version');
    expect(vite).toContain('__APP_VERSION__');
    expect(install).toContain('encodeURIComponent(__APP_VERSION__)');
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("url.pathname.includes('/snapshot')");
    expect(worker).toContain("url.pathname.includes('/commands')");
    expect(worker).toMatch(/private\|no-store/);
  });
});

describe('estrutura mobile e instalação', () => {
  it('mantém landmarks, rótulos e ação principal em 320px', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320,
    });
    render(
      <HomeScreen
        busy={false}
        error={null}
        online
        onCreate={vi.fn()}
        onJoin={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Vila da Lua', level: 1 }),
    );
    expect(screen.getByLabelText('Seu apelido')).toBeRequired();
    expect(
      screen.getByRole('button', { name: 'Criar minha vila' }),
    ).toBeEnabled();
    const styles = readProjectFile('./styles.css');
    expect(styles).toContain('min-width: 320px');
    expect(styles).toContain('overflow-x: hidden');
    expect(styles).toContain(':focus-visible');
  });

  it('oferece orientação iOS, foco inicial e fechamento por teclado', async () => {
    const user = userEvent.setup();
    const setOpen = vi.fn();
    const state: InstallState = {
      open: true,
      setOpen,
      installPrompt: null,
      installed: false,
      isIos: true,
      updateWaiting: null,
      install: vi.fn(),
      activateUpdate: vi.fn(),
    };
    render(<InstallGuide state={state} />);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    expect(screen.getByText(/Compartilhar no Safari/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('não permite atualização durante decisão ou operação pendente', () => {
    expect(canActivateUpdate(true, false)).toBe(false);
    expect(canActivateUpdate(false, true)).toBe(false);
    expect(canActivateUpdate(false, false)).toBe(true);
  });

  it('fecha a orientação por clique fora sem roubar o clique interno', () => {
    const setOpen = vi.fn();
    render(
      <InstallGuide
        state={{
          open: true,
          setOpen,
          installPrompt: null,
          installed: false,
          isIos: false,
          updateWaiting: null,
          install: vi.fn(),
          activateUpdate: vi.fn(),
        }}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(setOpen).not.toHaveBeenCalled();
  });
});
