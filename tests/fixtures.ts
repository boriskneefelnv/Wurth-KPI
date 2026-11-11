import { parseDateValue, periodOf } from "@/core/dates";
import { storageBucket } from "@/core/wms/enrich";
import type { WmsUnit } from "@/core/types";

let row = 1;

type UnitInput = Partial<Omit<WmsUnit, "inslagUnit" | "uitslagUnit" | "vertrek" | "losdatum" | "laaddatum">> & {
  inslag?: string | null;
  uitslag?: string | null;
  vertrek?: string | null;
  losdatum?: string | null;
  laaddatum?: string | null;
};

/** Build an enriched unit with sensible defaults. Dates as `YYYY-MM-DD[ HH:mm]`. */
export function unit(u: UnitInput = {}): WmsUnit {
  const d = (s: string | null | undefined) => (s ? parseDateValue(s) : null);
  const inslagUnit = d(u.inslag);
  const uitslagUnit = d(u.uitslag);
  const dagen = u.dagenInOpslag ?? null;
  return {
    rowIndex: u.rowIndex ?? ++row,
    referentie: u.referentie ?? "REF",
    dossiernummer: u.dossiernummer ?? "",
    inkomendeRit: u.inkomendeRit ?? null,
    uitgaandeRit: u.uitgaandeRit ?? null,
    omschrijving: u.omschrijving ?? "Geladen",
    status: u.status ?? "geladen",
    opdrachtgever: u.opdrachtgever ?? "WIAG",
    principal: u.principal ?? "WIAG",
    containertype: u.containertype ?? "",
    seals: u.seals ?? ["", "", ""],
    shipmentType: u.shipmentType !== undefined ? u.shipmentType : uitslagUnit ? "40S" : null,
    brutoKg: u.brutoKg ?? 100,
    laaddatum: d(u.laaddatum),
    vertrek: d(u.vertrek),
    losdatum: d(u.losdatum),
    inslagUnit,
    uitslagUnit,
    losLand: u.losLand !== undefined ? u.losLand : uitslagUnit ? "DE" : null,
    afzenderLand: u.afzenderLand ?? null,
    dagenInOpslag: dagen,
    storageBucket: dagen === null ? null : storageBucket(dagen),
    inboundPeriod: inslagUnit ? periodOf(inslagUnit) : null,
    outboundPeriod: uitslagUnit ? periodOf(uitslagUnit) : null,
  };
}

export function times<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i));
}
