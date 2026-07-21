import assert from "node:assert/strict";

import {
  buildAgentPatch,
  buildSyncPlan,
  expectedTools,
  safeElevenLabsErrorDetail
} from "../functions/api/ai/elevenlabs/sarlota-tools-sync.js";

const env = {
  APP_BASE_URL: "https://kso.example.test",
  ELEVENLABS_VOICE_WEBHOOK_TOKEN_ENV_LABEL: "kso_test_voice_token"
};

const assistantConfig = {
  assistantKey: "sarlota",
  displayName: "Šarlota – Smart odpady",
  expectedAgentNames: ["Kaiser | Šarlota – Smart odpady"]
};

const agentConfig = {
  name: "Kaiser | Sarlota - Smart odpady",
  conversation_config: {
    agent: {
      first_message: "{{intro_announcement}}",
      prompt: {
        tools: [
          {
            type: "client",
            name: "get_driver_report_context",
            description: "Legacy client tool",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          }
        ]
      }
    }
  }
};

{
  const tools = expectedTools({});
  const driverContextTool = tools.find((tool) => tool.name === "get_driver_report_context");
  const collectionContextTool = tools.find((tool) => tool.name === "get_collection_routes_context");
  const collectionGpsTool = tools.find((tool) => tool.name === "prepare_collection_route_gps_capture");
  const collectionIncidentTool = tools.find((tool) => tool.name === "prepare_collection_route_test_incident");
  assert.equal(driverContextTool.api_schema.url, "https://smart-odpady.ai/api/voice/driver-report-context");
  assert.equal(collectionContextTool.type, "client");
  assert.match(collectionContextTool.description, /oficiálního RSS iROZHLAS/);
  assert.doesNotMatch(collectionContextTool.description, /stav nenastaveno/);
  assert.equal(collectionGpsTool.type, "client");
  assert.match(collectionGpsTool.description, /Nikdy kvůli tomu neotvírej výběr vozidla/);
  assert.match(collectionGpsTool.description, /finální uložení vždy vyžaduje fyzické klepnutí/);
  assert.equal(collectionIncidentTool.type, "client");
  assert.match(collectionIncidentTool.description, /POVINNĚ VOLEJ OKAMŽITĚ/);
  assert.match(collectionIncidentTool.description, /Teprve skutečný výsledek tohoto Toolu/);
  assert.match(collectionIncidentTool.description, /nic neukládá ani neodesílá/);
  assert.match(collectionIncidentTool.description, /Fotografie a velké fyzické klepnutí/);
}

const legacyClientWorkspaceTool = {
  id: "tool-driver-context",
  tool_config: {
    type: "client",
    name: "get_driver_report_context",
    description: "Legacy client tool",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

{
  const tools = expectedTools(env);
  const driverContextTools = tools.filter((tool) => tool.name === "get_driver_report_context");

  assert.equal(driverContextTools.length, 1);
  assert.equal(driverContextTools[0].type, "webhook");
  assert.equal(driverContextTools[0].api_schema.url, "https://kso.example.test/api/voice/driver-report-context");
  assert.equal(driverContextTools[0].api_schema.response_filter.mode, "allow");
  assert.equal(JSON.stringify(driverContextTools[0]).includes("\"dynamic_variable\":\"conversation_id\""), false);
  assert.equal(JSON.stringify(driverContextTools[0]).includes("kso_test_voice_token"), true);
  assert.equal(JSON.stringify(driverContextTools[0]).includes("sk_"), false);
}

{
  const tools = expectedTools({
    APP_BASE_URL: "https://kso.example.test",
    ELEVENLABS_VOICE_WEBHOOK_TOKEN_ENV_LABEL: "KSO_TEST_VOICE_TOKEN"
  });
  const driverContextTool = tools.find((tool) => tool.name === "get_driver_report_context");

  assert.equal(
    driverContextTool.api_schema.request_headers["x-voice-assistant-token"].env_var_label,
    "kso_test_voice_token"
  );
}

{
  const plan = buildSyncPlan(agentConfig, [legacyClientWorkspaceTool], assistantConfig, env);
  const update = plan.workspaceOperations.find((operation) => operation.tool.name === "get_driver_report_context");

  assert.equal(plan.agentNameMatches, true);
  assert.equal(plan.firstMessageMatches, true);
  assert.equal(plan.changedWorkspaceTools.includes("get_driver_report_context"), true);
  assert.equal(plan.existingWorkspaceToolUpdatesSkipped, 0);
  assert.equal(update.action, "update");
  assert.equal(update.id, "tool-driver-context");
  assert.equal(update.tool.type, "webhook");
  assert.equal(update.tool.api_schema.request_headers["x-voice-assistant-token"].env_var_label, "kso_test_voice_token");
}

{
  const plan = buildSyncPlan(agentConfig, [legacyClientWorkspaceTool], assistantConfig, env);
  const patch = buildAgentPatch(agentConfig, [legacyClientWorkspaceTool], plan.expectedNames, env);
  const mergedTools = patch.requestBody.conversation_config.agent.prompt.tools;
  const driverContextTools = mergedTools.filter((tool) => tool.name === "get_driver_report_context");

  assert.equal(patch.ok, true);
  assert.equal(driverContextTools.length, 1);
  assert.equal(driverContextTools[0].type, "webhook");
  assert.equal(driverContextTools[0].api_schema.response_filter.mode, "allow");
}

{
  const expected = expectedTools(env);
  const workspaceTools = expected.map((tool, index) => ({
    id: `tool_expected_${index}_${tool.name}`,
    tool_config: tool
  }));
  const expectedIds = workspaceTools.map((tool) => tool.id);
  const staleConversationIdToolId = "tool_stale_driver_context_conversation_id";
  const staleExtraToolId = "tool_stale_extra";
  const agentWithToolIds = {
    ...agentConfig,
    conversation_config: {
      agent: {
        first_message: "{{intro_announcement}}",
        prompt: {
          tool_ids: [
            staleConversationIdToolId,
            workspaceTools[0].id,
            staleExtraToolId
          ]
        }
      }
    }
  };

  const patch = buildAgentPatch(agentWithToolIds, workspaceTools, expected.map((tool) => tool.name), env);
  const nextToolIds = patch.requestBody.conversation_config.agent.prompt.tool_ids;

  assert.equal(patch.ok, true);
  assert.equal(patch.path, "conversation_config.agent.prompt.tool_ids");
  assert.equal(patch.prunedToolIdsCount, 2);
  assert.deepEqual(nextToolIds, expectedIds);
  assert.equal(nextToolIds.includes(staleConversationIdToolId), false);
  assert.equal(nextToolIds.includes(staleExtraToolId), false);
}

{
  const error = new Error("elevenlabs_request_failed");
  error.status = 400;
  error.payload = {
    detail: [
      {
        loc: ["body", "tool_config", "api_schema", "request_headers", "x-voice-assistant-token", "env_var_label"],
        msg: "Environment variable VOICE_ASSISTANT_WEBHOOK_TOKEN was not found"
      }
    ],
    api_key: "REDACTION_TEST_VALUE",
    authorization: "Bearer FAKE_BEARER_VALUE_FOR_REDACTION_TEST",
    signed_url: "wss://signed.example.invalid/REDACTION_TEST_PATH"
  };
  error.rawBody = JSON.stringify({
    detail: error.payload.detail,
    api_key: "REDACTION_TEST_RAW_API_VALUE",
    token: "REDACTION_TEST_RAW_TOKEN_VALUE",
    authorization: "Bearer REDACTION_TEST_RAW_AUTH_VALUE",
    signed_url: "wss://signed.example.invalid/REDACTION_TEST_PATH"
  });

  const detail = safeElevenLabsErrorDetail(error);
  const serialized = JSON.stringify(detail);

  assert.equal(detail.category, "secret");
  assert.match(detail.summary, /request_headers/);
  assert.match(detail.detail, /Environment variable VOICE_ASSISTANT_WEBHOOK_TOKEN/);
  assert.equal(serialized.includes("REDACTION_TEST_VALUE"), false);
  assert.equal(serialized.includes("REDACTION_TEST_RAW_API_VALUE"), false);
  assert.equal(serialized.includes("REDACTION_TEST_RAW_TOKEN_VALUE"), false);
  assert.equal(serialized.includes("REDACTION_TEST_RAW_AUTH_VALUE"), false);
  assert.equal(serialized.includes("wss://signed.example.invalid/REDACTION_TEST_PATH"), false);
  assert.equal(serialized.includes("Bearer FAKE_BEARER_VALUE_FOR_REDACTION_TEST"), false);
  assert.ok(detail.detail.length <= 900);
}

console.log("sarlota tools sync plan tests passed");
