# Würth KPI-tool

Nieuwe versie van de Würth KPI- en QBR-module van Neele-Vat (eerder gebouwd in Lovable).
De tool leest de WMS-export en de AFAS-klachtenexport in, koppelt klachten aan ritten
en zendingen, berekent de operationele en klacht-KPI's en maakt de QBR-presentatie.

## Status

| Fase | Inhoud | Status |
|---|---|---|
| 1 | **Rekenkern + tests**: Excel inlezen, verrijken, ritdatum (5%-regel), alle KPI's, klachtenmatcher, klacht-KPI | ✅ klaar |
| 2 | Slides één voor één uitwerken (volume ✅ rekenmodel, preview: `npx tsx scripts/preview-volume.ts <map>`) | bezig |
| 3 | Supabase: één schone migratie, import in één transactie, RLS | gepland |
| 4 | App (Vite + React + TypeScript): één workflow import → controle → klachten → rapport | gepland |
| 5 | QBR-deck (21 slides, 1280×720, Neele-Vat-stijl) + export naar HTML, PDF en PPTX | gepland |

## Structuur

```
src/core/                 Pure rekenlogica (geen React/Supabase), volledig getest
  types.ts, constants.ts  Domeintypes, kolommen, kleuren, doelen, drempels
  dates.ts                Datums (wandklok), periodes, werkdagen
  wms/excel.ts            Werkblad- en kopregelselectie, verplichte kolommen
  wms/xlsxReader.ts       .xlsx → SheetData (ExcelJS), vervangbaar
  wms/enrich.ts           Filtering, principal, containertype, opslagbuckets
  wms/rides.ts            Canonieke ritdatum (5%-regel), ritten en zendingen
  report/                 Operationele KPI's + computeReport()
  complaints/             Matcher, classificatie, klacht-KPI
tests/                    Vitest-tests per onderdeel
docs/BESLUITEN.md         Afwijkingen t.o.v. Lovable en open vragen
```

## Gebruik (kern)

```ts
import { readXlsx, parseWmsSheets, enrichWms, materializeRides, computeReport } from "@/core";

const sheets = await readXlsx(await file.arrayBuffer());
const { units, validation, availablePeriods } = enrichWms(parseWmsSheets(sheets));
const { rides, shipments } = materializeRides(units);
const report = computeReport(units, ["2026-03", "2026-04"], {}, rides);
```

## Ontwikkelen

```bash
npm install
```

```bash
npm run check
```

`check` draait de typecheck en alle tests. Echte WMS- en AFAS-exports horen in `data/`
(staat in `.gitignore`, want die bevatten klantgegevens).
