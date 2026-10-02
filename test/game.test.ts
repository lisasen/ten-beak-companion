import test from "node:test";
import assert from "node:assert/strict";
import { dealDamage, makeCombatant } from "../src/game.ts";

const hero = () => makeCombatant({ name: "King Earnur", category: "hero", maxHp: 250 });
const dwarf = () => makeCombatant({ name: "Dwarf", category: "enemy", maxHp: 70 });

test("overkill counts only actual HP and rewards the final blow once", () => {
  const attacker = hero(); const target = dwarf();
  const result = dealDamage(attacker, target, 100);
  assert.equal(result.actualDamage, 70);
  assert.equal(attacker.damageProgress, 70);
  assert.equal(attacker.gold, 350);
  assert.equal(target.rewarded, true);
  assert.throws(() => dealDamage(attacker, target, 10), /already defeated/);
});

test("enemy attacks damage heroes without earning gold or progress", () => {
  const attacker = dwarf(); const target = hero();
  const result = dealDamage(attacker, target, 50);
  assert.equal(result.actualDamage, 50);
  assert.equal(target.hp, 200);
  assert.equal(attacker.gold, 0);
  assert.equal(attacker.damageProgress, 0);
});

test("armor blocks 25 incoming damage", () => {
  const target = hero(); target.upgrades.push({ id: "armor", kind: "armor", label: "Armor" });
  const result = dealDamage(dwarf(), target, 50);
  assert.equal(result.blockedDamage, 25);
  assert.equal(result.actualDamage, 25);
});

test("category HP caps are enforced", () => {
  assert.throws(() => makeCombatant({ name: "Hero", category: "hero", maxHp: 301 }), /between 200 and 300/);
  assert.throws(() => makeCombatant({ name: "Enemy", category: "enemy", maxHp: 501 }), /between 1 and 500/);
  assert.doesNotThrow(() => makeCombatant({ name: "Phantomé", category: "phantome", maxHp: 3000 }));
});

test("regular opponents have at most two attacks", () => {
  const abilities = [1, 2, 3].map((n) => ({ id: String(n), name: `Attack ${n}`, successFaces: [n], effect: "Roll", maxDamage: 100 }));
  assert.throws(() => makeCombatant({ name: "Enemy", category: "enemy", maxHp: 100, abilities }), /at most 2/);
});
