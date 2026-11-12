import type { RoleId } from '@our-werewolf/shared';
import cupid from './assets/roles/cupid.svg';
import doctor from './assets/roles/doctor.svg';
import fool from './assets/roles/fool.svg';
import guardian from './assets/roles/guardian.svg';
import hunter from './assets/roles/hunter.svg';
import littleGirl from './assets/roles/little-girl.svg';
import mayor from './assets/roles/mayor.svg';
import seer from './assets/roles/seer.svg';
import villager from './assets/roles/villager.svg';
import werewolf from './assets/roles/werewolf.svg';
import witch from './assets/roles/witch.svg';

export const roleArtwork: Record<RoleId, string> = {
  werewolf,
  villager,
  hunter,
  seer,
  witch,
  doctor,
  fool,
  cupid,
  guardian,
  mayor,
  'little-girl': littleGirl,
};
