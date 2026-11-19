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
  it("toggles the only switch in a room", () => {
    expect(switchOverviewTap(["switch.workbench"])).toEqual({
      action: "toggle",
      entityId: "switch.workbench",
    });
  });

  it("opens the room popup when there is more than one switch", () => {
    expect(switchOverviewTap(["switch.workbench", "input_boolean.notifications"])).toEqual({ action: "popup" });
  });

  it("takes no action for an empty room", () => {
    expect(switchOverviewTap([])).toEqual({ action: "none" });
  });
});
