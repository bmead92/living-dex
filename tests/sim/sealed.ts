import type { SealedProduct } from '../../src/lib/sealed';
import type { SimSet } from './catalog';

export function simCatalog(set: SimSet): SealedProduct[] {
  const row = (suffix: string, low: number): SealedProduct => ({
    product_id: `sealed-${set.code.toLowerCase()}-${suffix.toLowerCase().replace(/\s+/g, '-')}`,
    set_code: set.code,
    name: `${set.name} ${suffix}`,
    low_price: low,
    price_market: low + 50,
    url: null,
  });
  return [
    row('Booster Pack', 449),
    row('Booster Box', 13999),
    row('Elite Trainer Box', 4999),
    row('Booster Bundle', 2699),
    row('Booster Box Case', 79999),
    row('Premium Collection', 3999),
  ];
}
