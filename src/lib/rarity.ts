export type RarityTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const TIER_COLOR: Record<RarityTier, string> = {
  0: '#8a8f99',
  1: '#8a8f99',
  2: '#b8c4d1',
  3: '#d8b24a',
  4: '#ef6a2a',
  5: '#3cc6c0',
  6: '#b37cf0',
};

const RARITIES: Record<string, [RarityTier, string]> = {
  none: [0, ''],
  promo: [0, 'Promo'],
  common: [1, 'Common'],
  uncommon: [2, 'Uncommon'],
  rare: [3, 'Rare'],
  'rare holo': [3, 'Holo'],
  'holo rare': [3, 'Holo'],
  'classic collection': [3, 'Classic'],
  'rare holo lv.x': [4, 'LV.X'],
  'rare prime': [4, 'Prime'],
  legend: [4, 'Legend'],
  'holo rare v': [4, 'V'],
  'holo rare vmax': [4, 'VMAX'],
  'holo rare vstar': [4, 'VSTAR'],
  'double rare': [4, 'RR'],
  'ultra rare': [4, 'UR'],
  'amazing rare': [4, 'Amazing'],
  'radiant rare': [4, 'Radiant'],
  'ace spec rare': [4, 'ACE SPEC'],
  'full art trainer': [4, 'FA Trainer'],
  'shiny rare': [4, 'Shiny'],
  'shiny rare v': [4, 'Shiny V'],
  'shiny rare vmax': [4, 'Shiny VMAX'],
  'illustration rare': [5, 'IR'],
  'special illustration rare': [6, 'SIR'],
  'hyper rare': [6, 'HR'],
  'secret rare': [6, 'SR'],
  'shiny ultra rare': [6, 'SUR'],
  'mega hyper rare': [6, 'MHR'],
  'mega attack rare': [6, 'MAR'],
  'black white rare': [6, 'BWR'],
  'futuristic rare': [6, 'Futuristic'],
  'pikachu rare': [6, 'Pikachu'],
  'rgb rare': [6, 'RGB'],
};

export function rarityInfo(rarity: string | null | undefined): { tier: RarityTier; label: string; color: string } | null {
  if (!rarity) return null;
  const hit = RARITIES[rarity.toLowerCase()];
  const [tier, label] = hit ?? [3 as RarityTier, rarity];
  if (!label) return null;
  return { tier, label, color: TIER_COLOR[tier] };
}

export const rarityTier = (rarity: string | null | undefined): RarityTier => rarityInfo(rarity)?.tier ?? 0;
