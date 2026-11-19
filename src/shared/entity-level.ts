import type { HassEntity } from "../types";
import type { TranslationKey } from "../localize";
import { clampLightBrightnessPercent, isDimmableLight, lightBrightnessPercent } from "./light-brightness";

const FAN_SET_SPEED = 1;

export interface EntityLevel {
  label: TranslationKey;
  value: number;
  step: number;
  snap: (percent: number) => number;
  domain: "light" | "fan";
  service: "turn_on" | "set_percentage";
  field: "brightness_pct" | "percentage";
}

export function entityLevel(entity: HassEntity): EntityLevel | undefined {
  if (isDimmableLight(entity)) {
    return {
      label: "light_brightness_label",
      value: lightBrightnessPercent(entity),
      step: 5,
      snap: clampLightBrightnessPercent,
      domain: "light",
      service: "turn_on",
      field: "brightness_pct",
    };
  }

  if (!entity.entity_id.startsWith("fan.")) return undefined;
  const { supported_features, percentage, percentage_step } = entity.attributes;
  const hasSpeed = typeof supported_features === "number" && (supported_features & FAN_SET_SPEED) !== 0;
  const hasStep = typeof percentage_step === "number" && percentage_step > 0 && percentage_step <= 100;
  if (!hasSpeed && percentage === undefined && !hasStep) return undefined;

  const step = hasStep ? percentage_step : 1;
  return {
    label: "lights_overview_fan_speed",
    value: entity.state === "on" && typeof percentage === "number" && Number.isFinite(percentage)
      ? Math.max(0, Math.min(100, percentage))
      : 0,
    step: hasStep ? step : 5,
    snap: (percent) => {
      if (percent >= 100) return 100;
      const snapped = Math.max(1, Math.round(percent / step)) * step;
      // A rounded step such as 33.33 still represents an exact full-speed endpoint.
      return snapped >= 99.95 ? 100 : Number(snapped.toFixed(6));
    },
    domain: "fan",
    service: "set_percentage",
    field: "percentage",
  };
}
