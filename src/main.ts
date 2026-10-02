import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  DAMAGE_FACES, LEVEL_DAMAGE, applyDeathPenalty, applyUpgrade, dealDamage, makeCombatant,
  markAdventureAction, revive, spawnMany, stayAtInn,
  type Category, type Combatant, type UpgradeKind
} from "./game";
import { emptyState, loadState, loadTemplates, saveState, saveTemplates, type GameState } from "./storage";

let state: GameState = emptyState();
let isGm = true;
let inOwlbear = false;
let activeTab: "roster" | "battle" | "spawn" = "roster";
let templates: Combatant[] = loadTemplates();

const app = document.querySelector<HTMLElement>("#app")!;
const esc = (value: unknown) => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);
const heroes = () => state.combatants.filter((c) => c.category === "hero" || c.category === "ally");
const enemies = () => state.combatants.filter((c) => !["hero", "ally"].includes(c.category));
const byId = (id: string) => state.combatants.find((c) => c.id === id);
const log = (message: string) => state.log.push(message);

async function commit(): Promise<void> {
  await saveState(state, inOwlbear);
  render();
}

function badge(c: Combatant): string {
  const pct = Math.max(0, Math.round(c.hp / c.maxHp * 100));
  return `<article class="card ${c.defeated ? "dead" : ""}">
    <div class="token token-${esc(c.token)}">${esc(c.name.slice(0, 1).toUpperCase())}</div>
    <div class="card-main"><div class="card-title"><strong>${esc(c.name)}</strong><span>${esc(c.category)}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="stats"><b>${c.hp}/${c.maxHp} HP</b><span>${c.gold} gold</span><span>${c.damageProgress}/${LEVEL_DAMAGE}</span></div></div>
    ${isGm ? `<button class="icon danger" data-remove="${c.id}" title="Remove">×</button>` : ""}
  </article>`;
}

function nav(): string {
  return `<nav>${(["roster", "battle", "spawn"] as const).map((tab) => `<button data-tab="${tab}" class="${activeTab === tab ? "active" : ""}">${tab === "spawn" ? "Create & Spawn" : tab}</button>`).join("")}</nav>`;
}

function rosterView(): string {
  return `<section><div class="section-head"><h2>Adventurers</h2><span>${heroes().length}</span></div>
    <div class="cards">${heroes().map(badge).join("") || `<p class="empty">Create the first adventurer. New heroes begin with 300 gold.</p>`}</div>
    <div class="section-head"><h2>Opponents</h2><span>${enemies().filter((c) => !c.defeated).length} alive</span></div>
    <div class="cards">${enemies().map(badge).join("") || `<p class="empty">Spawn an opponent or a whole group.</p>`}</div></section>`;
}

function selectOptions(list: Combatant[], selected: string): string {
  return list.map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.name)} — ${c.hp} HP</option>`).join("");
}

function battleView(): string {
  const attacker = byId(state.activeAttackerId) ?? heroes().find((c) => !c.defeated);
  const target = byId(state.activeTargetId) ?? enemies().find((c) => !c.defeated);
  if (attacker) state.activeAttackerId = attacker.id;
  if (target) state.activeTargetId = target.id;
  return `<section>
    <div class="notice">Roll the physical dice. Enter only the result—this companion never rolls for you.</div>
    <label>Attacker<select id="attacker">${selectOptions(heroes().filter((c) => !c.defeated), state.activeAttackerId)}</select></label>
    <label>Target<select id="target">${selectOptions(enemies().filter((c) => !c.defeated), state.activeTargetId)}</select></label>
    <h2>Damage die</h2><div class="damage-grid">${DAMAGE_FACES.map((n) => `<button class="damage" data-damage="${n}" ${!isGm ? "disabled" : ""}>${n}</button>`).join("")}</div>
    <form id="custom-damage" class="inline"><input name="damage" type="number" min="1" max="999" placeholder="Custom / doubled"><button ${!isGm ? "disabled" : ""}>Apply</button></form>
    <div class="battle-tools">
      <button id="coin">Flip for first attack</button><button id="retreat">Record retreat roll</button>
    </div>
    <h2>Adventure log</h2><div class="log">${state.log.slice().reverse().map((x) => `<p>${esc(x)}</p>`).join("")}</div>
  </section>`;
}

function spawnView(): string {
  return `<section>
    ${!isGm ? `<div class="notice">Only the Owlbear GM can create or spawn characters.</div>` : ""}
    <form id="creator">
      <div class="section-head"><h2>New character or opponent</h2></div>
      <label>Name<input name="name" required maxlength="40" placeholder="King Earnur"></label>
      <div class="row"><label>Type<select name="category"><option value="hero">Hero</option><option value="ally">Ally</option><option value="enemy">Enemy — 50 gold</option><option value="army">Army — 150 gold</option><option value="miniBoss">Mini-boss — 300 gold</option><option value="phantome">Calamity Phantomé — ends game</option></select></label>
      <label>Max HP<input name="hp" required type="number" min="1" max="999" value="250"></label></div>
      <label>Token<select name="token"><option value="knight">Knight</option><option value="dwarf">Dwarf</option><option value="mage">Mage</option><option value="beast">Beast</option><option value="skull">Skull</option><option value="crown">Crown</option></select></label>
      <div class="row"><label>How many?<input name="count" type="number" min="1" max="12" value="1"></label><label>Starting gold<input name="gold" type="number" min="0" value="300"></label></div>
      <details><summary>Starting abilities (optional, max 3)</summary>
        ${[1,2,3].map((n) => `<fieldset><legend>Ability ${n}</legend><input name="ability${n}" placeholder="Name"><input name="faces${n}" placeholder="Success faces, e.g. 2,4,6"><input name="max${n}" type="number" min="0" max="200" placeholder="Maximum damage"></fieldset>`).join("")}
      </details>
      <label class="check"><input name="saveTemplate" type="checkbox"> Save in my opponent library</label>
      <button class="primary" ${!isGm ? "disabled" : ""}>Create & spawn</button>
    </form>
    <div class="section-head"><h2>Saved library</h2><span>${templates.length}</span></div>
    <div class="template-grid">${templates.map((t, i) => `<button data-template="${i}" ${!isGm ? "disabled" : ""}><b>${esc(t.name)}</b><small>${esc(t.category)} · ${t.maxHp} HP</small></button>`).join("") || `<p class="empty">Save an opponent once, then spawn it again in one click.</p>`}</div>
  </section>`;
}

function render(): void {
  app.innerHTML = `<header><div><p class="eyebrow">VED'S FREE-WORLD ADVENTURE</p><h1>The Ten Beak</h1></div><span class="role">${isGm ? "GM" : "PLAYER"}</span></header>${nav()}${activeTab === "roster" ? rosterView() : activeTab === "battle" ? battleView() : spawnView()}${state.gameWon ? `<div class="victory"><h2>Calamity Phantomé is defeated!</h2><p>The game is won.</p></div>` : ""}`;
  bind();
}

function bind(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.onclick = () => { activeTab = b.dataset.tab as typeof activeTab; render(); });
  document.querySelector<HTMLSelectElement>("#attacker")?.addEventListener("change", (e) => { state.activeAttackerId = (e.target as HTMLSelectElement).value; void commit(); });
  document.querySelector<HTMLSelectElement>("#target")?.addEventListener("change", (e) => { state.activeTargetId = (e.target as HTMLSelectElement).value; void commit(); });
  document.querySelectorAll<HTMLButtonElement>("[data-damage]").forEach((b) => b.onclick = () => void applyDamage(Number(b.dataset.damage)));
  document.querySelector<HTMLFormElement>("#custom-damage")?.addEventListener("submit", (e) => { e.preventDefault(); void applyDamage(Number(new FormData(e.currentTarget as HTMLFormElement).get("damage"))); });
  document.querySelector<HTMLButtonElement>("#coin")?.addEventListener("click", () => { log(Math.random() < .5 ? "Adventurers attack first." : "Enemies caught them off guard and attack first."); void commit(); });
  document.querySelector<HTMLButtonElement>("#retreat")?.addEventListener("click", () => { const roll = prompt("What did the physical action die show? (Retreat succeeds on 2 or 3)"); if (!roll) return; log([2,3].includes(Number(roll)) ? `Retreat succeeds on ${roll}.` : `Retreat fails on ${roll}; it is now the enemy turn.`); void commit(); });
  document.querySelector<HTMLFormElement>("#creator")?.addEventListener("submit", create);
  document.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((b) => b.onclick = () => { const copies = Number(prompt("How many should spawn?", "1")); if (!copies) return; state.combatants.push(...spawnMany(templates[Number(b.dataset.template)], copies)); log(`GM spawned ${copies} × ${templates[Number(b.dataset.template)].name}.`); void commit(); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => b.onclick = () => { const c = byId(b.dataset.remove!); if (c && confirm(`Remove ${c.name}?`)) { state.combatants = state.combatants.filter((x) => x.id !== c.id); void commit(); } });
  document.querySelectorAll<HTMLElement>(".card").forEach((card, index) => card.ondblclick = () => editCombatant(state.combatants[index]));
}

async function applyDamage(amount: number): Promise<void> {
  try {
    const attacker = byId(state.activeAttackerId); const target = byId(state.activeTargetId);
    if (!attacker || !target) throw new Error("Choose an attacker and target first.");
    const result = dealDamage(attacker, target, amount);
    markAdventureAction(attacker);
    log(`${attacker.name} dealt ${result.actualDamage} damage to ${target.name}.`);
    if (result.reward) log(`${attacker.name} made the final blow and looted ${result.reward} gold.`);
    if (result.newLevels) log(`${attacker.name} earned ${result.newLevels} upgrade choice${result.newLevels > 1 ? "s" : ""}!`);
    if (result.gameWon) state.gameWon = true;
    await commit();
  } catch (error) { alert((error as Error).message); }
}

function create(e: SubmitEvent): void {
  e.preventDefault();
  try {
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const category = String(data.get("category")) as Category;
    const abilities = [1,2,3].flatMap((n) => {
      const name = String(data.get(`ability${n}`) ?? "").trim(); if (!name) return [];
      return [{ id: crypto.randomUUID(), name, successFaces: String(data.get(`faces${n}`)).split(",").map(Number).filter(Boolean), effect: "Roll the damage die", maxDamage: Number(data.get(`max${n}`) || 100) }];
    });
    const base = makeCombatant({ name: String(data.get("name")), category, maxHp: Number(data.get("hp")), gold: Number(data.get("gold")), token: String(data.get("token")), abilities });
    const spawned = spawnMany(base, Number(data.get("count")));
    if (data.get("saveTemplate")) { templates.push(base); saveTemplates(templates); }
    state.combatants.push(...spawned); log(`GM spawned ${spawned.length} × ${base.name}.`); activeTab = "roster"; void commit();
  } catch (error) { alert((error as Error).message); }
}

function editCombatant(c: Combatant): void {
  if (!isGm) return;
  const action = prompt(`GM action for ${c.name}: hp, inn, adventure, revive, level, or death`, "hp");
  try {
    if (action === "hp") { const hp = Number(prompt("Set current HP", String(c.hp))); c.hp = Math.max(0, Math.min(c.maxHp, hp)); c.defeated = c.hp === 0; }
    if (action === "inn") log(`${c.name} stayed one night, paid 100 gold, and healed ${stayAtInn(c)} HP.`);
    if (action === "adventure") { markAdventureAction(c); log(`${c.name} may use an inn again.`); }
    if (action === "revive") { revive(c, Number(prompt("Revive HP from the card", "20"))); log(`${c.name} revived.`); }
    if (action === "level") { const kind = prompt("Choose: vitality, power, accuracy, armor, fortune, ability", "vitality") as UpgradeKind; applyUpgrade(c, kind, prompt("Ability/attack detail (if needed)", "") ?? ""); log(`${c.name} chose a ${kind} upgrade.`); }
    if (action === "death") { const keep = c.upgrades.slice(0, Math.floor((c.upgrades.length * 750 + c.damageProgress) / 2 / 750)).map((u) => u.id); applyDeathPenalty(c, keep); log(`${c.name}'s gold and advancement were cut in half.`); }
    void commit();
  } catch (error) { alert((error as Error).message); }
}

async function start(): Promise<void> {
  try {
    await Promise.race([OBR.onReady(() => Promise.resolve()), new Promise((_, reject) => setTimeout(() => reject(new Error("standalone")), 1200))]);
    inOwlbear = true;
    isGm = (await OBR.player.getRole()) === "GM";
    state = await loadState(true);
    OBR.room.onMetadataChange((metadata) => { const incoming = metadata["com.tenbeak.companion/state"] as GameState | undefined; if (incoming) { state = incoming; render(); } });
  } catch { state = await loadState(false); }
  render();
}

void start();
