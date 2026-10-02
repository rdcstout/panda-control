import assert from 'node:assert/strict';
import test from 'node:test';
import geometry from '../electron/windowGeometry.cjs';

const { MIN_CONTENT_SIZE, chooseSquareContentSize } = geometry;

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
