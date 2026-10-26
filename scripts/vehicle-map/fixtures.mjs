// Test data only. Never imported by src or copied into dist.
export function fixture(scene = 'overview', now = Date.now(), revision = 0) {
  const count = scene === 'mobile57' ? 57 : scene === 'dense200' ? 200 : scene === 'same20' ? 20 : scene === 'same6' ? 6 : 18;
  const types = ['collection_truck', 'tanker', 'skip_loader', 'van', 'hook_loader', 'car', 'trailer', 'special', 'unknown'];
  const vehicles = [], locations = [];
  for (let i = 0; i < count; i++) {
    const v = { externalVehicleId: `synthetic-${i + 1}`, externalProvider: 'tcars', internalNumber: `TEST-${String(i + 1).padStart(3, '0')}`, licensePlate: `TEST ${String(i + 1).padStart(3, '0')}`, type: types[i % 9], model: i === 10 ? 'Syntetické vozidlo s velmi dlouhým názvem pro test kolizí' : '', assignedDriverName: i === 0 ? 'Testovací přiřazení' : '' };
    vehicles.push(v);
    const same = scene.startsWith('same') || i >= 12 && scene === 'overview';
    const age = i === 1 ? 47 * 60 : i === 8 ? 82 * 60 : 30 + i;
    const s = { id: `tcars-position-${revision}-${i}`, externalVehicleId: v.externalVehicleId, externalProvider: 'tcars', licensePlate: v.licensePlate, internalNumber: v.internalNumber, vehicle: v,
      latitude: same ? 49.18 : scene === 'dense200' ? 49.2 + (i % 20) * .0002 : 49.22 - Math.floor(i / 4) * .035,
      longitude: same ? 16.6 : scene === 'dense200' ? 16.6 + Math.floor(i / 20) * .0002 : 16.5 + (i % 4) * .065,
      lastGpsAt: new Date(now - age * 1000).toISOString(), receivedAt: new Date(now).toISOString(), gpsValid: true,
      speedKmh: i % 3 === 0 ? 26 + i : i === 7 ? null : 0, ignition: i % 4 === 0 ? null : i % 3 === 1, heading: i * 30 % 360,
      address: 'Syntetická testovací poloha', odometerKm: 150000 + i * 100, voltage: 24.5 };
    if (i === 11 && scene === 'overview') { s.gpsValid = false; s.latitude = null; }
    if (scene === 'mobile57') {
      s.lastGpsAt = new Date(now - (i >= 35 && i < 56 ? 47 * 60 : 30) * 1000).toISOString();
      s.speedKmh = i < 12 ? 30 : 0;
      if (i === 56) { s.gpsValid = false; s.latitude = null; }
    }
    locations.push(s);
  }
  return { provider: 'tcars', apiStatus: 'ready', dataMode: 'live-readonly', configured: true, isDemo: false, vehicles, locations, lastKnownLocations: [], summary: { staleAfterSeconds: 1800 }, lastFetchedAt: new Date(now).toISOString() };
}
