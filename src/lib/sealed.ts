export interface SealedProduct {
  product_id: string;
  set_code: string;
  name: string;
  low_price: number | null;
  price_market: number | null;
  url: string | null;
}

export type ProductType = 'booster-pack' | 'booster-box' | 'etb' | 'booster-bundle' | 'other';

export function productType(name: string): ProductType {
  const n = name.toLowerCase();
  if (/\bcase\b|display|deck|tin|collection|blister|premium/.test(n)) return 'other';
  if (/elite trainer box/.test(n)) return 'etb';
  if (/booster bundle/.test(n)) return 'booster-bundle';
  if (/booster box/.test(n)) return 'booster-box';
  if (/booster( pack)?$/.test(n) || /booster pack/.test(n)) return 'booster-pack';
  return 'other';
}

export const isPackType = (t: ProductType) => t === 'booster-pack';
export const isBoxType = (t: ProductType) => t === 'booster-box' || t === 'etb' || t === 'booster-bundle';

export function packsIn(t: ProductType): number {
  switch (t) {
    case 'booster-box':
      return 36;
    case 'etb':
      return 9;
    case 'booster-bundle':
      return 6;
    default:
      return 1;
  }
}

export function cardsPerPack(_t: ProductType): number {
  return 10;
}

export const productPrice = (p: SealedProduct) => p.low_price ?? p.price_market;

export interface MatchInput {
  setCodes?: string[];
  want?: 'pack' | 'box' | 'any';
}

export interface Suggestion {
  product: SealedProduct;
  type: ProductType;
}

const TYPE_ORDER: ProductType[] = ['booster-pack', 'booster-box', 'etb', 'booster-bundle'];

export function productsForSet(catalog: SealedProduct[], setCode: string, want: MatchInput['want'] = 'any'): Suggestion[] {
  const code = setCode.toUpperCase();
  const out: Suggestion[] = [];
  for (const product of catalog) {
    if (product.set_code.toUpperCase() !== code) continue;
    const type = productType(product.name);
    if (type === 'other') continue;
    if (want === 'pack' && !isPackType(type)) continue;
    if (want === 'box' && !isBoxType(type)) continue;
    out.push({ product, type });
  }
  return out.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

export function suggestProducts(catalog: SealedProduct[], input: MatchInput, limit = 5): Suggestion[] {
  const out: Suggestion[] = [];
  for (const code of input.setCodes ?? []) out.push(...productsForSet(catalog, code, input.want));
  return out.slice(0, limit);
}

export function setCodesByCount(codes: string[]): string[] {
  const n = new Map<string, number>();
  for (const c of codes) n.set(c.toUpperCase(), (n.get(c.toUpperCase()) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
