import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import geometry from '../electron/windowGeometry.cjs';

const { MIN_CONTENT_SIZE, chooseSquareContentSize, installSquareMaximizeCorrection } = geometry;

test('horizontal resizing drives the square size', () => {
  assert.equal(
    chooseSquareContentSize({ width: 900, height: 900 }, { width: 1040, height: 930 }, 1200),
    1040,
  );
});

test('vertical resizing drives the square size', () => {
  assert.equal(
    chooseSquareContentSize({ width: 900, height: 900 }, { width: 910, height: 1020 }, 1200),
    1020,
  );
});

test('square resizing respects the minimum and current display maximum', () => {
  assert.equal(
    chooseSquareContentSize({ width: 900, height: 900 }, { width: 400, height: 850 }, 1200),
    MIN_CONTENT_SIZE,
  );
  assert.equal(
    chooseSquareContentSize({ width: 900, height: 900 }, { width: 1600, height: 910 }, 1180),
    1180,
  );
});

test('maximize and macOS Zoom settle to the largest centered square', () => {
  const window = new EventEmitter();
  let contentSize;
  let position;
  window.isDestroyed = () => false;
  window.getBounds = () => ({ x: 200, y: 100, width: 900, height: 700 });
  window.unmaximize = () => {};
  window.setContentSize = (width, height) => { contentSize = { width, height }; };
  window.setPosition = (x, y) => { position = { x, y }; };
  installSquareMaximizeCorrection(window, {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  });
  window.emit('maximize');
  assert.deepEqual(contentSize, { width: 1032, height: 1032 });
  assert.deepEqual(position, { x: 510, y: 190 });
});
