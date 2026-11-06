import { avatarIds, type AvatarId } from '@our-werewolf/shared';
import { useEffect, useRef, useState } from 'react';
import { ParticipantAvatar } from './ParticipantAvatar';

const avatarNames: Record<AvatarId, string> = {
  moon: 'Lua',
  owl: 'Coruja',
  fox: 'Raposa',
  stag: 'Cervo',
  raven: 'Corvo',
  cat: 'Gato',
  bat: 'Morcego',
  bear: 'Urso',
  rabbit: 'Coelho',
  boar: 'Javali',
};

export function AvatarPicker({
  avatarId,
  nickname,
  className,
  disabled,
  onSelect,
}: {
  avatarId: AvatarId;
  nickname: string;
  className?: string;
  disabled: boolean;
  onSelect: (avatarId: AvatarId) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    selectedRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const select = async (nextAvatarId: AvatarId) => {
    setSelecting(true);
    try {
      await onSelect(nextAvatarId);
      close();
    } finally {
      setSelecting(false);
    }
  };

  return (
    <>
      <button
        className="avatar-picker-trigger"
        type="button"
        ref={triggerRef}
        aria-label={`Escolher avatar de ${nickname}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ParticipantAvatar
          avatarId={avatarId}
          {...(className ? { className } : {})}
        />
      </button>
      {open ? (
        <div
          className="avatar-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="avatar-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-picker-title"
          >
            <div className="avatar-picker-heading">
              <div>
                <p className="eyebrow">Sua marca na vila</p>
                <h2 id="avatar-picker-title">Escolha seu avatar</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar escolha de avatar"
                onClick={close}
              >
                ×
              </button>
            </div>
            <div
              className="avatar-picker-grid"
              role="group"
              aria-label="Avatares"
            >
              {avatarIds.map((option) => (
                <button
                  className={
                    option === avatarId
                      ? 'avatar-option is-selected'
                      : 'avatar-option'
                  }
                  type="button"
                  key={option}
                  ref={option === avatarId ? selectedRef : undefined}
                  aria-pressed={option === avatarId}
                  disabled={selecting}
                  onClick={() => void select(option)}
                >
                  <ParticipantAvatar avatarId={option} />
                  <span>{avatarNames[option]}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
