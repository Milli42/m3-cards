import type { HassEntity } from "../types";
import { LIGHT_MIN_BRIGHTNESS_PCT } from "../const";

export function hasDimmableColorMode(modes: unknown): boolean {
  return Array.isArray(modes) && modes.some((mode) => typeof mode === "string" && mode !== "onoff");
}

export function isDimmableLight(entity: HassEntity): boolean {
  return entity.entity_id.startsWith("light.") && hasDimmableColorMode(entity.attributes.supported_color_modes);
}

export function lightBrightnessPercent(entity: HassEntity): number {
  const brightness = entity.attributes.brightness;
  return entity.state === "on" && typeof brightness === "number" && Number.isFinite(brightness)
    ? Math.min(100, Math.max(0, Math.round((brightness / 255) * 100)))
    : 0;
}

export function clampLightBrightnessPercent(percent: number): number {
  return Math.min(100, Math.max(LIGHT_MIN_BRIGHTNESS_PCT, Math.round(percent)));
}

export function splitLightTurnOnTargets(
  entityIds: string[],
  states: Record<string, HassEntity>,
  toggleOnBrightness: number | false = 100,
): { dimmable: string[]; remaining: string[]; brightness: number } {
  if (toggleOnBrightness === false || toggleOnBrightness === 0) {
    return { dimmable: [], remaining: entityIds, brightness: 0 };
  }

  const brightness = clampLightBrightnessPercent(
    Number.isFinite(toggleOnBrightness) ? toggleOnBrightness : 100,
  );
  const dimmable: string[] = [];
  const remaining: string[] = [];
  for (const id of entityIds) {
    const entity = states[id];
    if (entity && isDimmableLight(entity)) dimmable.push(id);
    else remaining.push(id);
  }
  return { dimmable, remaining, brightness };
}
