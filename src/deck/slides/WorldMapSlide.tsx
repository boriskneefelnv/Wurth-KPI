import { geoCentroid, geoInterpolate, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import type { CountryKey } from "../../core/report/countries";
import { fmtInt } from "../../core/slides/format";
import type { WorldCountry, WorldMapSlideModel, WorldView } from "../../core/slides/worldMap";
import { ANIM, entry, useAnimate, useTweenNumber } from "../anim";
import { Flag } from "../flags";
import { ISO2_TO_NUMERIC } from "../isoNumeric";
import { PrincipalToggle } from "../PrincipalToggle";
import { SlideShell } from "../SlideShell";
import { FONT, T } from "../tokens";

const MAP_W = 860;
const MAP_H = 440;
const ROTTERDAM: [number, number] = [4.48, 51.92];
const EMPTY = "#E6EDF4";
const LOW = [214, 230, 242]; // light blue
const HIGH = [30, 84, 120]; // T.inbound

// World geometry is bundled (works offline, also in the HTML export).
const countries = feature(world as unknown as Topology, (world as unknown as Topology).objects.countries!) as unknown as FeatureCollection<Geometry, { name: string }>;
const shapes = countries.features.filter((f) => f.id !== "010"); // without Antarctica
const projection = geoNaturalEarth1().fitExtent(
  [
    [6, 6],
    [MAP_W - 6, MAP_H - 6],
  ],
  { type: "FeatureCollection", features: shapes },
);
const path = geoPath(projection);
const byNumeric = new Map(shapes.map((f) => [String(f.id), f]));
const shapeD = new Map(shapes.map((f) => [String(f.id), path(f) ?? ""]));

const NUMERIC_TO_ISO: Record<string, string> = Object.fromEntries(Object.entries(ISO2_TO_NUMERIC).map(([a, n]) => [n, a]));

function mix(t: number): string {
  const c = LOW.map((l, i) => Math.round(l + (HIGH[i]! - l) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function arc(dest: [number, number]): string {
  const interp = geoInterpolate(ROTTERDAM, dest);
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const p = projection(interp(i / 40));
    if (p) pts.push(`${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`);
  }
  return pts.join("");
}

/** Centroid of the country's largest part (so France is not placed in the ocean). */
function anchor(f: Feature<Geometry>): [number, number] {
  if (f.geometry.type !== "MultiPolygon") return geoCentroid(f);
  let best: Feature<Geometry> = f;
  let area = -1;
  for (const poly of f.geometry.coordinates) {
    const part: Feature<Geometry> = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: poly } };
    const a = path.area(part);
    if (a > area) {
      area = a;
      best = part;
    }
  }
  return geoCentroid(best);
}

/**
 * Outbound destinations worldwide: countries coloured by rides, the top 10
 * routes from Rotterdam as arcs, and the top 10 as a list with flags. Buttons
 * switch between all principals and each principal; hovering a country shows
 * its figures.
 */
export function WorldMapSlide({ model, page, total }: { model: WorldMapSlideModel; page: number; total: number }) {
  const [key, setKey] = useState<CountryKey>("Total");
  const view = model.views[key];
  return (
    <SlideShell
      title={model.title}
      topBar={<PrincipalToggle options={model.order.map((k) => ({ key: k, label: model.views[k].label }))} selected={key} onSelect={setKey} />}
      page={page}
      total={total}
    >
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>
        <MapCard view={view} />
        <Side view={view} />
      </div>
    </SlideShell>
  );
}

function MapCard({ view }: { view: WorldView }) {
  const animate = useAnimate();
  const [hover, setHover] = useState<{ c: WorldCountry; x: number; y: number } | null>(null);
  const byIso = useMemo(() => new Map(view.countries.map((c) => [c.country, c])), [view]);
  const max = Math.max(1, ...view.countries.map((c) => c.rides));
  const routes = view.top
    .map((c) => {
      const f = byNumeric.get(ISO2_TO_NUMERIC[c.country] ?? "");
      if (!f) return null;
      const dest = anchor(f);
      return { c, d: arc(dest), end: projection(dest) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const rdam = projection(ROTTERDAM)!;

  return (
    <div style={{ position: "relative", background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 16px 10px", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Rides per destination country · top {routes.length} routes from Rotterdam</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: T.textSecondary }}>
          fewer
          <span style={{ width: 90, height: 8, borderRadius: 2, background: `linear-gradient(to right, ${mix(0)}, ${mix(1)})` }} />
          more rides
        </div>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: "100%", height: "100%", display: "block" }}>
          <g>
            {shapes.map((f) => {
              const iso = NUMERIC_TO_ISO[String(f.id)];
              const c = iso ? byIso.get(iso) : undefined;
              const fill = c ? mix(Math.sqrt(c.rides / max)) : EMPTY;
              return (
                <path
                  key={String(f.id)}
                  d={shapeD.get(String(f.id))}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={0.5}
                  style={{ transition: `fill ${ANIM.switch}ms ease-out`, cursor: c ? "pointer" : "default" }}
                  onMouseMove={(e) => {
                    if (!c) return setHover(null);
                    const box = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
                    const scale = box.width / (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).offsetWidth || 1;
                    setHover({ c, x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale });
                  }}
                />
              );
            })}
          </g>
          <g key={view.key} style={{ pointerEvents: "none" }}>
            {routes.map((r, i) => (
              <g key={r.c.country}>
                <path
                  d={r.d}
                  fill="none"
                  stroke={T.bluePrimary}
                  strokeWidth={1.4}
                  strokeOpacity={0.85}
                  pathLength={1}
                  style={animate ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `deckDraw 700ms ${300 + i * 90}ms ease-out forwards` } : undefined}
                />
                {r.end && (
                  <circle cx={r.end[0]} cy={r.end[1]} r={3.4} fill={T.heroText} stroke="#fff" strokeWidth={1} style={entry(animate, "deckFadeIn", 200, 950 + i * 90)} />
                )}
              </g>
            ))}
            <circle cx={rdam[0]} cy={rdam[1]} r={4.5} fill="#E2001A" stroke="#fff" strokeWidth={1.5} />
          </g>
        </svg>
        {hover && <Tip c={hover.c} x={hover.x} y={hover.y} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: T.textSecondary }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "#E2001A" }} /> Rotterdam
      </div>
    </div>
  );
}

function Tip({ c, x, y }: { c: WorldCountry; x: number; y: number }) {
  return (
    <div
      style={{
        position: "absolute",
        // Beside the pointer, on the side with room, never on top of the country.
        left: x > 480 ? x - 234 : x + 14,
        top: y > 220 ? Math.max(0, y - 150) : y + 14,
        width: 220,
        zIndex: 20,
        background: "#fff",
        border: `1px solid ${T.inbound}`,
        boxShadow: "0 4px 12px rgba(12,58,92,0.15)",
        padding: "8px 10px",
        fontSize: 11,
        color: T.heroText,
        fontFamily: FONT,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 5 }}>
        <Flag code={c.country} height={12} />
        {c.name}
      </div>
      <Line label="Rides" value={c.rides} bold />
      <Line label="HUs" value={c.hus} bold />
      {c.perPrincipal && c.perPrincipal.length > 1 && (
        <div style={{ borderTop: `1px solid ${T.borderSubtle}`, marginTop: 5, paddingTop: 4 }}>
          {c.perPrincipal.map((p) => (
            <div key={p.principal} style={{ display: "flex", justifyContent: "space-between", color: T.textSecondary }}>
              <span>{p.principal}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtInt(p.rides)} rides · {fmtInt(p.hus)} HUs
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: bold ? 700 : 400 }}>{fmtInt(value)}</span>
    </div>
  );
}

function Side({ view }: { view: WorldView }) {
  const animate = useAnimate();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Mini index={0} label="Countries" value={view.countries.length} />
        <Mini index={1} label="Rides" value={view.rides} />
        <Mini index={2} label="HUs" value={view.hus} />
      </div>
      <div style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: 6, boxShadow: T.cardShadow, padding: "12px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 44px 52px", columnGap: 8, alignItems: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textSecondary, marginBottom: 6 }}>
          <span />
          <span>Top {view.top.length} destinations</span>
          <span style={{ textAlign: "right" }}>Rides</span>
          <span style={{ textAlign: "right" }}>HUs</span>
        </div>
        {view.top.map((c, i) => (
          <div
            key={`${view.key}-${c.country}`}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr 44px 52px",
              columnGap: 8,
              alignItems: "center",
              height: 30,
              borderTop: i ? `1px solid #EEF2F6` : undefined,
              fontSize: 12,
              color: T.heroText,
              ...entry(animate, "deckFadeIn", 220, 300 + i * 60),
            }}
          >
            <span style={{ fontSize: 10.5, color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Flag code={c.country} height={13} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>{c.name}</span>
            </span>
            <span style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtInt(c.rides)}</span>
            <span style={{ textAlign: "right", color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>{fmtInt(c.hus)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ index, label, value }: { index: number; label: string; value: number }) {
  const animate = useAnimate();
  const n = useTweenNumber(value, ANIM.count, index * ANIM.cardStagger);
  return (
    <div style={{ background: T.card, borderRadius: 6, boxShadow: T.cardShadow, borderTop: `3px solid ${T.heroText}`, padding: "9px 10px", ...entry(animate, "deckRiseIn", ANIM.cardIn, index * ANIM.cardStagger) }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", color: T.inbound, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.heroText, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{fmtInt(n)}</div>
    </div>
  );
}
