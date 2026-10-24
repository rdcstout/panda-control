import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const networkSource = await readFile(new URL('../electron/network.cjs', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const packageConfig = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const macReleaseScript = await readFile(new URL('../scripts/build-release-mac.sh', import.meta.url), 'utf8');
const macSignScript = await readFile(new URL('../scripts/sign-mac.cjs', import.meta.url), 'utf8');
const macAfterPack = await readFile(new URL('../scripts/after-pack.cjs', import.meta.url), 'utf8');
const macUuidScript = await readFile(new URL('../scripts/stabilize-macos-executable-uuid.mjs', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preloadSource = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const windowGeometrySource = await readFile(new URL('../electron/windowGeometry.cjs', import.meta.url), 'utf8');
const thirdPartyNotices = await readFile(new URL('../docs/THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

test('device drafts carry a product discriminator before cross-product rendering', () => {
  assert.match(appSource, /product: 'status'/);
  assert.match(appSource, /product: 'breath'/);
  assert.match(appSource, /product: 'control-vent'/);
  assert.match(appSource, /draft\.product !== selected\.product/);
});

test('live polling uses current dirty state and does not overwrite unsaved edits', () => {
  assert.match(appSource, /const dirtyRef = useRef\(dirty\)/);
  assert.match(appSource, /updateDraft \|\| !dirtyRef\.current/);
  assert.match(appSource, /isLatestDeviceRequest\(requestId, latestReadRef\.current\.get\(device\.id\)\)/);
  assert.match(appSource, /ownsActiveDraft\(requestKey, selectedKeyRef\.current\)/);
  assert.match(appSource, /\[selectedKey, refresh\]/);
});

test('removed devices stay ignored by automatic scans and can be explicitly restored', () => {
  assert.match(appSource, /panda-control-removed-devices-v1/);
  assert.match(appSource, /incoming\.filter\(device => !removedIds\.has\(device\.id\) && !removedIds\.has\(device\.hardwareId\)\)/);
  assert.match(appSource, /next\.delete\(device\.id\)/);
  assert.match(appSource, /removed\.hardwareId/);
  assert.match(appSource, /Remove Device/);
});

test('Panda Control Vent writes include the firmware local-control headers', () => {
  assert.match(networkSource, /'X-Dragon-Auth': 'web'/);
  assert.match(networkSource, /'X-DragonBreath-Auth': 'web'/);
});

test('Panda Control Vent advanced automation reads and writes material rules', () => {
  assert.match(networkSource, /httpJson\(target, '\/api\/v2\/filament'\)/);
  assert.match(networkSource, /httpJson\(target, '\/api\/v2\/filament', \{ method: 'POST'/);
  assert.match(appSource, /label="Advanced automation"/);
  assert.match(appSource, /automation\.openLabel/);
  assert.match(appSource, /automation\.sealLabel/);
  assert.match(appSource, /automation\.closeLabel/);
  assert.match(appSource, /automation\.materialHelp/);
  assert.match(appSource, /commands\.push\(\{ filament:/);
});

test('Panda Control Vent polling preserves the embedded web interface connection budget', () => {
  assert.match(networkSource, /CONTROL_VENT_CONFIG_TTL_MS = 15000/);
  assert.match(networkSource, /controlVentReadInFlight\.has\(target\)/);
  assert.match(networkSource, /const lighting = await httpJson\(target, '\/api\/v2\/lighting'\)/);
  assert.match(networkSource, /const settings = await httpJson\(target, '\/api\/v2\/settings'\)/);
  assert.match(networkSource, /const filament = await httpJson\(target, '\/api\/v2\/filament'\)/);
  assert.doesNotMatch(networkSource, /Promise\.all\(\[\s*httpJson\(target, '\/api\/v2\/state'/);
  assert.match(networkSource, /collectControlVentState\(target, \{ forceConfig: true \}\)/);
});

test('Panda Control Vent matches firmware labels and keeps cooldown controls in advanced mode', () => {
  assert.match(appSource, /\{advanced && <section className="section-block cooldown-section"/);
  assert.match(appSource, /automation\.openLabel/);
  assert.match(appSource, /automation\.closeLabel/);
  assert.doesNotMatch(appSource, /Keep Chamber Sealed|Close After Cooldown/);
  assert.match(appSource, /Following the active printer and automatic policy\./);
});

test('the About control does not crowd the device and online status toolbar', () => {
  assert.match(appSource, /className="brand-about-button"/);
  const toolbar = appSource.match(/<div className="toolbar-actions">([\s\S]*?)<\/div>\s*<\/header>/)?.[1] || '';
  assert.doesNotMatch(toolbar, /About and updates/);
});

test('full network discovery runs only from explicit user actions', () => {
  assert.doesNotMatch(appSource, /useEffect\(\(\) => \{ scan\(\); \}, \[\]\)/);
  assert.match(appSource, /onClick=\{scan\}/);
});

test('the scalable app remains vertically scrollable without exposing a floating scrollbar', () => {
  assert.match(stylesSource, /\.app-shell[\s\S]*overflow-y: auto;/);
  assert.match(stylesSource, /scrollbar-width: none;/);
  assert.match(stylesSource, /\.app-shell::\-webkit-scrollbar \{ display: none; width: 0; height: 0; \}/);
  assert.doesNotMatch(stylesSource, /scrollbar-gutter: stable/);
});

test('macOS packages are re-signed with stable identities and declare Local Network access', () => {
  assert.match(packageConfig.scripts['dist:mac'], /build-release-mac\.sh/);
  assert.match(packageConfig.build.mac.extendInfo.NSLocalNetworkUsageDescription, /local network/i);
  assert.equal(packageConfig.build.mac.hardenedRuntime, true);
  assert.match(packageConfig.build.mac.identity, /^[A-F0-9]{40}$/);
  assert.equal(packageConfig.build.mac.sign, 'scripts/sign-mac.cjs');
  assert.match(macSignScript, /identityValidation: false/);
  assert.match(macAfterPack, /stabilize-macos-executable-uuid\.mjs/);
  assert.match(macReleaseScript, /notarytool submit/);
  assert.match(macReleaseScript, /stapler staple/);
  assert.match(macReleaseScript, /spctl --assess/);
  assert.match(macReleaseScript, /TeamIdentifier=W3WPVL2V32/);
  assert.match(macUuidScript, /LC_UUID/);
  assert.match(macUuidScript, /Panda Control:\$\{bundleId\}/);
});

test('the Add-device dialog offers honest macOS Local Network permission recovery', () => {
  assert.match(appSource, /deviceApi\.platform === 'darwin'/);
  assert.match(appSource, /Can’t find your devices\?/);
  assert.match(appSource, /select Local Network/);
  assert.match(appSource, /turn Panda Control off and back on/);
  assert.match(appSource, /Open Privacy &amp; Security/);
  assert.match(preloadSource, /openPrivacySettings/);
  assert.match(mainSource, /com\.apple\.settings\.PrivacySecurity\.extension/);
  assert.doesNotMatch(mainSource, /Privacy_LocalNetwork/);
});

test('dialogs escape the transformed scroll canvas and provide keyboard modal behavior', () => {
  assert.match(appSource, /import \{ createPortal \} from 'react-dom'/);
  assert.match(appSource, /function useModalBehavior/);
  assert.match(appSource, /event\.key === 'Escape'/);
  assert.match(appSource, /appShell\.inert = true/);
  assert.match(appSource, /createPortal\(/);
});

test('Panda Control Vent lighting exposes selected states and percentage sliders', () => {
  assert.match(appSource, /role="tablist" aria-label="Lighting zone"/);
  assert.match(appSource, /aria-selected=\{zoneName === 'vent'\}/);
  assert.match(appSource, /aria-pressed=\{!printerMode\}/);
  assert.match(appSource, /max="100" value=\{byteToPercent\(zone\.brightness\)\}/);
  assert.match(appSource, /max="100" value=\{byteToPercent\(zone\.speed\)\}/);
});

test('manual update failures remove Electron IPC wrapper noise', () => {
  assert.match(appSource, /ipcErrorMessage/);
  assert.match(appSource, /setUpdateResult\(null\)/);
  assert.match(appSource, /Could not check for updates/);
});

test('write responses are scoped to their originating device and verified before success', () => {
  assert.match(appSource, /const operationKey = selectedKey/);
  assert.match(appSource, /deviceKey: operationKey/);
  assert.match(appSource, /draftsEquivalent\(requestedDraft, returnedDraft\)/);
  assert.match(appSource, /The device returned different settings/);
  assert.match(appSource, /controlVentCommandSatisfied\(command, next\)/);
});

test('Windows packages use the Panda Control icon and x64 NSIS installer', () => {
  assert.match(packageConfig.scripts['dist:win'], /--win nsis --x64/);
  assert.ok(
    packageConfig.scripts['dist:win'].indexOf('npm run build') <
      packageConfig.scripts['dist:win'].indexOf('npm run test'),
    'Windows packaging must build Sites output before testing generated artifacts',
  );
  assert.equal(packageConfig.build.win.icon, 'build/icon.ico');
});

test('Linux packages use the Panda Control icon and ship AppImage plus DEB', () => {
  assert.equal(packageConfig.build.linux.icon, 'build/icon-1024.png');
  assert.equal(packageConfig.build.linux.executableName, 'panda-control');
  assert.equal(packageConfig.desktopName, 'panda-control');
  assert.equal(packageConfig.build.linux.syncDesktopName, true);
  assert.deepEqual(packageConfig.build.linux.target, ['AppImage', 'deb']);
  assert.match(packageConfig.scripts['dist:linux'], /--linux AppImage --x64/);
  assert.match(packageConfig.scripts['dist:linux'], /build-linux-deb-native\.sh/);
  assert.ok(
    packageConfig.scripts['dist:linux'].indexOf('npm run build') <
      packageConfig.scripts['dist:linux'].indexOf('npm run test'),
    'Linux packaging must build Sites output before testing generated artifacts',
  );
});

test('release packages include third-party notices', () => {
  assert.deepEqual(packageConfig.build.extraResources, [{
    from: 'docs/THIRD_PARTY_NOTICES.md',
    to: 'THIRD_PARTY_NOTICES.md',
  }]);
  assert.match(thirdPartyNotices, /React and React DOM 19\.2\.0/);
  assert.match(thirdPartyNotices, /Phosphor Icons for React 2\.1\.10/);
  assert.match(thirdPartyNotices, /ws 8\.22\.0/);
  assert.match(thirdPartyNotices, /MIT License/);
});

test('Linux window resizing settles back to the square interface ratio', () => {
  assert.match(mainSource, /installLinuxSquareResizeCorrection\(window, screen\)/);
  assert.match(windowGeometrySource, /process\.platform !== 'linux'/);
  assert.match(windowGeometrySource, /window\.on\('resize'/);
  assert.match(windowGeometrySource, /window\.setContentSize\(squareSize, squareSize\)/);
  assert.match(windowGeometrySource, /window\.isMaximized\(\)/);
  assert.match(windowGeometrySource, /window\.isFullScreen\(\)/);
});
