const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const uuidScript = path.join(__dirname, 'stabilize-macos-executable-uuid.mjs');
  execFileSync(process.execPath, [uuidScript, appPath], { stdio: 'inherit' });
};
