import type { RoleArtworkSetId, RoleId } from '@our-werewolf/shared';
import cartoonAlphaWolf from './assets/roles/cartoon/Pompous Alpha Werewolf With Chicken Scepter-2.png';
import cartoonCupid from './assets/roles/cartoon/Moonlit Cupid’s Ribbon Tangle-11.png';
import cartoonDoctor from './assets/roles/cartoon/The Overzealous Teddy Bear Doctor-5.png';
import cartoonFool from './assets/roles/cartoon/The Teacup-Topped Moonlit Jester-6.png';
import cartoonGuardian from './assets/roles/cartoon/The Colander-Helmed Moon Shield Guardian-10.png';
import cartoonHunter from './assets/roles/cartoon/The Moustached Hunter’s Hat Bird-3.png';
import cartoonLittleGirl from './assets/roles/cartoon/Periscope Girl and Hooded Cat-7.png';
import cartoonMayor from './assets/roles/cartoon/Pompous Mayor, Endless Scroll-8.png';
import cartoonSeer from './assets/roles/cartoon/Bewildered Seer and the Crystal Duck-4.png';
import cartoonVillager from './assets/roles/cartoon/Moonlit Farmer and Giant Turnip-12.png';
import cartoonWerewolf from './assets/roles/cartoon/Guilty Werewolf in Sheep Disguise-1.png';
import cartoonWitch from './assets/roles/cartoon/witch.png';
import realisticAlphaWolf from './assets/roles/realistics/Moonlit Alpha Werewolf-2.png';
import realisticCupid from './assets/roles/realistics/Winged Matchmaker of the Moonlit Garden-8.png';
import realisticDoctor from './assets/roles/realistics/The Moonlit Village Healer-6.png';
import realisticFool from './assets/roles/realistics/Moonlit Village Jester-5.png';
import realisticGuardian from './assets/roles/realistics/Moonlit Village Guardian-7.png';
import realisticHunter from './assets/roles/realistics/Moonlit Village Hunter-3.png';
import realisticLittleGirl from './assets/roles/realistics/Moonlit Girl Behind the Shutter-10.png';
import realisticMayor from './assets/roles/realistics/The Moonlit Village Mayor-9.png';
import realisticSeer from './assets/roles/realistics/Moonlit seer and crystal orb-4.png';
import realisticVillager from './assets/roles/realistics/Moonlit Village Farmer-11.png';
import realisticWerewolf from './assets/roles/realistics/Moonlit Alley Werewolf.png';
import realisticWitch from './assets/roles/realistics/Moonlit Witch and Healing Potions-1.png';

export const roleArtwork: Record<RoleArtworkSetId, Record<RoleId, string>> = {
  cartoon: {
    werewolf: cartoonWerewolf,
    'alpha-wolf': cartoonAlphaWolf,
    villager: cartoonVillager,
    hunter: cartoonHunter,
    seer: cartoonSeer,
    witch: cartoonWitch,
    doctor: cartoonDoctor,
    fool: cartoonFool,
    cupid: cartoonCupid,
    guardian: cartoonGuardian,
    mayor: cartoonMayor,
    'little-girl': cartoonLittleGirl,
  },
  realistic: {
    werewolf: realisticWerewolf,
    'alpha-wolf': realisticAlphaWolf,
    villager: realisticVillager,
    hunter: realisticHunter,
    seer: realisticSeer,
    witch: realisticWitch,
    doctor: realisticDoctor,
    fool: realisticFool,
    cupid: realisticCupid,
    guardian: realisticGuardian,
    mayor: realisticMayor,
    'little-girl': realisticLittleGirl,
  },
};
