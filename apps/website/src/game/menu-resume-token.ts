export type MenuResumeToken = {
  /** Returns whether this call created the menu opening. */
  open: (wasPlaying: boolean) => boolean;
  /** Closes the current opening and reports whether it interrupted play. */
  consume: () => boolean;
};

/**
 * Records both the existence of one menu opening and whether it interrupted
 * active play. Reopening that same menu must not replace either answer after
 * the runtime has been suspended.
 */
export function createMenuResumeToken(): MenuResumeToken {
  let isOpen = false;
  let shouldResume = false;

  return {
    open(wasPlaying) {
      if (isOpen) return false;
      isOpen = true;
      shouldResume = wasPlaying;
      return true;
    },
    consume() {
      const result = shouldResume;
      isOpen = false;
      shouldResume = false;
      return result;
    },
  };
}
