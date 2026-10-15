/**
 * Seat-aware weighted lottery selection.
 *
 * Each entry carries a fractional `score` (priority weight) and a `seats` cost
 * (1 for a solo entrant, 2 for a +1 pair).  The algorithm draws entries one at a
 * time, proportional to score, until `availableSeats` are exhausted.  If only
 * entries that need more seats than remain are left, the loop stops — those slots
 * go unfilled rather than being split.
 *
 * Mutates `pool` (removes selected entries in-place).
 */

export type RegistrationRef = {
  registration: { id: string };
  user: { id: string; name: string | null; email: string | null };
};

export type LotteryEntry =
  | { score: number; seats: 1; isPair: false; reg: RegistrationRef }
  | { score: number; seats: 2; isPair: true; inviterReg: RegistrationRef; inviteeReg: RegistrationRef };

export type ScoredRegistration = RegistrationRef & { score: number };

/**
 * Build a pair-aware lottery pool from scored registrations and accepted pairings.
 *
 * If a pairing exists where both inviter and invitee are in `eligibleRegIds`,
 * they enter as a single 2-seat entry using the inviter's score.  All remaining
 * eligible registrations enter as solo 1-seat entries.
 */
export function buildLotteryPool(
  scored: ScoredRegistration[],
  pairings: { inviterRegistrationId: string; inviteeRegistrationId: string }[],
  eligibleRegIds: Set<string>,
): LotteryEntry[] {
  const pool: LotteryEntry[] = [];
  const processedRegIds = new Set<string>();

  for (const pairing of pairings) {
    const inviterEntry = scored.find(e => e.registration.id === pairing.inviterRegistrationId);
    const inviteeEntry = scored.find(e => e.registration.id === pairing.inviteeRegistrationId);
    if (inviterEntry && inviteeEntry &&
        eligibleRegIds.has(pairing.inviterRegistrationId) &&
        eligibleRegIds.has(pairing.inviteeRegistrationId)) {
      pool.push({ score: inviterEntry.score, seats: 2, isPair: true, inviterReg: inviterEntry, inviteeReg: inviteeEntry });
      processedRegIds.add(pairing.inviterRegistrationId);
      processedRegIds.add(pairing.inviteeRegistrationId);
    }
  }

  for (const entry of scored) {
    if (!processedRegIds.has(entry.registration.id)) {
      pool.push({ score: entry.score, seats: 1, isPair: false, reg: entry });
    }
  }

  return pool;
}

export function weightedSelectWithSeats(
  pool: LotteryEntry[],
  availableSeats: number,
): LotteryEntry[] {
  const selected: LotteryEntry[] = [];
  let seatsLeft = availableSeats;

  while (seatsLeft > 0 && pool.length > 0) {
    const fittable = pool.filter(e => e.seats <= seatsLeft);
    if (fittable.length === 0) break; // only pairs remain and only 1 seat left

    const totalWeight = fittable.reduce((sum, e) => sum + e.score, 0);
    let r = Math.random() * totalWeight;
    let picked = fittable[fittable.length - 1]; // fallback to last (handles float rounding)
    for (const e of fittable) {
      r -= e.score;
      if (r <= 0) { picked = e; break; }
    }

    selected.push(picked);
    seatsLeft -= picked.seats;
    pool.splice(pool.indexOf(picked), 1);
  }

  return selected;
}
