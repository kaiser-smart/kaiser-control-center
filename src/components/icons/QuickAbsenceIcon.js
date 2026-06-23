import { createSvgIcon } from "./createSvgIcon.js";

export function QuickAbsenceIcon() {
  return createSvgIcon(`
    <rect x="19" y="7" width="26" height="50" rx="6" stroke="#3F4A45" stroke-width="3.5"/>
    <path d="M27 15H37" stroke="#3F4A45" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="32" cy="49" r="2" fill="#3F4A45"/>
    <path d="M24 33L30 39L42 27" stroke="#75BD25" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}
