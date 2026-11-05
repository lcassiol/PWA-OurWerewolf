import { useEffect, useRef, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  installPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  isIos: boolean;
  updateWaiting: ServiceWorker | null;
  install: () => Promise<void>;
  activateUpdate: () => void;
};

export function usePwaInstall(): InstallState {
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState<ServiceWorker | null>(
    null,
  );
  const explicitUpdate = useRef(false);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);

    if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
      return () =>
        window.removeEventListener('beforeinstallprompt', beforeInstall);
    }

    const controllerChange = () => {
      if (explicitUpdate.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      controllerChange,
    );
    void navigator.serviceWorker
      .register(
        `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`,
      )
      .then((registration) => {
        if (registration.waiting) setUpdateWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setUpdateWaiting(worker);
            }
          });
        });
      });

    return () => {
      explicitUpdate.current = false;
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        controllerChange,
      );
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setOpen(false);
  };

  const activateUpdate = () => {
    explicitUpdate.current = true;
    updateWaiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  return {
    open,
    setOpen,
    installPrompt,
    installed: standalone,
    isIos,
    updateWaiting,
    install,
    activateUpdate,
  };
}

export function InstallGuide({ state }: { state: InstallState }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const { open, setOpen } = state;

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => state.setOpen(false)}
    >
      <section
        className="install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button close-button"
          ref={closeButton}
          type="button"
          onClick={() => state.setOpen(false)}
          aria-label="Fechar"
        >
          ×
        </button>
        <p className="eyebrow">Leve a vila com você</p>
        <h2 id="install-title">Instalar Vila da Lua</h2>
        {state.installed ? (
          <p>Você já está usando a versão instalada.</p>
        ) : state.installPrompt ? (
          <>
            <p>
              Abra o jogo em uma janela própria, direto da sua tela inicial.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void state.install()}
            >
              Instalar agora
            </button>
          </>
        ) : state.isIos ? (
          <ol className="install-steps">
            <li>Toque em Compartilhar no Safari.</li>
            <li>Escolha “Adicionar à Tela de Início”.</li>
            <li>Confirme em “Adicionar”.</li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>Abra o menu do navegador.</li>
            <li>Escolha “Instalar app” ou “Adicionar à tela inicial”.</li>
            <li>Confirme a instalação.</li>
          </ol>
        )}
        <p className="fine-print">
          A estrutura abre offline, mas partidas e segredos sempre exigem
          conexão.
        </p>
      </section>
    </div>
  );
}

export function canActivateUpdate(
  decisionPending: boolean,
  busy: boolean,
): boolean {
  return !decisionPending && !busy;
}
