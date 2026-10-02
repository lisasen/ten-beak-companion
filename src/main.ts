import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  DAMAGE_FACES, HP_LIMITS, LEVEL_DAMAGE, applyDeathPenalty, applyUpgrade, dealDamage, makeCombatant,
  markAdventureAction, revive, spawnMany, stayAtInn,
  type Category, type Combatant, type UpgradeKind
} from "./game";
import { emptyState, loadState, loadTemplates, saveState, saveTemplates, type GameState } from "./storage";

let state: GameState = emptyState();
let isGm = true;
let inOwlbear = false;
let activeTab: "roster" | "battle" | "spawn" = "roster";
let templates: Combatant[] = loadTemplates();
interface CustomToken { id: string; name: string; dataUrl: string; }
const CUSTOM_TOKEN_KEY="ten-beak-custom-tokens-v1";
let customTokens:CustomToken[]=JSON.parse(localStorage.getItem(CUSTOM_TOKEN_KEY)??"[]") as CustomToken[];

const app = document.querySelector<HTMLElement>("#app")!;
const esc = (value: unknown) => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);
const heroes = () => state.combatants.filter((c) => c.category === "hero" || c.category === "ally");
const enemies = () => state.combatants.filter((c) => !["hero", "ally"].includes(c.category));
const byId = (id: string) => state.combatants.find((c) => c.id === id);
const log = (message: string) => state.log.push(message);
const tokenUrl = (token: string) => token.startsWith("custom:")
  ? customTokens.find((item)=>item.id===token.slice(7))?.dataUrl ?? new URL("tokens/knight.svg",window.location.href).toString()
  : new URL(`tokens/${token}.svg`, window.location.href).toString();

async function commit(): Promise<void> {
  await saveState(state, inOwlbear);
  render();
}

function badge(c: Combatant): string {
  const pct = Math.max(0, Math.round(c.hp / c.maxHp * 100));
  return `<article class="card ${c.defeated ? "dead" : ""}" data-edit="${c.id}">
    <div class="token"><img src="${tokenUrl(c.token)}" alt=""></div>
    <div class="card-main"><div class="card-title"><strong>${esc(c.name)}</strong><span>${esc(c.category)}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="stats"><b>${c.hp}/${c.maxHp} HP</b><span>${c.gold} gold</span><span>${c.damageProgress}/${LEVEL_DAMAGE}</span></div></div>
    ${isGm ? `<div class="card-actions">${["hero","ally"].includes(c.category) ? `<button data-gold="${c.id}" title="Award quest or treasure gold">+ Gold</button>` : ""}<button data-manage="${c.id}" title="Manage character">⚙</button><button class="icon danger" data-remove="${c.id}" title="Remove">×</button></div>` : ""}
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
  const living = state.combatants.filter((c) => !c.defeated);
  const attacker = byId(state.activeAttackerId) ?? living[0];
  const opposing = attacker && ["hero","ally"].includes(attacker.category) ? enemies() : heroes();
  const target = opposing.find((c) => c.id === state.activeTargetId && !c.defeated) ?? opposing.find((c) => !c.defeated);
  if (attacker) state.activeAttackerId = attacker.id;
  if (target) state.activeTargetId = target.id;
  return `<section>
    <div class="notice">Roll the physical dice. Enter only the result—this companion never rolls for you.</div>
    <div class="duel"><label><span>⚔ Attacker</span><select id="attacker">${selectOptions(living, state.activeAttackerId)}</select></label><b>VS</b><label><span>Target</span><select id="target">${selectOptions(opposing.filter((c) => !c.defeated), state.activeTargetId)}</select></label></div>
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
      <label>Max HP <small id="hp-rule">Heroes: 200–300</small><input name="hp" required type="number" min="200" max="300" value="250"></label></div>
      <label>Choose a pictured token</label><div class="token-picker">${["knight","dwarf","mage","beast","skull","crown"].map((t,i)=>`<label><input type="radio" name="token" value="${t}" ${i===0?"checked":""}><img src="${tokenUrl(t)}" alt="${t}"><span>${t}</span></label>`).join("")}${customTokens.map(t=>`<label><input type="radio" name="token" value="custom:${t.id}"><img src="${t.dataUrl}" alt="${esc(t.name)}"><span>${esc(t.name)}</span></label>`).join("")}</div>
      <label class="upload-token">Upload a reusable PNG or JPG token<input id="token-upload" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div class="row"><label>How many?<input name="count" type="number" min="1" max="12" value="1"></label><label>Starting gold<input name="gold" type="number" min="0" value="300"></label></div>
      <details><summary id="ability-summary">Starting attacks / abilities (optional, max 3)</summary>
        ${[1,2,3,4].map((n) => `<fieldset class="ability"><legend>Attack / Ability ${n}</legend><input name="ability${n}" placeholder="Name"><input name="faces${n}" placeholder="Successful action-die faces, e.g. 2,4"><select name="damageMode${n}"><option value="normal">Roll damage die (10–100)</option><option value="double">Double the damage die (max 200)</option><option value="fixed">Fixed damage</option><option value="support">No damage / support ability</option></select><input name="max${n}" type="number" min="0" max="200" placeholder="Fixed or maximum damage"></fieldset>`).join("")}
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
  document.querySelector<HTMLSelectElement>("#attacker")?.addEventListener("change", (e) => { state.activeAttackerId = (e.target as HTMLSelectElement).value; const a=byId(state.activeAttackerId); const targets=a&&["hero","ally"].includes(a.category)?enemies():heroes(); state.activeTargetId=targets.find(c=>!c.defeated)?.id??""; void commit(); });
  document.querySelector<HTMLSelectElement>("#target")?.addEventListener("change", (e) => { state.activeTargetId = (e.target as HTMLSelectElement).value; void commit(); });
  document.querySelectorAll<HTMLButtonElement>("[data-damage]").forEach((b) => b.onclick = () => void applyDamage(Number(b.dataset.damage)));
  document.querySelector<HTMLFormElement>("#custom-damage")?.addEventListener("submit", (e) => { e.preventDefault(); void applyDamage(Number(new FormData(e.currentTarget as HTMLFormElement).get("damage"))); });
  document.querySelector<HTMLButtonElement>("#coin")?.addEventListener("click", () => { log(Math.random() < .5 ? "Adventurers attack first." : "Enemies caught them off guard and attack first."); void commit(); });
  document.querySelector<HTMLButtonElement>("#retreat")?.addEventListener("click", () => { const roll = prompt("What did the physical action die show? (Retreat succeeds on 2 or 3)"); if (!roll) return; log([2,3].includes(Number(roll)) ? `Retreat succeeds on ${roll}.` : `Retreat fails on ${roll}; it is now the enemy turn.`); void commit(); });
  document.querySelector<HTMLFormElement>("#creator")?.addEventListener("submit", create);
  document.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((b) => b.onclick = async () => { const copies = Number(prompt("How many should spawn?", "1")); if (!copies) return; const spawned=spawnMany(templates[Number(b.dataset.template)], copies); state.combatants.push(...spawned); await placeOnMap(spawned); log(`GM spawned ${copies} × ${templates[Number(b.dataset.template)].name}.`); await commit(); });
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => b.onclick = () => { const c = byId(b.dataset.remove!); if (c && confirm(`Remove ${c.name}?`)) { state.combatants = state.combatants.filter((x) => x.id !== c.id); void commit(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-manage]").forEach((b)=>b.onclick=()=>{const c=byId(b.dataset.manage!);if(c)editCombatant(c);});
  document.querySelectorAll<HTMLButtonElement>("[data-gold]").forEach((b)=>b.onclick=()=>{const c=byId(b.dataset.gold!);if(c)awardGold(c);});
  document.querySelector<HTMLSelectElement>('#creator select[name="category"]')?.addEventListener("change", configureCreator);
  document.querySelector<HTMLInputElement>("#token-upload")?.addEventListener("change", uploadToken);
}

async function applyDamage(amount: number): Promise<void> {
  try {
    const attacker = byId(state.activeAttackerId); const target = byId(state.activeTargetId);
    if (!attacker || !target) throw new Error("Choose an attacker and target first.");
    const result = dealDamage(attacker, target, amount);
    markAdventureAction(attacker);
    log(`${attacker.name} dealt ${result.actualDamage} damage to ${target.name}${result.blockedDamage ? ` (${result.blockedDamage} blocked by armor)` : ""}.`);
    if (result.reward) log(`${attacker.name} made the final blow and looted ${result.reward} gold.`);
    if (result.newLevels) log(`${attacker.name} earned ${result.newLevels} upgrade choice${result.newLevels > 1 ? "s" : ""}!`);
    if (result.gameWon) state.gameWon = true;
    await commit();
  } catch (error) { alert((error as Error).message); }
}

async function create(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  try {
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const category = String(data.get("category")) as Category;
    const abilities = [1,2,3,4].flatMap((n) => {
      const name = String(data.get(`ability${n}`) ?? "").trim(); if (!name) return [];
      const mode=String(data.get(`damageMode${n}`)); const defaults:Record<string,number>={normal:100,double:200,fixed:50,support:0};
      const effects:Record<string,string>={normal:"Roll the damage die",double:"Roll and double the damage die",fixed:"Deal fixed damage",support:"Support ability—no damage"};
      return [{ id: crypto.randomUUID(), name, successFaces: String(data.get(`faces${n}`)).split(",").map(Number).filter(Boolean), effect: effects[mode], maxDamage: Number(data.get(`max${n}`) || defaults[mode]) }];
    });
    const base = makeCombatant({ name: String(data.get("name")), category, maxHp: Number(data.get("hp")), gold: ["hero","ally"].includes(category) ? Number(data.get("gold")) : 0, token: String(data.get("token")), abilities });
    const spawned = spawnMany(base, Number(data.get("count")));
    if (data.get("saveTemplate")) { templates.push(base); saveTemplates(templates); }
    state.combatants.push(...spawned); await placeOnMap(spawned); log(`GM spawned ${spawned.length} × ${base.name}.`); activeTab = "roster"; await commit();
  } catch (error) { alert((error as Error).message); }
}

function configureCreator(e: Event): void {
  const category=(e.target as HTMLSelectElement).value as Category; const limits=HP_LIMITS[category];
  const hp=document.querySelector<HTMLInputElement>('#creator input[name="hp"]'); const rule=document.querySelector<HTMLElement>("#hp-rule");
  if(hp){hp.min=String(limits.min);hp.max=String(limits.max);if(Number(hp.value)<limits.min||Number(hp.value)>limits.max)hp.value=String(category==="hero"||category==="ally"?250:Math.min(250,limits.max));}
  if(rule)rule.textContent=`Allowed: ${limits.min.toLocaleString()}–${limits.max.toLocaleString()}`;
  const limit=category==="enemy"?2:(["hero","ally"].includes(category)?3:4);
  document.querySelectorAll<HTMLElement>("fieldset.ability").forEach((field,index)=>field.hidden=index>=limit);
  const summary=document.querySelector<HTMLElement>("#ability-summary"); if(summary)summary.textContent=`Starting attacks / abilities (optional, max ${limit})`;
  const gold=document.querySelector<HTMLInputElement>('#creator input[name="gold"]'); if(gold){const player=["hero","ally"].includes(category);gold.disabled=!player;gold.value=player?"300":"0";}
}

function awardGold(hero: Combatant): void {
  const amount=Number(prompt("Award gold: enter 25, 50, 100, or a custom amount", "50")); if(!Number.isFinite(amount)||amount<=0)return;
  const reason=(prompt("Reason for the reward", "Quest, chest, or gift")??"GM reward").trim(); hero.gold+=Math.floor(amount); log(`GM awarded ${hero.name} ${Math.floor(amount)} gold — ${reason}.`); void commit();
}

async function placeOnMap(combatants: Combatant[]): Promise<void> {
  if(!inOwlbear || !(await OBR.scene.isReady())) return;
  const [width,height]=await Promise.all([OBR.viewport.getWidth(),OBR.viewport.getHeight()]);
  const center=await OBR.viewport.inverseTransformPoint({x:width/2,y:height/2});
  const pngs=await Promise.all(combatants.map(c=>imageToPng(tokenUrl(c.token))));
  const items=combatants.map((c,index)=>buildImage({url:pngs[index],mime:"image/png",width:256,height:256},{dpi:150,offset:{x:0,y:0}})
    .name(c.name).layer("CHARACTER").position({x:center.x+(index%4)*180,y:center.y+Math.floor(index/4)*180})
    .metadata({"com.tenbeak.companion/combatantId":c.id,"com.tenbeak.companion/encounterId":c.encounterId}).build());
  await OBR.scene.items.addItems(items);
}

async function uploadToken(e:Event):Promise<void>{
  const input=e.target as HTMLInputElement; const file=input.files?.[0]; if(!file)return;
  if(file.size>8_000_000){alert("Please choose an image smaller than 8 MB.");return;}
  try{
    const dataUrl=await fileToSquarePng(file); const id=crypto.randomUUID();
    customTokens.push({id,name:file.name.replace(/\.[^.]+$/,"").slice(0,24)||"Custom",dataUrl});
    try{localStorage.setItem(CUSTOM_TOKEN_KEY,JSON.stringify(customTokens));}catch{customTokens=customTokens.filter(t=>t.id!==id);throw new Error("The saved token library is full. Try a smaller picture.");}
    render();
    requestAnimationFrame(()=>{const radio=document.querySelector<HTMLInputElement>(`input[name="token"][value="custom:${id}"]`);if(radio)radio.checked=true;});
  }catch(error){alert((error as Error).message);}
}

function fileToSquarePng(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("That picture could not be read."));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Please choose a valid PNG or JPG picture."));img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;const ctx=canvas.getContext("2d")!;const side=Math.min(img.naturalWidth,img.naturalHeight);const sx=(img.naturalWidth-side)/2,sy=(img.naturalHeight-side)/2;ctx.drawImage(img,sx,sy,side,side,0,0,256,256);resolve(canvas.toDataURL("image/png"));};img.src=String(reader.result);};reader.readAsDataURL(file);});
}

function imageToPng(source:string):Promise<string>{
  if(source.startsWith("data:image/png"))return Promise.resolve(source);
  return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin="anonymous";img.onerror=()=>reject(new Error("The token picture could not be prepared for Owlbear."));img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;const ctx=canvas.getContext("2d")!;ctx.drawImage(img,0,0,256,256);resolve(canvas.toDataURL("image/png"));};img.src=source;});
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
