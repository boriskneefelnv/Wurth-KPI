import { SANKEY_TOP_COUNTRIES } from "../constants";
import type { KnownShipmentType, MainPrincipal, Principal } from "../types";
import { KNOWN_SHIPMENT_TYPES, MAIN_PRINCIPALS } from "../types";
import { inc, selectedRides, type ReportContext } from "./context";

// ---------------------------------------------------------------------------
// Flow: principal → shipment type → country (HU counts)
// ---------------------------------------------------------------------------

export interface FlowBlock {
  nodes: { id: string; layer: "principal" | "type" | "country"; label: string; value: number }[];
  links: { source: string; target: string; value: number }[];
}

export function computeFlow(ctx: ReportContext): FlowBlock {
  const pop = ctx.units.filter(
    (u) =>
      u.status === "geladen" &&
      ctx.inPeriod(u.uitslagUnit) &&
      u.shipmentType !== null &&
      u.shipmentType !== "Onbekend" &&
      u.losLand,
  );
  const countryTotals = new Map<string, number>();
  for (const u of pop) inc(countryTotals, u.losLand!);
  const top = new Set(
    [...countryTotals]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SANKEY_TOP_COUNTRIES)
      .map(([c]) => c),
  );

  const nodes = new Map<string, FlowBlock["nodes"][number]>();
  const links = new Map<string, number>();
  const node = (id: string, layer: FlowBlock["nodes"][number]["layer"], label: string) => {
    let n = nodes.get(id);
    if (!n) nodes.set(id, (n = { id, layer, label, value: 0 }));
    n.value++;
  };
  for (const u of pop) {
    const country = top.has(u.losLand!) ? u.losLand! : "Overig";
    const p = `p:${u.principal}`;
    const t = `t:${u.shipmentType}`;
    const c = `c:${country}`;
    node(p, "principal", u.principal);
    node(t, "type", u.shipmentType!);
    node(c, "country", country);
    inc(links, `${p}→${t}`);
    inc(links, `${t}→${c}`);
  }
  return {
    nodes: [...nodes.values()],
    links: [...links].map(([k, value]) => {
      const [source, target] = k.split("→") as [string, string];
      return { source, target, value };
    }),
  };
}

// ---------------------------------------------------------------------------
// Principal profiles
// ---------------------------------------------------------------------------

export type ProfileLabel =
  | "Diversified"
  | "Standardized"
  | "Mono-type"
  | "Concentrated"
  | "Loose freight"
  | "Full loads"
  | "Balanced";

export interface PrincipalProfile {
  principal: MainPrincipal;
  hus: number;
  typeCounts: Record<KnownShipmentType, number>;
  usedTypes: number;
  dominantType: KnownShipmentType | null;
  dominantShare: number;
  topDestination: string | null;
  topDestinationShare: number;
  rides: number;
  husPerRide: number | null;
  label: ProfileLabel;
}

/**
 * Ordered rules, first match wins:
 * 1. ≥5 types incl. AIR or FCA → Diversified
 * 2. 2–3 types, dominant share < 60% → Standardized
 * 3. dominant share > 85% → Mono-type
 * 4. top destination share > 30% → Concentrated
 * 5. 0 < HUs/ride < 18 → Loose freight
 * 6. HUs/ride > 28 → Full loads
 * otherwise → Balanced
 */
export function classifyProfile(p: Omit<PrincipalProfile, "label" | "principal">): ProfileLabel {
  if (p.usedTypes >= 5 && (p.typeCounts.AIR > 0 || p.typeCounts.FCA > 0)) return "Diversified";
  if (p.usedTypes >= 2 && p.usedTypes <= 3 && p.dominantShare < 0.6) return "Standardized";
  if (p.dominantShare > 0.85) return "Mono-type";
  if (p.topDestinationShare > 0.3) return "Concentrated";
  if (p.husPerRide !== null && p.husPerRide > 0 && p.husPerRide < 18) return "Loose freight";
  if (p.husPerRide !== null && p.husPerRide > 28) return "Full loads";
  return "Balanced";
}

export function computeProfiles(ctx: ReportContext): Record<MainPrincipal, PrincipalProfile> {
  const rides = selectedRides(ctx, "outbound");
  const out = {} as Record<MainPrincipal, PrincipalProfile>;
  for (const principal of MAIN_PRINCIPALS) {
    const units = ctx.units.filter(
      (u) => u.principal === principal && ctx.inPeriod(u.uitslagUnit),
    );
    const typeCounts = Object.fromEntries(KNOWN_SHIPMENT_TYPES.map((t) => [t, 0])) as Record<KnownShipmentType, number>;
    let typed = 0;
    const countries = new Map<string, number>();
    for (const u of units) {
      if (u.shipmentType && u.shipmentType !== "Onbekend") {
        typeCounts[u.shipmentType]++;
        typed++;
      }
      if (u.losLand) inc(countries, u.losLand);
    }
    let dominantType: KnownShipmentType | null = null;
    for (const t of KNOWN_SHIPMENT_TYPES) if (typeCounts[t] > 0 && (!dominantType || typeCounts[t] > typeCounts[dominantType])) dominantType = t;
    let topDestination: string | null = null;
    let topN = 0;
    for (const [c, n] of countries) if (n > topN) [topDestination, topN] = [c, n];
    const countryTotal = [...countries.values()].reduce((a, b) => a + b, 0);

    const principalRides = rides.filter((r) => r.principals.includes(principal as Principal));
    const husOnRides = principalRides.reduce((a, r) => a + (r.huByPrincipal[principal] ?? 0), 0);

    const metrics = {
      hus: units.length,
      typeCounts,
      usedTypes: KNOWN_SHIPMENT_TYPES.filter((t) => typeCounts[t] > 0).length,
      dominantType,
      dominantShare: typed && dominantType ? typeCounts[dominantType] / typed : 0,
      topDestination,
      topDestinationShare: countryTotal ? topN / countryTotal : 0,
      rides: principalRides.length,
      husPerRide: principalRides.length ? husOnRides / principalRides.length : null,
    };
    out[principal] = { principal, ...metrics, label: classifyProfile(metrics) };
  }
  return out;
}
