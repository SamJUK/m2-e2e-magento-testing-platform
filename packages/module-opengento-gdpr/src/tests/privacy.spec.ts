import { test } from '../fixtures/default';

/**
 * Opengento_Gdpr gives a customer the two rights that carry legal weight: to
 * receive a copy of their personal data, and to have it erased. Both are
 * requests rather than immediate operations — the export archive is built and
 * the erasure carried out asynchronously — so what these tests assert is that
 * the *request* is registered and reversible, which is the part that must work
 * whether or not the store's queue consumers are running.
 *
 * A fresh customer is registered per test, so nothing here depends on, or
 * leaves behind, shared state.
 */
test.describe('Opengento_Gdpr privacy', () => {
  test(
    'a guest asking for privacy settings is sent to sign in',
    { tag: ['@opengento-gdpr', '@privacy', '@negative', '@smoke'] },
    async ({ gdpr }) => {
      await gdpr.expectGuestIsSentToSignIn();
    },
  );

  test(
    'a signed-in customer is offered both a data export and an erasure',
    { tag: ['@opengento-gdpr', '@privacy', '@customer', '@smoke'] },
    async ({ gdpr }) => {
      await gdpr.registerCustomer();
      await gdpr.expectAccountNavOffersPrivacySettings();
      await gdpr.expectOffersExportAndErasure();
    },
  );

  test(
    'requesting a personal data export registers it',
    { tag: ['@opengento-gdpr', '@privacy', '@customer'] },
    async ({ gdpr }) => {
      await gdpr.registerCustomer();
      await gdpr.requestExportAndExpectItRegistered();
    },
  );

  // The whole point of the undo: an erasure request is destructive and the
  // module holds it pending so a customer who changes their mind can withdraw
  // it. Asserting both ends of the cycle is also what makes each assertion
  // falsifiable — the same page is asserted to be in two opposite states.
  test(
    'an erasure request can be raised and then undone',
    { tag: ['@opengento-gdpr', '@privacy', '@customer'] },
    async ({ gdpr }) => {
      const customer = await gdpr.registerCustomer();

      await gdpr.requestErasure(customer.password);
      await gdpr.expectErasureIsPending();

      await gdpr.undoErasure();
      await gdpr.expectNoErasurePending();
    },
  );
});
