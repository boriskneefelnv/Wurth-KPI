import type { ReactNode } from "react";
import type { ReportSet } from "../core/report/report";
import { dailySlide } from "../core/slides/daily";
import { punctualitySlide } from "../core/slides/punctuality";
import { storageSlide } from "../core/slides/storage";
import { volumeSlide, type VolumeSlideSubject } from "../core/slides/volume";
import { PunctualitySlide } from "./slides/PunctualitySlide";
import { StorageSlide } from "./slides/StorageSlide";
import { ClosingSlide } from "./slides/ClosingSlide";
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
export function buildDeck(set: ReportSet, meetingDate: Date): SlideDef[] {
  const p = set.current.period;
  const footer = `QBR Neele-Vat × Würth · ${p.label}`;
  const subjects: { id: string; subject: VolumeSlideSubject }[] = [
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
        <CoverSlide eyebrow={REVIEW[p.kind] ?? "Business Review"} title="Neele-Vat × Würth review" subline={`Würth × Neele-Vat · ${p.label}`} date={longDate(meetingDate)} />
      ),
    },
    {
      id: "divider-workload",
      title: "Section 01 Workload",
      render: (page, total) => (
        <DividerSlide number="01" title="Workload" subtitle="Volume per principal, daily workload and on time performance." footer={footer} page={page} total={total} />
      ),
    },
    ...subjects.map(({ id, subject }) => ({
      id,
      title: subject === "Total" ? "Total volume" : `${subject} volume`,
      render: (page: number, total: number) => <VolumeSlide model={volumeSlide(set, subject)} page={page} total={total} />,
    })),
    {
      id: "daily-workload",
      title: "Daily workload",
      render: (page: number, total: number) => <DailySlide model={dailySlide(set)} page={page} total={total} />,
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
      render: (page, total) => <DividerSlide number="02" title="Storage" subtitle="How long goods stay in the warehouse." footer={footer} page={page} total={total} />,
    },
    {
      id: "storage-duration",
      title: "Storage duration",
      render: (page: number, total: number) => <StorageSlide model={storageSlide(set)} page={page} total={total} />,
    },
    { id: "closing", title: "Closing", render: () => <ClosingSlide footer={`Würth · ${p.label}`} /> },
  ];
}
