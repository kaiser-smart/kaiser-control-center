import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  driverPartAiCandidateFromMatch,
  driverPartRequestInitialStatus,
  identifyProbablePartFromDescription
} from "../functions/_lib/driver-parts-catalog.js";
import {
  handoffDriverPartRequest,
  processDriverPartRequestAfterVoiceCreate,
  verifyMercedesDriverPartRequest,
  __test as driverPartRequestInternals
} from "../functions/_lib/driver-part-requests-store.js";
import {
  sendDriverPartOrderNotification,
  __test as notificationInternals
} from "../functions/_lib/notification-service.js";
import { partslink24EligibilityForVehicle } from "../functions/_lib/partslink24-search-store.js";
import {
  driverPartPriceSearchEligibility,
  runDriverPartPriceSearch,
  __test as driverPartPriceSearchInternals
} from "../functions/_lib/driver-part-price-search.js";

const adminUser = {
  id: "radim-oplustil",
  name: "Radim Oplustil",
  role: "admin"
};
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function passengerVehicle(overrides = {}) {
  return {
    id: "vehicle-passenger-1",
    vehicleId: "vehicle-passenger-1",
    internalNumber: "Mercedes CLS 400 d 4matic",
    licensePlate: "2BB 8251",
    vin: "WDD2573211A123456",
    vehicleType: "osobní",
    bodyType: "M1",
    brand: "Mercedes",
    model: "CLS",
    ...overrides
  };
}

function driverPartRequestRow(overrides = {}) {
  return {
    id: "driver-part-request-e2e",
    report_id: "ND-TEST-E2E",
    reported_at: "2026-07-05T12:44:00.000Z",
    driver_user_id: "radim-oplustil",
    driver_name: "Radim Opluštil",
    driver_phone: "604 542 004",
    vehicle_id: "vehicle-passenger-1",
    vehicle_name: "Mercedes CLS 400 d 4matic",
    license_plate: "2BB 8251",
    vin: "WDD2573211A123456",
    vehicle_brand: "mercedes",
    defect_type: "poškozené sklo",
    defect_description: "prasklé přední sklo",
    damage_photo_status: "requested",
    damage_photo_requested_at: "2026-07-05T12:44:00.000Z",
    damage_photo_document_id: "",
    damage_photo_note: "Šarlota požádala řidiče o fotku poškození.",
    probable_part: "přední sklo",
    probable_part_side: "unknown",
    part_identification_status: "probable_part",
    verified_part: "",
    part_order_number: "",
    oe_part_number: "",
    part_name: "",
    part_verification_status: "probable_part",
    part_verification_source: "",
    parts_provider_id: "partslink24",
    parts_provider_status: "waiting_vin_pilot",
    parts_provider_message: "Autopilot rozpoznal konkrétní díl.",
    parts_provider_error: "",
    part_lookup_query: "přední sklo",
    part_lookup_result_json: "",
    mercedes_manual_portal_url: "",
    mercedes_mypartshub_url: "",
    price_boost_status: "waiting_verified_part",
    price_boost_note: "Cenový průzkum čeká na ověřené OE číslo.",
    price_boost_checked_at: "",
    price_boost_result_json: "",
    status: "part_identified",
    assigned_to_name: "",
    assigned_to_email: "",
    handed_off_to_patrik_at: "",
    kamil_sms_sent_at: "",
    ordered_at: "",
    ordered_by_user_id: "",
    delivered_at: "",
    delivered_by_user_id: "",
    service_date: "",
    service_time: "",
    service_technician: "",
    service_note: "",
    driver_sms_sent_at: "",
    completed_at: "",
    completed_by_user_id: "",
    canceled_at: "",
    canceled_by_user_id: "",
    note: "",
    patrik_email_status: "not_sent",
    patrik_email_error: "",
    kamil_sms_status: "not_sent",
    kamil_sms_recipient: "",
    kamil_sms_error: "",
    driver_sms_status: "not_sent",
    driver_sms_error: "",
    source: "voice_vehicle_confirmed",
    created_by_user_id: "radim-oplustil",
    created_at: "2026-07-05T12:44:00.000Z",
    updated_by_user_id: "radim-oplustil",
    updated_at: "2026-07-05T12:44:00.000Z",
    ...overrides
  };
}

function createDriverPartTestDb(initialRows = []) {
  const state = {
    requests: new Map(initialRows.map((row) => [row.id, { ...row }])),
    events: [],
    notificationLogs: [],
    communicationThreads: new Map(),
    communicationMessages: new Map(),
    communicationEvents: []
  };

  function normalizedSql(sql) {
    return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function requestByIdOrReportId(id, reportId = id) {
    return [...state.requests.values()].find((row) => row.id === id || row.report_id === reportId) || null;
  }

  function statement(sql) {
    return {
      sql,
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        const compactSql = normalizedSql(sql);
        if (compactSql.includes("from driver_part_requests")) {
          return requestByIdOrReportId(this.params[0], this.params[1]);
        }
        if (compactSql.includes("from driver_report_partslink24_searches")) {
          return null;
        }
        return null;
      },
      async all() {
        const compactSql = normalizedSql(sql);
        if (compactSql.startsWith("pragma table_info(notification_logs)")) {
          return {
            results: [
              "module_id",
              "subject",
              "message_preview",
              "provider",
              "provider_message_id",
              "attempts",
              "updated_at",
              "message_id",
              "thread_id",
              "audit_id",
              "from_name",
              "from_address",
              "reply_to",
              "subject_token",
              "provider_status"
            ].map((name) => ({ name }))
          };
        }
        if (compactSql.includes("from driver_part_request_events")) {
          return {
            results: state.events
              .filter((event) => event.request_id === this.params[0])
              .slice()
              .reverse()
          };
        }
        return { results: [] };
      },
      async run() {
        const compactSql = normalizedSql(sql);
        if (compactSql.includes("update driver_part_requests set price_boost_status")) {
          const [
            priceBoostStatus,
            priceBoostNote,
            priceBoostCheckedAt,
            priceBoostResultJson,
            updatedByUserId,
            updatedAt,
            id
          ] = this.params;
          const row = state.requests.get(id);
          Object.assign(row, {
            price_boost_status: priceBoostStatus,
            price_boost_note: priceBoostNote || "",
            price_boost_checked_at: priceBoostCheckedAt || "",
            price_boost_result_json: priceBoostResultJson || "",
            updated_by_user_id: updatedByUserId || "",
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (
          compactSql.includes("update driver_part_requests set status = ?") &&
          compactSql.includes("assigned_to_name")
        ) {
          const [
            status,
            assignedToName,
            assignedToEmail,
            handedOffToPatrikAt,
            patrikEmailStatus,
            patrikEmailError,
            updatedByUserId,
            updatedAt,
            id
          ] = this.params;
          const row = state.requests.get(id);
          Object.assign(row, {
            status,
            assigned_to_name: assignedToName || "",
            assigned_to_email: assignedToEmail || "",
            handed_off_to_patrik_at: handedOffToPatrikAt || "",
            patrik_email_status: patrikEmailStatus || "",
            patrik_email_error: patrikEmailError || "",
            updated_by_user_id: updatedByUserId || "",
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (
          compactSql.includes("update driver_part_requests set status = ?") &&
          compactSql.includes("updated_by_user_id")
        ) {
          const [
            status,
            updatedByUserId,
            updatedAt,
            id
          ] = this.params;
          const row = state.requests.get(id);
          Object.assign(row, {
            status,
            updated_by_user_id: updatedByUserId || "",
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (compactSql.includes("update driver_part_requests set verified_part")) {
          const [
            verifiedPart,
            partOrderNumber,
            oePartNumber,
            partName,
            partIdentificationStatus,
            partVerificationStatus,
            partVerificationSource,
            partsProviderId,
            partsProviderStatus,
            partsProviderMessage,
            partsProviderError,
            partLookupQuery,
            partLookupResultJson,
            mercedesManualPortalUrl,
            mercedesMyPartsHubUrl,
            priceBoostStatus,
            priceBoostNote,
            updatedByUserId,
            updatedAt,
            id
          ] = this.params;
          const row = state.requests.get(id);
          Object.assign(row, {
            verified_part: verifiedPart || "",
            part_order_number: partOrderNumber || "",
            oe_part_number: oePartNumber || "",
            part_name: partName || "",
            part_identification_status: partIdentificationStatus || "",
            part_verification_status: partVerificationStatus || "",
            part_verification_source: partVerificationSource || "",
            parts_provider_id: partsProviderId || "",
            parts_provider_status: partsProviderStatus || "",
            parts_provider_message: partsProviderMessage || "",
            parts_provider_error: partsProviderError || "",
            part_lookup_query: partLookupQuery || "",
            part_lookup_result_json: partLookupResultJson || "",
            mercedes_manual_portal_url: mercedesManualPortalUrl || "",
            mercedes_mypartshub_url: mercedesMyPartsHubUrl || "",
            price_boost_status: priceBoostStatus || "",
            price_boost_note: priceBoostNote || "",
            updated_by_user_id: updatedByUserId || "",
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (compactSql.includes("insert into driver_part_request_events")) {
          const [
            id,
            requestId,
            action,
            actorUserId,
            actorName,
            createdAt,
            beforeJson,
            afterJson,
            note,
            notificationChannel,
            notificationRecipient,
            notificationStatus,
            notificationError
          ] = this.params;
          state.events.push({
            id,
            request_id: requestId,
            action,
            actor_user_id: actorUserId || "",
            actor_name: actorName || "",
            created_at: createdAt,
            before_json: beforeJson || "",
            after_json: afterJson || "",
            note: note || "",
            notification_channel: notificationChannel || "",
            notification_recipient: notificationRecipient || "",
            notification_status: notificationStatus || "",
            notification_error: notificationError || ""
          });
          return { success: true };
        }
        if (compactSql.includes("insert into notification_logs")) {
          state.notificationLogs.push({
            id: this.params[0],
            type: this.params[2],
            channel: this.params[3],
            recipient: this.params[4],
            status: this.params[7],
            subject: this.params[9],
            provider: this.params[11],
            providerMessageId: this.params[12],
            messageId: this.params[17],
            threadId: this.params[18],
            auditId: this.params[19],
            fromName: this.params[20],
            fromAddress: this.params[21],
            replyTo: this.params[22],
            subjectToken: this.params[23],
            providerStatus: this.params[24]
          });
          return { success: true };
        }
        if (compactSql.includes("insert into communication_threads")) {
          const [
            id,
            threadId,
            moduleKey,
            entityType,
            entityId,
            auditId,
            subjectToken,
            subject,
            status,
            lastOutboundAt,
            lastEventAt,
            metadataJson,
            createdAt,
            updatedAt
          ] = this.params;
          state.communicationThreads.set(threadId, {
            id,
            thread_id: threadId,
            module_key: moduleKey,
            entity_type: entityType,
            entity_id: entityId || "",
            audit_id: auditId,
            subject_token: subjectToken,
            subject: subject || "",
            status,
            last_outbound_at: lastOutboundAt,
            last_event_at: lastEventAt,
            metadata_json: metadataJson || "{}",
            created_at: createdAt,
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (compactSql.includes("insert into communication_messages")) {
          const [
            id,
            threadId,
            auditId,
            channel,
            direction,
            moduleKey,
            entityType,
            entityId,
            messageId,
            provider,
            fromName,
            fromAddress,
            replyTo,
            toAddress,
            ccAddress,
            subject,
            bodyPreview,
            status,
            rawPayload,
            createdAt,
            updatedAt
          ] = this.params;
          state.communicationMessages.set(id, {
            id,
            thread_id: threadId,
            audit_id: auditId,
            channel,
            direction,
            module_key: moduleKey,
            entity_type: entityType,
            entity_id: entityId || "",
            message_id: messageId,
            provider,
            from_name: fromName || "",
            from_address: fromAddress || "",
            reply_to: replyTo || "",
            to_address: toAddress || "",
            cc_address: ccAddress || "",
            subject: subject || "",
            body_preview: bodyPreview || "",
            status,
            raw_payload: rawPayload || "{}",
            created_at: createdAt,
            updated_at: updatedAt
          });
          return { success: true };
        }
        if (compactSql.includes("update communication_messages")) {
          const [
            status,
            provider,
            providerMessageId,
            providerStatus,
            errorMessage,
            sentStatus,
            sentAt,
            updatedAt,
            id
          ] = this.params;
          const row = state.communicationMessages.get(id);
          if (row) {
            Object.assign(row, {
              status,
              provider: provider || row.provider,
              provider_message_id: providerMessageId || row.provider_message_id || "",
              provider_status: providerStatus,
              error_message: errorMessage || "",
              sent_at: sentStatus === "sent" ? (row.sent_at || sentAt) : row.sent_at,
              updated_at: updatedAt
            });
          }
          return { success: true };
        }
        if (compactSql.includes("update communication_threads")) {
          const [
            status,
            sentStatus,
            lastOutboundAt,
            lastEventAt,
            updatedAt,
            threadId
          ] = this.params;
          const row = state.communicationThreads.get(threadId);
          if (row) {
            Object.assign(row, {
              status,
              last_outbound_at: sentStatus === "sent" ? (row.last_outbound_at || lastOutboundAt) : row.last_outbound_at,
              last_event_at: lastEventAt,
              updated_at: updatedAt
            });
          }
          return { success: true };
        }
        if (compactSql.includes("insert into communication_events")) {
          state.communicationEvents.push({
            id: this.params[0],
            event_type: this.params[1],
            channel: this.params[2],
            module_key: this.params[3],
            entity_type: this.params[4],
            entity_id: this.params[5],
            thread_id: this.params[6],
            communication_message_id: this.params[7],
            status: this.params[8],
            detail: this.params[9],
            raw_payload: this.params[10],
            created_at: this.params[11]
          });
          return { success: true };
        }
        return { success: true };
      }
    };
  }

  return {
    state,
    prepare(sql) {
      return statement(sql);
    },
    async batch(statements) {
      const results = [];
      for (const prepared of statements) {
        results.push(await prepared.run());
      }
      return results;
    }
  };
}

function driverPartTestEnv(db, offers) {
  return {
    APP_ENV: "test",
    AUTH_USERS_JSON: JSON.stringify([
      { id: "patrik-istvanek", name: "Patrik Ištvánek", email: "patrik@example.test", role: "servis" }
    ]),
    SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
      vehicles: [passengerVehicle()],
      driverCandidates: [{ id: "radim-oplustil", userId: "radim-oplustil", name: "Radim Opluštil" }]
    }),
    SMART_ODPADY_DB: db,
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({ offers }),
    EMAIL_PROVIDER: "sendgrid",
    SENDGRID_API_KEY: "test-sendgrid-key",
    EMAIL_FROM: "robot@example.test",
    PARTS_ORDER_EMAIL: "patrik@example.test",
    PARTS_PILOT_CC_EMAIL: "oplustil@kaiserservis.cz",
    MERCEDES_PARTS_PROVIDER_ENABLED: "true",
    MERCEDES_PARTS_API_BASE_URL: "https://mercedes.example.test"
  };
}

{
  assert.match(
    appSource,
    /result\.request\?\.status === "handed_to_ordering" && result\.request\?\.patrikEmailStatus === "sent"/
  );
  assert.match(appSource, /OpenAI web-search je jen read-only náhled/);
  assert.match(appSource, /oficiální price provider/);
  assert.match(appSource, /official_provider_not_configured/);
}

{
  const match = identifyProbablePartFromDescription("Prasklé přední sklo");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "přední sklo");
  assert.equal(match.confidence, "high");
}

{
  const match = identifyProbablePartFromDescription("Pravé vnější zpětné zrcátko");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "pravé vnější zpětné zrcátko");
  assert.equal(match.probablePartSide, "right");
}

{
  const match = identifyProbablePartFromDescription("Něco píská na podvozku");
  assert.equal(driverPartAiCandidateFromMatch(match), false);
  assert.equal(match.aiSkipReason, "ambiguous_fault");
  assert.equal(match.category, "nejasná závada");
  assert.equal(match.backgroundAction, "diagnostics");
  assert.equal(driverPartRequestInitialStatus(match), "waiting_diagnostics");
}

{
  const match = identifyProbablePartFromDescription("Výměna oleje");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "motorový olej podle specifikace + olejový filtr");
  assert.equal(match.category, "jasný servisní úkon");
  assert.equal(match.serviceType, "výměna oleje");
  assert.equal(match.backgroundAction, "parts_search");
  assert.equal(driverPartRequestInitialStatus(match), "part_identified");
}

{
  const match = identifyProbablePartFromDescription("výměna stěračů");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "přední stěrače");
  assert.equal(match.category, "jasný servisní úkon");
  assert.equal(match.serviceType, "výměna stěračů");
  assert.equal(match.backgroundAction, "parts_search");
  assert.equal(driverPartRequestInitialStatus(match), "part_identified");
}

{
  const match = identifyProbablePartFromDescription("Auto špatně brzdí a pedál je měkký");
  assert.equal(driverPartAiCandidateFromMatch(match), false);
  assert.equal(match.aiSkipReason, "urgent_safety");
  assert.equal(match.category, "bezpečnostní problém");
  assert.equal(match.priority, "urgentní");
  assert.equal(match.backgroundAction, "urgent_alert");
  assert.equal(driverPartRequestInitialStatus(match), "ready_for_patrik");
}

{
  const match = identifyProbablePartFromDescription("Potřebuju vyměnit brzdové destičky");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.needsPartSideClarification, true);
  assert.equal(match.partIdentificationStatus, "probable_waiting_verification");
  assert.equal(driverPartRequestInitialStatus(match), "waiting_part_identification");
}

{
  const match = identifyProbablePartFromDescription("Prasklý výfuk");
  assert.equal(driverPartAiCandidateFromMatch(match), true);
  assert.equal(match.probablePart, "výfuk / díl výfuku");
  assert.equal(match.confidence, "high");
}

{
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle({
    vehicleType: "nákladní vozidlo",
    bodyType: "N3"
  }));
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_ONLY_PASSENGER_VEHICLES");
}

{
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle({ vin: "" }));
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.errorCode, "PARTSLINK24_VIN_MISSING");
}

{
  const item = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    probablePart: "přední sklo",
    partsProviderStatus: "not_configured",
    patrikEmailStatus: "not_sent"
  };
  const eligibility = partslink24EligibilityForVehicle(adminUser, passengerVehicle());
  const state = driverPartRequestInternals.driverPartVinPilotState(item, eligibility, null);
  assert.equal(state.status, "provider_not_configured");
  assert.match(state.message, /Partslink24 není nastaven/);
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Prasklé přední sklo",
      licensePlate: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.probablePart, "přední sklo");
  assert.equal(payload.partVerificationStatus, "probable_part");
  assert.equal(payload.partsProviderId, "partslink24");
  assert.equal(payload.partsProviderStatus, "waiting_vin_pilot");
  assert.equal(payload.priceBoostStatus, "waiting_verified_part");
  assert.match(payload.partLookupQuery, /přední sklo/);
  assert.equal(payload.vehicleName, "Mercedes CLS 400 d 4matic");
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Něco vrže od předního kola",
      driverNote: "Dělá to hlavně při zatáčení doprava.",
      licensePlate: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.status, "waiting_diagnostics");
  assert.equal(payload.probablePart, "");
  assert.equal(payload.partsProviderStatus, "not_applicable");
  assert.equal(payload.priceBoostStatus, "not_requested");
  assert.match(payload.note, /Poznámka řidiče: Dělá to hlavně při zatáčení doprava\./);
  assert.match(payload.note, /Nelze spolehlivě určit konkrétní díl/);
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Auto špatně brzdí, pedál je měkký",
      driverNote: "Auto hůř zastavuje.",
      licensePlate: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.status, "ready_for_patrik");
  assert.equal(payload.probablePart, "");
  assert.equal(payload.partsProviderStatus, "not_applicable");
  assert.match(payload.note, /Poznámka řidiče: Auto hůř zastavuje\./);
  assert.match(payload.note, /Urgentní bezpečnostní problém/);
}

{
  const payload = driverPartRequestInternals.normalizeCreatePayload(
    {
      defectDescription: "Prasklý výfuk",
      licensePlate: "2BB 8251",
      vehicleName: "2BB 8251",
      driverName: "Radim Oplustil"
    },
    adminUser,
    passengerVehicle(),
    null
  );
  assert.equal(payload.vehicleName, "Mercedes CLS 400 d 4matic");
  assert.equal(driverPartRequestInternals.driverPartVehicleNameLooksLikePlate("2BB 8251", "2BB8251"), true);
  assert.equal(driverPartRequestInternals.driverPartVehicleDisplayName({ vehicleName: "2BB 8251" }, passengerVehicle(), "2BB8251"), "Mercedes CLS 400 d 4matic");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_vin_required");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_verified_part_required");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: false,
    manualVehicleReview: true,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_vehicle_not_verified");
}

{
  const source = driverPartRequestInternals.driverPartRequestConfirmVehicleSource("voice_manual_vehicle_review");
  assert.equal(source, "voice_vehicle_confirmed");
  assert.equal(driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source), false);
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: !source.includes("unverified_plate"),
    manualVehicleReview: driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source),
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, true);
}

{
  assert.equal(
    driverPartRequestInternals.driverPartRequestHasTrustedKsoVehicleSelection({
      source: "voice",
      vehicleId: "vehicle-passenger-1",
      vehicleSelectionSource: "backend_ui_picker"
    }),
    true
  );
  assert.equal(
    driverPartRequestInternals.driverPartRequestHasTrustedKsoVehicleSelection({
      source: "voice",
      vehicleId: "vehicle-passenger-1",
      vehicleSelectionSource: "voice-explicit"
    }),
    false
  );
}

{
  const source = driverPartRequestInternals.driverPartRequestConfirmVehicleSource("manual_unverified_plate");
  assert.equal(source, "manual_unverified_plate_vehicle_confirmed");
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: !source.includes("unverified_plate"),
    manualVehicleReview: driverPartRequestInternals.driverPartRequestSourceHasManualVehicleReview(source),
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_vehicle_not_verified");
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 01 00"
  };
  const eligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(eligibility.allowed, true);
  assert.equal(driverPartRequestInternals.driverPartRequestHasVerifiedPartForHandoff(item), true);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    partAiCandidate: true,
    probablePart: "výfuk / díl výfuku"
  };
  const eligibility = driverPartPriceSearchEligibility(item);
  assert.equal(eligibility.allowed, false);
  assert.equal(eligibility.code, "driver_part_price_verified_part_required");

  const voicePilotPriceEligibility = driverPartPriceSearchEligibility(item, { allowProbablePartSeed: true });
  assert.equal(voicePilotPriceEligibility.allowed, true);

  const handoffEligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item);
  assert.equal(handoffEligibility.allowed, false);
  assert.equal(handoffEligibility.code, "driver_part_verified_part_required");

  const voicePilotHandoffEligibility = driverPartRequestInternals.driverPartRequestPatrikHandoffEligibility(item, {
    allowProbablePartHandoff: true
  });
  assert.equal(voicePilotHandoffEligibility.allowed, true);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    partAiCandidate: true,
    probablePart: "výfuk / díl výfuku"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Nový výfuk díl výfuku Mercedes CLS", price: "5 900 Kč", seller: "Dodavatel C", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" },
        { title: "Použitý výfuk díl výfuku Mercedes CLS bazar", price: "1 200 Kč", seller: "Bazoš", url: "https://bazos.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Výfuk díl výfuku Mercedes CLS", price: "4 800 Kč", seller: "Dodavatel A", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Díl výfuku výfuk Mercedes CLS skladem", price: "5 100 Kč", seller: "Dodavatel B", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" }
      ]
    })
  }, item, { allowProbablePartSeed: true });
  assert.equal(result.status, "candidates_found");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B", "Dodavatel C"]);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", price: "12 900 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", price: "13 500 Kč", seller: "Dodavatel B", url: "https://example.test/b" }
      ]
    })
  }, item);
  assert.equal(result.status, "partial_results");
  assert.equal(result.ok, false);
  assert.equal(result.offers.length, 2);
  assert.match(result.message, /jen 2 z 3/);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "přední sklo",
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS levně bez OE", price: "7 500 Kč", seller: "Dodavatel X", url: "https://example.test/x" },
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", price: "12 900 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", price: "13 500 Kč", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo pro jiný model A 257 670 99 99", price: "8 100 Kč", seller: "Dodavatel Y", url: "https://example.test/y" }
      ]
    })
  }, item);
  assert.equal(result.status, "partial_results");
  assert.equal(result.offers.length, 2);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B"]);
  assert.equal(result.offers.some((offer) => offer.seller === "Dodavatel X"), false);
  assert.equal(result.offers.every((offer) => offer.compatibilityEvidence === "oe_number"), true);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  const result = await runDriverPartPriceSearch({}, item);
  assert.equal(result.status, "provider_not_configured");
  assert.match(result.message, /vyhledávání Autopilota není nastavené/);
  assert.deepEqual(result.offers, []);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Tlumič výfuku A 257 490 12 00", price: "4 900 Kč", seller: "Dodavatel C", url: "https://example.test/c" },
        { title: "Použitý tlumič výfuku A 257 490 12 00 bazar", price: "900 Kč", seller: "Bazoš", url: "https://bazos.test/a" },
        { title: "Tlumič výfuku A 257 490 12 00", price: "3 800 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Tlumič výfuku A 257 490 12 00 skladem", price: "4 100 Kč", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Nerelevantní koberečky", price: "100 Kč", seller: "Dodavatel X", url: "https://example.test/x" },
        { title: "Tlumič výfuku A 257 490 12 00", price: "5 200 Kč", seller: "Dodavatel D", url: "https://example.test/d" }
      ]
    })
  }, item);
  assert.equal(result.status, "candidates_found");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B", "Dodavatel C"]);
  assert.equal(result.offers.some((offer) => /bazo/i.test(offer.seller)), false);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku",
    partLookupResultJson: JSON.stringify({
      vehicleDetails: {
        brand: "Mercedes-Benz",
        model: "CLS 400 d 4MATIC",
        modelYear: "2021",
        engine: "OM656 2.9 diesel",
        body: "C257"
      }
    })
  };
  let providerPayload = null;
  const result = await runDriverPartPriceSearch({
    PARTS_PRICE_SEARCH_ENDPOINT: "https://prices.example.test/search",
    PARTS_PRICE_SEARCH_API_KEY: "test-price-key"
  }, item, {
    fetchImpl: async (url, options) => {
      providerPayload = { url, body: JSON.parse(options.body), headers: options.headers };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            offers: [
              { title: "Tlumič výfuku A 257 490 12 00", price: "3 800 Kč", seller: "Dodavatel A", url: "https://example.test/a" },
              { title: "Tlumič výfuku A 257 490 12 00", price: "4 100 Kč", seller: "Dodavatel B", url: "https://example.test/b" },
              { title: "Tlumič výfuku A 257 490 12 00", price: "4 900 Kč", seller: "Dodavatel C", url: "https://example.test/c" }
            ]
          });
        }
      };
    }
  });
  assert.equal(result.status, "candidates_found");
  assert.match(driverPartPriceSearchInternals.driverPartPriceSearchQuery(item), /CLS 400 d 4MATIC/);
  assert.equal(providerPayload.url, "https://prices.example.test/search");
  assert.equal(providerPayload.body.vehicleFitment.model, "CLS 400 d 4MATIC");
  assert.equal(providerPayload.body.vehicleFitment.modelYear, "2021");
  assert.equal(providerPayload.body.vehicleFitment.engine, "OM656 2.9 diesel");
  assert.equal(providerPayload.body.requireOeNumber, true);
  assert.match(providerPayload.headers.Authorization, /^Bearer /);
}

{
  const item = {
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    probablePart: "výfuk / díl výfuku",
    oePartNumber: "A 257 490 12 00",
    partName: "tlumič výfuku"
  };
  let requestSnapshot = null;
  const result = await runDriverPartPriceSearch({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_PRICE_SEARCH_OPENAI_MODEL: "gpt-test"
  }, item, {
    fetchImpl: async (url, options) => {
      requestSnapshot = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            output_text: JSON.stringify({
              offers: [
                { title: "Tlumič výfuku A 257 490 12 00", price: "3 700 Kč", seller: "AI Dodavatel A", url: "https://example.test/ai-a", availability: "skladem" },
                { title: "Tlumič výfuku A 257 490 12 00", price: "3 950 Kč", seller: "AI Dodavatel B", url: "https://example.test/ai-b" },
                { title: "Tlumič výfuku A 257 490 12 00", price: "4 250 Kč", seller: "AI Dodavatel C", url: "https://example.test/ai-c" }
              ]
            })
          });
        }
      };
    }
  });
  assert.equal(requestSnapshot.url, "https://api.openai.com/v1/responses");
  assert.equal(requestSnapshot.body.tools[0].type, "web_search");
  assert.equal(requestSnapshot.body.tool_choice, "required");
  assert.equal(requestSnapshot.body.model, "gpt-test");
  assert.match(requestSnapshot.options.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(requestSnapshot.body.input, /WDD2573211A123456|2BB 8251/);
  assert.equal(result.status, "candidates_found");
  assert.equal(result.provider, "openai_web_search");
  assert.equal(result.offers.length, 3);
  assert.deepEqual(result.offers.map((offer) => offer.seller), ["AI Dodavatel A", "AI Dodavatel B", "AI Dodavatel C"]);

  let officialFetchCalled = false;
  const officialRequired = await runDriverPartPriceSearch({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_PRICE_SEARCH_OPENAI_MODEL: "gpt-test"
  }, item, {
    requireOfficialProvider: true,
    fetchImpl: async () => {
      officialFetchCalled = true;
      throw new Error("OpenAI se nesmí volat pro finální Patrikovy odkazy bez oficiálního provideru.");
    }
  });
  assert.equal(officialRequired.status, "official_provider_not_configured");
  assert.equal(officialRequired.ok, false);
  assert.deepEqual(officialRequired.offers, []);
  assert.equal(officialFetchCalled, false);
}

{
  const itemWithoutOffers = {
    priceBoostStatus: "failed",
    priceBoostNote: "Cenový průzkum Autopilota selhal: The operation was aborted. Pokračuj ručně.",
    priceBoostResultJson: JSON.stringify({
      ok: false,
      offers: []
    })
  };
  const priceEligibility = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithoutOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(priceEligibility.allowed, false);
  assert.equal(priceEligibility.code, "driver_part_price_offers_required");
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithoutOffers), false);

  const itemWithTwoOffers = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo",
    priceBoostStatus: "partial_results",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" }
      ]
    })
  };
  const vinPilotWaitingLinks = driverPartRequestInternals.driverPartVinPilotState(itemWithTwoOffers, { allowed: true });
  assert.equal(vinPilotWaitingLinks.status, "waiting_price_links");
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithTwoOffers), false);

  const itemWithOffers = {
    partAiCandidate: true,
    licensePlateVerified: true,
    manualVehicleReview: false,
    oePartNumber: "A 257 670 00 01",
    partName: "přední sklo",
    priceBoostStatus: "candidates_found",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c" }
      ]
    })
  };
  const priceEligibilityWithOffers = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(priceEligibilityWithOffers.allowed, true);
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithOffers), true);
  assert.equal(driverPartRequestInternals.driverPartRequestPriceOffers(itemWithOffers).length, 3);
  const vinPilotEmailReady = driverPartRequestInternals.driverPartVinPilotState(itemWithOffers, { allowed: true });
  assert.equal(vinPilotEmailReady.status, "email_ready");

  const itemWithOpenAiOffers = {
    ...itemWithOffers,
    priceBoostResultJson: JSON.stringify({
      provider: "openai_web_search",
      offers: [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "AI Dodavatel A", url: "https://example.test/a" },
        { title: "Čelní sklo A 257 670 00 01 Mercedes CLS", seller: "AI Dodavatel B", url: "https://example.test/b" },
        { title: "Sklo A 257 670 00 01 Mercedes CLS", seller: "AI Dodavatel C", url: "https://example.test/c" }
      ]
    })
  };
  const priceEligibilityWithOpenAiOffers = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithOpenAiOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(driverPartRequestInternals.driverPartRequestPriceOffersProvider(itemWithOpenAiOffers), "openai_web_search");
  assert.equal(priceEligibilityWithOpenAiOffers.allowed, false);
  assert.equal(priceEligibilityWithOpenAiOffers.code, "driver_part_official_price_provider_required");
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithOpenAiOffers), false);

  const itemWithUnprovenOffers = {
    ...itemWithOffers,
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c" }
      ]
    })
  };
  const priceEligibilityWithUnprovenOffers = driverPartRequestInternals.driverPartRequestPatrikPriceHandoffEligibility(itemWithUnprovenOffers, {
    requirePriceOffersForHandoff: true
  });
  assert.equal(priceEligibilityWithUnprovenOffers.allowed, false);
  assert.equal(driverPartRequestInternals.driverPartRequestHasRequiredPriceOffers(itemWithUnprovenOffers), false);
  assert.equal(driverPartRequestInternals.driverPartRequestPriceOffers(itemWithUnprovenOffers).length, 0);

  const readinessWithTwoOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    ...itemWithTwoOffers,
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    vin: "WDD2573211A123456"
  }, { allowProbablePartHandoff: true });
  assert.equal(readinessWithTwoOffers.canSendEmail, false);
  assert.equal(readinessWithTwoOffers.canRunPriceBoost, false);
  assert.equal(readinessWithTwoOffers.status, "waiting");
  assert.equal(readinessWithTwoOffers.priceSearchConfigured, true);
  assert.equal(readinessWithTwoOffers.officialPriceSearchConfigured, false);
  assert.equal(readinessWithTwoOffers.priceOfferCount, 2);
  assert.equal(readinessWithTwoOffers.missingPriceOfferCount, 1);
  assert.equal(readinessWithTwoOffers.blockers.some((blocker) => blocker.code === "driver_part_official_price_provider_required"), true);
  assert.equal(readinessWithTwoOffers.blockers.some((blocker) => blocker.code === "driver_part_price_offers_required"), true);

  const readinessWithThreeOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    ...itemWithOffers,
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    vin: "WDD2573211A123456"
  }, { allowProbablePartHandoff: true });
  assert.equal(readinessWithThreeOffers.ok, true);
  assert.equal(readinessWithThreeOffers.canSendEmail, true);
  assert.equal(readinessWithThreeOffers.status, "email_ready");
  assert.equal(readinessWithThreeOffers.priceOfferCount, 3);
  assert.equal(readinessWithThreeOffers.blockers.length, 0);

  const probablePartWithThreeOffers = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    partAiCandidate: true,
    probablePart: "přední sklo",
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    priceBoostStatus: "candidates_found",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
      ]
    })
  }, { allowProbablePartHandoff: true });
  assert.equal(probablePartWithThreeOffers.canSendEmail, true);
  assert.equal(probablePartWithThreeOffers.partVerified, false);
  assert.equal(probablePartWithThreeOffers.probablePartAllowed, true);
  assert.equal(probablePartWithThreeOffers.priceOfferCount, 3);

  const probablePartWithVinVerificationRequired = await driverPartRequestInternals.driverPartRequestHandoffReadinessForItem({
    OPENAI_API_KEY: "test-openai-key",
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    partAiCandidate: true,
    probablePart: "přední sklo",
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456",
    priceBoostStatus: "candidates_found",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
      ]
    })
  }, { allowProbablePartHandoff: true, requireVinPartVerification: true });
  assert.equal(probablePartWithVinVerificationRequired.canSendEmail, false);
  assert.equal(probablePartWithVinVerificationRequired.partVerified, false);
  assert.equal(probablePartWithVinVerificationRequired.probablePartAllowed, false);
  assert.equal(probablePartWithVinVerificationRequired.priceOfferCount, 3);
  assert.equal(
    probablePartWithVinVerificationRequired.blockers.some((blocker) => blocker.code === "driver_part_verified_part_required"),
    true
  );

  const preview = await driverPartRequestInternals.driverPartRequestPriceSearchPreviewForItem({
    PARTS_PRICE_SEARCH_MOCK_JSON: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
      ]
    }),
    PARTS_ORDER_EMAIL: "patrik@example.test"
  }, adminUser, {
    partAiCandidate: true,
    probablePart: "přední sklo",
    licensePlate: "2BB 8251",
    vehicleName: "Mercedes CLS",
    licensePlateVerified: true,
    manualVehicleReview: false,
    vin: "WDD2573211A123456"
  }, { allowProbablePartSeed: true });
  assert.equal(preview.ok, true);
  assert.equal(preview.persisted, false);
  assert.equal(preview.emailSent, false);
  assert.equal(preview.offers.length, 3);
  assert.equal(preview.readiness.canSendEmail, false);
  assert.equal(preview.readiness.vinPartVerificationRequired, true);
  assert.equal(preview.readiness.emailPreview, null);
  assert.equal(
    preview.readiness.blockers.some((blocker) => blocker.code === "driver_part_verified_part_required"),
    true
  );
}

{
  const skippedEmail = await sendDriverPartOrderNotification({}, {
    id: "driver-report-no-links",
    licensePlate: "2BB 8251",
    probablePart: "přední sklo",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A" },
        { title: "Čelní sklo Mercedes CLS", seller: "Dodavatel B", url: "" }
      ]
    })
  }, {
    recipientEmail: "patrik@example.test",
    ccEmail: "oplustil@kaiserservis.cz"
  });
  assert.equal(skippedEmail.status, "skipped");
  assert.equal(skippedEmail.offerCount, 0);
  assert.equal(skippedEmail.requiredOfferCount, 3);
  assert.match(skippedEmail.errorMessage, /chybí 3 cenové nabídky s odkazy/);

  const emailReady = notificationInternals.driverPartOrderEmailReadiness({
    probablePart: "přední sklo",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
      ]
    })
  });
  assert.equal(emailReady.allowed, true);
  assert.equal(emailReady.offerCount, 3);

  const emailPreview = notificationInternals.buildDriverPartOrderEmailPreview({
    PARTS_ORDER_EMAIL: "patrik@example.test",
    PARTS_PILOT_CC_EMAIL: "oplustil@kaiserservis.cz"
  }, {
    id: "driver-report-email-preview",
    driverName: "Radim Opluštil",
    driverPhone: "604 542 004",
    vehicleName: "Mercedes CLS 400 d 4matic",
    licensePlate: "2BB 8251",
    vin: "WDD2573211A123456",
    defectDescription: "prasklé přední sklo",
    note: "Poznámka řidiče: Rána od kamínku na dálnici.",
    category: "jasný servisní úkon",
    serviceType: "výměna čelního skla",
    priority: "běžné",
    statusLabel: "Připraveno pro Patrika",
    probablePart: "přední sklo",
    priceBoostResultJson: JSON.stringify({
      offers: [
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
        { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
      ]
    })
  });
  assert.equal(emailPreview.allowed, true);
  assert.equal(emailPreview.to, "patrik@example.test");
  assert.equal(emailPreview.cc, "oplustil@kaiserservis.cz");
  assert.equal(emailPreview.offerCount, 3);
  assert.match(emailPreview.html, /3 nejlevnější nabídky/);

  const emailHtml = notificationInternals.renderDriverPartOrderEmail({
    request: {
      id: "driver-report-email-preview",
      driverName: "Radim Opluštil",
      driverPhone: "604 542 004",
      vehicleName: "Mercedes CLS 400 d 4matic",
      licensePlate: "2BB 8251",
      vin: "WDD2573211A123456",
      defectDescription: "prasklé přední sklo",
      note: "Poznámka řidiče: Rána od kamínku na dálnici.",
      category: "jasný servisní úkon",
      serviceType: "výměna čelního skla",
      priority: "běžné",
      statusLabel: "Připraveno pro Patrika",
      probablePart: "přední sklo",
      partVerificationStatus: "probable_part",
      priceBoostResultJson: JSON.stringify({
        offers: [
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
        ]
      })
    },
    ctaUrl: "https://kaiser-control-center.pages.dev/hlaseni-ridicu?request=driver-report-email-preview",
    patrikUrl: "https://kaiser-control-center.pages.dev/dovolena-nemoc/zamestnanci/patrik-istvanek"
  });
  assert.match(emailHtml, /3 nejlevnější nabídky/);
  assert.match(emailHtml, /https:\/\/example\.test\/a/);
  assert.match(emailHtml, /https:\/\/example\.test\/b/);
  assert.match(emailHtml, /https:\/\/example\.test\/c/);
  assert.match(emailHtml, /Typ požadavku:<\/strong> jasný servisní úkon/);
  assert.match(emailHtml, /Servisní typ:<\/strong> výměna čelního skla/);
  assert.match(emailHtml, /Poznámka řidiče:<\/strong> Poznámka řidiče: Rána od kamínku na dálnici\./);
  assert.match(emailHtml, /Stav hlášení:<\/strong> Připraveno pro Patrika/);
  assert.equal(emailHtml.includes("probable_part"), false);
  assert.ok(emailHtml.indexOf("3 nejlevnější nabídky") < emailHtml.indexOf("Řidič:"));

  let sendGridRequest = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sendGridRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 202,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "x-message-id" ? "sendgrid-test-message" : "";
        }
      }
    };
  };
  try {
    const db = createDriverPartTestDb();
    const sentEmail = await sendDriverPartOrderNotification({
      SMART_ODPADY_DB: db,
      EMAIL_PROVIDER: "sendgrid",
      SENDGRID_API_KEY: "test-sendgrid-key",
      EMAIL_FROM: "robot@example.test"
    }, {
      id: "driver-report-email-send",
      driverName: "Radim Opluštil",
      driverPhone: "604 542 004",
      vehicleName: "Mercedes CLS 400 d 4matic",
      licensePlate: "2BB 8251",
      vin: "WDD2573211A123456",
      defectDescription: "prasklé přední sklo",
      note: "Poznámka řidiče: Rána od kamínku na dálnici.",
      category: "jasný servisní úkon",
      serviceType: "výměna čelního skla",
      priority: "běžné",
      statusLabel: "Připraveno pro Patrika",
      probablePart: "přední sklo",
      priceBoostResultJson: JSON.stringify({
        offers: [
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a", compatibilityEvidence: "provider_fitment" },
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b", compatibilityEvidence: "provider_fitment" },
          { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c", compatibilityEvidence: "provider_fitment" }
        ]
      })
    }, {
      recipientEmail: "patrik@example.test",
      ccEmail: "oplustil@kaiserservis.cz"
    });

    assert.equal(sentEmail.status, "sent");
    assert.equal(sendGridRequest.url, "https://api.sendgrid.com/v3/mail/send");
    assert.equal(sendGridRequest.body.personalizations[0].to[0].email, "patrik@example.test");
    assert.equal(sendGridRequest.body.personalizations[0].cc[0].email, "oplustil@kaiserservis.cz");
    assert.deepEqual(sendGridRequest.body.from, { email: "sarlota@kaiserservis.cz", name: "Šarlota Kaiser" });
    assert.deepEqual(sendGridRequest.body.reply_to, { email: "sarlota@kaiserservis.cz", name: "Šarlota Kaiser" });
    assert.equal(sendGridRequest.body.headers["X-KSO-Module-Key"], "driver-reports");
    assert.equal(db.state.communicationMessages.size, 1);
    assert.equal(db.state.communicationEvents.some((entry) => entry.event_type === "email_outbound_sent"), true);
    assert.match(sendGridRequest.body.subject, /Náhradní díl k ověření: 2BB 8251/);
    const sentHtml = sendGridRequest.body.content[0].value;
    assert.match(sentHtml, /3 nejlevnější nabídky/);
    assert.match(sentHtml, /https:\/\/example\.test\/a/);
    assert.match(sentHtml, /https:\/\/example\.test\/b/);
    assert.match(sentHtml, /https:\/\/example\.test\/c/);
    assert.match(sentHtml, /Typ požadavku:<\/strong> jasný servisní úkon/);
    assert.match(sentHtml, /Stav hlášení:<\/strong> Připraveno pro Patrika/);
    assert.doesNotMatch(sentHtml, /probable_part|waiting_verified_part/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    notificationInternals.emailRecipients("oplustil@kaiserservis.cz; invalid; patrik@example.test,oplustil@kaiserservis.cz"),
    ["oplustil@kaiserservis.cz", "patrik@example.test"]
  );
  assert.equal(
    await notificationInternals.sendGridFailureMessage({
      status: 403,
      async json() {
        return { errors: [{ message: "The from address does not match a verified Sender Identity." }] };
      }
    }, "sarlota@kaiserservis.cz"),
    "SendGrid odmítl odesílatele sarlota@kaiserservis.cz. Ověřte tuto adresu nebo doménu kaiserservis.cz v SendGrid Sender Authentication."
  );
  assert.deepEqual(
    notificationInternals.parseDriverPartOffers(JSON.stringify({
      offers: [
        { title: "Výfuk", price: "1 990 Kč", seller: "Dodavatel", url: "https://example.test", availability: "skladem" },
        { title: "Druhá nabídka", priceText: "2 200 Kč" },
        { title: "Třetí nabídka", priceText: "2 500 Kč" },
        { title: "Čtvrtá nabídka", priceText: "3 000 Kč" }
      ]
    })).length,
    3
  );
  assert.equal(
    driverPartRequestInternals.pilotCcStatus({ PARTS_PILOT_CC_EMAIL: "oplustil@kaiserservis.cz" }, { patrikEmailStatus: "sent" }),
    "sent_or_included_by_backend"
  );
}

{
  const verifyDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-request-mercedes-verify"
  })]);
  const mercedesRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    mercedesRequests.push({ url, options, body });
    return {
      ok: true,
      status: 200,
      async text() {
        if (String(url).includes("/vehicles/by-vin")) {
          return JSON.stringify({
            vehicle: {
              brand: "Mercedes-Benz",
              model: "CLS 400 d 4MATIC",
              modelYear: "2021",
              engine: "OM656 2.9 diesel",
              bodyType: "C257"
            }
          });
        }
        return JSON.stringify({
          verified: true,
          parts: [{
            partNumber: "A 257 670 00 01",
            name: "Přední sklo Mercedes CLS"
          }]
        });
      }
    };
  };
  let verified = null;
  try {
    verified = await verifyMercedesDriverPartRequest({
      ...driverPartTestEnv(verifyDb, []),
      MERCEDES_PARTS_PROVIDER_ENABLED: "true",
      MERCEDES_PARTS_API_BASE_URL: "https://mercedes.example.test"
    }, adminUser, "driver-part-request-mercedes-verify");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = verifyDb.state.requests.get("driver-part-request-mercedes-verify");
  const vehicleRequest = mercedesRequests.find((request) => String(request.url).includes("/vehicles/by-vin"));
  const partsRequest = mercedesRequests.find((request) => String(request.url).includes("/parts/search-by-vin"));
  assert.equal(vehicleRequest.url, "https://mercedes.example.test/vehicles/by-vin");
  assert.equal(vehicleRequest.body.vin, "WDD2573211A123456");
  assert.equal(partsRequest.url, "https://mercedes.example.test/parts/search-by-vin");
  assert.equal(partsRequest.body.vin, "WDD2573211A123456");
  assert.match(partsRequest.body.query, /přední sklo/);
  assert.equal(row.oe_part_number, "A 257 670 00 01");
  assert.equal(row.part_name, "Přední sklo Mercedes CLS");
  assert.equal(row.part_verification_status, "verified_daimler");
  assert.equal(row.part_verification_source, "daimler");
  assert.equal(row.parts_provider_status, "verified");
  assert.equal(row.price_boost_status, "waiting_verified_part");
  const lookupResult = JSON.parse(row.part_lookup_result_json);
  assert.equal(lookupResult.vehicleDetails.model, "CLS 400 d 4MATIC");
  assert.equal(lookupResult.vehicleDetails.modelYear, "2021");
  assert.equal(lookupResult.vehicleDetails.engine, "OM656 2.9 diesel");
  assert.equal(verified.oePartNumber, "A 257 670 00 01");
  assert.equal(verified.partName, "Přední sklo Mercedes CLS");
  assert.equal(verifyDb.state.events.some((event) => event.action === "verify_mercedes_part"), true);
}

{
  const missingProviderDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-request-missing-provider"
  })]);
  let externalCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    externalCalled = true;
    throw new Error("Bez ověřeného OE se nesmí volat externí cenový ani e-mailový provider.");
  };
  try {
    await assert.rejects(
      () => handoffDriverPartRequest(
        {
          ...driverPartTestEnv(missingProviderDb, [
            { title: "Přední sklo Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
            { title: "Přední sklo Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" },
            { title: "Přední sklo Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c" }
          ]),
          MERCEDES_PARTS_PROVIDER_ENABLED: "",
          MERCEDES_PARTS_API_BASE_URL: ""
        },
        adminUser,
        "driver-part-request-missing-provider",
        {
          allowCreatorHandoff: true,
          allowProbablePartHandoff: true,
          runPriceBoost: true,
          requireVinPartVerification: true,
          requirePriceOffersForHandoff: true
        }
      ),
      (error) => {
        assert.equal(error.code, "driver_part_verified_part_required");
        assert.match(error.message, /ověř díl nebo OE/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = missingProviderDb.state.requests.get("driver-part-request-missing-provider");
  assert.equal(externalCalled, false);
  assert.equal(row.status, "part_identified");
  assert.equal(row.patrik_email_status, "not_sent");
  assert.equal(row.oe_part_number, "");
  assert.equal(row.part_verification_status, "waiting_manual_verification");
  assert.equal(row.parts_provider_status, "not_configured");
  assert.equal(row.price_boost_status, "not_requested");
  assert.equal(missingProviderDb.state.events.some((event) => event.action === "handoff_to_ordering"), false);
}

{
  const backgroundMissingVinDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-background-missing-vin",
    vin: "",
    status: "part_identified"
  })]);
  let externalCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    externalCalled = true;
    throw new Error("Bez VIN se nesmí volat externí provider.");
  };
  let processed = null;
  try {
    processed = await processDriverPartRequestAfterVoiceCreate(
      driverPartTestEnv(backgroundMissingVinDb, []),
      adminUser,
      "driver-part-background-missing-vin"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = backgroundMissingVinDb.state.requests.get("driver-part-background-missing-vin");
  assert.equal(processed.status, "waiting_vehicle_vin");
  assert.equal(row.status, "waiting_vehicle_vin");
  assert.equal(externalCalled, false);
  assert.equal(backgroundMissingVinDb.state.events.some((event) => event.action === "background_parts_started"), true);
  assert.equal(backgroundMissingVinDb.state.events.some((event) => event.action === "background_blocked"), true);
  assert.equal(backgroundMissingVinDb.state.events.some((event) => /VIN/.test(event.note)), true);
}

{
  const backgroundTwoOfferDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-background-two-offers"
  })]);
  let sendGridCalled = false;
  let mercedesCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("mercedes.example.test")) {
      mercedesCalled = true;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            verified: true,
            parts: [{
              partNumber: "A 257 670 00 01",
              name: "Přední sklo Mercedes CLS"
            }]
          });
        }
      };
    }
    sendGridCalled = true;
    throw new Error("SendGrid nemá být volaný bez 3 odkazů.");
  };
  let processed = null;
  try {
    processed = await processDriverPartRequestAfterVoiceCreate(
      driverPartTestEnv(backgroundTwoOfferDb, [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" }
      ]),
      adminUser,
      "driver-part-background-two-offers"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = backgroundTwoOfferDb.state.requests.get("driver-part-background-two-offers");
  assert.equal(processed.status, "waiting_decision");
  assert.equal(row.status, "waiting_decision");
  assert.equal(mercedesCalled, true);
  assert.equal(sendGridCalled, false);
  assert.equal(row.oe_part_number, "A 257 670 00 01");
  assert.equal(row.price_boost_status, "partial_results");
  assert.equal(JSON.parse(row.price_boost_result_json).offers.length, 2);
  assert.equal(backgroundTwoOfferDb.state.events.some((event) => event.action === "background_parts_started"), true);
  assert.equal(backgroundTwoOfferDb.state.events.some((event) => event.action === "background_prices_started"), true);
  assert.equal(backgroundTwoOfferDb.state.events.some((event) => event.action === "background_blocked"), true);
}

{
  const twoOfferDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-request-two-offers"
  })]);
  let sendGridCalled = false;
  let mercedesCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("mercedes.example.test")) {
      mercedesCalled = true;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            verified: true,
            parts: [{
              partNumber: "A 257 670 00 01",
              name: "Přední sklo Mercedes CLS"
            }]
          });
        }
      };
    }
    sendGridCalled = true;
    throw new Error("SendGrid nemá být volaný bez 3 odkazů.");
  };
  try {
    await assert.rejects(
      () => handoffDriverPartRequest(
        driverPartTestEnv(twoOfferDb, [
          { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
          { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" }
        ]),
        adminUser,
        "driver-part-request-two-offers",
        {
          allowCreatorHandoff: true,
          allowProbablePartHandoff: true,
          runPriceBoost: true,
          requireVinPartVerification: true,
          requirePriceOffersForHandoff: true
        }
      ),
      (error) => {
        assert.equal(error.code, "driver_part_price_offers_required");
        assert.match(error.message, /3 bezpečně relevantní nabídky/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = twoOfferDb.state.requests.get("driver-part-request-two-offers");
  assert.equal(mercedesCalled, true);
  assert.equal(sendGridCalled, false);
  assert.equal(row.status, "part_identified");
  assert.equal(row.patrik_email_status, "not_sent");
  assert.equal(row.oe_part_number, "A 257 670 00 01");
  assert.equal(row.part_verification_status, "verified_daimler");
  assert.equal(row.price_boost_status, "partial_results");
  assert.equal(JSON.parse(row.price_boost_result_json).offers.length, 2);
  assert.equal(twoOfferDb.state.events.some((event) => event.action === "handoff_to_ordering"), false);
}

{
  const threeOfferDb = createDriverPartTestDb([driverPartRequestRow({
    id: "driver-part-request-three-offers"
  })]);
  let sendGridRequest = null;
  let mercedesCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("mercedes.example.test")) {
      mercedesCalled = true;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            verified: true,
            parts: [{
              partNumber: "A 257 670 00 01",
              name: "Přední sklo Mercedes CLS"
            }]
          });
        }
      };
    }
    sendGridRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 202,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "x-message-id" ? "sendgrid-handoff-test" : "";
        }
      }
    };
  };
  let handedOff = null;
  try {
    handedOff = await handoffDriverPartRequest(
      driverPartTestEnv(threeOfferDb, [
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel C", price: "12 200 Kč", url: "https://example.test/c" },
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel A", price: "10 900 Kč", url: "https://example.test/a" },
        { title: "Použité přední sklo A 257 670 00 01 Mercedes CLS bazar", seller: "Bazoš", price: "3 000 Kč", url: "https://bazos.test/a" },
        { title: "Přední sklo A 257 670 00 01 Mercedes CLS", seller: "Dodavatel B", price: "11 500 Kč", url: "https://example.test/b" }
      ]),
      adminUser,
      "driver-part-request-three-offers",
      {
        allowCreatorHandoff: true,
        allowProbablePartHandoff: true,
        runPriceBoost: true,
        requireVinPartVerification: true,
        requirePriceOffersForHandoff: true
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const row = threeOfferDb.state.requests.get("driver-part-request-three-offers");
  const savedOffers = JSON.parse(row.price_boost_result_json).offers;
  assert.equal(handedOff.status, "handed_to_ordering");
  assert.equal(handedOff.patrikEmailStatus, "sent");
  assert.equal(mercedesCalled, true);
  assert.equal(row.status, "handed_to_ordering");
  assert.equal(row.patrik_email_status, "sent");
  assert.equal(row.oe_part_number, "A 257 670 00 01");
  assert.equal(row.part_verification_status, "verified_daimler");
  assert.equal(row.price_boost_status, "candidates_found");
  assert.equal(savedOffers.length, 3);
  assert.deepEqual(savedOffers.map((offer) => offer.seller), ["Dodavatel A", "Dodavatel B", "Dodavatel C"]);
  assert.equal(savedOffers.some((offer) => /bazo/i.test(offer.seller)), false);
  assert.equal(sendGridRequest.url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(sendGridRequest.body.personalizations[0].to[0].email, "patrik@example.test");
  assert.equal(sendGridRequest.body.personalizations[0].cc[0].email, "oplustil@kaiserservis.cz");
  assert.deepEqual(sendGridRequest.body.from, { email: "sarlota@kaiserservis.cz", name: "Šarlota Kaiser" });
  assert.deepEqual(sendGridRequest.body.reply_to, { email: "sarlota@kaiserservis.cz", name: "Šarlota Kaiser" });
  assert.equal(sendGridRequest.body.headers["X-KSO-Module-Key"], "driver-reports");
  const sentHtml = sendGridRequest.body.content[0].value;
  assert.match(sentHtml, /3 nejlevnější nabídky/);
  assert.match(sentHtml, /https:\/\/example\.test\/a/);
  assert.match(sentHtml, /https:\/\/example\.test\/b/);
  assert.match(sentHtml, /https:\/\/example\.test\/c/);
  assert.doesNotMatch(sentHtml, /bazos|probable_part|waiting_verified_part/i);
  assert.equal(threeOfferDb.state.events.some((event) => event.action === "handoff_to_ordering"), true);
  assert.equal(threeOfferDb.state.notificationLogs.some((entry) => entry.status === "sent"), true);
  assert.equal(threeOfferDb.state.communicationMessages.size, 1);
  assert.equal(threeOfferDb.state.communicationEvents.some((entry) => entry.event_type === "email_outbound_sent"), true);
}

console.log("driver parts VIN pilot tests passed");
