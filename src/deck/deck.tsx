import type { ReactNode } from "react";
import type { ReportSet } from "../core/report/report";
import type { MainPrincipal } from "../core/types";
import { containerMixSlide } from "../core/slides/containerMix";
import { dailySlide } from "../core/slides/daily";
import { punctualitySlide } from "../core/slides/punctuality";
import { destinationsSlide } from "../core/slides/destinations";
import { stockSlide } from "../core/slides/stock";
import { storageSlide } from "../core/slides/storage";
import { worldMapSlide } from "../core/slides/worldMap";
import { volumeSlide, type VolumeSlideSubject } from "../core/slides/volume";
import { PunctualitySlide } from "./slides/PunctualitySlide";
import { StockSlide } from "./slides/StockSlide";
import { StorageSlide } from "./slides/StorageSlide";
import { DestinationsSlide } from "./slides/DestinationsSlide";
import { WorldMapSlide } from "./slides/WorldMapSlide";
import { ClosingSlide } from "./slides/ClosingSlide";
import { ContainerMixSlide } from "./slides/ContainerMixSlide";
import { DailySlide } from "./slides/DailySlide";
import { CoverSlide } from "./slides/CoverSlide";
import { DividerSlide } from "./slides/DividerSlide";
import { VolumeSlide } from "./slides/VolumeSlide";

export interface SlideDef {
  id: string;
  /** Name in the overview and the slide picker. */
  title: string;
  render: (page: number, total: number) => ReactNode;
}

const REVIEW: Record<string, string> = {
  week: "Weekly Business Review",
  month: "Monthly Business Review",
  quarter: "Quarterly Business Review",
  half: "Half-year Business Review",
  year: "Annual Business Review",
  ytd: "Year to Date Business Review",
  custom: "Business Review",
};

/** "11 November 2026" */
export function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The deck, in presentation order. Slides are added here one by one as they
 * are rebuilt on the new calculations.
 */
/**
 * `focus`: a deck for one entity. The report set must then already be
 * narrowed to it (core/report/focus.ts); the deck shows one volume slide and
 * the slides render with FocusContext set (see deck/focus.tsx).
 */
export function buildDeck(set: ReportSet, meetingDate: Date, focus: MainPrincipal | null = null): SlideDef[] {
  const p = set.current.period;
  const who = focus ?? "Würth";
  const footer = `QBR Neele-Vat × ${who} · ${p.label}`;
  const subjects: { id: string; subject: VolumeSlideSubject }[] = focus
    ? [{ id: "volume-total", subject: "Total" }]
    : [
        { id: "volume-wiag", subject: "WIAG" },
        { id: "volume-awkg", subject: "AWKG" },
        { id: "volume-lm", subject: "Liqui Moly" },
        { id: "volume-total", subject: "Total" },
      ];
  return [
    {
      id: "cover",
      title: "Cover",
      render: () => (
        <CoverSlide eyebrow={REVIEW[p.kind] ?? "Business Review"} title={`Neele-Vat × ${who} review`} subline={`${focus ? `Würth ${focus}` : "Würth"} × Neele-Vat · ${p.label}`} date={longDate(meetingDate)} />
      ),
    },
    {
      id: "divider-workload",
      title: "Section 01 Workload",
      render: (page, total) => (
        <DividerSlide number="01" title="Workload" subtitle={focus ? "Volume, daily workload and on time performance." : "Volume per principal, daily workload and on time performance."} footer={footer} page={page} total={total} />
      ),
    },
    ...subjects.map(({ id, subject }) => ({
      id,
      title: subject === "Total" ? (focus ? `${focus} volume` : "Total volume") : `${subject} volume`,
      render: (page: number, total: number) => <VolumeSlide model={volumeSlide(set, subject)} page={page} total={total} />,
    })),
    {
      id: "daily-workload",
      title: "Daily workload",
      render: (page: number, total: number) => <DailySlide model={dailySlide(set)} page={page} total={total} />,
    },
    {
      id: "container-mix",
      title: "Container mix",
      render: (page: number, total: number) => <ContainerMixSlide model={containerMixSlide(set)} page={page} total={total} />,
    },
    {
      id: "outbound-world",
      title: "Outbound destinations worldwide",
      render: (page: number, total: number) => <WorldMapSlide model={worldMapSlide(set)} page={page} total={total} />,
    },
    {
      id: "on-time-loading",
      title: "On time loading",
      render: (page: number, total: number) => <PunctualitySlide model={punctualitySlide(set, "loading")} page={page} total={total} />,
    },
    {
      id: "inbound-stocked",
      title: "Inbound stocked on time",
      render: (page: number, total: number) => <PunctualitySlide model={punctualitySlide(set, "stocking")} page={page} total={total} />,
    },
    {
      id: "divider-storage",
      title: "Section 02 Storage",
      render: (page, total) => <DividerSlide number="02" title="Storage" subtitle="Stock and how long goods stay in the warehouse." footer={footer} page={page} total={total} />,
    },
    {
      id: "stock",
      title: "Stock",
      render: (page: number, total: number) => <StockSlide model={stockSlide(set)} page={page} total={total} />,
    },
    {
      id: "storage-duration",
      title: "Storage duration",
      render: (page: number, total: number) => <StorageSlide model={storageSlide(set)} page={page} total={total} />,
    },
    {
      id: "storage-destinations",
      title: "Storage per destination",
      render: (page: number, total: number) => <DestinationsSlide model={destinationsSlide(set)} page={page} total={total} />,
    },
    { id: "closing", title: "Closing", render: () => <ClosingSlide footer={`${focus ? `Würth ${focus}` : "Würth"} · ${p.label}`} /> },
  ];
}
