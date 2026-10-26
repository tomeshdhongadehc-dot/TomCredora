import { describe, expect, it } from "vitest";
import { ledgerKey, pendingConfirmations, reviewSchema, type ReviewState } from "@/lib/review-state";

const entry = (over = {}) => ({ roleId: "e1", position: 0, text: "AI text", original: "My text", reasons: ["New wording"], from: 0, needsMetric: false, status: "needs-confirmation" as const, ...over });
const review = (ledger = [entry()], resolved: string[] = []): ReviewState => ({ ledger, questions: [], resolved });
const bullets: Record<string, string[]> = { e1: ["AI text", "other"] };
const at = (id: string, i: number) => bullets[id]?.[i];

describe("pendingConfirmations", () => {
  it("lists flagged bullets that are still exactly as the AI wrote them", () => {
    expect(pendingConfirmations(review(), at)).toHaveLength(1);
  });
  it("is empty when there is no review, nothing is flagged, or the item was resolved", () => {
    expect(pendingConfirmations(null, at)).toEqual([]);
    expect(pendingConfirmations(review([entry({ status: "verified" })]), at)).toEqual([]);
    expect(pendingConfirmations(review([entry()], [ledgerKey(entry())]), at)).toEqual([]);
  });
  it("drops bullets the user edited (or removed) since: they own that text now", () => {
    expect(pendingConfirmations(review([entry({ text: "different" })]), at)).toEqual([]);
    expect(pendingConfirmations(review([entry({ position: 9 })]), at)).toEqual([]);
    expect(pendingConfirmations(review([entry({ roleId: "gone" })]), at)).toEqual([]);
  });
});

describe("reviewSchema (stored data is untrusted)", () => {
  it("accepts valid state and rejects tampered or oversized state", () => {
    expect(reviewSchema.safeParse(review()).success).toBe(true);
    expect(reviewSchema.safeParse({ ...review(), ledger: [entry({ status: "hacked" })] }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...review(), ledger: [entry({ text: "x".repeat(401) })] }).success).toBe(false);
    expect(reviewSchema.safeParse({ ledger: "nope" }).success).toBe(false);
    expect(reviewSchema.safeParse(null).success).toBe(false);
  });
});
