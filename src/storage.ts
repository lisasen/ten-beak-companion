import OBR from "@owlbear-rodeo/sdk";
import type { Combatant } from "./game";

const ROOM_KEY = "com.tenbeak.companion/state";
const LOCAL_KEY = "ten-beak-template-library-v1";

export interface GameState {
  combatants: Combatant[];
  activeAttackerId: string;
  activeTargetId: string;
  log: string[];
  gameWon: boolean;
}

export const emptyState = (): GameState => ({
  combatants: [],
  activeAttackerId: "",
  activeTargetId: "",
  log: ["The realm awaits."],
  gameWon: false
});

export async function loadState(inOwlbear: boolean): Promise<GameState> {
  if (inOwlbear) {
    const metadata = await OBR.room.getMetadata();
    return (metadata[ROOM_KEY] as GameState | undefined) ?? emptyState();
  }
  const raw = localStorage.getItem(ROOM_KEY);
  return raw ? JSON.parse(raw) as GameState : emptyState();
}

export async function saveState(state: GameState, inOwlbear: boolean): Promise<void> {
  state.log = state.log.slice(-30);
  if (inOwlbear) await OBR.room.setMetadata({ [ROOM_KEY]: state });
  else localStorage.setItem(ROOM_KEY, JSON.stringify(state));
}

export function loadTemplates(): Combatant[] {
  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) as Combatant[] : [];
}

export function saveTemplates(templates: Combatant[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(templates));
}

export { ROOM_KEY };
