import type { ThemeId } from '@our-werewolf/shared';
import autumnLegendImage from './assets/themes/autumn-legend.jpg';
import bloodMoonImage from './assets/themes/blood-moon.jpg';
import blueMoonImage from './assets/themes/blue-moon.jpg';
import cursedForestImage from './assets/themes/cursed-forest.jpg';
import spiritVeilImage from './assets/themes/spirit-veil.jpg';

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  article: 'a' | 'o';
  atmosphere: string;
  image: string;
  background: string;
  panel: string;
  primary: string;
  accent: string;
  text: string;
};

export const themeCatalog: Record<ThemeId, ThemeDefinition> = {
  'blue-moon': {
    id: 'blue-moon',
    name: 'Lua Azul',
    article: 'a',
    atmosphere: 'Mistério clássico',
    image: blueMoonImage,
    background: '#0B1020',
    panel: '#1B2942',
    primary: '#759CC9',
    accent: '#D4AF64',
    text: '#F3EBDD',
  },
  'cursed-forest': {
    id: 'cursed-forest',
    name: 'Floresta Maldita',
    article: 'a',
    atmosphere: 'Fantasia e natureza',
    image: cursedForestImage,
    background: '#0D1915',
    panel: '#203D32',
    primary: '#6F9472',
    accent: '#C49A52',
    text: '#EEE8D5',
  },
  'blood-moon': {
    id: 'blood-moon',
    name: 'Lua de Sangue',
    article: 'a',
    atmosphere: 'Terror e tensão',
    image: bloodMoonImage,
    background: '#190F16',
    panel: '#3B1D2B',
    primary: '#9E354A',
    accent: '#C48A68',
    text: '#F2E4DC',
  },
  'spirit-veil': {
    id: 'spirit-veil',
    name: 'Véu dos Espíritos',
    article: 'o',
    atmosphere: 'Magia e sobrenatural',
    image: spiritVeilImage,
    background: '#151126',
    panel: '#30244A',
    primary: '#8E77BF',
    accent: '#68BDB1',
    text: '#F0EAF8',
  },
  'autumn-legend': {
    id: 'autumn-legend',
    name: 'Lenda de Outono',
    article: 'a',
    atmosphere: 'Folclore e aconchego',
    image: autumnLegendImage,
    background: '#231A16',
    panel: '#49362C',
    primary: '#B7653C',
    accent: '#D9AD61',
    text: '#F5ECD9',
  },
};
