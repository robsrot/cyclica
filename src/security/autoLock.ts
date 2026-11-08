/**
 * Auto-lock. iOS suspends JavaScript in the background, so timers alone are unreliable:
 * we record when the app was hidden and check the elapsed time when it becomes visible again,
 * plus an inactivity check while it's in the foreground.
 */
export function startAutoLock(getMinutes: () => number, onLock: () => void): () => void {
  let lastActivity = Date.now();
  let hiddenAt: number | null = null;

  const limitMs = () => getMinutes() * 60_000;

  const onActivity = () => {
    lastActivity = Date.now();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (getMinutes() === 0) onLock();
    } else if (hiddenAt !== null) {
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= limitMs()) onLock();
      else lastActivity = Date.now();
    }
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && getMinutes() > 0 && Date.now() - lastActivity >= limitMs()) {
      onLock();
    }
  }, 15_000);

  const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  for (const e of events) window.addEventListener(e, onActivity, { passive: true, capture: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onVisibility);

  return () => {
    window.clearInterval(interval);
    for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onVisibility);
  };
}
