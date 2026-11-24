import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropertyValues } from "lit";
import type { HomeAssistant, M3EnergyFlowCardConfig } from "./types";
import { DEFAULT_FLOW_RADIUS } from "./const";

function templateValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(templateValues);
  if (value && typeof value === "object" && "values" in value) return templateValues(value.values);
  return [value];
}

const config: M3EnergyFlowCardConfig = {
  type: "custom:m3-energy-flow-card",
  layout: "power-station",
  solar_entity: "sensor.solar",
  grid_import_entity: "sensor.ac_in",
  home_entity: "sensor.ac_out",
  battery_soc_entity: "sensor.combined",
  main_battery_soc_entity: "sensor.main",
  extra_battery_soc_entity: "sensor.extra",
};

function hass(readings: Record<string, [string, string]>) {
  return {
    language: "en",
    states: Object.fromEntries(Object.entries(readings).map(([key, [state, unit]]) => {
      const entity_id = `sensor.${key}`;
      return [entity_id, { entity_id, state, attributes: { unit_of_measurement: unit } }];
    })),
    callWS: vi.fn().mockResolvedValue(undefined),
  } as unknown as HomeAssistant;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const energyConfig: M3EnergyFlowCardConfig = { type: config.type, source: "energy" };
const energyPrefs = { energy_sources: [{ type: "solar", stat_energy_from: "sensor.solar" }] };

async function createCard(configOverride = config) {
  const { M3EnergyFlowCard } = await import("./m3-energy-flow-card");
  class TestCard extends M3EnergyFlowCard {
    values() { return templateValues(super.render()); }
    acceptsHass(previous: HomeAssistant) { return super.shouldUpdate(new Map([["hass", previous]]) as PropertyValues); }
    onUpdate() { super.updated(new Map()); }
  }
  const card = new TestCard();
  card.setConfig(configOverride);
  return card;
}

describe("Energy Flow water layout", () => {
  const water: M3EnergyFlowCardConfig = { type: config.type, layout: "water", water_entity: "sensor.flow", water_max: 8 };
  beforeEach(() => vi.stubGlobal("window", new EventTarget()));
  afterEach(() => vi.unstubAllGlobals());

  it("uses the flow sensor directly, sizes the gauge, and opens the sensor history without Energy requests", async () => {
    const card = await createCard(water);
    card.hass = hass({ flow: ["2.4", "gal/min"] });
    card.onUpdate();
    expect(card.hass.callWS).not.toHaveBeenCalled();
    expect(card.values()).toEqual(expect.arrayContaining(["2.4", "gal/min", "Flowing", "width: 30%", "water-moving"]));
    expect(card.values()).not.toContain("Today");
    expect(card.values()).not.toContain("Month");
    const dispatch = vi.spyOn(card, "dispatchEvent");
    card.values().find((v): v is () => void => typeof v === "function")?.();
    expect(dispatch.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([{ entityId: "sensor.flow" }]);
    expect(card.getCardSize()).toBe(2);
    expect(card.getGridOptions().columns).toBe(6);
  });

  it("shows and updates each configured water total independently of the live flow", async () => {
    const totals = { ...water, water_daily_entity: "sensor.today", water_monthly_entity: "sensor.month" };
    const card = await createCard(totals);
    const before = hass({ flow: ["0", "gal/min"], today: ["0", "gal"], month: ["1250.5", "L"] });
    card.hass = before;
    expect(card.values()).toEqual(expect.arrayContaining(["No flow", "Today", "0 gal", "Month", "1,250.5 L"]));
    card.hass = { ...before, states: { ...before.states, "sensor.today": { ...before.states["sensor.today"], state: "unavailable" } } };
    expect(card.acceptsHass(before)).toBe(true);
    expect(card.values()).not.toContain("0 gal");
    expect(card.values()).toContain("—");

    const dispatch = vi.spyOn(card, "dispatchEvent");
    card.values().filter((v): v is () => void => typeof v === "function").forEach(open => open());
    expect(dispatch.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual([
      { entityId: "sensor.flow" }, { entityId: "sensor.today" }, { entityId: "sensor.month" },
    ]);
    const monthlyOnly = { ...totals, water_daily_entity: undefined };
    card.setConfig(monthlyOnly);
    expect(card.values()).not.toContain("Today");
    expect(card.values()).toContain("1,250.5 L");
  });

  it.each([
    ["0", "0", "No flow", "width: 0%"],
    ["unavailable", "—", "Unavailable", "width: 0%"],
    ["-1", "—", "Unavailable", "width: 0%"],
  ])("keeps the gauge still when the reading is %s", async (state, text, status, width) => {
    const card = await createCard(water);
    const before = hass({ flow: ["3", "L/min"] });
    card.hass = before;
    card.hass = hass({ flow: [state, "L/min"] });
    expect(card.acceptsHass(before)).toBe(true);
    expect(card.values()).toEqual(expect.arrayContaining([text, status, width]));
    expect(card.values()).not.toContain("water-moving");
  });

  it("offers flow and total sensors, scale and animation controls for the water layout", async () => {
    const { M3EnergyFlowCardEditor } = await import("./m3-energy-flow-card-editor");
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    class TestEditor extends M3EnergyFlowCardEditor {
      values() { return templateValues(super.render()); }
    }
    const editor = new TestEditor();
    editor.hass = hass({});
    editor.setConfig(water);
    const names = editor.values().flatMap(v => v && typeof v === "object" && "name" in v && "selector" in v ? [v.name] : []);
    expect(names).toEqual(expect.arrayContaining(["layout", "water_entity", "water_daily_entity", "water_monthly_entity", "water_max", "animation"]));
    for (const omitted of ["source", "solar_entity", "show_header", "show_self_sufficiency", "flow_speed"]) {
      expect(names).not.toContain(omitted);
    }
  });

  it("caps the gauge but not the reading and allows motion to be disabled", async () => {
    const card = await createCard({ ...water, animation: "off" });
    card.hass = hass({ flow: ["12.3", "L/min"] });
    expect(card.values()).toEqual(expect.arrayContaining(["12.3", "L/min", "Flowing", "width: 100%"]));
    expect(card.values()).not.toContain("water-moving");
  });
});

describe("Energy Flow power station layout", () => {
  beforeEach(() => vi.stubGlobal("window", new EventTarget()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows three measured power readings and all three supplied battery percentages without calling Energy", async () => {
    const card = await createCard();
    card.hass = hass({ solar: ["0.121", "kW"], ac_in: ["0", "W"], ac_out: ["15", "W"], combined: ["91.6", "%"], main: ["83.2", "%"], extra: ["100", "%"] });
    card.onUpdate();
    expect(card.hass.callWS).not.toHaveBeenCalled();
    expect(card.values().filter(v => typeof v === "string")).toEqual(expect.arrayContaining([
      "Solar In", "AC In", "AC Out", "Combined", "Main Battery", "Extra Battery",
      "0.121 kW", "0 W", "15 W", "91.6%", "83.2%", "100%",
    ]));
    expect(card.getCardSize()).toBe(2);
    expect(card.getGridOptions().columns).toBe(6);
  });

  it("refreshes individual pack changes and distinguishes zero from unavailable and unconfigured", async () => {
    const card = await createCard({ ...config, extra_battery_soc_entity: undefined });
    const before = hass({ solar: ["0", "W"], ac_in: ["unavailable", "W"], combined: ["0", "%"], main: ["83", "%"] });
    card.hass = before;
    expect(card.values()).toContain("0%");
    expect(card.values()).toContain("0 W");
    expect(card.values()).not.toContain("Extra Battery");
    expect(card.values().filter(v => v === "—")).toHaveLength(2);
    card.hass = { ...before, states: { ...before.states, "sensor.main": { ...before.states["sensor.main"], state: "84.4" } } };
    expect(card.acceptsHass(before)).toBe(true);
    expect(card.values()).toContain("84.4%");
  });

  it("opens native More info for each EcoFlow sensor, including an unavailable one", async () => {
    const card = await createCard();
    card.hass = hass({ solar: ["0", "W"], ac_in: ["unavailable", "W"], ac_out: ["15", "W"], combined: ["91.6", "%"], main: ["83.2", "%"], extra: ["100", "%"] });
    const dispatch = vi.spyOn(card, "dispatchEvent");
    const handlers = card.values().filter((v): v is () => void => typeof v === "function");
    expect(handlers).toHaveLength(6);
    handlers.forEach(handler => handler());
    expect(dispatch.mock.calls.map(([event]) => (event as CustomEvent).detail)).toEqual(
      ["solar", "ac_in", "ac_out", "combined", "main", "extra"].map(key => ({ entityId: `sensor.${key}` })),
    );
  });

  it("does not start recorder requests when Energy preferences resolve in power station mode", async () => {
    const prefs = deferred<typeof energyPrefs>();
    const card = await createCard(energyConfig);
    card.hass = hass({});
    const ws = vi.mocked(card.hass.callWS).mockResolvedValue({}).mockReturnValueOnce(prefs.promise);
    card.onUpdate();
    expect(ws).toHaveBeenCalledWith({ type: "energy/get_prefs" });

    card.setConfig(config);
    card.onUpdate();
    prefs.resolve(energyPrefs);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ws).toHaveBeenCalledTimes(1);
  });

  it("starts fresh preferences on returning to Energy even while abandoned preferences are pending", async () => {
    const stalePrefs = deferred<typeof energyPrefs>();
    const card = await createCard(energyConfig);
    card.hass = hass({});
    const ws = vi.mocked(card.hass.callWS).mockResolvedValue({ "sensor.solar": [{ change: 12 }] })
      .mockReturnValueOnce(stalePrefs.promise).mockResolvedValueOnce(energyPrefs);
    card.onUpdate();
    card.setConfig(config);
    card.setConfig(energyConfig);
    card.onUpdate();

    expect(ws).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(card.values()).toContain("12"));
    stalePrefs.resolve(energyPrefs);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ws.mock.calls.map(([message]) => message.type)).toEqual([
      "energy/get_prefs", "energy/get_prefs", "recorder/statistics_during_period",
    ]);
  });

  it("does not publish obsolete recorder totals after leaving and returning to Energy", async () => {
    const staleStats = deferred<Record<string, { change: number }[]>>();
    const freshStats = deferred<Record<string, { change: number }[]>>();
    const card = await createCard(energyConfig);
    card.hass = hass({});
    const ws = vi.mocked(card.hass.callWS)
      .mockResolvedValueOnce(energyPrefs).mockReturnValueOnce(staleStats.promise)
      .mockResolvedValueOnce(energyPrefs).mockReturnValueOnce(freshStats.promise);
    card.onUpdate();
    await vi.waitFor(() => expect(ws).toHaveBeenCalledWith(expect.objectContaining({
      type: "recorder/statistics_during_period",
    })));

    card.setConfig(config);
    card.onUpdate();
    card.setConfig(energyConfig);
    card.onUpdate();
    staleStats.resolve({ "sensor.solar": [{ change: 99 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(card.values()).not.toContain("99");
    expect(ws).toHaveBeenCalledTimes(4);
    freshStats.resolve({ "sensor.solar": [{ change: 12 }] });
    await vi.waitFor(() => expect(card.values()).toContain("12"));
  });

  it.each([
    ["25%; invalid", 18],
    ["0x20", 18],
    [" ", 18],
    [NaN, 18],
    [Infinity, 18],
    [-5, 0],
    ["120", 100],
    [" 22.5 ", 22.5],
  ])("normalizes node tint %s to %s%% for the unresolved-theme CSS fallback", async (value, percent) => {
    // The runtime template result can be a string despite the config type.
    const card = await createCard({ ...config, pv_color: "var(--pv)", node_tint_opacity: value as number });
    card.hass = hass({});
    const solarStyle = card.values().find((v) => typeof v === "string" && v.startsWith("background-color: color-mix(in srgb, var(--pv)"));
    expect(solarStyle).toContain(`var(--pv) ${percent}%,`);
  });

  it.each([
    { radius: Infinity, corners: { top_left: "5px", top_right: NaN, bottom_right: 0, bottom_left: -4 }, expected: `${DEFAULT_FLOW_RADIUS}px ${DEFAULT_FLOW_RADIUS}px 0px 0px` },
    { radius: "20; invalid", corners: {}, expected: `${DEFAULT_FLOW_RADIUS}px `.repeat(4).trim() },
    { radius: " 12.5 ", corners: { top_left: " .5 ", bottom_left: "1e1" }, expected: "0.5px 12.5px 12.5px 10px" },
    { radius: -2, corners: { top_left: 4, top_right: "  " }, expected: "4px 0px 0px 0px" },
  ])("normalizes radius $radius before writing either card style", async ({ radius, corners, expected }) => {
    const card = await createCard({
      ...config,
      radius: radius as number,
      corners: corners as M3EnergyFlowCardConfig["corners"],
    });
    card.hass = hass({});
    const radii = card.values().flatMap((v) => typeof v === "string" ? v.match(/border-radius: ([^;]+);/)?.slice(1) ?? [] : []);
    expect(radii).toEqual([expected, expected]);
  });

  it("offers the power station layout and its direct sensor fields in the editor", async () => {
    const { M3EnergyFlowCardEditor } = await import("./m3-energy-flow-card-editor");
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    class TestEditor extends M3EnergyFlowCardEditor {
      values() { return templateValues(super.render()); }
    }
    const editor = new TestEditor();
    editor.hass = hass({});
    editor.setConfig(config);
    const schemas = editor.values().filter((v): v is { name: string; selector: unknown } =>
      !!v && typeof v === "object" && "name" in v && "selector" in v);
    const names = schemas.map(v => v.name);
    expect(names).toEqual(expect.arrayContaining([
      "solar_entity", "grid_import_entity", "home_entity", "battery_soc_entity", "main_battery_soc_entity", "extra_battery_soc_entity",
    ]));
    expect(names).not.toContain("source");
    expect(names).not.toContain("battery_entity");
    expect(schemas.find(v => v.name === "layout")?.selector).toMatchObject({
      select: { options: expect.arrayContaining([{ value: "power-station", label: "Power station: two rows" }]) },
    });
  });
});
