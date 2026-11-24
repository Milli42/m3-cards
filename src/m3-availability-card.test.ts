import { nothing, type PropertyValues, type TemplateResult } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeAssistant, M3AvailabilityCardConfig } from "./types";

const entity = "switch.porch";
const baseConfig = { type: "custom:m3-availability-card", animation: "off" } as const;
const registry = {
  entities: { [entity]: { entity_id: entity, device_id: "porch", platform: "mqtt" } },
  devices: { porch: { id: "porch", name: "Porch plug" } },
};

async function setup(config: Partial<M3AvailabilityCardConfig> = {}, mutes = {}) {
  vi.stubGlobal("window", new EventTarget());
  const { M3AvailabilityCard } = await import("./m3-availability-card");
  class TestCard extends M3AvailabilityCard {
    public snapshot(changed: PropertyValues) {
      super.willUpdate(changed);
      return super.render();
    }
  }
  const card = new TestCard();
  card.setConfig({ ...baseConfig, ...config });
  const setState = (state: string, hoursAgo = 0) => {
    const previous = card.hass;
    const stamp = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
    card.hass = {
      ...registry,
      language: "en",
      states: { [entity]: { entity_id: entity, state, attributes: {}, last_changed: stamp, last_reported: stamp } },
      callWS: async ({ type }: { type: string }) => (type === "frontend/get_user_data" ? { value: mutes } : {}),
    } as unknown as HomeAssistant;
    return card.snapshot(new Map<string, unknown>([["hass", previous]]));
  };
  return { card, setState };
}

describe("Availability card visibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hides when healthy, reappears for an outage, and hides on recovery", async () => {
    const { card, setState } = await setup({ hide_when_ok: true });
    const visibility = vi.fn();
    card.addEventListener("card-visibility-changed", visibility);

    expect(setState("on")).toBe(nothing);
    expect(card.hasAttribute("hidden")).toBe(true);
    expect(setState("unavailable")).not.toBe(nothing);
    expect(card.hasAttribute("hidden")).toBe(false);
    expect(setState("off")).toBe(nothing);
    expect(setState("on")).toBe(nothing);
    expect(visibility.mock.calls.map(([event]) => event.detail.value)).toEqual([false, true, false]);
  });

  it("shows the healthy summary by default", async () => {
    const { setState } = await setup();
    expect(setState("on")).not.toBe(nothing);
  });

  it("keeps the card visible in editor previews", async () => {
    const { card, setState } = await setup({ hide_when_ok: true });
    card.preview = true;
    expect(setState("on")).not.toBe(nothing);
  });

  it("shows an unmuted device flagged by configured stale detection", async () => {
    const { setState } = await setup({ hide_when_ok: true, stale_hours: 1, stale_integrations: ["mqtt"] });
    expect(setState("on", 2)).not.toBe(nothing);
  });

  it("stays connected for updates when the only outage is muted", async () => {
    const { card, setState } = await setup({ hide_when_ok: true }, { porch: { until: null, at: Date.now() } });
    setState("on");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setState("unavailable")).toBe(nothing);
    expect(card.connectedWhileHidden).toBe(true);
  });

  it("offers a Display toggle off by default and saves it when switched on", async () => {
    vi.stubGlobal("window", new EventTarget());
    const { M3AvailabilityCardEditor } = await import("./m3-availability-card-editor");
    class TestEditor extends M3AvailabilityCardEditor {
      public render() { return super.render(); }
    }
    const editor = new TestEditor();
    editor.hass = { language: "en" } as HomeAssistant;
    editor.setConfig(baseConfig);
    const display = (editor.render() as TemplateResult).values.find(
      (panel): panel is TemplateResult => !!panel && typeof panel === "object" &&
        "values" in panel && Array.isArray(panel.values) && panel.values.includes("Display"),
    );
    expect(display?.values).toContainEqual(expect.arrayContaining([{ name: "hide_when_ok", selector: { boolean: {} } }]));
    expect(display?.values).toContainEqual(expect.objectContaining({ hide_when_ok: false }));
    const onChange = display?.values.slice().reverse().find((value) => typeof value === "function");
    const emit = vi.fn();
    editor.addEventListener("config-changed", emit);
    onChange?.(new CustomEvent("value-changed", { detail: { value: { hide_when_ok: true } } }));
    expect(emit.mock.calls[0][0].detail.config.hide_when_ok).toBe(true);
  });
});
