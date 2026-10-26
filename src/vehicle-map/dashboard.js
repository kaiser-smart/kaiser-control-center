import { escape, artwork, vehicleArtworkType, isOnline, connectionHTML, movementText } from './presentation.js';
import { gpsTime } from './model.js';
import { SmartIcon } from '../components/icons/SmartIcon.js';
const fmt = n => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 }).format(n);
export function fleetStatsHTML(vehicles, analytics, analyticsError) {
  const fresh = vehicles.filter(isOnline).length;
  const offline = vehicles.length - fresh;
  const percent = vehicles.length ? Math.round(fresh / vehicles.length * 100) : null;
  const valid = analytics?.period === 'today' && analytics.summary?.pointCount > 0;
  return `<header><h2>Statistiky flotily</h2><span>Dnes</span></header><div class="vm-fleet-stats"><div class="vm-gauge" aria-label="${percent === null ? 'Dostupnost GPS neověřena' : `${percent} % vozidel je online`}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43"/><circle class="vm-gauge-value" cx="50" cy="50" r="43" pathLength="100" stroke-dasharray="${percent ?? 0} 100"/></svg><div><strong>${percent === null ? '—' : percent + '%'}</strong><span>Online</span></div></div><dl><div><dt>Dnes ujeto</dt><dd>${valid ? fmt(analytics.summary.totalKm) + ' km' : '—'}</dd></div><div><dt>Jízdy dnes</dt><dd>${valid ? fmt(analytics.summary.tripCount) : '—'}</dd></div><div><dt>Online / offline</dt><dd>${fresh} / ${offline}</dd></div></dl></div>${valid ? (analytics.apiStatus === 'stale' ? '<p class="vm-data-note">Statistiky nejsou aktuální.</p>' : '') : `<p class="vm-data-note">${escape(analyticsError || 'Denní statistiky zatím nejsou dostupné.')}</p>`}`;
}
export function driverHTML(vehicle) {
  return `<header><h2>Řidič dne</h2></header><div class="vm-driver-profile"><span class="vm-driver-avatar">${SmartIcon('users')}</span><div><strong>${vehicle?.assignedDriver ? escape(vehicle.assignedDriver) : 'Přiřazení neověřeno'}</strong><p>${vehicle?.assignedDriver ? 'Přiřazený ve Vozovém parku' : 'Pro dnešní směnu chybí ověřený údaj.'}</p></div></div><div class="vm-telemetry-label"><span>Skóre bezpečné jízdy</span><span>—</span></div><div class="vm-meter-unavailable" role="img" aria-label="Skóre bezpečné jízdy není dostupné"></div><p class="vm-data-note">${vehicle?.assignedDriver ? 'Přiřazení nepotvrzuje, kdo právě řídí. ' : ''}Hodnocení řidiče není dostupné.</p>`;
}
export function vehiclePictureHTML(v) {
  if (v.artworkKey) return artwork(vehicleArtworkType(v), 'detail');
  const illustrations = {tanker:'man-cisterna-mala.png',collection_truck:'mercedes-popelarske.png',skip_loader:'mercedes-ramenac-v2.png',container_truck:'daf-abroll.png'};
  const file = illustrations[v.type.key];
  return file ? `<img class="vm-vehicle-picture" src="vehicles/icons/${file}" alt="Ilustrační zobrazení typu ${escape(v.type.label)}" decoding="async">` : artwork(v.type, 'detail');
}
export function telemetryHTML(v) {
  return `<div class="vm-vehicle-visual">${vehiclePictureHTML(v)}<dl><div><dt>Celkem najeto</dt><dd>${v.odometer === null ? '—' : fmt(v.odometer) + ' km'}</dd></div><div><dt>Napětí</dt><dd>${v.voltage === null ? '—' : fmt(v.voltage) + ' V'}</dd></div></dl></div><div class="vm-telemetry-label"><span>Palivo</span><span>Údaj není dostupný</span></div><div class="vm-meter-unavailable" role="img" aria-label="Stav paliva není dostupný"></div><div class="vm-telemetry-label"><span>AdBlue</span><span>Údaj není dostupný</span></div><div class="vm-meter-unavailable" role="img" aria-label="Stav AdBlue není dostupný"></div>`;
}
export function activityHTML(vehicles) {
  const latest = vehicles.filter(v => v.point && v.lastGpsAt).sort((a,b) => Date.parse(b.lastGpsAt) - Date.parse(a.lastGpsAt)).slice(0,12);
  return `<header><h2>Poslední události</h2><span>GPS hlášení</span></header><p class="vm-data-note">Poslední skutečné vzorky jednotlivých vozidel.</p><div class="vm-event-list">${latest.map(v => `<button type="button" data-vm-select="${escape(v.id)}"><time datetime="${escape(v.lastGpsAt)}" title="${escape(gpsTime(v))}">${escape(new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(new Date(v.lastGpsAt)))}</time>${connectionHTML(v)}<span><strong>${escape(movementText(v))}</strong><small>${escape(v.name || v.label)} · ${escape(v.label)}</small></span></button>`).join('') || '<p class="vm-empty">Nejsou dostupná ověřená GPS hlášení.</p>'}</div>`;
}
export function overviewHTML(vehicles) {
 return `<header><h2>Přehled vozidel</h2><span>${vehicles.length} vozidel</span></header><div class="vm-table-scroll"><table><thead><tr><th>Vozidlo</th><th>Řidič</th><th>Stav</th><th>Poloha</th><th>Rychlost</th><th>GPS</th></tr></thead><tbody>${vehicles.map(v=>`<tr><td><button type="button" data-vm-select="${escape(v.id)}">${artwork(vehicleArtworkType(v),'map')}<span><strong>${escape(v.label)}</strong><small>${escape(v.name || v.type.label)}</small></span></button></td><td>${escape(v.assignedDriver || 'Neověřeno')}</td><td>${escape(movementText(v)) || "—"}</td><td title="${escape(v.address)}">${escape(v.address || (v.point ? 'Souřadnice v detailu' : 'Bez polohy'))}</td><td>${v.speed === null ? '—' : v.speed+' km/h'}</td><td>${connectionHTML(v)}</td></tr>`).join('')}</tbody></table></div>`;
}
