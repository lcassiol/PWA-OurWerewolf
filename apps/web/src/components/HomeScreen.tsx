import { useState } from 'react';
import type { FormEvent } from 'react';

type HomeScreenProps = {
  busy: boolean;
  error: string | null;
  online: boolean;
  onCreate: (nickname: string) => Promise<void>;
  onJoin: (roomCode: string, nickname: string) => Promise<void>;
  onInstall: () => void;
};

export function HomeScreen({
  busy,
  error,
  online,
  onCreate,
  onJoin,
  onInstall,
}: HomeScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'create') await onCreate(nickname.trim());
    else await onJoin(roomCode.trim().toUpperCase(), nickname.trim());
  };

  return (
    <main className="home-shell" id="main-content">
      <header className="home-hero">
        <button className="install-link" type="button" onClick={onInstall}>
          Instalar no celular
        </button>
        <div className="moon-seal" aria-hidden="true">
          <span>V</span>
        </div>
        <p className="eyebrow">Uma crônica para 6 a 20 vozes</p>
        <h1>Vila da Lua</h1>
        <p className="hero-copy">
          Quando o sino cala, a vila precisa descobrir quem caminha sob outra
          pele.
        </p>
      </header>

      <section className="entry-card" aria-labelledby="entry-title">
        <div
          className="mode-tabs"
          role="group"
          aria-label="Escolha como participar"
        >
          <button
            type="button"
            aria-pressed={mode === 'create'}
            className={mode === 'create' ? 'is-active' : ''}
            onClick={() => setMode('create')}
          >
            Criar sala
          </button>
          <button
            type="button"
            aria-pressed={mode === 'join'}
            className={mode === 'join' ? 'is-active' : ''}
            onClick={() => setMode('join')}
          >
            Entrar com código
          </button>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          aria-describedby="entry-note entry-error"
        >
          <h2 id="entry-title">
            {mode === 'create' ? 'Acenda a primeira vela' : 'Encontre sua vila'}
          </h2>
          <p id="entry-note" className="muted-copy">
            Sem cadastro. Sua sessão fica ligada a este navegador.
          </p>

          {mode === 'join' ? (
            <label>
              Código da sala
              <input
                name="roomCode"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={4}
                pattern="[A-Za-z]{4}"
                placeholder="L U A R"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.replace(/[^a-z]/gi, ''))
                }
                required
              />
            </label>
          ) : null}

          <label>
            Seu apelido
            <input
              name="nickname"
              autoComplete="nickname"
              maxLength={24}
              placeholder="Como a vila chama você?"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
            />
          </label>

          <p id="entry-error" className="form-message" role="alert">
            {error ??
              (!online
                ? 'Você precisa estar online para entrar em uma partida.'
                : '')}
          </p>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !online}
          >
            {busy
              ? 'Abrindo os portões...'
              : mode === 'create'
                ? 'Criar minha vila'
                : 'Entrar na vila'}
          </button>
        </form>
      </section>

      <footer className="home-footer">
        <span aria-hidden="true">◆</span>
        Partida presencial, segredos digitais
        <span aria-hidden="true">◆</span>
      </footer>
    </main>
  );
}
