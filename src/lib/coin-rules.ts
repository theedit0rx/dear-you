export const FIRST_CARD_REWARD = 5;

/** Coins are an activity reward, not a contest, purchase, or premium benefit. */
export function rewardForActivity(activityKey: string, alreadyGranted: boolean): number {
  if (activityKey === "first-card" && !alreadyGranted) return FIRST_CARD_REWARD;
  return 0;
}
