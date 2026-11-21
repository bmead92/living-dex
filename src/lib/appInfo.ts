import app from '../../app.json';

export const APP_NAME = app.expo.name;
export const APP_VERSION = app.expo.version;

export const USER_AGENT = `LivingDex/${APP_VERSION}`;

export const REPO_URL = 'https://github.com/bmead92/living-dex';
export const DONATE_URL: string | null = 'https://ko-fi.com/breechay';

export const FAN_CONTENT_NOTICE =
  'Living Dex is an unofficial fan app. It is not produced, endorsed, supported or affiliated with Nintendo, ' +
  'Creatures, GAME FREAK or The Pokémon Company. Card names and images are trademarks and copyrights of their owners.';

export const DATA_CREDITS = 'Card data, images and prices: TCGdex (TCGplayer, Cardmarket); Base Set Shadowless and 1st Edition prices: TCGCSV (TCGplayer). Not affiliated.';
