/**
 * Returns true if the account_id represents a Steam-anonymized (hidden) profile.
 * account_id 4294967295 = 0xFFFFFFFF = Steam's sentinel for private accounts.
 * Per D-10: when this returns true, skip ALL OpenDota API calls for this player.
 */
export function hiddenProfile(accountId: number): boolean {
  return accountId === 4294967295
}
