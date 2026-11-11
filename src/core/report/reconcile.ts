import { dayKey } from "../dates";
import { inRange, type ReportPeriod } from "../period";
import type { Direction, Principal, Ride, WmsUnit } from "../types";
import { PRINCIPALS } from "../types";
import type { RejectedRow, RejectReason } from "../wms/enrich";
import { directionalDate, rideOf } from "../wms/rides";

/**
 * Volume reconciliation: explains, per direction, how the number of rows in
 * the WMS file with a date in the period becomes the number on the slide.
 * Meant to compare one-to-one with a count in the WMS or in Excel.
 */
export interface DirectionReconciliation {
  /** Rows in the file (accepted + rejected) with an Inslag/Uitslag Unit in the period. */
  rowsInFile: number;
  rejected: Partial<Record<RejectReason, number>>;
  /** = HUs on the slide (Total). */
  counted: number;
  perPrincipal: Record<Principal, number>;
  /** Clients not mapped to WIAG/AWKG/Liqui Moly; they are in the total but on no principal slide. */
  overigClients: Record<string, number>;
  /** Counted HUs without a ride number: in the HU figures, not in the ride figures. */
  husWithoutRide: number;
  /** = rides on the slide: distinct rides whose canonical day is in the period. */
  rides: number;
  /** Distinct ride numbers among the counted HUs (how Lovable counted). */
  rideNumbersOnHus: number;
  /** Ride numbers with HUs in the period but a canonical day outside it (counted in the other period). */
  ridesCountedElsewhere: string[];
}

export type VolumeReconciliation = Record<Direction, DirectionReconciliation>;

export function reconcileVolume(
  units: readonly WmsUnit[],
  rejected: readonly RejectedRow[],
  rides: readonly Ride[],
  period: ReportPeriod,
): VolumeReconciliation {
  const inP = (d: Date | null) => d !== null && inRange(dayKey(d), period);

  const forDirection = (direction: Direction): DirectionReconciliation => {
    const rej: Partial<Record<RejectReason, number>> = {};
    let rejectedCount = 0;
    for (const r of rejected) {
      if (!inP(direction === "inbound" ? r.inslagUnit : r.uitslagUnit)) continue;
      rej[r.reason] = (rej[r.reason] ?? 0) + 1;
      rejectedCount++;
    }

    const perPrincipal = Object.fromEntries(PRINCIPALS.map((p) => [p, 0])) as Record<Principal, number>;
    const overigClients: Record<string, number> = {};
    const rideNumbers = new Set<string>();
    let counted = 0;
    let husWithoutRide = 0;
    for (const u of units) {
      if (!inP(directionalDate(u, direction))) continue;
      counted++;
      perPrincipal[u.principal]++;
      if (u.principal === "Overig") {
        const k = u.opdrachtgever || "(leeg)";
        overigClients[k] = (overigClients[k] ?? 0) + 1;
      }
      const rit = rideOf(u, direction);
      if (rit) rideNumbers.add(rit);
      else husWithoutRide++;
    }

    const dirRides = rides.filter((r) => r.direction === direction);
    const canonicalIn = new Set(dirRides.filter((r) => inRange(r.canonicalDate, period)).map((r) => r.ritNummer));
    return {
      rowsInFile: counted + rejectedCount,
      rejected: rej,
      counted,
      perPrincipal,
      overigClients,
      husWithoutRide,
      rides: canonicalIn.size,
      rideNumbersOnHus: rideNumbers.size,
      ridesCountedElsewhere: [...rideNumbers].filter((r) => !canonicalIn.has(r)).sort(),
    };
  };

  return { inbound: forDirection("inbound"), outbound: forDirection("outbound") };
}
