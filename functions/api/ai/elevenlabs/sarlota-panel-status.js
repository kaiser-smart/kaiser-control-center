import { json, requireUserPermission } from "../../../_lib/auth.js";
import { sarlotaPanelStatusPayload } from "./sarlota-status.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return cleanString(error?.message || error?.name || "unknown_error");
}

function failedPanelStatusPayload(error) {
  return {
    generatedAt: new Date().toISOString(),
    panel: {
      title: "Šarlota",
      readOnly: true,
      openedByDeepLink: true
    },
    statuses: {
      elevenLabs: {
        label: "ElevenLabs",
        status: "error",
        detail: "serverová diagnostika se nepodařila načíst"
      },
      openAi: {
        label: "OpenAI",
        status: "unverified",
        detail: "NEOVĚŘENO"
      },
      ksoBackend: {
        label: "KSO backend",
        status: "error",
        detail: "server vrátil kontrolovanou chybu"
      },
      signedUrl: {
        label: "Signed-url endpoint",
        status: "error",
        detail: "endpoint existuje, ale diagnostika selhala"
      },
      personalization: {
        label: "Personalizace",
        status: "unverified",
        detail: "NEOVĚŘENO"
      },
      introAnnouncement: {
        label: "intro_announcement",
        status: "unverified",
        detail: "NEOVĚŘENO"
      },
      vocative: {
        label: "Vocativ",
        status: "unverified",
        detail: "NEOVĚŘENO"
      }
    },
    checks: {
      signedUrlEndpoint: "/api/ai/elevenlabs/signed-url?assistant=sarlota",
      voiceEndpoint: "/api/voice/sarlota",
      signedUrlOmitted: true,
      secretsOmitted: true,
      dynamicVariableValuesOmitted: true,
      noLiveToolsExecuted: true
    },
    error: {
      code: "sarlota_panel_status_failed",
      message: safeErrorMessage(error)
    }
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const { user, response } = await requireUserPermission(env, request, "dashboard", "view");

    if (response) {
      return response;
    }

    return json(await sarlotaPanelStatusPayload(env, user));
  } catch (error) {
    console.error("elevenlabs.sarlota_panel_status_failed", {
      message: safeErrorMessage(error)
    });
    return json(failedPanelStatusPayload(error), 200);
  }
}
