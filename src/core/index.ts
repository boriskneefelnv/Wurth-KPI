/**
 * Würth KPI core: pure, framework-free calculations.
 * No React, no Supabase — everything here is unit-tested in isolation.
 */
export * from "./types";
export * from "./constants";
export * from "./dates";

export * from "./wms/excel";
export * from "./wms/enrich";
export * from "./wms/rides";

export * from "./report/context";
export * from "./report/workload";
export * from "./report/outbound";
export * from "./report/punctuality";
export * from "./report/storage";
export * from "./report/stock";
export * from "./report/daily";
export * from "./report/profiles";
export * from "./report/insights";
export * from "./report/report";

export * from "./complaints/types";
export * from "./complaints/classify";
export * from "./complaints/matcher";
export * from "./complaints/kpi";

export * from "./period";
export * from "./report/reconcile";
export * from "./slides/volume";
export * from "./wms/rideLists";
export * from "./report/quality";
export * from "./slides/format";
export * from "./holidays";
export * from "./wms/detect";
export * from "./wms/exportRange";
export * from "./wms/requirements";
