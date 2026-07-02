import assert from "node:assert/strict";

import { __inferCollectionRouteContainerForTest } from "../functions/_lib/collection-route-optimization-preview.js";
import { __deriveCollectionRouteSourceFieldsForTest } from "../functions/_lib/collection-route-sources-store.js";

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
