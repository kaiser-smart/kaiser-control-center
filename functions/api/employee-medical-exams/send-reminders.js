import { getUsers, json, requireUserPermission } from "../../_lib/auth.js";
import {
  MedicalExamStoreError,
  listMedicalExamReminderCandidates
} from "../../_lib/medical-exams-store.js";
import { sendMedicalExamReminders } from "../../_lib/notification-service.js";

function medicalExamReminderError(error) {
  if (error instanceof MedicalExamStoreError) {
    return json({ error: error.message, code: error.code, apiStatus: "waiting" }, error.status);
  }

  console.error("employee_medical_exams.reminders_failed", { message: error.message });
  return json({ error: "Upozornění na lékařské prohlídky se nepodařilo odeslat.", apiStatus: "waiting" }, 500);
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "absence", "manage");

  if (response) {
    return response;
  }

  try {
    const users = await getUsers(env);
    const exams = await listMedicalExamReminderCandidates(env, users);
    const notifications = await sendMedicalExamReminders(env, exams);

    return json({
      count: exams.length,
      notifications,
      apiStatus: "ready"
    });
  } catch (error) {
    return medicalExamReminderError(error);
  }
}
