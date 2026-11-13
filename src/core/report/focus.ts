import type { MainPrincipal, Ride, WmsUnit } from "../types";

/**
 * Narrow the data to one principal, so a whole deck can be made for one
 * entity: only its HUs, and only rides that carry its HUs (as rides of that
 * principal alone). Everything computed from the result ("all principals")
 * is then that principal, and an export holds no figures of the others.
 * Ride dates and list status stay as they are.
 */
export function focusOn(units: readonly WmsUnit[], rides: readonly Ride[], principal: MainPrincipal): { units: WmsUnit[]; rides: Ride[] } {
  return {
    units: units.filter((u) => u.principal === principal),
    rides: rides
      .filter((r) => (r.huByPrincipal[principal] ?? 0) > 0)
      .map((r) => ({ ...r, principals: [principal], huByPrincipal: { [principal]: r.huByPrincipal[principal] }, huCount: r.huByPrincipal[principal]! })),
  };
}
