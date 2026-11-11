import { dayKey } from "../dates";
import type { DayKey, WmsUnit } from "../types";

/**
 * Margins for the Laaddatum range of the unit overview (used by
 * requirements.ts). Laaddatum is the pick-up date at the supplier, not the date the
 * pallet passes the warehouse. Measured on 2025–2026 data (128.000 pallets):
 *
 *   before the ride: outbound 98,75% within 2 months, 99,97% within 4 months,
 *                    all within 6 months; inbound 99,98% within 2 months;
 *   after the ride:  0,15% (outbound) and 0,33% (inbound) more than a week
 *                    after the ride date, practically none more than a month.
 *
 * Hence: from 4 months before the first ride month up to 1 month after the
 * last ride date.
 */
export const LEAD_MONTHS = 4;
export const TRAIL_MONTHS = 1;

/** Last day on which any pallet was scanned in or out: periods after it have not happened yet. */
export function lastScanDay(units: readonly WmsUnit[]): DayKey | null {
  let last: DayKey | null = null;
  for (const u of units) {
    for (const d of [u.inslagUnit, u.uitslagUnit]) {
      if (!d) continue;
      const k = dayKey(d);
      if (last === null || k > last) last = k;
    }
  }
  return last;
}
