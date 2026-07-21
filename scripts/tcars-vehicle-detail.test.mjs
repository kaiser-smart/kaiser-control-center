import assert from "node:assert/strict";

import {
  loadTcarsVehicleDetailPayload,
  parseTcarsAreaEventsXml,
  parseTcarsCostsXml,
  parseTcarsVehicleCostsXml,
  parseTcarsIdentificationsXml,
  parseTcarsPositionsXml,
  parseTcarsRoadTaxXml,
  parseTcarsTripsXml,
  parseTcarsVehiclesXml
} from "../functions/_lib/tcars-client.js";

const vehicleXml = `
<vozidlo xsi:type="tns:tVozidlo">
  <vozidloId>42</vozidloId><vozidloModel>MAN TGS</vozidloModel><vozidloRz>3BN 3558</vozidloRz>
  <vozidloVin>WMA123</vozidloVin><vozidloEvidCis>Svoz 42</vozidloEvidCis><vozidloCisloPalubniJednotky>UNIT-42</vozidloCisloPalubniJednotky>
  <vozidloVyrazeno>false</vozidloVyrazeno><vozidloProRezervace>true</vozidloProRezervace><vozidloProSoukromeUcely>false</vozidloProSoukromeUcely>
  <vozidloSkupina><skupinaId>3</skupinaId><skupinaNazev>Svoz</skupinaNazev><skupinaCislo>A</skupinaCislo><skupinaNadrizena><skupinaId>1</skupinaId><skupinaNazev>Provoz</skupinaNazev><skupinaCislo>P</skupinaCislo></skupinaNadrizena><skupinaVedouci><osobaId>8</osobaId><osobaJmeno>Vedoucí Svozu</osobaJmeno></skupinaVedouci><skupinaStredisko><id>2</id><nazev>Brno</nazev><kod>BR</kod></skupinaStredisko><skupinaVyrazeno>false</skupinaVyrazeno><skupinaPosledniZmena>2026-07-20T11:00:00+02:00</skupinaPosledniZmena></vozidloSkupina>
  <vozidloOdpovedny><osobaId>7</osobaId><osobaJmeno>Jan Řidič</osobaJmeno><osobaCislo>007</osobaCislo><osobaTelefon>545111222</osobaTelefon><osobaMobil>777888999</osobaMobil><osobaEmail>ridic@example.cz</osobaEmail><osobaRFID>7007</osobaRFID><osobaKartaRidice>CARD7</osobaKartaRidice><osobaLogin>jridic</osobaLogin><osobaSkupina><skupinaId>3</skupinaId><skupinaNazev>Svoz</skupinaNazev></osobaSkupina><osobaRole>Řidič</osobaRole><osobaStredisko><id>2</id><nazev>Brno</nazev><kod>BR</kod></osobaStredisko><osobaPozice><id>9</id><nazev>Řidič svozu</nazev><kod>RS</kod></osobaPozice><osobaVyrazeno>false</osobaVyrazeno><osobaRefZkOd>2026-01-01</osobaRefZkOd><osobaRefZkDo>2027-01-01</osobaRefZkDo><osobaPosledniZmena>2026-07-20T10:00:00+02:00</osobaPosledniZmena></vozidloOdpovedny>
  <vozidloOdpovednyOd>2026-01-01</vozidloOdpovednyOd>
  <vozidloStredisko><id>2</id><nazev>Brno</nazev><kod>BR</kod></vozidloStredisko>
  <vozidloDruh><id>4</id><nazev>Nákladní</nazev><kod>NA</kod></vozidloDruh>
  <vozidloKategorie><id>5</id><nazev>Svozové</nazev><kod>SV</kod></vozidloKategorie>
  <vozidloEmisniNorma><id>6</id><nazev>EURO 6</nazev><kod>E6</kod></vozidloEmisniNorma>
  <vozidloPalivo1><id>1</id><nazev>Nafta</nazev><kod>D</kod></vozidloPalivo1>
  <vozidloPalivo2><id>8</id><nazev>AdBlue</nazev><kod>ADB</kod></vozidloPalivo2>
  <vozidloSpotreba1><spotrebaMesto>31.2</spotrebaMesto><spotrebaMimoMesto>26.4</spotrebaMimoMesto><spotrebaKombinovana>28.8</spotrebaKombinovana><spotrebaEmiseCO2>710</spotrebaEmiseCO2></vozidloSpotreba1>
  <vozidloPorizovaciCena>4200000</vozidloPorizovaciCena><vozidloDatumRegistrace>2022-05-10</vozidloDatumRegistrace><vozidloPosledniZmena>2026-07-20T12:00:00+02:00</vozidloPosledniZmena>
</vozidlo>`;

const positionXml = `
<pozice xsi:type="tns:tPozice">${vehicleXml}<gpsData><id>900</id><datumCas>2026-07-21T08:15:00+02:00</datumCas>
<longitude>16.67013</longitude><latitude>49.19121</latitude><gpsValid>true</gpsValid><misto>Trnkova 137</misto>
<tachometer>123456.7</tachometer><rychlost>48</rychlost><altitude>245</altitude><azimut>182</azimut><zapalovani>true</zapalovani>
<nouze>false</nouze><prepinac>true</prepinac><udalost>12</udalost><udalostText>Jízda</udalostText><napeti>27.6</napeti></gpsData></pozice>`;

const tripXml = `<jizda xsi:type="tns:tJizda"><jizdaId>71</jizdaId><jizdaOd>2026-07-21T07:00:00+02:00</jizdaOd><jizdaDo>2026-07-21T08:00:00+02:00</jizdaDo>
<jizdaOdkud>Trnkova</jizdaOdkud><jizdaKam>Líšeň</jizdaKam><jizdaStat>CZ</jizdaStat><jizdaStavKmPocatek>123430</jizdaStavKmPocatek>
<jizdaStavKmKonec>123456.7</jizdaStavKmKonec><jizdaDelkaKm>26.7</jizdaDelkaKm><jizdaStavMthPocatek>4021.1</jizdaStavMthPocatek>
<jizdaStavMthKonec>4022.4</jizdaStavMthKonec><jizdaPomerMestoMimomesto>0.8</jizdaPomerMestoMimomesto><jizdaStavPhm>63.5</jizdaStavPhm>
<jizdaStavPhm2>41</jizdaStavPhm2><jizdaSoukroma>false</jizdaSoukroma><jizdaUcel>Svoz</jizdaUcel><jizdaRidic><osobaId>7</osobaId><osobaJmeno>Jan Řidič</osobaJmeno></jizdaRidic><jizdaPoznamka>Bez závady</jizdaPoznamka></jizda>`;

const costXml = `<naklad xsi:type="tns:tNaklady"><nakladId>81</nakladId><nakladDruh><id>1</id><nazev>Servis</nazev></nakladDruh><nakladTyp><id>2</id><nazev>Oprava</nazev></nakladTyp>
<nakladDatum>2026-07-19T10:00:00+02:00</nakladDatum><nakladCena>1000</nakladCena><nakladCenaBezDPH>1000</nakladCenaBezDPH><nakladCenaSDPH>1210</nakladCenaSDPH>
<nakladDPHProcento>21</nakladDPHProcento><nakladMnozstvi>1</nakladMnozstvi><nakladPopis>Filtr</nakladPopis><nakladFakturaOd>Dodavatel</nakladFakturaOd><nakladFakturaCislo>FV81</nakladFakturaCislo><nakladFakturaDo>Kaiser</nakladFakturaDo><nakladFakturaInterni>INT81</nakladFakturaInterni><nakladPoznamka>Kontrola</nakladPoznamka><nakladImportovan>true</nakladImportovan><nakladImportovanSAP>false</nakladImportovanSAP><nakladTypKarty>Servisní</nakladTypKarty></naklad>`;

const aggregateCostsXml = `
<vozidloNaklady href="#group42"/><vozidloNaklady href="#group99"/>
<multiRef id="group42" xsi:type="tns:tVozidloNaklady"><vozidlo href="#vehicle42"/><naklady href="#costs42"/></multiRef>
<multiRef id="group99" xsi:type="tns:tVozidloNaklady"><vozidlo href="#vehicle99"/><naklady href="#costs99"/></multiRef>
<multiRef id="vehicle42" xsi:type="tns:tVozidlo"><vozidloId>42</vozidloId><vozidloRz>3BN 3558</vozidloRz><vozidloEvidCis>Svoz 42</vozidloEvidCis></multiRef>
<multiRef id="vehicle99" xsi:type="tns:tVozidlo"><vozidloId>99</vozidloId><vozidloRz>9ZZ 9999</vozidloRz></multiRef>
<multiRef id="costs42" xsi:type="SOAP-ENC:Array"><item href="#cost81"/></multiRef>
<multiRef id="costs99" xsi:type="SOAP-ENC:Array"><item href="#cost99"/></multiRef>
<multiRef id="cost81" xsi:type="tns:tNaklady"><nakladId>81</nakladId><nakladDatum>2026-07-19T10:00:00+02:00</nakladDatum><nakladCenaSDPH>1210</nakladCenaSDPH><nakladPopis>Filtr</nakladPopis></multiRef>
<multiRef id="cost99" xsi:type="tns:tNaklady"><nakladId>99</nakladId><nakladDatum>2026-07-18T10:00:00+02:00</nakladDatum><nakladCenaSDPH>9999</nakladCenaSDPH></multiRef>`;

const areaXml = `<vozidloOblasti xsi:type="tns:tVozidlaOblasti"><datum>2026-07-21T07:15:00+02:00</datum><vozidloId>42</vozidloId><vozidloModel>MAN TGS</vozidloModel><vozidloRz>3BN 3558</vozidloRz><vozidloEvidCis>Svoz 42</vozidloEvidCis><oblast>Areál</oblast><adresa>Trnkova 137</adresa><mesto>Brno</mesto><psc>62800</psc><akce>Vjezd</akce><misto>Trnkova</misto><longitude>16.67</longitude><latitude>49.19</latitude><rychlost>8</rychlost></vozidloOblasti>`;
const identificationXml = `<identifikace xsi:type="tns:tIdentifikace"><datum>2026-07-21T06:55:00+02:00</datum><vozidloId>42</vozidloId><vozidloRz>3BN 3558</vozidloRz><ridicId>7</ridicId><ridicJmeno>Jan Řidič</ridicJmeno><ridicOsCis>007</ridicOsCis><misto>Trnkova</misto><cipCislo>CHIP7</cipCislo><kartaCislo>CARD7</kartaCislo></identifikace>`;
const roadTaxXml = `<result xsi:type="tns:tPodkladProSilnicniDan"><vozidloId>42</vozidloId><vozidloRz>3BN 3558</vozidloRz><vozidloDatumRegistrace>2022-05-10</vozidloDatumRegistrace><cm3>12419</cm3><vozidloPocetNaprav>3</vozidloPocetNaprav><rocniSazba>12000</rocniSazba><OSV>1</OSV><M1>1000</M1><Q1>3000</Q1><celkem>12000</celkem></result>`;

const vehicle = parseTcarsVehiclesXml(vehicleXml)[0];
assert.equal(vehicle.tcarsVehicleId, "42");
assert.equal(vehicle.active, true);
assert.equal(vehicle.availableForReservation, true);
assert.equal(vehicle.group.superior.name, "Provoz");
assert.equal(vehicle.group.leader.name, "Vedoucí Svozu");
assert.equal(vehicle.group.center.code, "BR");
assert.equal(vehicle.responsiblePerson.name, "Jan Řidič");
assert.equal(vehicle.responsiblePerson.mobile, "777888999");
assert.equal(vehicle.responsiblePerson.email, "ridic@example.cz");
assert.equal(vehicle.responsiblePerson.driverCard, "CARD7");
assert.equal(vehicle.responsiblePerson.position.code, "RS");
assert.equal(vehicle.responsiblePerson.refrigerationQualificationTo, "2027-01-01");
assert.equal(vehicle.center.name, "Brno");
assert.equal(vehicle.primaryFuel.name, "Nafta");
assert.equal(vehicle.primaryConsumption.combined, 28.8);
assert.equal(vehicle.purchasePrice, 4200000);

const position = parseTcarsPositionsXml(positionXml)[0];
assert.equal(position.odometerKm, 123456.7);
assert.equal(position.speedKmh, 48);
assert.equal(position.switchActive, true);
assert.equal(position.voltage, 27.6);

const trip = parseTcarsTripsXml(tripXml)[0];
assert.equal(trip.distanceKm, 26.7);
assert.equal(trip.engineHoursEnd, 4022.4);
assert.equal(trip.fuelState, 63.5);
assert.equal(trip.driver.name, "Jan Řidič");
const cost = parseTcarsCostsXml(costXml)[0];
assert.equal(cost.priceWithVat, 1210);
assert.equal(cost.invoiceFrom, "Dodavatel");
assert.equal(cost.internalInvoiceNumber, "INT81");
assert.equal(cost.cardType, "Servisní");
const aggregateCosts = parseTcarsVehicleCostsXml(aggregateCostsXml);
assert.equal(aggregateCosts.length, 2);
assert.equal(aggregateCosts[0].vehicle.tcarsVehicleId, "42");
assert.equal(aggregateCosts[0].costs[0].priceWithVat, 1210);
const area = parseTcarsAreaEventsXml(areaXml)[0];
assert.equal(area.action, "Vjezd");
assert.equal(area.internalNumber, "Svoz 42");
assert.equal(area.city, "Brno");
assert.equal(area.postalCode, "62800");
assert.equal(parseTcarsIdentificationsXml(identificationXml)[0].chipNumber, "CHIP7");
assert.equal(parseTcarsRoadTaxXml(roadTaxXml)[0].months.M1, 1000);

const originalFetch = globalThis.fetch;
const methods = [];
const requestBodies = {};
globalThis.fetch = async (_url, options = {}) => {
  const action = String(options.headers?.SOAPAction || "").split("/").pop();
  methods.push(action);
  requestBodies[action] = String(options.body || "");
  const payloads = {
    vozidlaSeznam: vehicleXml,
    vozidlaPozice: positionXml,
    knihaJizdVozidlo: tripXml,
    vozidloNaklady: costXml,
    vozidlaOblasti: areaXml,
    vozidlaIdentifikace: identificationXml,
    reportPodkladProSilnicniDan: roadTaxXml
  };
  return new Response(`<Envelope>${payloads[action] || ""}</Envelope>`, { status: 200 });
};

try {
  const detail = await loadTcarsVehicleDetailPayload({
    TCARS_API_MODE: "soap",
    TCARS_CUSTOMER_NUMBER: "customer",
    TCARS_USERNAME: "user",
    TCARS_PASSWORD: "secret"
  }, {
    tcarsVehicleId: "42",
    tcarsLicensePlate: "3BN 3558"
  }, {
    days: 30,
    now: "2026-07-21T09:00:00+02:00"
  });

  assert.equal(detail.apiStatus, "ready");
  assert.equal(detail.dataStatus, "ready");
  assert.equal(detail.readOnly, true);
  assert.equal(detail.writesData, false);
  assert.equal(detail.capabilities.engineRpm.available, false);
  assert.equal(detail.capabilities.fuelState.unitProvided, false);
  assert.equal(detail.fuelState.verified, true);
  assert.equal(detail.fuelState.value, 63.5);
  assert.equal(detail.trips.length, 1);
  assert.equal(detail.costs.length, 1);
  assert.equal(detail.methodStatus.costs.method, "vozidloNaklady");
  assert.equal(detail.areaEvents.length, 1);
  assert.equal(detail.identifications.length, 1);
  assert.equal(detail.roadTax.length, 1);
  assert.match(requestBodies.vozidlaSeznam, /<pouzeAktivni[^>]*>false<\/pouzeAktivni>/);
  assert.match(requestBodies.vozidlaPozice, /<pouzeAktivni[^>]*>false<\/pouzeAktivni>/);
  assert.deepEqual(new Set(methods), new Set([
    "vozidlaSeznam",
    "vozidlaPozice",
    "knihaJizdVozidlo",
    "vozidloNaklady",
    "vozidlaOblasti",
    "vozidlaIdentifikace",
    "reportPodkladProSilnicniDan"
  ]));
} finally {
  globalThis.fetch = originalFetch;
}

const fallbackMethods = [];
globalThis.fetch = async (_url, options = {}) => {
  const action = String(options.headers?.SOAPAction || "").split("/").pop();
  fallbackMethods.push(action);
  if (action === "vozidloNaklady") {
    return new Response("<Envelope><Fault><faultstring>Method not allowed</faultstring></Fault></Envelope>", { status: 200 });
  }
  const payloads = {
    vozidlaSeznam: vehicleXml,
    vozidlaPozice: positionXml,
    knihaJizdVozidlo: tripXml,
    vozidlaNaklady: aggregateCostsXml,
    vozidlaOblasti: areaXml,
    vozidlaIdentifikace: identificationXml,
    reportPodkladProSilnicniDan: roadTaxXml
  };
  return new Response(`<Envelope>${payloads[action] || ""}</Envelope>`, { status: 200 });
};

try {
  const detail = await loadTcarsVehicleDetailPayload({
    TCARS_API_MODE: "soap",
    TCARS_CUSTOMER_NUMBER: "customer",
    TCARS_USERNAME: "user",
    TCARS_PASSWORD: "secret"
  }, { tcarsVehicleId: "42", tcarsLicensePlate: "3BN 3558" }, {
    days: 30,
    now: "2026-07-21T09:00:00+02:00"
  });

  assert.equal(detail.dataStatus, "ready");
  assert.equal(detail.costs.length, 1);
  assert.equal(detail.costs[0].id, "81");
  assert.equal(detail.methodStatus.costs.apiStatus, "ready");
  assert.equal(detail.methodStatus.costs.method, "vozidlaNaklady");
  assert.equal(detail.methodStatus.costs.fallbackFrom, "vozidloNaklady");
  assert.equal(fallbackMethods.filter((method) => method === "vozidloNaklady").length, 1);
  assert.equal(fallbackMethods.filter((method) => method === "vozidlaNaklady").length, 1);
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async (_url, options = {}) => {
  const action = String(options.headers?.SOAPAction || "").split("/").pop();
  if (["vozidloNaklady", "vozidlaNaklady"].includes(action)) {
    return new Response("<Envelope><Fault><faultstring>Costs unavailable</faultstring></Fault></Envelope>", { status: 200 });
  }
  const payloads = {
    vozidlaSeznam: vehicleXml,
    vozidlaPozice: positionXml,
    knihaJizdVozidlo: tripXml,
    vozidlaOblasti: areaXml,
    vozidlaIdentifikace: identificationXml,
    reportPodkladProSilnicniDan: roadTaxXml
  };
  return new Response(`<Envelope>${payloads[action] || ""}</Envelope>`, { status: 200 });
};

try {
  const detail = await loadTcarsVehicleDetailPayload({
    TCARS_API_MODE: "soap",
    TCARS_CUSTOMER_NUMBER: "customer",
    TCARS_USERNAME: "user",
    TCARS_PASSWORD: "secret"
  }, { tcarsVehicleId: "42", tcarsLicensePlate: "3BN 3558" }, {
    days: 30,
    now: "2026-07-21T09:00:00+02:00"
  });

  assert.equal(detail.apiStatus, "ready");
  assert.equal(detail.dataStatus, "partial");
  assert.equal(detail.costs.length, 0);
  assert.equal(detail.methodStatus.costs.apiStatus, "waiting");
  assert.equal(detail.methodStatus.costs.method, "vozidloNaklady / vozidlaNaklady");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("T-Cars vehicle detail tests: ok");
