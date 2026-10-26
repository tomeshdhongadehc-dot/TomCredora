/**
 * A tiny in-page event hub that connects the data hooks (which own the autosave) with the sync manager, without
 * either importing the other. All client-side; every function is a no-op until something subscribes.
 */
type Fn = () => void;
const make = () => {
  const set = new Set<Fn>();
  return { add: (f: Fn) => (set.add(f), () => void set.delete(f)), run: () => set.forEach((f) => f()), size: () => set.size };
};

const changed = make();
const flushers = make();
const synced = make();

/** The hooks call this after they have written to storage. */
export const notifyLocalChange = () => changed.run();
export const onLocalChange = changed.add;

/** Hooks register a "write any pending edit to storage now" function; sync calls them all before it reads. */
export const registerFlush = flushers.add;
export const flushAll = () => flushers.run();

/** Sync calls this after it changed what is in storage; the hooks then reload from storage. */
export const emitSynced = () => synced.run();
export const onSynced = synced.add;
