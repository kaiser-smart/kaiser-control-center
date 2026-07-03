import assert from "node:assert/strict";

import {
  buildAgentPatch,
  buildSyncPlan,
  expectedTools
} from "../functions/api/ai/elevenlabs/sarlota-tools-sync.js";

const env = {
  APP_BASE_URL: "https://kso.example.test",
  ELEVENLABS_VOICE_WEBHOOK_TOKEN_ENV_LABEL: "KSO_TEST_VOICE_TOKEN"
};

const assistantConfig = {
  assistantKey: "sarlota",
  displayName: "Kaiser | Šarlota - Smart odpady",
  expectedAgentNames: ["Kaiser | Šarlota - Smart odpady"]
};

const agentConfig = {
  name: "Kaiser | Šarlota - Smart odpady",
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
  assert.equal(JSON.stringify(driverContextTools[0]).includes("KSO_TEST_VOICE_TOKEN"), true);
  assert.equal(JSON.stringify(driverContextTools[0]).includes("sk_"), false);
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
  assert.equal(update.tool.api_schema.request_headers["x-voice-assistant-token"].env_var_label, "KSO_TEST_VOICE_TOKEN");
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

console.log("sarlota tools sync plan tests passed");
