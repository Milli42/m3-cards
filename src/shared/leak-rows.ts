import type { M3LeakCardConfig } from "../types";

export function leakRowList<T extends { rowState: string }>(
  rows: T[],
  config: Pick<M3LeakCardConfig, "show_only_wet" | "collapse_ok" | "max_visible">,
  state: "ok" | "stale" | "alarm",
  showAll: boolean,
) {
  if (config.show_only_wet !== false) {
    const wetRows = rows.filter((row) => row.rowState === "wet");
    return { visibleRows: wetRows, showList: wetRows.length > 0, collapseOk: false, hiddenCount: 0 };
  }

  // An alarm always shows the full list.
  const maxVisible = state === "alarm" ? 0 : (config.max_visible ?? 0);
  return {
    visibleRows: maxVisible > 0 && !showAll ? rows.slice(0, maxVisible) : rows,
    showList: true,
    collapseOk: config.collapse_ok === true && state === "ok",
    hiddenCount: maxVisible > 0 ? Math.max(0, rows.length - maxVisible) : 0,
  };
}
