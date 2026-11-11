# Würth KPI-tool

Nieuwe versie van de Würth KPI- en QBR-module van Neele-Vat (eerder gebouwd in Lovable).
De tool leest de WMS-export en de AFAS-klachtenexport in, koppelt klachten aan ritten
en zendingen, berekent de operationele en klacht-KPI's en maakt de QBR-presentatie.

## Gebruiken

De tool is een website die volledig in de browser draait: geen server, geen database. Alle bestanden
blijven op de eigen computer.

1. Kies welke maanden je wilt laten zien en of je wilt vergelijken met de periode ervoor of vorig jaar.
   De tool zegt welke drie exports je moet draaien: **Te laden ritten** en **Te lossen ritten** (verwachte
   datum) en het **unitoverzicht** (laaddatum, met 4 maanden marge ervoor en 1 maand erna).
2. Sleep de bestanden in (ook in delen). Per export zie je of hij compleet is; is een unitoverzicht
   afgekapt op 50.000 rijen, dan staat erbij welk stuk je nog moet draaien.
3. Controleer de aansluiting per maand en download zo nodig de controlelijst met afwijkende ritten.
4. Kies de rapportsoort, periode en vergelijking.
5. Klik op **Presenteren** (volledig scherm; ← → bladeren, G overzicht, F volledig scherm, Esc sluiten),
   of download de presentatie als HTML: dat bestand presenteert precies zo, met dezelfde animaties.
   Afdrukken of PDF geeft één slide per pagina.

### Via localdeploy

De repo volgt route B van localdeploy: `package.json` met `package-lock.json` in de hoofdmap, en
`npm run build` bouwt eerst de presentatie-runtime (voor de HTML-export) en daarna de site in `dist/`
met `dist/index.html`. Er is geen backend, geen `.env`
en geen `config.js` nodig. De build gebruikt relatieve paden, dus de site werkt onder elk pad.

### Lokaal ontwikkelen

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run check
```

`check` draait de typecheck en alle tests. Echte exports horen in `data/` (staat in `.gitignore`).
Beeldmateriaal voor de slides staat in `public/brand/`.

## Status

| Onderdeel | Status |
|---|---|
| Rekenkern (inlezen, verrijken, ritdatum, KPI's, klachten) + tests | klaar |
| Rittenlijsten, aansluitcontrole, controlelijst | klaar |
| Browser-app (localdeploy), slides in de huisstijl van de Würth-module, presentatiemodus, export HTML en PDF | klaar |
| Overige slides (on-time loading, dagvolume, container mix, opslag, kaart, profielen, voorraad, klachten) | slide voor slide |
| Klachten (AFAS) in de app | gepland |

## Structuur

```
src/core/                 Pure rekenlogica (geen React/Supabase), volledig getest
  types.ts, constants.ts  Domeintypes, kolommen, kleuren, doelen, drempels
  dates.ts                Datums (wandklok), periodes, werkdagen
  wms/excel.ts            Werkblad- en kopregelselectie, verplichte kolommen
  wms/xlsxReader.ts       .xlsx naar SheetData (ExcelJS), vervangbaar
  wms/enrich.ts           Filtering, principal, containertype, opslagbuckets
  wms/rides.ts            Canonieke ritdatum (5%-regel), ritten en zendingen
  report/                 Operationele KPI's + computeReport()
  complaints/             Matcher, classificatie, klacht-KPI
src/deck/                 Slides (React), presentatiemodus, animaties, HTML-export
src/app/                  Browser-app (React): inladen in web worker, aansluiting, rapport, export
index.html                Ingang van de website (Vite)
scripts/                  Analyse en preview op de commandoregel (Node)
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

