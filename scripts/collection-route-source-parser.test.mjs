import assert from "node:assert/strict";

import { __inferCollectionRouteContainerForTest } from "../functions/_lib/collection-route-optimization-preview.js";
import {
  __buildCollectionRouteRepairWorkbookForTest,
  __deriveCollectionRouteSourceFieldsForTest
} from "../functions/_lib/collection-route-sources-store.js";

function derive(originalText) {
  return __deriveCollectionRouteSourceFieldsForTest({ originalText });
}

{
  const row = derive("27 | HYDROCOM, spol. s r.o. | Brno, Havránkova 11 | SKO | 1100 l | 1x7");
  assert.equal(row.customerName, "HYDROCOM, spol. s r.o.");
  assert.equal(row.addressText, "Brno, Havránkova 11");
}

{
  const row = derive("1 | Dopravně ovchodní společnost DOS Brno, s.r.o. | Brno, Úlehlova 18   DOS | SKO | 1100 l | 1x7");
  assert.equal(row.customerName, "Dopravně ovchodní společnost DOS Brno, s.r.o.");
  assert.match(row.addressText, /^Brno, Úlehlova 18\s+DOS$/);
}

{
  const row = derive("611 | PEPCO Bystrc | náměstí 28.dubna 1069/2 | PAPÍR | 1100 l | 1x7");
  assert.equal(row.customerName, "PEPCO Bystrc");
  assert.equal(row.addressText, "náměstí 28.dubna 1069/2");
}

{
  const row = derive("611 | PEPCO Bystrc, náměstí 28.dubna 1069/2 | PAPÍR | 1100 l | 1x7");
  assert.equal(row.customerName, "PEPCO Bystrc");
  assert.equal(row.addressText, "náměstí 28.dubna 1069/2");
}

{
  const row = derive("762 | Brno, Úlehlova 18 DOS | SKO | 1100 l | 1x7");
  assert.equal(row.customerName, "");
  assert.equal(row.addressText, "Brno, Úlehlova 18 DOS");
  assert.equal(row.mappingStatus, "chybí adresa");
}

{
  const row = derive("1 | Bio-Cirkle s.r.o. | Brno, Trnkova 117 | sudá středa | 1x7 | P240 | 1 | DPI");
  assert.equal(row.customerName, "Bio-Cirkle s.r.o.");
  assert.equal(row.addressText, "Brno, Trnkova 117");
}

{
  const row = derive("SKO | LIDL, Šumavská 519/35, Brno , TEL.: ZÁVORA - 737993372 | 2x1100");
  assert.equal(row.customerName, "LIDL");
  assert.equal(row.addressText, "Šumavská 519/35, Brno");
}

{
  const row = derive("SKO | Café Plaček, Minoritská | 2x 240 ltr | 3x7");
  assert.equal(row.customerName, "Café Plaček");
  assert.equal(row.addressText, "Minoritská");
}

{
  const container = __inferCollectionRouteContainerForTest("37 | TIERRA VERDE s.r.o. | 1100 tr - SKO | 2", [
    "37",
    "TIERRA VERDE s.r.o.",
    "1100 tr - SKO",
    "2"
  ]);
  assert.equal(container.containerVolume, 1100);
  assert.equal(container.containerCount, 2);
}

{
  const payload = __buildCollectionRouteRepairWorkbookForTest({
    sheets: [
      {
        sheetName: "VSECHNY RADKY",
        rows: [
          ["Vsechny aktualni zdrojove radky"],
          ["Cervene bunky jsou jen kontrola"],
          [
            "Priorita",
            "Co opravit",
            "Doporucena oprava",
            "Zakaznik",
            "Stanoviste / adresa",
            "Odpad",
            "Nadoba",
            "Frekvence",
            "Den",
            "Tyden",
            "Auto",
            "Poradi",
            "Vistos stav",
            "Vistos smlouva",
            "Vistos zakaznik",
            "Vistos stanoviste",
            "Problem",
            "Zdrojovy Excel",
            "Zdrojovy list",
            "Zdrojovy radek",
            "Poznamka",
            "Ostra trasa"
          ],
          [
            "2",
            "Vistos match / identifikace",
            "Zkontrolovat",
            "PEPCO Bystrc",
            "náměstí 28.dubna 1069/2",
            "PAPÍR",
            "1× 1100 l",
            "1x7",
            "pondělí",
            "lichý týden",
            "Auto A",
            "611",
            "nenamapováno",
            "-",
            "-",
            "-",
            "čeká na Vistos match",
            "Pondělí LICHÉ AI.xls",
            "List1",
            "33",
            "klíč u rampy",
            "NE"
          ]
        ]
      }
    ]
  });

  assert.equal(payload.batch.source, "13-excel-repair-workbook");
  assert.equal(payload.files.length, 1);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].sourceFile, "Pondělí LICHÉ AI.xls");
  assert.equal(payload.rows[0].sourceSheet, "List1");
  assert.equal(payload.rows[0].sourceRowNumber, 33);
  assert.equal(payload.rows[0].dayCode, "PO");
  assert.equal(payload.rows[0].weekMode, "lichý týden");
  assert.equal(payload.rows[0].vehicleCode, "A");
  assert.equal(payload.rows[0].wasteType, "PAPIR");
  assert.equal(payload.rows[0].wasteCode, "200101");
  assert.equal(payload.rows[0].containerVolume, 1100);
  assert.equal(payload.rows[0].containerCount, 1);
}
