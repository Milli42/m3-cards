import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";

function templateValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(templateValues);
  if (value && typeof value === "object" && "values" in value) return templateValues(value.values);
  return [value];
}

describe("Openings card", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows open rows and folds away controls once everything is secure", async () => {
    vi.stubGlobal("window", new EventTarget());
    const { M3OpeningsCard } = await import("./m3-openings-card");
    class TestCard extends M3OpeningsCard {
      public render() {
        return super.render();
      }
    }
    const last_changed = "2026-11-19T00:00:00Z";
    const states = {
      "cover.garage": { entity_id: "cover.garage", state: "open", attributes: {}, last_changed },
      "lock.front": { entity_id: "lock.front", state: "unlocked", attributes: {}, last_changed },
      "lock.back": { entity_id: "lock.back", state: "locked", attributes: {}, last_changed },
      "binary_sensor.window": { entity_id: "binary_sensor.window", state: "off", attributes: {}, last_changed },
      "binary_sensor.side_door": { entity_id: "binary_sensor.side_door", state: "unavailable", attributes: {}, last_changed },
    };
    const card = new TestCard();
    card.setConfig({
      type: "custom:m3-openings-card",
      entities: Object.keys(states),
      max_chips: 1,
    });
    card.hass = { states, language: "en" } as unknown as HomeAssistant;

    const values = templateValues(card.render());
    expect(values).toContain("cover.garage");
    expect(values).toContain("lock.front");
    expect(values).toContain("Close");
    expect(values).toContain("Lock");
    expect(values.some((value) => typeof value === "string" && value.startsWith("chip:"))).toBe(false);

    card.hass = {
      language: "en",
      states: {
        ...states,
        "cover.garage": { ...states["cover.garage"], state: "closed" },
        "lock.front": { ...states["lock.front"], state: "locked" },
        "binary_sensor.side_door": { ...states["binary_sensor.side_door"], state: "off" },
      },
    } as unknown as HomeAssistant;
    const secure = templateValues(card.render());
    expect(secure).toContain("All secure");
    expect(secure).not.toContain("Unlock");
    const expand = secure.find((value) => typeof value === "function");
    expect(expand).toBeTypeOf("function");
    expand?.();

    const expanded = templateValues(card.render());
    expect(expanded).toContain("Open");
    expect(expanded).toContain("Unlock");
  });
});
