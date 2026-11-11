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

## Open vragen

1. **Opdrachtgevers**: welke exacte namen staan in de kolom *Opdrachtgever*? De mapping in
   `src/core/constants.ts` is nu een placeholder. Volgt uit de WMS-export.
2. **On-time loading**: is "eerste HU op tijd weg" (huidig) echt de bedoeling, of moet de hele rit op tijd zijn (`latest`)?
3. **Trefwoorden** voor warehouse en afwijkingen (`src/core/complaints/classify.ts`): controleren tegen echte klachten.
4. **Feestdagen** meenemen in werkdag-gemiddelden?
5. **Bestandsformaat** WMS: altijd `.xlsx`? (`.xls` vraagt een andere lezer.)
6. **AFAS-export**: welke kolommen bevatten Sales/Vendor, incidentdatum en het NV-dossiernummer?
