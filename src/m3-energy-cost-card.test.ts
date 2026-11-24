import { afterEach, expect, it, vi } from "vitest";
import type { HomeAssistant } from "./types";

function values(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === "object" && "values" in value) return values(value.values);
  return [value];
}

const rows = [
  { name: "Home electricity", today_cost: "sensor.home_day_cost", today_energy: "sensor.home_day_energy", month_cost: "sensor.home_month_cost", month_energy: "sensor.home_month_energy" },
  { name: "Truck charging", today_cost: "sensor.truck_day_cost", today_energy: "sensor.truck_day_energy", month_cost: "sensor.truck_month_cost", month_energy: "sensor.truck_month_energy" },
];

async function setup() {
  vi.stubGlobal("window", new EventTarget());
  const { M3EnergyCostCard } = await import("./m3-energy-cost-card");
  class TestCard extends M3EnergyCostCard {
    rendered() { return values(this.render()); }
  }
  const card = new TestCard();
  card.setConfig({ type: "custom:m3-energy-cost-card", currency: "USD", rows });
  const callWS = vi.fn();
  const states = Object.fromEntries(Object.entries({
    home_day_cost: "4.16", home_day_energy: "33", home_month_cost: "47.04", home_month_energy: "376",
    truck_day_cost: "0.45", truck_day_energy: "4", truck_month_cost: "11.64", truck_month_energy: "93",
  }).map(([key, state]) => [`sensor.${key}`, { state, attributes: { unit_of_measurement: key.endsWith("_cost") ? "$" : "kWh" } }]));
  card.hass = { states, language: "en-US", callWS } as unknown as HomeAssistant;
  return { card, callWS, states };
}

afterEach(() => vi.unstubAllGlobals());

it("shows each period's supplied cost ahead of its energy, in row order, without querying Recorder", async () => {
  const { card, callWS } = await setup();
  const expected = ["Home electricity", "$4.16", "33 kWh", "$47.04", "376 kWh", "Truck charging", "$0.45", "4 kWh", "$11.64", "93 kWh"];
  expect(card.rendered().filter((value) => expected.includes(value as string))).toEqual(expected);
  expect(callWS).not.toHaveBeenCalled();
});

it("keeps zero and negative credits distinct from unavailable or missing sensors", async () => {
  const { card, states } = await setup();
  states["sensor.home_day_cost"].state = "unavailable";
  states["sensor.home_day_energy"].state = "0";
  states["sensor.home_month_cost"].state = "-5.2";
  delete states["sensor.truck_month_energy"];
  const rendered = card.rendered();
  expect(rendered.filter((value) => value === "—")).toHaveLength(2);
  expect(rendered).toContain("0 kWh");
  expect(rendered).toContain("-$5.20");
});

it("renders a partially configured row while the user is picking sensors", async () => {
  const { card } = await setup();
  card.setConfig({ type: "custom:m3-energy-cost-card", rows: [{ name: "Home electricity", today_cost: "sensor.home_day_cost" }] });
  const displayed = card.rendered();
  expect(displayed).toContain("$4.16");
  expect(displayed.filter((value) => value === "—")).toHaveLength(3);
});

it("labels the existing monthly sensor Month without implying a calendar reset", async () => {
  const { card } = await setup();
  expect(card.rendered()).toContain("Month");
  expect(card.rendered()).not.toContain("Month to date");
});

it("keeps the period labels and row icons without rendering a card title or icon", async () => {
  const { card } = await setup();
  card.setConfig({ type: "custom:m3-energy-cost-card", rows: [{ ...rows[0], icon: "mdi:home-lightning-bolt" }] });
  const displayed = card.rendered();
  expect(displayed).toContain("Today");
  expect(displayed).toContain("Month");
  expect(displayed).toContain("mdi:home-lightning-bolt");
  expect(displayed).not.toContain("Energy & Cost");
  expect(displayed).not.toContain("mdi:cash-lightning");
});
