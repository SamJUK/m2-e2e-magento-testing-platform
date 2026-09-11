import { expect, type Locator } from '@playwright/test';

/**
 * Money parsing for storefront assertions.
 *
 * Price rendering varies far more than the numbers do: the currency symbol can
 * lead or trail, thousands can be grouped with `,`, `.`, a space, a narrow
 * no-break space or an apostrophe, and the decimal separator is `.` or `,`
 * depending on locale. Asserting on price *strings* therefore couples a test to
 * one store's formatting; asserting on the parsed *number* does not.
 */

/**
 * Parses a rendered price into a number.
 *
 * Handles `$34.00`, `34,00 €`, `1 234,56 kr`, `CHF 1'234.56`, `£1,234.56` and
 * parenthesised or minus-signed negatives. Returns `NaN` when there is no
 * number to read, so callers can assert on that rather than silently comparing
 * against a coerced zero.
 */
export function parseMoney(text: string | null | undefined): number {
  if (text == null) return NaN;
  const raw = String(text).trim();
  if (!raw) return NaN;

  const negative = raw.includes('-') || /^\(.*\)$/.test(raw);

  // Everything that is not a digit or a `.`/`,` is either a currency marker or
  // a grouping character (space, NBSP, narrow NBSP, apostrophe) — drop it all.
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return NaN;

  const hasComma = digits.includes(',');
  const hasDot = digits.includes('.');
  let normalised = digits;

  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal one: `1.234,56` vs `1,234.56`.
    const decimalSep = digits.lastIndexOf(',') > digits.lastIndexOf('.') ? ',' : '.';
    const groupSep = decimalSep === ',' ? '.' : ',';
    normalised = digits.split(groupSep).join('').replace(decimalSep, '.');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const parts = digits.split(sep);
    const tail = parts[parts.length - 1];
    // A single separator with exactly three digits after it is grouping
    // (`1,234` / `1.234`), not a decimal point. More than one separator is
    // always grouping (`1.234.567`).
    normalised = parts.length > 2 || tail.length === 3 ? parts.join('') : parts.join('.');
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
}

/**
 * Reads one money value out of the DOM and asserts it actually parsed.
 *
 * Stores configured to show both inc- and exc-VAT prices render two price nodes
 * per amount, so this reads a **single** element rather than the locator's
 * combined text — `$34.00$40.80` parses to neither price.
 *
 * It reads the first *visible* match, not simply the first: dual-price themes
 * commonly render the variant the customer isn't shown (inc- or exc-VAT
 * depending on the store's display setting) as a hidden node that comes first
 * in the DOM. Reading it would either fail the visibility check or compare an
 * exc-VAT figure against an inc-VAT total. Callers stay like-for-like because
 * they all follow the same rule.
 */
export async function readMoney(locator: Locator, description = 'price'): Promise<number> {
  const first = locator.filter({ visible: true }).first();
  await expect(first, `${description} is rendered`).toBeVisible({ timeout: 15_000 });
  const text = await first.textContent();
  const value = parseMoney(text);
  expect(value, `${description} is a number (read ${JSON.stringify(text)})`).not.toBeNaN();
  return value;
}

/**
 * Reads every money value matched by a locator, in DOM order.
 * Unparseable entries are dropped, so callers should assert on the length.
 *
 * Visible matches only, for the same reason as `readMoney`: on a store showing
 * both inc- and exc-VAT prices, counting the hidden variant too would return
 * two entries per product and break any ordering assertion made over the list.
 */
export async function readAllMoney(locator: Locator): Promise<number[]> {
  const texts = await locator.filter({ visible: true }).allTextContents();
  return texts.map(parseMoney).filter((n) => !Number.isNaN(n));
}
