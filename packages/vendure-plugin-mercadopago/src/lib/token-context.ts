/**
 * Additional authenticated data for the tokens of an account. Binding the ciphertext to the
 * account (not to a store) means a token copied to another account's row fails to decrypt, and a
 * store can change accounts without re-encrypting anything.
 */
export const accountAccessContext = (mpUserId: string) => `mp-account:${mpUserId}:access`;
export const accountRefreshContext = (mpUserId: string) => `mp-account:${mpUserId}:refresh`;
