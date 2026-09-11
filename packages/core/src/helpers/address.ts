/**
 * A city name Magento will accept, from any faker locale.
 *
 * Magento validates the city field against `A-Z a-z 0-9 - ' space` and rejects
 * anything else with "Invalid City. Please use A-Z, a-z, 0-9, -, ', spaces".
 * faker's en_GB city data produces a "St." prefix about 3% of the time, so a
 * raw `faker.location.city()` fails roughly one address run in thirty — and it
 * fails as a store rejecting a valid-looking address, which reads as a bug in
 * the store rather than in the test data.
 *
 * Takes the faker instance rather than importing one, because specs pick their
 * own locale (`faker` vs `fakerEN_GB`) and the generated city has to match the
 * country the rest of the address is for.
 */
export function cityName(faker: { location: { city: () => string } }): string {
  return faker.location
    .city()
    .replace(/[^A-Za-z0-9\-' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
