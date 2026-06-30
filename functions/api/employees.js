import { getUsers, json, readJson, requireUserPermission } from "../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  listEmployeeCards,
  saveEmployeeCard,
  saveImportedEmployeeCard
} from "../_lib/employees-store.js";

function employeeError(error) {
  if (error instanceof EmployeeStoreError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("employees.api_failed", { message: error.message });
  return json({ error: "Karty zaměstnanců se teď nepodařilo načíst." }, 500);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeManualEmployeeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function manualEmployeeId(payload = {}) {
  const base = normalizeManualEmployeeKey([
    payload.firstName,
    payload.lastName
  ].filter(Boolean).join(" ")) || "zamestnanec";
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manual-${base}-${String(suffix).slice(0, 8)}`;
}

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employees = await listEmployeeCards(env, users, user);
    return json({
      employees,
      apiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return employeeError(error);
  }
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "edit");

  if (response) {
    return response;
  }

  try {
    const payload = await readJson(request);
    const users = await getUsers(env);
    const isHrOnlyCreate = payload?.createMode === "hr_only" || payload?.isHrOnly === true;
    const firstName = cleanString(payload?.firstName);
    const lastName = cleanString(payload?.lastName);

    if (isHrOnlyCreate) {
      if (!firstName || !lastName) {
        throw new EmployeeStoreError("Doplňte jméno a příjmení zaměstnance.", 400, "employee_name_required");
      }

      const employee = await saveImportedEmployeeCard(env, users, user, {
        ...payload,
        id: cleanString(payload.id || payload.userId) || manualEmployeeId(payload),
        userId: cleanString(payload.userId || payload.id),
        isHrOnly: true,
        sourceSystem: cleanString(payload.sourceSystem) || "manual-entry",
        sourceEmployeeKey: cleanString(payload.sourceEmployeeKey || payload.email || `${firstName} ${lastName}`)
      });
      return json({ employee }, 201);
    }

    const employee = await saveEmployeeCard(env, users, user, payload.userId || payload.id, payload);
    return json({ employee }, 201);
  } catch (error) {
    return employeeError(error);
  }
}
