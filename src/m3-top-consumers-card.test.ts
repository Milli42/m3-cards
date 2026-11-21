import { afterEach, expect, it, vi } from "vitest";
import type { HomeAssistant, M3TopConsumersCardConfig } from "./types";

function values(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === "object" && "values" in value) return values(value.values);
  return [value];
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup(entity: string, source: M3TopConsumersCardConfig["source"] = "entities") {
  vi.stubGlobal("window", new EventTarget());
  const { M3TopConsumersCard } = await import("./m3-top-consumers-card");
  class TestCard extends M3TopConsumersCard {
    public setPeriod(period: M3TopConsumersCardConfig["period"], options?: Partial<M3TopConsumersCardConfig>) {
      this.setConfig({ type: "custom:m3-top-consumers-card", period, source, entities: [{ entity }], ...options });
      this.willUpdate(new Map([["_config", undefined]]));
    }
    public renderedValues() { return values(this.render()); }
  }
  const requests: Array<(response: unknown) => void> = [];
  const card = new TestCard();
  card.hass = {
    states: {}, language: "en", callWS: () => new Promise((resolve) => requests.push(resolve)),
  } as unknown as HomeAssistant;
  return { card, requests };
}

it("loads the same period again when its first request finished in Live mode", async () => {
  const { card, requests } = await setup("sensor.return_meter");
  card.setPeriod("yesterday");
  expect(requests).toHaveLength(1);
  card.setPeriod("live");
  requests[0]({ "sensor.return_meter": [{ change: 11 }] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  card.setPeriod("yesterday");
  // Yesterday has a stable window, so Recorder can reuse its cached response.
  await vi.waitFor(() => expect(card.renderedValues()).toContain("11.00"));
});

it("never displays the old period's data after switching through Live", async () => {
  const { card, requests } = await setup("sensor.meter");
  card.setPeriod("today");
  expect(requests).toHaveLength(1);
  card.setPeriod("live");
  card.setPeriod("yesterday");
  requests[0]({ "sensor.meter": [{ change: 42 }] });
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(card.renderedValues()).not.toContain("42.00");
  requests[1]({ "sensor.meter": [{ change: 17 }] });
  await vi.waitFor(() => expect(card.renderedValues()).toContain("17.00"));
});


it("does not start Recorder when Energy discovery completes in Live mode", async () => {
  const { card, requests } = await setup("sensor.energy_meter", "energy");
  card.setPeriod("today");
  expect(requests).toHaveLength(1);
  card.setPeriod("live");
  requests[0]({ device_consumption: [{ stat_consumption: "sensor.energy_meter" }] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(requests).toHaveLength(1);
});

it("does not reuse yesterday's result after spending midnight in Live", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 21, 23, 59));
  const { card, requests } = await setup("sensor.overnight_meter");
  card.setPeriod("yesterday");
  requests[0]({ "sensor.overnight_meter": [{ change: 27 }] });
  await vi.waitFor(() => expect(card.renderedValues()).toContain("27.00"));
  card.setPeriod("live");
  vi.setSystemTime(new Date(2026, 10, 22, 0, 1));
  card.setPeriod("yesterday");
  expect(card.renderedValues()).not.toContain("27.00");
  expect(requests).toHaveLength(2);
  requests[1]({ "sensor.overnight_meter": [{ change: 8 }] });
  await vi.waitFor(() => expect(card.renderedValues()).toContain("8.00"));
});


it("does not start historical tariff reads after switching to Live", async () => {
  const { card, requests } = await setup("sensor.cost_meter");
  card.setPeriod("today", { unit_mode: "cost", price_source: "energy_dashboard" });
  requests[0]({ "sensor.cost_meter": [{ change: 3 }] });
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  card.setPeriod("live");
  const prefs = { energy_sources: [{ type: "grid", stat_cost: "sensor.grid_cost", stat_energy_from: "sensor.grid_usage" }] };
  requests[1](prefs);
  requests[2](prefs);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(requests).toHaveLength(3);
});


it("retries a cancelled tariff lookup when returning to the same historical settings", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 23, 12));
  const { card, requests } = await setup("sensor.tariff_retry");
  const options = { unit_mode: "cost", price_source: "energy_dashboard" } as const;
  card.setPeriod("yesterday", options);
  requests[0]({ "sensor.tariff_retry": [{ change: 3 }] });
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  card.setPeriod("live");
  const prefs = { energy_sources: [{ type: "grid", stat_cost: "sensor.retry_grid_cost", stat_energy_from: "sensor.retry_grid_usage" }] };
  requests[1](prefs);
  requests[2](prefs);
  // Resume after the pricing helper sees Live but before the card handles its result.
  for (let i = 0; i < 3; i++) await Promise.resolve();
  card.setPeriod("yesterday", options);
  await vi.waitFor(() => expect(requests).toHaveLength(5));
  requests[3](prefs);
  requests[4](prefs);
  await vi.waitFor(() => expect(requests).toHaveLength(7));
  requests[5]({ "sensor.retry_grid_cost": [{ change: 2 }] });
  requests[6]({ "sensor.retry_grid_usage": [{ change: 4 }] });
  await vi.waitFor(() => expect(card.renderedValues()).toContain("€1.50"));
});
