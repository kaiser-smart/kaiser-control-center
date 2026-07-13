export const VEHICLE_TRACKING_INFO_STYLES = [
  {
    id: "compact",
    label: "Kaiser karta",
    description: "Hravá prémiová karta se jménem, SPZ a rychlostí."
  },
  {
    id: "plate",
    label: "SPZ tabule",
    description: "Výrazná SPZ a rychlost ve stylu dopravní tabule."
  },
  {
    id: "speedometer",
    label: "Budík",
    description: "Rychlost jako živý analogový přístroj."
  },
  {
    id: "telemetry",
    label: "Palubní panel",
    description: "Reálná telemetrie, kterou aktuálně vrací T-Cars."
  }
];

export const DEFAULT_VEHICLE_TRACKING_PREFERENCES = Object.freeze({
  infoStyle: "compact"
});

export function normalizeVehicleTrackingInfoStyle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VEHICLE_TRACKING_INFO_STYLES.some((item) => item.id === normalized)
    ? normalized
    : DEFAULT_VEHICLE_TRACKING_PREFERENCES.infoStyle;
}

export function normalizeVehicleTrackingPreferences(input = {}, metadata = {}) {
  return {
    infoStyle: normalizeVehicleTrackingInfoStyle(input?.infoStyle),
    updatedAt: String(metadata.updatedAt || input?.updatedAt || "").trim(),
    userId: String(metadata.userId || input?.userId || "").trim()
  };
}
