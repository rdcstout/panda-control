function versionParts(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i);
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), prerelease: match[4] ? match[4].split('.') : [] };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) throw new Error('Invalid release version.');
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function expectedStableAsset(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'Panda-Control-macOS-arm64.dmg';
  if (platform === 'win32' && arch === 'x64') return 'Panda-Control-Windows-x64.exe';
  if (platform === 'linux' && arch === 'x64') return 'Panda-Control-Linux-x86_64.AppImage';
  return null;
}

function releaseHasCompatibleAsset(assets, platform, arch) {
  const expected = expectedStableAsset(platform, arch);
  return Boolean(expected && Array.isArray(assets) && assets.some(asset => asset?.name === expected));
}

function isAllowedReleaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith('/rdcstout/panda-control/releases/');
  } catch (_) { return false; }
}

module.exports = {
  comparePrerelease,
  compareVersions,
  expectedStableAsset,
  isAllowedReleaseUrl,
  releaseHasCompatibleAsset,
  versionParts,
};
