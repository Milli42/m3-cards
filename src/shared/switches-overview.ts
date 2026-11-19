import { hasFeature, MP_FEATURE } from "./remote-profiles";

export const SWITCH_OVERVIEW_DOMAINS = ["switch", "input_boolean", "media_player"] as const;

export function isOverviewSwitch(entityId: string): boolean {
  return SWITCH_OVERVIEW_DOMAINS.some((domain) => entityId.startsWith(`${domain}.`));
}

export function isOverviewMediaPlayer(entityId: string): boolean {
  return entityId.startsWith("media_player.");
}

export function includesOverviewMediaPlayer(
  explicitlyIncluded: boolean,
  includeMediaPlayers: boolean,
  supportedFeatures: number | undefined,
): boolean {
  return explicitlyIncluded ||
    (includeMediaPlayers && hasFeature(supportedFeatures, MP_FEATURE.TURN_ON | MP_FEATURE.TURN_OFF));
}

const isUnavailable = (state: string): boolean => state === "unavailable" || state === "unknown";

export function isOverviewSwitchOn(entityId: string, state: string): boolean {
  if (!isOverviewMediaPlayer(entityId)) return state === "on";
  return state !== "off" && state !== "standby" && !isUnavailable(state);
}

export function switchOverviewService(entityId: string, state: string | undefined) {
  if (state === undefined || isUnavailable(state)) return;
  if (isOverviewMediaPlayer(entityId)) {
    return { domain: "media_player", service: isOverviewSwitchOn(entityId, state) ? "turn_off" : "turn_on" };
  }
  if (state === "on" || state === "off") return { domain: "homeassistant", service: "toggle" };
}

export type SwitchOverviewTap =
  | { action: "toggle"; entityId: string }
  | { action: "popup" }
  | { action: "none" };

export function switchOverviewTap(entities: readonly string[], entityView: boolean): SwitchOverviewTap {
  if (!entityView) return { action: "popup" };
  if (entities.length === 1) return { action: "toggle", entityId: entities[0] };
  return { action: "none" };
}
