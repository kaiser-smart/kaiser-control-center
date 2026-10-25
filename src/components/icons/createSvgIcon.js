export function createSvgIcon(children, name = "") {
  return `<svg class="smart-icon module-icon__svg" data-icon="${name}" viewBox="0 0 24 24" width="24" height="24" fill="#243128" stroke="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${children}</svg>`;
}
