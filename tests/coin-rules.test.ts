import { describe, expect, it } from "vitest";
import { rewardForActivity } from "../src/lib/coin-rules";

describe("Love Coins activity policy", () => {
  it("rewards a first card once", () => {
    expect(rewardForActivity("first-card", false)).toBe(5);
    expect(rewardForActivity("first-card", true)).toBe(0);
  });

  it("never awards coins for competition entries or purchases", () => {
    expect(rewardForActivity("competition-entry", false)).toBe(0);
    expect(rewardForActivity("premium-purchase", false)).toBe(0);
  });
});
