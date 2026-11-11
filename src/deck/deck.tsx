import type { ReactNode } from "react";
import type { ReportSet } from "../core/report/report";
import { volumeSlide, type VolumeSlideSubject } from "../core/slides/volume";
import { ClosingSlide } from "./slides/ClosingSlide";
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
        <DividerSlide number="01" title="Workload" subtitle="Inbound and outbound volume per principal." footer={footer} page={page} total={total} />
      ),
    },
    ...subjects.map(({ id, subject }) => ({
      id,
      title: subject === "Total" ? "Total volume" : `${subject} volume`,
      render: (page: number, total: number) => <VolumeSlide model={volumeSlide(set, subject)} page={page} total={total} />,
    })),
    { id: "closing", title: "Closing", render: () => <ClosingSlide footer={`Würth · ${p.label}`} /> },
  ];
}
