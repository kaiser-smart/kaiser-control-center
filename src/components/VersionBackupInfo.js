import { versionInfo, versionStatusBadge } from "../data/versionInfo.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function infoItem(label, value) {
  return `
    <div class="version-backup-info__item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

export function VersionBackupInfo() {
  const statusClass = versionInfo.status === "stable" ? "stable" : "development";

  return `
    <section class="version-backup-info" aria-labelledby="version-backup-title">
      <div class="version-backup-info__header">
        <div>
          <p class="version-backup-info__eyebrow">${escapeHtml(versionInfo.appName)}</p>
          <h2 id="version-backup-title">Servisní informace</h2>
        </div>
        <span class="version-backup-info__badge version-backup-info__badge--${statusClass}">
          ${escapeHtml(versionStatusBadge(versionInfo.status))}
        </span>
      </div>
      <dl class="version-backup-info__grid">
        ${infoItem("Verze", versionInfo.version)}
        ${infoItem("Záloha", versionInfo.backupDate)}
        ${infoItem("Commit", versionInfo.commit)}
      </dl>
    </section>
  `;
}
