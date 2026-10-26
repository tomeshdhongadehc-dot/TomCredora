import { z } from "zod";

/**
 * What the user still has to decide after an AI pass. Saved with the draft so unverified bullets can never
 * silently lose their warning by navigating between steps or reloading the page.
 */
export const ledgerEntrySchema = z.object({
  roleId: z.string().max(40),
  position: z.number().int().min(0).max(50),
  text: z.string().max(400),
  original: z.string().max(400).nullable(),
  reasons: z.array(z.string().max(300)).max(10),
  from: z.number().int().min(-1).max(50),
  needsMetric: z.boolean(),
  status: z.enum(["verified", "needs-confirmation"]),
});

export const reviewSchema = z.object({
  ledger: z.array(ledgerEntrySchema).max(100),
  questions: z.array(z.string().max(300)).max(10),
  /** `${roleId}:${position}` keys the user has already confirmed or reverted */
  resolved: z.array(z.string().max(80)).max(100),
});

export type ReviewState = z.infer<typeof reviewSchema>;
export type LedgerEntryState = z.infer<typeof ledgerEntrySchema>;

export const ledgerKey = (l: { roleId: string; position: number }) => `${l.roleId}:${l.position}`;

/** Bullets awaiting a decision. A bullet the user has since edited is theirs now, so it is no longer pending. */
export function pendingConfirmations(review: ReviewState | null, bulletAt: (roleId: string, position: number) => string | undefined): LedgerEntryState[] {
  if (!review) return [];
  const done = new Set(review.resolved);
  return review.ledger.filter((l) => l.status === "needs-confirmation" && !done.has(ledgerKey(l)) && bulletAt(l.roleId, l.position) === l.text);
}
