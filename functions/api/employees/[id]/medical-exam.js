import { getUsers, json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  EmployeeStoreError,
  employeeApiStatus,
  getEmployeeCard
} from "../../../_lib/employees-store.js";
import {
  MedicalExamStoreError,
  getEmployeeMedicalExam,
  medicalExamApiStatus,
  saveEmployeeMedicalExam
} from "../../../_lib/medical-exams-store.js";

function employeeId(request, params) {
  return decodeURIComponent(String(params?.id || new URL(request.url).pathname.split("/").at(-2) || "")).trim();
}

function medicalExamError(error) {
  if (error instanceof EmployeeStoreError || error instanceof MedicalExamStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("employees.medical_exam_failed", { message: error.message });
  return json({ error: "Lékařské prohlídky se teď nepodařilo načíst.", apiStatus: "waiting" }, 500);
}

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const medicalExam = await getEmployeeMedicalExam(env, employee, user);

    return json({
      medicalExam,
      apiStatus: medicalExamApiStatus(env),
      employeeApiStatus: employeeApiStatus(env)
    });
  } catch (error) {
    return medicalExamError(error);
  }
}

export async function onRequestPatch({ request, env, params }) {
  const { user, response } = await requireUserPermission(env, request, "absence", "view");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const employee = await getEmployeeCard(env, users, user, employeeId(request, params));
    const medicalExam = await saveEmployeeMedicalExam(env, employee, user, await readJson(request));

    return json({
      medicalExam,
      apiStatus: medicalExamApiStatus(env)
    });
  } catch (error) {
    return medicalExamError(error);
  }
}
