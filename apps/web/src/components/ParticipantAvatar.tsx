import type { AvatarId } from '@our-werewolf/shared';

export function ParticipantAvatar({
  avatarId,
  className,
}: {
  avatarId: AvatarId;
  className?: string;
}) {
  return (
    <span
      className={`player-avatar${className ? ` ${className}` : ''}`}
      data-avatar-id={avatarId}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" focusable="false">
        {avatarShape(avatarId)}
      </svg>
    </span>
  );
}

function avatarShape(avatarId: AvatarId) {
  switch (avatarId) {
    case 'moon':
      return (
        <>
          <circle cx="24" cy="24" r="13" />
          <path
            className="avatar-cutout"
            d="M30 12a15 15 0 0 0 0 24 13 13 0 1 1 0-24Z"
          />
        </>
      );
    case 'owl':
      return (
        <>
          <path d="m13 17 5-7 6 6 6-6 5 7v14l-11 7-11-7Z" />
          <circle className="avatar-cutout" cx="19" cy="23" r="4" />
          <circle className="avatar-cutout" cx="29" cy="23" r="4" />
          <path className="avatar-detail" d="m22 29 2 3 2-3" />
        </>
      );
    case 'fox':
      return (
        <>
          <path d="m10 11 10 6h8l10-6-4 23-10 6-10-6Z" />
          <path className="avatar-cutout" d="m15 18 7 4-6 4Zm18 0-7 4 6 4Z" />
          <path className="avatar-detail" d="m21 32 3 2 3-2" />
        </>
      );
    case 'stag':
      return (
        <>
          <path
            className="avatar-detail"
            d="M17 16 10 8m7 8-1-9m15 9 7-8m-7 8 1-9"
          />
          <path d="M16 15h16l-2 18-6 7-6-7Z" />
          <circle className="avatar-cutout" cx="20" cy="25" r="2" />
          <circle className="avatar-cutout" cx="28" cy="25" r="2" />
        </>
      );
    case 'raven':
      return (
        <>
          <path d="M12 31c2-15 10-22 24-17l-8 7 9 5-12 3 5 10H16Z" />
          <circle className="avatar-cutout" cx="27" cy="18" r="2" />
        </>
      );
    case 'cat':
      return (
        <>
          <path d="m12 12 9 6h6l9-6-2 22-10 6-10-6Z" />
          <circle className="avatar-cutout" cx="20" cy="26" r="2" />
          <circle className="avatar-cutout" cx="28" cy="26" r="2" />
          <path className="avatar-detail" d="M18 33h-8m20 0h8m-17-1 3 2 3-2" />
        </>
      );
    case 'bat':
      return (
        <>
          <path d="M24 17 15 9l-1 8-9 2 7 7-3 9 11-4 4 9 4-9 11 4-3-9 7-7-9-2-1-8Z" />
          <circle className="avatar-cutout" cx="21" cy="25" r="2" />
          <circle className="avatar-cutout" cx="27" cy="25" r="2" />
        </>
      );
    case 'bear':
      return (
        <>
          <circle cx="14" cy="15" r="6" />
          <circle cx="34" cy="15" r="6" />
          <circle cx="24" cy="26" r="15" />
          <circle className="avatar-cutout" cx="19" cy="24" r="2" />
          <circle className="avatar-cutout" cx="29" cy="24" r="2" />
          <ellipse className="avatar-cutout" cx="24" cy="32" rx="5" ry="3" />
        </>
      );
    case 'rabbit':
      return (
        <>
          <ellipse cx="18" cy="12" rx="5" ry="11" />
          <ellipse cx="30" cy="12" rx="5" ry="11" />
          <circle cx="24" cy="29" r="13" />
          <circle className="avatar-cutout" cx="20" cy="27" r="2" />
          <circle className="avatar-cutout" cx="28" cy="27" r="2" />
          <path className="avatar-detail" d="m21 34 3 2 3-2" />
        </>
      );
    case 'boar':
      return (
        <>
          <path d="m11 18 8-7 5 5 5-5 8 7-4 19H15Z" />
          <circle className="avatar-cutout" cx="20" cy="24" r="2" />
          <circle className="avatar-cutout" cx="28" cy="24" r="2" />
          <ellipse className="avatar-cutout" cx="24" cy="32" rx="7" ry="4" />
          <path className="avatar-detail" d="m17 32-4 4m18-4 4 4" />
        </>
      );
  }
}
