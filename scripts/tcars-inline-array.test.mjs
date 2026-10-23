import assert from "node:assert/strict";
import { parseTcarsVehiclesXml, parseTcarsPositionsXml } from "../functions/_lib/tcars-client.js";
const vehicle = id => '<vozidloId>' + id + '</vozidloId><vozidloRz>TEST' + id + '</vozidloRz><vozidloModel>Test model</vozidloModel>';
const gps = id => '<id>' + id + '</id><datumCas>2026-10-23T08:00:00Z</datumCas><latitude>49.1</latitude><longitude>16.1</longitude><gpsValid>true</gpsValid>';
const envelope = body => '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body>' + body + '</SOAP-ENV:Body></SOAP-ENV:Envelope>';
for (const typed of [true, false]) {
  const xml = envelope('<vozidla SOAP-ENC:arrayType="tns:tVozidlo[2]">' + [101, 102].map(id => '<item' + (typed ? ' xsi:type="tns:tVozidlo"' : '') + '>' + vehicle(id) + '</item>').join('') + '</vozidla>');
  const rows = parseTcarsVehiclesXml(xml);
  assert.deepEqual(rows.map(row => row.tcarsVehicleId), ['101', '102']);
  assert.deepEqual(rows.map(row => row.licensePlate), ['TEST101', 'TEST102']);
}
const positions = envelope('<vozidla SOAP-ENC:arrayType="tns:tPozice[2]">' + [101, 102].map(id => '<item xsi:type="tns:tPozice"><vozidlo>' + vehicle(id) + '</vozidlo><gpsData>' + gps(id) + '</gpsData></item>').join('') + '</vozidla>');
const rows = parseTcarsPositionsXml(positions);
assert.deepEqual(rows.map(row => row.externalVehicleId), ['101', '102']);
assert.ok(rows.every(row => row.latitude === 49.1 && row.longitude === 16.1 && row.lastGpsAt === '2026-10-23T08:00:00Z'));
assert.equal(parseTcarsVehiclesXml(envelope('<vozidlo>' + vehicle(101) + '</vozidlo>')).length, 1, 'legacy direct records unchanged');
assert.equal(parseTcarsPositionsXml(envelope('<pozice><vozidlo>' + vehicle(101) + '</vozidlo><gpsData>' + gps(101) + '</gpsData></pozice>')).length, 1);
assert.equal(parseTcarsVehiclesXml(envelope('<other><item xsi:type="tns:tVozidlo">' + vehicle(101) + '</item></other>')).length, 0, 'unrelated arrays ignored');
assert.equal(parseTcarsVehiclesXml(envelope('<vozidla SOAP-ENC:arrayType="tns:Other[1]"><item>' + vehicle(101) + '</item></vozidla>')).length, 0, 'wrong declared type ignored');
assert.equal(parseTcarsVehiclesXml(envelope('<vozidla><item xsi:type="tns:tVozidlo"><vozidloModel>caption only</vozidloModel></item></vozidla>')).length, 0, 'incomplete record shape ignored');
assert.equal(parseTcarsVehiclesXml(envelope('<vozidla/>')).length, 0);
console.log('T-Cars inline typed/untyped SOAP arrays, positions, legacy formats and invalid shapes passed.');
