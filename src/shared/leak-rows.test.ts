import { describe, it, expect } from "vitest";
import { leakRowList } from "./leak-rows";

describe("leakRowList", () => {
  const wet = { rowState: "wet" };
  const alsoWet = { rowState: "wet", battery: 10 };
  const dry = { rowState: "dry" };
  const lowBattery = { rowState: "dry", battery: 10 };
  const stale = { rowState: "stale" };
  const offline = { rowState: "unavailable" };

  it("omits the list and toggles when no sensor is wet", () => {
    const config = { collapse_ok: true, max_visible: 1 };
    const hiddenList = { visibleRows: [], showList: false, collapseOk: false, hiddenCount: 0 };
    expect(leakRowList([dry, lowBattery], config, "ok", false)).toEqual(hiddenList);
    expect(leakRowList([offline, stale, dry], config, "stale", false)).toEqual(hiddenList);
  });

  it("shows every sensor detecting moisture during an alarm", () => {
    const rows = [wet, alsoWet, offline, stale, lowBattery, dry];
    expect(leakRowList(rows, { max_visible: 1 }, "alarm", false)).toEqual({
      visibleRows: [wet, alsoWet],
      showList: true,
      collapseOk: false,
      hiddenCount: 0,
    });
  });

  it("keeps the full-list collapse and overflow options when opted out", () => {
    const config = { show_only_wet: false, collapse_ok: true, max_visible: 1 };
    expect(leakRowList([dry, lowBattery], config, "ok", false)).toEqual({
      visibleRows: [dry],
      showList: true,
      collapseOk: true,
      hiddenCount: 1,
    });
    expect(leakRowList([offline, dry], config, "stale", true).visibleRows).toEqual([offline, dry]);
    expect(leakRowList([wet, offline, dry], config, "alarm", false)).toEqual({
      visibleRows: [wet, offline, dry],
      showList: true,
      collapseOk: false,
      hiddenCount: 0,
    });
  });
});
