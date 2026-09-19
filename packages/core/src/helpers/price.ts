import type { MergedData } from '../data';

/**
 * The price a store DISPLAYS for a seeded fixture's configured amount.
 *
 * Fixture prices are what the seed writes to the catalogue. Magento stores
 * those excluding tax unless the store says otherwise, so a store that
 * displays prices including tax shows the amount plus its tax rate and an
 * assertion against the raw fixture figure fails by exactly that rate.
 */
export function displayedPrice(amount: number, data: MergedData): number {
  if (!data.features.catalog.pricesDisplayIncludeTax) {
    return amount;
  }

  return amount * (1 + data.inputs.tax.rate);
}

/**
 * A net amount as it lands on a gross total.
 *
 * Magento computes a cart-rule discount on the net subtotal, so on a store
 * whose order total is shown including tax the total falls by the discount
 * plus its tax. Driven by the rate alone, because it is about two figures the
 * STORE renders on different bases, not about how fixture prices display.
 */
export function grossUp(amount: number, data: MergedData): number {
  return amount * (1 + data.inputs.tax.rate);
}
