import assert from "node:assert/strict";

import {
  assistantPublicMetadata,
  resolveElevenLabsAssistantConfig
} from "../src/elevenLabsAssistants.js";
import {
  AI_ALLOWED_ROUTES,
  AI_MODULE_ROUTE_MAP,
  ELEVENLABS_CLIENT_TOOL_SCHEMAS,
  createElevenLabsClientTools
} from "../src/elevenLabsClientTools.js";
import {
  SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE,
  SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE
} from "../src/sarlota/sarlotaSystemPrompt.js";
import { useElevenLabsAssistant } from "../src/useElevenLabsAssistant.js";

const REQUIRED_DRIVER_REPORT_TOOLS = [
  "open_module",
  "get_driver_report_context",
  "show_driver_vehicle_picker",
  "get_driver_vehicle_picker_selection",
  "validate_driver_vehicle_spz",
  "create_driver_part_request",
  "prepare_collection_route_gps_capture"
];

function assertNoSecret(value = "") {
  const text = JSON.stringify(value);
  assert.equal(text.includes("sk_"), false);
  assert.equal(text.includes("ELEVENLABS_API_KEY"), false);
  assert.equal(text.includes("wss://signed.example.invalid/private-token"), false);
}

{
  assert.equal(AI_ALLOWED_ROUTES.includes("/hlaseni-ridicu"), true);
  assert.equal(AI_MODULE_ROUTE_MAP["driver-reports"], "/hlaseni-ridicu");
  assert.equal(AI_MODULE_ROUTE_MAP["hlaseni-ridicu"], "/hlaseni-ridicu");

  const navigations = [];
  const tools = createElevenLabsClientTools({
    navigate: (route) => navigations.push(route),
    canUseRoute: () => true
  });

  const opened = await tools.open_module({ moduleId: "driver-reports" });
  assert.equal(opened.ok, true);
  assert.equal(opened.route, "/hlaseni-ridicu");
  assert.deepEqual(navigations, ["/hlaseni-ridicu"]);
}

{
  const toolNames = new Set(ELEVENLABS_CLIENT_TOOL_SCHEMAS.map((tool) => tool.name));
  for (const toolName of REQUIRED_DRIVER_REPORT_TOOLS) {
    assert.equal(toolNames.has(toolName), true, `Missing ElevenLabs client tool schema: ${toolName}`);
  }
}

{
  const env = {
    ELEVENLABS_AGENT_ID_SARLOTA: "agent-prod-1234567890",
    ELEVENLABS_AGENT_ID_SARLOTA_SMART_2: "agent-test-0987654321"
  };
  const prod = resolveElevenLabsAssistantConfig("sarlota", env);
  const smart2 = resolveElevenLabsAssistantConfig("sarlota-smart-2", env);

  assert.equal(prod.assistantKey, "sarlota");
  assert.equal(prod.isProduction, true);
  assert.equal(prod.isTest, false);
  assert.equal(prod.envVariableName, "ELEVENLABS_AGENT_ID_SARLOTA");
  assert.equal(smart2.assistantKey, "sarlota-smart-2");
  assert.equal(smart2.isProduction, false);
  assert.equal(smart2.isTest, true);
  assert.equal(smart2.envVariableName, "ELEVENLABS_AGENT_ID_SARLOTA_SMART_2");
  assert.notEqual(prod.agentId, smart2.agentId);

  const publicMeta = assistantPublicMetadata(smart2);
  assert.equal(publicMeta.assistantAgentIdPresent, true);
  assert.equal(publicMeta.assistantAgentIdMasked.includes("agent-test-0987654321"), false);
  assertNoSecret(publicMeta);

  const missingMeta = assistantPublicMetadata(resolveElevenLabsAssistantConfig("sarlota-smart-2", {}));
  assert.equal(missingMeta.assistantAgentIdPresent, false);
  assert.equal(missingMeta.assistantAgentIdMasked, "");
}

{
  assert.match(SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE, /current_module_route `\/trasy-svozu`/);
  assert.match(SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE, /vždy zavolej prepare_collection_route_gps_capture/);
  assert.match(SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE, /nikdy nevolej get_driver_report_context/);
  assert.match(SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE, /show_driver_vehicle_picker/);
  assert.match(SARLOTA_COLLECTION_ROUTES_GPS_PROMPT_RULE, /Finální uložení vždy vyžaduje fyzické klepnutí/);

  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Jaký tam jsou vozidla\?/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Jaký tam mám\?/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Ty tam vidíš co\?/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Který vozidla mám přiřazený\?/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /vždy nejdřív zavolej get_driver_report_context/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /show_driver_vehicle_picker nesmí být první krok/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Konkrétní vozidla smíš v hlasu říct pouze tehdy/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /vehiclesVerified: true/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /jedno nebo více vozidel/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Nikdy neříkej VIN v hlasu/);
  assert.match(
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
    /Nevidím bezpečně přiřazené vozidlo\. Nadiktuj mi prosím SPZ\./
  );
  assert.doesNotMatch(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Konkrétní vozidlo smíš[^.]*právě jedno vozidlo/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Nikdy neříkej, že je hotovo/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Nikdy neříkej, že je něco předané Patrikovi nebo Kamilovi/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Doplníš k tomu ještě poznámku/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /confirmationSource `voice-intake`/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Po vyřízení poznámky už se neptej `Mám hlášení uložit\?`/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /driverPartRequest\.reportId/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Hlášení se mi nepodařilo zapsat/);
  const createReportTool = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((tool) => tool.name === "create_driver_part_request");
  assert.match(createReportTool?.description || "", /Za vytvořené hlášení považuj jen výsledek s ok true/);
  assert.match(createReportTool?.description || "", /driverPartRequest\.reportId/);
}

{
  const requestedPaths = [];
  const assistant = useElevenLabsAssistant({
    signedUrlOptions: (assistantId, sessionContext = {}) => ({
      omitDriverReportVehicleContext: ["sarlota", "sarlota-smart-2"].includes(assistantId) &&
        sessionContext.interfaceMode === "voice"
    }),
    fetchJson: async (path) => {
      requestedPaths.push(path);
      assertNoSecret(path);
      return {
        signedUrl: "wss://signed.example.invalid/redacted",
        assistantId: "sarlota-smart-2",
        assistantName: "Šarlota Smart 2",
        configured: true
      };
    }
  });

  await assistant.prepareSignedUrl("sarlota-smart-2", { interfaceMode: "voice" });
  const path = requestedPaths.at(-1);
  assert.match(path, /assistant=sarlota-smart-2/);
  assert.match(path, /diagnosticMode=identity_no_driver_vehicles/);
  assert.doesNotMatch(path, /assistant=sarlota(&|$)/);
}

console.log("sarlota voice smoke tests passed");
