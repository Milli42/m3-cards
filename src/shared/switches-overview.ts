export const SWITCH_OVERVIEW_DOMAINS = ["switch", "input_boolean"] as const;

export function isOverviewSwitch(entityId: string): boolean {
  return SWITCH_OVERVIEW_DOMAINS.some((domain) => entityId.startsWith(`${domain}.`));
}

export type SwitchOverviewTap =
  | { action: "toggle"; entityId: string }
  | { action: "popup" }
  | { action: "none" };

export function switchOverviewTap(entities: readonly string[]): SwitchOverviewTap {
  if (entities.length === 1) return { action: "toggle", entityId: entities[0] };
  if (entities.length > 1) return { action: "popup" };
  return { action: "none" };
}
