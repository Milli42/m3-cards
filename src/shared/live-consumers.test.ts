import { describe, expect, it } from "vitest";
import type { HassEntity } from "../types";
import { liveConsumers } from "./live-consumers";

function sensor(state: string, unit: string): HassEntity {
  return { entity_id: "sensor.test", state, attributes: { unit_of_measurement: unit }, last_changed: "", last_updated: "" };
}

describe("live consumer power breakdown", () => {
  it("normalizes units and computes the remainder of the whole-home meter", () => {
    const states = { home: sensor("1.5", "kW"), heater: sensor("1.2", "kW"), fridge: sensor("100", "W") };
    expect(liveConsumers(states, ["fridge", "heater"], "home")).toEqual({
      devices: new Map([["fridge", 100], ["heater", 1200]]),
      tracked: 1300, total: 1500, untracked: 200, exceedsTotal: false, denominator: 1500,
    });
  });

  it("excludes invalid, non-consuming, duplicate and whole-home entries", () => {
    const states = {
      home: sensor("1", "MW"), ok: sensor("90000", "mW"), stale: sensor("unavailable", "W"),
      export: sensor("-30", "W"), off: sensor("0", "W"), energy: sensor("90", "kWh"),
      invalid: sensor("2junk", "W"), blank: sensor(" ", "W"), overflow: sensor("1e308", "MW"),
    };
    expect(liveConsumers(states, [...Object.keys(states), "ok", "missing"], "home")).toEqual({
      devices: new Map([["ok", 90]]), tracked: 90, total: 1_000_000, untracked: 999_910, exceedsTotal: false, denominator: 1_000_000,
    });
  });

  it("uses the tracked denominator when the meter is missing or reads below the device sum", () => {
    const states = { home: sensor("400", "W"), device: sensor("500", "W") };
    expect(liveConsumers(states, ["device"], "home")).toMatchObject({ total: 400, tracked: 500, denominator: 500, untracked: 0, exceedsTotal: true });
    expect(liveConsumers(states, ["device"], "missing")).toMatchObject({ total: undefined, tracked: 500, denominator: 500, untracked: 0 });
  });

  it("does not report a mismatch or remainder for float-equivalent totals", () => {
    for (const [home, a, b] of [["0.3", "0.1", "0.2"], ["300.3", "100.1", "200.2"]]) {
      const states = { home: sensor(home, "W"), a: sensor(a, "W"), b: sensor(b, "W") };
      expect(liveConsumers(states, ["a", "b"], "home")).toMatchObject({ untracked: 0, exceedsTotal: false });
    }
  });

  it("preserves a tracked zero only when at least one device has a valid reading", () => {
    const states = { off: sensor("0", "W"), missing: sensor("unavailable", "W") };
    expect(liveConsumers(states, ["off", "missing"])).toMatchObject({ devices: new Map(), tracked: 0 });
    expect(liveConsumers(states, ["missing"]).tracked).toBeUndefined();
  });

  it("distinguishes a valid zero home reading from a missing reading or net export", () => {
    const states = { home: sensor("0", "W"), export: sensor("-1", "W") };
    expect(liveConsumers(states, [], "home")).toMatchObject({ total: 0, denominator: 0 });
    expect(liveConsumers(states, [], "export").total).toBeUndefined();
  });
});
