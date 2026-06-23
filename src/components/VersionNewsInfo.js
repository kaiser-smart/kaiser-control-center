import { versionInfo, versionNews } from "../data/versionInfo.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function VersionNewsInfo() {
  const items = versionNews
    .map(
      (item) => `
        <li class="version-news-info__item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </li>
      `
    )
    .join("");

  return `
    <section class="version-news-info" aria-labelledby="version-news-title">
      <div class="version-news-info__header">
        <h2 id="version-news-title">Co je nového</h2>
        <p class="version-news-info__eyebrow">${escapeHtml(versionInfo.version)}</p>
      </div>
      <ul class="version-news-info__list">
        ${items}
      </ul>
    </section>
  `;
}
