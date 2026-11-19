import { describe, expect, it } from "vitest";
import {
  includesOverviewMediaPlayer,
  isOverviewSwitch,
  isOverviewSwitchOn,
  switchOverviewService,
  switchOverviewTap,
} from "./switches-overview";

describe("isOverviewSwitch", () => {
  it.each(["switch.workbench", "input_boolean.notifications", "media_player.receiver"])("includes %s", (id) => {
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

describe("media player discovery eligibility", () => {
  it("requires opt-in and both power features for automatic discovery", () => {
    expect(includesOverviewMediaPlayer(false, false, 384)).toBe(false);
    expect(includesOverviewMediaPlayer(false, true, 128)).toBe(false);
    expect(includesOverviewMediaPlayer(false, true, 256)).toBe(false);
    expect(includesOverviewMediaPlayer(false, true, undefined)).toBe(false);
    expect(includesOverviewMediaPlayer(false, true, 388)).toBe(true);
  });

  it("allows an explicitly included media player without power feature flags", () => {
    expect(includesOverviewMediaPlayer(true, false, undefined)).toBe(true);
  });
});

describe("overview power state and service", () => {
  const receiver = "media_player.receiver";

  it.each(["on", "idle", "playing", "paused"])("turns off a receiver in state %s", (state) => {
    expect(isOverviewSwitchOn(receiver, state)).toBe(true);
    expect(switchOverviewService(receiver, state)).toEqual({ domain: "media_player", service: "turn_off" });
  });

  it.each(["off", "standby"])("turns on a receiver in state %s", (state) => {
    expect(isOverviewSwitchOn(receiver, state)).toBe(false);
    expect(switchOverviewService(receiver, state)).toEqual({ domain: "media_player", service: "turn_on" });
  });

  it.each(["unavailable", "unknown"])("skips a receiver in state %s", (state) => {
    expect(isOverviewSwitchOn(receiver, state)).toBe(false);
    expect(switchOverviewService(receiver, state)).toBeUndefined();
  });

  it.each(["switch.workbench", "input_boolean.notifications"])("keeps toggle behavior for %s", (id) => {
    expect(isOverviewSwitchOn(id, "on")).toBe(true);
    expect(isOverviewSwitchOn(id, "idle")).toBe(false);
    expect(switchOverviewService(id, "off")).toEqual({ domain: "homeassistant", service: "toggle" });
    expect(switchOverviewService(id, "unknown")).toBeUndefined();
  });
});
