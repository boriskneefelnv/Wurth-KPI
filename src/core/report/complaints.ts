import { TARGETS } from "../constants";
import type { PortalComplaint } from "../complaints/portal";
import { bucketIndex, inRange } from "../period";
import type { DayKey, Direction, MainPrincipal, Ride } from "../types";
import { MAIN_PRINCIPALS } from "../types";
import { pct, selectedRides, type ReportContext } from "./context";

/**
 * Complaints in a report period and the complaint-free KPIs:
 *
 *   rides without complaint = (rides − rides with a complaint) / rides
 *   HUs without complaint   = (HUs − affected HUs) / HUs
 *
 * Rides and HUs: inbound and outbound together, dated as in volume. A
 * complaint counts unless it was denied. It is dated by its ride when it is
 * linked to one (so complaint and ride fall in the same period), else by the
 * incident date. Affected HUs: the pallets in the complaint (1 when not
 * filled in), at most the HUs of the ride. Complaints without a ride (mostly
 * battery and label complaints in the warehouse) count as complaints but not
 * in the ride and HU percentages.
 */

export type ComplaintKey = MainPrincipal | "Total";

export interface ComplaintItem {
  klachtnr: number;
  day: DayKey;
  incidentDay: DayKey | null;
  subject: string;
  principal: MainPrincipal | null;
  origin: PortalComplaint["origin"];
  verdict: PortalComplaint["verdict"];
  category: PortalComplaint["category"];
  pallets: number | null;
  amount: number | null;
  ritNummer: string | null;
  /** Ride direction; "warehouse" when there is no ride. */
  direction: Direction | "warehouse";
  /** In the KPI: not denied. */
  counted: boolean;
}

export interface FreeLevel {
  total: number;
  affected: number;
  /** Share without complaint, in %; null without rides or HUs. */
  pct: number | null;
}

export interface ComplaintKpi {
  rides: FreeLevel;
  hus: FreeLevel;
  perBucket: { key: string; label: string; rides: FreeLevel; hus: FreeLevel }[];
}

export interface ComplaintBlock {
  target: number;
  /** First day the complaints export covers (start of the month of its first incident); null without complaints. */
  coverageFrom: DayKey | null;
  items: ComplaintItem[];
  kpi: Record<ComplaintKey, ComplaintKpi>;
}

const KEYS: ComplaintKey[] = ["Total", ...MAIN_PRINCIPALS];

export function computeComplaints(ctx: ReportContext, complaints: readonly PortalComplaint[]): ComplaintBlock {
  const findRide = (tokens: string[]): Ride | null => {
    for (const t of tokens) {
      const r = ctx.rides.outbound.get(t) ?? ctx.rides.inbound.get(t);
      if (r) return r;
    }
    return null;
  };

  const items: ComplaintItem[] = [];
  for (const c of complaints) {
    const ride = findRide(c.rideTokens);
    const day = ride ? ride.canonicalDate : c.incidentDay;
    if (!day || !inRange(day, ctx.period)) continue;
    items.push({
      klachtnr: c.klachtnr,
      day,
      incidentDay: c.incidentDay,
      subject: c.subject,
      principal: c.principal,
      origin: c.origin,
      verdict: c.verdict,
      category: c.category,
      pallets: c.pallets,
      amount: c.amount,
      ritNummer: ride ? ride.ritNummer : null,
      direction: ride ? ride.direction : "warehouse",
      counted: c.verdict !== "denied",
    });
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || a.klachtnr - b.klachtnr);

  const rides = [...selectedRides(ctx, "outbound"), ...selectedRides(ctx, "inbound")];
  const rideByNr = new Map(rides.map((r) => [`${r.direction}:${r.ritNummer}`, r]));
  const level = (total: number, affected: number): FreeLevel => ({ total, affected, pct: pct(total - affected, total) });

  const kpi = Object.fromEntries(
    KEYS.map((key) => {
      const mine = (p: MainPrincipal | null) => key === "Total" || p === key;
      const myRides = rides.filter((r) => key === "Total" || r.principals.includes(key));
      // HUs of this view per bucket (as in volume: on the day of their ride).
      const husPer = ctx.buckets.map(() => 0);
      let husTotal = 0;
      for (const dir of ["inbound", "outbound"] as Direction[]) {
        for (const u of ctx.units) {
          if (key !== "Total" && u.principal !== key) continue;
          const d = ctx.unitDay(u, dir);
          if (!d || !inRange(d, ctx.period)) continue;
          husTotal++;
          const i = bucketIndex(ctx.buckets, d);
          if (i !== -1) husPer[i]!++;
        }
      }
      // Affected rides and HUs.
      const affected = new Map<string, { ride: Ride; pallets: number }>();
      for (const it of items) {
        if (!it.counted || !it.ritNummer || it.direction === "warehouse" || !mine(it.principal)) continue;
        const ride = rideByNr.get(`${it.direction}:${it.ritNummer}`);
        if (!ride) continue;
        const a = affected.get(ride.ritNummer + it.direction) ?? { ride, pallets: 0 };
        a.pallets += it.pallets && it.pallets > 0 ? it.pallets : 1;
        affected.set(ride.ritNummer + it.direction, a);
      }
      const huCap = (r: Ride) => (key === "Total" ? r.huCount : (r.huByPrincipal[key] ?? r.huCount));
      const affHus = (list: { ride: Ride; pallets: number }[]) => list.reduce((s, a) => s + Math.min(a.pallets, huCap(a.ride)), 0);
      const all = [...affected.values()];
      const kp: ComplaintKpi = {
        rides: level(myRides.length, all.length),
        hus: level(husTotal, Math.min(husTotal, affHus(all))),
        perBucket: ctx.buckets.map((b, i) => {
          const inB = all.filter((a) => bucketIndex([b], a.ride.canonicalDate) === 0);
          const ridesInB = myRides.filter((r) => bucketIndex([b], r.canonicalDate) === 0).length;
          return { key: b.key, label: b.label, rides: level(ridesInB, inB.length), hus: level(husPer[i]!, Math.min(husPer[i]!, affHus(inB))) };
        }),
      };
      return [key, kp];
    }),
  ) as Record<ComplaintKey, ComplaintKpi>;

  const first = complaints.map((c) => c.incidentDay).filter((d): d is DayKey => d !== null).sort()[0] ?? null;
  return { target: TARGETS.complaintFreePct, coverageFrom: first ? `${first.slice(0, 7)}-01` : null, items, kpi };
}
