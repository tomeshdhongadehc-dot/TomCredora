/** Names: a person can keep their full name in their profile and leave the middle name off their resumes. */

const words = (full: string) => full.trim().split(/\s+/).filter(Boolean);

/** "Asha Kumari Rao" -> "Asha Rao". A name of one or two words has no middle name, so it is left alone. */
export function withoutMiddle(full: string): string {
  const w = words(full);
  return w.length >= 3 ? `${w[0]} ${w[w.length - 1]}` : full.trim().replace(/\s+/g, " ");
}

export const hasMiddle = (full: string) => words(full).length >= 3;

/** The name as it appears on a resume, given the full name and the choice. */
export const resumeName = (full: string, hideMiddle: boolean) => (hideMiddle ? withoutMiddle(full) : full.trim().replace(/\s+/g, " "));
