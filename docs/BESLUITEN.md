# Besluiten en afwijkingen t.o.v. de Lovable-versie

De rekenkern volgt de technische overdracht (`Wurth_module_overdracht`). Waar de
overdracht een inconsistentie, bug of verouderde tekst noemt, is hieronder
vastgelegd wat de nieuwe versie doet. **Gemarkeerd met ⚠️ = verandert uitkomsten
t.o.v. Lovable; graag bevestigen.**

## Data en datums

| # | Besluit | Lovable | Waarom |
|---|---|---|---|
| B1 | Alle datums zijn *wandkloktijd*: de dag/maand zoals de WMS die toont. Geen tijdzoneconversie. | KPI's gebruikten lokale browsertijd, ritdatums Europe/Amsterdam | Twee implementaties konden een HU op een andere dag/maand zetten. Nu één regel. |
| B2 | Datums `dd-mm-jjjj` worden expliciet dag-eerst gelezen; getallen als `1.234,5` worden goed gelezen. | `new Date(string)` | Voorkomt verwisseling van dag en maand. |
| B3 | De kopregel wordt gezocht in de eerste 15 rijen. | Alleen rij 1 | Exports met een titelregel werken ook. |
| B4 | Afgekeurde rijen worden met rijnummer en reden bewaard. | Alleen tellingen | Makkelijker controleren bij de klant/WMS-beheer. |
| B5 | Opslagbucket heet `>60`; exact 60 dagen valt in `31-60`. | Label `60+` | Label klopte niet met de regel. |

## Ritten ("containers")

| # | Besluit | Lovable |
|---|---|---|
| B6 | Het perspectief heet `rides` (ritten). In de UI tonen als "Ritten" of "Containers (ritten)". | `containers` |
| B7 ⚠️ | **In het rit-perspectief telt elke rit precies één keer, op zijn canonieke dag (5%-regel).** Dat geldt voor volume, container mix, on-time loading, inbound stocked en uitgaande ritten. | Distinct ritten per week/maand: een rit die over een maandgrens loopt telde in beide. |
| B8 ⚠️ | Principal van een rit = principal met de meeste HU's. | Principal van de eerste rij |
| B9 ⚠️ | Containertype van een rit = meest voorkomende bekende type. | Eerste type in de rij-volgorde |
| B10 | `outlierHuCount` = alle HU's die niet op de canonieke dag vallen; `skippedNewerHuCount` = alleen de overgeslagen nieuwere staart. | Alleen de nieuwere staart (in tegenspraak met de beschrijving) |
| B11 | Zending krijgt de periode van zijn rit. | Niet gespecificeerd |

## Operationele KPI's

| # | Besluit | Lovable |
|---|---|---|
| B12 ⚠️ | On-time / inbound stocked zonder meetbare ritten → `null` (toon "—"), niet 0%. | 0% |
| B13 | On-time loading: regel instelbaar. Standaard `earliest` (= Lovable: eerste uitslag ≤ geplande vertrekdag). Alternatief `latest`: alle HU's uiterlijk op de vertrekdag weg. | Alleen `earliest` |
| B14 | Inbound stocked gebruikt de **vroegste** losdatum van de rit. | Eerste niet-lege losdatum |
| B15 | In weekmodus (1 maand) is `avgPerMonth` `null` en heet de teller `activeBuckets`. | `avgPerMonth = 0`, veld heette `activeMonths` |
| B16 | Dagvolume geeft naast gemiddelde per actieve dag ook gemiddelde per werkdag. | Alleen actieve dagen |
| B17 | Werkdagen ma–vr; feestdagen kunnen als optie worden meegegeven. | Geen feestdagen |
| B18 | Gemiddeld HU's per uitgaande rit = HU's op geselecteerde ritten ÷ aantal ritten. | HU's in maand ÷ unieke ritten in maand |
| B19 | Takeaways verwijzen naar slide-ID's (bv. `stock`), niet naar slidenummers. Voorraadtekst zegt "month-over-month". | Nummers 3/5/7/8/9; tekst "over the selected period" |

## Klachten

| # | Besluit | Lovable |
|---|---|---|
| B20 | Richtingsbron `auto_shipment` toegevoegd bij een match op zending. | Bleef `auto_keyword` staan (bug) |
| B21 | Bij opnieuw matchen blijven altijd behouden: KPI-uitsluiting + reden, notities, handmatige HU-aantallen, handmatige Sales/Vendor en afwijking. Een handmatige koppeling wordt niet overschreven. | Handmatige klachten werden helemaal overgeslagen |
| B22 | Trefwoorden (warehouse, afwijkingen) matchen op hele woorden. | Substring (`wh` in "whatsapp" telde mee) |
| B23 ⚠️ | **HU-teller wordt ook per rit begrensd:** zending- en ritklachten op dezelfde rit samen ≤ HU's van de rit. | Alleen apart per zending en per rit begrensd (kon dubbel tellen) |
| B24 | Klacht-KPI per principal volledig berekend (eigen noemer: ritten/zendingen/HU's van die principal). | Teller altijd 0, percentage `null` |
| B25 | Ambigue klachten worden apart geteld (in beide richtingen tot ze zijn opgelost). | Vielen weg |
| B26 | De klacht-KPI is een geteste TypeScript-functie. Of die in de browser of als database-functie draait, is een keuze voor fase 2; de logica blijft gelijk. | Alleen SQL-RPC, zonder tests |

## Rapportperiodes (besloten met Boris, slide-sessie 1)

| # | Besluit |
|---|---|
| B27 | Rapportsoorten: **week, maand, kwartaal, half jaar, jaar** (`src/core/period.ts`). Weken zijn ISO-weken (ma–zo). |
| B28 | Vergelijkingen: week ↔ vorige week; maand ↔ vorige maand **of** zelfde maand vorig jaar (keuze); kwartaal en half jaar ↔ vorige periode **en** zelfde periode vorig jaar; jaar ↔ vorig jaar. |
| B29 | Alleen periodes en vergelijkingen die de data volledig dekt, worden aangeboden. Dekking = eerste t/m laatste dag met een uitslag in de export (oude inslagdatums van voorraad tellen niet). Een periode telt als gedekt als de eerste én laatste werkdag erbinnen vallen. Later (fase 2) komt de dekking uit de opgeslagen imports. |
| B30 | Staven binnen een rapport: week → dagen, maand → ISO-weken (afgekapt op de maand, label "Wk 14"), kwartaal/half jaar/jaar → maanden. |
| B31 | Gemiddelde per staaf = totaal ÷ aantal staven (ook lege), want de periode is volledig gedekt. Lovable deelde door "actieve maanden". |
| B32 | Volumeslide (ontwerp A): HU's als staven, ritten als getal eronder, geen schakelaar. Inbound op Inslag Unit, outbound op Uitslag Unit; ritten op hun ritdatum. |
| B33 | Grijze vergelijkingsstaven alleen als de staven één-op-één passen (week, kwartaal, half jaar, jaar); bij voorkeur zelfde periode vorig jaar. Bij een maandrapport (4–6 weken) alleen totalen vergelijken. |
| B34 | Controle-overzicht per periode en richting (`reconcileVolume`): rijen in bestand → afgekeurd per reden → meegeteld, opdrachtgevers die onder "Overig" vallen, HU's zonder rit, en ritten die door de ritdatum in een andere periode tellen. |
| B35 | Voorraad: voorlopig een momentopname aan het eind van elke staaf plus de verandering over de periode. Wordt besproken bij de voorraadslide. |

## Rittenlijsten (Te laden / Te lossen), na analyse van de H1 2026-exports

| # | Besluit |
|---|---|
| B36 | De rittenlijsten zijn een vaste bron naast het unitoverzicht. **Verwachte datum is leidend voor de ritdatum**; zonder lijst valt de rit terug op de 5%-regel op scans. De scandatum blijft bewaard ter controle. |
| B37 | HU's tellen in de periode van hun rit (optie `huDating: "ride"`, standaard), zodat HU's en ritten altijd in dezelfde maand vallen. HU's zonder rit tellen op hun eigen scan. |
| B38 | Meerdere regels per rit in een lijst worden samengevoegd: units opgeteld, datum en status van de regel met de meeste units. Ritten met "TEST" of "CANCEL" in de referentie of met 0 units tellen niet mee. |
| B39 | De dekking (welke periodes kiesbaar zijn) komt uit de rittenlijsten, afgerond op hele maanden; bij import te bevestigen. Het unitoverzicht is daarvoor ongeschikt: het is gefilterd op Laaddatum (ophaaldatum bij de leverancier). |
| B40 | Controle-overzicht per periode/maand: units volgens de lijst vs HU's in het unitoverzicht (volledigheid), ritten die ontbreken, ritten die niet op de lijst staan, en datum lijst vs scans. |
| B41 | Negatieve "Dagen in opslag" keurt de rij niet meer af (85 HU's in H1); alleen de opslagduur wordt leeg gelaten. |
| B42 | Bevinding: Laaddatum en Losdatum in het unitoverzicht zijn zendingsdatums (ophalen bij leverancier / afleveren bij ontvanger), geen magazijndatums. Vertrek = verwachte datum van de uitgaande rit. Dit raakt dagvolume en inbound stocked (later bespreken). |

## Eén databasis (na unitoverzicht okt 2025 t/m jun 2026)

| # | Besluit |
|---|---|
| B43 | Exact dubbele rijen in het unitoverzicht (zelfde SSCC "Extern", zelfde ritten en scantijden) worden één keer geteld. In de export okt 2025 t/m jun 2026 waren dat 125 rijen. Een pallet die echt twee keer door het magazijn ging, blijft staan. |
| B44 | Met rittenlijsten bepaalt de lijst welke ritten meetellen; HU's tellen alleen mee als hun rit meetelt, op de ritdatum. Ritten die niet op de lijst staan en HU's zonder rit gaan naar de controlelijst, niet naar de slide. Zo bestaan HU's en ritten uit dezelfde set. |
| B45 | ~~Ritten die niet afgerond zijn tellen niet mee.~~ Vervangen door B49. |
| B46 | Aansluiting: HU's in het unitoverzicht mogen maximaal 2% afwijken van de units op de rittenlijsten. Anders volgt een waarschuwing en is de periode niet bruikbaar als vergelijking. |
| B47 | Controlelijst per periode (Excel): ritten zonder HU's, ritten niet op de lijst, afwijkende aantallen, niet afgerond, test en cancel. |
| B48 | Slides in de huisstijl van de Neele-Vat business update: headerfoto met tab, Maasvlakte-logo, label, kop en één ondersteunende regel, kerncijfers als rij, grafieken in kaarten. Engelse tekst met Nederlandse getalnotatie (11.615; 16,7). Geen streepjes of speciale tekens in lopende tekst: "up 12%", "down 4%", "stable" (minder dan 2%). |

## Zuiverste beeld voor de klant (analyse jan 2025 t/m jun 2026)

Onderbouwing: ruim 2.100 inkomende en 2.400 uitgaande ritten; netto verschil tussen rittenlijst en gescande pallets 0,1–0,3%. Probleemritten vallen bijna allemaal in jan–mrt 2025 (begin van de export).

| # | Besluit |
|---|---|
| B49 | **Gescande pallets zijn leidend.** Een rit op de rittenlijst telt mee als er minstens één pallet op is gescand (inslag of uitslag). Status van de lijst ("In transit", "Vrijgegeven") en "CANCEL" in de referentie tellen alleen als er niets is gescand. Vervangt B45: 15 inkomende ritten met 285 echt ingeslagen pallets stonden nog open op de lijst. Instelbaar terug naar de statusregel (`basis: "status"`). |
| B50 | HU's = gescande pallets; de datum komt van de rittenlijst. Wijkt het aantal af van "Units" op de lijst, dan telt de scan (staat in de controlelijst). |
| B51 | Ritten zonder één gescande pallet en testritten tellen niet mee en staan in de controlelijst. Pallets die op een andere rit zijn geboekt (bv. 266500004263 / 4265) tellen op de rit waarop ze gescand zijn. |
| B52 | Meerdere unitoverzichten kunnen worden gecombineerd; overlap wordt niet dubbel geteld. Een export met precies 50.000 rijen is afgekapt door de WMS (melding). |
| B53 | Export-advies: unitoverzicht per halfjaar (onder 50.000 rijen) en met Laaddatum vanaf twee maanden vóór de eerste rapportmaand; de aansluitcontrole markeert een onvolledig begin (jan 2025: 63% uitgaand). |
| B54 | Werkdagen: ma t/m vr zonder magazijnfeestdagen (Nieuwjaarsdag, Tweede Paasdag, Koningsdag, Hemelvaart, Tweede Pinksterdag, Kerst; Bevrijdingsdag alleen in lustrumjaren). Goede Vrijdag is een werkdag. Afgeleid uit de scans 2025–2026. |
| B55 | Kop volumeslide: vergelijking met vorig jaar als die volume had, anders met de vorige periode. Op de Totaal-slide wordt de principal genoemd die de verandering verklaart (bv. AWKG, actief sinds sept 2025). |
| B56 | Kop van de slide is niet handmatig aan te passen (besloten). Vier volumeslides blijven (WIAG, AWKG, Liqui Moly, Totaal). |

## Browser-app voor localdeploy

| # | Besluit |
|---|---|
| B57 | De tool is een statische website (Vite + React, route B van localdeploy): geen backend. Bestanden worden in een web worker in de browser gelezen en verlaten de computer niet. Supabase (oorspronkelijk plan) vervalt voorlopig. |
| B58 | Alle exports tegelijk inslepen; het soort bestand wordt herkend aan de kolommen. Meerdere unitoverzichten worden samengevoegd. |
| B59 | Alleen periodes die aansluiten (maximaal 2% verschil) zijn kiesbaar; de rest wordt met reden genoemd. Aansluiting = gescande pallets tegenover alle units die gescand hadden moeten zijn (meegetelde ritten plus afgeronde ritten zonder scans). |
| B60 | Export: HTML-bestand met alle slides (los te openen, logo's ingebed) en afdrukken als PDF (één slide per pagina, 1280 × 720). |

## Huisstijl en presentatie (terug naar de stijl van de Lovable-module)

| # | Besluit |
|---|---|
| B61 | Slides gebruiken weer de opmaak van de oorspronkelijke Würth-module: lichtblauw canvas #DDE9F4, containerstrook van 92 px met blauwe lijn, wit titelblok met grote blauwe titel, Neele-Vat-logo rechtsboven, witte kaarten met zachte schaduw, grote kerncijfers (44 px) met accentstreepje. Vervangt de opmaak uit B48. Rekenlogica blijft de nieuwe. |
| B62 | Slides zijn React-componenten (`src/deck/`). Dezelfde componenten worden gebruikt voor presenteren, voorbeeld, HTML-export en PDF (statische render). |
| B63 | Animaties als in de oude module: staven groeien (500 ms, 60 ms na elkaar), cijfers tellen op (800 ms), kaarten en labels faden in. Alleen in de presentatie; voorbeeld, export en afdruk tonen altijd de eindstand. Navigeren wacht nooit op een animatie. |
| B64 | Presentatiemodus: volledig scherm, ← → spatie PageUp/PageDown, Home/End, 1–9, G overzicht, F volledig scherm, Esc. Knoppen verdwijnen na 2,5 s stilstand. De HTML-export kan zichzelf ook presenteren. |
| B65 | Volumeslide: vier kerncijfers (HU's en ritten, in en uit) met de hoofdvergelijking als groene of grijze pill en de andere vergelijking als grijze tekst; grafiek met inbound (donker) en outbound (licht) per periode; vergelijkingsperiode als fijne markering op elke staaf. Kernboodschap als ondertitel. |
| B66 | Deck nu: cover, sectie 01 Workload, vier volumeslides, afsluiting. Volgende slides worden één voor één toegevoegd. |
| B67 | Beeldmateriaal (headerstrook, logo's, coverfoto) komt uit de oude repo, die al openbaar is, en staat nu in `public/brand/` zodat localdeploy het meeneemt. |

## Open vragen

1. ~~Opdrachtgevers~~: bevestigd, Würth Logistics AG = WIAG.
2. **On-time loading**: is "eerste HU op tijd weg" (huidig) echt de bedoeling, of moet de hele rit op tijd zijn (`latest`)?
3. **Trefwoorden** voor warehouse en afwijkingen (`src/core/complaints/classify.ts`): controleren tegen echte klachten.
4. ~~Feestdagen~~: ja, zie B54.
5. **Bestandsformaat** WMS: altijd `.xlsx`? (`.xls` vraagt een andere lezer.)
6. **AFAS-export**: welke kolommen bevatten Sales/Vendor, incidentdatum en het NV-dossiernummer?
