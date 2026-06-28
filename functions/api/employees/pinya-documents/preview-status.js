import { getUsers, json, requireUserPermission } from "../../../_lib/auth.js";
import { listEmployeeCards } from "../../../_lib/employees-store.js";

function pinyaDocumentsPreviewPayload(employees = []) {
  const visibleEmployees = Array.isArray(employees) ? employees : [];

  return {
    apiStatus: "waiting",
    integrationStatus: "not_configured",
    mode: "read-only-preview-contract",
    canLoadPinya: false,
    canDownloadDocuments: false,
    canStoreDocuments: false,
    message: "Pinya napojení není nakonfigurované. Preview zatím nevolá Pinya, nestahuje dokumenty a nic neukládá.",
    summary: {
      smartEmployeeCount: visibleEmployees.length,
      pinyaEmployeeCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      duplicateCount: 0,
      missingInPinyaCount: 0,
      missingInSmartCount: 0,
      documentCount: 0
    },
    rows: [],
    blockers: [
      "Chybí schválený způsob čtení Pinya webu/API.",
      "Chybí potvrzené mapování zaměstnanců Smart ↔ Pinya.",
      "Chybí schválené ukládání stažených dokumentů do stávajícího úložiště."
    ]
  };
}

async function readSmartEmployees(env, user) {
  const users = await getUsers(env);
  return listEmployeeCards(env, users, user);
}

async function previewStatus(env, request) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const employees = await readSmartEmployees(env, user);
    return json(pinyaDocumentsPreviewPayload(employees));
  } catch (error) {
    console.error("employees.pinya_documents.preview_status_failed", { message: error.message });
    return json({
      ...pinyaDocumentsPreviewPayload([]),
      error: "Preview stavu Pinya dokumentů se teď nepodařilo načíst."
    }, 500);
  }
}

export async function onRequestGet({ env, request }) {
  return previewStatus(env, request);
}

export async function onRequestPost({ env, request }) {
  const response = await previewStatus(env, request);
  const payload = await response.clone().json();

  return json({
    ...payload,
    run: {
      mode: "read-only-preview-contract",
      status: "blocked",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    }
  }, response.status);
}
