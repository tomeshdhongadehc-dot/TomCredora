/** Sent on the window whenever a resume is downloaded or printed, so the page can offer to save it to an account. */
export const EXPORTED_EVENT = "arb:exported";

export const announceExport = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EXPORTED_EVENT));
};
