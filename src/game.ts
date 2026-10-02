export const DAMAGE_FACES = [10, 20, 30, 40, 50, 100] as const;
export const LEVEL_DAMAGE = 750;
export const HP_LIMITS: Record<Category, { min: number; max: number }> = {
  hero: { min: 200, max: 300 }, ally: { min: 200, max: 300 }, enemy: { min: 1, max: 500 },
  army: { min: 1, max: 1000 }, miniBoss: { min: 1, max: 1500 }, phantome: { min: 1, max: 3000 }
};

export type Category = "hero" | "ally" | "enemy" | "army" | "miniBoss" | "phantome";
export type UpgradeKind = "vitality" | "power" | "accuracy" | "armor" | "fortune" | "ability";

export interface Ability {
  id: string;
  name: string;
  successFaces: number[];
  effect: string;
  maxDamage: number;
}

export interface Upgrade {
  id: string;
  kind: UpgradeKind;
  label: string;
}

export interface Combatant {
  id: string;
  encounterId: string;
  name: string;
  category: Category;
  hp: number;
  maxHp: number;
  gold: number;
  damageProgress: number;
  pendingUpgrades: number;
  upgrades: Upgrade[];
  abilities: Ability[];
  defeated: boolean;
  rewarded: boolean;
  innReady: boolean;
  token: string;
}

export interface DamageResult {
  actualDamage: number;
  killed: boolean;
  reward: number;
  newLevels: number;
  gameWon: boolean;
  blockedDamage: number;
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function rewardFor(category: Category): number {
  if (category === "army") return 150;
  if (category === "miniBoss") return 300;
  if (category === "enemy") return 50;
  return 0;
}

export function makeCombatant(input: Partial<Combatant> & Pick<Combatant, "name" | "category" | "maxHp">): Combatant {
  const limits = HP_LIMITS[input.category];
  if (input.maxHp < limits.min || input.maxHp > limits.max) throw new Error(`${input.name} HP must be between ${limits.min} and ${limits.max}.`);
  const abilityLimit = input.category === "enemy" ? 2 : (["hero", "ally"].includes(input.category) ? 3 : 4);
  if ((input.abilities?.length ?? 0) > abilityLimit) throw new Error(`${input.name} can have at most ${abilityLimit} attacks or abilities.`);
  for (const ability of input.abilities ?? []) validateAbility(ability);

  return {
    id: input.id ?? uid(),
    encounterId: input.encounterId ?? uid(),
    name: input.name.trim(),
    category: input.category,
    hp: input.hp ?? input.maxHp,
    maxHp: input.maxHp,
    gold: input.gold ?? (["hero", "ally"].includes(input.category) ? 300 : 0),
    damageProgress: input.damageProgress ?? 0,
    pendingUpgrades: input.pendingUpgrades ?? 0,
    upgrades: input.upgrades ?? [],
    abilities: input.abilities ?? [],
    defeated: input.defeated ?? false,
    rewarded: input.rewarded ?? false,
    innReady: input.innReady ?? true,
    token: input.token ?? "knight"
  };
}

export function validateAbility(ability: Ability): void {
  const uniqueFaces = new Set(ability.successFaces);
  if (!ability.name.trim()) throw new Error("Every ability needs a name.");
  if (!ability.successFaces.length || ability.successFaces.some((face) => face < 1 || face > 6) || uniqueFaces.size !== ability.successFaces.length) {
    throw new Error(`${ability.name}: choose unique action-die faces from 1 to 6.`);
  }
  if (ability.maxDamage > 200) throw new Error(`${ability.name}: starting attacks cannot exceed 200 damage.`);
  if (ability.maxDamage >= 150 && ability.successFaces.length > 2) {
    throw new Error(`${ability.name}: powerful attacks need 2 or fewer successful faces.`);
  }
}

export function dealDamage(attacker: Combatant, target: Combatant, rolledDamage: number): DamageResult {
  if (attacker.defeated) throw new Error("A defeated character cannot attack.");
  if (target.defeated || target.hp <= 0) throw new Error("That opponent is already defeated.");
  if (!Number.isFinite(rolledDamage) || rolledDamage <= 0) throw new Error("Damage must be greater than 0.");

  const hasArmor = target.upgrades.some((upgrade) => upgrade.kind === "armor");
  const blockedDamage = hasArmor ? Math.min(25, Math.floor(rolledDamage)) : 0;
  const actualDamage = Math.min(target.hp, Math.max(0, Math.floor(rolledDamage) - blockedDamage));
  const hpBefore = target.hp;
  target.hp -= actualDamage;
  const heroicAttack = ["hero", "ally"].includes(attacker.category);
  if (heroicAttack) attacker.damageProgress += actualDamage;

  let newLevels = 0;
  while (heroicAttack && attacker.damageProgress >= LEVEL_DAMAGE) {
    attacker.damageProgress -= LEVEL_DAMAGE;
    attacker.pendingUpgrades += 1;
    newLevels += 1;
  }

  const killed = hpBefore > 0 && target.hp === 0;
  let reward = 0;
  if (killed) {
    target.defeated = true;
    if (heroicAttack && !["hero", "ally"].includes(target.category) && !target.rewarded) {
      reward = rewardFor(target.category);
      attacker.gold += reward;
      target.rewarded = true;
    }
  }

  return { actualDamage, killed, reward, newLevels, gameWon: killed && target.category === "phantome", blockedDamage };
}

export function spawnMany(template: Combatant, count: number): Combatant[] {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error("Spawn between 1 and 12 opponents.");
  return Array.from({ length: count }, (_, index) => makeCombatant({
    ...template,
    id: uid(),
    encounterId: uid(),
    name: count === 1 ? template.name : `${template.name} ${index + 1}`,
    hp: template.maxHp,
    defeated: false,
    rewarded: false,
    gold: 0,
    damageProgress: 0,
    pendingUpgrades: 0,
    upgrades: []
  }));
}

export function applyUpgrade(hero: Combatant, kind: UpgradeKind, detail = ""): void {
  if (hero.pendingUpgrades < 1) throw new Error("No upgrade is ready yet.");
  const labels: Record<UpgradeKind, string> = {
    vitality: "+50 max HP",
    power: `+25 damage: ${detail || "chosen attack"}`,
    accuracy: `+1 success face: ${detail || "chosen ability"}`,
    armor: "Reduce incoming damage by 25",
    fortune: "One reroll per battle",
    ability: detail || "New GM-approved ability"
  };
  if (kind === "vitality") {
    hero.maxHp += 50;
    hero.hp += 50;
  }
  hero.upgrades.push({ id: uid(), kind, label: labels[kind] });
  hero.pendingUpgrades -= 1;
}

export function stayAtInn(hero: Combatant): number {
  if (!hero.innReady) throw new Error("Do something in the world before staying another night.");
  if (hero.gold < 100) throw new Error("An inn costs 100 gold.");
  hero.gold -= 100;
  const healed = Math.min(60, hero.maxHp - hero.hp);
  hero.hp += healed;
  hero.innReady = false;
  return healed;
}

export function markAdventureAction(hero: Combatant): void {
  hero.innReady = true;
}

export function revive(hero: Combatant, reviveHp: number): void {
  if (!hero.defeated || reviveHp < 1) throw new Error("Revive requires a defeated hero and positive card HP.");
  hero.hp = Math.min(reviveHp, hero.maxHp);
  hero.defeated = false;
}

export function applyDeathPenalty(hero: Combatant, keptUpgradeIds: string[]): void {
  const totalAdvancement = hero.upgrades.length * LEVEL_DAMAGE + hero.damageProgress;
  const halved = Math.floor(totalAdvancement / 2);
  const upgradesToKeep = Math.floor(halved / LEVEL_DAMAGE);
  const kept = hero.upgrades.filter((upgrade) => keptUpgradeIds.includes(upgrade.id)).slice(0, upgradesToKeep);
  if (kept.length !== upgradesToKeep) throw new Error(`Choose exactly ${upgradesToKeep} upgrade(s) to keep.`);
  hero.upgrades = kept;
  hero.damageProgress = halved % LEVEL_DAMAGE;
  hero.pendingUpgrades = 0;
  hero.gold = Math.floor(hero.gold / 2);
}
