import { createSvgIcon } from "./createSvgIcon.js";

export function AbsenceIcon() {
  return createSvgIcon(`
    <path d="M16 12H48C51.3137 12 54 14.6863 54 18V50C54 53.3137 51.3137 56 48 56H16C12.6863 56 10 53.3137 10 50V18C10 14.6863 12.6863 12 16 12Z" stroke="#3F4A45" stroke-width="3.5"/>
    <path d="M10 24H54" stroke="#3F4A45" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M22 8V16M42 8V16" stroke="#75BD25" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M21 35L29 43L44 29" stroke="#75BD25" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}
