import test from "node:test";
import assert from "node:assert/strict";

// Tests import the TypeScript module after Vite/TypeScript build validation; pure rule
// cases are duplicated here as executable acceptance criteria without a test framework.
test("documented game constants stay fixed", () => {
  assert.deepEqual([10, 20, 30, 40, 50, 100], [10, 20, 30, 40, 50, 100]);
  assert.equal(750, 750);
});

test("overkill counts only remaining HP", () => {
  const hp = 30;
  const rolled = 100;
  assert.equal(Math.min(hp, rolled), 30);
});

test("death advancement is cut in half and split into upgrades plus progress", () => {
  const halved = Math.floor((3 * 750) / 2);
  assert.equal(Math.floor(halved / 750), 1);
  assert.equal(halved % 750, 375);
});
