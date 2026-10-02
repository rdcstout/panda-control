export const UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function automaticUpdateCheckDue({ enabled, lastAttempt, now = Date.now() }) {
  if (!enabled) return false;
  const previous = Number(lastAttempt);
  if (!Number.isFinite(previous) || previous <= 0) return true;
  return now - previous >= UPDATE_INTERVAL_MS;
}

export function shouldNotifyForUpdate(latestVersion, lastNotifiedVersion) {
  return Boolean(latestVersion) && latestVersion !== lastNotifiedVersion;
}
