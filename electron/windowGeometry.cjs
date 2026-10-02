const MIN_CONTENT_SIZE = 560;
const RESIZE_SETTLE_MS = 80;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chooseSquareContentSize(previous, current, maximum) {
  const widthDelta = Math.abs(current.width - previous.width);
  const heightDelta = Math.abs(current.height - previous.height);
  const changedSize = widthDelta >= heightDelta ? current.width : current.height;
  return Math.round(clamp(changedSize, MIN_CONTENT_SIZE, maximum));
}

function installLinuxSquareResizeCorrection(window, electronScreen) {
  if (process.platform !== 'linux') return;

  let previous = window.getContentBounds();
  let resizeTimer;
  let expectedSize;

  window.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.isDestroyed() || window.isMaximized() || window.isFullScreen()) return;

      const current = window.getContentBounds();
      if (
        expectedSize
        && Math.abs(current.width - expectedSize) <= 1
        && Math.abs(current.height - expectedSize) <= 1
      ) {
        previous = current;
        expectedSize = undefined;
        return;
      }

      if (Math.abs(current.width - current.height) <= 1) {
        previous = current;
        return;
      }

      const workArea = electronScreen.getDisplayMatching(window.getBounds()).workAreaSize;
      const maximum = Math.max(MIN_CONTENT_SIZE, Math.min(workArea.width, workArea.height) - 48);
      const squareSize = chooseSquareContentSize(previous, current, maximum);
      expectedSize = squareSize;
      previous = { ...current, width: squareSize, height: squareSize };
      window.setContentSize(squareSize, squareSize);
    }, RESIZE_SETTLE_MS);
  });

  window.on('closed', () => clearTimeout(resizeTimer));
}

module.exports = {
  MIN_CONTENT_SIZE,
  chooseSquareContentSize,
  installLinuxSquareResizeCorrection,
};
