import type { HassEntity } from "../types";

// SI prefixes are case-sensitive: mW and MW are different units.
const POWER_FACTORS = new Map([["mW", 0.001], ["W", 1], ["kW", 1000], ["MW", 1_000_000], ["GW", 1_000_000_000]]);

function readWatts(state: HassEntity | undefined): number | undefined {
  const unit: unknown = state?.attributes.unit_of_measurement;
  const factor = typeof unit === "string" ? POWER_FACTORS.get(unit.trim()) : undefined;
  if (factor === undefined || !state?.state.trim()) return undefined;
  const watts = Number(state.state) * factor;
  return Number.isFinite(watts) && watts >= 0 ? watts : undefined;
}

/** Live consumption in watts. Do not treat export, offline sensors or energy totals as load. */
export function liveConsumers(states: Record<string, HassEntity>, deviceIds: string[], totalEntity?: string) {
  const devices = new Map<string, number>();
  let tracked: number | undefined;
  for (const id of new Set(deviceIds)) {
    if (id === totalEntity) continue;
    const watts = readWatts(states[id]);
    if (watts === undefined) continue;
    tracked = (tracked ?? 0) + watts;
    if (watts > 0) devices.set(id, watts);
  }
  const total = totalEntity ? readWatts(states[totalEntity]) : undefined;
  const denominator = Math.max(total ?? 0, tracked ?? 0);
  // Normalize near-equal sums without inventing an untracked or excess load
  // from floating-point conversion and addition errors.
  const tolerance = denominator * Number.EPSILON * (devices.size + 2);
  const difference = total === undefined ? 0 : total - (tracked ?? 0);
  return {
    devices,
    tracked,
    total,
    untracked: difference > tolerance ? difference : 0,
    exceedsTotal: difference < -tolerance,
    denominator,
  };
}
