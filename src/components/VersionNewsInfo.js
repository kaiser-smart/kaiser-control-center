import { versionInfo, versionNews } from "../data/versionInfo.js";

const VERSION_NEWS_PAGE_SIZE = 25;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentNewsPage(pageCount) {
  if (typeof window === "undefined") {
    return 1;
  }

  const rawPage = Number.parseInt(new URLSearchParams(window.location.search).get("newsPage") || "1", 10);
  const safePage = Number.isFinite(rawPage) ? rawPage : 1;
  return Math.min(Math.max(safePage, 1), pageCount);
}

function newsPageHref(page) {
  const normalizedPage = Math.max(1, Number(page) || 1);

  if (typeof window === "undefined") {
    return normalizedPage > 1 ? `/?newsPage=${normalizedPage}#version-news` : "/#version-news";
  }

  const params = new URLSearchParams(window.location.search);
  if (normalizedPage > 1) {
    params.set("newsPage", String(normalizedPage));
  } else {
    params.delete("newsPage");
  }

  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}#version-news`;
}

function paginationRange(currentPage, pageCount) {
  const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);

  return sortedPages.flatMap((page, index) => {
    const previousPage = sortedPages[index - 1];
    return previousPage && page - previousPage > 1 ? ["ellipsis", page] : [page];
  });
}

function VersionNewsPagination({ currentPage, pageCount }) {
  if (pageCount <= 1) {
    return "";
  }

  const pageLinks = paginationRange(currentPage, pageCount)
    .map((page) => {
      if (page === "ellipsis") {
        return `<span class="version-news-info__ellipsis" aria-hidden="true">...</span>`;
      }

      return `
        <a
          class="version-news-info__page"
          href="${escapeHtml(newsPageHref(page))}"
          data-link
          ${page === currentPage ? 'aria-current="page"' : ""}
        >
          ${page}
        </a>
      `;
    })
    .join("");

  const previous = currentPage > 1
    ? `<a class="version-news-info__page version-news-info__page--control" href="${escapeHtml(newsPageHref(currentPage - 1))}" data-link>P&#345;edchoz&iacute;</a>`
    : `<span class="version-news-info__page version-news-info__page--control version-news-info__page--disabled">P&#345;edchoz&iacute;</span>`;
  const next = currentPage < pageCount
    ? `<a class="version-news-info__page version-news-info__page--control" href="${escapeHtml(newsPageHref(currentPage + 1))}" data-link>Dal&#353;&iacute;</a>`
    : `<span class="version-news-info__page version-news-info__page--control version-news-info__page--disabled">Dal&#353;&iacute;</span>`;

  return `
    <nav class="version-news-info__pagination" aria-label="Str&aacute;nkov&aacute;n&iacute; novinek">
      ${previous}
      <span class="version-news-info__pages">
        ${pageLinks}
      </span>
      ${next}
    </nav>
  `;
}

export function VersionNewsInfo() {
  const totalItems = versionNews.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / VERSION_NEWS_PAGE_SIZE));
  const currentPage = currentNewsPage(pageCount);
  const startIndex = (currentPage - 1) * VERSION_NEWS_PAGE_SIZE;
  const visibleNews = versionNews.slice(startIndex, startIndex + VERSION_NEWS_PAGE_SIZE);
  const rangeStart = totalItems ? startIndex + 1 : 0;
  const rangeEnd = Math.min(startIndex + visibleNews.length, totalItems);
  const items = visibleNews
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
    <section class="version-news-info" aria-labelledby="version-news-title" id="version-news">
      <div class="version-news-info__header">
        <h2 id="version-news-title">Co je nov&eacute;ho</h2>
        <div class="version-news-info__summary">
          <p class="version-news-info__eyebrow">${escapeHtml(versionInfo.version)}</p>
          <p class="version-news-info__range">${rangeStart}-${rangeEnd} z ${totalItems}</p>
        </div>
      </div>
      <ul class="version-news-info__list">
        ${items}
      </ul>
      ${VersionNewsPagination({ currentPage, pageCount })}
    </section>
  `;
}
