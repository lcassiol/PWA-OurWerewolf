import type { RoleId } from '@our-werewolf/shared';
import alphaWolfIcon from '../assets/roleIcons/alpha-wolf.png';
import cupidIcon from '../assets/roleIcons/cupid.png';
import doctorIcon from '../assets/roleIcons/doctor.png';
import foolIcon from '../assets/roleIcons/fool.png';
import guardianIcon from '../assets/roleIcons/guardian.png';
import hunterIcon from '../assets/roleIcons/hunter.png';
import littleGirlIcon from '../assets/roleIcons/little-girl.png';
import mayorIcon from '../assets/roleIcons/mayor.png';
import necromancerIcon from '../assets/roleIcons/necromancer.png';
import seerIcon from '../assets/roleIcons/seer.png';
import witchIcon from '../assets/roleIcons/witch.png';
import { roleCatalog } from '../catalog';

export const roleIcons: Partial<Record<RoleId, string>> = {
  'alpha-wolf': alphaWolfIcon,
  cupid: cupidIcon,
  doctor: doctorIcon,
  fool: foolIcon,
  guardian: guardianIcon,
  hunter: hunterIcon,
  'little-girl': littleGirlIcon,
  mayor: mayorIcon,
  necromancer: necromancerIcon,
  seer: seerIcon,
  witch: witchIcon,
};

export function RoleIcon({
  roleId,
  className,
}: {
  roleId: RoleId;
  className: string;
}) {
  const icon = roleIcons[roleId];

  return (
    <span className={className} aria-hidden="true" data-role-icon={roleId}>
      {icon ? <img src={icon} alt="" /> : roleCatalog[roleId].mark}
    </span>
  );
}
