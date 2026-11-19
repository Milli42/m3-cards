import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";
import { LIGHTS_OVERVIEW_FAN_COLOR } from "./const";
import { resolveThemeColor } from "./shared/color-config";

function tileColors(value: unknown): string[] {
  if (typeof value === "string" && value.startsWith("--tile-color:")) {
    return [value.split(";")[0]];
  }
  if (Array.isArray(value)) return value.flatMap(tileColors);
  if (value && typeof value === "object" && "values" in value) return tileColors(value.values);
  return [];
}

describe("Lights Overview fan color", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [undefined, LIGHTS_OVERVIEW_FAN_COLOR],
    ["primary", resolveThemeColor("primary")],
    ["#7F33CA", "#7F33CA"],
  ])("uses fan_color %s independently of the light color", async (fanColor, expected) => {
    vi.stubGlobal("window", new EventTarget());
    const { M3LightsOverviewCard } = await import("./m3-lights-overview-card");
    class TestCard extends M3LightsOverviewCard {
      public render() {
        return super.render();
      }
    }
    const card = new TestCard();
    card.setConfig({
      type: "custom:m3-lights-overview-card",
      rooms: [{ name: "Office", entities: ["light.office"] }],
      on_color: "#FFAA00",
      fan_color: fanColor,
    });
    card.hass = {
      states: {
        "light.office": { entity_id: "light.office", state: "on", attributes: {} },
        "fan.office": { entity_id: "fan.office", state: "on", attributes: {} },
      },
    } as unknown as HomeAssistant;
    expect(tileColors(card.render())).toEqual([
      `--tile-color: ${expected}`,
      "--tile-color: #FFAA00",
    ]);
  });
});
