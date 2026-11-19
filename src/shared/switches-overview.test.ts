import { describe, expect, it } from "vitest";
import { isOverviewSwitch, switchOverviewTap } from "./switches-overview";

describe("isOverviewSwitch", () => {
  it.each(["switch.workbench", "input_boolean.notifications"])("includes %s", (id) => {
    expect(isOverviewSwitch(id)).toBe(true);
  });

  it.each(["light.workbench", "fan.office", "switchboard.garage", "input_boolean"])("excludes %s", (id) => {
    expect(isOverviewSwitch(id)).toBe(false);
  });
});

describe("switchOverviewTap", () => {
  it("opens the room popup for a single switch", () => {
    expect(switchOverviewTap(["switch.workbench"], false)).toEqual({ action: "popup" });
  });

  it("opens the room popup for multiple switches", () => {
    expect(switchOverviewTap(["switch.workbench", "input_boolean.notifications"], false)).toEqual({ action: "popup" });
  });

  it("opens the room popup for an empty room", () => {
    expect(switchOverviewTap([], false)).toEqual({ action: "popup" });
  });

  it("toggles an individual entity tile", () => {
    expect(switchOverviewTap(["switch.workbench"], true)).toEqual({
      action: "toggle",
      entityId: "switch.workbench",
    });
  });
});
