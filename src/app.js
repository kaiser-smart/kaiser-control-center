import { moduleDashboards, modules } from "./data/modules.js";
import { AiAssistantChat } from "./components/AiAssistantChat.js";
import { AiAssistantLauncher } from "./components/AiAssistantLauncher.js";
import { AiAssistantPromoModal } from "./components/AiAssistantPromoModal.js";
import { AiConfirmationModal } from "./components/AiConfirmationModal.js";
import { AiWelcomeModal } from "./components/AiWelcomeModal.js";
import { ElevenLabsAssistantProvider } from "./ElevenLabsAssistantProvider.js";
import { VersionBackupInfo } from "./components/VersionBackupInfo.js";
import { VersionNewsInfo } from "./components/VersionNewsInfo.js";
import { ModuleFeedbackBox } from "./components/ModuleFeedbackBox.js";
import { AppearanceSettingsBox } from "./components/AppearanceSettingsBox.js";
import { QuickAbsenceIcon, ReportsIcon } from "./components/icons/index.js";
import { useSpeechRecognition } from "./useSpeechRecognition.js";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard.js";
import { AI_ASSISTANTS, DEFAULT_AI_ASSISTANT_ID, assistantById } from "./data/aiAssistants.js";
import { normalizeAiRoute } from "./elevenLabsClientTools.js";
import {
  ABSENCE_REPORT_DAY,
  ABSENCE_REPORT_EMAIL,
  ABSENCE_REPORT_TIME,
  ABSENCE_STATUS_TONES,
  ABSENCE_TABS,
  ABSENCE_TYPES,
  ABSENCE_TYPE_TONES,
  ABSENCE_API_STATUS_LABELS,
  ABSENCE_API_TYPE_LABELS,
  absenceBalanceForEmployee,
  absenceEmployeeOptions,
  absenceRequestHours,
  absenceRequestIsHourlyDoctor,
  absenceRequestsToCsv,
  absenceSummary,
  absenceStatusLabel,
  absenceTypeLabel,
  approvalAbsenceRequests,
  canApproveAbsence,
  canCancelAbsence,
  canSeeAllAbsences,
  canSubmitAbsenceForOthers,
  countAbsenceHours,
  countAbsenceDays,
  currentMonthKey,
  employeeIdForUser,
  filterAbsenceRequests,
  generateMonthlyAbsenceReport,
  initialStatusForAbsenceType,
  loadAbsenceState,
  monthlyAbsenceDoctorHours,
  monthlyAbsenceReportToCsv,
  monthlyAbsenceTotals,
  normalizeAbsenceSettings,
  ownAbsenceRequests,
  requestOverlapsDate,
  requestOverlapsMonth,
  saveAbsenceState,
  sameAbsenceSettings,
  toIsoDate,
  visibleAbsenceRequests
} from "./data/absence.js";
import {
  MEDICAL_EXAM_CATEGORY_OPTIONS,
  calculateMedicalExamState,
  formatMedicalExamDate,
  medicalExamDateValue,
  normalizeMedicalExamCategory
} from "./data/medicalExamRules.js";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  canManageFeedback,
  feedbackStatusApiValue,
  feedbackSummary,
  filterModuleFeedback,
  moduleFeedbackToCsv,
  normalizeFeedback,
  visibleFeedbackForUser
} from "./data/moduleFeedback.js";
import {
  ACTIONS,
  ROLE_DEFINITIONS,
  canViewModule,
  filterModulesByUser,
  hasPermission,
  isFullAccessRole,
  isUserActive,
  normalizeRole,
  roleLabel
} from "./permissions.js";
import {
  loadAccessState,
  makePermissionsFromMatrix,
  mergeAccessUsers,
  permissionMap,
  rolePermissionsFor,
  saveAccessState,
  withAccessContext
} from "./data/accessControl.js";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  sameThemeSettings,
  themeSettingsToCssProperties
} from "./data/themeSettings.js";
import {
  FLEET_API_ENDPOINTS,
  FLEET_API_MISSING_MESSAGE,
  FLEET_API_WAITING_LABEL,
  FLEET_DASHBOARD_METRICS,
  FLEET_DEFECT_FIELDS,
  FLEET_DOCUMENT_FIELDS,
  FLEET_LIST_COLUMNS,
  FLEET_REQUIRED_SECTIONS,
  FLEET_SERVICE_FIELDS,
  FLEET_STATUS_OPTIONS,
  FLEET_TERM_DEFINITIONS,
  FLEET_VEHICLE_FIELDS,
  FLEET_VEHICLE_TYPES,
  fleetStatusLabel,
  fleetStatusTone
} from "./data/fleet.js";
import {
  DEMO_VEHICLE_TRACKING_ALERT,
  DEMO_VEHICLE_TRACKING_ALERT_END_MS,
  DEMO_VEHICLE_TRACKING_ALERT_START_MS,
  DEMO_VEHICLE_TRACKING_API_DETAIL,
  DEMO_VEHICLE_TRACKING_API_NOTICE,
  DEMO_VEHICLE_TRACKING_BOUNDS,
  DEMO_VEHICLE_TRACKING_DEVIATION_START_MS,
  DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_FALLBACK,
  DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_WAITING,
  DEMO_VEHICLE_TRACKING_LOOP_MS,
  DEMO_VEHICLE_TRACKING_MAP_CENTER,
  DEMO_VEHICLE_TRACKING_NOTICE,
  DEMO_VEHICLE_TRACKING_PHASES,
  DEMO_VEHICLE_TRACKING_PLACES,
  DEMO_VEHICLE_TRACKING_STATUS_FILTERS,
  DEMO_VEHICLE_TRACKING_STATUS_META,
  DEMO_VEHICLE_TRACKING_VEHICLES
} from "./data/demoVehicleTracking.js";
import { runtimeConfig } from "./data/runtimeConfig.js";
import {
  VEHICLE_STOP_FIELDS,
  VEHICLE_ICON_BY_TYPE,
  VEHICLE_TRACKING_API_ENDPOINTS,
  VEHICLE_TRACKING_API_ERROR,
  VEHICLE_TRACKING_SOURCE_MODES,
  VEHICLE_TRACKING_EMPTY,
  VEHICLE_TRACKING_FILTERS,
  VEHICLE_TRACKING_GPS_WAITING,
  VEHICLE_TRACKING_ICON_FOLDER,
  VEHICLE_TRACKING_ICON_FORMATS,
  VEHICLE_TRACKING_ICON_REQUIREMENTS,
  VEHICLE_TRACKING_ICON_TYPES,
  VEHICLE_TRACKING_ICON_WAITING,
  VEHICLE_TRACKING_LIST_COLUMNS,
  VEHICLE_TRACKING_LOADING,
  VEHICLE_TRACKING_NO_SIGNAL,
  VEHICLE_TRACKING_ROUTE,
  VEHICLE_TRACKING_STATUS_FIELDS,
  VEHICLE_TRACKING_STATUS_OPTIONS,
  VEHICLE_TRACKING_TABLET_ROLE,
  VEHICLE_TRACKING_TCAR_API_DOCUMENTATION_MISSING,
  VEHICLE_TRACKING_TCAR_LAST_KNOWN,
  VEHICLE_TRACKING_TCAR_LINK_FIELDS,
  VEHICLE_TRACKING_TCAR_PAIRING_COLUMNS,
  VEHICLE_TRACKING_TCAR_SYNC_LOG_FIELDS,
  VEHICLE_TRACKING_TCAR_UNAVAILABLE,
  VEHICLE_TRACKING_TCAR_WAITING,
  VEHICLE_TRACKING_WIM_ALERT_FIELDS,
  VEHICLE_TRACKING_WIM_ALERT_PILOT,
  VEHICLE_TRACKING_WIM_PLACEHOLDER_ICON,
  VEHICLE_TRACKING_WIM_SITE_FIELDS,
  VEHICLE_TRACKING_WIM_WAITING,
  VEHICLE_TRIP_FIELDS,
  VEHICLE_TRIP_POINT_FIELDS,
  vehicleTrackingIconForType,
  vehicleTrackingStatusLabel,
  vehicleTrackingStatusTone
} from "./data/vehicleTracking.js";
import {
  DATA_BOX_EMPTY_MESSAGE_COLUMNS,
  DATA_BOX_INTEGRATION_POINTS,
  DATA_BOX_MODULE_KEY,
  DATA_BOX_PHASES,
  DATA_BOX_PLANNED_ENDPOINTS,
  DATA_BOX_ROUTE,
  DATA_BOX_STATUS_CARDS,
  DATA_BOX_TABS
} from "./data/dataBox.js";

const app = document.querySelector("#app");
const orderedModules = [...modules].sort((a, b) => a.order - b.order);
const feedbackMenuItem = {
  id: "feedback",
  title: "Připomínky",
  description: "Přehled připomínek k modulům, stavů, priorit a interních poznámek.",
  route: "/pripominky",
  icon: ReportsIcon,
  status: "správa",
  active: true,
  disabled: false,
  order: 15
};
const permissionModules = [...orderedModules, feedbackMenuItem];
const primaryRoutes = new Map(orderedModules.map((moduleItem) => [moduleItem.route, moduleItem]));
const dashboardRoutes = new Map(moduleDashboards.map((moduleItem) => [moduleItem.route, moduleItem]));
const TYRES_MODULE_URL = "https://kaiser-smart.github.io/kaiser-pneu-evidence/";
const APP_NAME = "Smart odpady";
const HOME_SUBTITLE = "Provozní systém pro odpady, vozidla a trasy";
const LOGIN_SUBTITLE = "Přihlášení do interního provozního systému";
const FEEDBACK_ROUTE = "/pripominky";
const FLEET_ROUTE = "/vozovy-park";
const FLEET_ACTION_WAITING_MESSAGES = {
  addVehicle: "Čeká na API pro přidání vozidla.",
  detail: "Čeká na API pro detail vozidla.",
  defect: "Čeká na API pro evidenci závad.",
  service: "Čeká na API pro servisní historii.",
  documents: "Čeká na API pro dokumenty vozidla.",
  export: "Čeká na API pro export vozového parku."
};
const FLEET_TAB_WAITING_MESSAGES = {
  detail: FLEET_ACTION_WAITING_MESSAGES.detail,
  terms: "Čeká na API pro termíny vozidel.",
  defects: FLEET_ACTION_WAITING_MESSAGES.defect,
  service: FLEET_ACTION_WAITING_MESSAGES.service,
  documents: FLEET_ACTION_WAITING_MESSAGES.documents,
  settings: "Čeká na API pro nastavení vozového parku."
};
const VEHICLE_TRACKING_BASE_ROUTE = VEHICLE_TRACKING_ROUTE;
const ABSENCE_ROUTE = "/dovolena-nemoc";
const EMPLOYEE_CARD_ROUTE_PREFIX = "/dovolena-nemoc/zamestnanci";
const ABSENCE_QUICK_ROUTE = "/dovolena-nemoc/rychle-zadani";
const QUICK_ABSENCE_ENTRY_HASH = "#co-potrebujete";
const QUICK_ABSENCE_ENTRY_ROUTE = `${ABSENCE_QUICK_ROUTE}${QUICK_ABSENCE_ENTRY_HASH}`;
const ABSENCE_TAB_ROUTES = {
  dashboard: ABSENCE_ROUTE,
  quick: ABSENCE_QUICK_ROUTE,
  my: "/dovolena-nemoc/moje-zadosti",
  new: "/dovolena-nemoc/nova-zadost",
  approval: "/dovolena-nemoc/ke-schvaleni",
  calendar: "/dovolena-nemoc/kalendar",
  "employee-card": EMPLOYEE_CARD_ROUTE_PREFIX,
  reports: "/dovolena-nemoc/reporty",
  "rules-automation": "/dovolena-nemoc/pravidla-automatizace",
  settings: "/dovolena-nemoc/nastaveni"
};
const quickAbsenceMenuItem = {
  id: "quick-absence",
  title: "Rychlé zadání",
  description: "Dovolená, nemoc nebo lékař na pár kliknutí přímo z mobilu.",
  route: QUICK_ABSENCE_ENTRY_ROUTE,
  icon: QuickAbsenceIcon,
  status: "ROZPRACOVÁN",
  active: true,
  disabled: false,
  order: 0
};
const NOTIFICATION_CHANNEL_LABELS = {
  email: "E-mail",
  sms: "SMS"
};
const NOTIFICATION_STATUS_LABELS = {
  sent: "Odešlo",
  not_sent: "Neodešlo",
  pending: "Čeká",
  failed: "Selhalo"
};
const NOTIFICATION_TYPE_LABELS = {
  absence_approval_request: "Nová žádost ke schválení",
  absence_approval_reminder: "Připomínka schválení",
  absence_approved_sms: "Schváleno SMS",
  absence_rejected_sms: "Zamítnuto SMS",
  absence_sickness_recorded_email: "Nemoc evidována",
  module_feedback_resolved_email: "Připomínka vyřešena",
  version_news_email: "Co je nového",
  employee_medical_exam_reminder: "Lékařská prohlídka"
};
const NOTIFICATION_CHANNEL_OPTIONS = [
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" }
];
const NOTIFICATION_STATUS_OPTIONS = [
  { value: "sent", label: "Odesláno" },
  { value: "not_sent", label: "Neodesláno" },
  { value: "pending", label: "Čeká" },
  { value: "failed", label: "Selhalo" }
];
const NOTIFICATION_TYPE_OPTIONS = Object.entries(NOTIFICATION_TYPE_LABELS)
  .map(([value, label]) => ({ value, label }));
const AI_INITIAL_MESSAGE =
  `${assistantById(DEFAULT_AI_ASSISTANT_ID).intro} Zeptej se mě na dovolenou, nemoc, pneumatiky, připomínky, uživatele nebo nastavení.`;
const AI_STATUS_READY = "Připraven";
const AI_STATUS_DONE = "Hotovo";
const AI_STATUS_DEMO = "Přehrávám ukázku…";
const AI_STATUS_ELEVENLABS_WAITING = "Hlasové spojení Šarloty se připraví po klepnutí.";
const AI_TEXT_READY_LABEL = "Textový režim Šarloty je připravený.";
const AI_TEXT_SENDING_LABEL = "Odesílám dotaz Šarlotě…";
const AI_TEXT_READY_RESULT_LABEL = "Textový režim Šarloty funguje.";
const AI_TEXT_ERROR_LABEL = "Textový režim Šarloty se nepodařilo ověřit.";
const AI_VOICE_IDLE_LABEL = "Klepni a začni";
const AI_VOICE_CONNECTING_LABEL = "Připojuji Šarlotu…";
const AI_VOICE_READY_LABEL = "Šarlota je připravená";
const AI_VOICE_LISTENING_LABEL = "Poslouchám…";
const AI_VOICE_USER_SPEAKING_LABEL = "Mluvte teď";
const AI_VOICE_PROCESSING_LABEL = "Zpracovávám…";
const AI_VOICE_SPEAKING_LABEL = "Šarlota odpovídá…";
const AI_VOICE_MUTED_LABEL = "Mikrofon je vypnutý";
const AI_VOICE_MICROPHONE_DENIED_LABEL = "Mikrofon není povolený";
const AI_VOICE_DISCONNECTED_LABEL = "Spojení se přerušilo. Klepni pro obnovení.";
const AI_VOICE_ERROR_LABEL = "Nepodařilo se připojit mikrofon.";
const AI_VOICE_WEAK_INPUT_NOTICE = "Mluvte blíže k telefonu nebo zvyšte hlasitost zařízení.";
const AI_VOICE_WAKE_LOCK_ACTIVE_LABEL = "Displej zůstane během hovoru zapnutý.";
const AI_VOICE_WAKE_LOCK_UNAVAILABLE_LABEL = "Telefon může během hovoru usnout. Zkontrolujte nastavení displeje.";
const AI_VOICE_WEAK_INPUT_LEVEL = 0.018;
const AI_VOICE_WEAK_INPUT_MIN_READINGS = 6;
const AI_VOICE_UI_STATES = [
  "idle",
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking",
  "muted",
  "microphoneDenied",
  "disconnected",
  "error"
];
const AI_VOICE_ACTIVE_STATES = [
  "connecting",
  "ready",
  "listening",
  "userSpeaking",
  "processing",
  "assistantSpeaking"
];
const AI_VOICE_WAKE_LOCK_STATES = [...AI_VOICE_ACTIVE_STATES];
const AI_VOICE_DOCK_STATES = [
  ...AI_VOICE_ACTIVE_STATES,
  "microphoneDenied",
  "disconnected",
  "error"
];
const AI_VOICE_DEMO_SCRIPT = [
  {
    speaker: "user",
    label: "Uživatel Kaiser smart",
    text: "Ahoj Kaiser smart, potřebuju zadat dovolenou na pátek."
  },
  {
    speaker: "ai",
    label: "AI Smart pomocník",
    text: "Jasně. Na hlavní stránce klepni na Rychlé zadání, vyber Chci dovolenou a zkontroluj datum."
  },
  {
    speaker: "user",
    label: "Uživatel Kaiser smart",
    text: "A když budu nemocný?"
  },
  {
    speaker: "ai",
    label: "AI Smart pomocník",
    text: "Nemoc zadáš stejnou cestou. Systém ji zaeviduje a kancelář ji uvidí v modulu Dovolená a Nemoc."
  },
  {
    speaker: "user",
    label: "Uživatel Kaiser smart",
    text: "Kde se potom žádost schvaluje?"
  },
  {
    speaker: "ai",
    label: "AI Smart pomocník",
    text: "Nadřízený ji najde v části Ke schválení. Po schválení nebo zamítnutí přijde zaměstnanci SMS."
  }
];
const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "active", label: "Aktivní" },
  { value: "inactive", label: "Neaktivní" }
];
const EMPLOYMENT_TYPE_OPTIONS = [
  "Hlavní pracovní poměr",
  "Dohoda",
  "Externí spolupráce",
  "Jiné"
];
const EMPLOYMENT_TYPE_SELECT_OPTIONS = [
  { value: "", label: "Neuvedeno" },
  ...EMPLOYMENT_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))
];
const EMPLOYEE_ABSENCE_STATUS_OPTIONS = ["v práci", "nemoc", "dovolená", "OČR", "lékař", "náhradní volno"];
const DOCUMENT_TYPE_LABELS = ["Pracovní smlouva", "Dodatek", "Školení", "Lékařská prohlídka", "Ostatní"];
const MEDICAL_EXAM_REQUEST_TYPE_OPTIONS = [
  { value: "entry", label: "Vstupní prohlídka" },
  { value: "periodic", label: "Periodická preventivní prohlídka" },
  { value: "extraordinary", label: "Mimořádná zdravotní prohlídka" }
];
const MEDICAL_EXAM_REQUEST_CATEGORY_OPTIONS = [
  { value: "", label: "Zkontrolovat před exportem" },
  { value: "administration_i", label: "Administrativa / kategorie I." },
  { value: "driver_ii", label: "Řidič / kategorie II." },
  { value: "technician_ii", label: "Technik / kategorie II." },
  { value: "wastewater_operator_ii", label: "Obsluha ČOV / kategorie II." }
];
const basePath = new URL(document.querySelector("base")?.href || "/", window.location.origin)
  .pathname
  .replace(/\/$/, "");
const QUICK_ABSENCE_TYPES = [
  { id: "vacation", label: "Chci dovolenou", shortLabel: "Dovolená", marker: "D", status: "pending_approval" },
  { id: "sick", label: "Jsem nemocný", shortLabel: "Nemoc", marker: "N", status: "recorded" },
  { id: "doctor", label: "Jdu k lékaři", shortLabel: "Lékař", marker: "L", status: "pending_approval" },
  { id: "care", label: "OČR", shortLabel: "OČR", marker: "O", status: "pending_approval" },
  { id: "compensatory_leave", label: "Náhradní volno", shortLabel: "Náhradní volno", marker: "NV", status: "pending_approval" }
];
const QUICK_ABSENCE_STATUSES = {
  pending: "Čeká na schválení",
  pending_approval: "Čeká na schválení",
  recorded: "Evidováno"
};

let authState = {
  status: "loading",
  user: null,
  pendingIdentifier: "",
  codeSent: false,
  message: "",
  error: "",
  mockCode: false
};

const adminUsersState = {
  loaded: false,
  loading: false,
  users: [],
  error: ""
};

const accessManagerState = {
  savingUserId: "",
  pendingManagerId: ""
};

const accessUsersSearchState = {
  query: ""
};

let accessState = loadAccessState();

const themeState = {
  loaded: false,
  loading: false,
  saving: false,
  settings: normalizeThemeSettings(DEFAULT_THEME_SETTINGS),
  draft: normalizeThemeSettings(DEFAULT_THEME_SETTINGS),
  preview: null,
  message: "",
  error: ""
};

const feedbackFormState = {};
const feedbackFilters = {
  moduleId: "",
  status: "",
  priority: "",
  author: "",
  search: ""
};
const feedbackState = {
  items: [],
  loaded: false,
  loading: false,
  error: "",
  apiStatus: "waiting",
  savingId: "",
  cardMessages: {}
};
const feedbackCreateState = {
  open: false,
  saving: false,
  message: "",
  error: "",
  draft: feedbackCreateDefaultDraft()
};
function notificationDefaultDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function notificationDefaultDateTo() {
  return new Date().toISOString().slice(0, 10);
}

const notificationCenterState = {
  items: [],
  summary: {
    emailSent: 0,
    emailNotSent: 0,
    smsSent: 0,
    smsNotSent: 0,
    pending: 0,
    failed: 0
  },
  filters: {
    dateFrom: notificationDefaultDateFrom(),
    dateTo: notificationDefaultDateTo(),
    channel: "",
    status: "",
    type: "",
    employeeId: "",
    managerId: "",
    search: ""
  },
  total: 0,
  page: 1,
  pageSize: 50,
  loaded: false,
  loading: false,
  error: "",
  apiStatus: "waiting",
  selectedId: ""
};

let absenceState = loadAbsenceState();
const absenceUiState = {
  tab: "dashboard",
  message: "",
  error: "",
  typeFilter: "",
  employeeFilter: "",
  monthFilter: currentMonthKey(),
  actionLoadingId: "",
  rejectRequestId: "",
  rejectReason: ""
};
const absenceSettingsState = {
  loaded: false,
  loading: false,
  saving: false,
  apiStatus: "waiting",
  error: "",
  missingEndpoint: "PATCH /api/absence-settings"
};
const absenceApiState = {
  requests: [],
  loaded: false,
  loading: false,
  pendingRequests: [],
  pendingLoaded: false,
  pendingLoading: false,
  error: "",
  apiStatus: "waiting"
};
const moduleRulesState = {
  moduleKey: "absence",
  rules: [],
  auditLog: [],
  automationRuns: [],
  automationRunnerRuns: [],
  loaded: false,
  loading: false,
  saving: false,
  apiStatus: "waiting",
  error: "",
  message: "",
  formOpen: false,
  editingId: "",
  formType: "rule",
  selectedId: "",
  searchQuery: "",
  typeFilter: "all",
  statusFilter: "all"
};
const dataBoxState = {
  loaded: false,
  loading: false,
  apiStatus: "waiting",
  storageStatus: "waiting",
  integrationStatus: "inactive",
  status: null,
  messages: [],
  syncRuns: [],
  error: ""
};
const quickAbsenceState = {
  step: "type",
  type: "",
  dateMode: "",
  dateFrom: "",
  dateTo: "",
  halfDay: false,
  startTime: "09:00",
  endTime: "11:00",
  noteOpen: false,
  attachmentOpen: false,
  note: "",
  saving: false,
  success: false,
  error: "",
  recent: [],
  recentLoaded: false,
  recentLoading: false,
  apiStatus: "waiting",
  missingEndpoint: "POST /api/absence-requests"
};

const assistantPromoDefaultState = {
  loaded: false,
  loading: false,
  visible: false,
  saving: false,
  videoFailed: false,
  promoKey: "",
  promoDate: "",
  validUntil: "2026-06-30",
  action: "",
  videoUrl: "/avatars/sarlota-intro.mp4",
  fallbackImageUrl: "/avatars/sarlota-microphone.png",
  error: ""
};
const assistantPromoState = { ...assistantPromoDefaultState };

let aiAssistantMessageId = 0;
const aiAssistantState = {
  welcomeVisible: true,
  welcomeAnimate: true,
  chatOpen: false,
  launcherVisible: false,
  mode: "text",
  selectedAssistantId: DEFAULT_AI_ASSISTANT_ID,
  avatarAssetStatus: Object.fromEntries(AI_ASSISTANTS.map((assistant) => [assistant.id, "unknown"])),
  elevenLabsStatus: AI_STATUS_ELEVENLABS_WAITING,
  elevenLabsConfigured: false,
  elevenLabsConfiguredByAssistant: Object.fromEntries(AI_ASSISTANTS.map((assistant) => [assistant.id, false])),
  input: "",
  textStatus: AI_TEXT_READY_LABEL,
  textSending: false,
  voiceStatus: AI_STATUS_READY,
  voiceUiState: "idle",
  voiceTranscript: "",
  voiceAnswer: "",
  voiceTags: ["Připraven", "Bez odeslání", "Čeká na hlas"],
  voiceNotice: "",
  voiceWakeLockStatus: "idle",
  isListening: false,
  demoPlaying: false,
  demoSpeaker: "",
  demoSpeakerLabel: "",
  demoLine: "",
  demoStatus: "",
  confirmation: null,
  toast: null,
  highlightMessage: "",
  messages: [createAiAssistantMessage("bot", AI_INITIAL_MESSAGE)]
};
let aiVoiceDemoTimer = 0;
let aiVoiceStateTimer = 0;
let aiToastTimer = 0;
let aiConfirmationResolver = null;
let aiTextRequestId = 0;
let aiVoiceWeakInputReadings = 0;
let aiVoiceHapticSession = {
  connected: false,
  listening: false,
  problem: false
};
let aiVoiceWakeLockSentinel = null;
let aiVoiceWakeLockPending = false;

const speechRecognition = useSpeechRecognition({
  onResult: (transcript) => submitAiAssistantQuestion(transcript, { fromVoice: true }),
  onStatusChange: (status) => {
    aiAssistantState.voiceStatus = status || AI_STATUS_READY;
    syncVoiceUiStateFromStatus(aiAssistantState.voiceStatus);
    renderAiAssistantLayerOnly();
  },
  onListeningChange: (isListening) => {
    aiAssistantState.isListening = isListening;
    if (isListening) {
      setAiVoiceUiState("listening", "Poslouchám…", ["Poslouchám", "Mikrofon aktivní", "Bez odeslání"]);
    }
    renderAiAssistantLayerOnly();
  },
  onError: (error) => {
    aiAssistantState.voiceStatus = error?.status || AI_VOICE_ERROR_LABEL;
    aiAssistantState.voiceUiState = "error";
    aiAssistantState.voiceNotice = error?.message || "";
    aiAssistantState.voiceTags = ["Chyba hlasu", "Zkusit znovu", "Bez odeslání"];
    renderAiAssistantLayerOnly();
  }
});

const elevenLabsAssistant = ElevenLabsAssistantProvider({
  tools: {
    navigate: (route) => navigateFromAiAssistant(route),
    canUseRoute: (route) => canUseAiRoute(route),
    confirm: (payload) => requestAiConfirmation(payload),
    toast: (payload) => showAiToast(payload),
    highlight: (payload) => showAiHighlight(payload),
    requestJson: (path, options) => apiJson(path, options)
  }
});

const employeeCardState = {
  employees: [],
  employeesLoaded: false,
  employeesLoading: false,
  employee: null,
  loadingId: "",
  failedId: "",
  saving: false,
  managerSaving: false,
  managerPendingId: "",
  workHistorySaving: false,
  error: "",
  message: "",
  apiStatus: "waiting",
  absence: null,
  vacationBalance: null,
  workHistory: [],
  documents: [],
  medicalExam: null,
  medicalExamSaving: false,
  medicalExamError: "",
  medicalExamMessage: "",
  medicalExamApiStatus: "waiting",
  formDraft: null,
  medicalExamDraft: null,
  documentUploading: false,
  documentsUploadStatus: "waiting",
  documentsMissingEndpoint: "POST /api/employees/:id/documents"
};

const fleetImportPreviewState = {
  loading: false,
  preview: null,
  message: "",
  error: ""
};

const fleetVehiclesState = {
  loading: false,
  loaded: false,
  vehicles: [],
  summary: null,
  apiStatus: "waiting",
  message: "",
  error: "",
  lastFetchedAt: ""
};

const fleetUiState = {
  message: "",
  error: ""
};

const vehicleTrackingDemoState = {
  running: true,
  startedAt: 0,
  pausedElapsedMs: 0,
  frameId: 0,
  filter: "all",
  selectedVehicleId: DEMO_VEHICLE_TRACKING_VEHICLES[0]?.id || "",
  audioEnabled: false,
  mutedForLoop: false,
  lastLoopIndex: 0,
  lastBeepAt: 0,
  googleMapsStatus: "idle",
  googleMapsPromise: null,
  googleMapNode: null,
  googleMap: null,
  googleOverlays: null
};
const vehicleTrackingLiveState = {
  sourceMode: "tcars",
  loaded: false,
  loading: false,
  error: "",
  status: null,
  wimLoaded: false,
  wimLoading: false,
  wimError: "",
  wimApiStatus: "waiting",
  wimSites: [],
  wimSummary: null,
  wimSource: null,
  wimAlertEvents: [],
  selectedWimSiteId: "",
  selectedLocationId: "",
  googleMapNode: null,
  googleMap: null,
  googleMarkers: new Map(),
  wimGoogleMarkers: new Map(),
  googleBoundsKey: "",
  googleFocusedLocationId: ""
};

let vehicleTrackingAudioContext = null;

let lastRenderedUrl = window.location.href;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeThemeSettings() {
  return normalizeThemeSettings(themeState.preview || themeState.settings);
}

function moduleThemeStyleAttribute() {
  const properties = themeSettingsToCssProperties(activeThemeSettings());
  const style = Object.entries(properties)
    .map(([name, value]) => `${name}: ${String(value).replaceAll('"', "&quot;")}`)
    .join("; ");

  return `style="${style}"`;
}

function applyActiveThemeToRoot() {
  const properties = themeSettingsToCssProperties(activeThemeSettings());
  for (const [name, value] of Object.entries(properties)) {
    document.documentElement.style.setProperty(name, value);
  }
}

function normalizePath(pathname) {
  let path = pathname || "/";

  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
    path = path.slice(basePath.length) || "/";
  }

  if (path === "/") {
    return "/";
  }

  return path.replace(/\/+$/, "") || "/";
}

function routeHref(route) {
  if (route === "/") {
    return `${basePath || ""}/`;
  }

  return `${basePath || ""}${route}`;
}

function apiHref(path) {
  return `${basePath || ""}${path}`;
}

function employeeCardRoute(employeeId) {
  return `${EMPLOYEE_CARD_ROUTE_PREFIX}/${encodeURIComponent(employeeId || employeeIdForUser(currentUser()))}`;
}

function routeFleetVehicleId(path) {
  if (!path.startsWith(`${FLEET_ROUTE}/`) || path === `${FLEET_ROUTE}/dashboard`) {
    return "";
  }

  return decodeURIComponent(path.slice(`${FLEET_ROUTE}/`.length).split("/")[0] || "").trim();
}

function routeVehicleTrackingContext(path) {
  if (!path.startsWith(`${VEHICLE_TRACKING_BASE_ROUTE}/`)) {
    return null;
  }

  const parts = path
    .slice(`${VEHICLE_TRACKING_BASE_ROUTE}/`.length)
    .split("/")
    .map((part) => decodeURIComponent(part || "").trim())
    .filter(Boolean);

  if (!parts.length) {
    return null;
  }

  return {
    vehicleId: parts[0],
    view: parts[1] === "trasa-dnes" ? "today-trip" : parts[1] === "historie" ? "history" : "detail"
  };
}

function routeEmployeeId(path) {
  if (!path.startsWith(`${EMPLOYEE_CARD_ROUTE_PREFIX}/`)) {
    return "";
  }

  return decodeURIComponent(path.slice(`${EMPLOYEE_CARD_ROUTE_PREFIX}/`.length).split("/")[0] || "").trim();
}

function absenceTabForRoute(path) {
  if (path === "/dovolena-nemoc/dashboard") {
    return "dashboard";
  }

  return Object.entries(ABSENCE_TAB_ROUTES)
    .find(([, route]) => route === path)?.[0] || "";
}

function absenceRouteForTab(tabId) {
  return ABSENCE_TAB_ROUTES[tabId] || ABSENCE_ROUTE;
}

function absenceModuleItem() {
  return orderedModules.find((moduleItem) => moduleItem.id === "absence");
}

function renderModuleIcon(moduleItem) {
  return moduleItem.icon();
}

function statusBadge(moduleItem) {
  const label = moduleStatusLabel(moduleItem);

  if (!label || label === "SPRÁVA") {
    return "";
  }

  return `<span class="status-badge status-badge--${moduleStatusTone(moduleItem)}">${escapeHtml(label)}</span>`;
}

function visibleModules(user) {
  return filterModulesByUser(user, orderedModules);
}

function menuModules(user) {
  const items = visibleModules(user);

  if (canViewModule(user, feedbackMenuItem.id)) {
    return [...items, feedbackMenuItem];
  }

  return items;
}

function routeForModuleCard(moduleItem, user) {
  return moduleItem.route;
}

function visibleDashboardRoutes(user) {
  return filterModulesByUser(user, moduleDashboards);
}

function moduleFeedbackItems(moduleId, user) {
  const items = feedbackState.items.filter((item) => item.moduleId === moduleId);
  return visibleFeedbackForUser(items, user);
}

function moduleStatusLabel(moduleItem) {
  return {
    HOTOVO: "Hotovo",
    "připraveno": "Rozpracováno",
    skeleton: "Nový",
    "mock data": "Rozpracováno",
    ROZPRACOVÁN: "Rozpracováno",
    správa: ""
  }[moduleItem?.status] || moduleItem?.status || "";
}

function moduleStatusTone(moduleItem) {
  if (moduleItem?.status === "HOTOVO") {
    return "done";
  }

  if (moduleItem?.status === "skeleton") {
    return "new";
  }

  return "progress";
}

function moduleFeedbackBoxFor(moduleItem, user, options = {}) {
  if (!hasPermission(user, "feedback", "create")) {
    return "";
  }

  const moduleId = options.moduleId || moduleItem.id;
  const moduleName = options.moduleName || moduleItem.title;
  const feedbackState = feedbackFormState[moduleId] || {};

  return ModuleFeedbackBox({
    moduleId,
    moduleName,
    currentUser: user,
    feedbackItems: moduleFeedbackItems(moduleId, user),
    notice: feedbackState.message || "",
    error: feedbackState.error || "",
    placeholder: options.placeholder
  });
}

function createAiAssistantMessage(sender, text, actions = [], assistantName = "") {
  aiAssistantMessageId += 1;
  return {
    id: `ai-message-${aiAssistantMessageId}`,
    sender,
    text,
    actions,
    assistantName: sender === "bot"
      ? (assistantName || assistantById(DEFAULT_AI_ASSISTANT_ID).name)
      : ""
  };
}

function selectedAiAssistant() {
  return assistantById(aiAssistantState.selectedAssistantId);
}

function aiAssistantIntroMessage(assistant = selectedAiAssistant()) {
  return `${assistant.intro} Zeptej se mě na dovolenou, nemoc, pneumatiky, připomínky, uživatele nebo nastavení.`;
}

function clearAiVoiceStateTimer() {
  if (aiVoiceStateTimer) {
    window.clearTimeout(aiVoiceStateTimer);
    aiVoiceStateTimer = 0;
  }
}

function triggerAiHaptic(pattern = 15) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptika je pouze doplněk UX a nesmí ovlivnit hlasovou relaci.
  }
}

function resetAiVoiceHapticSession() {
  aiVoiceHapticSession = {
    connected: false,
    listening: false,
    problem: false
  };
}

function triggerAiVoiceSessionHaptic(type) {
  if (!Object.prototype.hasOwnProperty.call(aiVoiceHapticSession, type) || aiVoiceHapticSession[type]) {
    return;
  }

  aiVoiceHapticSession[type] = true;

  if (type === "connected") {
    triggerAiHaptic(20);
    return;
  }

  if (type === "listening") {
    triggerAiHaptic(10);
    return;
  }

  triggerAiHaptic([20, 40, 20]);
}

function aiVoiceWakeLockMessage(status = aiAssistantState.voiceWakeLockStatus) {
  if (status === "active") {
    return AI_VOICE_WAKE_LOCK_ACTIVE_LABEL;
  }

  if (status === "unavailable") {
    return AI_VOICE_WAKE_LOCK_UNAVAILABLE_LABEL;
  }

  return "";
}

function setAiVoiceWakeLockStatus(status, { renderAfter = false } = {}) {
  const normalizedStatus = ["idle", "active", "unavailable"].includes(status)
    ? status
    : "idle";

  if (aiAssistantState.voiceWakeLockStatus === normalizedStatus) {
    return;
  }

  aiAssistantState.voiceWakeLockStatus = normalizedStatus;

  if (renderAfter) {
    renderAiAssistantLayerOnly();
  }
}

function canRequestAiVoiceWakeLock() {
  return typeof navigator !== "undefined" &&
    Boolean(navigator.wakeLock) &&
    typeof navigator.wakeLock.request === "function";
}

function shouldHoldAiVoiceWakeLock() {
  return aiAssistantState.mode === "voice" &&
    AI_VOICE_WAKE_LOCK_STATES.includes(aiAssistantState.voiceUiState);
}

async function requestAiVoiceWakeLock({ renderAfter = false } = {}) {
  if (!shouldHoldAiVoiceWakeLock()) {
    return false;
  }

  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }

  if (!canRequestAiVoiceWakeLock()) {
    setAiVoiceWakeLockStatus("unavailable", { renderAfter });
    return false;
  }

  if (aiVoiceWakeLockSentinel && !aiVoiceWakeLockSentinel.released) {
    setAiVoiceWakeLockStatus("active", { renderAfter });
    return true;
  }

  if (aiVoiceWakeLockPending) {
    return false;
  }

  aiVoiceWakeLockPending = true;

  try {
    const wakeLockSentinel = await navigator.wakeLock.request("screen");
    aiVoiceWakeLockSentinel = wakeLockSentinel;

    wakeLockSentinel.addEventListener("release", () => {
      if (aiVoiceWakeLockSentinel !== wakeLockSentinel) {
        return;
      }

      aiVoiceWakeLockSentinel = null;
      setAiVoiceWakeLockStatus(shouldHoldAiVoiceWakeLock() ? "unavailable" : "idle", {
        renderAfter: true
      });
    });

    if (!shouldHoldAiVoiceWakeLock()) {
      await releaseAiVoiceWakeLock({ renderAfter });
      return false;
    }

    setAiVoiceWakeLockStatus("active", { renderAfter });
    return true;
  } catch {
    aiVoiceWakeLockSentinel = null;
    setAiVoiceWakeLockStatus("unavailable", { renderAfter });
    return false;
  } finally {
    aiVoiceWakeLockPending = false;
  }
}

async function releaseAiVoiceWakeLock({ renderAfter = false } = {}) {
  try {
    const wakeLockSentinel = aiVoiceWakeLockSentinel;
    aiVoiceWakeLockSentinel = null;

    if (wakeLockSentinel && !wakeLockSentinel.released) {
      await wakeLockSentinel.release();
    }
  } catch {
    // Wake Lock je pouze UX doplněk a nesmí ovlivnit hlasovou relaci.
  } finally {
    setAiVoiceWakeLockStatus("idle", { renderAfter });
  }
}

function syncAiVoiceWakeLock({ renderAfter = false } = {}) {
  if (shouldHoldAiVoiceWakeLock()) {
    void requestAiVoiceWakeLock({ renderAfter });
    return;
  }

  void releaseAiVoiceWakeLock({ renderAfter });
}

function setAiVoiceUiState(state, status = "", tags = []) {
  clearAiVoiceStateTimer();
  aiAssistantState.voiceUiState = AI_VOICE_UI_STATES.includes(state) ? state : "idle";
  aiAssistantState.voiceStatus = status || aiAssistantState.voiceStatus || AI_VOICE_IDLE_LABEL;
  aiAssistantState.voiceTags = tags.length ? tags : aiAssistantState.voiceTags;
  syncAiVoiceWakeLock({ renderAfter: true });
}

function isAiVoiceSessionActive() {
  return aiAssistantState.mode === "voice" && (
    aiAssistantState.isListening ||
    AI_VOICE_ACTIVE_STATES.includes(aiAssistantState.voiceUiState)
  );
}

function shouldShowAiVoiceDock() {
  return aiAssistantState.mode === "voice" &&
    !aiAssistantState.chatOpen &&
    !aiAssistantState.welcomeVisible &&
    (
      aiAssistantState.isListening ||
      AI_VOICE_DOCK_STATES.includes(aiAssistantState.voiceUiState)
    );
}

function clearAiVoiceWeakInputNotice() {
  aiVoiceWeakInputReadings = 0;

  if (aiAssistantState.voiceNotice === AI_VOICE_WEAK_INPUT_NOTICE) {
    aiAssistantState.voiceNotice = "";
    return true;
  }

  return false;
}

function updateAiVoiceInputLevelNotice(event = {}) {
  const inputLevel = Number(event.inputLevel || 0);

  if (!Number.isFinite(inputLevel) || event.source === "vad_score") {
    return false;
  }

  if (event.speaking || inputLevel >= AI_VOICE_WEAK_INPUT_LEVEL) {
    return clearAiVoiceWeakInputNotice();
  }

  if (inputLevel <= 0 || aiAssistantState.voiceUiState !== "listening") {
    return false;
  }

  aiVoiceWeakInputReadings += 1;

  if (aiVoiceWeakInputReadings >= AI_VOICE_WEAK_INPUT_MIN_READINGS && aiAssistantState.voiceNotice !== AI_VOICE_WEAK_INPUT_NOTICE) {
    aiAssistantState.voiceNotice = AI_VOICE_WEAK_INPUT_NOTICE;
    return true;
  }

  return false;
}

function syncVoiceUiStateFromStatus(status) {
  const normalizedStatus = String(status || "").trim();

  if (!normalizedStatus || normalizedStatus === AI_STATUS_READY || normalizedStatus === AI_STATUS_DONE) {
    aiAssistantState.voiceUiState = "idle";
    aiAssistantState.voiceTags = ["Připraven", "Mikrofon vypnutý", "Klepni"];
    return;
  }

  if (normalizedStatus.includes("Poslouch")) {
    aiAssistantState.voiceUiState = "listening";
    aiAssistantState.voiceTags = ["Poslouchám", "Mikrofon aktivní", "ElevenLabs"];
    return;
  }

  if (normalizedStatus.includes("Rozpozn") || normalizedStatus.includes("Připravuji") || normalizedStatus.includes("Zpracov")) {
    aiAssistantState.voiceUiState = "processing";
    aiAssistantState.voiceTags = ["Zpracovávám", "Čeká na odpověď", "ElevenLabs"];
    return;
  }

  if (normalizedStatus.includes("Mikrofon není povolený")) {
    aiAssistantState.voiceUiState = "microphoneDenied";
    aiAssistantState.voiceTags = ["Mikrofon blokován", "Zkusit znovu", "Bez odeslání"];
    return;
  }

  if (normalizedStatus.includes("Mikrofon") || normalizedStatus.includes("nepodpor")) {
    aiAssistantState.voiceUiState = "error";
    aiAssistantState.voiceTags = ["Chyba hlasu", "Zkusit znovu", "Bez odeslání"];
  }
}

function resetAiVoiceConversation() {
  clearAiVoiceStateTimer();
  clearAiVoiceWeakInputNotice();
  aiAssistantState.voiceUiState = "idle";
  aiAssistantState.voiceStatus = AI_STATUS_READY;
  aiAssistantState.voiceTranscript = "";
  aiAssistantState.voiceAnswer = "";
  aiAssistantState.voiceTags = ["Připraven", "Mikrofon vypnutý", "Klepni"];
  aiAssistantState.voiceNotice = "";
  void releaseAiVoiceWakeLock({ renderAfter: false });
}

function scheduleAiVoiceIdle(delay = 2400) {
  clearAiVoiceStateTimer();
  aiVoiceStateTimer = window.setTimeout(() => {
    aiAssistantState.voiceUiState = "idle";
    aiAssistantState.voiceStatus = AI_STATUS_READY;
    aiAssistantState.voiceTags = ["Připraven", "Mikrofon vypnutý", "Klepni"];
    void releaseAiVoiceWakeLock({ renderAfter: false });
    renderAiAssistantLayerOnly();
  }, delay);
}

function syncAiVoiceAssistantPanelDom() {
  const panel = app.querySelector(".ai-voice-assistant-panel");

  if (!panel) {
    return false;
  }

  const assistant = selectedAiAssistant();
  const normalizedState = AI_VOICE_UI_STATES.includes(aiAssistantState.voiceUiState)
    ? aiAssistantState.voiceUiState
    : "idle";
  const statusText = aiAssistantState.voiceStatus && aiAssistantState.voiceStatus !== AI_STATUS_READY
    ? aiAssistantState.voiceStatus
    : AI_VOICE_IDLE_LABEL;

  for (const state of AI_VOICE_UI_STATES) {
    panel.classList.remove(`ai-voice-assistant-panel--state-${state}`);
  }

  panel.classList.add(`ai-voice-assistant-panel--state-${normalizedState}`);
  panel.classList.toggle("ai-voice-assistant-panel--listening", Boolean(aiAssistantState.isListening));

  const status = panel.querySelector(".ai-voice-assistant-panel__status");
  if (status) {
    status.textContent = statusText;
  }

  const mic = panel.querySelector(".ai-voice-assistant-panel__mic");
  if (mic) {
    mic.setAttribute("aria-pressed", aiAssistantState.isListening ? "true" : "false");
  }

  const transcript = panel.querySelector(".ai-voice-assistant-panel__bubble--user p");
  if (transcript) {
    transcript.textContent = aiAssistantState.voiceTranscript || "Přepis řeči se zobrazí tady.";
  }

  const answer = panel.querySelector(".ai-voice-assistant-panel__bubble--assistant p");
  if (answer) {
    answer.textContent = aiAssistantState.voiceAnswer || "Odpověď asistenta se zobrazí tady.";
  }

  const answerLabel = panel.querySelector(".ai-voice-assistant-panel__bubble--assistant span");
  if (answerLabel) {
    answerLabel.textContent = assistant.name;
  }

  const tags = panel.querySelector(".ai-voice-assistant-panel__tags");
  if (tags) {
    tags.replaceChildren(...aiAssistantState.voiceTags.map((tag) => {
      const item = document.createElement("span");
      item.textContent = tag;
      return item;
    }));
  }

  return true;
}

function setAiAssistant(assistantId) {
  const assistant = assistantById(assistantId);
  aiAssistantState.selectedAssistantId = assistant.id;
  aiAssistantState.elevenLabsStatus = aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id]
    ? `ElevenLabs agent ${assistant.name} je nakonfigurovaný.`
    : AI_STATUS_ELEVENLABS_WAITING;
  resetAiVoiceConversation();
  aiAssistantState.messages = [
    ...aiAssistantState.messages,
    createAiAssistantMessage("bot", assistant.intro, [], assistant.name)
  ];
  renderAiAssistantLayerOnly();
}

async function probeAiAssistantAvatarAssets() {
  await Promise.all(AI_ASSISTANTS.map(async (assistant) => {
    if (!assistant.avatarPath) {
      aiAssistantState.avatarAssetStatus[assistant.id] = "missing";
      return;
    }

    try {
      const response = await fetch(assistant.avatarPath, {
        method: "HEAD",
        cache: "no-store"
      });
      const contentType = response.headers.get("content-type") || "";
      aiAssistantState.avatarAssetStatus[assistant.id] = response.ok && contentType.startsWith("image/")
        ? "available"
        : "missing";
    } catch {
      aiAssistantState.avatarAssetStatus[assistant.id] = "missing";
    }
  }));

  renderAiAssistantLayerOnly();
}

function moduleIdForAiRoute(route) {
  const normalizedRoute = normalizeAiRoute(route);

  if (normalizedRoute === "/" || normalizedRoute === "/dashboard") {
    return "dashboard";
  }

  if (normalizedRoute.startsWith("/dovolena-nemoc")) {
    return "absence";
  }

  if (normalizedRoute.startsWith(FLEET_ROUTE)) {
    return "fleet";
  }

  if (normalizedRoute.startsWith(VEHICLE_TRACKING_BASE_ROUTE)) {
    return "vehicle-tracking";
  }

  if (normalizedRoute === "/pripominky") {
    return "feedback";
  }

  const primaryModule = primaryRoutes.get(normalizedRoute);
  if (primaryModule) {
    return primaryModule.id;
  }

  const dashboardModule = dashboardRoutes.get(normalizedRoute);
  if (dashboardModule) {
    return dashboardModule.id;
  }

  return "";
}

function canUseAiRoute(route) {
  const normalizedRoute = normalizeAiRoute(route);

  if (!normalizedRoute) {
    return false;
  }

  const user = currentUser();
  const moduleId = moduleIdForAiRoute(normalizedRoute);
  return Boolean(moduleId && canViewModule(user, moduleId));
}

function renderAiToast() {
  const toast = aiAssistantState.toast;

  if (!toast) {
    return "";
  }

  return `
    <div class="ai-assistant-toast ai-assistant-toast--${escapeHtml(toast.type || "info")}" role="status">
      ${escapeHtml(toast.message)}
    </div>
  `;
}

function renderAiHighlightMessage() {
  if (!aiAssistantState.highlightMessage) {
    return "";
  }

  return `
    <div class="ai-assistant-highlight-message" role="status">
      ${escapeHtml(aiAssistantState.highlightMessage)}
    </div>
  `;
}

function showAiToast({ type = "info", message = "" } = {}) {
  if (aiToastTimer) {
    window.clearTimeout(aiToastTimer);
  }

  aiAssistantState.toast = {
    type,
    message
  };
  renderAiAssistantLayerOnly();

  aiToastTimer = window.setTimeout(() => {
    aiAssistantState.toast = null;
    renderAiAssistantLayerOnly();
  }, 3600);
}

function showAiHighlight({ message = "" } = {}) {
  aiAssistantState.highlightMessage = String(message || "Zvýrazněno.").trim();
  renderAiAssistantLayerOnly();

  window.setTimeout(() => {
    aiAssistantState.highlightMessage = "";
    renderAiAssistantLayerOnly();
  }, 2800);
}

function requestAiConfirmation({ title, message, confirmLabel, cancelLabel } = {}) {
  if (aiConfirmationResolver) {
    aiConfirmationResolver(false);
  }

  aiAssistantState.confirmation = {
    title,
    message,
    confirmLabel,
    cancelLabel
  };

  renderAiAssistantLayerOnly();

  return new Promise((resolve) => {
    aiConfirmationResolver = resolve;
  });
}

function resolveAiConfirmation(confirmed) {
  const resolver = aiConfirmationResolver;
  aiConfirmationResolver = null;
  aiAssistantState.confirmation = null;
  renderAiAssistantLayerOnly();

  if (resolver) {
    resolver(Boolean(confirmed));
  }
}

function resetAiAssistantSession() {
  speechRecognition.stop({ status: false });
  elevenLabsAssistant.stopVoiceAudio?.();
  clearAiVoiceStateTimer();
  void releaseAiVoiceWakeLock({ renderAfter: false });
  aiAssistantState.welcomeVisible = true;
  aiAssistantState.welcomeAnimate = true;
  aiAssistantState.chatOpen = false;
  aiAssistantState.launcherVisible = false;
  aiAssistantState.mode = "text";
  aiAssistantState.selectedAssistantId = DEFAULT_AI_ASSISTANT_ID;
  aiAssistantState.input = "";
  aiAssistantState.textStatus = AI_TEXT_READY_LABEL;
  aiAssistantState.textSending = false;
  aiAssistantState.voiceStatus = AI_STATUS_READY;
  aiAssistantState.voiceUiState = "idle";
  aiAssistantState.voiceTranscript = "";
  aiAssistantState.voiceAnswer = "";
  aiAssistantState.voiceTags = ["Připraven", "Mikrofon vypnutý", "Klepni"];
  aiAssistantState.voiceNotice = "";
  aiAssistantState.voiceWakeLockStatus = "idle";
  aiAssistantState.isListening = false;
  aiAssistantState.confirmation = null;
  aiAssistantState.toast = null;
  aiAssistantState.highlightMessage = "";
  aiAssistantState.messages = [createAiAssistantMessage("bot", aiAssistantIntroMessage(), [], assistantById(DEFAULT_AI_ASSISTANT_ID).name)];
  aiTextRequestId += 1;
}

async function aiAssistantResponse(question, options = {}) {
  const assistant = selectedAiAssistant();

  try {
    const result = options.fromVoice
      ? await elevenLabsAssistant.sendVoiceMessage(assistant.id, question)
      : await elevenLabsAssistant.sendTextMessage(assistant.id, question);
    aiAssistantState.elevenLabsConfigured = true;
    aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id] = true;
    aiAssistantState.elevenLabsStatus = `ElevenLabs agent ${result.assistantName || assistant.name} je připravený.`;

    return {
      text: result.text || `${assistant.name} nevrátila textovou odpověď.`,
      actions: [],
      audioChunkCount: result.audioChunkCount || 0,
      audioPlaybackFailed: Boolean(result.audioPlaybackFailed),
      audioPlaybackStarted: Boolean(result.audioPlaybackStarted),
      failed: false
    };
  } catch (error) {
    aiAssistantState.elevenLabsStatus = error?.payload?.error || AI_STATUS_ELEVENLABS_WAITING;

    return {
      text: error?.payload?.error || error?.message || "Textový režim Šarloty se teď nepodařilo ověřit.",
      actions: [],
      failed: true
    };
  }
}

function cancelAiTextRequest(nextStatus = AI_TEXT_READY_LABEL) {
  aiTextRequestId += 1;
  elevenLabsAssistant.closeTextSession?.();
  aiAssistantState.textSending = false;
  aiAssistantState.textStatus = nextStatus;
}

function openAiAssistant(mode = "text") {
  stopAiVoiceDemo({ renderAfter: false });
  const nextMode = mode === "voice" ? "voice" : "text";
  const keepVoiceState = nextMode === "voice" && (
    isAiVoiceSessionActive() ||
    AI_VOICE_DOCK_STATES.includes(aiAssistantState.voiceUiState)
  );

  if (aiAssistantState.mode !== nextMode) {
    cancelAiTextRequest();
  }

  if (nextMode !== "voice") {
    elevenLabsAssistant.stopVoiceAudio?.();
  }

  aiAssistantState.welcomeVisible = false;
  aiAssistantState.welcomeAnimate = false;
  aiAssistantState.chatOpen = true;
  aiAssistantState.launcherVisible = false;
  aiAssistantState.mode = nextMode;
  if (aiAssistantState.mode === "voice") {
    aiAssistantState.selectedAssistantId = DEFAULT_AI_ASSISTANT_ID;
    const assistant = assistantById(DEFAULT_AI_ASSISTANT_ID);
    aiAssistantState.elevenLabsStatus = aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id]
      ? `ElevenLabs agent ${assistant.name} je nakonfigurovaný.`
      : AI_STATUS_ELEVENLABS_WAITING;
  }
  if (!keepVoiceState) {
    resetAiVoiceConversation();
  }
  renderAiAssistantLayerOnly();
}

function dismissAiAssistantWelcome() {
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.welcomeAnimate = false;
  aiAssistantState.launcherVisible = true;
  renderAiAssistantLayerOnly();
}

function closeAiAssistant() {
  stopAiVoiceDemo({ renderAfter: false });
  elevenLabsAssistant.stopVoiceAudio?.();
  clearAiVoiceStateTimer();
  void releaseAiVoiceWakeLock({ renderAfter: false });
  cancelAiTextRequest();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  speechRecognition.stop({ status: false });
  aiAssistantState.chatOpen = false;
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.welcomeAnimate = false;
  aiAssistantState.launcherVisible = true;
  aiAssistantState.isListening = false;
  aiAssistantState.voiceStatus = AI_STATUS_DONE;
  aiAssistantState.voiceUiState = "idle";
  aiAssistantState.voiceWakeLockStatus = "idle";
  renderAiAssistantLayerOnly();
}

async function submitAiAssistantQuestion(question, options = {}) {
  const text = String(question || "").trim();

  if (!text) {
    return;
  }

  if (aiAssistantState.textSending) {
    return;
  }

  if (options.fromVoice) {
    setAiVoiceUiState("processing", AI_VOICE_PROCESSING_LABEL, ["Zpracovávám", "Čeká na odpověď", "Bez odeslání"]);
    aiAssistantState.voiceTranscript = text;
    aiAssistantState.voiceAnswer = "";
  }

  const requestId = ++aiTextRequestId;
  aiAssistantState.messages = [
    ...aiAssistantState.messages,
    createAiAssistantMessage("user", text)
  ];
  aiAssistantState.input = "";
  aiAssistantState.voiceNotice = "";
  aiAssistantState.textSending = true;
  aiAssistantState.textStatus = AI_TEXT_SENDING_LABEL;
  renderAiAssistantLayerOnly();

  const response = await aiAssistantResponse(text, { fromVoice: Boolean(options.fromVoice) });

  if (requestId !== aiTextRequestId) {
    return;
  }

  aiAssistantState.messages = [
    ...aiAssistantState.messages,
    createAiAssistantMessage("bot", response.text, response.actions, selectedAiAssistant().name)
  ];
  aiAssistantState.textSending = false;
  aiAssistantState.textStatus = response.failed ? AI_TEXT_ERROR_LABEL : AI_TEXT_READY_RESULT_LABEL;

  if (options.fromVoice) {
    aiAssistantState.voiceAnswer = response.text;
    if (response.failed) {
      setAiVoiceUiState("error", AI_TEXT_ERROR_LABEL, ["Chyba AI", "Textový režim", "Bez odeslání"]);
    } else {
      aiAssistantState.voiceNotice = response.audioPlaybackFailed
        ? "Odpověď přišla textem, ale zvuk se v mobilním prohlížeči nepodařilo přehrát. Zkontrolujte hlasitost, tichý režim a povolený zvuk pro prohlížeč."
        : "";
      setAiVoiceUiState("assistantSpeaking", AI_VOICE_SPEAKING_LABEL, [
        response.audioPlaybackStarted ? "Zvuk přehrávám" : "Zvuk připravuji",
        response.actions?.length ? "Čeká na potvrzení" : "Výstup maximum",
        response.audioChunkCount ? "ElevenLabs audio" : "Čekám na audio"
      ]);
      scheduleAiVoiceIdle(7200);
    }
  }

  renderAiAssistantLayerOnly();

  if (options.fromVoice && response.actions?.length === 1) {
    const route = normalizeAiRoute(response.actions[0].route);

    if (route && canUseAiRoute(route)) {
      window.setTimeout(() => navigateFromAiAssistant(route), 420);
    }
  }
}

function aiVoiceDemoDelay(line) {
  return Math.max(3800, Math.min(6200, 1900 + String(line?.text || "").length * 58));
}

function aiVoiceDemoVoice() {
  if (!("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices?.() || [];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("cs")) || voices[0] || null;
}

function clearAiVoiceDemoTimer() {
  if (aiVoiceDemoTimer) {
    window.clearTimeout(aiVoiceDemoTimer);
    aiVoiceDemoTimer = 0;
  }
}

function stopAiVoiceDemo(options = {}) {
  clearAiVoiceDemoTimer();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  aiAssistantState.demoPlaying = false;
  aiAssistantState.demoSpeaker = "";
  aiAssistantState.demoSpeakerLabel = "";
  aiAssistantState.demoLine = "";
  aiAssistantState.demoStatus = "";
  aiAssistantState.isListening = false;
  aiAssistantState.voiceStatus = AI_STATUS_READY;

  if (options.renderAfter !== false) {
    renderAiAssistantLayerOnly();
  }
}

function playAiVoiceDemoLine(index = 0) {
  if (!aiAssistantState.demoPlaying || index >= AI_VOICE_DEMO_SCRIPT.length) {
    stopAiVoiceDemo({ renderAfter: false });
    aiAssistantState.demoStatus = "Ukázka dokončena.";
    renderAiAssistantLayerOnly();
    return;
  }

  const line = AI_VOICE_DEMO_SCRIPT[index];
  aiAssistantState.demoSpeaker = line.speaker;
  aiAssistantState.demoSpeakerLabel = line.label;
  aiAssistantState.demoLine = line.text;
  aiAssistantState.demoStatus = line.speaker === "ai" ? "Mluví AI Smart pomocník…" : "Mluví uživatel Kaiser smart…";
  aiAssistantState.voiceStatus = AI_STATUS_DEMO;
  aiAssistantState.isListening = true;
  renderAiAssistantLayerOnly();

  const next = () => {
    clearAiVoiceDemoTimer();
    aiVoiceDemoTimer = window.setTimeout(() => playAiVoiceDemoLine(index + 1), 260);
  };

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.lang = "cs-CZ";
    utterance.rate = line.speaker === "ai" ? 0.94 : 1.02;
    utterance.pitch = line.speaker === "ai" ? 0.96 : 1.08;
    utterance.voice = aiVoiceDemoVoice();
    window.speechSynthesis.speak(utterance);
  } else {
    aiAssistantState.demoStatus = "Zvuková ukázka není v tomto prohlížeči podporovaná, přehrávám textově.";
    renderAiAssistantLayerOnly();
  }

  aiVoiceDemoTimer = window.setTimeout(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    next();
  }, aiVoiceDemoDelay(line));
}

function startAiVoiceDemo() {
  if (aiAssistantState.demoPlaying) {
    stopAiVoiceDemo();
    return;
  }

  speechRecognition.stop({ status: false });
  clearAiVoiceDemoTimer();
  aiAssistantState.demoPlaying = true;
  aiAssistantState.demoSpeaker = "";
  aiAssistantState.demoSpeakerLabel = "";
  aiAssistantState.demoLine = "";
  aiAssistantState.demoStatus = "Spouštím ukázkovou komunikaci…";
  aiAssistantState.voiceNotice = "";
  playAiVoiceDemoLine(0);
}

async function prepareElevenLabsVoiceSession() {
  const assistant = selectedAiAssistant();

  try {
    const result = await elevenLabsAssistant.prepareSignedUrl(assistant.id);
    aiAssistantState.elevenLabsConfigured = Boolean(result.configured);
    aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id] = Boolean(result.configured);
    aiAssistantState.elevenLabsStatus = result.configured
      ? `ElevenLabs agent ${result.assistantName || assistant.name} je připravený.`
      : AI_STATUS_ELEVENLABS_WAITING;
  } catch (error) {
    aiAssistantState.elevenLabsConfigured = false;
    aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id] = false;
    aiAssistantState.elevenLabsStatus = error?.payload?.error || AI_STATUS_ELEVENLABS_WAITING;
  }
}

async function startAiVoiceRecognition() {
  stopAiVoiceDemo({ renderAfter: false });
  speechRecognition.stop({ status: false });
  const requestId = ++aiTextRequestId;
  elevenLabsAssistant.stopVoiceAudio?.();
  resetAiVoiceHapticSession();
  clearAiVoiceWeakInputNotice();
  const assistant = selectedAiAssistant();
  aiAssistantState.demoStatus = "";
  aiAssistantState.voiceNotice = "";
  aiAssistantState.voiceTranscript = "";
  aiAssistantState.voiceAnswer = "";
  aiAssistantState.isListening = false;
  setAiVoiceUiState("connecting", AI_VOICE_CONNECTING_LABEL, ["Připojuji", "Mikrofon", "ElevenLabs"]);
  renderAiAssistantLayerOnly();

  try {
    const result = await elevenLabsAssistant.startVoiceConversation(assistant.id, {
      onAudioWarning: (message) => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        aiAssistantState.voiceNotice = message;
        renderAiAssistantLayerOnly();
      },
      onConnected: (session) => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        aiAssistantState.elevenLabsConfigured = true;
        aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id] = true;
        aiAssistantState.elevenLabsStatus = `ElevenLabs agent ${session.assistantName || assistant.name} je připojený.`;
        setAiVoiceUiState("ready", AI_VOICE_READY_LABEL, ["Připojeno", "Mikrofon", "ElevenLabs"]);
        triggerAiVoiceSessionHaptic("connected");
        renderAiAssistantLayerOnly();
      },
      onListening: () => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        aiAssistantState.isListening = true;
        clearAiVoiceWeakInputNotice();
        setAiVoiceUiState("listening", AI_VOICE_LISTENING_LABEL, ["Poslouchám", "Mikrofon aktivní", "ElevenLabs"]);
        triggerAiVoiceSessionHaptic("listening");
        renderAiAssistantLayerOnly();
      },
      onInputLevel: (event) => {
        if (requestId !== aiTextRequestId || !aiAssistantState.isListening) {
          return;
        }

        let shouldRender = updateAiVoiceInputLevelNotice(event);

        if (event.speaking && aiAssistantState.voiceUiState !== "userSpeaking") {
          setAiVoiceUiState("userSpeaking", AI_VOICE_USER_SPEAKING_LABEL, ["Mluvte teď", "Mikrofon aktivní", "ElevenLabs"]);
          renderAiAssistantLayerOnly();
          return;
        }

        if (!event.speaking && aiAssistantState.voiceUiState === "userSpeaking") {
          setAiVoiceUiState("listening", AI_VOICE_LISTENING_LABEL, ["Poslouchám", "Mikrofon aktivní", "ElevenLabs"]);
          shouldRender = true;
        }

        if (shouldRender) {
          renderAiAssistantLayerOnly();
        }
      },
      onReady: () => {
        if (requestId !== aiTextRequestId) {
          return;
        }

        aiAssistantState.isListening = true;
        clearAiVoiceWeakInputNotice();
        setAiVoiceUiState("listening", AI_VOICE_LISTENING_LABEL, ["Poslouchám", "Mluvte teď", "ElevenLabs"]);
        triggerAiVoiceSessionHaptic("listening");
        renderAiAssistantLayerOnly();
      },
      onUserTranscript: (event) => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        aiAssistantState.isListening = false;
        clearAiVoiceWeakInputNotice();
        aiAssistantState.voiceTranscript = event.text || "";
        setAiVoiceUiState("processing", AI_VOICE_PROCESSING_LABEL, ["Zpracovávám", "Čeká na odpověď", "ElevenLabs"]);
        renderAiAssistantLayerOnly();
      },
      onAgentResponse: (event) => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        aiAssistantState.isListening = false;
        aiAssistantState.voiceAnswer = event.text || "";
        setAiVoiceUiState("assistantSpeaking", AI_VOICE_SPEAKING_LABEL, ["Šarlota odpovídá", "Čekám na audio", "ElevenLabs"]);
        renderAiAssistantLayerOnly();
      },
      onAudio: (event) => {
        if (requestId !== aiTextRequestId) {
          return;
        }
        if (event.audioPlaybackFailed) {
          aiAssistantState.voiceNotice = "Odpověď přišla, ale zvuk se v mobilním prohlížeči nepodařilo přehrát. Zkontrolujte hlasitost, tichý režim a povolený zvuk pro prohlížeč.";
        }
        setAiVoiceUiState("assistantSpeaking", AI_VOICE_SPEAKING_LABEL, [
          event.audioPlaybackStarted ? "Zvuk přehrávám" : "Zvuk připravuji",
          "Výstup maximum",
          "ElevenLabs audio"
        ]);
        renderAiAssistantLayerOnly();
      }
    });

    if (requestId !== aiTextRequestId) {
      return;
    }

    aiAssistantState.elevenLabsConfigured = true;
    aiAssistantState.elevenLabsConfiguredByAssistant[assistant.id] = true;
    aiAssistantState.elevenLabsStatus = `ElevenLabs agent ${result.assistantName || assistant.name} je připravený.`;
    aiAssistantState.isListening = false;
    aiAssistantState.voiceTranscript = result.transcript || aiAssistantState.voiceTranscript;
    aiAssistantState.voiceAnswer = result.text || aiAssistantState.voiceAnswer || `${assistant.name} nevrátila textovou odpověď.`;
    aiAssistantState.voiceNotice = result.audioPlaybackFailed
      ? "Odpověď přišla textem, ale zvuk se v mobilním prohlížeči nepodařilo přehrát. Zkontrolujte hlasitost, tichý režim a povolený zvuk pro prohlížeč."
      : aiAssistantState.voiceNotice;
    setAiVoiceUiState("assistantSpeaking", AI_VOICE_SPEAKING_LABEL, [
      result.audioPlaybackStarted ? "Zvuk přehrávám" : "Odpověď přijata",
      "Výstup maximum",
      result.audioChunkCount ? "ElevenLabs audio" : "Čekám na audio"
    ]);

    if (result.transcript) {
      aiAssistantState.messages = [
        ...aiAssistantState.messages,
        createAiAssistantMessage("user", result.transcript),
        createAiAssistantMessage("bot", aiAssistantState.voiceAnswer, [], result.assistantName || assistant.name)
      ];
    }

    scheduleAiVoiceIdle(7200);
    renderAiAssistantLayerOnly();
  } catch (error) {
    if (requestId !== aiTextRequestId) {
      return;
    }

    aiAssistantState.isListening = false;
    if (error?.code === "voice_stopped") {
      aiAssistantState.voiceStatus = AI_VOICE_MUTED_LABEL;
      aiAssistantState.voiceUiState = "muted";
      aiAssistantState.voiceTags = ["Mikrofon vypnutý", "Klepni", "Připraven"];
      void releaseAiVoiceWakeLock({ renderAfter: false });
      renderAiAssistantLayerOnly();
      return;
    }

    if (error?.code === "voice_microphone_denied" || String(error?.message || "").includes("Mikrofon není povolený")) {
      aiAssistantState.elevenLabsStatus = AI_VOICE_MICROPHONE_DENIED_LABEL;
      aiAssistantState.voiceStatus = AI_VOICE_MICROPHONE_DENIED_LABEL;
      aiAssistantState.voiceUiState = "microphoneDenied";
      aiAssistantState.voiceNotice = "Povol mikrofon pro tento web a zkus to znovu.";
      aiAssistantState.voiceTags = ["Mikrofon blokován", "Zkusit znovu", "Bez odeslání"];
      triggerAiVoiceSessionHaptic("problem");
      void releaseAiVoiceWakeLock({ renderAfter: false });
      renderAiAssistantLayerOnly();
      return;
    }

    if (error?.code === "voice_disconnected") {
      aiAssistantState.elevenLabsStatus = `ElevenLabs agent ${assistant.name} je odpojený.`;
      aiAssistantState.voiceStatus = AI_VOICE_DISCONNECTED_LABEL;
      aiAssistantState.voiceUiState = "disconnected";
      aiAssistantState.voiceNotice = error?.message || "Spojení se Šarlotou se přerušilo. Zkontroluj mikrofon, oprávnění prohlížeče a klikni na Obnovit spojení.";
      aiAssistantState.voiceTags = [
        "Odpojeno",
        error?.closeCode ? `Kód ${error.closeCode}` : "Obnovit spojení",
        error?.voiceReason === "microphone-track-ended" ? "Mikrofon ukončen" : "Mikrofon vypnutý"
      ];
      triggerAiVoiceSessionHaptic("problem");
      void releaseAiVoiceWakeLock({ renderAfter: false });
      renderAiAssistantLayerOnly();
      return;
    }

    aiAssistantState.elevenLabsStatus = error?.payload?.error || aiAssistantState.elevenLabsStatus || AI_STATUS_ELEVENLABS_WAITING;
    aiAssistantState.voiceStatus = error?.payload?.error || error?.message || AI_VOICE_ERROR_LABEL;
    aiAssistantState.voiceUiState = "error";
    aiAssistantState.voiceNotice = error?.payload?.error || error?.message || "Hlasový režim Šarloty se nepodařilo spustit.";
    aiAssistantState.voiceTags = ["Chyba hlasu", "Zkusit znovu", "Bez odeslání"];
    triggerAiVoiceSessionHaptic("problem");
    void releaseAiVoiceWakeLock({ renderAfter: false });
    renderAiAssistantLayerOnly();
  }
}

function stopAiVoiceRecognition() {
  stopAiVoiceDemo({ renderAfter: false });
  aiTextRequestId += 1;
  elevenLabsAssistant.stopVoiceAudio?.();
  clearAiVoiceStateTimer();
  clearAiVoiceWeakInputNotice();
  speechRecognition.stop();
  aiAssistantState.isListening = false;
  aiAssistantState.voiceUiState = "muted";
  aiAssistantState.voiceStatus = AI_VOICE_MUTED_LABEL;
  aiAssistantState.voiceTags = ["Mikrofon vypnutý", "Klepni", "Připraven"];
  void releaseAiVoiceWakeLock({ renderAfter: false });
  renderAiAssistantLayerOnly();
}

function navigateFromAiAssistant(route) {
  const normalizedRoute = normalizeAiRoute(route);
  const keepVoiceSession = isAiVoiceSessionActive();

  if (!normalizedRoute || !canUseAiRoute(normalizedRoute)) {
    showAiToast({
      type: "warning",
      message: "Tuhle část aplikace nemůže AI pomocník otevřít."
    });
    return;
  }

  stopAiVoiceDemo({ renderAfter: false });
  if (!keepVoiceSession) {
    speechRecognition.stop({ status: false });
    cancelAiTextRequest();
  }
  aiAssistantState.chatOpen = false;
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.welcomeAnimate = false;
  aiAssistantState.launcherVisible = true;
  if (!keepVoiceSession) {
    aiAssistantState.isListening = false;
  }
  guardedAccessAction(() => navigateToUrl(routeHref(normalizedRoute)));
}

function renderAiAssistantLayer() {
  const user = authState.user ? currentUser() : null;

  if (!user || !isUserActive(user)) {
    return "";
  }

  const assistant = selectedAiAssistant();
  const promoVisible = assistantPromoState.visible;

  const content = [
    AiWelcomeModal({
      visible: aiAssistantState.welcomeVisible && !promoVisible,
      animate: aiAssistantState.welcomeAnimate && !promoVisible
    }),
    AiAssistantChat({
      open: aiAssistantState.chatOpen,
      mode: aiAssistantState.mode,
      messages: aiAssistantState.messages,
      input: aiAssistantState.input,
      assistant,
      assistants: elevenLabsAssistant.assistants,
      selectedAssistantId: aiAssistantState.selectedAssistantId,
      avatarAssetStatus: aiAssistantState.avatarAssetStatus,
      elevenLabsStatus: aiAssistantState.elevenLabsStatus,
      textStatus: aiAssistantState.textStatus,
      textSending: aiAssistantState.textSending,
      isListening: aiAssistantState.isListening,
      voiceStatus: aiAssistantState.voiceStatus,
      voiceUiState: aiAssistantState.voiceUiState,
      voiceTranscript: aiAssistantState.voiceTranscript,
      voiceAnswer: aiAssistantState.voiceAnswer,
      voiceTags: aiAssistantState.voiceTags,
      voiceNotice: aiAssistantState.voiceNotice,
      voiceWakeLockMessage: aiVoiceWakeLockMessage(),
      demoPlaying: aiAssistantState.demoPlaying,
      demoSpeaker: aiAssistantState.demoSpeaker,
      demoSpeakerLabel: aiAssistantState.demoSpeakerLabel,
      demoLine: aiAssistantState.demoLine,
      demoStatus: aiAssistantState.demoStatus
    }),
    AiAssistantLauncher({
      visible: !promoVisible && ((aiAssistantState.launcherVisible && !aiAssistantState.chatOpen && !aiAssistantState.welcomeVisible) || shouldShowAiVoiceDock()),
      voiceActive: shouldShowAiVoiceDock(),
      voiceUiState: aiAssistantState.voiceUiState,
      voiceStatus: aiAssistantState.voiceStatus,
      isListening: aiAssistantState.isListening
    }),
    AiConfirmationModal({ confirmation: aiAssistantState.confirmation }),
    renderAiToast(),
    renderAiHighlightMessage()
  ].join("");

  return `<div class="ai-assistant-layer" data-ai-assistant-layer>${content}</div>`;
}

function renderAiAssistantLayerOnly() {
  const currentLayer = app.querySelector("[data-ai-assistant-layer]");
  const nextLayer = renderAiAssistantLayer();

  if (currentLayer) {
    if (nextLayer) {
      currentLayer.outerHTML = nextLayer;
    } else {
      currentLayer.remove();
    }
  } else if (nextLayer) {
    app.insertAdjacentHTML("beforeend", nextLayer);
  }

  if (aiAssistantState.welcomeVisible && aiAssistantState.welcomeAnimate) {
    aiAssistantState.welcomeAnimate = false;
  }
}

function formatDateTime(value) {
  if (!value) {
    return "neuvedeno";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatFileSize(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace(".", ",")} kB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function optionList(options, selected, emptyLabel = "Vše") {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...options.map((option) => `
      <option value="${escapeHtml(option.value ?? option)}" ${(option.value ?? option) === selected ? "selected" : ""}>
        ${escapeHtml(option.label ?? option)}
      </option>
    `)
  ].join("");
}

function userBar(user) {
  return `
    <div class="user-bar" aria-label="Přihlášený uživatel">
      <div class="user-bar__identity">
        <span class="user-bar__name">${escapeHtml(user.name || user.email || "Uživatel")}</span>
        <span class="user-bar__role">${escapeHtml(roleLabel(user.role))}</span>
      </div>
      <button class="logout-button" type="button" data-logout>Odhlásit</button>
    </div>
  `;
}

function stackedCell(primary, secondary) {
  const primaryValue = String(primary || "-").trim();
  const secondaryValue = String(secondary || "").trim();
  const secondaryLine = secondaryValue && secondaryValue !== primaryValue
    ? `<span>${escapeHtml(secondaryValue)}</span>`
    : "";

  return `
    <span class="users-contact">
      <span>${escapeHtml(primaryValue)}</span>
      ${secondaryLine}
    </span>
  `;
}

const permissionActionLabels = {
  view: "zobrazit",
  create: "vytvořit",
  edit: "upravit",
  delete: "smazat",
  approve: "schválit",
  export: "export",
  manage: "správa",
  "*": "vše"
};

function moduleTitleByPermissionId(moduleId) {
  if (moduleId === "*") {
    return "Všechny moduly";
  }

  const moduleItem = [...orderedModules, feedbackMenuItem].find((item) => item.id === moduleId);
  return moduleItem?.title || moduleId;
}

function roleOrderIndex(roleId) {
  const index = ROLE_DEFINITIONS.findIndex((role) => role.id === normalizeRole(roleId));
  return index === -1 ? ROLE_DEFINITIONS.length : index;
}

function orderedAccessRoles() {
  return [...accessState.roles].sort((a, b) => roleOrderIndex(a.id) - roleOrderIndex(b.id));
}

function setAccessState(nextState) {
  accessState = saveAccessState(nextState);
}

function scrollToPageTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  } catch {
    window.scrollTo(0, 0);
  }
}

function scrollToQuickAbsenceEntry() {
  if (window.location.hash !== QUICK_ABSENCE_ENTRY_HASH) {
    return;
  }

  window.requestAnimationFrame(() => {
    document.querySelector(QUICK_ABSENCE_ENTRY_HASH)?.scrollIntoView({
      block: "start",
      behavior: "auto"
    });
  });
}

function currentUser() {
  return withAccessContext(authState.user, {
    ...accessState,
    users: []
  });
}

function allAccessUsers() {
  return mergeAccessUsers(adminUsersState.users, accessState.users);
}

function accessUserKey(user) {
  return String(user?.email || user?.id || "").trim().toLowerCase();
}

function findAccessUser(userId) {
  const normalizedId = String(userId || "").trim().toLowerCase();
  return allAccessUsers().find((user) => String(user.id || "").trim().toLowerCase() === normalizedId) || null;
}

function findSavedAccessUser(userId) {
  const normalizedId = String(userId || "").trim().toLowerCase();
  return adminUsersState.users.find((user) => String(user.id || "").trim().toLowerCase() === normalizedId) || null;
}

function sameAccessUserIdentity(user, reference) {
  const userId = String(user?.id || "").trim().toLowerCase();
  const referenceId = String(reference?.id || "").trim().toLowerCase();
  const userEmail = String(user?.email || "").trim().toLowerCase();
  const referenceEmail = String(reference?.email || "").trim().toLowerCase();

  return (
    (userId && referenceId && userId === referenceId) ||
    (userEmail && referenceEmail && userEmail === referenceEmail)
  );
}

function selectedAccessUser(users) {
  const selectedId = String(accessState.selectedUserId || "").trim().toLowerCase();
  return users.find((user) => String(user.id || "").trim().toLowerCase() === selectedId) || users[0] || null;
}

function selectedAccessRole() {
  const roles = orderedAccessRoles();
  return roles.find((role) => role.id === accessState.selectedRoleId) || roles[0];
}

function nextDraftUserId() {
  const usedIds = new Set(allAccessUsers().map((user) => user.id));
  let id = `draft-user-${Date.now()}`;
  let index = 2;

  while (usedIds.has(id)) {
    id = `draft-user-${Date.now()}-${index}`;
    index += 1;
  }

  return id;
}

function matrixPermissions(permissions, roleId = "") {
  const map = permissionMap(permissions || []);
  const fullAccessAlwaysAllowed = isFullAccessRole({ role: roleId, active: true });

  return {
    allows(moduleId, action) {
      return (
        fullAccessAlwaysAllowed ||
        map.get(`${moduleId}:${action}`) === true ||
        map.get(`${moduleId}:*`) === true ||
        map.get(`*:*`) === true
      );
    }
  };
}

function fullPermissionsAllowed() {
  return permissionModules.flatMap((moduleItem) => (
    ACTIONS.map((action) => ({
      moduleId: moduleItem.id,
      action,
      allowed: true
    }))
  ));
}

function permissionsFromMatrix(form, prefix, roleId = "") {
  if (isFullAccessRole({ role: roleId, active: true })) {
    return fullPermissionsAllowed();
  }

  return makePermissionsFromMatrix(permissionModules, ACTIONS, new FormData(form), prefix);
}

function userDefaultPermissions(roleId) {
  return isFullAccessRole({ role: roleId, active: true })
    ? fullPermissionsAllowed()
    : rolePermissionsFor(roleId, accessState.roles);
}

function comparablePermissions(permissions = [], roleId = "") {
  const state = matrixPermissions(permissions, roleId);

  return permissionModules.flatMap((moduleItem) => (
    ACTIONS.map((action) => ({
      moduleId: moduleItem.id,
      action,
      allowed: state.allows(moduleItem.id, action)
    }))
  ));
}

function comparableUser(user) {
  if (!user) {
    return null;
  }

  const role = normalizeRole(user.role);
  const active = user.active !== false && String(user.status || "").toLowerCase() !== "disabled";
  const permissions = Array.isArray(user.permissions) && user.permissions.length
    ? user.permissions
    : userDefaultPermissions(role);

  return {
    id: String(user.id || ""),
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim(),
    phone: String(user.phone || "").trim(),
    role,
    department: String(user.department || "").trim(),
    active,
    permissions: comparablePermissions(permissions, role)
  };
}

function comparableRole(role) {
  if (!role) {
    return null;
  }

  return {
    id: normalizeRole(role.id || role.name),
    description: String(role.description || "").trim(),
    defaultPermissions: comparablePermissions(role.defaultPermissions || [], role.id || role.name)
  };
}

function isSameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function employeeFullName(employee) {
  return [employee?.firstName, employee?.lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ") ||
    employee?.name ||
    "Zaměstnanec";
}

function employeeNameLink(employeeId, employeeName) {
  return `
    <a class="absence-employee-link" href="${routeHref(employeeCardRoute(employeeId))}" data-link>
      ${escapeHtml(employeeName || "Zaměstnanec")}
    </a>
  `;
}

function canEditEmployeeCards(user = currentUser()) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function canSeeEmployeeInternalNote(user = currentUser()) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function canManageEmployeeMedicalExams(user = currentUser()) {
  return isFullAccessRole(user);
}

function currentEmployeeCardId() {
  return routeEmployeeId(normalizePath(window.location.pathname));
}

function employeeOptionList(selectedId) {
  return employeeCardState.employees
    .map((employee) => `
      <option value="${escapeHtml(employee.id)}" ${employee.id === selectedId ? "selected" : ""}>
        ${escapeHtml(employeeFullName(employee))}
      </option>
    `)
    .join("");
}

function normalizeAbsenceEmployeeOption(employee) {
  const id = String(employee?.id || employee?.userId || "").trim();

  if (!id) {
    return null;
  }

  return {
    id,
    name: employeeFullName(employee),
    email: employee?.email || "",
    phone: employee?.phone || "",
    role: employee?.role || "",
    department: employee?.department || "",
    team: employee?.team || employee?.department || "",
    employmentStatus: employee?.employmentStatus || "active"
  };
}

function absenceSelectableEmployees(user = currentUser()) {
  const employees = new Map();

  absenceEmployeeOptions(absenceState, user).forEach((employee) => {
    const normalized = normalizeAbsenceEmployeeOption(employee);
    if (normalized) {
      employees.set(normalized.id, normalized);
    }
  });

  employeeCardState.employees.forEach((employee) => {
    const normalized = normalizeAbsenceEmployeeOption(employee);
    if (normalized) {
      employees.set(normalized.id, normalized);
    }
  });

  return [...employees.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

function employeeManagerOptions(employee, selectedId) {
  const targetId = String(employee?.id || "").trim().toLowerCase();
  const options = employeeCardState.employees.filter((item) => (
    String(item.id || "").trim().toLowerCase() !== targetId &&
    item.employmentStatus !== "inactive"
  ));

  return [
    `<option value="" ${!selectedId ? "selected" : ""}>Bez nadřízeného</option>`,
    ...options.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>
        ${escapeHtml(employeeFullName(item))}
      </option>
    `)
  ].join("");
}

function normalizeEmployeeCardText(value) {
  return String(value ?? "").trim();
}

function normalizeEmployeeCardNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEmployeeCardFormData(data) {
  if (!data) {
    return null;
  }

  const entitlement = normalizeEmployeeCardNumber(data.vacationEntitlementDays);
  const used = normalizeEmployeeCardNumber(data.vacationUsedDays);
  const pending = normalizeEmployeeCardNumber(data.vacationPendingDays);

  return {
    firstName: normalizeEmployeeCardText(data.firstName),
    lastName: normalizeEmployeeCardText(data.lastName),
    email: normalizeEmployeeCardText(data.email).toLowerCase(),
    phone: normalizeEmployeeCardText(data.phone),
    role: normalizeRole(data.role),
    department: normalizeEmployeeCardText(data.department),
    position: normalizeEmployeeCardText(data.position),
    address: normalizeEmployeeCardText(data.address),
    workplace: normalizeEmployeeCardText(data.workplace),
    managerId: normalizeEmployeeCardText(data.managerId),
    employmentStatus: normalizeEmployeeCardText(data.employmentStatus) || "active",
    startDate: normalizeEmployeeCardText(data.startDate),
    employmentType: normalizeEmployeeCardText(data.employmentType),
    workload: normalizeEmployeeCardNumber(data.workload),
    weeklyHours: normalizeEmployeeCardNumber(data.weeklyHours),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending) ? entitlement - used - pending : 0,
    currentAbsenceStatus: normalizeEmployeeCardText(data.currentAbsenceStatus) || "v práci",
    sickDaysCurrentYear: normalizeEmployeeCardNumber(data.sickDaysCurrentYear),
    lastAbsenceDate: normalizeEmployeeCardText(data.lastAbsenceDate),
    internalNote: normalizeEmployeeCardText(data.internalNote)
  };
}

const employeeCardComparable = normalizeEmployeeCardFormData;

function employeeCardDraftFor(employee) {
  const draft = employeeCardState.formDraft;
  const employeeId = String(employee?.id || "").trim().toLowerCase();
  const draftId = String(draft?.id || "").trim().toLowerCase();

  if (!draft || !employeeId || draftId !== employeeId) {
    return employee;
  }

  return {
    ...employee,
    ...draft
  };
}

function employeeCardFormField(form, name) {
  return form.elements.namedItem?.(name) || form.querySelector(`[name="${name}"]`);
}

function employeeCardFormValue(form, name) {
  return employeeCardFormField(form, name)?.value ?? "";
}

function employeeCardFormData(form) {
  const source = employeeCardState.employee || {};
  const entitlement = Number(employeeCardFormValue(form, "vacationEntitlementDays") || 0);
  const used = Number(employeeCardFormValue(form, "vacationUsedDays") || 0);
  const pending = Number(employeeCardFormValue(form, "vacationPendingDays") || 0);
  const managerId = employeeCardFormValue(form, "managerId");
  const manager = managerId ? employeeCardState.employees.find((item) => item.id === managerId) : null;

  return {
    ...source,
    firstName: employeeCardFormValue(form, "firstName").trim(),
    lastName: employeeCardFormValue(form, "lastName").trim(),
    email: employeeCardFormValue(form, "email").trim(),
    phone: employeeCardFormValue(form, "phone").trim(),
    role: normalizeRole(employeeCardFormValue(form, "role") || source.role),
    department: employeeCardFormValue(form, "department").trim(),
    position: employeeCardFormValue(form, "position").trim(),
    address: employeeCardFormValue(form, "address").trim(),
    workplace: employeeCardFormValue(form, "workplace").trim(),
    managerId,
    managerName: managerId ? employeeFullName(manager) : "",
    employmentStatus: employeeCardFormValue(form, "employmentStatus") || "active",
    startDate: employeeCardFormValue(form, "startDate"),
    employmentType: employeeCardFormValue(form, "employmentType").trim(),
    workload: Number(employeeCardFormValue(form, "workload") || 0),
    weeklyHours: Number(employeeCardFormValue(form, "weeklyHours") || 0),
    vacationEntitlementDays: entitlement,
    vacationUsedDays: used,
    vacationPendingDays: pending,
    vacationRemainingDays: Number.isFinite(entitlement - used - pending) ? entitlement - used - pending : 0,
    currentAbsenceStatus: employeeCardFormValue(form, "currentAbsenceStatus") || "v práci",
    sickDaysCurrentYear: Number(employeeCardFormValue(form, "sickDaysCurrentYear") || 0),
    lastAbsenceDate: employeeCardFormValue(form, "lastAbsenceDate"),
    internalNote: employeeCardFormValue(form, "internalNote").trim()
  };
}

function currentEmployeeCardDirtyTarget() {
  if (!currentEmployeeCardId() || !canEditEmployeeCards()) {
    return null;
  }

  const form = document.querySelector("[data-employee-card-form]");
  if (!form || !employeeCardState.employee) {
    return null;
  }

  const current = employeeCardFormData(form);
  const baseline = employeeCardState.employee;
  const isDirty = !isSameData(employeeCardComparable(current), employeeCardComparable(baseline));

  return {
    type: "employee-card",
    form,
    current,
    baseline,
    isDirty
  };
}

function normalizeEmployeeMedicalExamFormData(data) {
  if (!data) {
    return null;
  }

  const category = normalizeMedicalExamCategory(data.category);
  const dateOfBirth = medicalExamDateValue(data.dateOfBirth);
  const lastExamDate = medicalExamDateValue(data.lastExamDate);
  const calculated = calculateMedicalExamState({ category, dateOfBirth, lastExamDate });
  const notificationEnabled = data.notificationEnabled === true ||
    data.notificationEnabled === "true" ||
    data.notificationEnabled === "1" ||
    data.notificationEnabled === "on";

  return {
    id: normalizeEmployeeCardText(data.id),
    employeeId: normalizeEmployeeCardText(data.employeeId),
    category,
    dateOfBirth,
    lastExamDate,
    requestExamType: normalizeEmployeeCardText(data.requestExamType) || "entry",
    requestCategory: normalizeMedicalExamCategory(data.requestCategory || category),
    medicalFacilityName: normalizeEmployeeCardText(data.medicalFacilityName),
    medicalDoctorName: normalizeEmployeeCardText(data.medicalDoctorName),
    medicalFacilityAddress: normalizeEmployeeCardText(data.medicalFacilityAddress),
    medicalFacilityCompanyId: normalizeEmployeeCardText(data.medicalFacilityCompanyId),
    note: normalizeEmployeeCardText(data.note),
    notificationEnabled,
    ...calculated
  };
}

function employeeMedicalExamComparable(data) {
  const normalized = normalizeEmployeeMedicalExamFormData(data);

  if (!normalized) {
    return null;
  }

  return {
    category: normalized.category,
    dateOfBirth: normalized.dateOfBirth,
    lastExamDate: normalized.lastExamDate,
    requestExamType: normalized.requestExamType,
    requestCategory: normalized.requestCategory,
    medicalFacilityName: normalized.medicalFacilityName,
    medicalDoctorName: normalized.medicalDoctorName,
    medicalFacilityAddress: normalized.medicalFacilityAddress,
    medicalFacilityCompanyId: normalized.medicalFacilityCompanyId,
    note: normalized.note,
    notificationEnabled: normalized.notificationEnabled
  };
}

function employeeMedicalExamDraftFor(employee) {
  const draft = employeeCardState.medicalExamDraft;
  const employeeId = String(employee?.id || "").trim().toLowerCase();
  const draftId = String(draft?.employeeId || "").trim().toLowerCase();

  if (!draft || !employeeId || draftId !== employeeId) {
    return employeeCardState.medicalExam || {
      employeeId: employee?.id || "",
      category: "",
      dateOfBirth: "",
      lastExamDate: "",
      requestExamType: "entry",
      requestCategory: "",
      medicalFacilityName: "",
      medicalDoctorName: "",
      medicalFacilityAddress: "",
      medicalFacilityCompanyId: "",
      note: "",
      notificationEnabled: true
    };
  }

  return {
    ...(employeeCardState.medicalExam || {}),
    ...draft
  };
}

function employeeMedicalExamFormData(form) {
  const source = employeeCardState.medicalExam || {};

  return {
    ...source,
    id: source.id || "",
    employeeId: employeeCardState.employee?.id || source.employeeId || "",
    category: employeeCardFormValue(form, "category"),
    dateOfBirth: employeeCardFormValue(form, "dateOfBirth"),
    lastExamDate: employeeCardFormValue(form, "lastExamDate"),
    requestExamType: employeeCardFormValue(form, "requestExamType"),
    requestCategory: employeeCardFormValue(form, "requestCategory"),
    medicalFacilityName: employeeCardFormValue(form, "medicalFacilityName"),
    medicalDoctorName: employeeCardFormValue(form, "medicalDoctorName"),
    medicalFacilityAddress: employeeCardFormValue(form, "medicalFacilityAddress"),
    medicalFacilityCompanyId: employeeCardFormValue(form, "medicalFacilityCompanyId"),
    note: employeeCardFormValue(form, "note"),
    notificationEnabled: employeeCardFormValue(form, "notificationEnabled") !== "false"
  };
}

function currentEmployeeMedicalExamDirtyTarget() {
  if (!currentEmployeeCardId() || !canManageEmployeeMedicalExams()) {
    return null;
  }

  const form = document.querySelector("[data-employee-medical-exam-form]");
  if (!form || !employeeCardState.employee) {
    return null;
  }

  const current = normalizeEmployeeMedicalExamFormData(employeeMedicalExamFormData(form));
  const baseline = normalizeEmployeeMedicalExamFormData(employeeCardState.medicalExam || {
    employeeId: employeeCardState.employee.id,
    notificationEnabled: true
  });
  const isDirty = !isSameData(employeeMedicalExamComparable(current), employeeMedicalExamComparable(baseline));

  return {
    type: "employee-medical-exam",
    form,
    current,
    baseline,
    isDirty
  };
}

function accessUserFormData(form, options = {}) {
  const sourceUser = findAccessUser(form?.dataset.userId) || {};
  const now = options.updatedAt || new Date().toISOString();
  const role = normalizeRole(options.role || form.elements.role.value);
  const active = Boolean(form.elements.active?.checked);

  return {
    ...sourceUser,
    id: sourceUser.id || form.dataset.userId || nextDraftUserId(),
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    role,
    department: form.elements.department.value.trim(),
    position: sourceUser.position || "",
    active,
    status: active ? "active" : "disabled",
    permissions: options.permissions || permissionsFromMatrix(form, "userperm", role),
    createdAt: sourceUser.createdAt || now,
    updatedAt: now,
    lastLoginAt: sourceUser.lastLoginAt || null
  };
}

function currentAccessUserFormTarget() {
  const form = document.querySelector("[data-access-user-form]");

  if (!form || !canEditAccessUsers()) {
    return null;
  }

  const current = accessUserFormData(form);
  const baselineUser = findSavedAccessUser(form.dataset.userId);

  return {
    type: "user",
    form,
    current,
    baseline: comparableUser(baselineUser),
    isDirty: !baselineUser || !isSameData(comparableUser(current), comparableUser(baselineUser))
  };
}

function currentAccessRoleFormTarget() {
  const form = document.querySelector("[data-access-role-form]");

  if (!form || !canManageAccessRoles()) {
    return null;
  }

  const roleId = normalizeRole(form.dataset.roleId);
  const role = accessState.roles.find((item) => item.id === roleId);

  if (!role || isFullAccessRole({ role: roleId, active: true })) {
    return null;
  }

  const current = {
    ...role,
    description: form.elements.description?.value.trim() || "",
    defaultPermissions: permissionsFromMatrix(form, "roleperm", roleId)
  };

  return {
    type: "role",
    form,
    current,
    baseline: comparableRole(role),
    isDirty: !isSameData(comparableRole(current), comparableRole(role))
  };
}

function currentAccessDirtyTarget() {
  const userTarget = currentAccessUserFormTarget();

  if (userTarget?.isDirty) {
    return userTarget;
  }

  const roleTarget = currentAccessRoleFormTarget();

  if (roleTarget?.isDirty) {
    return roleTarget;
  }

  return null;
}

function appearanceFormData(form) {
  return normalizeThemeSettings({
    paletteMode: form.elements.paletteMode.value,
    logoUrl: form.elements.logoUrl.value,
    primaryColor: form.elements.primaryColor.value,
    secondaryColor: form.elements.secondaryColor.value,
    accentColor: form.elements.accentColor.value,
    backgroundColor: form.elements.backgroundColor.value,
    cardColor: form.elements.cardColor.value,
    textColor: form.elements.textColor.value,
    mutedTextColor: form.elements.mutedTextColor.value,
    cardRadius: form.elements.cardRadius.value,
    buttonRadius: form.elements.buttonRadius.value,
    buttonStyle: form.elements.buttonStyle.value,
    backgroundStyle: form.elements.backgroundStyle.value,
    cardShadow: form.elements.cardShadow.value,
    fontFamily: form.elements.fontFamily.value
  });
}

function currentAppearanceDirtyTarget() {
  if (normalizePath(window.location.pathname) !== "/nastaveni" || !canManageAppearanceSettings()) {
    return null;
  }

  const form = document.querySelector("[data-appearance-form]");
  const current = form ? appearanceFormData(form) : themeState.draft;

  return {
    type: "appearance",
    form,
    current,
    baseline: themeState.settings,
    isDirty: !sameThemeSettings(current, themeState.settings)
  };
}

function currentAbsenceSettingsDirtyTarget() {
  if (normalizePath(window.location.pathname) !== absenceRouteForTab("settings") || !hasPermission(currentUser(), "absence", "manage")) {
    return null;
  }

  const form = document.querySelector("[data-absence-settings-form]");
  if (!form) {
    return null;
  }

  const current = absenceSettingsFormData(form);

  return {
    type: "absence-settings",
    form,
    current,
    baseline: absenceState.settings,
    isDirty: !sameAbsenceSettings(current, absenceState.settings)
  };
}

function currentFeedbackCreateDirtyTarget() {
  if (normalizePath(window.location.pathname) !== FEEDBACK_ROUTE || !feedbackCreateState.open || !canCreateCentralFeedback(currentUser())) {
    return null;
  }

  const form = document.querySelector("[data-feedback-create-form]");
  const current = form ? updateFeedbackCreateDraft(form) : feedbackCreateState.draft;

  return {
    type: "feedback-create",
    form,
    current,
    baseline: feedbackCreateDefaultDraft(),
    isDirty: feedbackCreateDraftIsDirty(current)
  };
}

function currentDirtyTarget() {
  const accessTarget = currentAccessDirtyTarget();

  if (accessTarget?.isDirty) {
    return accessTarget;
  }

  const appearanceTarget = currentAppearanceDirtyTarget();

  if (appearanceTarget?.isDirty) {
    return appearanceTarget;
  }

  const absenceSettingsTarget = currentAbsenceSettingsDirtyTarget();

  if (absenceSettingsTarget?.isDirty) {
    return absenceSettingsTarget;
  }

  const feedbackCreateTarget = currentFeedbackCreateDirtyTarget();

  if (feedbackCreateTarget?.isDirty) {
    return feedbackCreateTarget;
  }

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    return employeeTarget;
  }

  const employeeMedicalExamTarget = currentEmployeeMedicalExamDirtyTarget();

  if (employeeMedicalExamTarget?.isDirty) {
    return employeeMedicalExamTarget;
  }

  return null;
}

function discardAccessUserDraft(userId, referenceUser = null) {
  const reference = referenceUser || findAccessUser(userId) || { id: userId };
  const users = accessState.users.filter((user) => !sameAccessUserIdentity(user, reference));
  const selectedUserId = findSavedAccessUser(userId)
    ? accessState.selectedUserId
    : (adminUsersState.users[0]?.id || "");

  setAccessState({
    ...accessState,
    users,
    selectedUserId,
    message: "Neuložené změny byly zahozeny.",
    error: "",
    feedbackTarget: "user"
  });
}

function discardAccessDirtyChanges() {
  const target = currentAccessDirtyTarget();

  if (target?.type === "user") {
    discardAccessUserDraft(target.form.dataset.userId, target.current);
    render();
    return;
  }

  if (target?.type === "role") {
    setAccessState({
      ...accessState,
      message: "Neuložené změny byly zahozeny.",
      error: "",
      feedbackTarget: "role"
    });
    render();
  }
}

function discardAppearanceDirtyChanges() {
  themeState.draft = normalizeThemeSettings(themeState.settings);
  themeState.preview = null;
  themeState.message = "Neuložené změny vzhledu byly zahozeny.";
  themeState.error = "";
  render();
}

function discardAbsenceSettingsDirtyChanges() {
  setAbsenceNotice("Neuložené nastavení reportu bylo zahozeno.");
  render();
}

function roleOptions(selectedRole) {
  return orderedAccessRoles().map((role) => `
    <option value="${escapeHtml(role.id)}" ${role.id === normalizeRole(selectedRole) ? "selected" : ""}>
      ${escapeHtml(role.label || roleLabel(role.id))}
    </option>
  `).join("");
}

function activeStatusLabel(user) {
  return user?.active === false ? "Vypnutý" : "Aktivní";
}

function statusPill(user) {
  const active = user?.active !== false;
  return `<span class="access-status ${active ? "access-status--active" : "access-status--disabled"}">${activeStatusLabel(user)}</span>`;
}

function canEditManagers() {
  return isFullAccessRole(currentUser());
}

function managerLabel(user, users) {
  const managerId = String(user?.managerId || "").trim().toLowerCase();

  if (!managerId) {
    return "Bez nadřízeného";
  }

  const manager = users.find((item) => String(item.id || "").trim().toLowerCase() === managerId);
  return manager?.name || user?.managerName || "Bez nadřízeného";
}

function managerSelectOptions(targetUser, users) {
  const selectedManagerId = String(targetUser?.managerId || "");
  const targetUserId = String(targetUser?.id || "").trim().toLowerCase();
  const options = users.filter((user) => (
    user.active !== false &&
    String(user.status || "active").toLowerCase() !== "disabled" &&
    String(user.id || "").trim().toLowerCase() !== targetUserId
  ));

  return [
    `<option value="" ${!selectedManagerId ? "selected" : ""}>Bez nadřízeného</option>`,
    ...options.map((user) => {
      const selected = String(user.id || "") === selectedManagerId ? "selected" : "";
      return `<option value="${escapeHtml(user.id)}" ${selected}>${escapeHtml(user.name || user.email || "Bez jména")}</option>`;
    })
  ].join("");
}

function managerCell(user, users, editable) {
  const isSaving = String(accessManagerState.savingUserId || "") === String(user.id || "");
  const value = isSaving ? accessManagerState.pendingManagerId : String(user.managerId || "");

  if (!editable) {
    return `<span class="manager-readonly">${escapeHtml(managerLabel(user, users))}</span>`;
  }

  return `
    <label class="manager-cell">
      <select
        class="manager-select"
        aria-label="Nadřízený uživatele ${escapeHtml(user.name || user.email || "")}"
        data-access-manager-select
        data-access-manager-user="${escapeHtml(user.id)}"
        ${isSaving ? "disabled" : ""}
      >
        ${managerSelectOptions({ ...user, managerId: value }, users)}
      </select>
      ${isSaving ? '<span class="manager-cell__saving">Ukládám…</span>' : ""}
    </label>
  `;
}

function normalizeAccessSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function accessUserSearchText(user, users) {
  return normalizeAccessSearchText([
    user?.name,
    user?.email,
    user?.phone,
    user?.department,
    roleLabel(user?.role),
    activeStatusLabel(user),
    managerLabel(user, users)
  ].join(" "));
}

function userMatchesAccessSearch(user, users, normalizedQuery) {
  return !normalizedQuery || accessUserSearchText(user, users).includes(normalizedQuery);
}

function updateAccessUsersSearch(input) {
  accessUsersSearchState.query = input?.value || "";
  const panel = input?.closest("[data-access-users-panel]");
  const rows = [...(panel?.querySelectorAll("[data-access-user-row]") || [])];
  const noResultsRow = panel?.querySelector("[data-access-users-empty-search]");
  const countNode = panel?.querySelector("[data-access-users-search-count]");
  const normalizedQuery = normalizeAccessSearchText(accessUsersSearchState.query);
  let visibleCount = 0;

  rows.forEach((row) => {
    const matches = !normalizedQuery || String(row.dataset.userSearch || "").includes(normalizedQuery);
    row.hidden = !matches;

    if (matches) {
      visibleCount += 1;
    }
  });

  if (noResultsRow) {
    noResultsRow.hidden = !normalizedQuery || visibleCount > 0;
  }

  if (countNode) {
    countNode.textContent = normalizedQuery
      ? `Zobrazeno ${visibleCount} z ${rows.length}`
      : `Celkem ${rows.length}`;
  }
}

function updateModuleRulesFilters(panelOrField) {
  const panel = panelOrField?.matches?.("[data-module-rules-panel]")
    ? panelOrField
    : panelOrField?.closest("[data-module-rules-panel]");
  const rows = [...(panel?.querySelectorAll("[data-module-rules-row]") || [])];
  const noResultsRow = panel?.querySelector("[data-module-rules-empty-search]");
  const countNode = panel?.querySelector("[data-module-rules-search-count]");
  const searchInput = panel?.querySelector("[data-module-rules-search]");
  const typeSelect = panel?.querySelector("[data-module-rules-type-filter]");
  const statusSelect = panel?.querySelector("[data-module-rules-status-filter]");
  const normalizedQuery = normalizeAccessSearchText(searchInput?.value || "");
  const typeFilter = String(typeSelect?.value || "all");
  const statusFilter = String(statusSelect?.value || "all");
  let visibleCount = 0;

  moduleRulesState.searchQuery = searchInput?.value || "";
  moduleRulesState.typeFilter = typeFilter;
  moduleRulesState.statusFilter = statusFilter;

  rows.forEach((row) => {
    const matchesQuery = !normalizedQuery || String(row.dataset.moduleRulesSearchText || "").includes(normalizedQuery);
    const matchesType = typeFilter === "all" || row.dataset.moduleRulesType === typeFilter;
    const matchesStatus = statusFilter === "all" || row.dataset.moduleRulesStatus === statusFilter;
    const matches = matchesQuery && matchesType && matchesStatus;
    row.hidden = !matches;

    if (matches) {
      visibleCount += 1;
    }
  });

  if (noResultsRow) {
    noResultsRow.hidden = visibleCount > 0 || (!normalizedQuery && typeFilter === "all" && statusFilter === "all");
  }

  if (countNode) {
    countNode.textContent = normalizedQuery || typeFilter !== "all" || statusFilter !== "all"
      ? `Zobrazeno ${visibleCount} z ${rows.length} pravidel a automatizací`
      : `Celkem ${rows.length} pravidel a automatizací`;
  }
}

function updateModuleRulesSearch(input) {
  updateModuleRulesFilters(input);
}

function accessFeedbackMessage(extraClass = "", target = "") {
  const message = accessState.error || accessState.message;

  if (!message) {
    return "";
  }

  if (target && accessState.feedbackTarget && accessState.feedbackTarget !== target) {
    return "";
  }

  const toneClass = accessState.error ? "module-feedback__error" : "module-feedback__notice";
  const role = accessState.error ? "alert" : "status";
  const className = [toneClass, extraClass].filter(Boolean).join(" ");

  return `
    <p class="${className}" role="${role}" aria-live="polite">${escapeHtml(message)}</p>
  `;
}

function accessNotice() {
  return accessFeedbackMessage("access-notice");
}

function accessInlineNotice(target) {
  return accessFeedbackMessage("access-inline-notice", target);
}

function accessToast() {
  return accessFeedbackMessage("access-toast");
}

function permissionsMatrixTable({ namePrefix, permissions, roleId = "", disabled = false }) {
  const state = matrixPermissions(permissions, roleId);
  const disabledAttribute = disabled ? "disabled" : "";

  return `
    <div class="access-permissions-wrap">
      <table class="users-table access-permissions-table">
        <thead>
          <tr>
            <th>Modul</th>
            ${ACTIONS.map((action) => `<th>${escapeHtml(permissionActionLabels[action] || action)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${permissionModules.map((moduleItem) => `
            <tr>
              <td data-label="Modul">
                <strong>${escapeHtml(moduleTitleByPermissionId(moduleItem.id))}</strong>
              </td>
              ${ACTIONS.map((action) => {
                const checked = state.allows(moduleItem.id, action) ? "checked" : "";
                return `
                  <td data-label="${escapeHtml(permissionActionLabels[action] || action)}">
                    <label class="access-check" title="${escapeHtml(`${moduleTitleByPermissionId(moduleItem.id)} · ${permissionActionLabels[action] || action}`)}">
                      <input
                        type="checkbox"
                        name="${escapeHtml(`${namePrefix}-${moduleItem.id}-${action}`)}"
                        ${checked}
                        ${disabledAttribute}
                      />
                      <span></span>
                    </label>
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function upsertAccessUserInMemory(user, message = "") {
  const nextKey = accessUserKey(user);
  const nextId = String(user.id || "").trim().toLowerCase();
  const users = accessState.users.filter((item) => {
    const itemKey = accessUserKey(item);
    const itemId = String(item.id || "").trim().toLowerCase();
    return itemKey !== nextKey && itemId !== nextId;
  });

  setAccessState({
    ...accessState,
    users: [...users, user],
    selectedUserId: user.id,
    message,
    error: "",
    feedbackTarget: "user"
  });
}

function focusAccessUserEditor() {
  const editor = document.querySelector("#access-user-editor");

  if (!editor) {
    return;
  }

  try {
    editor.scrollIntoView({ block: "start", behavior: "auto" });
    editor.querySelector("input[name='name']")?.focus({ preventScroll: true });
  } catch (error) {
    console.error("smart_odpady_access_focus_failed", error);
  }
}

function currentAccessUserFormFor(userId) {
  const form = document.querySelector("[data-access-user-form]");
  const normalizedId = String(userId || "").trim().toLowerCase();

  if (!form) {
    return null;
  }

  return String(form.dataset.userId || "").trim().toLowerCase() === normalizedId ? form : null;
}

function accessUserForm(user, canEditUsers) {
  if (!user) {
    return `
      <section class="users-panel access-editor">
        <h2>Detail uživatele</h2>
        <p>Zatím tu není žádný uživatel. Přidejte prvního uživatele a nastavte mu roli.</p>
      </section>
    `;
  }

  const effectivePermissions = user.permissions?.length ? user.permissions : userDefaultPermissions(user.role);
  const disabled = canEditUsers ? "" : "disabled";
  const activeChecked = user.active !== false ? "checked" : "";
  const roleHasFullAccess = isFullAccessRole({ role: user.role, active: true });

  return `
    <section class="users-panel access-editor" id="access-user-editor" aria-labelledby="access-user-title">
      <div class="users-panel__head">
        <div>
          <h2 id="access-user-title">Detail / editace uživatele</h2>
          <p>Individuální oprávnění uživatele mají přednost před výchozí rolí.</p>
        </div>
      </div>

      <form class="access-form" data-access-user-form data-user-id="${escapeHtml(user.id)}">
        <div class="access-form-grid">
          <label>
            <span>Jméno</span>
            <input name="name" value="${escapeHtml(user.name)}" ${disabled} required />
          </label>
          <label>
            <span>E-mail</span>
            <input name="email" type="email" value="${escapeHtml(user.email)}" ${disabled} />
          </label>
          <label>
            <span>Telefon</span>
            <input name="phone" value="${escapeHtml(user.phone)}" ${disabled} />
          </label>
          <label>
            <span>Role</span>
            <select name="role" data-access-user-role ${disabled}>
              ${roleOptions(user.role)}
            </select>
          </label>
          <label>
            <span>Oddělení</span>
            <input name="department" value="${escapeHtml(user.department)}" ${disabled} />
          </label>
          <label class="access-switch">
            <input name="active" type="checkbox" ${activeChecked} ${disabled} />
            <span>Aktivní uživatel</span>
          </label>
        </div>

        ${roleHasFullAccess ? `
          <p class="permissions-note">Tato role má v testovacím režimu vždy plný přístup. Checkboxy jsou předvyplněné naplno.</p>
        ` : ""}

        <h3 class="access-subtitle">Oprávnění podle modulů</h3>
        ${permissionsMatrixTable({
          namePrefix: "userperm",
          permissions: effectivePermissions,
          roleId: user.role,
          disabled: !canEditUsers
        })}

        <div class="access-form-actions">
          ${canEditUsers ? `
            <button class="primary-action" type="submit">Uložit uživatele</button>
            <button class="secondary-link" type="button" data-access-reset-user-permissions="${escapeHtml(user.id)}">
              Použít výchozí práva role
            </button>
          ` : '<p class="permissions-note">Máte pouze čtení správy uživatelů.</p>'}
        </div>
        ${accessInlineNotice("user")}
      </form>
    </section>
  `;
}

function rolesManagementSection(canManageRoles) {
  const roles = orderedAccessRoles();
  const selectedRole = selectedAccessRole();
  const rolePermissions = selectedRole?.defaultPermissions || [];
  const roleHasFullAccess = isFullAccessRole({ role: selectedRole?.id, active: true });

  return `
    <section class="users-panel permissions-panel access-roles" aria-labelledby="access-roles-title">
      <div class="users-panel__head">
        <div>
          <h2 id="access-roles-title">Role a oprávnění</h2>
          <p>Výchozí práva role se použijí při výběru role u uživatele. Uživatel je může mít následně ručně upravená.</p>
        </div>
      </div>

      <div class="access-roles-grid">
        ${roles.map((role) => `
          <button
            class="role-card ${role.id === selectedRole?.id ? "role-card--active" : ""}"
            type="button"
            data-access-edit-role="${escapeHtml(role.id)}"
          >
            <span>${escapeHtml(role.label || roleLabel(role.id))}</span>
            <strong>${escapeHtml(role.description || "")}</strong>
          </button>
        `).join("")}
      </div>

      ${selectedRole ? `
        <form class="access-form access-role-form" data-access-role-form data-role-id="${escapeHtml(selectedRole.id)}">
          <div class="access-form-grid access-form-grid--role">
            <label>
              <span>Role</span>
              <input value="${escapeHtml(selectedRole.label || roleLabel(selectedRole.id))}" disabled />
            </label>
            <label>
              <span>Popis role</span>
              <input name="description" value="${escapeHtml(selectedRole.description || "")}" ${canManageRoles ? "" : "disabled"} />
            </label>
          </div>

          ${roleHasFullAccess ? `
            <p class="permissions-note">Admin a Management mají v testovacím režimu vždy všechna práva. Tuto plnou roli nejde omylem omezit.</p>
          ` : ""}

          ${permissionsMatrixTable({
            namePrefix: "roleperm",
            permissions: rolePermissions,
            roleId: selectedRole.id,
            disabled: !canManageRoles || roleHasFullAccess
          })}

          <div class="access-form-actions">
            ${canManageRoles && !roleHasFullAccess ? `
              <button class="primary-action" type="submit">Uložit výchozí oprávnění role</button>
            ` : roleHasFullAccess
              ? '<p class="permissions-note">Plnou roli v testovacím režimu nejde omezit.</p>'
              : '<p class="permissions-note">Výchozí oprávnění role může měnit pouze uživatel s právem spravovat uživatele.</p>'}
          </div>
          ${accessInlineNotice("role")}
        </form>
      ` : ""}
    </section>
  `;
}

function loadingPage() {
  return `
    <main class="login-shell">
      <section class="login-panel" aria-label="Načítání přihlášení">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1>${APP_NAME}</h1>
        <p class="login-subtitle">Ověřuji přihlášení...</p>
      </section>
    </main>
  `;
}

function loginPage() {
  const codeStep = authState.codeSent;
  const busy = authState.status === "submitting";
  const identifier = escapeHtml(authState.pendingIdentifier);

  return `
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="login-title">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1 id="login-title">${APP_NAME}</h1>
        <p class="login-subtitle">${LOGIN_SUBTITLE}</p>

        <form class="login-form" data-auth-form data-step="${codeStep ? "verify" : "start"}">
          <label class="form-field">
            <span>E-mail nebo telefon</span>
            <input
              name="identifier"
              type="text"
              autocomplete="username"
              inputmode="email"
              value="${identifier}"
              ${codeStep ? "readonly" : ""}
              required
            />
          </label>

          ${
            codeStep
              ? `
                <label class="form-field">
                  <span>Ověřovací kód</span>
                  <input
                    name="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="8"
                    required
                  />
                </label>
              `
              : ""
          }

          <button class="primary-action" type="submit" ${busy ? "disabled" : ""}>
            ${busy ? "Pracuji..." : codeStep ? "Přihlásit" : "Poslat ověřovací kód"}
          </button>
        </form>

        ${
          codeStep
            ? '<button class="text-action" type="button" data-change-identifier>Změnit e-mail nebo telefon</button>'
            : ""
        }

        ${authState.message ? `<p class="login-message">${escapeHtml(authState.message)}</p>` : ""}
        ${authState.error ? `<p class="login-error">${escapeHtml(authState.error)}</p>` : ""}
        ${authState.mockCode ? '<p class="login-dev-note">Vývojový kód: 123456</p>' : ""}
      </section>
    </main>
  `;
}

function homePage(user) {
  const modulesForUser = hasPermission(user, "absence", "create")
    ? [quickAbsenceMenuItem, ...menuModules(user)]
    : menuModules(user);
  const completedCount = modulesForUser.filter((moduleItem) => moduleItem.status === "HOTOVO").length;
  const cards = modulesForUser
    .map(
      (moduleItem) => `
        <a class="module-card" href="${routeHref(routeForModuleCard(moduleItem, user))}" data-link>
          <span class="module-card__media">
            <span class="module-icon">${renderModuleIcon(moduleItem)}</span>
            ${statusBadge(moduleItem)}
          </span>
          <span class="module-card__content">
            <span class="module-card__header">
              <span class="module-card__title">${moduleItem.title}</span>
            </span>
            <span class="module-card__description">${moduleItem.description}</span>
          </span>
        </a>
      `
    )
    .join("");

  return `
    <main class="app-shell module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__main">
          <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
          <h1 id="home-title">${APP_NAME}</h1>
          <p class="home-subtitle">${HOME_SUBTITLE}</p>
        </div>
        <div class="home-status" aria-label="Stav modulů">
          <span class="home-status__item">
            <span class="home-status__value">${modulesForUser.length}</span>
            <span class="home-status__label">modulů</span>
          </span>
          <span class="home-status__item">
            <span class="home-status__value">${completedCount}</span>
            <span class="home-status__label">hotový</span>
          </span>
        </div>
      </section>
      <section class="module-grid" aria-label="Hlavní moduly">
        ${cards}
      </section>
      ${VersionNewsInfo()}
      ${VersionBackupInfo()}
    </main>
  `;
}

function usersManagementSection() {
  if (adminUsersState.loading) {
    return '<section class="users-panel"><p>Načítám uživatele...</p></section>';
  }

  const user = currentUser();
  const users = allAccessUsers();
  const selectedUser = selectedAccessUser(users);
  const canEditUsers = hasPermission(user, "users", "edit") || hasPermission(user, "users", "manage");
  const canManageRoles = hasPermission(user, "users", "manage");
  const canEditManagerColumn = canEditManagers();
  const searchQuery = accessUsersSearchState.query;
  const normalizedSearchQuery = normalizeAccessSearchText(searchQuery);
  const visibleUsersCount = users.filter((userItem) => userMatchesAccessSearch(userItem, users, normalizedSearchQuery)).length;

  const rows = users
    .map(
      (user) => {
        const matchesSearch = userMatchesAccessSearch(user, users, normalizedSearchQuery);
        return `
        <tr
          class="${String(user.id) === String(selectedUser?.id) ? "users-table__row--selected" : ""}"
          data-access-user-row
          data-user-search="${escapeHtml(accessUserSearchText(user, users))}"
          ${matchesSearch ? "" : "hidden"}
        >
          <td data-label="Jméno"><strong>${escapeHtml(user.name || "Bez jména")}</strong></td>
          <td data-label="Kontakt">${stackedCell(user.email, user.phone)}</td>
          <td data-label="Role">${escapeHtml(roleLabel(user.role))}</td>
          <td data-label="Nadřízený">${managerCell(user, users, canEditManagerColumn)}</td>
          <td data-label="Stav">${statusPill(user)}</td>
          <td data-label="Poslední přihlášení">${formatDateTime(user.lastLoginAt)}</td>
          <td data-label="Akce">
            <div class="users-actions">
              <button
                class="secondary-link secondary-link--compact"
                type="button"
                data-access-edit-user="${escapeHtml(user.id)}"
                ${String(user.id) === String(selectedUser?.id) ? 'aria-current="true"' : ""}
              >
                ${String(user.id) === String(selectedUser?.id) ? "Vybráno" : "Upravit"}
              </button>
              ${canEditUsers ? (
                user.active === false
                  ? `<button class="text-action text-action--compact" type="button" data-access-enable-user="${escapeHtml(user.id)}">Zapnout</button>`
                  : `<button class="text-action text-action--compact" type="button" data-access-disable-user="${escapeHtml(user.id)}">Vypnout</button>`
              ) : ""}
            </div>
          </td>
        </tr>
      `;
      }
    )
    .join("") || `
      <tr>
        <td colspan="7">Zatím tu není žádný uživatel.</td>
      </tr>
    `;
  const emptySearchRow = users.length ? `
    <tr data-access-users-empty-search ${normalizedSearchQuery && visibleUsersCount === 0 ? "" : "hidden"}>
      <td colspan="7">Žádný uživatel neodpovídá hledání.</td>
    </tr>
  ` : "";

  return `
    ${accessNotice()}
    ${accessToast()}
    ${adminUsersState.error ? `<section class="users-panel"><p class="login-error">${escapeHtml(adminUsersState.error)}</p></section>` : ""}
    <section class="users-panel" aria-labelledby="users-title" data-access-users-panel>
      <div class="users-panel__head">
        <div>
          <h2 id="users-title">Přehled uživatelů</h2>
          <p>Vidíte role, stav účtu a možnost upravit konkrétní oprávnění. Změny se ukládají do centrální správy uživatelů.</p>
        </div>
        ${canEditUsers ? '<button class="primary-action" type="button" data-access-new-user>Přidat uživatele</button>' : ""}
      </div>
      <div class="users-search">
        <label>
          <span>Vyhledat uživatele</span>
          <input
            type="search"
            value="${escapeHtml(searchQuery)}"
            placeholder="Jméno, e-mail, telefon nebo role"
            autocomplete="off"
            data-access-users-search
          />
        </label>
        <span data-access-users-search-count>${normalizedSearchQuery ? `Zobrazeno ${visibleUsersCount} z ${users.length}` : `Celkem ${users.length}`}</span>
      </div>
      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Jméno</th>
              <th>Kontakt</th>
              <th>Role</th>
              <th>Nadřízený</th>
              <th>Stav</th>
              <th>Poslední přihlášení</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>${rows}${emptySearchRow}</tbody>
        </table>
      </div>
    </section>
    ${accessUserForm(selectedUser, canEditUsers)}
    ${rolesManagementSection(canManageRoles)}
  `;
}

function canManageAppearanceSettings(user = currentUser()) {
  return hasPermission(user, "settings", "manage");
}

function settingsManagementSection(user) {
  if (!canManageAppearanceSettings(user)) {
    return "";
  }

  return AppearanceSettingsBox({
    draftSettings: themeState.draft,
    savedSettings: themeState.settings,
    loading: themeState.loading,
    saving: themeState.saving,
    previewActive: Boolean(themeState.preview),
    message: themeState.message,
    error: themeState.error
  });
}

function formatAbsenceDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function formatAbsenceMonth(monthKey) {
  if (!monthKey) {
    return "neuvedeno";
  }

  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("cs-CZ", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function formatAbsenceDays(value) {
  const days = Number(value || 0);
  const formatted = days.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

  if (days === 1) {
    return "1 den";
  }

  if (Number.isInteger(days) && days >= 2 && days <= 4) {
    return `${formatted} dny`;
  }

  return `${formatted} dne`;
}

function formatAbsenceHours(value) {
  const hours = Number(value || 0);
  if (hours <= 0) {
    return "0 h";
  }

  return `${hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h`;
}

function isHourlyDoctorRequest(request) {
  return absenceRequestIsHourlyDoctor(request);
}

function absenceTimeRangeLabel(request) {
  return isHourlyDoctorRequest(request)
    ? `${request.startTime}-${request.endTime}`
    : "";
}

function absenceTermLabel(request) {
  if (!request) {
    return "";
  }

  if (isHourlyDoctorRequest(request)) {
    return `${formatAbsenceDate(request.dateFrom)} · ${absenceTimeRangeLabel(request)}`;
  }

  if (!request.dateTo || request.dateTo === request.dateFrom) {
    return formatAbsenceDate(request.dateFrom);
  }

  return `${formatAbsenceDate(request.dateFrom)} - ${formatAbsenceDate(request.dateTo)}`;
}

function absenceDurationLabel(request) {
  if (isHourlyDoctorRequest(request)) {
    return formatAbsenceHours(absenceRequestHours(request));
  }

  return `${formatAbsenceDays(request?.daysCount)}${request?.halfDay ? " · půlden" : ""}`;
}

function requestStatusLabel(request) {
  return request?.statusLabel || ABSENCE_API_STATUS_LABELS[request?.status] || absenceStatusLabel(request?.status) || "";
}

function requestTypeLabel(request) {
  return request?.typeLabel || ABSENCE_API_TYPE_LABELS[request?.type] || absenceTypeLabel(request?.type) || "";
}

function normalizeAbsenceRequestForUi(request) {
  const status = requestStatusLabel(request);
  const type = requestTypeLabel(request);

  return {
    ...request,
    type,
    typeLabel: type,
    status,
    statusLabel: status,
    halfDayFrom: Boolean(request?.halfDayFrom ?? request?.halfDay),
    halfDayTo: Boolean(request?.halfDayTo),
    approverUserId: request?.approverUserId || request?.approverId || request?.managerId || "",
    createdAt: request?.createdAt || request?.submittedAt || "",
    updatedAt: request?.updatedAt || request?.createdAt || ""
  };
}

function normalizedApiAbsenceRequests(requests) {
  return (Array.isArray(requests) ? requests : []).map(normalizeAbsenceRequestForUi);
}

function employeeAbsenceBalances() {
  const year = new Date().getFullYear();

  return employeeCardState.employees.map((employee) => ({
    id: `employee-balance-${employee.id}-${year}`,
    employeeId: employee.id,
    year,
    vacationEntitlementDays: employee.vacationEntitlementDays ?? null,
    vacationUsedDays: employee.vacationUsedDays ?? null,
    vacationPendingDays: employee.vacationPendingDays ?? null,
    vacationRemainingDays: employee.vacationRemainingDays ?? null,
    updatedAt: employee.updatedAt || ""
  }));
}

function absenceDisplayState() {
  return {
    ...absenceState,
    balances: employeeAbsenceBalances(),
    requests: absenceApiState.loaded
      ? normalizedApiAbsenceRequests(absenceApiState.requests)
      : []
  };
}

function absenceSubmitLabel(type) {
  if (type === "Nemoc") {
    return "Nahlásit nemoc";
  }

  if (type === "OČR") {
    return "Nahlásit OČR";
  }

  return "Odeslat žádost";
}

function quickAbsenceType(typeId = quickAbsenceState.type) {
  return QUICK_ABSENCE_TYPES.find((type) => type.id === typeId) || null;
}

function isoDateAfter(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function quickSetDate(from, to = from, halfDay = false) {
  quickAbsenceState.dateFrom = from;
  quickAbsenceState.dateTo = to || from;
  quickAbsenceState.halfDay = halfDay;
  quickAbsenceState.step = "summary";
  quickAbsenceState.error = "";
}

function quickAbsenceReset(options = {}) {
  quickAbsenceState.step = "type";
  quickAbsenceState.type = "";
  quickAbsenceState.dateMode = "";
  quickAbsenceState.dateFrom = "";
  quickAbsenceState.dateTo = "";
  quickAbsenceState.halfDay = false;
  quickAbsenceState.startTime = "09:00";
  quickAbsenceState.endTime = "11:00";
  quickAbsenceState.noteOpen = false;
  quickAbsenceState.attachmentOpen = false;
  quickAbsenceState.note = "";
  quickAbsenceState.saving = false;
  quickAbsenceState.success = false;
  quickAbsenceState.error = "";

  if (options.keepRecent !== true) {
    quickAbsenceState.recent = [];
    quickAbsenceState.recentLoaded = false;
    quickAbsenceState.recentLoading = false;
  }
}

function quickAbsenceStatusLabel(type) {
  return QUICK_ABSENCE_STATUSES[type?.status] || "";
}

function quickAbsenceDaysLabel() {
  if (quickAbsenceState.type === "doctor") {
    return formatAbsenceHours(countAbsenceHours(quickAbsenceState.startTime, quickAbsenceState.endTime));
  }

  return formatAbsenceDays(countAbsenceDays(
    quickAbsenceState.dateFrom,
    quickAbsenceState.dateTo || quickAbsenceState.dateFrom,
    quickAbsenceState.halfDay,
    false
  ));
}

function quickAbsenceDateLabel() {
  if (!quickAbsenceState.dateFrom) {
    return "";
  }

  if (quickAbsenceState.type === "doctor") {
    return `${formatAbsenceDate(quickAbsenceState.dateFrom)} · ${quickAbsenceState.startTime}-${quickAbsenceState.endTime}`;
  }

  if (quickAbsenceState.halfDay) {
    return `${formatAbsenceDate(quickAbsenceState.dateFrom)} · půl dne`;
  }

  if (!quickAbsenceState.dateTo || quickAbsenceState.dateTo === quickAbsenceState.dateFrom) {
    return formatAbsenceDate(quickAbsenceState.dateFrom);
  }

  return `${formatAbsenceDate(quickAbsenceState.dateFrom)} - ${formatAbsenceDate(quickAbsenceState.dateTo)}`;
}

function quickChoiceButton(choice) {
  return `
    <button
      class="quick-absence-choice"
      type="button"
      data-quick-date-choice="${escapeHtml(choice.id)}"
    >
      <span>${escapeHtml(choice.label)}</span>
      ${choice.hint ? `<small>${escapeHtml(choice.hint)}</small>` : ""}
    </button>
  `;
}

function quickDateChoices(type) {
  if (!type) {
    return [];
  }

  if (type.id === "vacation") {
    return [
      { id: "today", label: "1 den", hint: "dnes" },
      { id: "tomorrow", label: "Zítra", hint: "1 den" },
      { id: "two-days", label: "2 dny", hint: "ode dneška" },
      { id: "week", label: "Týden", hint: "5 dnů" },
      { id: "custom", label: "Vybrat datum" }
    ];
  }

  if (type.id === "doctor") {
    return [
      { id: "today", label: "Dnes" },
      { id: "tomorrow", label: "Zítra" },
      { id: "custom", label: "Vybrat datum" }
    ];
  }

  if (type.id === "compensatory_leave") {
    return [
      { id: "today", label: "1 den" },
      { id: "half-day", label: "Půl dne" },
      { id: "custom", label: "Vybrat datum" }
    ];
  }

  return [
    { id: "today", label: "Dnes" },
    { id: "tomorrow-open", label: "Od zítra" },
    { id: "custom", label: "Vybrat datum" }
  ];
}

function quickAbsenceTypeStep() {
  return `
    <section id="co-potrebujete" class="quick-absence-card quick-absence-card--step" aria-labelledby="quick-absence-title">
      <p class="quick-absence-kicker">Rychlé zadání</p>
      <h2 id="quick-absence-title">Co potřebujete nahlásit?</h2>
      <div class="quick-absence-types">
        ${QUICK_ABSENCE_TYPES.map((type) => `
          <button class="quick-absence-type" type="button" data-quick-type="${escapeHtml(type.id)}">
            <span class="quick-absence-type__icon" aria-hidden="true">${escapeHtml(type.marker)}</span>
            <span>${escapeHtml(type.label)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function quickAbsenceCustomDate(type) {
  if (quickAbsenceState.dateMode !== "custom" || type?.id === "doctor") {
    return "";
  }

  const today = isoDateAfter(0);
  const showRange = type?.id === "vacation" || type?.id === "care" || type?.id === "sick";

  return `
    <div class="quick-absence-custom-date">
      <label>
        <span>Od</span>
        <input type="date" value="${escapeHtml(quickAbsenceState.dateFrom || today)}" data-quick-date-from />
      </label>
      ${showRange ? `
        <label>
          <span>Do</span>
          <input type="date" value="${escapeHtml(quickAbsenceState.dateTo || quickAbsenceState.dateFrom || today)}" data-quick-date-to />
        </label>
      ` : ""}
      <button class="primary-action quick-absence-wide-action" type="button" data-quick-custom-continue>
        Pokračovat
      </button>
    </div>
  `;
}

function quickAbsenceDoctorDateTime() {
  const today = isoDateAfter(0);

  return `
    <div class="quick-absence-custom-date quick-absence-time-grid">
      <label>
        <span>Datum</span>
        <input type="date" value="${escapeHtml(quickAbsenceState.dateFrom || today)}" data-quick-date-from />
      </label>
      <label>
        <span>Čas od</span>
        <input type="time" step="1800" value="${escapeHtml(quickAbsenceState.startTime || "09:00")}" data-quick-start-time />
      </label>
      <label>
        <span>Čas do</span>
        <input type="time" step="1800" value="${escapeHtml(quickAbsenceState.endTime || "11:00")}" data-quick-end-time />
      </label>
      <p class="quick-absence-hint">Rozsah: ${escapeHtml(formatAbsenceHours(countAbsenceHours(quickAbsenceState.startTime, quickAbsenceState.endTime)))}</p>
      <button class="primary-action quick-absence-wide-action" type="button" data-quick-custom-continue>
        Pokračovat
      </button>
    </div>
  `;
}

function quickAbsenceDateStep() {
  const type = quickAbsenceType();

  if (!type) {
    return quickAbsenceTypeStep();
  }

  return `
    <section class="quick-absence-card quick-absence-card--step" aria-labelledby="quick-date-title">
      <button class="quick-absence-back" type="button" data-quick-back="type">Zpět</button>
      <p class="quick-absence-kicker">${escapeHtml(type.shortLabel)}</p>
      <h2 id="quick-date-title">Kdy?</h2>
      ${type.id === "doctor" ? quickAbsenceDoctorDateTime() : `
        <div class="quick-absence-choices">
          ${quickDateChoices(type).map(quickChoiceButton).join("")}
        </div>
      `}
      ${type.id === "sick" ? '<p class="quick-absence-hint">Nemoc od dnešního dne</p>' : ""}
      ${quickAbsenceCustomDate(type)}
      ${quickAbsenceState.error ? `<p class="quick-absence-error">${escapeHtml(quickAbsenceState.error)}</p>` : ""}
    </section>
  `;
}

function quickAbsenceOptionalFields() {
  return `
    <div class="quick-absence-options">
      <button class="quick-absence-option-toggle" type="button" data-quick-note-toggle>
        Přidat poznámku
      </button>
      ${quickAbsenceState.noteOpen ? `
        <label class="quick-absence-note">
          <span>Poznámka</span>
          <textarea rows="3" placeholder="Volitelná poznámka" data-quick-note>${escapeHtml(quickAbsenceState.note)}</textarea>
        </label>
      ` : ""}
      <button class="quick-absence-option-toggle" type="button" data-quick-attachment-toggle>
        Přidat přílohu
      </button>
      ${quickAbsenceState.attachmentOpen ? `
        <p class="quick-absence-api-note">Přílohy čekají na samostatné cloudové API.</p>
      ` : ""}
    </div>
  `;
}

function quickAbsenceSummaryStep() {
  const type = quickAbsenceType();

  if (!type) {
    return quickAbsenceTypeStep();
  }

  return `
    <section class="quick-absence-card quick-absence-card--step" aria-labelledby="quick-summary-title">
      <button class="quick-absence-back" type="button" data-quick-back="date">Zpět</button>
      <p class="quick-absence-kicker">Kontrola</p>
      <h2 id="quick-summary-title">Zkontrolujte žádost</h2>
      <div class="quick-absence-summary">
        <article>
          <span>Typ</span>
          <strong>${escapeHtml(type.shortLabel)}</strong>
        </article>
        <article>
          <span>Datum</span>
          <strong>${escapeHtml(quickAbsenceDateLabel())}</strong>
        </article>
        <article>
          <span>Rozsah</span>
          <strong>${escapeHtml(quickAbsenceDaysLabel())}</strong>
        </article>
        <article>
          <span>Stav</span>
          <strong>${escapeHtml(quickAbsenceStatusLabel(type))}</strong>
        </article>
      </div>
      ${quickAbsenceOptionalFields()}
      ${quickAbsenceState.error ? `<p class="quick-absence-error">${escapeHtml(quickAbsenceState.error)}</p>` : ""}
      <div class="quick-absence-sticky">
        <button class="primary-action quick-absence-submit" type="button" data-quick-submit ${quickAbsenceState.saving ? "disabled" : ""}>
          ${quickAbsenceState.saving ? "Odesílám…" : "Odeslat"}
        </button>
      </div>
    </section>
  `;
}

function quickAbsenceSuccessStep() {
  return `
    <section class="quick-absence-card quick-absence-card--success" aria-labelledby="quick-success-title">
      <span class="quick-absence-success-icon" aria-hidden="true">OK</span>
      <h2 id="quick-success-title">Hotovo</h2>
      <p>Žádost byla odeslána.</p>
      <button class="primary-action quick-absence-wide-action" type="button" data-quick-reset>
        Zpět na úvod
      </button>
    </section>
  `;
}

function quickAbsenceRecentCard(request) {
  const normalized = normalizeAbsenceRequestForUi(request);

  return `
    <article class="quick-absence-recent-card">
      <div>
        <strong>${escapeHtml(normalized.typeLabel || "Žádost")}</strong>
        <span>${escapeHtml(normalized.statusLabel || "")}</span>
      </div>
      <small>${escapeHtml(absenceTermLabel(normalized))}</small>
    </article>
  `;
}

function quickAbsenceRecentSection() {
  const waiting = quickAbsenceState.apiStatus !== "ready" && !quickAbsenceState.recentLoading;

  return `
    <section class="quick-absence-card quick-absence-recent" aria-labelledby="quick-recent-title">
      <h2 id="quick-recent-title">Moje poslední žádosti</h2>
      ${quickAbsenceState.recentLoading ? '<p class="quick-absence-muted">Načítám…</p>' : ""}
      ${waiting ? `<p class="quick-absence-api-note">Čeká na API: ${escapeHtml(quickAbsenceState.missingEndpoint)}</p>` : ""}
      ${!quickAbsenceState.recentLoading && !waiting && quickAbsenceState.recent.length === 0 ? '<p class="quick-absence-muted">Zatím tu nejsou žádné žádosti.</p>' : ""}
      <div class="quick-absence-recent-list">
        ${quickAbsenceState.recent.slice(0, 3).map(quickAbsenceRecentCard).join("")}
      </div>
    </section>
  `;
}

function quickAbsenceContent(user) {
  if (!hasPermission(user, "absence", "create")) {
    return permissionInlineNotice();
  }

  const content = quickAbsenceState.success
    ? quickAbsenceSuccessStep()
    : quickAbsenceState.step === "date"
      ? quickAbsenceDateStep()
      : quickAbsenceState.step === "summary"
        ? quickAbsenceSummaryStep()
        : quickAbsenceTypeStep();

  return `
    <section class="quick-absence-shell" aria-label="Rychlé zadání dovolené a nemoci">
      ${content}
      ${quickAbsenceRecentSection()}
    </section>
  `;
}

function absenceStatusBadge(status) {
  const label = ABSENCE_API_STATUS_LABELS[status] || absenceStatusLabel(status);
  const tone = ABSENCE_STATUS_TONES[label] || ABSENCE_STATUS_TONES[status] || "new";
  return `<span class="absence-badge absence-badge--${tone}">${escapeHtml(label)}</span>`;
}

function absenceTypeBadge(type) {
  const label = ABSENCE_API_TYPE_LABELS[type] || absenceTypeLabel(type);
  const tone = ABSENCE_TYPE_TONES[label] || ABSENCE_TYPE_TONES[type] || "vacation";
  return `<span class="absence-type absence-type--${tone}">${escapeHtml(label)}</span>`;
}

function canUseAbsenceTab(user, tabId) {
  if (!canViewModule(user, "absence")) {
    return false;
  }

  if (tabId === "new" || tabId === "quick") {
    return hasPermission(user, "absence", "create");
  }

  if (tabId === "approval") {
    return hasPermission(user, "absence", "approve");
  }

  if (tabId === "reports") {
    return hasPermission(user, "absence", "export");
  }

  if (tabId === "settings") {
    return hasPermission(user, "absence", "manage");
  }

  return true;
}

function absenceTabsForUser(user) {
  return ABSENCE_TABS.filter((tab) => canUseAbsenceTab(user, tab.id));
}

function resolveAbsenceTab(user, tabId) {
  return canUseAbsenceTab(user, tabId) ? tabId : "dashboard";
}

function permissionInlineNotice() {
  return `
    <section class="absence-panel">
      <p class="absence-empty">Nemáte oprávnění k této akci.</p>
    </section>
  `;
}

function absenceFilterPanel(user, mode = "calendar") {
  const employeeOptions = absenceSelectableEmployees(user).map((employee) => ({
    value: employee.id,
    label: employee.name
  }));

  return `
    <form class="absence-filters" data-absence-filter-form data-mode="${escapeHtml(mode)}">
      <label>
        <span>Typ</span>
        <select name="type" data-absence-filter>
          ${optionList(ABSENCE_TYPES, absenceUiState.typeFilter)}
        </select>
      </label>
      <label>
        <span>Zaměstnanec</span>
        <select name="employeeId" data-absence-filter>
          ${optionList(employeeOptions, absenceUiState.employeeFilter)}
        </select>
      </label>
      <label>
        <span>Měsíc</span>
        <input name="month" type="month" value="${escapeHtml(absenceUiState.monthFilter)}" data-absence-filter />
      </label>
      <button class="secondary-link absence-filter-button" type="submit">Filtrovat</button>
    </form>
  `;
}

function absenceRequestActions(request, user) {
  const approveButton = canApproveAbsence(request, user)
    ? `
        <button class="absence-icon-button absence-icon-button--approve" type="button" data-absence-approve="${escapeHtml(request.id)}" title="Schválit">
          ✓
        </button>
        <button class="absence-icon-button absence-icon-button--reject" type="button" data-absence-reject="${escapeHtml(request.id)}" title="Zamítnout">
          ×
        </button>
      `
    : "";
  const cancelButton = canCancelAbsence(request, user)
    ? `
        <button class="absence-icon-button" type="button" data-absence-cancel="${escapeHtml(request.id)}" title="Zrušit">
          Zrušit
        </button>
      `
    : "";

  return approveButton || cancelButton
    ? `<div class="absence-actions">${approveButton}${cancelButton}</div>`
    : '<span class="absence-muted">bez akce</span>';
}

function absenceApprovalCard(request, user) {
  const normalized = normalizeAbsenceRequestForUi(request);
  const isLoading = absenceUiState.actionLoadingId === normalized.id;
  const isRejecting = absenceUiState.rejectRequestId === normalized.id;
  const canApprove = canApproveAbsence(normalized, user);

  return `
    <article class="absence-approval-card">
      <div class="absence-approval-card__main">
        <div>
          <strong>${employeeNameLink(normalized.employeeId, normalized.employeeName)}</strong>
          <span>${escapeHtml(normalized.team || normalized.department || "Provoz")}</span>
        </div>
        <div>${absenceTypeBadge(normalized.type)}</div>
        <div>
          <strong>${escapeHtml(absenceTermLabel(normalized))}</strong>
          <span>${escapeHtml(absenceDurationLabel(normalized))}</span>
        </div>
        <div>${absenceStatusBadge(normalized.status)}</div>
      </div>
      <dl class="absence-approval-card__details">
        <div>
          <dt>Poznámka</dt>
          <dd>${escapeHtml(normalized.note || "bez poznámky")}</dd>
        </div>
        <div>
          <dt>Odesláno</dt>
          <dd>${escapeHtml(formatDateTime(normalized.submittedAt || normalized.createdAt))}</dd>
        </div>
        <div>
          <dt>Schvaluje</dt>
          <dd>${escapeHtml(normalized.managerName || "Bez nadřízeného")}</dd>
        </div>
      </dl>
      ${canApprove ? `
        <div class="absence-approval-card__actions">
          <button class="primary-action" type="button" data-absence-approve="${escapeHtml(normalized.id)}" ${isLoading ? "disabled" : ""}>
            ${isLoading ? "Ukládám..." : "Schválit"}
          </button>
          <button class="secondary-link" type="button" data-absence-reject-toggle="${escapeHtml(normalized.id)}" ${isLoading ? "disabled" : ""}>
            Zamítnout
          </button>
        </div>
        ${isRejecting ? `
          <div class="absence-reject-box">
            <label>
              <span>Důvod zamítnutí</span>
              <textarea rows="3" data-absence-reject-reason placeholder="Důvod je nepovinný, ale doporučený.">${escapeHtml(absenceUiState.rejectReason)}</textarea>
            </label>
            <div class="absence-approval-card__actions">
              <button class="absence-icon-button absence-icon-button--reject" type="button" data-absence-reject="${escapeHtml(normalized.id)}" ${isLoading ? "disabled" : ""}>
                ${isLoading ? "Ukládám..." : "Potvrdit zamítnutí"}
              </button>
              <button class="text-action" type="button" data-absence-reject-cancel>
                Zrušit
              </button>
            </div>
          </div>
        ` : ""}
      ` : '<p class="absence-muted">bez akce</p>'}
    </article>
  `;
}

function absenceApprovalCards(requests, user, emptyText) {
  if (absenceApiState.pendingLoading) {
    return '<p class="absence-empty">Načítám žádosti ke schválení...</p>';
  }

  if (absenceApiState.error) {
    return `<p class="module-feedback__error">${escapeHtml(absenceApiState.error)}</p>`;
  }

  if (!requests.length) {
    return `<p class="absence-empty">${emptyText}</p>`;
  }

  return `
    <div class="absence-approval-list">
      ${requests.map((request) => absenceApprovalCard(request, user)).join("")}
    </div>
  `;
}

function absenceRequestsTable(requests, user, emptyText, showActions = true) {
  if (!requests.length) {
    return `<p class="absence-empty">${emptyText}</p>`;
  }

  return `
    <div class="absence-table-wrap">
      <table class="absence-table">
        <thead>
          <tr>
            <th>Zaměstnanec</th>
            <th>Typ</th>
            <th>Termín</th>
            <th>Rozsah</th>
            <th>Stav</th>
            ${showActions ? "<th>Akce</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${requests.map((request) => `
            <tr>
              <td data-label="Zaměstnanec">
                <strong>${employeeNameLink(request.employeeId, request.employeeName)}</strong>
                <span>${escapeHtml(request.team || request.department || "Provoz")}</span>
              </td>
              <td data-label="Typ">${absenceTypeBadge(request.type)}</td>
              <td data-label="Termín">
                <strong>${escapeHtml(absenceTermLabel(request))}</strong>
                <span>${isHourlyDoctorRequest(request) ? "hodinově" : (request.halfDayFrom || request.halfDayTo ? "obsahuje půlden" : "celý den")}</span>
              </td>
              <td data-label="Rozsah">${escapeHtml(absenceDurationLabel(request))}</td>
              <td data-label="Stav">${absenceStatusBadge(request.status)}</td>
              ${showActions ? `<td data-label="Akce">${absenceRequestActions(request, user)}</td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function absenceMiniList(items, user, emptyText) {
  if (!items.length) {
    return `<p class="absence-empty">${emptyText}</p>`;
  }

  return `
    <ul class="absence-mini-list">
      ${items.map((request) => `
        <li>
          <span class="absence-mini-list__main">
            <strong>${employeeNameLink(request.employeeId, request.employeeName)}</strong>
            <span>${absenceTypeBadge(request.type)} ${absenceStatusBadge(request.status)}</span>
          </span>
          <span class="absence-mini-list__date">
            ${escapeHtml(absenceTermLabel(request))}
          </span>
        </li>
      `).join("")}
    </ul>
  `;
}

function absenceDashboard(user) {
  const displayState = absenceDisplayState();
  const summary = absenceSummary(displayState, user);
  const balance = absenceBalanceForEmployee(displayState, employeeIdForUser(user));
  const vacationRemaining = balance.vacationRemainingDays ?? "—";
  const pending = absenceApiState.pendingLoaded
    ? normalizedApiAbsenceRequests(absenceApiState.pendingRequests)
    : approvalAbsenceRequests(displayState, user);
  const quickRequestButton = hasPermission(user, "absence", "create")
    ? `<a class="primary-action" href="${routeHref(ABSENCE_QUICK_ROUTE)}" data-link>+ Rychle zadat</a>`
    : "";
  const newRequestButton = hasPermission(user, "absence", "create")
    ? '<button class="primary-action" type="button" data-absence-tab="new">Nová žádost</button>'
    : "";

  return `
    <section class="absence-dashboard" aria-label="Dashboard Dovolená / Nemoc">
      <div class="absence-kpis">
        <article class="absence-kpi">
          <span>Čeká na schválení</span>
          <strong>${summary.pendingCount}</strong>
        </article>
        <article class="absence-kpi">
          <span>Lidé mimo práci dnes</span>
          <strong>${summary.peopleOutToday.length}</strong>
        </article>
        <article class="absence-kpi">
          <span>Dovolená tento měsíc</span>
          <strong>${summary.approvedVacationThisMonth}</strong>
        </article>
        <article class="absence-kpi">
          <span>Nemoc tento měsíc</span>
          <strong>${summary.illnessThisMonth}</strong>
        </article>
        <article class="absence-kpi absence-kpi--action">
          <span>Moje zbývající dovolená</span>
          <strong>${escapeHtml(vacationRemaining)}</strong>
          <div class="absence-quick-actions">
            ${quickRequestButton}
            ${newRequestButton}
          </div>
        </article>
      </div>

      <div class="absence-panels">
        <section class="absence-panel absence-panel--approval-dashboard">
          <div class="absence-panel__head">
            <h2>Žádosti čekající na schválení</h2>
          </div>
          ${absenceRequestsTable(pending, user, "Teď tu není nic ke schválení.")}
        </section>
        <section class="absence-panel">
          <div class="absence-panel__head">
            <h2>Nadcházející nepřítomnosti</h2>
          </div>
          ${absenceMiniList(summary.upcoming, user, "Zatím nejsou naplánované žádné další nepřítomnosti.")}
        </section>
        <section class="absence-panel">
          <div class="absence-panel__head">
            <h2>Mimo práci dnes</h2>
          </div>
          ${absenceMiniList(summary.peopleOutToday, user, "Dnes podle evidence nikdo nechybí.")}
        </section>
      </div>
    </section>
  `;
}

function absenceMyRequests(user) {
  const displayState = absenceDisplayState();
  const requests = ownAbsenceRequests(displayState, user);
  const visibleLabel = canSeeAllAbsences(user)
    ? "Tady vidíte svoje žádosti. V reportech a kalendáři vidíte i ostatní."
    : "Tady vidíte svoje žádosti a hlášení.";
  const quickRequestButton = hasPermission(user, "absence", "create")
    ? `<a class="primary-action" href="${routeHref(ABSENCE_QUICK_ROUTE)}" data-link>+ Rychle zadat</a>`
    : "";
  const newRequestButton = hasPermission(user, "absence", "create")
    ? '<button class="primary-action" type="button" data-absence-tab="new">Nová žádost</button>'
    : "";

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Moje žádosti</h2>
          <p>${visibleLabel}</p>
        </div>
        <div class="absence-quick-actions">
          ${quickRequestButton}
          ${newRequestButton}
        </div>
      </div>
      ${absenceRequestsTable(requests, user, "Zatím nemáte žádnou žádost.")}
    </section>
  `;
}

function absenceNewRequest(user) {
  if (!hasPermission(user, "absence", "create")) {
    return permissionInlineNotice();
  }

  const employees = absenceSelectableEmployees(user);
  const currentEmployeeId = employeeIdForUser(user);
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: employee.name
  }));
  const substituteOptions = employees
    .filter((employee) => employee.id !== currentEmployeeId)
    .map((employee) => ({
      value: employee.id,
      label: employee.name
    }));
  const canChooseEmployee = canSubmitAbsenceForOthers(user);
  const employeeLoadingNotice = canChooseEmployee && employeeCardState.employeesLoading
    ? '<p class="absence-form__hint">Načítám úplný seznam zaměstnanců…</p>'
    : "";
  const employeeLoadError = canChooseEmployee &&
    !employeeCardState.employeesLoading &&
    !employeeCardState.employeesLoaded &&
    employeeCardState.error
    ? `<p class="module-feedback__error">${escapeHtml(employeeCardState.error)}</p>`
    : "";

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Nová žádost</h2>
          <p>Dovolená, lékař, OČR a náhradní volno jdou ke schválení. Nemoc se pouze eviduje.</p>
        </div>
      </div>
      <form class="absence-form" data-absence-request-form>
        ${employeeLoadingNotice}
        ${employeeLoadError}
        ${canChooseEmployee ? `
          <label>
            <span>Zaměstnanec</span>
            <select name="employeeId">
              ${optionList(employeeOptions, currentEmployeeId, "Vyberte zaměstnance")}
            </select>
          </label>
        ` : `<input type="hidden" name="employeeId" value="${escapeHtml(currentEmployeeId)}" />`}
        <label>
          <span>Typ nepřítomnosti</span>
          <select name="type" data-absence-type>
            ${ABSENCE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Datum od</span>
          <input name="dateFrom" type="date" value="${toIsoDate(new Date())}" data-absence-date required />
        </label>
        <div class="absence-doctor-time-fields" data-absence-doctor-time-fields hidden>
          <label>
            <span>Čas od</span>
            <input name="startTime" type="time" step="1800" value="09:00" data-absence-date />
          </label>
          <label>
            <span>Čas do</span>
            <input name="endTime" type="time" step="1800" value="11:00" data-absence-date />
          </label>
        </div>
        <label data-absence-day-field>
          <span>Datum do</span>
          <input name="dateTo" type="date" value="${toIsoDate(new Date())}" data-absence-date required />
        </label>
        <label class="absence-checkbox" data-absence-day-field>
          <input name="halfDayFrom" type="checkbox" data-absence-date />
          <span>Půlden od</span>
        </label>
        <label class="absence-checkbox" data-absence-day-field>
          <input name="halfDayTo" type="checkbox" data-absence-date />
          <span>Půlden do</span>
        </label>
        <label>
          <span>Zástup</span>
          <select name="substituteUserId">
            ${optionList(substituteOptions, "", "Bez zástupu")}
          </select>
        </label>
        <label>
          <span>Příloha</span>
          <input name="attachment" type="file" multiple />
        </label>
        <label class="absence-form__wide">
          <span>Poznámka</span>
          <textarea name="note" rows="4" placeholder="Volitelná poznámka"></textarea>
        </label>
        <div class="absence-form__summary">
          <span data-absence-duration-title>Počet dnů</span>
          <strong data-absence-days-preview>1 den</strong>
          <small data-absence-status-preview>${initialStatusForAbsenceType("Dovolená")}</small>
        </div>
        <button class="primary-action absence-form__submit" type="submit" data-absence-submit>
          ${absenceSubmitLabel("Dovolená")}
        </button>
      </form>
    </section>
  `;
}

function absenceApproval(user) {
  if (!hasPermission(user, "absence", "approve")) {
    return permissionInlineNotice();
  }

  const requests = absenceApiState.pendingLoaded
    ? normalizedApiAbsenceRequests(absenceApiState.pendingRequests)
    : [];

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Ke schválení</h2>
          <p>Schválení a zamítnutí se ukládá přes cloud API a zapisuje do historie žádosti.</p>
        </div>
      </div>
      ${absenceApprovalCards(requests, user, "Teď tu není žádná žádost ke schválení.")}
    </section>
  `;
}

function absenceCalendarDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const start = new Date(firstDay);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  start.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1
    };
  });
}

function absenceCalendar(user) {
  const displayState = absenceDisplayState();
  const requests = filterAbsenceRequests(visibleAbsenceRequests(displayState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });
  const agenda = [...requests].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const days = absenceCalendarDays(absenceUiState.monthFilter);
  const weekdays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  const today = toIsoDate(new Date());

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Kalendář</h2>
          <p>${formatAbsenceMonth(absenceUiState.monthFilter)}</p>
        </div>
      </div>
      ${absenceFilterPanel(user, "calendar")}
      <div class="absence-calendar">
        ${weekdays.map((day) => `<div class="absence-calendar__weekday">${day}</div>`).join("")}
        ${days.map((day) => {
          const dayRequests = requests.filter((request) => requestOverlapsDate(request, day.iso));
          return `
            <div class="absence-calendar__day ${day.inMonth ? "" : "absence-calendar__day--muted"} ${day.iso === today ? "absence-calendar__day--today" : ""}">
              <span class="absence-calendar__date">${day.day}</span>
              <div class="absence-calendar__events">
                ${dayRequests.slice(0, 3).map((request) => `
                  <a
                    class="absence-calendar__event absence-calendar__event--${ABSENCE_TYPE_TONES[request.type] || "vacation"}"
                    href="${routeHref(employeeCardRoute(request.employeeId))}"
                    data-link
                    title="${escapeHtml(`${request.employeeName} · ${request.type} · ${absenceTermLabel(request)}`)}"
                  >
                    ${escapeHtml(request.employeeName)} · ${escapeHtml(request.type)}${isHourlyDoctorRequest(request) ? ` · ${escapeHtml(absenceTimeRangeLabel(request))}` : ""}
                  </a>
                `).join("")}
                ${dayRequests.length > 3 ? `<span class="absence-calendar__more">+${dayRequests.length - 3}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="absence-calendar-agenda">
        <h3>Události v měsíci</h3>
        ${absenceMiniList(agenda, user, "Pro vybraný měsíc nejsou žádné nepřítomnosti.")}
      </div>
    </section>
  `;
}

function absenceReports(user) {
  if (!hasPermission(user, "absence", "export")) {
    return permissionInlineNotice();
  }

  const displayState = absenceDisplayState();
  const reportRequests = filterAbsenceRequests(visibleAbsenceRequests(displayState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });
  const totals = monthlyAbsenceTotals(reportRequests);
  const doctorHours = monthlyAbsenceDoctorHours(reportRequests);

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Reporty</h2>
          <p>Měsíční report je zatím připravený jako lokální HTML/CSV návrh bez reálného odesílání.</p>
        </div>
        <div class="absence-report-actions">
          <button class="primary-action" type="button" data-absence-generate-report>Vygenerovat měsíční report</button>
          <button class="secondary-link" type="button" data-absence-export-csv>Export CSV</button>
        </div>
      </div>
      ${absenceFilterPanel(user, "reports")}
      <div class="absence-report-grid">
        <article>
          <span>Období</span>
          <strong>${formatAbsenceMonth(absenceUiState.monthFilter)}</strong>
        </article>
        <article>
          <span>Žádostí celkem</span>
          <strong>${reportRequests.length}</strong>
        </article>
        <article>
          <span>Dovolená</span>
          <strong>${formatAbsenceDays(totals.Dovolená)}</strong>
        </article>
        <article>
          <span>Nemoc</span>
          <strong>${formatAbsenceDays(totals.Nemoc)}</strong>
        </article>
        <article>
          <span>Lékař</span>
          <strong>${formatAbsenceDays(totals.Lékař)}</strong>
        </article>
        <article>
          <span>Lékař hodiny</span>
          <strong>${formatAbsenceHours(doctorHours)}</strong>
        </article>
        <article>
          <span>OČR</span>
          <strong>${formatAbsenceDays(totals.OČR)}</strong>
        </article>
        <article>
          <span>Náhradní volno</span>
          <strong>${formatAbsenceDays(totals["Náhradní volno"])}</strong>
        </article>
        <article>
          <span>Čekající žádosti</span>
          <strong>${reportRequests.filter((request) => request.status === "Čeká na schválení").length}</strong>
        </article>
      </div>
      ${absenceRequestsTable(reportRequests, user, "Pro vybrané období nejsou žádné záznamy.", false)}
      <div class="absence-report-history">
        <h3>Historie vygenerovaných reportů</h3>
        ${absenceState.reports.length ? `
          <ul>
            ${absenceState.reports.slice(0, 8).map((report) => `
              <li>
                <strong>${String(report.periodMonth).padStart(2, "0")}/${report.periodYear}</strong>
                <span>${escapeHtml(report.recipientEmail)} · ${escapeHtml(report.status)}</span>
                <small>${formatDateTime(report.generatedAt)}</small>
              </li>
            `).join("")}
          </ul>
        ` : '<p class="absence-empty">Zatím nebyl vygenerovaný žádný report.</p>'}
      </div>
    </section>
  `;
}

const MODULE_RULE_STATUS_LABELS = {
  active: "Aktivní",
  inactive: "Neaktivní",
  draft: "Návrh",
  error: "Chyba"
};

const MODULE_RULE_TYPE_LABELS = {
  rule: "Pravidlo",
  automation: "Automatizace"
};

const MODULE_RULE_TRIGGER_LABELS = {
  manual: "Ručně",
  time: "Časově",
  event: "Událostí",
  webhook: "Webhookem"
};

function moduleRuleStatusLabel(status) {
  return MODULE_RULE_STATUS_LABELS[String(status || "").trim()] || status || "-";
}

function moduleRuleTypeLabel(type) {
  return MODULE_RULE_TYPE_LABELS[String(type || "").trim()] || type || "-";
}

function moduleRuleTriggerLabel(triggerType) {
  return MODULE_RULE_TRIGGER_LABELS[String(triggerType || "").trim()] || triggerType || "-";
}

function moduleRuleUserLabel(userId) {
  const cleaned = String(userId || "").trim();
  if (!cleaned) {
    return "-";
  }

  if (cleaned === "migration-0015") {
    return "Migrace 0015";
  }

  const user = adminUsersState.users.find((item) => String(item.id || "").trim() === cleaned) ||
    accessState.users.find((item) => String(item.id || "").trim() === cleaned);
  return user?.name || cleaned;
}

function moduleRuleJsonPreview(value) {
  if (!value) {
    return "{}";
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function moduleRulesAutomationSearchText(item) {
  return normalizeAccessSearchText([
    item.title,
    item.description,
    moduleRuleTypeLabel(item.type),
    moduleRuleStatusLabel(item.status),
    item.moduleKey,
    item.cloudRunner,
    item.lastRunStatus,
    item.lastRunMessage,
    item.actionsJson,
    item.conditionsJson
  ].join(" "));
}

function moduleRulesAutomationMatchesFilters(item) {
  const searchText = moduleRulesAutomationSearchText(item);
  const normalizedQuery = normalizeAccessSearchText(moduleRulesState.searchQuery || "");
  const typeFilter = moduleRulesState.typeFilter || "all";
  const statusFilter = moduleRulesState.statusFilter || "all";

  return (
    (!normalizedQuery || searchText.includes(normalizedQuery)) &&
    (typeFilter === "all" || item.type === typeFilter) &&
    (statusFilter === "all" || item.status === statusFilter)
  );
}

function moduleAutomationRunStatusLabel(status) {
  const labels = {
    dry_run: "Dry-run",
    skipped: "Přeskočeno",
    error: "Chyba",
    success: "OK"
  };

  return labels[status] || status || "-";
}

function moduleAutomationRunnerRunStatusLabel(status) {
  const labels = {
    running: "Běží",
    dry_run: "Dry-run",
    skipped: "Přeskočeno",
    partial_error: "Částečná chyba",
    error: "Chyba"
  };

  return labels[status] || status || "-";
}

function moduleAutomationRunSummary() {
  const runs = moduleRulesState.automationRuns || [];
  const latestRun = runs[0] || null;

  return {
    total: runs.length,
    dryRun: runs.filter((item) => item.status === "dry_run").length,
    skipped: runs.filter((item) => item.status === "skipped").length,
    error: runs.filter((item) => item.status === "error").length,
    latestRunAt: latestRun?.finishedAt || latestRun?.startedAt || ""
  };
}

function moduleAutomationRunnerRunSummary() {
  const runs = moduleRulesState.automationRunnerRuns || [];
  const latestRun = runs[0] || null;

  return {
    total: runs.length,
    latestRun,
    latestRunAt: latestRun?.finishedAt || latestRun?.startedAt || "",
    latestStatus: latestRun?.status || "",
    rulesTotal: Number(latestRun?.rulesTotal || 0),
    dryRunCount: Number(latestRun?.dryRunCount || 0),
    skippedCount: Number(latestRun?.skippedCount || 0),
    failedCount: Number(latestRun?.failedCount || 0)
  };
}

function moduleAutomationRunsForRule(ruleId) {
  return (moduleRulesState.automationRuns || [])
    .filter((item) => item.ruleId === ruleId)
    .slice(0, 5);
}

function moduleRuleFormDraft() {
  const existing = moduleRulesState.rules.find((item) => item.id === moduleRulesState.editingId);
  if (existing) {
    return existing;
  }

  const type = moduleRulesState.formType === "automation" ? "automation" : "rule";
  return {
    id: "",
    title: "",
    description: "",
    type,
    status: "draft",
    conditionsJson: "{}",
    actionsJson: "{}",
    isAutomation: type === "automation",
    triggerType: type === "automation" ? "time" : "manual",
    scheduleCron: "",
    eventName: "",
    cloudRunner: type === "automation" ? "phase2-cloud-cron" : ""
  };
}

function moduleRuleForm(canManage) {
  if (!canManage || !moduleRulesState.formOpen) {
    return "";
  }

  const item = moduleRuleFormDraft();
  const isEditing = Boolean(item.id);
  const disabled = moduleRulesState.saving ? "disabled" : "";

  return `
    <form class="module-rules-form absence-form" data-module-rule-form data-rule-id="${escapeHtml(item.id || "")}">
      <div class="module-rules-form__head">
        <div>
          <h3>${isEditing ? "Upravit pravidlo / automatizaci" : "Nové pravidlo / automatizace"}</h3>
          <p>Ukládá se do cloud DB přes backend API. Automatizace se ve Fázi 1 ještě nespouští.</p>
        </div>
        <button class="secondary-link" type="button" data-module-rule-form-close ${disabled}>Zavřít</button>
      </div>
      <label>
        <span>Název</span>
        <input name="title" value="${escapeHtml(item.title)}" required ${disabled} />
      </label>
      <label>
        <span>Popis</span>
        <textarea name="description" rows="3" ${disabled}>${escapeHtml(item.description)}</textarea>
      </label>
      <label>
        <span>Typ</span>
        <select name="type" ${disabled}>
          <option value="rule" ${item.type === "rule" ? "selected" : ""}>Pravidlo</option>
          <option value="automation" ${item.type === "automation" ? "selected" : ""}>Automatizace</option>
        </select>
      </label>
      <label>
        <span>Stav</span>
        <select name="status" ${disabled}>
          <option value="draft" ${item.status === "draft" ? "selected" : ""}>Návrh</option>
          <option value="active" ${item.status === "active" ? "selected" : ""}>Aktivní</option>
          <option value="inactive" ${item.status === "inactive" ? "selected" : ""}>Neaktivní</option>
          <option value="error" ${item.status === "error" ? "selected" : ""}>Chyba</option>
        </select>
      </label>
      <label>
        <span>Spouštění</span>
        <select name="triggerType" ${disabled}>
          <option value="manual" ${item.triggerType === "manual" ? "selected" : ""}>Ručně</option>
          <option value="time" ${item.triggerType === "time" ? "selected" : ""}>Časově</option>
          <option value="event" ${item.triggerType === "event" ? "selected" : ""}>Událostí</option>
          <option value="webhook" ${item.triggerType === "webhook" ? "selected" : ""}>Webhookem</option>
        </select>
      </label>
      <label>
        <span>Cron / plán</span>
        <input name="scheduleCron" value="${escapeHtml(item.scheduleCron)}" placeholder="např. 0 6 * * *" ${disabled} />
      </label>
      <label>
        <span>Událost</span>
        <input name="eventName" value="${escapeHtml(item.eventName)}" placeholder="např. absence_request_decided" ${disabled} />
      </label>
      <label>
        <span>Cloud runner</span>
        <input name="cloudRunner" value="${escapeHtml(item.cloudRunner)}" placeholder="phase2-cloud-cron" ${disabled} />
      </label>
      <label class="employee-card-field--wide">
        <span>Podmínky JSON</span>
        <textarea name="conditionsJson" rows="5" ${disabled}>${escapeHtml(moduleRuleJsonPreview(item.conditionsJson || item.conditions))}</textarea>
      </label>
      <label class="employee-card-field--wide">
        <span>Akce JSON</span>
        <textarea name="actionsJson" rows="5" ${disabled}>${escapeHtml(moduleRuleJsonPreview(item.actionsJson || item.actions))}</textarea>
      </label>
      <label class="employee-card-field--wide">
        <span>Poznámka do audit logu</span>
        <input name="auditNote" value="" placeholder="${isEditing ? "Úprava pravidla" : "Vytvoření pravidla"}" ${disabled} />
      </label>
      <div class="module-rules-form__actions">
        <button class="primary-action" type="submit" ${disabled}>${moduleRulesState.saving ? "Ukládám..." : isEditing ? "Uložit změny" : "Vytvořit"}</button>
        <button class="secondary-link" type="button" data-module-rule-form-close ${disabled}>Zrušit</button>
      </div>
    </form>
  `;
}

function moduleRulesAutomationRow(item, canManage) {
  const searchText = moduleRulesAutomationSearchText(item);
  const hidden = moduleRulesAutomationMatchesFilters(item) ? "" : " hidden";
  const trigger = [
    moduleRuleTriggerLabel(item.triggerType),
    item.scheduleCron || item.eventName || item.cloudRunner
  ].filter(Boolean).join(" / ");
  const impact = item.isAutomation
    ? "Cloud dry-run bez ostrých akcí"
    : "Backend/cloud pravidlo";
  const actionCell = canManage
    ? `
      <div class="module-rules-row-actions">
        <button class="secondary-link" type="button" data-module-rule-select="${escapeHtml(item.id)}">Detail</button>
        <button class="secondary-link" type="button" data-module-rule-edit="${escapeHtml(item.id)}">Upravit</button>
        <button class="secondary-link" type="button" data-module-rule-toggle="${escapeHtml(item.id)}" data-next-status="${item.status === "active" ? "inactive" : "active"}">
          ${item.status === "active" ? "Deaktivovat" : "Aktivovat"}
        </button>
      </div>
    `
    : '<span class="module-rules-readonly">Read-only</span>';

  return `
    <tr data-module-rules-row data-module-rules-search-text="${escapeHtml(searchText)}" data-module-rules-type="${escapeHtml(item.type)}" data-module-rules-status="${escapeHtml(item.status)}" data-rule-id="${escapeHtml(item.id)}"${hidden}>
      <td>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.description)}</small>
      </td>
      <td>${escapeHtml(moduleRuleTypeLabel(item.type))}</td>
      <td>${escapeHtml(item.moduleKey === "absence" ? "Dovolená / Nemoc" : item.moduleKey)}</td>
      <td><span class="module-rules-status-chip module-rules-status-chip--${escapeHtml(item.status)}">${escapeHtml(moduleRuleStatusLabel(item.status))}</span></td>
      <td>${escapeHtml(trigger || "-")}</td>
      <td>${escapeHtml(formatDateTime(item.lastRunAt) || "-")}</td>
      <td>${escapeHtml(formatDateTime(item.nextRunAt) || "-")}</td>
      <td>${escapeHtml(moduleRuleUserLabel(item.createdByUserId))}</td>
      <td>${escapeHtml(moduleRuleUserLabel(item.updatedByUserId))}</td>
      <td>${escapeHtml(item.lastRunMessage || impact)}</td>
      <td>${actionCell}</td>
    </tr>
  `;
}

function moduleRuleDetail() {
  const selected = moduleRulesState.rules.find((item) => item.id === moduleRulesState.selectedId) || moduleRulesState.rules[0];
  if (!selected) {
    return `
      <section class="module-rules-detail" aria-labelledby="module-rules-detail-title">
        <h3 id="module-rules-detail-title">Detail pravidla / automatizace</h3>
        <p>Zatím není vybrané žádné pravidlo.</p>
      </section>
    `;
  }

  const auditRows = moduleRulesState.auditLog.length
    ? moduleRulesState.auditLog.map((item) => `
      <li>
        <strong>${escapeHtml(item.action)}</strong>
        <span>${escapeHtml(formatDateTime(item.changedAt))} · ${escapeHtml(moduleRuleUserLabel(item.changedByUserId))}</span>
        ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
      </li>
    `).join("")
    : '<li><span>Audit log se načte po výběru detailu nebo po změně pravidla.</span></li>';
  const automationRuns = moduleAutomationRunsForRule(selected.id);
  const runRows = automationRuns.length
    ? automationRuns.map((item) => `
      <li>
        <strong>${escapeHtml(moduleAutomationRunStatusLabel(item.status))}</strong>
        <span>${escapeHtml(formatDateTime(item.finishedAt || item.startedAt) || "-")} · ${escapeHtml(item.triggeredBy || "-")}</span>
        <small>${escapeHtml(item.message || "Bez zprávy")}</small>
      </li>
    `).join("")
    : '<li><span>Zatím není zapsaný žádný dry-run běh pro toto pravidlo.</span></li>';

  return `
    <section class="module-rules-detail" aria-labelledby="module-rules-detail-title">
      <div>
        <h3 id="module-rules-detail-title">${escapeHtml(selected.title)}</h3>
        <p>${escapeHtml(selected.description || "Bez popisu")}</p>
      </div>
      <div class="module-rules-detail-grid">
        <article>
          <span>Typ</span>
          <strong>${escapeHtml(moduleRuleTypeLabel(selected.type))}</strong>
        </article>
        <article>
          <span>Stav</span>
          <strong>${escapeHtml(moduleRuleStatusLabel(selected.status))}</strong>
        </article>
        <article>
          <span>Spouštění</span>
          <strong>${escapeHtml(moduleRuleTriggerLabel(selected.triggerType))}</strong>
        </article>
        <article>
          <span>Cloud runner</span>
          <strong>${escapeHtml(selected.cloudRunner || "Fáze 2")}</strong>
        </article>
      </div>
      <div class="module-rules-json-grid">
        <pre>${escapeHtml(moduleRuleJsonPreview(selected.conditionsJson || selected.conditions))}</pre>
        <pre>${escapeHtml(moduleRuleJsonPreview(selected.actionsJson || selected.actions))}</pre>
      </div>
      <div class="module-rules-audit">
        <h4>Audit změn</h4>
        <ul>${auditRows}</ul>
      </div>
      <div class="module-rules-runs">
        <h4>Log běhů automatizace</h4>
        <ul>${runRows}</ul>
      </div>
    </section>
  `;
}

function moduleRulesAutomationPanel({
  moduleKey,
  moduleName,
  user,
  description = "",
  cloudNote = ""
}) {
  const canManage = hasPermission(user, moduleKey, "manage") || isFullAccessRole(user);
  const statusLabel = moduleRulesState.loading
    ? "Načítám cloud API"
    : moduleRulesState.apiStatus === "ready"
      ? "Cloud API aktivní"
      : "Cloud API nedostupné";
  const statusClass = moduleRulesState.apiStatus === "ready" ? "employee-card-status--ready" : "employee-card-status--waiting";
  const rules = moduleRulesState.rules;
  const visibleRulesCount = rules.filter(moduleRulesAutomationMatchesFilters).length;
  const filtersActive = Boolean(
    normalizeAccessSearchText(moduleRulesState.searchQuery || "") ||
    moduleRulesState.typeFilter !== "all" ||
    moduleRulesState.statusFilter !== "all"
  );
  const automationCount = rules.filter((item) => item.isAutomation || item.type === "automation").length;
  const activeCount = rules.filter((item) => item.status === "active").length;
  const runSummary = moduleAutomationRunSummary();
  const runnerSummary = moduleAutomationRunnerRunSummary();
  const latestRunnerRun = runnerSummary.latestRun;
  const runnerStatusLabel = moduleAutomationRunnerRunStatusLabel(runnerSummary.latestStatus);
  const rows = rules.length
    ? rules.map((item) => moduleRulesAutomationRow(item, canManage)).join("")
    : `<tr><td colspan="11">${moduleRulesState.loading ? "Načítám ostrá cloud data..." : "Žádná ostrá pravidla nejsou uložená v cloud DB."}</td></tr>`;

  return `
    <section class="module-rules-panel absence-panel" aria-labelledby="module-rules-title" data-module-rules-panel>
      <div class="absence-panel__head">
        <div>
          <h2 id="module-rules-title">Seznam pravidel a automatizace</h2>
          <p>${escapeHtml(description || `Ostrá cloud evidence pravidel a automatizací modulu ${moduleName}.`)}</p>
        </div>
        <span class="employee-card-status ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>

      ${moduleRulesState.message ? `<p class="module-feedback__notice">${escapeHtml(moduleRulesState.message)}</p>` : ""}
      ${moduleRulesState.error ? `<p class="module-feedback__error">${escapeHtml(moduleRulesState.error)}</p>` : ""}

      <div class="module-rules-toolbar" aria-label="Filtry pravidel a automatizací">
        <label class="module-rules-search">
          <span>Vyhledávání</span>
          <input type="search" placeholder="Název, popis, modul, typ, stav, autor nebo poznámka" value="${escapeHtml(moduleRulesState.searchQuery)}" data-module-rules-search />
        </label>
        <label>
          <span>Typ</span>
          <select data-module-rules-type-filter>
            <option value="all"${moduleRulesState.typeFilter === "all" ? " selected" : ""}>Vše</option>
            <option value="rule"${moduleRulesState.typeFilter === "rule" ? " selected" : ""}>Pravidlo</option>
            <option value="automation"${moduleRulesState.typeFilter === "automation" ? " selected" : ""}>Automatizace</option>
          </select>
        </label>
        <label>
          <span>Stav</span>
          <select data-module-rules-status-filter>
            <option value="all"${moduleRulesState.statusFilter === "all" ? " selected" : ""}>Vše</option>
            <option value="active"${moduleRulesState.statusFilter === "active" ? " selected" : ""}>Aktivní</option>
            <option value="inactive"${moduleRulesState.statusFilter === "inactive" ? " selected" : ""}>Neaktivní</option>
            <option value="draft"${moduleRulesState.statusFilter === "draft" ? " selected" : ""}>Návrh</option>
            <option value="error"${moduleRulesState.statusFilter === "error" ? " selected" : ""}>Chyba</option>
          </select>
        </label>
      </div>

      ${canManage ? `
        <div class="module-rules-actions">
          <button class="primary-action" type="button" data-module-rule-new="rule" ${moduleRulesState.saving ? "disabled" : ""}>Nové pravidlo</button>
          <button class="secondary-link" type="button" data-module-rule-new="automation" ${moduleRulesState.saving ? "disabled" : ""}>Nová automatizace</button>
        </div>
      ` : ""}

      ${moduleRuleForm(canManage)}

      <div class="module-rules-status-grid">
        <article>
          <span>Zdroj pravdy</span>
          <strong>Cloud API / backend</strong>
        </article>
        <article>
          <span>Pravidla</span>
          <strong>${rules.length - automationCount}</strong>
        </article>
        <article>
          <span>Automatizace</span>
          <strong>${automationCount}</strong>
        </article>
        <article>
          <span>Aktivní</span>
          <strong>${activeCount}</strong>
        </article>
        <article>
          <span>Pravidlové běhy</span>
          <strong>${runSummary.total}</strong>
        </article>
        <article>
          <span>Poslední pravidlový běh</span>
          <strong>${escapeHtml(formatDateTime(runSummary.latestRunAt) || "čeká")}</strong>
        </article>
        <article>
          <span>Poslední spuštění runneru</span>
          <strong>${escapeHtml(formatDateTime(runnerSummary.latestRunAt) || "čeká")}</strong>
        </article>
        <article>
          <span>Stav runneru</span>
          <strong>${escapeHtml(runnerSummary.latestStatus ? runnerStatusLabel : "čeká")}</strong>
        </article>
        <article>
          <span>rules_total</span>
          <strong>${runnerSummary.rulesTotal}</strong>
        </article>
        <article>
          <span>dry_run_count</span>
          <strong>${runnerSummary.dryRunCount}</strong>
        </article>
        <article>
          <span>skipped_count</span>
          <strong>${runnerSummary.skippedCount}</strong>
        </article>
        <article>
          <span>failed_count</span>
          <strong>${runnerSummary.failedCount}</strong>
        </article>
      </div>

      <div class="module-rules-empty module-rules-empty--cloud" role="status">
        <strong>${moduleRulesState.apiStatus === "ready" ? "Ostrá pravidla jsou načtená z cloud DB." : "Cloud API pro pravidla není dostupné."}</strong>
        <span>${escapeHtml(cloudNote || "Cloudový runner spouští automatizace pouze v bezpečném režimu podle nastavení modulu. Ostré akce musí být výslovně povolené další fází.")}</span>
        ${latestRunnerRun ? `
          <small>
            Poslední audit runneru: ${escapeHtml(runnerStatusLabel)}
            · ${escapeHtml(latestRunnerRun.triggeredBy || "-")}
            · ${escapeHtml(latestRunnerRun.d1Binding || "SMART_ODPADY_DB")}
            ${latestRunnerRun.databaseName ? `→ ${escapeHtml(latestRunnerRun.databaseName)}` : ""}
            ${latestRunnerRun.message ? `· ${escapeHtml(latestRunnerRun.message)}` : ""}
          </small>
        ` : ""}
      </div>

      <p class="module-rules-search-count" data-module-rules-search-count>${filtersActive ? `Zobrazeno ${visibleRulesCount} z ${rules.length}` : `Celkem ${rules.length}`} pravidel a automatizací</p>

      <div class="module-rules-table-wrap" aria-label="Seznam pravidel a automatizací">
        <table class="module-rules-table">
          <thead>
            <tr>
              <th>Název</th>
              <th>Typ</th>
              <th>Modul</th>
              <th>Stav</th>
              <th>Spouštění</th>
              <th>Poslední běh</th>
              <th>Další běh</th>
              <th>Vytvořil</th>
              <th>Upravil</th>
              <th>Dopad</th>
              <th>Akce</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr data-module-rules-empty-search${filtersActive && visibleRulesCount === 0 ? "" : " hidden"}>
              <td colspan="11">Žádné pravidlo nebo automatizace neodpovídá hledání.</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${moduleRuleDetail()}
    </section>
  `;
}

function absenceRulesAutomation(user) {
  ensureModuleRulesData("absence");
  return moduleRulesAutomationPanel({
    moduleKey: "absence",
    moduleName: "Dovolená / Nemoc",
    user
  });
}

function absenceSettings(user) {
  if (!hasPermission(user, "absence", "manage")) {
    return permissionInlineNotice();
  }

  const settings = absenceState.settings;
  const apiStatus = absenceSettingsState.apiStatus === "ready" ? "API aktivní" : "Čeká na API";
  const disabled = absenceSettingsState.saving ? "disabled" : "";

  return `
    <section class="absence-panel">
      <div class="absence-panel__head">
        <div>
          <h2>Nastavení</h2>
          <p>Měsíční report se ukládá přes cloud API. Reálné e-maily se bez potvrzení neposílají.</p>
        </div>
        <span class="employee-card-status ${absenceSettingsState.apiStatus === "ready" ? "employee-card-status--ready" : "employee-card-status--waiting"}">${apiStatus}</span>
      </div>
      ${absenceSettingsState.error ? `<p class="module-feedback__error">${escapeHtml(absenceSettingsState.error)}</p>` : ""}
      <form class="absence-form absence-form--settings" data-absence-settings-form>
        <label>
          <span>Příjemce reportu</span>
          <input name="recipientEmail" type="email" value="${escapeHtml(settings.recipientEmail || ABSENCE_REPORT_EMAIL)}" ${disabled} />
        </label>
        <label>
          <span>Den v měsíci</span>
          <input name="reportDay" type="number" min="1" max="28" value="${escapeHtml(settings.reportDay || ABSENCE_REPORT_DAY)}" ${disabled} />
        </label>
        <label>
          <span>Čas</span>
          <input name="reportTime" type="time" value="${escapeHtml(settings.reportTime || ABSENCE_REPORT_TIME)}" ${disabled} />
        </label>
        <label>
          <span>E-mail provider</span>
          <input name="emailProvider" value="${escapeHtml(settings.emailProvider || "")}" placeholder="nenastaveno" ${disabled} />
        </label>
        <div class="absence-module-note">
          <strong>Plán:</strong> 1× měsíčně v ${escapeHtml(settings.reportTime || ABSENCE_REPORT_TIME)} odeslat report za předchozí měsíc na ${escapeHtml(settings.recipientEmail || ABSENCE_REPORT_EMAIL)}.
        </div>
        <button class="primary-action absence-form__submit" type="submit" ${disabled}>
          ${absenceSettingsState.saving ? "Ukládám..." : "Uložit nastavení"}
        </button>
      </form>
    </section>
  `;
}

function employeeCardApiBadge() {
  return employeeCardState.apiStatus === "ready"
    ? '<span class="employee-card-status employee-card-status--ready">API aktivní</span>'
    : '<span class="employee-card-status employee-card-status--waiting">Čeká na API</span>';
}

function employeeCardKpis(employee) {
  const balance = employeeCardState.vacationBalance || employee;
  const absence = employeeCardState.absence || {};

  return `
    <div class="employee-card-kpis" aria-label="Přehled zaměstnance">
      <article class="employee-card-kpi">
        <span>Zbývá dovolené</span>
        <strong>${escapeHtml(formatAbsenceDays(balance.vacationRemainingDays ?? employee.vacationRemainingDays ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Čeká na schválení</span>
        <strong>${escapeHtml(formatAbsenceDays(balance.vacationPendingDays ?? employee.vacationPendingDays ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Nemoc tento rok</span>
        <strong>${escapeHtml(formatAbsenceDays(absence.sickDaysCurrentYear ?? employee.sickDaysCurrentYear ?? 0))}</strong>
      </article>
      <article class="employee-card-kpi">
        <span>Aktuální stav</span>
        <strong>${escapeHtml(absence.status || employee.currentAbsenceStatus || "v práci")}</strong>
      </article>
    </div>
  `;
}

function employeeCardField(label, content) {
  return `
    <label class="employee-card-field">
      <span>${escapeHtml(label)}</span>
      ${content}
    </label>
  `;
}

function employeeCardInput(name, value, options = {}) {
  const type = options.type || "text";
  const step = options.step ? `step="${escapeHtml(options.step)}"` : "";
  const min = options.min !== undefined ? `min="${escapeHtml(options.min)}"` : "";
  const disabled = options.disabled ? "disabled" : "";

  return `<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}" ${step} ${min} ${disabled} />`;
}

function employeeCardSelect(name, options, selected, disabled = false, extraAttributes = "") {
  const disabledAttribute = disabled ? "disabled" : "";

  return `
    <select name="${escapeHtml(name)}" ${disabledAttribute} ${extraAttributes}>
      ${options.map((option) => {
        const value = option.value ?? option;
        const label = option.label ?? option;
        return `
          <option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>
            ${escapeHtml(label)}
          </option>
        `;
      }).join("")}
    </select>
  `;
}

function employeeCardReadonlyValue(label, value) {
  return `
    <div class="employee-card-readonly">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "neuvedeno")}</strong>
    </div>
  `;
}

function employeeMedicalExamStatusBadge(state) {
  const tone = state?.statusTone || "waiting";
  const label = state?.statusLabel || "Chybí údaje";

  return `<span class="employee-medical-exam-status employee-medical-exam-status--${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function employeeMedicalExamDateLabel(value, fallback = "neuvedeno") {
  return formatMedicalExamDate(value) || fallback;
}

function employeeMedicalExamAgeLabel(state) {
  if (state?.age === null || state?.age === undefined) {
    return state?.ageGroupLabel || "Nelze určit – chybí datum narození";
  }

  return `${state.age} let · ${state.ageGroupLabel || "neuvedeno"}`;
}

function employeeMedicalExamSection(employee, canEdit) {
  if (!canManageEmployeeMedicalExams()) {
    return "";
  }

  const exam = normalizeEmployeeMedicalExamFormData(employeeMedicalExamDraftFor(employee) || {
    employeeId: employee.id,
    notificationEnabled: true
  });
  const disabled = !canEdit || employeeCardState.medicalExamSaving;
  const nextExamLabel = exam.nextExamDate
    ? employeeMedicalExamDateLabel(exam.nextExamDate)
    : (exam.missingReason || "neuvedeno");
  const categoryOptions = [
    { value: "", label: "Vyberte kategorii" },
    ...MEDICAL_EXAM_CATEGORY_OPTIONS
  ];
  const requestUrl = apiHref(`/api/employees/${encodeURIComponent(employee.id)}/medical-exam-request`);

  return `
    <section class="employee-card-section employee-card-section--wide employee-medical-exam-section" aria-labelledby="employee-medical-exam-title">
      <div class="employee-card-section__head">
        <div>
          <h2 id="employee-medical-exam-title">Lékařské prohlídky</h2>
          <p>Chráněná evidence pracovnělékařských prohlídek a hlídání dalších termínů.</p>
        </div>
        <div class="employee-medical-exam-status-group">
          ${employeeMedicalExamStatusBadge(exam)}
          <span class="employee-card-status ${employeeCardState.medicalExamApiStatus === "ready" ? "employee-card-status--ready" : "employee-card-status--waiting"}">
            ${employeeCardState.medicalExamApiStatus === "ready" ? "API aktivní" : "Čeká na API"}
          </span>
        </div>
      </div>

      ${employeeCardState.medicalExamMessage ? `<p class="module-feedback__notice">${escapeHtml(employeeCardState.medicalExamMessage)}</p>` : ""}
      ${employeeCardState.medicalExamError ? `<p class="module-feedback__error">${escapeHtml(employeeCardState.medicalExamError)}</p>` : ""}

      <form class="employee-medical-exam-form" data-employee-medical-exam-form data-employee-id="${escapeHtml(employee.id)}">
        <div class="employee-card-fields">
          ${employeeCardField("Kategorie prohlídky", employeeCardSelect("category", categoryOptions, exam.category, disabled))}
          ${employeeCardField("Datum narození pro výpočet věku", employeeCardInput("dateOfBirth", exam.dateOfBirth, { type: "date", disabled }))}
          ${employeeCardField("Datum poslední prohlídky", employeeCardInput("lastExamDate", exam.lastExamDate, { type: "date", disabled }))}
          ${employeeCardField("Typ prohlídky do PDF", employeeCardSelect("requestExamType", MEDICAL_EXAM_REQUEST_TYPE_OPTIONS, exam.requestExamType || "entry", disabled))}
          ${employeeCardField("Zařazení do PDF", employeeCardSelect("requestCategory", MEDICAL_EXAM_REQUEST_CATEGORY_OPTIONS, exam.requestCategory || exam.category || "", disabled))}
          ${employeeCardField("Upozornění", employeeCardSelect("notificationEnabled", [
            { value: "true", label: "Zapnuto" },
            { value: "false", label: "Vypnuto" }
          ], exam.notificationEnabled ? "true" : "false", disabled))}
          ${employeeCardReadonlyValue("Rozhodný věk", employeeMedicalExamAgeLabel(exam))}
          ${employeeCardReadonlyValue("Perioda", exam.intervalLabel || "neuvedeno")}
          ${employeeCardReadonlyValue("Příští prohlídka", nextExamLabel)}
          <div class="employee-card-readonly">
            <span>Stav termínu</span>
            ${employeeMedicalExamStatusBadge(exam)}
          </div>
          ${employeeCardReadonlyValue("Poznámka pravidla", exam.ruleNote || (exam.required ? "povinná prohlídka" : "nepovinná / nehlídá se"))}
          <label class="employee-card-field employee-card-field--wide">
            <span>Poznámka</span>
            <textarea name="note" rows="3" ${disabled ? "disabled" : ""}>${escapeHtml(exam.note || "")}</textarea>
          </label>
          ${employeeCardField("Jméno zařízení", employeeCardInput("medicalFacilityName", exam.medicalFacilityName || "", { disabled }))}
          ${employeeCardField("Posuzující lékař", employeeCardInput("medicalDoctorName", exam.medicalDoctorName || "", { disabled }))}
          ${employeeCardField("Sídlo zařízení", employeeCardInput("medicalFacilityAddress", exam.medicalFacilityAddress || "", { disabled }))}
          ${employeeCardField("IČ zařízení", employeeCardInput("medicalFacilityCompanyId", exam.medicalFacilityCompanyId || "", { disabled }))}
        </div>

        <p class="employee-medical-exam-note">
          Citlivé údaje jsou dostupné jen oprávněným rolím. E-mailové upozornění se posílá serverově na personalistiku a nikdy z prohlížeče.
        </p>

        <div class="employee-medical-exam-pdf">
          <div>
            <strong>Žádost o posouzení zdravotní způsobilosti k práci</strong>
            <span>Nejdřív uložte změny. Export i tisk se generují přes chráněné backend API a zapíšou audit.</span>
          </div>
          <div class="employee-medical-exam-pdf__actions">
            <a class="primary-action" href="${escapeHtml(`${requestUrl}?mode=download`)}" target="_blank" rel="noopener noreferrer">
              Export vyplněného PDF
            </a>
            <a class="secondary-link" href="${escapeHtml(`${requestUrl}?mode=print`)}" target="_blank" rel="noopener noreferrer">
              Tisk vyplněného PDF
            </a>
          </div>
        </div>

        ${canEdit ? `
          <div class="employee-card-form-actions">
            <button class="primary-action" type="submit" data-employee-medical-exam-save ${employeeCardState.medicalExamSaving ? "disabled" : ""}>
              ${employeeCardState.medicalExamSaving ? "Ukládám..." : "Uložit lékařskou prohlídku"}
            </button>
            <button class="secondary-link" type="button" data-employee-medical-exam-discard>
              Zrušit změny
            </button>
          </div>
        ` : ""}
      </form>
    </section>
  `;
}

function employeeDocumentsSection(employee, canEdit) {
  const documents = employeeCardState.documents;
  const uploadReady = employeeCardState.documentsUploadStatus === "ready";
  const uploadForm = canEdit && uploadReady
    ? `
      <form class="employee-document-upload-form" data-employee-document-upload-form data-employee-id="${escapeHtml(employee.id)}">
        <label>
          <span>Typ dokumentu</span>
          <select name="type">
            ${DOCUMENT_TYPE_LABELS.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Název</span>
          <input name="name" type="text" placeholder="Např. Pracovní smlouva" />
        </label>
        <label>
          <span>Platnost do</span>
          <input name="expiresAt" type="date" />
        </label>
        <label class="employee-document-upload-form__file">
          <span>Soubor</span>
          <input name="file" type="file" required />
        </label>
        <label class="employee-document-upload-form__note">
          <span>Poznámka</span>
          <textarea name="note" rows="2" placeholder="Volitelná interní poznámka"></textarea>
        </label>
        <button class="primary-action" type="submit" ${employeeCardState.documentUploading ? "disabled" : ""}>
          ${employeeCardState.documentUploading ? "Nahrávám..." : "Přidat dokument"}
        </button>
      </form>
    `
    : "";
  const rows = documents.length
    ? documents.map((document) => `
        <tr>
          <td data-label="Typ">${escapeHtml(document.type || "Dokument")}</td>
          <td data-label="Název">
            <span class="employee-document-name">
              <strong>${escapeHtml(document.name || "Bez názvu")}</strong>
              ${formatFileSize(document.sizeBytes) ? `<span>${escapeHtml(formatFileSize(document.sizeBytes))}</span>` : ""}
            </span>
          </td>
          <td data-label="Platnost">${escapeHtml(document.expiresAt ? formatAbsenceDate(document.expiresAt) : "neuvedeno")}</td>
          <td data-label="Stav">
            ${document.fileUrl
              ? `<a href="${escapeHtml(document.fileUrl)}" target="_blank" rel="noopener noreferrer">Stáhnout</a>`
              : '<span class="employee-card-status employee-card-status--waiting">Čeká na API</span>'}
          </td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="4">Zatím nejsou uložené žádné dokumenty.</td>
      </tr>
    `;

  return `
    <section class="employee-card-section">
      <div class="employee-card-section__head">
        <div>
          <h2>Dokumenty</h2>
          <p>Pracovní smlouvy, dodatky, školení, lékařské prohlídky a ostatní dokumenty.</p>
        </div>
        <div class="employee-card-actions">
          <span class="employee-card-status ${uploadReady ? "employee-card-status--ready" : "employee-card-status--waiting"}">
            ${uploadReady ? "Cloud upload" : "Čeká na API"}
          </span>
        </div>
      </div>
      <div class="employee-card-document-types">
        ${DOCUMENT_TYPE_LABELS.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
      </div>
      ${uploadForm}
      <div class="absence-table-wrap">
        <table class="absence-table employee-card-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Název</th>
              <th>Platnost</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${canEdit && !uploadReady ? `
        <p class="employee-card-api-note">
          Upload souborů není spuštěný. Chybí ${escapeHtml(employeeCardState.documentsMissingEndpoint)}.
        </p>
      ` : ""}
    </section>
  `;
}

function employeeWorkHistorySection(employee, canEdit) {
  const rows = employeeCardState.workHistory.length
    ? employeeCardState.workHistory.map((item) => `
        <tr>
          <td data-label="Od">${escapeHtml(item.dateFrom ? formatAbsenceDate(item.dateFrom) : "neuvedeno")}</td>
          <td data-label="Do">${escapeHtml(item.dateTo ? formatAbsenceDate(item.dateTo) : "dosud")}</td>
          <td data-label="Pozice">${escapeHtml(item.position || "neuvedeno")}</td>
          <td data-label="Oddělení">${escapeHtml(item.department || "neuvedeno")}</td>
          <td data-label="Poznámka">${escapeHtml(item.note || "")}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="5">Zatím tu není žádná pracovní historie.</td>
      </tr>
    `;

  return `
    <section class="employee-card-section">
      <div class="employee-card-section__head">
        <div>
          <h2>Pracovní historie</h2>
          <p>Přehled pracovních pozic, oddělení a poznámek v čase.</p>
        </div>
      </div>
      <div class="absence-table-wrap">
        <table class="absence-table employee-card-table">
          <thead>
            <tr>
              <th>Od</th>
              <th>Do</th>
              <th>Pozice</th>
              <th>Oddělení</th>
              <th>Poznámka</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${canEdit ? `
        <form class="employee-work-history-form" data-employee-work-history-form>
          ${employeeCardField("Datum od", employeeCardInput("dateFrom", "", { type: "date" }))}
          ${employeeCardField("Datum do", employeeCardInput("dateTo", "", { type: "date" }))}
          ${employeeCardField("Pozice", employeeCardInput("position", employee.position || ""))}
          ${employeeCardField("Oddělení", employeeCardInput("department", employee.department || ""))}
          <label class="employee-card-field employee-card-field--wide">
            <span>Poznámka</span>
            <textarea name="note" rows="3" placeholder="Poznámka k pracovní historii"></textarea>
          </label>
          <button class="secondary-link" type="submit" ${employeeCardState.workHistorySaving ? "disabled" : ""}>
            ${employeeCardState.workHistorySaving ? "Ukládám..." : "Přidat pracovní historii"}
          </button>
        </form>
      ` : ""}
    </section>
  `;
}

function employeeAbsenceWorkflowSection() {
  const absence = employeeCardState.absence || {};
  const items = normalizedApiAbsenceRequests(absence.items || []);
  const history = Array.isArray(absence.history) ? absence.history : [];
  const rows = items.length
    ? items.slice(0, 8).map((item) => `
        <tr>
          <td data-label="Typ">${absenceTypeBadge(item.type)}</td>
          <td data-label="Termín">
            <strong>${escapeHtml(absenceTermLabel(item))}</strong>
            <span>${escapeHtml(absenceDurationLabel(item))}</span>
          </td>
          <td data-label="Stav">${absenceStatusBadge(item.status)}</td>
          <td data-label="Schvaluje">${escapeHtml(item.managerName || "Bez nadřízeného")}</td>
          <td data-label="Odesláno">${escapeHtml(formatDateTime(item.submittedAt || item.createdAt))}</td>
          <td data-label="Připomínka">${escapeHtml(item.reminderSentAt ? formatDateTime(item.reminderSentAt) : "neodeslána")}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="6">Zatím tu nejsou uložené žádné žádosti.</td>
      </tr>
    `;
  const historyRows = history.length
    ? history.slice(0, 8).map((item) => `
        <li>
          <strong>${escapeHtml(item.toStatusLabel || item.toStatus || "Změna")}</strong>
          <span>${escapeHtml(formatDateTime(item.changedAt))} · ${escapeHtml(item.changedByName || item.changedByUserId || "systém")}</span>
          ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
        </li>
      `).join("")
    : '<li><span>Historie zatím není k dispozici.</span></li>';

  return `
    <section class="employee-card-section employee-card-section--wide">
      <div class="employee-card-section__head">
        <div>
          <h2>Schvalování absencí</h2>
          <p>Stavy žádostí, schvalovatelé, připomínky a historie z cloud API.</p>
        </div>
      </div>
      <div class="absence-table-wrap">
        <table class="absence-table employee-card-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Termín</th>
              <th>Stav</th>
              <th>Schvaluje</th>
              <th>Odesláno</th>
              <th>Připomínka</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <ul class="employee-absence-history">
        ${historyRows}
      </ul>
    </section>
  `;
}

function employeeCardContent(employeeId, user) {
  ensureEmployeeCardData(employeeId);

  const employee = employeeCardState.employee;
  const loading = employeeCardState.loadingId === employeeId || employeeCardState.employeesLoading;

  if (loading && (!employee || employee.id !== employeeId)) {
    return '<section class="absence-panel"><p class="absence-empty">Načítám kartu zaměstnance...</p></section>';
  }

  if (!employee || employee.id !== employeeId) {
    return `
      <section class="absence-panel">
        <p class="absence-empty">${employeeCardState.error || "Kartu zaměstnance se nepodařilo otevřít."}</p>
      </section>
    `;
  }

  const canEdit = canEditEmployeeCards(user);
  const canEditMedicalExam = canManageEmployeeMedicalExams(user);
  const canSeeNote = canSeeEmployeeInternalNote(user);
  const disabled = !canEdit || employeeCardState.saving;
  const formEmployee = employeeCardDraftFor(employee);

  return `
    <section class="employee-card" aria-labelledby="employee-card-title">
      <div class="employee-card-header">
        <div>
          <p class="module-detail__eyebrow">Karta zaměstnance</p>
          <h2 id="employee-card-title">${escapeHtml(employeeFullName(formEmployee))}</h2>
          <p>${escapeHtml(formEmployee.position || roleLabel(formEmployee.role))} · ${escapeHtml(formEmployee.department || "bez oddělení")}</p>
        </div>
        <div class="employee-card-header__actions">
          ${employeeCardApiBadge()}
          <select class="employee-card-switcher" data-employee-card-select aria-label="Vybrat zaměstnance">
            ${employeeOptionList(employee.id)}
          </select>
          <button class="secondary-link" type="button" data-employee-open-requests="${escapeHtml(employee.id)}">
            Otevřít žádosti zaměstnance
          </button>
        </div>
      </div>

      ${employeeCardState.message ? `<p class="module-feedback__notice">${escapeHtml(employeeCardState.message)}</p>` : ""}
      ${employeeCardState.error ? `<p class="module-feedback__error">${escapeHtml(employeeCardState.error)}</p>` : ""}
      ${employeeCardKpis(formEmployee)}

      <form class="employee-card-form" data-employee-card-form data-employee-id="${escapeHtml(employee.id)}">
        <div class="employee-card-grid">
          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Základní údaje</h2>
                <p>Kontaktní údaje, role a pracovní zařazení zaměstnance.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Jméno", employeeCardInput("firstName", formEmployee.firstName, { disabled }))}
              ${employeeCardField("Příjmení", employeeCardInput("lastName", formEmployee.lastName, { disabled }))}
              ${employeeCardField("E-mail", employeeCardInput("email", formEmployee.email, { type: "email", disabled }))}
              ${employeeCardField("Telefon", employeeCardInput("phone", formEmployee.phone, { disabled }))}
              ${employeeCardField("Role", employeeCardSelect("role", ROLE_DEFINITIONS.map((role) => ({ value: role.id, label: role.label })), normalizeRole(formEmployee.role), disabled))}
              ${employeeCardField("Oddělení", employeeCardInput("department", formEmployee.department, { disabled }))}
              ${employeeCardField("Pracovní pozice", employeeCardInput("position", formEmployee.position, { disabled }))}
              ${employeeCardField("Bydliště", employeeCardInput("address", formEmployee.address || "", { disabled }))}
              ${employeeCardField("Místo výkonu práce", employeeCardInput("workplace", formEmployee.workplace || "", { disabled }))}
              ${employeeCardField("Stav zaměstnance", employeeCardSelect("employmentStatus", EMPLOYMENT_STATUS_OPTIONS, formEmployee.employmentStatus || "active", disabled))}
              ${employeeCardField("Datum nástupu", employeeCardInput("startDate", formEmployee.startDate, { type: "date", disabled }))}
              ${employeeCardField("Pracovní úvazek", employeeCardInput("workload", formEmployee.workload, { type: "number", step: "0.1", min: "0", disabled }))}
              ${employeeCardField("Týdenní hodiny", employeeCardInput("weeklyHours", formEmployee.weeklyHours || (Number(formEmployee.workload || 0) * 40), { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Typ pracovního vztahu", employeeCardSelect("employmentType", EMPLOYMENT_TYPE_SELECT_OPTIONS, formEmployee.employmentType, disabled))}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Dovolená</h2>
                <p>Nárok, čerpání, čekající žádosti a aktuální zůstatek.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Roční nárok dovolené", employeeCardInput("vacationEntitlementDays", formEmployee.vacationEntitlementDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Čerpáno", employeeCardInput("vacationUsedDays", formEmployee.vacationUsedDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Čeká na schválení", employeeCardInput("vacationPendingDays", formEmployee.vacationPendingDays, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardReadonlyValue("Zbývá", formatAbsenceDays(formEmployee.vacationRemainingDays || 0))}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Nemoc / absence</h2>
                <p>Aktuální stav, počet dní nemoci a poslední evidence.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Aktuální stav", employeeCardSelect("currentAbsenceStatus", EMPLOYEE_ABSENCE_STATUS_OPTIONS, formEmployee.currentAbsenceStatus || "v práci", disabled))}
              ${employeeCardField("Nemoc tento rok", employeeCardInput("sickDaysCurrentYear", formEmployee.sickDaysCurrentYear, { type: "number", step: "0.5", min: "0", disabled }))}
              ${employeeCardField("Poslední absence", employeeCardInput("lastAbsenceDate", formEmployee.lastAbsenceDate, { type: "date", disabled }))}
              ${employeeCardReadonlyValue("Přehled absencí", employeeCardState.absence?.note || "Detailní seznam čeká na cloudové API nepřítomností.")}
            </div>
          </section>

          <section class="employee-card-section">
            <div class="employee-card-section__head">
              <div>
                <h2>Nadřízený a schvalování</h2>
                <p>Aktuální nadřízený a schvalovatel dovolené.</p>
              </div>
            </div>
            <div class="employee-card-fields">
              ${employeeCardField("Aktuální nadřízený", employeeCardSelect(
                "managerId",
                [{ value: "", label: "Bez nadřízeného" }, ...employeeCardState.employees
                  .filter((item) => item.id !== employee.id && item.employmentStatus !== "inactive")
                  .map((item) => ({ value: item.id, label: employeeFullName(item) }))],
                formEmployee.managerId || "",
                disabled
              ))}
              ${employeeCardReadonlyValue("Schvalovatel dovolené", formEmployee.managerName || "Bez nadřízeného")}
            </div>
          </section>

          ${canSeeNote ? `
            <section class="employee-card-section employee-card-section--wide">
              <div class="employee-card-section__head">
                <div>
                  <h2>Poznámky</h2>
                  <p>Interní poznámka kanceláře a managementu.</p>
                </div>
              </div>
              <label class="employee-card-field employee-card-field--wide">
                <span>Interní poznámka</span>
                <textarea name="internalNote" rows="4" ${disabled ? "disabled" : ""}>${escapeHtml(formEmployee.internalNote || "")}</textarea>
              </label>
            </section>
          ` : '<input type="hidden" name="internalNote" value="" />'}
        </div>

        ${canEdit ? `
          <div class="employee-card-form-actions">
            <button class="text-action" type="button" data-employee-focus-edit>Upravit údaje</button>
            <button class="primary-action" type="submit" ${employeeCardState.saving ? "disabled" : ""}>
              ${employeeCardState.saving ? "Ukládám..." : "Uložit změny"}
            </button>
            <button class="secondary-link" type="button" data-employee-discard>
              Zrušit změny
            </button>
          </div>
        ` : ""}
      </form>

      ${employeeMedicalExamSection(employee, canEditMedicalExam)}

      <div class="employee-card-grid employee-card-grid--bottom">
        ${employeeAbsenceWorkflowSection()}
        ${employeeWorkHistorySection(employee, canEdit)}
        ${employeeDocumentsSection(employee, canEdit)}
      </div>
    </section>
  `;
}

function absenceActiveContent(activeTab, user, context = {}) {
  const safeTab = resolveAbsenceTab(user, activeTab);

  if (safeTab === "my") {
    return absenceMyRequests(user);
  }

  if (safeTab === "quick") {
    return quickAbsenceContent(user);
  }

  if (safeTab === "new") {
    return absenceNewRequest(user);
  }

  if (safeTab === "approval") {
    return absenceApproval(user);
  }

  if (safeTab === "calendar") {
    return absenceCalendar(user);
  }

  if (safeTab === "employee-card") {
    return employeeCardContent(context.employeeId || employeeIdForUser(user), user);
  }

  if (safeTab === "reports") {
    return absenceReports(user);
  }

  if (safeTab === "rules-automation") {
    return absenceRulesAutomation(user);
  }

  if (safeTab === "settings") {
    return absenceSettings(user);
  }

  return absenceDashboard(user);
}

function absenceModulePage(moduleItem, user, isDashboard = false, context = {}) {
  const requestedTab = context.tab
    ? context.tab
    : context.employeeId
    ? "employee-card"
    : context.quick
      ? "quick"
      : isDashboard
        ? "dashboard"
        : normalizeRole(user?.role) === "ridic"
          ? "quick"
          : absenceUiState.tab;
  const activeTab = resolveAbsenceTab(user, requestedTab);
  const feedbackBox = activeTab === "dashboard"
    ? moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: "dovolena-nemoc",
        moduleName: "Dovolená / Nemoc",
        placeholder: "Např. chybí mi přehled zůstatku dovolené, filtr podle zaměstnance, export do PDF…"
      })
    : "";
  const tabs = absenceTabsForUser(user);
  const isQuickTab = activeTab === "quick";

  return `
    <main class="app-shell module-page module-theme-scope absence-page ${isQuickTab ? "absence-page--quick" : ""}" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="absence-hero" aria-labelledby="absence-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div>
          <div class="module-detail__eyebrow">SMART ODPADY / DOVOLENÁ A NEMOC</div>
          <h1 id="absence-title">${isQuickTab ? "Rychlé zadání" : "Dovolená / Nemoc"}</h1>
          <p>${isQuickTab ? "Vyberte typ, datum a odešlete." : "Jedno místo pro žádosti o dovolenou, nemoc, lékaře, OČR a náhradní volno."}</p>
        </div>
        ${isQuickTab ? "" : `<div class="absence-hero__meta">
          <span>Report</span>
          <strong>${ABSENCE_REPORT_EMAIL}</strong>
          <small>${ABSENCE_REPORT_DAY}. den v měsíci · ${ABSENCE_REPORT_TIME}</small>
        </div>`}
      </section>

      <nav class="absence-tabs" aria-label="Menu modulu Dovolená / Nemoc">
        ${tabs.map((tab) => `
          <a
            class="absence-tab ${tab.id === activeTab ? "absence-tab--active" : ""}"
            href="${routeHref(absenceRouteForTab(tab.id))}"
            data-link
          >
            ${escapeHtml(tab.label)}
          </a>
        `).join("")}
      </nav>

      ${absenceUiState.message ? `<p class="module-feedback__notice">${escapeHtml(absenceUiState.message)}</p>` : ""}
      ${absenceUiState.error ? `<p class="module-feedback__error">${escapeHtml(absenceUiState.error)}</p>` : ""}
      ${absenceActiveContent(activeTab, user, context)}
      ${feedbackBox}
    </main>
  `;
}

function fleetImportStat(label, value) {
  return `
    <div class="fleet-import-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function fleetImportSummary(preview) {
  const summary = preview?.summary || {};

  return `
    <div class="fleet-import-stats" aria-label="Souhrn náhledu importu">
      ${fleetImportStat("Řádky", summary.rowCount ?? 0)}
      ${fleetImportStat("Sloupce", summary.columnCount ?? 0)}
      ${fleetImportStat("Mapováno", summary.supportedColumnCount ?? 0)}
      ${fleetImportStat("Ke kontrole", (summary.duplicateVinCount || 0) + (summary.duplicateRegistrationCount || 0) + (summary.missingVinCount || 0) + (summary.missingRegistrationCount || 0))}
    </div>
  `;
}

function fleetImportPolicy(preview) {
  const summary = preview?.summary || {};

  return `
    <div class="fleet-import-policy" aria-label="Politika importu">
      <span>Režim: náhled</span>
      <span>Zápis do produkce: ${summary.productionWrite ? "ano" : "ne"}</span>
      <span>Uložení hodnot: ${summary.valuesStored ? "ano" : "ne"}</span>
      <span>Citlivé hodnoty: ${summary.valuesRedacted ? "maskované" : "plné"}</span>
    </div>
  `;
}

function fleetImportColumnsTable(preview) {
  const rows = (preview?.columns || []).map((column) => `
    <tr>
      <td>${escapeHtml(column.header)}</td>
      <td>${escapeHtml(column.supported ? column.target : "Nepodporováno")}</td>
      <td>${escapeHtml(column.category)}</td>
      <td>${escapeHtml(column.importAction)}</td>
    </tr>
  `).join("");

  return `
    <div class="fleet-import-table-wrap">
      <table class="fleet-import-table">
        <thead>
          <tr>
            <th>Sloupec Vistos</th>
            <th>Cíl</th>
            <th>Skupina</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function fleetImportRowsTable(preview) {
  const rows = (preview?.matching?.rows || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.rowNumber)}</td>
      <td><span class="fleet-import-status">${escapeHtml(row.statusLabel)}</span></td>
      <td>${escapeHtml(row.registrationNumberMasked || "-")}</td>
      <td>${escapeHtml(row.vinMasked || "-")}</td>
      <td>${escapeHtml(row.name || row.internalVehicleNumber || "-")}</td>
      <td>${escapeHtml(row.matchedBy)}</td>
      <td>${escapeHtml((row.warnings || []).join(", ") || "-")}</td>
    </tr>
  `).join("");

  return `
    <div class="fleet-import-table-wrap">
      <table class="fleet-import-table">
        <thead>
          <tr>
            <th>Řádek</th>
            <th>Stav</th>
            <th>SPZ</th>
            <th>VIN</th>
            <th>Vozidlo</th>
            <th>Párování</th>
            <th>Kontrola</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function fleetVistosImportSection(user) {
  const canImport = hasPermission(user, "fleet", "edit");
  const preview = fleetImportPreviewState.preview;
  const sourceInfo = preview
    ? `${preview.filename}${preview.sheetName ? ` / ${preview.sheetName}` : ""}`
    : "Bez načteného souboru";

  return `
    <section class="fleet-import-panel" aria-labelledby="fleet-import-title">
      <div class="fleet-import-panel__head">
        <div>
          <p class="module-feedback__eyebrow">Vistos</p>
          <h2 id="fleet-import-title">Import preview vozidel</h2>
          <p>${escapeHtml(sourceInfo)}</p>
        </div>
        ${preview ? `<button class="secondary-link" type="button" data-fleet-import-download-report>Export náhledu</button>` : ""}
      </div>

      ${canImport ? `
        <form class="fleet-import-form" data-fleet-vistos-import-form>
          <label>
            <span>Export Vistos</span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            >
          </label>
          <button class="primary-action" type="submit" ${fleetImportPreviewState.loading ? "disabled" : ""}>
            ${fleetImportPreviewState.loading ? "Zpracovávám..." : "Zpracovat náhled"}
          </button>
        </form>
      ` : `
        <p class="module-feedback__notice">Pro nahrání exportu je potřeba oprávnění Vozový park / úpravy.</p>
      `}

      ${fleetImportPreviewState.message ? `<p class="module-feedback__notice">${escapeHtml(fleetImportPreviewState.message)}</p>` : ""}
      ${fleetImportPreviewState.error ? `<p class="module-feedback__error">${escapeHtml(fleetImportPreviewState.error)}</p>` : ""}

      ${preview ? `
        ${fleetImportSummary(preview)}
        ${fleetImportPolicy(preview)}
        <div class="fleet-import-grid">
          <section>
            <h3>Mapování sloupců</h3>
            ${fleetImportColumnsTable(preview)}
          </section>
          <section>
            <h3>Řádky k ověření</h3>
            ${fleetImportRowsTable(preview)}
          </section>
        </div>
      ` : `
        <div class="fleet-import-empty">
          <strong>Pouze náhled</strong>
          <span>Bez automatické synchronizace a bez zápisu do databáze.</span>
        </div>
      `}
    </section>
  `;
}

function fleetApiBadge(label = FLEET_API_WAITING_LABEL) {
  return `<span class="fleet-api-badge">${escapeHtml(label)}</span>`;
}

function fleetSectionHeader(id, title, subtitle = "", options = {}) {
  return `
    <div class="fleet-section__head">
      <div>
        <p class="module-feedback__eyebrow">${escapeHtml(options.eyebrow || "Vozový park")}</p>
        <h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${options.badge === false ? "" : fleetApiBadge(options.badgeText || FLEET_API_WAITING_LABEL)}
    </div>
  `;
}

function fleetApiNotice(endpoint, message = FLEET_API_MISSING_MESSAGE) {
  return `
    <p class="fleet-api-note">
      ${escapeHtml(message)}
      ${endpoint ? `<span>Chybí: ${escapeHtml(endpoint)}</span>` : ""}
    </p>
  `;
}

function fleetActionNotice() {
  if (!fleetUiState.message && !fleetUiState.error) {
    return "";
  }

  const className = fleetUiState.error ? "module-feedback__error" : "module-feedback__notice";
  return `<p class="${className}" role="status">${escapeHtml(fleetUiState.error || fleetUiState.message)}</p>`;
}

function isFleetTabId(tabId) {
  return FLEET_REQUIRED_SECTIONS.some((section) => section.id === tabId);
}

function fleetTabFromHash(hash = window.location.hash) {
  const match = String(hash || "").match(/^#fleet-([a-z-]+)$/);
  const tabId = match ? match[1] : "";
  return isFleetTabId(tabId) ? tabId : "";
}

function fleetActiveTab(vehicleId = "") {
  return fleetTabFromHash() || (vehicleId ? "detail" : "dashboard");
}

function fleetTabHref(tabId) {
  const baseUrl = `${window.location.pathname}${window.location.search}`;
  return `${baseUrl}#fleet-${encodeURIComponent(tabId)}`;
}

function fleetPanelAttributes(tabId, activeId) {
  const isActive = tabId === activeId;
  return [
    `data-fleet-panel="${escapeHtml(tabId)}"`,
    `role="tabpanel"`,
    `tabindex="0"`,
    isActive ? "" : "hidden",
    isActive ? "" : `aria-hidden="true"`
  ].filter(Boolean).join(" ");
}

function fleetTabs(activeId) {
  return `
    <nav class="fleet-tabs" aria-label="Menu modulu Vozový park" role="tablist">
      ${FLEET_REQUIRED_SECTIONS.map((section) => `
        <a
          class="fleet-tab ${section.id === activeId ? "fleet-tab--active" : ""}"
          href="${escapeHtml(fleetTabHref(section.id))}"
          role="tab"
          aria-selected="${section.id === activeId ? "true" : "false"}"
          aria-controls="fleet-${escapeHtml(section.id)}"
          data-fleet-tab="${escapeHtml(section.id)}"
        >
          ${escapeHtml(section.label)}
        </a>
      `).join("")}
    </nav>
  `;
}

function fleetActionButton(label, action, options = {}) {
  const dataset = [
    `data-fleet-action="${escapeHtml(action)}"`,
    options.vehicleId ? `data-fleet-vehicle-id="${escapeHtml(options.vehicleId)}"` : "",
    options.target ? `data-fleet-target="${escapeHtml(options.target)}"` : ""
  ].filter(Boolean).join(" ");

  return `<button class="secondary-link fleet-action-button" type="button" ${dataset}>${escapeHtml(label)}</button>`;
}

function fleetFieldChips(fields) {
  return `
    <div class="fleet-field-chips">
      ${fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}
    </div>
  `;
}

function fleetDashboardSection(activeId) {
  const summary = fleetVehiclesState.summary || {};
  const isReady = fleetVehiclesState.apiStatus === "ready";
  const valueFor = (metricId) => {
    if (fleetVehiclesState.loading) {
      return "…";
    }
    if (isReady && Number.isFinite(Number(summary[metricId]))) {
      return String(summary[metricId]);
    }
    return "—";
  };
  const statusFor = () => {
    if (fleetVehiclesState.error) {
      return "Chyba načtení";
    }
    if (isReady) {
      return "T-Cars read-only";
    }
    if (fleetVehiclesState.loading) {
      return "Načítám";
    }
    return FLEET_API_WAITING_LABEL;
  };

  return `
    <section class="fleet-section" id="fleet-dashboard" aria-labelledby="fleet-dashboard-title" ${fleetPanelAttributes("dashboard", activeId)}>
      ${fleetSectionHeader(
        "fleet-dashboard-title",
        "Dashboard",
        "Centrální přehled provozního stavu vozidel a blížících se termínů.",
        { badgeText: isReady ? "T-Cars read-only" : FLEET_API_WAITING_LABEL }
      )}
      <div class="fleet-kpi-grid" aria-label="Přehled vozového parku">
        ${FLEET_DASHBOARD_METRICS.map((metric) => `
          <article class="fleet-kpi">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(valueFor(metric.id))}</strong>
            <small>${escapeHtml(statusFor())}</small>
          </article>
        `).join("")}
      </div>
      ${isReady
        ? `<p class="fleet-api-note">Dashboard používá stejný read-only zdroj jako seznam vozidel.<span>Zdroj: T-Cars přes GET /api/vehicles</span></p>`
        : fleetApiNotice("GET /api/vehicles/summary")}
    </section>
  `;
}

function fleetFiltersSection() {
  return `
    <form class="fleet-filters" aria-label="Filtry vozidel">
      <label>
        <span>Stav</span>
        <select disabled>
          <option>Všechny stavy</option>
          ${FLEET_STATUS_OPTIONS.map((status) => `<option>${escapeHtml(status.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Typ</span>
        <select disabled>
          <option>Všechny typy</option>
          ${FLEET_VEHICLE_TYPES.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Řidič</span>
        <select disabled>
          <option>${escapeHtml(FLEET_API_WAITING_LABEL)}</option>
        </select>
      </label>
      <label>
        <span>Termíny</span>
        <select disabled>
          <option>STK / revize / pojištění do 30 dnů</option>
        </select>
      </label>
      <label>
        <span>Závady</span>
        <select disabled>
          <option>Otevřené závady</option>
        </select>
      </label>
      <label class="fleet-filter-search">
        <span>Hledat</span>
        <input type="search" placeholder="SPZ, interní číslo, VIN, řidič" disabled>
      </label>
    </form>
  `;
}

function fleetVehicleDisplayValue(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function fleetVehicleModel(vehicle) {
  return [vehicle.brand, vehicle.model].map((value) => String(value || "").trim()).filter(Boolean).join(" ") || vehicle.model || "";
}

function fleetVehicleCountValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return Number.isFinite(Number(value)) ? String(value) : "—";
}

function fleetVehiclesStatusText() {
  if (fleetVehiclesState.loading) {
    return "Načítám vozidla z T-Cars.";
  }
  if (fleetVehiclesState.error) {
    return fleetVehiclesState.error;
  }
  if (fleetVehiclesState.apiStatus === "ready") {
    const fetchedAt = fleetVehiclesState.lastFetchedAt ? ` Poslední načtení: ${formatDateTime(fleetVehiclesState.lastFetchedAt)}.` : "";
    return `${fleetVehiclesState.message || "Vozidla byla načtena z T-Cars read-only."}${fetchedAt}`;
  }
  return fleetVehiclesState.message || "Seznam se načte z chráněného cloud API.";
}

function fleetVehicleRow(vehicle) {
  const cells = [
    ["Interní číslo", vehicle.internalNumber],
    ["SPZ", vehicle.licensePlate],
    ["Typ", vehicle.vehicleType || vehicle.source || "T-Cars"],
    ["Značka/model", fleetVehicleModel(vehicle)],
    ["Řidič", vehicle.assignedDriverName],
    ["Stav", fleetStatusLabel(vehicle.status)],
    ["STK do", vehicle.stkValidTo],
    ["Revize do", vehicle.tachographValidTo || vehicle.craneRevisionValidTo || vehicle.liftRevisionValidTo || vehicle.pressureEquipmentRevisionValidTo],
    ["Pojištění do", vehicle.insuranceValidTo],
    ["Otevřené závady", fleetVehicleCountValue(vehicle.openDefects)]
  ];

  return `
    <div class="fleet-table__row" role="row">
      ${cells.map(([label, value]) => `
        <span role="cell" data-label="${escapeHtml(label)}">${escapeHtml(fleetVehicleDisplayValue(value))}</span>
      `).join("")}
      <span role="cell" data-label="Akce">
        ${fleetActionButton("Detail", "detail", { vehicleId: vehicle.id })}
      </span>
    </div>
  `;
}

function fleetVehiclesTableBody() {
  if (fleetVehiclesState.loading) {
    return `
      <div class="fleet-table__empty" role="row">
        <strong>Načítám</strong>
        <span>Čtu vozidla z T-Cars přes backend Smart odpady.</span>
      </div>
    `;
  }

  if (fleetVehiclesState.error) {
    return `
      <div class="fleet-table__empty" role="row">
        <strong>Vozidla se nepodařilo načíst</strong>
        <span>${escapeHtml(fleetVehiclesState.error)}</span>
      </div>
    `;
  }

  if (fleetVehiclesState.apiStatus === "ready" && fleetVehiclesState.vehicles.length) {
    return fleetVehiclesState.vehicles.map(fleetVehicleRow).join("");
  }

  return `
    <div class="fleet-table__empty" role="row">
      <strong>${escapeHtml(fleetVehiclesState.apiStatus === "ready" ? "Bez vozidel" : FLEET_API_WAITING_LABEL)}</strong>
      <span>${escapeHtml(fleetVehiclesState.apiStatus === "ready" ? "T-Cars nevrátil žádná vozidla." : fleetVehiclesState.message || "Seznam se načte z cloud API. Produkční vozidla nejsou ve frontendu napevno.")}</span>
    </div>
  `;
}

function fleetVehiclesSection(activeId) {
  return `
    <section class="fleet-section" id="fleet-vehicles" aria-labelledby="fleet-vehicles-title" ${fleetPanelAttributes("vehicles", activeId)}>
      ${fleetSectionHeader(
        "fleet-vehicles-title",
        "Seznam vozidel",
        "Vozidla, STK, revize, závady a servisní historie na jednom místě.",
        { badgeText: fleetVehiclesState.apiStatus === "ready" ? "T-Cars read-only" : FLEET_API_WAITING_LABEL }
      )}
      ${fleetFiltersSection()}
      <p class="fleet-api-note">
        ${escapeHtml(fleetVehiclesStatusText())}
        <span>Read-only zdroj: GET /api/vehicles z T-Cars. Do D1 se nic neukládá.</span>
      </p>
      <div class="fleet-table" role="table" aria-label="Seznam vozidel">
        <div class="fleet-table__header" role="row">
          ${FLEET_LIST_COLUMNS.map((column) => `<span role="columnheader">${escapeHtml(column)}</span>`).join("")}
        </div>
        ${fleetVehiclesTableBody()}
      </div>
      <div class="fleet-actions-preview" aria-label="Akce vozidla">
        ${fleetActionButton("Detail", "detail")}
        ${fleetActionButton("Přidat závadu", "defect")}
        ${fleetActionButton("Přidat servis", "service")}
        ${fleetActionButton("Dokumenty", "documents", { target: "fleet-documents" })}
      </div>
    </section>
  `;
}

function fleetDetailSection(vehicleId = "", activeId = "detail") {
  const safeVehicleId = vehicleId || "";
  const detailTitle = safeVehicleId ? `Detail vozidla ${safeVehicleId}` : "Detail vozidla";

  return `
    <section class="fleet-section fleet-section--wide" id="fleet-detail" aria-labelledby="fleet-detail-title" ${fleetPanelAttributes("detail", activeId)}>
      ${fleetSectionHeader(
        "fleet-detail-title",
        detailTitle,
        safeVehicleId
          ? "Detail route je připravená, provozní údaje se načtou až z API."
          : "Karta vozidla se otevře po výběru konkrétního záznamu z API.",
        { badge: true }
      )}
      <div class="fleet-detail-shell">
        <header class="fleet-detail-header">
          <div>
            <span>SPZ / interní číslo</span>
            <strong>—</strong>
          </div>
          <div>
            <span>Značka / model</span>
            <strong>—</strong>
          </div>
          <div>
            <span>Stav</span>
            <strong>${escapeHtml(fleetStatusLabel(""))}</strong>
          </div>
          <div>
            <span>Řidič</span>
            <strong>—</strong>
          </div>
        </header>
        <div class="fleet-detail-actions">
          ${safeVehicleId ? `<a class="secondary-link" href="${routeHref(`${FLEET_ROUTE}#fleet-vehicles`)}" data-link>Zpět na seznam</a>` : ""}
          ${fleetActionButton("Přidat závadu", "defect", { vehicleId: safeVehicleId })}
          ${fleetActionButton("Přidat servis", "service", { vehicleId: safeVehicleId })}
          ${fleetActionButton("Dokumenty", "documents", { vehicleId: safeVehicleId, target: "fleet-documents" })}
        </div>
        <div class="fleet-detail-grid">
          <article>
            <h3>Základní údaje</h3>
            ${fleetFieldChips(FLEET_VEHICLE_FIELDS.slice(0, 14))}
          </article>
          <article>
            <h3>Technický stav</h3>
            ${fleetFieldChips(FLEET_VEHICLE_FIELDS.slice(14, 24))}
          </article>
          <article>
            <h3>Pojištění a provoz</h3>
            ${fleetFieldChips(FLEET_VEHICLE_FIELDS.slice(24))}
          </article>
        </div>
      </div>
      ${fleetApiNotice(safeVehicleId ? "GET /api/vehicles/:id" : "GET /api/vehicles", FLEET_TAB_WAITING_MESSAGES.detail)}
    </section>
  `;
}

function fleetTermsSection(activeId) {
  return `
    <section class="fleet-section" id="fleet-terms" aria-labelledby="fleet-terms-title" ${fleetPanelAttributes("terms", activeId)}>
      ${fleetSectionHeader(
        "fleet-terms-title",
        "Termíny",
        "STK, emise, revize, tachograf, hasicí přístroje a pojištění.",
        { badge: true }
      )}
      <div class="fleet-term-grid">
        ${FLEET_TERM_DEFINITIONS.map((term) => `
          <article class="fleet-term fleet-term--waiting">
            <span>${escapeHtml(term.label)}</span>
            <strong>—</strong>
            <small>${escapeHtml(FLEET_API_WAITING_LABEL)}</small>
          </article>
        `).join("")}
      </div>
      ${fleetApiNotice("GET /api/vehicles", FLEET_TAB_WAITING_MESSAGES.terms)}
    </section>
  `;
}

function fleetDefectsSection(activeId) {
  return `
    <section class="fleet-section" id="fleet-defects" aria-labelledby="fleet-defects-title" ${fleetPanelAttributes("defects", activeId)}>
      ${fleetSectionHeader(
        "fleet-defects-title",
        "Závady",
        "Evidence otevřených a uzavřených závad podle vozidla, závažnosti a řešení.",
        { badge: true }
      )}
      ${fleetFieldChips(FLEET_DEFECT_FIELDS)}
      <div class="fleet-empty-state">
        <strong>${escapeHtml(FLEET_API_WAITING_LABEL)}</strong>
        <span>Závady se budou zapisovat pouze přes chráněné cloud API.</span>
      </div>
      ${fleetApiNotice("GET /api/vehicles/:id/defects", FLEET_TAB_WAITING_MESSAGES.defects)}
    </section>
  `;
}

function fleetServiceSection(activeId) {
  return `
    <section class="fleet-section" id="fleet-service" aria-labelledby="fleet-service-title" ${fleetPanelAttributes("service", activeId)}>
      ${fleetSectionHeader(
        "fleet-service-title",
        "Servisní historie",
        "Servisy, opravy, dodavatelé, náklady, stav kilometrů a další plánovaný servis.",
        { badge: true }
      )}
      ${fleetFieldChips(FLEET_SERVICE_FIELDS)}
      <div class="fleet-empty-state">
        <strong>${escapeHtml(FLEET_API_WAITING_LABEL)}</strong>
        <span>Servisní záznamy se neukládají do prohlížeče ani do mock databáze.</span>
      </div>
      ${fleetApiNotice("GET /api/vehicles/:id/service-records", FLEET_TAB_WAITING_MESSAGES.service)}
    </section>
  `;
}

function fleetDocumentsSection(activeId) {
  return `
    <section class="fleet-section" id="fleet-documents" aria-labelledby="fleet-documents-title" ${fleetPanelAttributes("documents", activeId)}>
      ${fleetSectionHeader(
        "fleet-documents-title",
        "Dokumenty",
        "Technické průkazy, pojistky, servisní doklady, revizní protokoly a fotodokumentace.",
        { badge: true }
      )}
      ${fleetFieldChips(FLEET_DOCUMENT_FIELDS)}
      <div class="fleet-empty-state">
        <strong>${escapeHtml(FLEET_API_WAITING_LABEL)}</strong>
        <span>Soubory musí jít přes cloud API a R2, ne přes lokální úložiště prohlížeče.</span>
      </div>
      <div class="fleet-actions-preview">
        ${fleetActionButton("Dokumenty", "documents")}
      </div>
      ${fleetApiNotice("GET /api/vehicles/:id/documents", FLEET_TAB_WAITING_MESSAGES.documents)}
    </section>
  `;
}

function fleetSettingsSection(user, activeId) {
  return `
    <section class="fleet-section fleet-section--wide" id="fleet-settings" aria-labelledby="fleet-settings-title" ${fleetPanelAttributes("settings", activeId)}>
      ${fleetSectionHeader(
        "fleet-settings-title",
        "Nastavení / číselníky",
        "Typy vozidel, interní stavy, termíny a budoucí napojení na cloud API.",
        { badge: true }
      )}
      <div class="fleet-settings-grid">
        <article>
          <h3>Stavy</h3>
          <div class="fleet-status-list">
            ${FLEET_STATUS_OPTIONS.map((status) => `
              <span class="fleet-status fleet-status--${escapeHtml(fleetStatusTone(status.value))}">
                ${escapeHtml(status.label)}
              </span>
            `).join("")}
          </div>
        </article>
        <article>
          <h3>Typy vozidel</h3>
          ${fleetFieldChips(FLEET_VEHICLE_TYPES)}
        </article>
        <article>
          <h3>API endpointy</h3>
          ${fleetFieldChips(FLEET_API_ENDPOINTS)}
        </article>
      </div>
      ${fleetApiNotice("GET /api/vehicles/settings", FLEET_TAB_WAITING_MESSAGES.settings)}
      ${fleetVistosImportSection(user)}
    </section>
  `;
}

function fleetModulePage(moduleItem, user, options = {}) {
  const isDashboard = Boolean(options.isDashboard);
  const vehicleId = options.vehicleId || "";
  const activeTab = fleetActiveTab(vehicleId);
  const title = vehicleId ? "Detail vozidla" : isDashboard ? "Vozový park dashboard" : "Vozový park";
  const description = vehicleId
    ? "Detailová karta vozidla je připravená pro cloud API bez lokálního ukládání."
    : "Evidence vozidel, technického stavu, STK, revizí, pojištění, závad a servisní historie.";

  return `
    <main class="app-shell module-page module-theme-scope fleet-page" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail fleet-hero" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">SMART ODPADY / VOZOVÝ PARK</div>
          <h1 id="module-title">${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${escapeHtml(moduleStatusLabel(moduleItem))}</strong>
          </div>
          <div class="module-actions">
            ${isDashboard ? `<a class="primary-link" href="${routeHref(FLEET_ROUTE)}" data-link>Otevřít modul</a>` : ""}
            ${vehicleId ? `<a class="secondary-link" href="${routeHref(`${FLEET_ROUTE}#fleet-vehicles`)}" data-link>Seznam vozidel</a>` : ""}
            ${!isDashboard ? `<a class="secondary-link" href="${routeHref(`${FLEET_ROUTE}/dashboard`)}" data-link>Dashboard modulu</a>` : ""}
            ${fleetActionButton("Přidat vozidlo", "addVehicle")}
          </div>
        </div>
      </section>

      ${fleetActionNotice()}
      ${fleetTabs(activeTab)}
      <div class="fleet-content">
        ${fleetDashboardSection(activeTab)}
        ${fleetVehiclesSection(activeTab)}
        ${fleetDetailSection(vehicleId, activeTab)}
        ${fleetTermsSection(activeTab)}
        ${fleetDefectsSection(activeTab)}
        ${fleetServiceSection(activeTab)}
        ${fleetDocumentsSection(activeTab)}
        ${fleetSettingsSection(user, activeTab)}
      </div>
      ${moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: "vozovy-park",
        moduleName: "Vozový park",
        placeholder: "Např. chybí pole ve vozidle, filtr, typ dokladu nebo servisní údaj…"
      })}
    </main>
  `;
}

function vehicleTrackingBadge(text = VEHICLE_TRACKING_GPS_WAITING, tone = "") {
  return `<span class="tracking-badge ${tone ? `tracking-badge--${escapeHtml(tone)}` : ""}">${escapeHtml(text)}</span>`;
}

function vehicleTrackingSectionHeader(id, title, subtitle = "", options = {}) {
  return `
    <div class="tracking-section__head">
      <div>
        <p class="module-feedback__eyebrow">${escapeHtml(options.eyebrow || "Sledování vozidel")}</p>
        <h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${vehicleTrackingBadge(options.badgeText || "DEMO REŽIM", options.badgeTone || "demo")}
    </div>
  `;
}

function vehicleTrackingFieldChips(fields) {
  return `
    <div class="tracking-field-chips">
      ${fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}
    </div>
  `;
}

function vehicleTrackingDemoStatusMeta(status) {
  return DEMO_VEHICLE_TRACKING_STATUS_META[status] || { label: "Demo", tone: "waiting" };
}

function vehicleTrackingDemoStatusLabel(status) {
  return vehicleTrackingDemoStatusMeta(status).label;
}

function vehicleTrackingDemoStatusTone(status) {
  return vehicleTrackingDemoStatusMeta(status).tone;
}

function vehicleTrackingMarkerStatusKey(status = "") {
  const normalized = String(status || "").trim().toLowerCase().replace(/-/g, "_");

  if (["standing", "stopped"].includes(normalized)) {
    return normalized;
  }

  if (["offline", "off"].includes(normalized)) {
    return "offline";
  }

  if (["out_of_route", "off_route"].includes(normalized)) {
    return "out_of_route";
  }

  if (["no_signal", "service", "moving"].includes(normalized)) {
    return normalized;
  }

  return normalized || "no_signal";
}

function vehicleTrackingMarkerTone(status = "") {
  const statusKey = vehicleTrackingMarkerStatusKey(status);
  if (statusKey === "out_of_route") {
    return "off-route";
  }
  if (statusKey === "offline") {
    return "offline";
  }
  return vehicleTrackingStatusTone(statusKey);
}

function vehicleTrackingMarkerLabel(vehicle = {}, fallback = "KS") {
  const label = vehicle.shortLabel
    || vehicle.internalNumber
    || vehicle.licensePlate
    || vehicle.tcarsVehicleId
    || vehicle.externalVehicleId
    || fallback;

  return String(label || fallback).trim().replace(/\s+/g, "");
}

function vehicleTrackingIconTypeForVehicle(vehicle = {}) {
  return vehicleTrackingIconForType(
    vehicle.iconType
      || vehicle.vehicleType
      || vehicle.type
      || vehicle.bodyType
      || vehicle.vehicle?.vehicleType
      || vehicle.vehicle?.type
      || ""
  );
}

function vehicleTrackingMarkerImageSrc(vehicle = {}, options = {}) {
  const mappedImage = vehicleTrackingIconTypeForVehicle(vehicle)?.primary || "";
  const explicitImage = options.imageSrc || vehicle.iconSrc || vehicle.iconUrl || vehicle.imageSrc || "";
  return mappedImage || explicitImage;
}

function vehicleTrackingMarkerContent(vehicle = {}, options = {}) {
  const statusKey = vehicleTrackingMarkerStatusKey(options.status || vehicle.status || vehicle.baseStatus);
  const tone = options.tone || vehicleTrackingMarkerTone(statusKey);
  const heading = Number(options.heading ?? vehicle.heading ?? 0);
  const safeHeading = Number.isFinite(heading) ? heading : 0;
  const label = options.label || vehicleTrackingMarkerLabel(vehicle);
  const statusLabel = options.statusLabel || vehicleTrackingStatusLabel(statusKey);
  const iconType = vehicleTrackingIconTypeForVehicle(vehicle);
  const imageSrc = vehicleTrackingMarkerImageSrc(vehicle, options);
  const hasImage = Boolean(imageSrc);
  const isAlert = options.isAlert ?? tone === "off-route";
  const vehicleTitle = [
    vehicle.internalNumber || label,
    vehicle.licensePlate,
    statusLabel
  ].filter(Boolean).join(" | ");

  return `
    <span
      class="tracking-vehicle-marker tracking-vehicle-marker--${escapeHtml(tone)} ${hasImage ? "tracking-vehicle-marker--has-image" : "tracking-vehicle-marker--missing-icon"} ${isAlert ? "tracking-vehicle-marker--alert" : ""} ${options.selected ? "tracking-vehicle-marker--selected" : ""}"
      title="${escapeHtml(vehicleTitle || statusLabel)}"
      data-tracking-vehicle-marker
      data-tracking-icon-type="${escapeHtml(iconType?.key || "fallback")}"
      style="--heading: ${safeHeading.toFixed(2)}deg;"
    >
      <span class="tracking-vehicle-marker__asset" aria-hidden="true">
        ${hasImage ? `<img class="tracking-map-vehicle-icon tracking-vehicle-marker__image" src="${escapeHtml(imageSrc)}" alt="" loading="eager" decoding="async" data-tracking-vehicle-icon>` : ""}
        <span class="tracking-vehicle-marker__fallback">KS</span>
      </span>
      <span class="tracking-map-vehicle-label tracking-vehicle-marker__label">${escapeHtml(label)}</span>
      ${isAlert ? `<span class="tracking-vehicle-marker__alert">ALERT</span>` : ""}
    </span>
  `;
}

function vehicleTrackingAction(label, href = "") {
  if (!href) {
    return `<button class="secondary-link tracking-disabled-action" type="button" disabled>${escapeHtml(label)}</button>`;
  }

  return `<a class="secondary-link" href="${routeHref(href)}" data-link>${escapeHtml(label)}</a>`;
}

function vehicleTrackingSourceModeMeta(modeId) {
  return VEHICLE_TRACKING_SOURCE_MODES.find((mode) => mode.id === modeId) || VEHICLE_TRACKING_SOURCE_MODES[0];
}

function vehicleTrackingSourceModeFromHash(hash = window.location.hash) {
  const normalizedHash = String(hash || "").trim();

  if (["#tracking-tcars-status", "#tracking-tcars-pairing", "#tracking-wim-sites", "#tracking-rules"].includes(normalizedHash)) {
    return "tcars";
  }

  if (["#tracking-map", "#tracking-list", "#tracking-detail"].includes(normalizedHash)) {
    return "demo";
  }

  return "";
}

function vehicleTrackingActiveSourceMode() {
  const hashMode = vehicleTrackingSourceModeFromHash();
  if (hashMode) {
    vehicleTrackingLiveState.sourceMode = hashMode;
    return hashMode;
  }

  return VEHICLE_TRACKING_SOURCE_MODES.some((mode) => mode.id === vehicleTrackingLiveState.sourceMode)
    ? vehicleTrackingLiveState.sourceMode
    : "demo";
}

function vehicleTrackingSourceModeHash(modeId) {
  return modeId === "tcars" ? "#tracking-tcars-status" : "#tracking-map";
}

function vehicleTrackingTabs(activeView = "map", sourceMode = vehicleTrackingActiveSourceMode()) {
  const tabs = sourceMode === "tcars"
    ? [
      { id: "tcars-status", label: "T-Cars stav", href: "#tracking-tcars-status" },
      { id: "wim-sites", label: "WIM váhy", href: "#tracking-wim-sites" },
      { id: "tcars-pairing", label: "Párování", href: "#tracking-tcars-pairing" },
      { id: "rules", label: "Pravidla", href: "#tracking-rules" },
      { id: "api", label: "API", href: "#tracking-api" }
    ]
    : [
      { id: "map", label: "Demo mapa", href: "#tracking-map" },
      { id: "list", label: "Vozidla", href: "#tracking-list" },
      { id: "detail", label: "Detail", href: "#tracking-detail" },
      { id: "api", label: "Budoucí API", href: "#tracking-api" }
    ];

  return `
    <nav class="tracking-tabs" aria-label="Menu modulu Sledování vozidel">
      ${tabs.map((tab) => `
        <a class="tracking-tab ${tab.id === activeView ? "tracking-tab--active" : ""}" href="${escapeHtml(tab.href)}">
          ${escapeHtml(tab.label)}
        </a>
      `).join("")}
    </nav>
  `;
}

function vehicleTrackingSourceModePanel() {
  const activeMode = vehicleTrackingActiveSourceMode();

  return `
    <section class="tracking-source-panel" aria-labelledby="tracking-source-title">
      <div>
        <p class="module-detail__eyebrow">Zdroj polohy</p>
        <h2 id="tracking-source-title">T-Cars je primární GPS zdroj</h2>
        <p>${escapeHtml(VEHICLE_TRACKING_TABLET_ROLE)}</p>
      </div>
      <div class="tracking-source-modes" role="group" aria-label="Režim sledování vozidel">
        ${VEHICLE_TRACKING_SOURCE_MODES.map((mode) => {
          const isFallback = mode.id === "fallback";
          const isActive = mode.id === activeMode;
          const content = `
              <strong>${escapeHtml(mode.label)}</strong>
              <span>${escapeHtml(mode.badge)}</span>
              <small>${escapeHtml(mode.description)}</small>
          `;

          if (isFallback) {
            return `
            <button
              class="tracking-source-mode ${isActive ? "tracking-source-mode--active" : ""} ${isFallback ? "tracking-source-mode--passive" : ""}"
              type="button"
              data-tracking-source-mode="${escapeHtml(mode.id)}"
              aria-pressed="${isActive ? "true" : "false"}"
              disabled
            >
              ${content}
            </button>
          `;
          }

          return `
            <a
              class="tracking-source-mode ${isActive ? "tracking-source-mode--active" : ""}"
              href="${escapeHtml(vehicleTrackingSourceModeHash(mode.id))}"
              data-tracking-source-mode="${escapeHtml(mode.id)}"
              aria-pressed="${isActive ? "true" : "false"}"
            >
              ${content}
            </a>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function vehicleTrackingDemoCurrentTime() {
  return window.performance?.now?.() || Date.now();
}

function vehicleTrackingDemoCurrentFullElapsed(now = vehicleTrackingDemoCurrentTime()) {
  if (!vehicleTrackingDemoState.running) {
    return vehicleTrackingDemoState.pausedElapsedMs;
  }

  if (!vehicleTrackingDemoState.startedAt) {
    vehicleTrackingDemoState.startedAt = now - vehicleTrackingDemoState.pausedElapsedMs;
  }

  return Math.max(0, now - vehicleTrackingDemoState.startedAt);
}

function vehicleTrackingDemoCurrentElapsed(now = vehicleTrackingDemoCurrentTime()) {
  const fullElapsed = vehicleTrackingDemoCurrentFullElapsed(now);
  const loopIndex = Math.floor(fullElapsed / DEMO_VEHICLE_TRACKING_LOOP_MS);
  if (loopIndex !== vehicleTrackingDemoState.lastLoopIndex) {
    vehicleTrackingDemoState.lastLoopIndex = loopIndex;
    vehicleTrackingDemoState.mutedForLoop = false;
  }

  return fullElapsed % DEMO_VEHICLE_TRACKING_LOOP_MS;
}

function vehicleTrackingDemoPhase(elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  return DEMO_VEHICLE_TRACKING_PHASES.find((phase) => elapsedMs >= phase.fromMs && elapsedMs < phase.toMs)
    || DEMO_VEHICLE_TRACKING_PHASES[0];
}

function vehicleTrackingDemoIsAlertActive(elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  return elapsedMs >= DEMO_VEHICLE_TRACKING_ALERT_START_MS
    && elapsedMs < DEMO_VEHICLE_TRACKING_ALERT_END_MS;
}

function vehicleTrackingDemoIsVehicleOffRoute(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  return vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId
    && elapsedMs >= DEMO_VEHICLE_TRACKING_DEVIATION_START_MS;
}

function vehicleTrackingDemoStatus(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  if (vehicleTrackingDemoIsVehicleOffRoute(vehicle, elapsedMs)) {
    return "off_route";
  }

  return vehicle.baseStatus || "moving";
}

function vehicleTrackingDemoProjectPoint(point) {
  const { minLat, maxLat, minLng, maxLng } = DEMO_VEHICLE_TRACKING_BOUNDS;
  const x = ((point.lng - minLng) / (maxLng - minLng)) * 100;
  const y = ((maxLat - point.lat) / (maxLat - minLat)) * 100;

  return {
    x: Math.min(96, Math.max(4, x)),
    y: Math.min(96, Math.max(4, y))
  };
}

function vehicleTrackingDemoRouteDistance(route) {
  return route.slice(0, -1).reduce((total, point, index) => {
    const next = route[index + 1];
    return total + Math.hypot(next.lat - point.lat, next.lng - point.lng);
  }, 0);
}

function vehicleTrackingDemoInterpolateRoute(route, progress) {
  if (!route.length) {
    return { lat: 0, lng: 0 };
  }

  if (route.length === 1) {
    return route[0];
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const targetDistance = vehicleTrackingDemoRouteDistance(route) * clampedProgress;
  let walked = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentDistance = Math.hypot(end.lat - start.lat, end.lng - start.lng);
    if (walked + segmentDistance >= targetDistance) {
      const localProgress = segmentDistance ? (targetDistance - walked) / segmentDistance : 0;
      return {
        lat: start.lat + ((end.lat - start.lat) * localProgress),
        lng: start.lng + ((end.lng - start.lng) * localProgress)
      };
    }
    walked += segmentDistance;
  }

  return route[route.length - 1];
}

function vehicleTrackingDemoPartialRoute(route, progress) {
  if (route.length <= 1) {
    return route;
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const target = vehicleTrackingDemoInterpolateRoute(route, clampedProgress);
  const targetDistance = vehicleTrackingDemoRouteDistance(route) * clampedProgress;
  let walked = 0;
  const partial = [route[0]];

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentDistance = Math.hypot(end.lat - start.lat, end.lng - start.lng);
    if (walked + segmentDistance >= targetDistance) {
      partial.push(target);
      break;
    }
    partial.push(end);
    walked += segmentDistance;
  }

  return partial;
}

function vehicleTrackingDemoHeading(route, progress) {
  if (route.length <= 1) {
    return 0;
  }

  const lookBehind = vehicleTrackingDemoProjectPoint(vehicleTrackingDemoInterpolateRoute(route, Math.max(0, progress - 0.02)));
  const lookAhead = vehicleTrackingDemoProjectPoint(vehicleTrackingDemoInterpolateRoute(route, Math.min(1, progress + 0.02)));
  return Math.atan2(lookAhead.y - lookBehind.y, lookAhead.x - lookBehind.x) * (180 / Math.PI);
}

function vehicleTrackingDemoVehicleProgress(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  if ((vehicle.baseStatus || "moving") === "stopped") {
    return 0;
  }

  if (vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId) {
    if (elapsedMs < DEMO_VEHICLE_TRACKING_DEVIATION_START_MS) {
      return Math.min(0.72, elapsedMs / DEMO_VEHICLE_TRACKING_DEVIATION_START_MS * 0.72);
    }
    if (elapsedMs < DEMO_VEHICLE_TRACKING_ALERT_START_MS) {
      return 0.72 + (((elapsedMs - DEMO_VEHICLE_TRACKING_DEVIATION_START_MS) / (DEMO_VEHICLE_TRACKING_ALERT_START_MS - DEMO_VEHICLE_TRACKING_DEVIATION_START_MS)) * 0.28);
    }
    return 1;
  }

  const loopProgress = elapsedMs / DEMO_VEHICLE_TRACKING_LOOP_MS;
  return (vehicle.progressOffset + (loopProgress * vehicle.progressScale)) % 1;
}

function vehicleTrackingDemoActiveRoute(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  if (vehicleTrackingDemoIsVehicleOffRoute(vehicle, elapsedMs) && vehicle.deviationRoute?.length) {
    return vehicle.deviationRoute;
  }

  return vehicle.actualRoute || vehicle.plannedRoute;
}

function vehicleTrackingDemoPosition(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  const route = vehicleTrackingDemoActiveRoute(vehicle, elapsedMs);
  const progress = vehicleTrackingDemoVehicleProgress(vehicle, elapsedMs);
  const point = vehicleTrackingDemoInterpolateRoute(route, progress);
  const projected = vehicleTrackingDemoProjectPoint(point);
  const status = vehicleTrackingDemoStatus(vehicle, elapsedMs);
  const moving = status !== "stopped";
  const speedKmh = moving
    ? Math.max(8, Math.round(vehicle.speedKmh + (Math.sin(elapsedMs / 1250 + progress) * vehicle.speedWave)))
    : 0;

  return {
    ...projected,
    lat: point.lat,
    lng: point.lng,
    heading: moving ? vehicleTrackingDemoHeading(route, progress) : 0,
    progress,
    status,
    speedKmh
  };
}

function vehicleTrackingDemoVisibleVehicles() {
  if (vehicleTrackingDemoState.filter === "all") {
    return DEMO_VEHICLE_TRACKING_VEHICLES;
  }

  const elapsedMs = vehicleTrackingDemoCurrentElapsed();
  return DEMO_VEHICLE_TRACKING_VEHICLES.filter((vehicle) => vehicleTrackingDemoStatus(vehicle, elapsedMs) === vehicleTrackingDemoState.filter);
}

function vehicleTrackingDemoSelectedVehicle(preferredId = "", visibleVehicles = vehicleTrackingDemoVisibleVehicles()) {
  const preferred = DEMO_VEHICLE_TRACKING_VEHICLES.find((vehicle) => vehicle.id === preferredId);
  if (preferred && visibleVehicles.some((vehicle) => vehicle.id === preferred.id)) {
    return preferred;
  }

  const current = DEMO_VEHICLE_TRACKING_VEHICLES.find((vehicle) => vehicle.id === vehicleTrackingDemoState.selectedVehicleId);
  if (current && visibleVehicles.some((vehicle) => vehicle.id === current.id)) {
    return current;
  }

  return visibleVehicles[0] || null;
}

function vehicleTrackingDemoVehicleSummary(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  const position = vehicleTrackingDemoPosition(vehicle, elapsedMs);
  const status = vehicleTrackingDemoStatus(vehicle, elapsedMs);
  const offRoute = status === "off_route";
  return {
    ...vehicle,
    speedNow: position.speedKmh,
    deviationText: offRoute ? `${vehicle.deviationMeters || DEMO_VEHICLE_TRACKING_ALERT.distanceMeters} m` : "0 m",
    isAlertVehicle: vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId,
    isOffRoute: offRoute,
    tone: vehicleTrackingDemoStatusTone(status),
    status,
    statusLabel: vehicleTrackingDemoStatusLabel(status)
  };
}

function vehicleTrackingDemoRouteSegments(vehicle, elapsedMs = vehicleTrackingDemoCurrentElapsed(), routeType = "planned") {
  const route = routeType === "actual"
    ? vehicleTrackingDemoPartialRoute(
      vehicleTrackingDemoActiveRoute(vehicle, elapsedMs),
      vehicleTrackingDemoVehicleProgress(vehicle, elapsedMs)
    )
    : vehicle.plannedRoute;
  const tone = routeType === "actual"
    ? vehicleTrackingDemoStatusTone(vehicleTrackingDemoStatus(vehicle, elapsedMs))
    : "planned";

  return route.slice(0, -1).map((point, index) => {
    const start = vehicleTrackingDemoProjectPoint(point);
    const end = vehicleTrackingDemoProjectPoint(route[index + 1]);
    const width = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);

    return `
      <span
        class="tracking-demo-route-segment tracking-demo-route-segment--${escapeHtml(tone)} tracking-demo-route-segment--${escapeHtml(routeType)}"
        style="left: ${start.x.toFixed(2)}%; top: ${start.y.toFixed(2)}%; width: ${width.toFixed(2)}%; transform: rotate(${angle.toFixed(2)}deg);"
        aria-hidden="true"
      ></span>
    `;
  }).join("");
}

function vehicleTrackingDemoPlaceLabels() {
  return DEMO_VEHICLE_TRACKING_PLACES.map((place) => {
    const point = vehicleTrackingDemoProjectPoint(place);
    return `
      <span class="tracking-demo-place" style="left: ${point.x.toFixed(2)}%; top: ${point.y.toFixed(2)}%;">
        ${escapeHtml(place.label)}
      </span>
    `;
  }).join("");
}

function vehicleTrackingDemoMarker(vehicle, selectedVehicle, elapsedMs) {
  const position = vehicleTrackingDemoPosition(vehicle, elapsedMs);
  const summary = vehicleTrackingDemoVehicleSummary(vehicle, elapsedMs);
  const isSelected = selectedVehicle?.id === vehicle.id;

  return `
    <button
      class="tracking-demo-marker tracking-demo-marker--${escapeHtml(summary.tone)} ${summary.isOffRoute ? "tracking-demo-marker--alert" : ""} ${isSelected ? "tracking-demo-marker--selected" : ""}"
      type="button"
      style="--x: ${position.x.toFixed(2)}%; --y: ${position.y.toFixed(2)}%; --heading: ${position.heading.toFixed(2)}deg;"
      data-tracking-demo-marker="${escapeHtml(vehicle.id)}"
      data-tracking-demo-select="${escapeHtml(vehicle.id)}"
      data-tracking-demo-marker-status="${escapeHtml(vehicle.id)}"
      aria-label="${escapeHtml(`${vehicle.internalNumber} ${summary.statusLabel} Demo data`)}"
    >
      ${vehicleTrackingMarkerContent(vehicle, {
        heading: position.heading,
        imageSrc: vehicle.imageSrc,
        isAlert: summary.isOffRoute,
        label: vehicle.shortLabel,
        selected: isSelected,
        status: summary.status,
        statusLabel: summary.statusLabel,
        tone: summary.tone
      })}
    </button>
  `;
}

function vehicleTrackingDemoControls() {
  return `
    <div class="tracking-demo-controls" aria-label="Ovládání demo režimu">
      <button class="primary-action" type="button" data-tracking-demo-control="sound">
        Spustit demo se zvukem
      </button>
      <button class="secondary-link" type="button" data-tracking-demo-control="toggle">
        ${vehicleTrackingDemoState.running ? "Pozastavit demo" : "Spustit demo"}
      </button>
      <button class="secondary-link" type="button" data-tracking-demo-control="reset">Reset demo</button>
      <button class="secondary-link" type="button" data-tracking-demo-control="mute">Ztišit výstrahu</button>
    </div>
  `;
}

function vehicleTrackingDemoBanner() {
  const [title, description] = DEMO_VEHICLE_TRACKING_NOTICE.split(" – ");

  return `
    <section class="tracking-demo-banner" aria-label="Označení demo režimu">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description || DEMO_VEHICLE_TRACKING_NOTICE)}</span>
    </section>
  `;
}

function vehicleTrackingDemoGoogleMapsKey() {
  return String(runtimeConfig.googleMapsApiKey || "").trim();
}

function vehicleTrackingDemoScenarioPanel(elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  const phase = vehicleTrackingDemoPhase(elapsedMs);
  const seconds = Math.floor(elapsedMs / 1000);

  return `
    <div class="tracking-demo-scenario" data-tracking-demo-scenario>
      <span>Scénář ${seconds}s / ${Math.round(DEMO_VEHICLE_TRACKING_LOOP_MS / 1000)}s</span>
      <strong data-tracking-demo-phase>${escapeHtml(phase.label)}</strong>
      <small data-tracking-demo-phase-description>${escapeHtml(phase.description)}</small>
    </div>
  `;
}

function vehicleTrackingDemoAlertOverlay(elapsedMs = vehicleTrackingDemoCurrentElapsed()) {
  const active = vehicleTrackingDemoIsAlertActive(elapsedMs);

  return `
    <div class="tracking-demo-alert ${active ? "tracking-demo-alert--active" : ""}" data-tracking-demo-alert aria-live="polite">
      <div class="tracking-demo-alert__symbol" aria-hidden="true">!</div>
      <div>
        <strong>${escapeHtml(DEMO_VEHICLE_TRACKING_ALERT.title)}: ${escapeHtml(DEMO_VEHICLE_TRACKING_ALERT.text)}</strong>
        <span>${escapeHtml(DEMO_VEHICLE_TRACKING_ALERT.detail)}</span>
      </div>
      <div class="tracking-demo-alert__actions">
        <button class="secondary-link secondary-link--danger" type="button" data-tracking-demo-control="focus-alert">Zobrazit vozidlo</button>
        <button class="secondary-link" type="button" data-tracking-demo-control="mute">Ztišit výstrahu</button>
      </div>
    </div>
  `;
}

function vehicleTrackingDemoMapNotice() {
  return `
    <div class="tracking-demo-map-notice" aria-live="polite">
      <strong>${escapeHtml(DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_WAITING)}</strong>
      <span>${escapeHtml(DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_FALLBACK)}</span>
    </div>
  `;
}

function vehicleTrackingMapSection(visibleVehicles, selectedVehicle) {
  const elapsedMs = vehicleTrackingDemoCurrentElapsed();
  const hasGoogleMapsKey = Boolean(vehicleTrackingDemoGoogleMapsKey());

  return `
    <section class="tracking-section tracking-section--map tracking-demo-map-section" id="tracking-map" aria-labelledby="tracking-map-title">
      ${vehicleTrackingSectionHeader(
        "tracking-map-title",
        hasGoogleMapsKey ? "Google mapa vozidel" : "Demo mapa vozidel",
        hasGoogleMapsKey
          ? "Mapový podklad používá Google Maps. Vozidla a trasy jsou pořád pouze demo data."
          : "Demo mapa běží v náhradním režimu bez Google podkladu.",
        { badgeText: hasGoogleMapsKey ? "Google Maps + demo data" : DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_WAITING }
      )}
      ${vehicleTrackingDemoControls()}
      ${vehicleTrackingDemoScenarioPanel(elapsedMs)}
      ${hasGoogleMapsKey ? "" : vehicleTrackingDemoMapNotice()}
      <div class="tracking-map-shell tracking-demo-map ${hasGoogleMapsKey ? "tracking-demo-map--google" : "tracking-demo-map--fallback"}" data-tracking-demo-map aria-label="Demo mapový pohled sledování vozidel">
        ${hasGoogleMapsKey
          ? `<div class="tracking-google-map" data-tracking-google-map aria-label="Google mapa demo sledování vozidel"></div>`
          : `
            <div class="tracking-demo-road tracking-demo-road--one" aria-hidden="true"></div>
            <div class="tracking-demo-road tracking-demo-road--two" aria-hidden="true"></div>
            <div class="tracking-demo-road tracking-demo-road--three" aria-hidden="true"></div>
            ${visibleVehicles.map((vehicle) => vehicleTrackingDemoRouteSegments(vehicle, elapsedMs, "planned")).join("")}
            ${visibleVehicles.map((vehicle) => vehicleTrackingDemoRouteSegments(vehicle, elapsedMs, "actual")).join("")}
            ${vehicleTrackingDemoPlaceLabels()}
            ${visibleVehicles.map((vehicle) => vehicleTrackingDemoMarker(vehicle, selectedVehicle, elapsedMs)).join("")}
          `}
        ${vehicleTrackingDemoAlertOverlay(elapsedMs)}
      </div>
      <div class="tracking-status-legend" aria-label="Stavy demo vozidel">
        ${DEMO_VEHICLE_TRACKING_STATUS_FILTERS.filter((filter) => filter.value !== "all").map((filter) => `
          <span class="tracking-status tracking-status--${escapeHtml(vehicleTrackingDemoStatusTone(filter.value))}">
            ${escapeHtml(filter.label)}
          </span>
        `).join("")}
      </div>
    </section>
  `;
}

function vehicleTrackingDemoFilters() {
  return `
    <div class="tracking-demo-filterbar" aria-label="Filtry demo vozidel">
      ${DEMO_VEHICLE_TRACKING_STATUS_FILTERS.map((filter) => `
        <button
          class="tracking-demo-filter ${vehicleTrackingDemoState.filter === filter.value ? "tracking-demo-filter--active" : ""}"
          type="button"
          data-tracking-demo-filter="${escapeHtml(filter.value)}"
        >
          ${escapeHtml(filter.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function vehicleTrackingDemoVehicleImage(vehicle, className = "") {
  if (!vehicle.imageSrc) {
    return "";
  }

  return `
    <figure class="tracking-demo-vehicle-image ${escapeHtml(className)}">
      <img src="${escapeHtml(vehicle.imageSrc)}" alt="${escapeHtml(vehicle.imageAlt || `${vehicle.internalNumber} demo vozidlo`)}" loading="lazy" decoding="async">
    </figure>
  `;
}

function vehicleTrackingDemoVehicleCard(vehicle, selectedVehicle, elapsedMs) {
  const summary = vehicleTrackingDemoVehicleSummary(vehicle, elapsedMs);
  const isSelected = selectedVehicle?.id === vehicle.id;

  return `
    <article class="tracking-demo-vehicle-card ${summary.isOffRoute ? "tracking-demo-vehicle-card--alert" : ""} ${isSelected ? "tracking-demo-vehicle-card--selected" : ""}" data-tracking-demo-card="${escapeHtml(vehicle.id)}">
      <div class="tracking-demo-vehicle-card__head">
        <div>
          <strong>${escapeHtml(vehicle.internalNumber)}</strong>
          <span>${escapeHtml(vehicle.licensePlate)}</span>
        </div>
        <span class="tracking-demo-data-badge">Demo data</span>
      </div>
      ${vehicleTrackingDemoVehicleImage(vehicle, "tracking-demo-vehicle-image--card")}
      <div class="tracking-demo-vehicle-meta">
        <span>${escapeHtml(vehicle.driver)}</span>
        <span>${escapeHtml(vehicle.type)}</span>
      </div>
      <div class="tracking-demo-vehicle-status">
        <span class="tracking-status tracking-status--${escapeHtml(summary.tone)}" data-tracking-demo-status="${escapeHtml(vehicle.id)}">${escapeHtml(summary.statusLabel)}</span>
        <span data-tracking-demo-speed="${escapeHtml(vehicle.id)}">${escapeHtml(`${summary.speedNow} km/h`)}</span>
        <span data-tracking-demo-updated="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.lastUpdate)}</span>
        <span data-tracking-demo-deviation="${escapeHtml(vehicle.id)}">${escapeHtml(summary.isOffRoute ? `Odchylka ${summary.deviationText}` : "Odchylka 0 m")}</span>
      </div>
      <button class="secondary-link" type="button" data-tracking-demo-select="${escapeHtml(vehicle.id)}">Detail</button>
    </article>
  `;
}

function vehicleTrackingListSection(visibleVehicles, selectedVehicle) {
  const elapsedMs = vehicleTrackingDemoCurrentElapsed();

  return `
    <section class="tracking-section tracking-demo-list-section" id="tracking-list" aria-labelledby="tracking-list-title">
      ${vehicleTrackingSectionHeader(
        "tracking-list-title",
        "Sledování vozidel",
        "Boční panel ukazuje pouze demo data a stav aktuální 50s smyčky."
      )}
      ${vehicleTrackingDemoFilters()}
      <div class="tracking-demo-vehicle-list" aria-label="Seznam demo vozidel">
        ${visibleVehicles.length
          ? visibleVehicles.map((vehicle) => vehicleTrackingDemoVehicleCard(vehicle, selectedVehicle, elapsedMs)).join("")
          : `<div class="tracking-empty"><strong>${escapeHtml(VEHICLE_TRACKING_EMPTY)}</strong><span>Ve vybraném demo filtru není žádné vozidlo.</span></div>`}
      </div>
    </section>
  `;
}

function vehicleTrackingDemoDetailField(label, value, options = {}) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${options.raw ? (value || "—") : escapeHtml(value || "—")}</strong>
    </article>
  `;
}

function vehicleTrackingDetailSection(selectedVehicle) {
  if (!selectedVehicle) {
    return `
      <section class="tracking-section" id="tracking-detail" aria-labelledby="tracking-detail-title">
        ${vehicleTrackingSectionHeader("tracking-detail-title", "Detail demo vozidla", "Vyberte vozidlo ze seznamu nebo mapy.")}
        <div class="tracking-empty">
          <strong>Žádné vozidlo není vybrané.</strong>
          <span>Změňte filtr nebo klikněte na marker v demo mapě.</span>
        </div>
      </section>
    `;
  }

  const summary = vehicleTrackingDemoVehicleSummary(selectedVehicle);

  return `
    <section class="tracking-section tracking-demo-detail-section" id="tracking-detail" aria-labelledby="tracking-detail-title">
      ${vehicleTrackingSectionHeader(
        "tracking-detail-title",
        `Detail ${selectedVehicle.internalNumber}`,
        "Detail je pouze demo ukázka pro budoucí napojení na cloud API."
      )}
      <div class="tracking-demo-detail-title">
        <span class="tracking-demo-data-badge">Demo data</span>
        <span class="tracking-status tracking-status--${escapeHtml(summary.tone)}" data-tracking-demo-detail-status>${escapeHtml(summary.statusLabel)}</span>
      </div>
      ${summary.isOffRoute ? `
        <div class="tracking-demo-detail-alert" data-tracking-demo-detail-alert>
          Vozidlo je mimo plánovanou trasu.
        </div>
      ` : `<div class="tracking-demo-detail-alert" data-tracking-demo-detail-alert hidden>Vozidlo je mimo plánovanou trasu.</div>`}
      ${vehicleTrackingDemoVehicleImage(selectedVehicle, "tracking-demo-vehicle-image--detail")}
      <div class="tracking-detail-grid">
        ${vehicleTrackingDemoDetailField("Interní číslo", selectedVehicle.internalNumber)}
        ${vehicleTrackingDemoDetailField("SPZ", selectedVehicle.licensePlate)}
        ${vehicleTrackingDemoDetailField("Řidič", selectedVehicle.driver)}
        ${vehicleTrackingDemoDetailField("Typ vozidla", selectedVehicle.type)}
        ${vehicleTrackingDemoDetailField("Stav", `<span data-tracking-demo-detail-status-text>${escapeHtml(summary.statusLabel)}</span>`, { raw: true })}
        ${vehicleTrackingDemoDetailField("Demo rychlost", `<span data-tracking-demo-detail-speed>${escapeHtml(`${summary.speedNow} km/h`)}</span>`, { raw: true })}
        ${vehicleTrackingDemoDetailField("Poslední aktualizace", selectedVehicle.lastUpdate)}
        ${vehicleTrackingDemoDetailField("Přesnost GPS", selectedVehicle.accuracy)}
        ${vehicleTrackingDemoDetailField("Zdroj", selectedVehicle.source)}
        ${vehicleTrackingDemoDetailField("Plánovaná trasa", selectedVehicle.routeName)}
        ${vehicleTrackingDemoDetailField("Skutečná trasa", summary.isOffRoute ? "Komárov → odbočka mimo trasu" : selectedVehicle.routeName)}
        ${vehicleTrackingDemoDetailField("Odchylka od trasy", `<span data-tracking-demo-detail-deviation>${escapeHtml(summary.deviationText)}</span>`, { raw: true })}
      </div>
      <div class="tracking-actions">
        <button class="secondary-link tracking-disabled-action" type="button" disabled>Čeká na API pro detail vozidla.</button>
      </div>
    </section>
  `;
}

const VEHICLE_TRACKING_TCARS_MAX_GPS_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const VEHICLE_TRACKING_TCARS_MARKER_ICON_SRC = "/vehicles/icons/osobni.png";

function vehicleTrackingTcarsConfigItems(status = {}) {
  const config = status.config || {};
  const locationGroups = vehicleTrackingTcarsLocationGroups(status);
  return [
    { label: "T-Cars konfigurace", value: status.configured ? "Nastavená" : "Čeká na Cloudflare Secrets" },
    { label: "API URL", value: config.baseUrl || "https://webservice.t-cars.cz/v2/" },
    { label: "SOAP endpoint", value: config.endpointUrl || "https://webservice.t-cars.cz/v2/index.php" },
    { label: "Zákaznické číslo", value: config.hasCustomerNumber ? "Uloženo v Cloudflare" : "Čeká na TCARS_CUSTOMER_NUMBER" },
    { label: "Přístupy", value: config.hasCredentials ? "Uloženo v Cloudflare" : "Čeká na TCARS_USERNAME / TCARS_PASSWORD nebo TCARS_API_TOKEN" },
    { label: "API režim", value: config.apiMode || "Čeká na TCARS_API_MODE" },
    { label: "API dokumentace", value: config.documentationStatus === "verified-wsdl" ? "WSDL ověřeno" : "Chybí" },
    { label: "Načtená vozidla", value: String(locationGroups.vehicleCount) },
    { label: "Aktuální polohy", value: String(locationGroups.validLocations.length) },
    { label: "Bez validní polohy", value: String(locationGroups.invalidVehicles.length) },
    { label: "Poslední načtení", value: status.lastFetchedAt ? formatDateTime(status.lastFetchedAt) : "Zatím neproběhlo" },
    { label: "Interval načítání", value: `${status.pollIntervalSeconds || 60} s` },
    { label: "Zdroj", value: status.source || "T-Cars jednotka" }
  ];
}

function vehicleTrackingSafeDateTime(value) {
  if (!value) {
    return "neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return formatDateTime(value);
}

function vehicleTrackingCoordinateValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function vehicleTrackingTcarsLocationId(location = {}, index = 0) {
  return String(
    location.id
      || location.externalVehicleId
      || location.tcarsVehicleId
      || location.licensePlate
      || location.internalNumber
      || `tcars-location-${index}`
  );
}

function vehicleTrackingTcarsVehicleKey(item = {}) {
  const vehicle = item.vehicle || {};
  return String(
    item.externalVehicleId
      || item.tcarsVehicleId
      || item.vehicleId
      || item.vehicle_id
      || item.licensePlate
      || item.internalNumber
      || vehicle.externalVehicleId
      || vehicle.tcarsVehicleId
      || vehicle.vehicleId
      || vehicle.licensePlate
      || vehicle.internalNumber
      || item.id
      || vehicle.id
      || ""
  ).trim().toLowerCase();
}

function vehicleTrackingTcarsGpsDateValue(location = {}) {
  return location.lastGpsAt
    || location.gpsAt
    || location.positionAt
    || location.updatedAt
    || location.receivedAt
    || "";
}

function vehicleTrackingTcarsGpsDate(location = {}) {
  const value = vehicleTrackingTcarsGpsDateValue(location);
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function vehicleTrackingTcarsInvalidReason(location = {}) {
  const latitude = vehicleTrackingCoordinateValue(location.latitude);
  const longitude = vehicleTrackingCoordinateValue(location.longitude);

  if (latitude === null || longitude === null) {
    return "Neplatná poloha z T-Cars";
  }

  if (latitude === 0 || longitude === 0) {
    return "Neplatná poloha z T-Cars";
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return "Neplatná poloha z T-Cars";
  }

  const gpsDate = vehicleTrackingTcarsGpsDate(location);
  if (!gpsDate) {
    return "Neplatná poloha z T-Cars";
  }

  if (gpsDate.getFullYear() <= 1900) {
    return "Neplatná poloha z T-Cars";
  }

  if (Date.now() - gpsDate.getTime() > VEHICLE_TRACKING_TCARS_MAX_GPS_AGE_MS) {
    return "Neplatná poloha z T-Cars";
  }

  return "";
}

function vehicleTrackingTcarsLocations(status = {}) {
  return (Array.isArray(status.locations) ? status.locations : [])
    .map((location, index) => {
      const latitude = vehicleTrackingCoordinateValue(location.latitude);
      const longitude = vehicleTrackingCoordinateValue(location.longitude);
      const normalizedLocation = {
        ...location,
        latitude,
        longitude,
        _locationId: vehicleTrackingTcarsLocationId(location, index),
        _vehicleKey: vehicleTrackingTcarsVehicleKey(location)
      };
      return {
        ...normalizedLocation,
        _invalidReason: vehicleTrackingTcarsInvalidReason(normalizedLocation)
      };
    });
}

function vehicleTrackingTcarsVehicleList(status = {}) {
  return Array.isArray(status.vehicles) ? status.vehicles : [];
}

function vehicleTrackingTcarsInvalidVehicleEntry(vehicle = {}, invalidLocation = null, index = 0) {
  const merged = {
    ...(invalidLocation || {}),
    vehicle,
    internalNumber: invalidLocation?.internalNumber || vehicle.internalNumber || vehicle.licensePlate || "",
    licensePlate: invalidLocation?.licensePlate || vehicle.licensePlate || "",
    lastGpsAt: invalidLocation?.lastGpsAt || invalidLocation?.updatedAt || invalidLocation?.receivedAt || vehicle.lastGpsAt || vehicle.updatedAt || "",
    _invalidId: `invalid-${vehicleTrackingTcarsVehicleKey(vehicle) || index}`,
    _invalidReason: invalidLocation?._invalidReason || "Neplatná poloha z T-Cars"
  };
  return merged;
}

function vehicleTrackingTcarsLocationGroups(status = {}) {
  const allLocations = vehicleTrackingTcarsLocations(status);
  const validLocations = allLocations.filter((location) => !location._invalidReason);
  const invalidLocations = allLocations.filter((location) => location._invalidReason);
  const vehicles = vehicleTrackingTcarsVehicleList(status);
  const validVehicleKeys = new Set(validLocations.map((location) => location._vehicleKey).filter(Boolean));
  const invalidLocationByVehicle = new Map();

  for (const location of invalidLocations) {
    if (location._vehicleKey && !invalidLocationByVehicle.has(location._vehicleKey)) {
      invalidLocationByVehicle.set(location._vehicleKey, location);
    }
  }

  const invalidEntries = invalidLocations.map((location, index) => (
    vehicleTrackingTcarsInvalidVehicleEntry(location.vehicle || location, location, index)
  ));
  const invalidVehicleKeys = new Set(invalidLocations.map((location) => location._vehicleKey).filter(Boolean));
  const invalidVehicles = vehicles.length
    ? [
      ...invalidEntries,
      ...vehicles
      .map((vehicle, index) => {
        const vehicleKey = vehicleTrackingTcarsVehicleKey(vehicle);
        if (vehicleKey && (validVehicleKeys.has(vehicleKey) || invalidVehicleKeys.has(vehicleKey))) {
          return null;
        }
        return vehicleTrackingTcarsInvalidVehicleEntry(vehicle, invalidLocationByVehicle.get(vehicleKey), index);
      })
      .filter(Boolean)
    ]
    : invalidEntries;

  return {
    allLocations,
    invalidLocations,
    invalidVehicles,
    validLocations,
    vehicleCount: vehicles.length || allLocations.length
  };
}

function vehicleTrackingTcarsMapBounds(locations = []) {
  if (!locations.length) {
    return null;
  }

  const latitudes = locations.map((location) => location.latitude);
  const longitudes = locations.map((location) => location.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    latRange: Math.max(maxLat - minLat, 0.0001),
    lngRange: Math.max(maxLng - minLng, 0.0001)
  };
}

function vehicleTrackingTcarsMapPosition(location = {}, bounds = null) {
  if (!bounds) {
    return { x: 50, y: 50 };
  }

  const rawX = ((location.longitude - bounds.minLng) / bounds.lngRange) * 80 + 10;
  const rawY = ((bounds.maxLat - location.latitude) / bounds.latRange) * 80 + 10;

  return {
    x: Math.max(8, Math.min(92, rawX)),
    y: Math.max(8, Math.min(92, rawY))
  };
}

function vehicleTrackingWimSitesForMap() {
  return (Array.isArray(vehicleTrackingLiveState.wimSites) ? vehicleTrackingLiveState.wimSites : [])
    .map((site) => ({
      ...site,
      latitude: vehicleTrackingCoordinateValue(site.latitude),
      longitude: vehicleTrackingCoordinateValue(site.longitude)
    }))
    .filter((site) => site.latitude !== null && site.longitude !== null);
}

function vehicleTrackingWimStatusLabel(status = "", fallback = "") {
  const labels = {
    active: "v provozu",
    planned: "vystavba / plan",
    maintenance: "oprava",
    upgrade: "technologicky upgrade",
    preselection: "predvyber"
  };
  return labels[String(status || "").trim().toLowerCase()] || fallback || "neznamy stav";
}

function vehicleTrackingWimStatusTone(status = "") {
  const tones = {
    active: "moving",
    planned: "waiting",
    maintenance: "service",
    upgrade: "service",
    preselection: "off-route"
  };
  return tones[String(status || "").trim().toLowerCase()] || "waiting";
}

function vehicleTrackingWimSiteTitle(site = {}) {
  return [site.road, site.kmLabel, site.locationLabel].filter(Boolean).join(" ");
}

function vehicleTrackingWimSiteById(siteId) {
  const normalizedId = String(siteId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return vehicleTrackingWimSitesForMap().find((site) => site.id === normalizedId) || null;
}

function vehicleTrackingSelectedWimSite(sites = vehicleTrackingWimSitesForMap()) {
  if (!sites.length) {
    return null;
  }
  return sites.find((site) => site.id === vehicleTrackingLiveState.selectedWimSiteId) || sites[0];
}

function vehicleTrackingWimSiteTooltip(site = {}) {
  return [
    vehicleTrackingWimSiteTitle(site),
    `ORP: ${site.orp || "neuvedeno"}`,
    `Strana: ${site.sideLabel || "neuvedeno"}`,
    `Stav: ${site.statusLabel || vehicleTrackingWimStatusLabel(site.status)}`,
    `Zarizeni: ${site.deviceCount || site.devices?.length || 0}`,
    `Souradnice: ${Number(site.latitude).toFixed(5)}, ${Number(site.longitude).toFixed(5)}`,
    `Kvalita GPS: ${site.coordinateQuality || "needs-verification"}`
  ].join("\n");
}

function vehicleTrackingWimSummaryItems(summary = {}) {
  return [
    { label: "WIM lokalit", value: String(summary.sitesTotal || 0) },
    { label: "Smerovych vah", value: String(summary.devicesTotal || 0) },
    { label: "V provozu", value: String(summary.activeSites || 0) },
    { label: "Plan / vystavba", value: String(summary.plannedSites || 0) },
    { label: "Oprava / upgrade", value: String((summary.maintenanceSites || 0) + (summary.upgradeSites || 0)) },
    { label: "Alert vzdalenost", value: `${summary.alertDistanceKm || 15} km` }
  ];
}

function vehicleTrackingWimSiteDetail(site = null) {
  if (!site) {
    return `
      <div class="tracking-wim-detail tracking-wim-detail--empty" data-tracking-wim-detail>
        <strong>WIM mista zatim nejsou nactena.</strong>
        <span>${escapeHtml(VEHICLE_TRACKING_WIM_WAITING)}</span>
      </div>
    `;
  }

  const tone = vehicleTrackingWimStatusTone(site.status);
  const statusLabel = site.statusLabel || vehicleTrackingWimStatusLabel(site.status);
  const coordinates = `${Number(site.latitude).toFixed(5)}, ${Number(site.longitude).toFixed(5)}`;
  const devices = Array.isArray(site.devices) && site.devices.length
    ? site.devices.map((device) => `${device.side || "smer"} ${device.kmValue ? `km ${device.kmValue}` : ""}`.trim()).join(", ")
    : site.sideLabel || "neuvedeno";

  return `
    <div class="tracking-wim-detail" data-tracking-wim-detail>
      <div class="tracking-wim-detail__head">
        <div>
          <strong>${escapeHtml(vehicleTrackingWimSiteTitle(site))}</strong>
          <span>${escapeHtml(site.orp || "ORP neuvedeno")}</span>
        </div>
        <span class="tracking-status tracking-status--${escapeHtml(tone)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="tracking-detail-grid tracking-detail-grid--compact">
        ${vehicleTrackingDemoDetailField("Komunikace", site.road || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Kilometrovnik", site.kmLabel || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Misto", site.locationLabel || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("ORP", site.orp || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Strana / zarizeni", site.sideLabel || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Pocet smerovych vah", String(site.deviceCount || site.devices?.length || 0))}
        ${vehicleTrackingDemoDetailField("Zarizeni", devices)}
        ${vehicleTrackingDemoDetailField("Souradnice", coordinates)}
        ${vehicleTrackingDemoDetailField("Kvalita GPS", site.coordinateQuality || "needs-verification")}
        ${vehicleTrackingDemoDetailField("Zdroj", site.sourceLabel || "MD/RSD PDF mapa")}
      </div>
      <p class="tracking-wim-note">${escapeHtml(site.note || "Souradnice jsou orientacni a cekaji na finalni overeni proti oficialnimu podkladu.")}</p>
    </div>
  `;
}

function syncVehicleTrackingWimSelectionDom(siteId) {
  const site = vehicleTrackingWimSiteById(siteId);
  if (!site) {
    return false;
  }

  document.querySelectorAll(".tracking-wim-site-card").forEach((card) => {
    card.classList.toggle("tracking-wim-site-card--selected", card.dataset.trackingWimSelect === siteId);
  });

  const detail = document.querySelector("[data-tracking-wim-detail]");
  if (detail) {
    detail.outerHTML = vehicleTrackingWimSiteDetail(site);
  }

  return true;
}

function vehicleTrackingTcarsIconType(location = {}) {
  const vehicle = location.vehicle || {};
  const text = [
    location.iconType,
    location.vehicleType,
    location.type,
    location.bodyType,
    location.model,
    location.internalNumber,
    vehicle.iconType,
    vehicle.vehicleType,
    vehicle.type,
    vehicle.bodyType,
    vehicle.model,
    vehicle.internalNumber
  ].filter(Boolean).join(" ").toLowerCase();

  if (/kontej|container/.test(text)) {
    return "container_truck";
  }
  if (/dod[aá]v|van/.test(text)) {
    return "van";
  }
  if (/speci|bagr|stroj|technik/.test(text)) {
    return "special";
  }
  if (/osob|car/.test(text)) {
    return "car";
  }
  if (/p[řr][íi]v[eě]s|n[aá]v[eě]s|trailer/.test(text)) {
    return "trailer";
  }

  return "collection_truck";
}

function vehicleTrackingTcarsMarkerVehicle(location = {}) {
  const vehicle = location.vehicle || {};
  return {
    ...vehicle,
    ...location,
    iconType: vehicleTrackingTcarsIconType(location),
    internalNumber: location.internalNumber || vehicle.internalNumber || location.licensePlate || vehicle.licensePlate || location.externalVehicleId || "",
    licensePlate: location.licensePlate || vehicle.licensePlate || "",
    status: location.status || "no_signal",
    heading: vehicleTrackingCoordinateValue(location.heading) || 0
  };
}

function vehicleTrackingTcarsTextValue(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function vehicleTrackingTcarsVehicleBrand(location = {}) {
  const vehicle = location.vehicle || {};
  const fleetVehicle = location.fleetVehicle || location.pairedVehicle || {};
  return vehicleTrackingTcarsTextValue(
    location.brand,
    location.make,
    location.manufacturer,
    location.vehicleBrand,
    vehicle.brand,
    vehicle.make,
    vehicle.manufacturer,
    vehicle.vehicleBrand,
    fleetVehicle.brand,
    fleetVehicle.make,
    fleetVehicle.manufacturer,
    fleetVehicle.vehicleBrand
  );
}

function vehicleTrackingTcarsVehicleModel(location = {}) {
  const vehicle = location.vehicle || {};
  const fleetVehicle = location.fleetVehicle || location.pairedVehicle || {};
  return vehicleTrackingTcarsTextValue(
    location.model,
    location.vehicleModel,
    location.modelName,
    vehicle.model,
    vehicle.vehicleModel,
    vehicle.modelName,
    fleetVehicle.model,
    fleetVehicle.vehicleModel,
    fleetVehicle.modelName
  );
}

function vehicleTrackingTcarsVehicleDisplayName(location = {}) {
  const brand = vehicleTrackingTcarsVehicleBrand(location);
  const model = vehicleTrackingTcarsVehicleModel(location);
  return [brand, model].filter(Boolean).join(" ") || "Vozidlo";
}

function vehicleTrackingTcarsSpeedText(location = {}) {
  const speedValue = Number(location.speedKmh);
  return location.speedKmh !== null && location.speedKmh !== undefined && location.speedKmh !== "" && Number.isFinite(speedValue)
    ? `${speedValue} km/h`
    : "neuvedeno";
}

function vehicleTrackingTcarsMarkerTooltip(location = {}) {
  const markerVehicle = vehicleTrackingTcarsMarkerVehicle(location);
  return [
    vehicleTrackingTcarsVehicleDisplayName(location),
    markerVehicle.licensePlate ? `SPZ: ${markerVehicle.licensePlate}` : "SPZ: neuvedena",
    "Stav: Validní poloha",
    `Poslední GPS: ${vehicleTrackingSafeDateTime(vehicleTrackingTcarsGpsDateValue(location))}`,
    `Rychlost: ${vehicleTrackingTcarsSpeedText(location)}`
  ].join("\n");
}

function vehicleTrackingTcarsSelectedLocation(locations = []) {
  if (!locations.length) {
    return null;
  }

  return locations.find((location) => location._locationId === vehicleTrackingLiveState.selectedLocationId)
    || locations[0];
}

function vehicleTrackingTcarsLocationById(locationId) {
  const normalizedId = String(locationId || "").trim();
  if (!normalizedId) {
    return null;
  }

  return vehicleTrackingTcarsLocationGroups(vehicleTrackingLiveState.status || {})
    .validLocations
    .find((location) => location._locationId === normalizedId) || null;
}

function syncVehicleTrackingTcarsSelectionDom(locationId) {
  const selectedLocation = vehicleTrackingTcarsLocationById(locationId);
  if (!selectedLocation) {
    return false;
  }

  document.querySelectorAll(".tracking-tcars-location-card").forEach((card) => {
    card.classList.toggle(
      "tracking-tcars-location-card--selected",
      card.dataset.trackingTcarsSelect === locationId
    );
  });

  const detail = document.querySelector("[data-tracking-tcars-location-detail]");
  if (detail) {
    detail.outerHTML = vehicleTrackingTcarsLocationDetail(selectedLocation);
  }

  return true;
}

function vehicleTrackingTcarsLocationDetail(location = null) {
  if (!location) {
    return `
      <div class="tracking-tcars-location-detail tracking-tcars-location-detail--empty" data-tracking-tcars-location-detail>
        <strong>Nejsou dostupné žádné validní GPS polohy.</strong>
        <span>Mapa zůstává centrovaná na Brno a neplatné T-Cars polohy jsou oddělené mimo mapu.</span>
      </div>
    `;
  }

  const markerVehicle = vehicleTrackingTcarsMarkerVehicle(location);
  const displayName = vehicleTrackingTcarsVehicleDisplayName(location);
  const speed = vehicleTrackingTcarsSpeedText(location);
  const coordinates = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;

  return `
    <div class="tracking-tcars-location-detail" data-tracking-tcars-location-detail>
      <div class="tracking-tcars-location-detail__head">
        <div>
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml(markerVehicle.licensePlate || "SPZ neuvedena")}</span>
        </div>
        <span class="tracking-status tracking-status--moving">Validní poloha</span>
      </div>
      <div class="tracking-detail-grid tracking-detail-grid--compact">
        ${vehicleTrackingDemoDetailField("Značka/model", displayName)}
        ${vehicleTrackingDemoDetailField("SPZ", markerVehicle.licensePlate || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Rychlost", speed)}
        ${vehicleTrackingDemoDetailField("Poslední GPS", vehicleTrackingSafeDateTime(vehicleTrackingTcarsGpsDateValue(location)))}
        ${vehicleTrackingDemoDetailField("Adresa", location.address || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Souřadnice", coordinates)}
        ${vehicleTrackingDemoDetailField("GPS jednotka", location.gpsUnitId || location.externalUnitId || "neuvedeno")}
        ${vehicleTrackingDemoDetailField("Stav GPS", "Validní poloha")}
        ${vehicleTrackingDemoDetailField("Zdroj", location.source || "T-Cars jednotka")}
      </div>
    </div>
  `;
}

function vehicleTrackingTcarsGoogleMarkerContent(location = {}, selected = false) {
  const displayName = vehicleTrackingTcarsVehicleDisplayName(location);
  const title = vehicleTrackingTcarsMarkerTooltip(location);

  return `
    <span class="tracking-tcars-google-pin ${selected ? "tracking-tcars-google-pin--selected" : ""}" title="${escapeHtml(title)}">
      <span class="tracking-tcars-google-pin__icon" aria-hidden="true">
        <img src="${escapeHtml(VEHICLE_TRACKING_TCARS_MARKER_ICON_SRC)}" alt="" loading="eager" decoding="async" data-tracking-tcars-marker-icon>
        <span class="tracking-tcars-google-pin__fallback"></span>
      </span>
      <strong>${escapeHtml(displayName)}</strong>
      <span>${escapeHtml(vehicleTrackingTcarsSpeedText(location))}</span>
    </span>
  `;
}

function vehicleTrackingTcarsInvalidSection(invalidVehicles = []) {
  if (!invalidVehicles.length) {
    return "";
  }

  return `
    <section class="tracking-tcars-invalid" aria-labelledby="tracking-tcars-invalid-title">
      <div class="tracking-tcars-invalid__head">
        <div>
          <h4 id="tracking-tcars-invalid-title">Vozidla bez aktuální polohy</h4>
          <p>Neplatné T-Cars polohy nejsou vykreslené jako běžné markery.</p>
        </div>
        <span>${escapeHtml(`${invalidVehicles.length} vozidel`)}</span>
      </div>
      <div class="tracking-tcars-invalid-list">
        ${invalidVehicles.map((item) => {
          const markerVehicle = vehicleTrackingTcarsMarkerVehicle(item);
          const displayName = vehicleTrackingTcarsVehicleDisplayName(item);
          return `
            <article class="tracking-tcars-invalid-card">
              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <span>${escapeHtml(markerVehicle.licensePlate || "SPZ neuvedena")}</span>
              </div>
              <span class="tracking-status tracking-status--no-signal">Bez signálu</span>
              <small>Poslední známá poloha: ${escapeHtml(vehicleTrackingSafeDateTime(vehicleTrackingTcarsGpsDateValue(item)))}</small>
              <small>Důvod: ${escapeHtml(item._invalidReason || "Neplatná poloha z T-Cars")}</small>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function vehicleTrackingWimLayerPanel() {
  const loading = vehicleTrackingLiveState.wimLoading && !vehicleTrackingLiveState.wimLoaded;
  const error = vehicleTrackingLiveState.wimError;
  const sites = vehicleTrackingWimSitesForMap();
  const selectedSite = vehicleTrackingSelectedWimSite(sites);
  const summary = vehicleTrackingLiveState.wimSummary || {};
  const source = vehicleTrackingLiveState.wimSource || {};
  const message = error || (loading ? "Nacitam WIM mista z API..." : VEHICLE_TRACKING_WIM_ALERT_PILOT);
  const badge = vehicleTrackingLiveState.wimApiStatus === "ready" ? "Read-only API" : "Ceka na D1";

  return `
    <section class="tracking-wim-layer" id="tracking-wim-sites" aria-labelledby="tracking-wim-title">
      <div class="tracking-wim-layer__head">
        <div>
          <h3 id="tracking-wim-title">Pevne WIM vahy</h3>
          <p>Vrstva zobrazuje pevne vysokorychlostni kontrolni vahy nad Google mapou. SMS alert 15 km pred mistem je zatim jen evidovana automatizace.</p>
        </div>
        <span>${escapeHtml(badge)}</span>
      </div>
      <div class="tracking-wim-state ${error ? "tracking-wim-state--error" : ""}" role="${error ? "alert" : "status"}">
        <strong>${escapeHtml(message)}</strong>
        <span>${escapeHtml(VEHICLE_TRACKING_WIM_PLACEHOLDER_ICON)}</span>
      </div>
      <div class="tracking-wim-summary">
        ${vehicleTrackingWimSummaryItems(summary).map((item) => `
          <article>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </article>
        `).join("")}
      </div>
      <p class="tracking-wim-source">
        Zdroj: ${escapeHtml(source.label || "MD/RSD PDF mapa, stav k 30. 6. 2025")} · souradnice: ${escapeHtml(source.coordinateQuality || "approximate-needs-verification")}
      </p>
      <div class="tracking-wim-grid">
        <div class="tracking-wim-list" aria-label="Seznam WIM vah">
          ${sites.length ? sites.map((site) => {
            const selected = selectedSite?.id === site.id;
            const statusLabel = site.statusLabel || vehicleTrackingWimStatusLabel(site.status);
            return `
              <button
                class="tracking-wim-site-card ${selected ? "tracking-wim-site-card--selected" : ""}"
                type="button"
                data-tracking-wim-select="${escapeHtml(site.id)}"
              >
                <strong>${escapeHtml(vehicleTrackingWimSiteTitle(site))}</strong>
                <span>${escapeHtml(site.orp || "ORP neuvedeno")}</span>
                <small>${escapeHtml(statusLabel)} · ${escapeHtml(site.sideLabel || "strana neuvedena")}</small>
                <small>${escapeHtml(site.deviceCount || 0)} smerovych vah · GPS overit</small>
              </button>
            `;
          }).join("") : `
            <div class="tracking-wim-empty">
              <strong>${escapeHtml(loading ? "Nacitam WIM mista." : "WIM mista nejsou dostupna.")}</strong>
              <span>${escapeHtml(VEHICLE_TRACKING_WIM_WAITING)}</span>
            </div>
          `}
        </div>
        ${vehicleTrackingWimSiteDetail(selectedSite)}
      </div>
    </section>
  `;
}

function vehicleTrackingTcarsMapSection(status = {}) {
  const loading = vehicleTrackingLiveState.loading && !vehicleTrackingLiveState.loaded;
  const hasGoogleMapsKey = Boolean(vehicleTrackingDemoGoogleMapsKey());
  const locationGroups = vehicleTrackingTcarsLocationGroups(status);
  const locations = locationGroups.validLocations;
  const selectedLocation = vehicleTrackingTcarsSelectedLocation(locations);

  if (loading && !locationGroups.allLocations.length) {
    return `
      <div class="tracking-tcars-live">
        <div class="tracking-tcars-live__head">
          <div>
            <h3>T-Cars mapa vozidel</h3>
            <p>${escapeHtml(VEHICLE_TRACKING_LOADING)}</p>
          </div>
          <span>Read-only</span>
        </div>
        <div class="tracking-tcars-empty">
          <strong>Čekám na T-Cars data.</strong>
          <span>Data se zobrazují pouze z chráněného Smart odpady API. Nic se neukládá lokálně.</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="tracking-tcars-live">
      <div class="tracking-tcars-live__head">
        <div>
          <h3>T-Cars mapa vozidel</h3>
        </div>
        <span>${escapeHtml(`${locations.length} validních`)}</span>
      </div>
      <div
        class="tracking-tcars-map-summary"
        data-tracking-tcars-total="${escapeHtml(locationGroups.vehicleCount)}"
        data-tracking-tcars-valid="${escapeHtml(locations.length)}"
        data-tracking-tcars-invalid="${escapeHtml(locationGroups.invalidVehicles.length)}"
      >
        <span>Načtená vozidla: ${escapeHtml(locationGroups.vehicleCount)}</span>
        <span>Aktuální polohy: ${escapeHtml(locations.length)}</span>
        <span>Bez validní polohy: ${escapeHtml(locationGroups.invalidVehicles.length)}</span>
      </div>
      ${hasGoogleMapsKey ? `
        <div class="tracking-tcars-map-layout">
          <div class="tracking-map-shell tracking-tcars-map tracking-tcars-map--google" aria-label="Google mapa T-Cars vozidel">
            <div class="tracking-google-map tracking-tcars-google-map" data-tracking-tcars-google-map aria-label="Google mapa T-Cars poloh"></div>
            ${locations.length ? "" : `
              <div class="tracking-tcars-map-overlay" role="status">
                <strong>Nejsou dostupné žádné validní GPS polohy.</strong>
                <span>Mapa je centrovaná na Brno.</span>
              </div>
            `}
          </div>
          <div class="tracking-tcars-location-list" aria-label="Seznam validních T-Cars poloh">
            ${locations.length ? locations.map((location) => {
              const markerVehicle = vehicleTrackingTcarsMarkerVehicle(location);
              const displayName = vehicleTrackingTcarsVehicleDisplayName(location);
              const selected = selectedLocation?._locationId === location._locationId;
              return `
                <button
                  class="tracking-tcars-location-card ${selected ? "tracking-tcars-location-card--selected" : ""}"
                  type="button"
                  data-tracking-tcars-select="${escapeHtml(location._locationId)}"
                >
                  <strong>${escapeHtml(displayName)}</strong>
                  <span>${escapeHtml(markerVehicle.licensePlate || "SPZ neuvedena")}</span>
                  <small>Validní poloha · Poslední GPS ${escapeHtml(vehicleTrackingSafeDateTime(vehicleTrackingTcarsGpsDateValue(location)))}</small>
                  <small>Rychlost ${escapeHtml(vehicleTrackingTcarsSpeedText(location))} · ${escapeHtml(location.source || "T-Cars jednotka")}</small>
                </button>
              `;
            }).join("") : `
              <div class="tracking-tcars-empty">
                <strong>Bez validních markerů.</strong>
                <span>Nejsou dostupné žádné validní GPS polohy.</span>
              </div>
            `}
          </div>
        </div>
        <p class="tracking-tcars-map-note">Reálné validní polohy z T-Cars jsou vykreslené read-only nad Google mapou. Klik na marker nebo položku vybere vozidlo.</p>
      ` : `
        <div class="tracking-tcars-map-fallback" role="status">
          <strong>Čeká na Google Maps API key.</strong>
          <span>Po nastavení klíče se zde zobrazí Google mapa.</span>
        </div>
      `}
      ${vehicleTrackingWimLayerPanel()}
      ${vehicleTrackingTcarsLocationDetail(selectedLocation)}
      ${vehicleTrackingTcarsInvalidSection(locationGroups.invalidVehicles)}
    </div>
  `;
}

function vehicleTrackingTcarsStatusSection() {
  const status = vehicleTrackingLiveState.status || {};
  const loading = vehicleTrackingLiveState.loading && !vehicleTrackingLiveState.loaded;
  const error = vehicleTrackingLiveState.error;
  const message = error || status.message || VEHICLE_TRACKING_TCAR_WAITING;
  const badge = status.configured ? "T-CARS" : "Čeká na konfiguraci";
  const itemRows = vehicleTrackingTcarsConfigItems(status);
  const locationGroups = vehicleTrackingTcarsLocationGroups(status);

  return `
    <section class="tracking-section tracking-tcars-section" id="tracking-tcars-status" aria-labelledby="tracking-tcars-status-title">
      ${vehicleTrackingSectionHeader(
        "tracking-tcars-status-title",
        "T-Cars režim",
        "Frontend volá pouze vlastní Smart odpady API. T-Cars přístupy zůstávají v backendu.",
        { badgeText: badge }
      )}
      <div class="tracking-tcars-state ${error ? "tracking-tcars-state--error" : ""}" role="${error ? "alert" : "status"}">
        <strong>${escapeHtml(loading ? VEHICLE_TRACKING_LOADING : message)}</strong>
        <span>${escapeHtml(status.tabletRole || VEHICLE_TRACKING_TABLET_ROLE)}</span>
        ${status.config?.documentationStatus === "missing" ? `<small>${escapeHtml(VEHICLE_TRACKING_TCAR_API_DOCUMENTATION_MISSING)}</small>` : ""}
      </div>
      <div class="tracking-detail-grid tracking-detail-grid--compact">
        ${itemRows.map((item) => vehicleTrackingDemoDetailField(item.label, item.value)).join("")}
      </div>
      ${vehicleTrackingTcarsMapSection(status)}
      <div class="tracking-tcars-mode-grid">
        <article>
          <h3>T-Cars data</h3>
          <p>${escapeHtml(status.apiStatus === "ready" ? `Načteno vozidel: ${locationGroups.vehicleCount}, validních poloh: ${locationGroups.validLocations.length}, bez validní polohy: ${locationGroups.invalidVehicles.length}.` : status.configured ? "Čeká na úspěšné read-only načtení T-Cars." : VEHICLE_TRACKING_TCAR_WAITING)}</p>
        </article>
        <article>
          <h3>Fallback</h3>
          <p>${escapeHtml(status.fallback?.message || `${VEHICLE_TRACKING_TCAR_UNAVAILABLE} ${VEHICLE_TRACKING_TCAR_LAST_KNOWN}.`)}</p>
        </article>
        <article>
          <h3>Android tablet</h3>
          <p>${escapeHtml(VEHICLE_TRACKING_TABLET_ROLE)}</p>
        </article>
      </div>
      <div class="tracking-actions">
        <button class="secondary-link tracking-disabled-action" type="button" disabled>Read-only režim. Zápis do D1 není zapnutý.</button>
      </div>
    </section>
  `;
}

function vehicleTrackingTcarsPairingSection() {
  return `
    <section class="tracking-section tracking-tcars-section" id="tracking-tcars-pairing" aria-labelledby="tracking-tcars-pairing-title">
      ${vehicleTrackingSectionHeader(
        "tracking-tcars-pairing-title",
        "Párování T-Cars",
        "Párování bude ukládané pouze přes cloud API. Teď je připravený kontrakt bez lokálního ukládání.",
        { badgeText: "Čeká na API" }
      )}
      <div class="tracking-table-shell">
        <table class="tracking-table">
          <thead>
            <tr>
              ${VEHICLE_TRACKING_TCAR_PAIRING_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="${VEHICLE_TRACKING_TCAR_PAIRING_COLUMNS.length}">
                Párovací tabulka čeká na cloud API pro uložení vazeb vozidel. T-Cars data se načítají pouze read-only.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="tracking-integration-grid">
        <article>
          <h3>Pole párování</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_TCAR_LINK_FIELDS)}
        </article>
        <article>
          <h3>Akce</h3>
          ${vehicleTrackingFieldChips(["Spárovat", "Změnit párování", "Odpojit"])}
        </article>
      </div>
    </section>
  `;
}

function vehicleTrackingIconSpecSection() {
  return `
    <div class="tracking-icon-spec" aria-labelledby="tracking-icon-spec-title">
      <div class="tracking-icon-spec__head">
        <div>
          <h3 id="tracking-icon-spec-title">Ikony vozidel pro mapu</h3>
          <p>Dodané PNG ikony jsou uložené v aplikaci. Pokud se některá ikona nenačte, marker použije bezpečný CSS fallback.</p>
        </div>
        <span>${escapeHtml(VEHICLE_TRACKING_ICON_WAITING)}</span>
      </div>
      <div class="tracking-icon-spec__grid">
        <article>
          <h4>Formát</h4>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_ICON_FORMATS)}
        </article>
        <article>
          <h4>Vzhled</h4>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_ICON_REQUIREMENTS)}
        </article>
        <article>
          <h4>Složka</h4>
          ${vehicleTrackingFieldChips([VEHICLE_TRACKING_ICON_FOLDER, "PNG primárně", "WebP volitelně"])}
        </article>
        <article>
          <h4>Typy vozidel</h4>
          <ul class="tracking-icon-spec__files">
            ${VEHICLE_TRACKING_ICON_TYPES.map((type) => `
              <li>
                <strong>${escapeHtml(type.label)}</strong>
                <code>${escapeHtml(type.primary.replace(VEHICLE_TRACKING_ICON_FOLDER, ""))}</code>
                <span>${escapeHtml(type.webp.replace(VEHICLE_TRACKING_ICON_FOLDER, ""))}</span>
              </li>
            `).join("")}
          </ul>
        </article>
      </div>
      <div class="tracking-icon-spec__mapping">
        <span>Mapování typů</span>
        <code>${escapeHtml(JSON.stringify(VEHICLE_ICON_BY_TYPE))}</code>
      </div>
    </div>
  `;
}

function vehicleTrackingApiSection() {
  return `
    <section class="tracking-section tracking-demo-api-section" id="tracking-api" aria-labelledby="tracking-api-title">
      ${vehicleTrackingSectionHeader(
        "tracking-api-title",
        "API stav",
        "T-Cars se bude volat pouze serverově přes Smart odpady API.",
        { badgeText: "Backend kontrakt" }
      )}
      <div class="tracking-demo-api-note">
        <strong>${escapeHtml(DEMO_VEHICLE_TRACKING_API_NOTICE)}</strong>
        <span>${escapeHtml(DEMO_VEHICLE_TRACKING_API_DETAIL)}</span>
      </div>
      <div class="tracking-integration-grid">
        <article>
          <h3>Smart odpady endpointy</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_API_ENDPOINTS)}
        </article>
        <article>
          <h3>Aktuální stav vozidla</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_STATUS_FIELDS)}
        </article>
        <article>
          <h3>T-Cars sync log</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_TCAR_SYNC_LOG_FIELDS)}
        </article>
        <article>
          <h3>WIM mista</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_WIM_SITE_FIELDS)}
        </article>
        <article>
          <h3>WIM alert udalost</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRACKING_WIM_ALERT_FIELDS)}
        </article>
        <article>
          <h3>Jízda</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRIP_FIELDS)}
        </article>
        <article>
          <h3>Body trasy</h3>
          ${vehicleTrackingFieldChips(VEHICLE_TRIP_POINT_FIELDS)}
        </article>
        <article>
          <h3>Zastávky</h3>
          ${vehicleTrackingFieldChips(VEHICLE_STOP_FIELDS)}
        </article>
      </div>
      ${vehicleTrackingIconSpecSection()}
    </section>
  `;
}

function handleVehicleTrackingDemoControl(action) {
  const now = vehicleTrackingDemoCurrentTime();

  if (action === "sound") {
    enableVehicleTrackingDemoAudio();
    vehicleTrackingDemoState.running = true;
    vehicleTrackingDemoState.startedAt = now - vehicleTrackingDemoState.pausedElapsedMs;
    render();
    return;
  }

  if (action === "toggle") {
    if (vehicleTrackingDemoState.running) {
      vehicleTrackingDemoState.pausedElapsedMs = vehicleTrackingDemoCurrentFullElapsed(now);
      vehicleTrackingDemoState.running = false;
      stopVehicleTrackingDemoRuntime();
    } else {
      vehicleTrackingDemoState.running = true;
      vehicleTrackingDemoState.startedAt = now - vehicleTrackingDemoState.pausedElapsedMs;
    }

    render();
    return;
  }

  if (action === "reset") {
    vehicleTrackingDemoState.pausedElapsedMs = 0;
    vehicleTrackingDemoState.startedAt = vehicleTrackingDemoState.running ? now : 0;
    vehicleTrackingDemoState.mutedForLoop = false;
    vehicleTrackingDemoState.lastBeepAt = 0;
    render();
    return;
  }

  if (action === "mute") {
    vehicleTrackingDemoState.mutedForLoop = true;
    return;
  }

  if (action === "focus-alert") {
    vehicleTrackingDemoState.selectedVehicleId = DEMO_VEHICLE_TRACKING_ALERT.vehicleId;
    render();
    focusVehicleTrackingGoogleMapOnVehicle(DEMO_VEHICLE_TRACKING_ALERT.vehicleId);
    scrollToVehicleTrackingDemoDetail();
  }
}

function handleVehicleTrackingDemoFilter(filter) {
  if (!DEMO_VEHICLE_TRACKING_STATUS_FILTERS.some((item) => item.value === filter)) {
    return;
  }

  vehicleTrackingDemoState.filter = filter;
  const visibleVehicles = vehicleTrackingDemoVisibleVehicles();
  if (!visibleVehicles.some((vehicle) => vehicle.id === vehicleTrackingDemoState.selectedVehicleId)) {
    vehicleTrackingDemoState.selectedVehicleId = visibleVehicles[0]?.id || "";
  }
  render();
}

function scrollToVehicleTrackingDemoDetail() {
  window.requestAnimationFrame(() => {
    document.getElementById("tracking-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function handleVehicleTrackingDemoSelect(vehicleId) {
  if (!DEMO_VEHICLE_TRACKING_VEHICLES.some((vehicle) => vehicle.id === vehicleId)) {
    return;
  }

  vehicleTrackingDemoState.selectedVehicleId = vehicleId;
  render();
  scrollToVehicleTrackingDemoDetail();
}

function enableVehicleTrackingDemoAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  if (!vehicleTrackingAudioContext) {
    vehicleTrackingAudioContext = new AudioContextConstructor();
  }

  vehicleTrackingDemoState.audioEnabled = true;
  vehicleTrackingAudioContext.resume?.();
}

function playVehicleTrackingDemoAlertSound(elapsedMs) {
  if (!vehicleTrackingDemoState.audioEnabled || vehicleTrackingDemoState.mutedForLoop || !vehicleTrackingDemoIsAlertActive(elapsedMs)) {
    return;
  }

  const now = vehicleTrackingDemoCurrentTime();
  if (now - vehicleTrackingDemoState.lastBeepAt < 850) {
    return;
  }

  enableVehicleTrackingDemoAudio();
  if (!vehicleTrackingAudioContext) {
    return;
  }

  vehicleTrackingDemoState.lastBeepAt = now;
  const oscillator = vehicleTrackingAudioContext.createOscillator();
  const gain = vehicleTrackingAudioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = Math.floor(elapsedMs / 850) % 2 ? 720 : 980;
  gain.gain.setValueAtTime(0.0001, vehicleTrackingAudioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, vehicleTrackingAudioContext.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, vehicleTrackingAudioContext.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(vehicleTrackingAudioContext.destination);
  oscillator.start();
  oscillator.stop(vehicleTrackingAudioContext.currentTime + 0.2);
}

function vehicleTrackingGoogleMapsScriptUrl(apiKey) {
  const params = new URLSearchParams({
    key: apiKey,
    callback: "kaiserVehicleTrackingGoogleMapsReady",
    v: "weekly"
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function loadVehicleTrackingGoogleMaps() {
  const apiKey = vehicleTrackingDemoGoogleMapsKey();
  if (!apiKey) {
    vehicleTrackingDemoState.googleMapsStatus = "missing-key";
    return Promise.reject(new Error(DEMO_VEHICLE_TRACKING_GOOGLE_MAPS_WAITING));
  }

  if (window.google?.maps) {
    vehicleTrackingDemoState.googleMapsStatus = "ready";
    return Promise.resolve(window.google.maps);
  }

  if (vehicleTrackingDemoState.googleMapsPromise) {
    return vehicleTrackingDemoState.googleMapsPromise;
  }

  vehicleTrackingDemoState.googleMapsStatus = "loading";
  vehicleTrackingDemoState.googleMapsPromise = new Promise((resolve, reject) => {
    window.kaiserVehicleTrackingGoogleMapsReady = () => {
      vehicleTrackingDemoState.googleMapsStatus = "ready";
      resolve(window.google.maps);
    };

    const existingScript = document.getElementById("kaiser-google-maps-sdk");
    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = "kaiser-google-maps-sdk";
    script.src = vehicleTrackingGoogleMapsScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      vehicleTrackingDemoState.googleMapsStatus = "error";
      reject(new Error("Google Maps se nepodařilo načíst."));
    };
    document.head.appendChild(script);
  });

  return vehicleTrackingDemoState.googleMapsPromise;
}

function createVehicleTrackingGoogleMarker(maps, map, vehicle) {
  class VehicleTrackingMarker extends maps.OverlayView {
    constructor() {
      super();
      this.position = vehicle.plannedRoute[0];
      this.tone = "moving";
      this.selected = false;
      this.heading = 0;
      this.div = null;
      this.setMap(map);
    }

    onAdd() {
      this.div = document.createElement("button");
      this.div.type = "button";
      this.div.className = "tracking-google-marker";
      this.div.dataset.trackingDemoSelect = vehicle.id;
      this.div.innerHTML = vehicleTrackingMarkerContent(vehicle, {
        heading: this.heading,
        imageSrc: vehicle.imageSrc,
        label: vehicle.shortLabel,
        selected: this.selected,
        status: this.tone,
        tone: this.tone
      });
      this.div.addEventListener("click", () => handleVehicleTrackingDemoSelect(vehicle.id));
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) {
        return;
      }
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.position.lat, this.position.lng));
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
      this.div.style.setProperty("--heading", `${this.heading.toFixed(2)}deg`);
      this.div.className = [
        "tracking-google-marker",
        `tracking-google-marker--${this.tone}`,
        this.selected ? "tracking-google-marker--selected" : "",
        this.tone === "off-route" ? "tracking-google-marker--alert" : ""
      ].filter(Boolean).join(" ");
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    update(position, tone, selected) {
      this.position = position;
      this.tone = tone;
      this.selected = selected;
      this.heading = position.heading || 0;
      if (this.div) {
        this.div.innerHTML = vehicleTrackingMarkerContent(vehicle, {
          heading: this.heading,
          imageSrc: vehicle.imageSrc,
          isAlert: tone === "off-route",
          label: vehicle.shortLabel,
          selected,
          status: tone,
          tone
        });
      }
      this.draw();
    }
  }

  return new VehicleTrackingMarker();
}

function clearVehicleTrackingGoogleMap() {
  const overlays = vehicleTrackingDemoState.googleOverlays;
  if (!overlays) {
    return;
  }

  overlays.plannedPolylines?.forEach((polyline) => polyline.setMap(null));
  overlays.actualPolylines?.forEach((polyline) => polyline.setMap(null));
  overlays.markers?.forEach((marker) => marker.setMap(null));
  overlays.deviationCircle?.setMap(null);
  vehicleTrackingDemoState.googleOverlays = null;
  vehicleTrackingDemoState.googleMap = null;
  vehicleTrackingDemoState.googleMapNode = null;
}

function initializeVehicleTrackingGoogleMap(maps, node) {
  if (vehicleTrackingDemoState.googleMap && vehicleTrackingDemoState.googleMapNode === node) {
    return;
  }

  clearVehicleTrackingGoogleMap();
  const map = new maps.Map(node, {
    center: DEMO_VEHICLE_TRACKING_MAP_CENTER,
    zoom: 12,
    clickableIcons: false,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false
  });

  const plannedPolylines = new Map();
  const actualPolylines = new Map();
  const markers = new Map();

  for (const vehicle of DEMO_VEHICLE_TRACKING_VEHICLES) {
    if (vehicle.plannedRoute.length > 1) {
      plannedPolylines.set(vehicle.id, new maps.Polyline({
        path: vehicle.plannedRoute,
        map,
        strokeColor: "#75bd25",
        strokeOpacity: 0.72,
        strokeWeight: 4
      }));
    }

    actualPolylines.set(vehicle.id, new maps.Polyline({
      path: [],
      map,
      strokeColor: vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId ? "#dc5b1f" : "#2f7d4c",
      strokeOpacity: 0.86,
      strokeWeight: vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId ? 5 : 3
    }));

    markers.set(vehicle.id, createVehicleTrackingGoogleMarker(maps, map, vehicle));
  }

  const deviationCircle = new maps.Circle({
    center: DEMO_VEHICLE_TRACKING_MAP_CENTER,
    map,
    radius: 420,
    strokeColor: "#dc3f1f",
    strokeOpacity: 0,
    strokeWeight: 2,
    fillColor: "#dc3f1f",
    fillOpacity: 0
  });

  vehicleTrackingDemoState.googleMap = map;
  vehicleTrackingDemoState.googleMapNode = node;
  vehicleTrackingDemoState.googleOverlays = { actualPolylines, deviationCircle, markers, plannedPolylines };
}

function syncVehicleTrackingGoogleMap(elapsedMs) {
  const node = document.querySelector("[data-tracking-google-map]");
  if (!node || !vehicleTrackingDemoGoogleMapsKey()) {
    clearVehicleTrackingGoogleMap();
    return;
  }

  if (vehicleTrackingDemoState.googleMapsStatus === "loading") {
    return;
  }

  loadVehicleTrackingGoogleMaps()
    .then((maps) => {
      initializeVehicleTrackingGoogleMap(maps, node);
      const overlays = vehicleTrackingDemoState.googleOverlays;
      for (const vehicle of DEMO_VEHICLE_TRACKING_VEHICLES) {
        const position = vehicleTrackingDemoPosition(vehicle, elapsedMs);
        const summary = vehicleTrackingDemoVehicleSummary(vehicle, elapsedMs);
        const route = vehicleTrackingDemoPartialRoute(
          vehicleTrackingDemoActiveRoute(vehicle, elapsedMs),
          vehicleTrackingDemoVehicleProgress(vehicle, elapsedMs)
        );
        overlays.actualPolylines.get(vehicle.id)?.setPath(route);
        overlays.markers.get(vehicle.id)?.update(position, summary.tone, vehicleTrackingDemoState.selectedVehicleId === vehicle.id);
      }

      const alertVehicle = DEMO_VEHICLE_TRACKING_VEHICLES.find((vehicle) => vehicle.id === DEMO_VEHICLE_TRACKING_ALERT.vehicleId);
      const alertPosition = alertVehicle ? vehicleTrackingDemoPosition(alertVehicle, elapsedMs) : DEMO_VEHICLE_TRACKING_MAP_CENTER;
      overlays.deviationCircle.setCenter(alertPosition);
      overlays.deviationCircle.setOptions({
        strokeOpacity: vehicleTrackingDemoIsVehicleOffRoute(alertVehicle, elapsedMs) ? 0.65 : 0,
        fillOpacity: vehicleTrackingDemoIsVehicleOffRoute(alertVehicle, elapsedMs) ? 0.12 : 0
      });
    })
    .catch(() => {
      vehicleTrackingDemoState.googleMapsStatus = "error";
    });
}

function focusVehicleTrackingGoogleMapOnVehicle(vehicleId) {
  const map = vehicleTrackingDemoState.googleMap;
  if (!map) {
    return;
  }

  const vehicle = DEMO_VEHICLE_TRACKING_VEHICLES.find((item) => item.id === vehicleId);
  if (!vehicle) {
    return;
  }

  const position = vehicleTrackingDemoPosition(vehicle);
  map.panTo({ lat: position.lat, lng: position.lng });
  map.setZoom(Math.max(map.getZoom() || 12, 14));
}

function createVehicleTrackingWimGoogleMarker(maps, map, site) {
  class VehicleTrackingWimMarker extends maps.OverlayView {
    constructor(initialSite) {
      super();
      this.site = initialSite;
      this.selected = false;
      this.div = null;
      this.setMap(map);
    }

    onAdd() {
      this.div = document.createElement("button");
      this.div.type = "button";
      this.div.className = "tracking-wim-google-marker";
      this.div.dataset.trackingWimSelect = this.site.id;
      this.div.dataset.trackingWimGoogleMarker = this.site.id;
      this.div.addEventListener("click", () => handleVehicleTrackingWimSelect(this.site.id, { focusMap: true }));
      this.updateContent();
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) {
        return;
      }
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.site.latitude, this.site.longitude));
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
      this.div.className = [
        "tracking-wim-google-marker",
        `tracking-wim-google-marker--${vehicleTrackingWimStatusTone(this.site.status)}`,
        this.selected ? "tracking-wim-google-marker--selected" : ""
      ].filter(Boolean).join(" ");
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    updateContent() {
      if (!this.div) {
        return;
      }
      const title = vehicleTrackingWimSiteTooltip(this.site);
      this.div.setAttribute("aria-label", `Vybrat WIM misto ${vehicleTrackingWimSiteTitle(this.site)}`);
      this.div.setAttribute("title", title);
      this.div.dataset.trackingWimSelect = this.site.id;
      this.div.dataset.trackingWimGoogleMarker = this.site.id;
      this.div.innerHTML = `
        <span class="tracking-wim-google-pin ${this.selected ? "tracking-wim-google-pin--selected" : ""}" title="${escapeHtml(title)}">
          <span class="tracking-wim-google-pin__icon" aria-hidden="true">WIM</span>
          <strong>${escapeHtml(this.site.road || "WIM")}</strong>
          <span>${escapeHtml(this.site.kmLabel || "")}</span>
        </span>
      `;
    }

    update(site, selected) {
      this.site = site;
      this.selected = selected;
      this.updateContent();
      this.draw();
    }
  }

  return new VehicleTrackingWimMarker(site);
}

function createVehicleTrackingTcarsGoogleMarker(maps, map, location) {
  class VehicleTrackingTcarsMarker extends maps.OverlayView {
    constructor(initialLocation) {
      super();
      this.location = initialLocation;
      this.selected = false;
      this.div = null;
      this.setMap(map);
    }

    onAdd() {
      this.div = document.createElement("button");
      this.div.type = "button";
      this.div.className = "tracking-tcars-google-marker";
      this.div.dataset.trackingTcarsSelect = this.location._locationId;
      this.div.dataset.trackingTcarsGoogleMarker = this.location._locationId;
      this.div.addEventListener("click", () => handleVehicleTrackingTcarsSelect(this.location._locationId, { focusMap: true }));
      this.updateContent();
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) {
        return;
      }
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.location.latitude, this.location.longitude));
      const markerVehicle = vehicleTrackingTcarsMarkerVehicle(this.location);
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
      this.div.style.setProperty("--heading", `${markerVehicle.heading.toFixed(2)}deg`);
      this.div.className = [
        "tracking-tcars-google-marker",
        this.selected ? "tracking-tcars-google-marker--selected" : ""
      ].filter(Boolean).join(" ");
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    updateContent() {
      if (!this.div) {
        return;
      }
      const markerVehicle = vehicleTrackingTcarsMarkerVehicle(this.location);
      const displayName = vehicleTrackingTcarsVehicleDisplayName(this.location);
      const licensePlate = markerVehicle.licensePlate ? `, SPZ ${markerVehicle.licensePlate}` : "";
      this.div.setAttribute("aria-label", `Vybrat vozidlo ${displayName}${licensePlate}`);
      this.div.setAttribute("title", vehicleTrackingTcarsMarkerTooltip(this.location));
      this.div.dataset.trackingTcarsSelect = this.location._locationId;
      this.div.dataset.trackingTcarsGoogleMarker = this.location._locationId;
      this.div.innerHTML = vehicleTrackingTcarsGoogleMarkerContent(this.location, this.selected);
    }

    update(location, selected) {
      this.location = location;
      this.selected = selected;
      this.updateContent();
      this.draw();
    }
  }

  return new VehicleTrackingTcarsMarker(location);
}

function clearVehicleTrackingTcarsGoogleMap() {
  vehicleTrackingLiveState.googleMarkers.forEach((marker) => marker.setMap(null));
  vehicleTrackingLiveState.googleMarkers.clear();
  vehicleTrackingLiveState.wimGoogleMarkers.forEach((marker) => marker.setMap(null));
  vehicleTrackingLiveState.wimGoogleMarkers.clear();
  vehicleTrackingLiveState.googleMap = null;
  vehicleTrackingLiveState.googleMapNode = null;
  vehicleTrackingLiveState.googleBoundsKey = "";
  vehicleTrackingLiveState.googleFocusedLocationId = "";
}

function initializeVehicleTrackingTcarsGoogleMap(maps, node) {
  if (vehicleTrackingLiveState.googleMap && vehicleTrackingLiveState.googleMapNode === node) {
    return vehicleTrackingLiveState.googleMap;
  }

  clearVehicleTrackingTcarsGoogleMap();
  const map = new maps.Map(node, {
    center: DEMO_VEHICLE_TRACKING_MAP_CENTER,
    zoom: 11,
    clickableIcons: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
    mapTypeControl: true,
    scrollwheel: true,
    streetViewControl: false
  });

  vehicleTrackingLiveState.googleMap = map;
  vehicleTrackingLiveState.googleMapNode = node;
  return map;
}

function vehicleTrackingTcarsBoundsKey(locations = [], wimSites = vehicleTrackingWimSitesForMap()) {
  return [
    ...locations.map((location) => ({ id: location._locationId, latitude: location.latitude, longitude: location.longitude })),
    ...wimSites.map((site) => ({ id: `wim-${site.id}`, latitude: site.latitude, longitude: site.longitude }))
  ]
    .map((location) => `${location.id}:${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`)
    .sort()
    .join("|");
}

function fitVehicleTrackingTcarsGoogleMap(maps, map, locations = []) {
  if (!locations.length) {
    map.setCenter(DEMO_VEHICLE_TRACKING_MAP_CENTER);
    map.setZoom(11);
    return;
  }

  if (locations.length === 1) {
    map.setCenter({ lat: locations[0].latitude, lng: locations[0].longitude });
    map.setZoom(14);
    return;
  }

  const bounds = new maps.LatLngBounds();
  locations.forEach((location) => {
    bounds.extend({ lat: location.latitude, lng: location.longitude });
  });
  map.fitBounds(bounds, 48);
}

function focusVehicleTrackingTcarsGoogleMap(locationId) {
  const map = vehicleTrackingLiveState.googleMap;
  const location = vehicleTrackingTcarsLocationGroups(vehicleTrackingLiveState.status || {})
    .validLocations
    .find((item) => item._locationId === locationId);

  if (!map || !location) {
    return;
  }

  map.panTo({ lat: location.latitude, lng: location.longitude });
  map.setZoom(Math.max(map.getZoom() || 11, 15));
  vehicleTrackingLiveState.googleFocusedLocationId = locationId;
}

function focusVehicleTrackingWimGoogleMap(siteId) {
  const map = vehicleTrackingLiveState.googleMap;
  const site = vehicleTrackingWimSiteById(siteId);

  if (!map || !site) {
    return;
  }

  map.panTo({ lat: site.latitude, lng: site.longitude });
  map.setZoom(Math.max(map.getZoom() || 8, 13));
  vehicleTrackingLiveState.googleFocusedLocationId = `wim:${siteId}`;
}

function syncVehicleTrackingWimGoogleMarkers(maps, map) {
  const sites = vehicleTrackingWimSitesForMap();
  const activeIds = new Set(sites.map((site) => site.id));
  const selectedSite = vehicleTrackingSelectedWimSite(sites);

  vehicleTrackingLiveState.wimGoogleMarkers.forEach((marker, markerId) => {
    if (!activeIds.has(markerId)) {
      marker.setMap(null);
      vehicleTrackingLiveState.wimGoogleMarkers.delete(markerId);
    }
  });

  sites.forEach((site) => {
    const selected = selectedSite?.id === site.id;
    const existingMarker = vehicleTrackingLiveState.wimGoogleMarkers.get(site.id);
    if (existingMarker) {
      existingMarker.update(site, selected);
      return;
    }
    const marker = createVehicleTrackingWimGoogleMarker(maps, map, site);
    marker.update(site, selected);
    vehicleTrackingLiveState.wimGoogleMarkers.set(site.id, marker);
  });
}

function syncVehicleTrackingTcarsGoogleMap(options = {}) {
  const node = document.querySelector("[data-tracking-tcars-google-map]");
  if (!node || !vehicleTrackingDemoGoogleMapsKey()) {
    clearVehicleTrackingTcarsGoogleMap();
    return Promise.resolve();
  }

  return loadVehicleTrackingGoogleMaps()
    .then((maps) => {
      const map = initializeVehicleTrackingTcarsGoogleMap(maps, node);
      const { validLocations } = vehicleTrackingTcarsLocationGroups(vehicleTrackingLiveState.status || {});
      const wimSites = vehicleTrackingWimSitesForMap();
      const activeIds = new Set(validLocations.map((location) => location._locationId));
      const selectedLocation = vehicleTrackingTcarsSelectedLocation(validLocations);

      vehicleTrackingLiveState.googleMarkers.forEach((marker, markerId) => {
        if (!activeIds.has(markerId)) {
          marker.setMap(null);
          vehicleTrackingLiveState.googleMarkers.delete(markerId);
        }
      });

      validLocations.forEach((location) => {
        const selected = selectedLocation?._locationId === location._locationId;
        const existingMarker = vehicleTrackingLiveState.googleMarkers.get(location._locationId);
        if (existingMarker) {
          existingMarker.update(location, selected);
          return;
        }
        const marker = createVehicleTrackingTcarsGoogleMarker(maps, map, location);
        marker.update(location, selected);
        vehicleTrackingLiveState.googleMarkers.set(location._locationId, marker);
      });

      syncVehicleTrackingWimGoogleMarkers(maps, map);

      const boundsKey = vehicleTrackingTcarsBoundsKey(validLocations, wimSites);
      const selectedId = selectedLocation?._locationId || "";
      const selectedWimId = vehicleTrackingSelectedWimSite(wimSites)?.id || "";
      if (options.focusWimSelected && selectedWimId) {
        focusVehicleTrackingWimGoogleMap(selectedWimId);
      } else if (options.focusSelected && selectedId) {
        focusVehicleTrackingTcarsGoogleMap(selectedId);
      } else if (options.forceFit || boundsKey !== vehicleTrackingLiveState.googleBoundsKey) {
        fitVehicleTrackingTcarsGoogleMap(maps, map, [...validLocations, ...wimSites]);
        vehicleTrackingLiveState.googleBoundsKey = boundsKey;
      }
    })
    .catch(() => {
      clearVehicleTrackingTcarsGoogleMap();
      vehicleTrackingDemoState.googleMapsStatus = "error";
    });
}

function queueVehicleTrackingTcarsGoogleSync(options = {}) {
  window.requestAnimationFrame(() => {
    syncVehicleTrackingTcarsGoogleMap(options);
  });
}

function stopVehicleTrackingDemoRuntime() {
  if (!vehicleTrackingDemoState.frameId) {
    return;
  }

  window.cancelAnimationFrame(vehicleTrackingDemoState.frameId);
  vehicleTrackingDemoState.frameId = 0;
}

function applyVehicleTrackingDemoFrame(elapsedMs) {
  const visibleVehicles = vehicleTrackingDemoVisibleVehicles();
  const phase = vehicleTrackingDemoPhase(elapsedMs);
  const alertActive = vehicleTrackingDemoIsAlertActive(elapsedMs);

  document.querySelector("[data-tracking-demo-phase]")?.replaceChildren(document.createTextNode(phase.label));
  document.querySelector("[data-tracking-demo-phase-description]")?.replaceChildren(document.createTextNode(phase.description));

  const alertNode = document.querySelector("[data-tracking-demo-alert]");
  if (alertNode) {
    alertNode.classList.toggle("tracking-demo-alert--active", alertActive);
  }

  for (const vehicle of visibleVehicles) {
    const position = vehicleTrackingDemoPosition(vehicle, elapsedMs);
    const summary = vehicleTrackingDemoVehicleSummary(vehicle, elapsedMs);
    const marker = document.querySelector(`[data-tracking-demo-marker="${CSS.escape(vehicle.id)}"]`);
    if (marker) {
      marker.style.setProperty("--x", `${position.x.toFixed(2)}%`);
      marker.style.setProperty("--y", `${position.y.toFixed(2)}%`);
      marker.style.setProperty("--heading", `${position.heading.toFixed(2)}deg`);
      marker.className = [
        "tracking-demo-marker",
        `tracking-demo-marker--${summary.tone}`,
        summary.isOffRoute ? "tracking-demo-marker--alert" : "",
        vehicleTrackingDemoState.selectedVehicleId === vehicle.id ? "tracking-demo-marker--selected" : ""
      ].filter(Boolean).join(" ");
      marker.innerHTML = vehicleTrackingMarkerContent(vehicle, {
        heading: position.heading,
        imageSrc: vehicle.imageSrc,
        isAlert: summary.isOffRoute,
        label: vehicle.shortLabel,
        selected: vehicleTrackingDemoState.selectedVehicleId === vehicle.id,
        status: summary.status,
        statusLabel: summary.statusLabel,
        tone: summary.tone
      });
    }

    const speedNode = document.querySelector(`[data-tracking-demo-speed="${CSS.escape(vehicle.id)}"]`);
    if (speedNode) {
      speedNode.textContent = `${position.speedKmh} km/h`;
    }

    const statusNode = document.querySelector(`[data-tracking-demo-status="${CSS.escape(vehicle.id)}"]`);
    if (statusNode) {
      statusNode.textContent = summary.statusLabel;
      statusNode.className = `tracking-status tracking-status--${summary.tone}`;
    }

    const deviationNode = document.querySelector(`[data-tracking-demo-deviation="${CSS.escape(vehicle.id)}"]`);
    if (deviationNode) {
      deviationNode.textContent = summary.isOffRoute ? `Odchylka ${summary.deviationText}` : "Odchylka 0 m";
    }

    const cardNode = document.querySelector(`[data-tracking-demo-card="${CSS.escape(vehicle.id)}"]`);
    if (cardNode) {
      cardNode.classList.toggle("tracking-demo-vehicle-card--alert", summary.isOffRoute);
      cardNode.classList.toggle("tracking-demo-vehicle-card--selected", vehicleTrackingDemoState.selectedVehicleId === vehicle.id);
    }
  }

  const selectedVehicle = vehicleTrackingDemoSelectedVehicle();
  if (selectedVehicle) {
    const selectedSummary = vehicleTrackingDemoVehicleSummary(selectedVehicle, elapsedMs);
    const selectedPosition = vehicleTrackingDemoPosition(selectedVehicle, elapsedMs);
    const detailStatus = document.querySelector("[data-tracking-demo-detail-status]");
    if (detailStatus) {
      detailStatus.textContent = selectedSummary.statusLabel;
      detailStatus.className = `tracking-status tracking-status--${selectedSummary.tone}`;
    }
    document.querySelector("[data-tracking-demo-detail-status-text]")?.replaceChildren(document.createTextNode(selectedSummary.statusLabel));
    document.querySelector("[data-tracking-demo-detail-speed]")?.replaceChildren(document.createTextNode(`${selectedPosition.speedKmh} km/h`));
    document.querySelector("[data-tracking-demo-detail-deviation]")?.replaceChildren(document.createTextNode(selectedSummary.deviationText));
    const detailAlert = document.querySelector("[data-tracking-demo-detail-alert]");
    if (detailAlert) {
      detailAlert.hidden = !selectedSummary.isOffRoute;
    }
  }

  syncVehicleTrackingGoogleMap(elapsedMs);
  playVehicleTrackingDemoAlertSound(elapsedMs);
}

function vehicleTrackingDemoFrame(now = vehicleTrackingDemoCurrentTime()) {
  if (!normalizePath(window.location.pathname).startsWith(VEHICLE_TRACKING_BASE_ROUTE)) {
    stopVehicleTrackingDemoRuntime();
    return;
  }

  if (!document.querySelector("[data-tracking-demo-map]")) {
    stopVehicleTrackingDemoRuntime();
    return;
  }

  const elapsedMs = vehicleTrackingDemoCurrentElapsed(now);
  applyVehicleTrackingDemoFrame(elapsedMs);

  if (vehicleTrackingDemoState.running) {
    vehicleTrackingDemoState.frameId = window.requestAnimationFrame(vehicleTrackingDemoFrame);
  }
}

function syncVehicleTrackingDemoRuntime() {
  const isTrackingPage = normalizePath(window.location.pathname).startsWith(VEHICLE_TRACKING_BASE_ROUTE);
  if (!isTrackingPage || !document.querySelector("[data-tracking-demo-map]")) {
    stopVehicleTrackingDemoRuntime();
    clearVehicleTrackingGoogleMap();
    if (!document.querySelector("[data-tracking-tcars-google-map]")) {
      clearVehicleTrackingTcarsGoogleMap();
    }
    return;
  }

  applyVehicleTrackingDemoFrame(vehicleTrackingDemoCurrentElapsed());

  if (vehicleTrackingDemoState.running && !vehicleTrackingDemoState.frameId) {
    vehicleTrackingDemoState.frameId = window.requestAnimationFrame(vehicleTrackingDemoFrame);
  }
}

function vehicleTrackingRulesAutomation(user) {
  ensureModuleRulesData("vehicle-tracking");
  return moduleRulesAutomationPanel({
    moduleKey: "vehicle-tracking",
    moduleName: "Sledovani vozidel",
    user,
    description: "Cloud evidence pravidel a automatizaci pro GPS sledovani, T-Cars, WIM vrstvu a budouci 15km upozorneni ridicum.",
    cloudNote: "WIM vrstva je read-only pres API. SMS/app alert 15 km pred vahou je zatim navrh automatizace bez ostreho cloud geofencing runneru a bez odesilani SMS."
  });
}

function vehicleTrackingPage(moduleItem, user, context = {}) {
  const vehicleId = context.vehicleId || "";
  const view = context.view || "map";
  const sourceMode = vehicleTrackingActiveSourceMode();
  const visibleVehicles = vehicleTrackingDemoVisibleVehicles();
  const selectedVehicle = vehicleTrackingDemoSelectedVehicle(vehicleId, visibleVehicles);
  if (selectedVehicle) {
    vehicleTrackingDemoState.selectedVehicleId = selectedVehicle.id;
  }

  return `
    <main class="app-shell module-page module-theme-scope tracking-page" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail tracking-hero" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">SMART ODPADY / SLEDOVÁNÍ VOZIDEL</div>
          <h1 id="module-title">Sledování vozidel</h1>
          <p>Primární poloha vozidel bude z T-Cars jednotek. Demo režim zůstává jako bezpečná ukázka bez reálných GPS dat.</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${escapeHtml(moduleStatusLabel(moduleItem))}</strong>
          </div>
          <div class="module-actions">
            ${vehicleTrackingAction("Otevřít Vozový park", FLEET_ROUTE)}
            ${vehicleTrackingAction("Správa GPS napojení")}
          </div>
        </div>
      </section>

      ${vehicleTrackingSourceModePanel()}
      ${sourceMode === "demo" ? vehicleTrackingDemoBanner() : ""}
      ${vehicleTrackingTabs(view, sourceMode)}
      <div class="tracking-layout tracking-demo-layout">
        ${sourceMode === "demo" ? `
          ${vehicleTrackingMapSection(visibleVehicles, selectedVehicle)}
          ${vehicleTrackingListSection(visibleVehicles, selectedVehicle)}
          ${vehicleTrackingDetailSection(selectedVehicle)}
        ` : `
          ${vehicleTrackingTcarsStatusSection()}
          ${vehicleTrackingTcarsPairingSection()}
        `}
        ${vehicleTrackingApiSection()}
        <div id="tracking-rules">
          ${vehicleTrackingRulesAutomation(user)}
        </div>
      </div>
      ${moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: "sledovani-vozidel",
        moduleName: "Sledování vozidel",
        placeholder: "Např. chybí GPS provider, filtr, stav vozidla nebo typ historie jízd…"
      })}
    </main>
  `;
}

function dataBoxStatusLabel(value) {
  const labels = {
    inactive: "neaktivni",
    waiting: "ceka",
    ready: "aktivni",
    pilot: "pilot"
  };
  return labels[String(value || "").trim().toLowerCase()] || String(value || "ceka");
}

function dataBoxStatusCards() {
  const status = dataBoxState.status || {};
  const summary = status.summary || {};
  const apiReady = dataBoxState.apiStatus === "ready";
  const storageReady = dataBoxState.storageStatus === "ready";
  const cards = DATA_BOX_STATUS_CARDS.map((item) => ({ ...item }));
  cards[0] = {
    label: "Stav funkce",
    value: apiReady ? "Funkcni pres API" : (dataBoxState.loading ? "nacitam API" : "UI navrh"),
    note: apiReady
      ? "Frontend cte metadata z cloud API a D1. ISDS zustava vypnute."
      : (dataBoxState.error || "Bez ostreho cteni, zapisu nebo odesilani do ISDS.")
  };
  cards[1] = {
    label: "Zdroj dat",
    value: apiReady ? "Cloudflare D1" : "ceka na API",
    note: apiReady
      ? `${Number(summary.received || 0)} prijatych, ${Number(summary.sent || 0)} odeslanych, ${Number(summary.attachments || 0)} priloh.`
      : "Cilove cloud backend, D1 metadata a R2 prilohy."
  };
  cards[2] = {
    label: "ISDS napojeni",
    value: dataBoxStatusLabel(dataBoxState.integrationStatus),
    note: status.message || "SOAP/WSDL adapter bude az v dalsi fazi."
  };
  cards[3] = {
    label: "Uloziste priloh",
    value: storageReady ? "R2 pripraveno" : "ceka na R2",
    note: storageReady
      ? "Metadata jsou v D1, soubory budou v R2 pres backend."
      : "Prilohy se zatim nenacitaji ani neukladaji."
  };

  return `
    <div class="data-box-status-grid" aria-label="Stav modulu Datová schránka">
      ${cards.map((item) => `
        <article>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.note)}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function dataBoxTabs() {
  return `
    <nav class="data-box-tabs" aria-label="Menu modulu Datová schránka">
      ${DATA_BOX_TABS.map((tab) => `
        <a class="data-box-tab" href="${routeHref(`${DATA_BOX_ROUTE}#${tab.id}`)}">${escapeHtml(tab.label)}</a>
      `).join("")}
    </nav>
  `;
}

function dataBoxMessageActor(message) {
  if (message.direction === "sent") {
    return message.recipientName || message.recipientBoxId || "-";
  }

  return message.senderName || message.senderBoxId || "-";
}

function dataBoxAiStatusLabel(value) {
  const labels = {
    not_evaluated: "nevyhodnoceno",
    draft: "navrh",
    done: "hotovo",
    failed: "chyba"
  };
  return labels[String(value || "").trim().toLowerCase()] || String(value || "-");
}

function dataBoxMessageRows(direction) {
  if (dataBoxState.loading && !dataBoxState.loaded) {
    return `
      <tr>
        <td colspan="${DATA_BOX_EMPTY_MESSAGE_COLUMNS.length}">Nacitam metadata z cloud API...</td>
      </tr>
    `;
  }

  if (dataBoxState.error) {
    return `
      <tr>
        <td colspan="${DATA_BOX_EMPTY_MESSAGE_COLUMNS.length}">${escapeHtml(dataBoxState.error)}</td>
      </tr>
    `;
  }

  const rows = dataBoxState.messages.filter((message) => message.direction === direction);
  if (!rows.length) {
    return `
      <tr>
        <td colspan="${DATA_BOX_EMPTY_MESSAGE_COLUMNS.length}">
          Zadna ostra zprava neni nactena. Frontend nevola ISDS a neobsahuje provozni data.
        </td>
      </tr>
    `;
  }

  return rows.map((message) => `
    <tr>
      <td>${escapeHtml(formatDateTime(message.deliveredAt || message.acceptedAt || message.storedAt) || "-")}</td>
      <td>${escapeHtml(message.direction === "sent" ? "odeslana" : "prijata")}</td>
      <td>${escapeHtml(dataBoxMessageActor(message))}</td>
      <td>${escapeHtml(message.subject || "(bez predmetu)")}</td>
      <td>${escapeHtml(message.status || "-")}</td>
      <td>${escapeHtml(String(message.attachmentsCount || 0))}</td>
      <td>${escapeHtml(dataBoxAiStatusLabel(message.aiStatus))}</td>
      <td><button class="secondary-link" type="button" disabled>Detail</button></td>
    </tr>
  `).join("");
}

function dataBoxMessageTable(title, direction) {
  const statusClass = dataBoxState.apiStatus === "ready" ? "employee-card-status--ready" : "employee-card-status--waiting";
  const statusLabel = dataBoxState.apiStatus === "ready" ? "API aktivni" : (dataBoxState.loading ? "nacitam API" : "ceka na API");

  return `
    <section class="data-box-panel" id="${escapeHtml(direction)}" aria-labelledby="data-box-${escapeHtml(direction)}-title">
      <div class="data-box-panel__head">
        <div>
          <h2 id="data-box-${escapeHtml(direction)}-title">${escapeHtml(title)}</h2>
          <p>Seznam cte pouze metadata z interniho API. Ostre ISDS pripojeni neni v teto fazi aktivni.</p>
        </div>
        <span class="employee-card-status ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="data-box-table-wrap">
        <table class="data-box-table">
          <thead>
            <tr>${DATA_BOX_EMPTY_MESSAGE_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${dataBoxMessageRows(direction)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function dataBoxAiPanel() {
  return `
    <section class="data-box-panel" id="ai" aria-labelledby="data-box-ai-title">
      <div class="data-box-panel__head">
        <div>
          <h2 id="data-box-ai-title">AI vyhodnocení</h2>
          <p>Budoucí backendové vyhodnocení obsahu zprávy, příloh a doporučeného postupu s lidským potvrzením.</p>
        </div>
        <span class="employee-card-status employee-card-status--waiting">návrh</span>
      </div>
      <div class="data-box-ai-grid">
        <article>
          <span>Vstup</span>
          <strong>metadata + text + přílohy</strong>
          <small>Po extrakci v backendu, bez posílání secrets do frontendu.</small>
        </article>
        <article>
          <span>Výstup</span>
          <strong>štítek, priorita, návrh akce</strong>
          <small>Výsledek se uloží s confidence a audit stopou.</small>
        </article>
        <article>
          <span>Bezpečnost</span>
          <strong>ruční potvrzení</strong>
          <small>AI nesmí samo odeslat odpověď ani měnit stav zprávy.</small>
        </article>
      </div>
    </section>
  `;
}

function dataBoxArchitecturePanel() {
  const status = dataBoxState.status || {};
  const summary = status.summary || {};
  const lastSync = summary.lastSyncAt ? formatDateTime(summary.lastSyncAt) : "zatim neprobehla";

  return `
    <section class="data-box-panel" id="overview" aria-labelledby="data-box-overview-title">
      <div class="data-box-panel__head">
        <div>
          <h2 id="data-box-overview-title">Provozní realita</h2>
          <p>Rozpad na fáze a cílové cloudové části, aby UI nevypadalo jako ostré ISDS napojení.</p>
        </div>
        <span class="employee-card-status employee-card-status--waiting">ISDS neaktivni</span>
      </div>
      <div class="data-box-warning" role="status">
        <strong>Posledni synchronizace: ${escapeHtml(lastSync)}</strong>
        <span>${escapeHtml(status.message || "ISDS integrace neni aktivni. Pripraveny je pouze vlastni cloudovy model dat.")}</span>
      </div>
      <div class="data-box-phase-grid">
        ${DATA_BOX_PHASES.map((phase) => `
          <article>
            <span>${escapeHtml(phase.title)}</span>
            <strong>${escapeHtml(phase.status)}</strong>
            <p>${escapeHtml(phase.description)}</p>
          </article>
        `).join("")}
      </div>
      <div class="data-box-architecture-grid">
        <section>
          <h3>Cloud části</h3>
          <dl>
            ${DATA_BOX_INTEGRATION_POINTS.map(([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `).join("")}
          </dl>
        </section>
        <section>
          <h3>Plánované API</h3>
          <ul>
            ${DATA_BOX_PLANNED_ENDPOINTS.map((endpoint) => `<li><code>${escapeHtml(endpoint)}</code></li>`).join("")}
          </ul>
        </section>
      </div>
    </section>
  `;
}

function dataBoxSyncRunsPanel() {
  const statusClass = dataBoxState.apiStatus === "ready" ? "employee-card-status--ready" : "employee-card-status--waiting";
  const statusLabel = dataBoxState.apiStatus === "ready" ? "D1 log pripraven" : "ceka na D1";
  const rows = dataBoxState.syncRuns.length
    ? dataBoxState.syncRuns.map((run) => `
      <tr>
        <td>${escapeHtml(formatDateTime(run.startedAt) || "-")}</td>
        <td>${escapeHtml(run.triggerType || "-")}</td>
        <td>${escapeHtml(run.status || "-")}</td>
        <td>${escapeHtml(String(run.messagesFound || 0))}</td>
        <td>${escapeHtml(String(run.messagesCreated || 0))}</td>
        <td>${escapeHtml(run.message || run.errorCode || "-")}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="6">Zadny beh synchronizace zatim neni zapsany. Cloud automatizace a ISDS adapter nejsou aktivni.</td>
      </tr>
    `;

  return `
    <section class="data-box-panel" aria-labelledby="data-box-sync-title">
      <div class="data-box-panel__head">
        <div>
          <h2 id="data-box-sync-title">Log synchronizaci</h2>
          <p>Evidence budoucich manualnich nebo cloudovych behu. V teto fazi se zadna ISDS synchronizace nespousti.</p>
        </div>
        <span class="employee-card-status ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="data-box-table-wrap">
        <table class="data-box-table">
          <thead>
            <tr>
              <th>Start</th>
              <th>Typ</th>
              <th>Stav</th>
              <th>Nalezeno</th>
              <th>Vytvoreno</th>
              <th>Zprava</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function dataBoxRulesAutomation(user) {
  ensureModuleRulesData(DATA_BOX_MODULE_KEY);
  return moduleRulesAutomationPanel({
    moduleKey: DATA_BOX_MODULE_KEY,
    moduleName: "Datová schránka",
    user,
    description: "Cloud evidence pravidel a automatizací pro budoucí synchronizaci, třídění a notifikace Datové schránky.",
    cloudNote: "V této fázi se žádná ISDS automatizace nespouští. Pravidla jsou jen evidence a příprava pro budoucí cloud runner."
  });
}

function dataBoxPage(moduleItem, user) {
  ensureDataBoxData();
  const apiReady = dataBoxState.apiStatus === "ready";
  const heroStatus = apiReady ? "Funkcni pres API" : "UI navrh";

  return `
    <main class="app-shell module-page module-theme-scope data-box-page" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail data-box-hero" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">SMART ODPADY / DATOVÁ SCHRÁNKA</div>
          <h1 id="module-title">Datová schránka</h1>
          <p>Pilotní rozhraní pro budoucí ISDS integraci. Teď je to bezpečný UI návrh bez ostrého čtení, zápisu, odesílání a bez uložených přístupových údajů.</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${escapeHtml(heroStatus)}</strong>
          </div>
          <div class="module-actions">
            <button class="primary-action" type="button" disabled title="Čeká na backend ISDS adapter">Synchronizovat</button>
            <button class="secondary-link" type="button" disabled title="Odesílání bude až po samostatném potvrzení">Nová odpověď</button>
          </div>
        </div>
      </section>

      <section class="data-box-warning" role="status">
        <strong>ISDS integrace není aktivní.</strong>
        <span>Frontend nevolá datové schránky, neukládá provozní data lokálně a neobsahuje žádné certifikáty, hesla ani tokeny.</span>
      </section>

      ${dataBoxStatusCards()}
      ${dataBoxTabs()}
      ${dataBoxArchitecturePanel()}
      ${dataBoxMessageTable("Přijaté zprávy", "received")}
      ${dataBoxMessageTable("Odeslané zprávy", "sent")}
      ${dataBoxAiPanel()}
      ${dataBoxSyncRunsPanel()}
      <div id="rules">
        ${dataBoxRulesAutomation(user)}
      </div>
      ${moduleFeedbackBoxFor(moduleItem, user, {
        moduleId: DATA_BOX_MODULE_KEY,
        moduleName: "Datová schránka",
        placeholder: "Např. chybí filtr podle odesílatele, priorita, vazba na zákazníka nebo typ AI vyhodnocení..."
      })}
    </main>
  `;
}

function modulePage(moduleItem, user, isDashboard = false) {
  if (moduleItem.id === "absence") {
    return absenceModulePage(moduleItem, user, isDashboard);
  }

  if (moduleItem.id === "fleet") {
    return fleetModulePage(moduleItem, user, { isDashboard });
  }

  if (moduleItem.id === "vehicle-tracking") {
    return vehicleTrackingPage(moduleItem, user);
  }

  if (moduleItem.id === DATA_BOX_MODULE_KEY) {
    return dataBoxPage(moduleItem, user);
  }

  const isTyres = moduleItem.id === "tyres";
  const title = isDashboard ? moduleItem.pageTitle : moduleItem.title;
  const description = isTyres && !isDashboard
    ? "Hotový modul evidence pneumatik."
    : moduleItem.description;
  const dashboardLink = !isDashboard && moduleItem.dashboardRoute
    ? `<a class="secondary-link" href="${routeHref(moduleItem.dashboardRoute)}" data-link>Dashboard modulu</a>`
    : "";
  const tyresLink = isTyres && !isDashboard
    ? `
        <a class="primary-link" href="${TYRES_MODULE_URL}" target="_blank" rel="noopener noreferrer">
          Otevřít modul Pneumatiky
        </a>
      `
    : "";
  const usersPanel = moduleItem.id === "users" && !isDashboard ? usersManagementSection() : "";
  const settingsPanel = moduleItem.id === "settings" && !isDashboard ? settingsManagementSection(user) : "";
  const reportsPanel = moduleItem.id === "reports" && !isDashboard ? notificationCenterSection(user) : "";
  const feedbackBox = moduleFeedbackBoxFor(moduleItem, user);

  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__icon">${renderModuleIcon(moduleItem)}</div>
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">${isDashboard ? "Modulový dashboard" : "Modul"}</div>
          <h1 id="module-title">${title}</h1>
          <p>${description}</p>
          <div class="module-detail__status">
            <span>Stav</span>
            <strong>${escapeHtml(moduleStatusLabel(moduleItem))}</strong>
          </div>
          <div class="module-actions">
            ${tyresLink}
            ${dashboardLink}
          </div>
        </div>
      </section>
      ${usersPanel}
      ${settingsPanel}
      ${reportsPanel}
      ${feedbackBox}
    </main>
  `;
}

function notificationStatusLabel(status) {
  return NOTIFICATION_STATUS_LABELS[status] || status || "Neznámý stav";
}

function notificationChannelLabel(channel) {
  return NOTIFICATION_CHANNEL_LABELS[channel] || channel || "neuvedeno";
}

function notificationTypeLabel(type) {
  return NOTIFICATION_TYPE_LABELS[type] || type || "neuvedeno";
}

function notificationStatusBadge(status) {
  const normalized = String(status || "not_sent").trim();
  return `<span class="notification-status notification-status--${escapeHtml(normalized)}">${escapeHtml(notificationStatusLabel(normalized))}</span>`;
}

function notificationHasError(item) {
  return ["failed", "not_sent", "skipped"].includes(String(item?.status || "").trim());
}

function notificationErrorSummary(item) {
  const lastError = notificationHasError(item)
    ? String(item?.lastError || item?.messagePreview || "").trim()
    : "";

  if (!lastError) {
    return "bez chyby";
  }

  const normalized = lastError
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("chybi e-mail prijemce") || normalized.includes("chybi prijemce e-mailu")) {
    return "Chybí e-mail příjemce";
  }

  if (normalized.includes("chybi telefon prijemce")) {
    return "Chybí telefon příjemce";
  }

  if (
    normalized.includes("chybi produkcni nastaveni odesilani") ||
    normalized.includes("email_provider") ||
    normalized.includes("sendgrid_api_key") ||
    normalized.includes("email_from")
  ) {
    return "Chybí nastavení e-mailu";
  }

  if (normalized.includes("chybi produkcni nastaveni sms") || normalized.includes("twilio_")) {
    return "Chybí nastavení SMS";
  }

  if (normalized.includes("sendgrid")) {
    return "Chyba SendGrid";
  }

  return lastError.length > 72 ? `${lastError.slice(0, 69)}...` : lastError;
}

function notificationSummaryCards() {
  const summary = notificationCenterState.summary;
  const cards = [
    ["E-maily odeslané", summary.emailSent],
    ["E-maily neodeslané", summary.emailNotSent],
    ["SMS odeslané", summary.smsSent],
    ["SMS neodeslané", summary.smsNotSent],
    ["Čeká na odeslání", summary.pending],
    ["Selhalo", summary.failed]
  ];

  return `
    <div class="notification-summary-grid">
      ${cards.map(([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

function notificationFiltersForm() {
  const filters = notificationCenterState.filters;
  return `
    <form class="notification-filters" data-notification-filters>
      <label>
        <span>Období od</span>
        <input name="dateFrom" type="date" value="${escapeHtml(filters.dateFrom)}" data-notification-filter />
      </label>
      <label>
        <span>Období do</span>
        <input name="dateTo" type="date" value="${escapeHtml(filters.dateTo)}" data-notification-filter />
      </label>
      <label>
        <span>Kanál</span>
        <select name="channel" data-notification-filter>
          ${optionList(NOTIFICATION_CHANNEL_OPTIONS, filters.channel)}
        </select>
      </label>
      <label>
        <span>Stav</span>
        <select name="status" data-notification-filter>
          ${optionList(NOTIFICATION_STATUS_OPTIONS, filters.status)}
        </select>
      </label>
      <label>
        <span>Typ</span>
        <select name="type" data-notification-filter>
          ${optionList(NOTIFICATION_TYPE_OPTIONS, filters.type)}
        </select>
      </label>
      <label>
        <span>Zaměstnanec</span>
        <input name="employeeId" value="${escapeHtml(filters.employeeId)}" placeholder="ID zaměstnance" data-notification-filter />
      </label>
      <label>
        <span>Nadřízený</span>
        <input name="managerId" value="${escapeHtml(filters.managerId)}" placeholder="ID nadřízeného" data-notification-filter />
      </label>
      <label>
        <span>Vyhledávání</span>
        <input name="search" value="${escapeHtml(filters.search)}" placeholder="Jméno, příjemce, chyba nebo typ" data-notification-filter />
      </label>
      <div class="notification-filter-actions">
        <button class="primary-action" type="submit">Filtrovat</button>
        <button class="secondary-link" type="button" data-notification-reset>Reset</button>
      </div>
    </form>
  `;
}

function notificationRow(item) {
  const requestButton = item.absenceRequestId
    ? `<a class="text-action" href="${routeHref(`/dovolena-nemoc/ke-schvaleni`)}" data-link>Otevřít</a>`
    : '<span class="notification-muted">bez vazby</span>';
  const canRetry = item.status === "failed" || item.status === "not_sent";
  const lastError = notificationHasError(item)
    ? String(item.lastError || item.messagePreview || "").trim()
    : "";
  const errorSummary = notificationErrorSummary(item);
  const errorTitle = lastError ? ` title="${escapeHtml(lastError)}"` : "";

  return `
    <tr>
      <td data-label="Datum / čas">${escapeHtml(formatDateTime(item.createdAt || item.sentAt))}</td>
      <td data-label="Kanál">${escapeHtml(notificationChannelLabel(item.channel))}</td>
      <td data-label="Typ">${escapeHtml(notificationTypeLabel(item.type))}</td>
      <td data-label="Zaměstnanec">${escapeHtml(item.employeeName || "neuvedeno")}</td>
      <td data-label="Nadřízený / příjemce">${escapeHtml(item.managerName || item.recipientName || "neuvedeno")}</td>
      <td data-label="Příjemce">${escapeHtml(item.recipient || "neuvedeno")}</td>
      <td data-label="Stav">${notificationStatusBadge(item.status)}</td>
      <td data-label="Pokusů">${escapeHtml(item.attempts || 1)}</td>
      <td data-label="Poslední chyba">
        <span class="notification-error-summary${lastError ? " notification-error-summary--has-error" : ""}"${errorTitle}>
          ${escapeHtml(errorSummary)}
        </span>
      </td>
      <td data-label="Vazba na žádost">${requestButton}</td>
      <td data-label="Akce">
        <button class="text-action" type="button" data-notification-detail="${escapeHtml(item.id)}">Detail</button>
        ${canRetry ? '<button class="text-action" type="button" data-notification-retry disabled title="Čeká na backend retry workflow">Opakovat</button>' : ""}
      </td>
    </tr>
  `;
}

function notificationTable() {
  if (notificationCenterState.loading && !notificationCenterState.loaded) {
    return '<p class="notification-empty">Načítám notifikace...</p>';
  }

  if (notificationCenterState.error) {
    return `
      <div class="notification-error">
        <p>${escapeHtml(notificationCenterState.error)}</p>
        <button class="secondary-link" type="button" data-notification-reload>Zkusit znovu</button>
      </div>
    `;
  }

  if (!notificationCenterState.items.length) {
    return '<p class="notification-empty">Zatím nejsou žádné notifikace.</p>';
  }

  return `
    <div class="notification-table-wrap">
      <table class="notification-table">
        <thead>
          <tr>
            <th>Datum / čas</th>
            <th>Kanál</th>
            <th>Typ</th>
            <th>Zaměstnanec</th>
            <th>Nadřízený / příjemce</th>
            <th>Příjemce</th>
            <th>Stav</th>
            <th>Pokusů</th>
            <th>Poslední chyba</th>
            <th>Vazba na žádost</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>
          ${notificationCenterState.items.map(notificationRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function notificationDetailPanel() {
  const item = selectedNotification();
  if (!item) {
    return "";
  }

  return `
    <section class="notification-detail" aria-label="Detail notifikace">
      <div class="notification-detail__header">
        <div>
          <span>Detail notifikace</span>
          <h3>${escapeHtml(notificationTypeLabel(item.type))}</h3>
        </div>
        <button class="text-action" type="button" data-notification-detail-close>Zavřít</button>
      </div>
      <dl>
        <div><dt>ID</dt><dd>${escapeHtml(item.id)}</dd></div>
        <div><dt>Kanál</dt><dd>${escapeHtml(notificationChannelLabel(item.channel))}</dd></div>
        <div><dt>Stav</dt><dd>${notificationStatusBadge(item.status)}</dd></div>
        <div><dt>Příjemce</dt><dd>${escapeHtml(item.recipient || "neuvedeno")}</dd></div>
        <div><dt>Zaměstnanec</dt><dd>${escapeHtml(item.employeeName || "neuvedeno")}</dd></div>
        <div><dt>Nadřízený</dt><dd>${escapeHtml(item.managerName || item.recipientName || "neuvedeno")}</dd></div>
        <div><dt>Předmět</dt><dd>${escapeHtml(item.subject || "neuvedeno")}</dd></div>
        <div><dt>Náhled zprávy</dt><dd>${escapeHtml(item.messagePreview || "neuvedeno")}</dd></div>
        <div><dt>Provider</dt><dd>${escapeHtml(item.provider || "neuvedeno")}</dd></div>
        <div><dt>Provider Message ID</dt><dd>${escapeHtml(item.providerMessageId || "neuvedeno")}</dd></div>
        <div><dt>Počet pokusů</dt><dd>${escapeHtml(item.attempts || 1)}</dd></div>
        <div><dt>Poslední chyba</dt><dd>${escapeHtml(item.lastError || "bez chyby")}</dd></div>
        <div><dt>Vytvořeno</dt><dd>${escapeHtml(formatDateTime(item.createdAt))}</dd></div>
        <div><dt>Odesláno</dt><dd>${escapeHtml(formatDateTime(item.sentAt))}</dd></div>
        <div><dt>Selhalo</dt><dd>${escapeHtml(formatDateTime(item.failedAt))}</dd></div>
        <div><dt>Vazba na žádost</dt><dd>${escapeHtml(item.absenceRequestId || "neuvedeno")}</dd></div>
      </dl>
      ${item.absenceRequestId ? `<a class="secondary-link" href="${routeHref("/dovolena-nemoc/ke-schvaleni")}" data-link>Otevřít žádost</a>` : ""}
    </section>
  `;
}

function notificationCenterSection(user) {
  if (!canViewNotificationCenter(user)) {
    return `
      <section class="notification-center notification-center--locked">
        <h2>Notifikace</h2>
        <p>Centrální přehled e-mailů a SMS je dostupný pro Admin, Management a Kancelář.</p>
      </section>
    `;
  }

  return `
    <section class="notification-center" aria-labelledby="notification-center-title">
      <div class="notification-center__header">
        <div>
          <span>Centrální přehled</span>
          <h2 id="notification-center-title">Notifikace e-mailů a SMS</h2>
          <p>Jedno místo pro kontrolu odeslaných i neodeslaných zpráv napříč aplikací.</p>
        </div>
        <button class="secondary-link" type="button" data-notification-export ${notificationCenterState.items.length ? "" : "disabled"}>
          Export CSV
        </button>
      </div>
      ${notificationSummaryCards()}
      ${notificationFiltersForm()}
      ${notificationTable()}
      <p class="notification-meta">
        Zobrazeno ${escapeHtml(notificationCenterState.items.length)} z ${escapeHtml(notificationCenterState.total)} záznamů.
      </p>
      ${notificationDetailPanel()}
    </section>
  `;
}

function compactStatsList(items, emptyText) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    return `<p class="feedback-empty">${emptyText}</p>`;
  }

  return `
    <ul class="feedback-breakdown">
      ${entries.map(([label, count]) => `
        <li>
          <span>${escapeHtml(label)}</span>
          <strong>${count}</strong>
        </li>
      `).join("")}
    </ul>
  `;
}

function priorityTone(priority) {
  return {
    Nízká: "low",
    Běžná: "normal",
    Důležitá: "important",
    Kritická: "critical"
  }[priority] || "normal";
}

function statusTone(status) {
  return {
    Nová: "new",
    Převzato: "accepted",
    "V řešení": "in-progress",
    Hotovo: "done",
    Zamítnuto: "rejected",
    Archiv: "archived"
  }[status] || "archived";
}

function shortFeedbackId(id) {
  const cleaned = String(id || "").replace(/^module-feedback-/, "");
  return cleaned.slice(0, 8) || "neuvedeno";
}

function feedbackCreateDefaultDraft() {
  return {
    moduleId: "",
    title: "",
    description: "",
    priority: "Běžná",
    status: "Nová",
    internalNote: ""
  };
}

function canCreateCentralFeedback(user) {
  return ["admin", "management"].includes(normalizeRole(user?.role));
}

function feedbackModuleOptions() {
  return orderedModules.map((moduleItem) => ({
    value: moduleItem.id === "absence" ? "dovolena-nemoc" : moduleItem.id,
    label: moduleItem.title
  }));
}

function updateFeedbackCreateDraft(form) {
  if (!form) {
    return feedbackCreateState.draft;
  }

  feedbackCreateState.draft = {
    moduleId: form.elements.moduleId?.value || "",
    title: form.elements.title?.value.trim() || "",
    description: form.elements.description?.value.trim() || "",
    priority: form.elements.priority?.value || "Běžná",
    status: form.elements.status?.value || "Nová",
    internalNote: form.elements.internalNote?.value.trim() || ""
  };

  return feedbackCreateState.draft;
}

function feedbackCreateDraftIsDirty(draft = feedbackCreateState.draft) {
  const emptyDraft = feedbackCreateDefaultDraft();
  return Object.keys(emptyDraft).some((key) => String(draft[key] || "") !== String(emptyDraft[key] || ""));
}

function feedbackCreateModuleName(moduleId) {
  return feedbackModuleOptions().find((option) => option.value === moduleId)?.label || "";
}

function resetFeedbackCreateState(options = {}) {
  feedbackCreateState.open = false;
  feedbackCreateState.saving = false;
  feedbackCreateState.error = "";
  feedbackCreateState.draft = feedbackCreateDefaultDraft();

  if (!options.keepMessage) {
    feedbackCreateState.message = "";
  }
}

function openFeedbackCreateForm() {
  if (!canCreateCentralFeedback(currentUser())) {
    return;
  }

  feedbackCreateState.open = true;
  feedbackCreateState.error = "";
  feedbackCreateState.message = "";
  render();
}

function closeFeedbackCreateForm() {
  if (feedbackCreateState.saving) {
    return;
  }

  const form = document.querySelector("[data-feedback-create-form]");
  if (form) {
    updateFeedbackCreateDraft(form);
  }

  if (feedbackCreateDraftIsDirty() && !window.confirm("Zahodit rozepsanou připomínku?")) {
    return;
  }

  resetFeedbackCreateState();
  render();
}

function feedbackCreatePanel(user, moduleOptions) {
  if (!canCreateCentralFeedback(user)) {
    return "";
  }

  if (!feedbackCreateState.open) {
    return feedbackCreateState.message
      ? `<p class="feedback-create__notice" role="status">${escapeHtml(feedbackCreateState.message)}</p>`
      : "";
  }

  const draft = feedbackCreateState.draft;
  const disabled = feedbackCreateState.saving ? "disabled" : "";
  const submitLabel = feedbackCreateState.saving ? "Ukládám..." : "Vytvořit připomínku";

  return `
    <section class="feedback-create" aria-labelledby="feedback-create-title">
      <div class="feedback-create__head">
        <div>
          <p class="module-detail__eyebrow">Nová připomínka</p>
          <h2 id="feedback-create-title">Vytvořit připomínku</h2>
        </div>
        <button class="secondary-link feedback-create__close" type="button" data-feedback-create-close ${disabled}>
          Zavřít
        </button>
      </div>
      <form class="feedback-create__form" data-feedback-create-form>
        <label class="feedback-create__field">
          <span>Modul</span>
          <select name="moduleId" data-feedback-create-field required ${disabled}>
            ${optionList(moduleOptions, draft.moduleId, "Vyberte modul")}
          </select>
        </label>
        <label class="feedback-create__field">
          <span>Název / krátký předmět</span>
          <input name="title" value="${escapeHtml(draft.title)}" data-feedback-create-field maxlength="120" required ${disabled} />
        </label>
        <label class="feedback-create__field">
          <span>Priorita</span>
          <select name="priority" data-feedback-create-field required ${disabled}>
            ${optionList(FEEDBACK_PRIORITIES, draft.priority, "Vyberte prioritu")}
          </select>
        </label>
        <label class="feedback-create__field">
          <span>Stav</span>
          <select name="status" data-feedback-create-field required ${disabled}>
            ${optionList(FEEDBACK_STATUSES, draft.status, "Vyberte stav")}
          </select>
        </label>
        <label class="feedback-create__field feedback-create__field--wide">
          <span>Popis</span>
          <textarea name="description" data-feedback-create-field rows="5" maxlength="1600" required ${disabled}>${escapeHtml(draft.description)}</textarea>
        </label>
        <label class="feedback-create__field feedback-create__field--wide">
          <span>Interní poznámka</span>
          <textarea name="internalNote" data-feedback-create-field rows="3" maxlength="1200" ${disabled}>${escapeHtml(draft.internalNote)}</textarea>
        </label>
        <div class="feedback-create__actions">
          <button class="primary-action" type="submit" ${disabled}>${submitLabel}</button>
          <button class="secondary-link" type="button" data-feedback-create-close ${disabled}>Zrušit</button>
        </div>
        ${feedbackCreateState.error ? `<p class="feedback-create__error" role="alert">${escapeHtml(feedbackCreateState.error)}</p>` : ""}
      </form>
    </section>
  `;
}

function feedbackAdminItem(item, canEdit) {
  const cardState = feedbackCardMessage(item.id);
  const isSaving = feedbackState.savingId === item.id;
  const disabled = isSaving ? "disabled" : "";

  return `
    <article class="feedback-ticket">
      <header class="feedback-ticket__top">
        <div class="feedback-ticket__identity">
          <p class="feedback-ticket__module">${escapeHtml(item.moduleName)}</p>
          <p class="feedback-ticket__author">${escapeHtml(item.userName)} · ${formatDateTime(item.createdAt)}</p>
        </div>
        <div class="feedback-ticket__badges" aria-label="Priorita a stav">
          <span class="feedback-badge feedback-priority--${priorityTone(item.priority)}">${escapeHtml(item.priority)}</span>
          <span class="feedback-badge feedback-status--${statusTone(item.status)}">${escapeHtml(item.status)}</span>
        </div>
      </header>

      <p class="feedback-ticket__message">${escapeHtml(item.message)}</p>

      <dl class="feedback-ticket__meta">
        <div>
          <dt>Vytvořeno</dt>
          <dd>${formatDateTime(item.createdAt)}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>${escapeHtml(roleLabel(item.userRole))}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd>${escapeHtml(shortFeedbackId(item.id))}</dd>
        </div>
      </dl>

      ${canEdit ? `
        <form class="feedback-ticket__management" data-feedback-update-form data-feedback-id="${escapeHtml(item.id)}">
          <h3>Správa připomínky</h3>
          <label class="module-feedback__field">
            <span>Stav</span>
            <select name="status" ${disabled}>
              ${FEEDBACK_STATUSES.map((status) => `
                <option value="${escapeHtml(feedbackStatusApiValue(status))}" ${status === item.status ? "selected" : ""}>${escapeHtml(status)}</option>
              `).join("")}
            </select>
          </label>
          <label class="module-feedback__field module-feedback__field--message">
            <span>Interní poznámka</span>
            <textarea
              name="internalNote"
              rows="3"
              ${disabled}
              placeholder="Interní poznámka pro kancelář / management"
            >${escapeHtml(item.internalNote)}</textarea>
          </label>
          <label class="module-feedback__field module-feedback__field--message">
            <span>Zpráva pro uživatele při Hotovo</span>
            <textarea
              name="resolutionMessage"
              rows="3"
              ${disabled}
              placeholder="Stručně napište, co bylo vyřešeno. Odešle se jen při změně stavu na Hotovo."
            ></textarea>
            <small class="module-feedback__hint">Interní poznámka se uživateli neposílá.</small>
          </label>
          <button class="primary-action feedback-ticket__save" type="submit" ${disabled}>
            ${isSaving ? "Ukládám…" : "Uložit změny"}
          </button>
          ${cardState.message ? `<p class="feedback-ticket__notice">${escapeHtml(cardState.message)}</p>` : ""}
          ${cardState.error ? `<p class="feedback-ticket__error">${escapeHtml(cardState.error)}</p>` : ""}
        </form>
      ` : `
        <section class="feedback-ticket__readonly" aria-label="Stav připomínky">
          <strong>Správa připomínky</strong>
          <span>${escapeHtml(item.status)}</span>
          ${item.internalNote ? `<p>${escapeHtml(item.internalNote)}</p>` : ""}
        </section>
      `}
    </article>
  `;
}

function feedbackPage(user) {
  const allFeedback = feedbackState.items;
  const visibleFeedback = visibleFeedbackForUser(allFeedback, user);
  const summary = feedbackSummary(visibleFeedback);
  const filteredFeedback = filterModuleFeedback(visibleFeedback, feedbackFilters);
  const canEdit = canManageFeedback(user);
  const canCreate = canCreateCentralFeedback(user);
  const canExport = hasPermission(user, "feedback", "export");
  const moduleOptions = feedbackModuleOptions();
  const items = filteredFeedback
    .map((item) => feedbackAdminItem(item, canEdit))
    .join("");
  const apiMessage = feedbackState.loading
    ? '<p class="feedback-empty feedback-empty--large">Načítám připomínky…</p>'
    : feedbackState.error
      ? `<p class="feedback-empty feedback-empty--large">${escapeHtml(feedbackState.error)}</p>`
      : "";
  const emptyState = `
    <section class="feedback-empty-card">
      <h2>Žádné připomínky</h2>
      <p>Zatím nebyly nalezeny žádné připomínky podle zvolených filtrů.</p>
      <button class="secondary-link feedback-reset-button" type="button" data-feedback-reset-filters>Reset filtrů</button>
    </section>
  `;

  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>

      <section class="feedback-admin" aria-labelledby="feedback-title">
        <div class="feedback-admin__head">
          <div>
            <p class="module-detail__eyebrow">Správa</p>
            <h1 id="feedback-title">Připomínky</h1>
            <p>Seznam připomínek k modulům, jejich stavů, priorit a interních poznámek.</p>
          </div>
          ${canCreate || canExport ? `
            <div class="feedback-admin__actions">
              ${canCreate ? `
                <button class="primary-action feedback-admin__new" type="button" data-feedback-create-open>
                  Nová připomínka
                </button>
              ` : ""}
              ${canExport ? `
                <button class="secondary-link feedback-admin__export" type="button" data-feedback-export>
                  Export CSV
                </button>
              ` : ""}
            </div>
          ` : ""}
        </div>

        ${feedbackCreatePanel(user, moduleOptions)}

        <div class="feedback-stats" aria-label="Dashboard připomínek">
          <div class="feedback-stat">
            <span>Nové</span>
            <strong>${summary.newCount}</strong>
          </div>
          <div class="feedback-stat">
            <span>V řešení</span>
            <strong>${summary.inProgressCount}</strong>
          </div>
          <div class="feedback-stat">
            <span>Hotovo</span>
            <strong>${summary.doneCount}</strong>
          </div>
        </div>

        <div class="feedback-dashboard">
          <section>
            <h2>Podle modulů</h2>
            ${compactStatsList(summary.byModule, "Zatím nejsou uložené žádné připomínky.")}
          </section>
          <section>
            <h2>Podle priority</h2>
            ${compactStatsList(summary.byPriority, "Zatím nejsou uložené žádné priority.")}
          </section>
        </div>

        <form class="feedback-filters" data-feedback-filters>
          <label>
            <span>Modul</span>
            <select name="moduleId" data-feedback-filter>
              ${optionList(moduleOptions, feedbackFilters.moduleId)}
            </select>
          </label>
          <label>
            <span>Stav</span>
            <select name="status" data-feedback-filter>
              ${optionList(FEEDBACK_STATUSES, feedbackFilters.status)}
            </select>
          </label>
          <label>
            <span>Priorita</span>
            <select name="priority" data-feedback-filter>
              ${optionList(FEEDBACK_PRIORITIES, feedbackFilters.priority)}
            </select>
          </label>
          <label>
            <span>Autor</span>
            <input name="author" value="${escapeHtml(feedbackFilters.author)}" placeholder="Jméno autora" />
          </label>
          <label class="feedback-filters__search">
            <span>Vyhledat</span>
            <input name="search" value="${escapeHtml(feedbackFilters.search)}" placeholder="Text připomínky nebo poznámky" />
          </label>
          <div class="feedback-filters__actions">
            <button class="primary-action feedback-filter-button" type="submit">Filtrovat</button>
            <button class="secondary-link feedback-reset-button" type="button" data-feedback-reset-filters>Reset</button>
          </div>
        </form>

        <div class="feedback-list" aria-label="Seznam připomínek">
          ${apiMessage || items || emptyState}
        </div>
      </section>
    </main>
  `;
}

function forbiddenPage(user) {
  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>
      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">Oprávnění</div>
          <h1 id="module-title">Nemáte oprávnění</h1>
          <p>Nemáte oprávnění k této části systému.</p>
          <p>Pokud přístup potřebujete, obraťte se na kancelář nebo administrátora.</p>
          <div class="module-actions">
            <a class="primary-link" href="${routeHref("/")}" data-link>Zpět na hlavní stránku</a>
          </div>
        </div>
      </section>
    </main>
  `;
}

function notFoundPage(user) {
  return `
    <main class="app-shell module-page module-theme-scope" ${moduleThemeStyleAttribute()}>
      ${userBar(user)}
      <nav class="topbar" aria-label="Navigace">
        <a class="kaiser-logo kaiser-logo--small" href="${routeHref("/")}" data-link aria-label="Zpět na ${APP_NAME}">kaiser.</a>
        <a class="back-button" href="${routeHref("/")}" data-link>Zpět na HP</a>
      </nav>
      <section class="module-detail" aria-labelledby="module-title">
        <div class="module-detail__body">
          <div class="module-detail__eyebrow">Nenalezeno</div>
          <h1 id="module-title">Stránka neexistuje</h1>
          <p>Požadovaná route zatím není v aplikaci Smart odpady připravená.</p>
        </div>
      </section>
    </main>
  `;
}

function appErrorPage() {
  return `
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="app-error-title">
        <a class="kaiser-logo" href="${routeHref("/")}" data-link aria-label="${APP_NAME}">kaiser.</a>
        <h1 id="app-error-title">${APP_NAME}</h1>
        <p class="login-subtitle">Aplikace se nepodařila načíst.</p>
        <p class="login-error">
          Aplikace narazila na chybu. Obnovte stránku, případně se vraťte na hlavní stránku.
        </p>
        <a class="primary-action" href="${routeHref("/")}" data-link>Zpět na hlavní stránku</a>
      </section>
    </main>
  `;
}

async function apiJson(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Požadavek se nepodařilo dokončit.");
    error.payload = payload;
    throw error;
  }

  return payload;
}

function resetDataBoxState() {
  dataBoxState.loaded = false;
  dataBoxState.loading = false;
  dataBoxState.apiStatus = "waiting";
  dataBoxState.storageStatus = "waiting";
  dataBoxState.integrationStatus = "inactive";
  dataBoxState.status = null;
  dataBoxState.messages = [];
  dataBoxState.syncRuns = [];
  dataBoxState.error = "";
}

function resetVehicleTrackingLiveState() {
  clearVehicleTrackingTcarsGoogleMap();
  vehicleTrackingLiveState.sourceMode = "tcars";
  vehicleTrackingLiveState.loaded = false;
  vehicleTrackingLiveState.loading = false;
  vehicleTrackingLiveState.error = "";
  vehicleTrackingLiveState.status = null;
  vehicleTrackingLiveState.wimLoaded = false;
  vehicleTrackingLiveState.wimLoading = false;
  vehicleTrackingLiveState.wimError = "";
  vehicleTrackingLiveState.wimApiStatus = "waiting";
  vehicleTrackingLiveState.wimSites = [];
  vehicleTrackingLiveState.wimSummary = null;
  vehicleTrackingLiveState.wimSource = null;
  vehicleTrackingLiveState.wimAlertEvents = [];
  vehicleTrackingLiveState.selectedWimSiteId = "";
  vehicleTrackingLiveState.selectedLocationId = "";
}

async function loadDataBoxData(options = {}) {
  const { force = false, renderAfter = true } = options;

  if (dataBoxState.loading || (dataBoxState.loaded && !force)) {
    return;
  }

  dataBoxState.loading = true;
  dataBoxState.error = "";

  try {
    const status = await apiJson("/api/data-box/status");
    dataBoxState.status = status;
    dataBoxState.apiStatus = status.apiStatus || "waiting";
    dataBoxState.storageStatus = status.storageStatus || "waiting";
    dataBoxState.integrationStatus = status.integrationStatus || "inactive";
    dataBoxState.messages = [];
    dataBoxState.syncRuns = [];

    if (dataBoxState.apiStatus === "ready") {
      const [messagesResult, syncRunsResult] = await Promise.all([
        apiJson("/api/data-box/messages?limit=100"),
        apiJson("/api/data-box/sync-runs?limit=50")
      ]);
      dataBoxState.messages = messagesResult.messages || [];
      dataBoxState.syncRuns = syncRunsResult.runs || [];
    }

    dataBoxState.loaded = true;
  } catch (error) {
    dataBoxState.status = null;
    dataBoxState.messages = [];
    dataBoxState.syncRuns = [];
    dataBoxState.apiStatus = error?.payload?.apiStatus || "waiting";
    dataBoxState.error = error?.payload?.error || error?.message || "Datovou schránku se teď nepodařilo načíst.";
    dataBoxState.loaded = true;
  } finally {
    dataBoxState.loading = false;
  }

  if (renderAfter) {
    render();
  }
}

function ensureDataBoxData() {
  if (!hasPermission(currentUser(), DATA_BOX_MODULE_KEY, "view")) {
    return;
  }

  void loadDataBoxData();
}

async function loadVehicleTrackingStatus(options = {}) {
  const { force = false, renderAfter = true } = options;

  if (vehicleTrackingLiveState.loading || (vehicleTrackingLiveState.loaded && !force)) {
    return;
  }

  vehicleTrackingLiveState.loading = true;
  vehicleTrackingLiveState.error = "";

  try {
    const status = await apiJson("/api/vehicle-tracking/status");
    vehicleTrackingLiveState.status = status;
    vehicleTrackingLiveState.loaded = true;
  } catch (error) {
    vehicleTrackingLiveState.status = null;
    vehicleTrackingLiveState.error = error?.payload?.error || error?.message || VEHICLE_TRACKING_API_ERROR;
  } finally {
    vehicleTrackingLiveState.loading = false;
  }

  if (renderAfter) {
    render();
    if (vehicleTrackingActiveSourceMode() === "tcars") {
      queueVehicleTrackingTcarsGoogleSync({ forceFit: true });
    }
  }
}

async function loadVehicleTrackingWimSites(options = {}) {
  const { force = false, renderAfter = true } = options;

  if (vehicleTrackingLiveState.wimLoading || (vehicleTrackingLiveState.wimLoaded && !force)) {
    return;
  }

  if (!hasPermission(currentUser(), "vehicle-tracking", "view")) {
    return;
  }

  vehicleTrackingLiveState.wimLoading = true;
  vehicleTrackingLiveState.wimError = "";

  try {
    const [sitesResult, alertsResult] = await Promise.all([
      apiJson("/api/vehicle-tracking/wim-sites"),
      apiJson("/api/vehicle-tracking/wim-alerts")
    ]);
    vehicleTrackingLiveState.wimSites = Array.isArray(sitesResult.sites) ? sitesResult.sites : [];
    vehicleTrackingLiveState.wimSummary = sitesResult.summary || null;
    vehicleTrackingLiveState.wimSource = sitesResult.source || null;
    vehicleTrackingLiveState.wimApiStatus = sitesResult.apiStatus || "ready";
    vehicleTrackingLiveState.wimAlertEvents = Array.isArray(alertsResult.events) ? alertsResult.events : [];
    vehicleTrackingLiveState.wimLoaded = true;
    if (
      vehicleTrackingLiveState.selectedWimSiteId &&
      !vehicleTrackingLiveState.wimSites.some((site) => site.id === vehicleTrackingLiveState.selectedWimSiteId)
    ) {
      vehicleTrackingLiveState.selectedWimSiteId = "";
    }
    if (!vehicleTrackingLiveState.selectedWimSiteId && vehicleTrackingLiveState.wimSites[0]) {
      vehicleTrackingLiveState.selectedWimSiteId = vehicleTrackingLiveState.wimSites[0].id;
    }
  } catch (error) {
    vehicleTrackingLiveState.wimSites = [];
    vehicleTrackingLiveState.wimSummary = null;
    vehicleTrackingLiveState.wimSource = null;
    vehicleTrackingLiveState.wimApiStatus = error?.payload?.apiStatus || "waiting";
    vehicleTrackingLiveState.wimError = error?.payload?.error || error?.message || VEHICLE_TRACKING_WIM_WAITING;
  } finally {
    vehicleTrackingLiveState.wimLoading = false;
  }

  if (renderAfter) {
    render();
    if (vehicleTrackingActiveSourceMode() === "tcars") {
      queueVehicleTrackingTcarsGoogleSync({ forceFit: true });
    }
  }
}

async function loadFleetVehicles(options = {}) {
  const { force = false, renderAfter = true } = options;

  if (fleetVehiclesState.loading || (fleetVehiclesState.loaded && !force)) {
    return;
  }

  if (!hasPermission(currentUser(), "fleet", "view")) {
    return;
  }

  fleetVehiclesState.loading = true;
  fleetVehiclesState.error = "";

  try {
    const result = await apiJson("/api/vehicles");
    fleetVehiclesState.vehicles = Array.isArray(result.vehicles) ? result.vehicles : [];
    fleetVehiclesState.summary = result.summary || null;
    fleetVehiclesState.apiStatus = result.apiStatus || "waiting";
    fleetVehiclesState.message = result.message || "";
    fleetVehiclesState.lastFetchedAt = result.lastFetchedAt || "";
    fleetVehiclesState.loaded = true;
  } catch (error) {
    fleetVehiclesState.vehicles = [];
    fleetVehiclesState.summary = null;
    fleetVehiclesState.apiStatus = "waiting";
    fleetVehiclesState.error = error?.payload?.error || error?.message || "Vozidla se teď nepodařilo načíst.";
  } finally {
    fleetVehiclesState.loading = false;
  }

  if (renderAfter) {
    render();
  }
}

function handleVehicleTrackingSourceMode(mode) {
  if (!["demo", "tcars"].includes(mode)) {
    return;
  }

  const nextHash = vehicleTrackingSourceModeHash(mode);
  if (window.location.hash !== nextHash) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    lastRenderedUrl = window.location.href;
  }

  vehicleTrackingLiveState.sourceMode = mode;
  render();

  if (mode === "tcars") {
    loadVehicleTrackingStatus();
    loadVehicleTrackingWimSites();
    queueVehicleTrackingTcarsGoogleSync({ forceFit: true });
  } else {
    clearVehicleTrackingTcarsGoogleMap();
  }
}

function handleVehicleTrackingTcarsSelect(locationId, options = {}) {
  const normalizedId = String(locationId || "").trim();
  if (!normalizedId || !vehicleTrackingTcarsLocationById(normalizedId)) {
    return;
  }

  vehicleTrackingLiveState.selectedLocationId = normalizedId;
  syncVehicleTrackingTcarsSelectionDom(normalizedId);
  queueVehicleTrackingTcarsGoogleSync({ focusSelected: options.focusMap !== false });
}

function handleVehicleTrackingTcarsSelectEvent(event) {
  const trackingTcarsSelect = event.target?.closest?.("[data-tracking-tcars-select]");
  if (!trackingTcarsSelect) {
    return false;
  }

  event.preventDefault();
  handleVehicleTrackingTcarsSelect(trackingTcarsSelect.dataset.trackingTcarsSelect || "");
  return true;
}

function handleVehicleTrackingWimSelect(siteId, options = {}) {
  const normalizedId = String(siteId || "").trim();
  if (!normalizedId || !vehicleTrackingWimSiteById(normalizedId)) {
    return;
  }

  vehicleTrackingLiveState.selectedWimSiteId = normalizedId;
  syncVehicleTrackingWimSelectionDom(normalizedId);
  queueVehicleTrackingTcarsGoogleSync({ focusWimSelected: options.focusMap !== false });
}

function handleVehicleTrackingWimSelectEvent(event) {
  const trackingWimSelect = event.target?.closest?.("[data-tracking-wim-select]");
  if (!trackingWimSelect) {
    return false;
  }

  event.preventDefault();
  handleVehicleTrackingWimSelect(trackingWimSelect.dataset.trackingWimSelect || "");
  return true;
}

function resetAssistantPromoState() {
  Object.assign(assistantPromoState, assistantPromoDefaultState);
}

function assistantPromoDateString(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("cs-CZ", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const valueFor = (type) => parts.find((part) => part.type === type)?.value || "";
    const year = valueFor("year");
    const month = valueFor("month").padStart(2, "0");
    const day = valueFor("day").padStart(2, "0");

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Promo fallback must not block app start if Intl timezone support is missing.
  }

  return date.toISOString().slice(0, 10);
}

function isAssistantPromoActive(dateString = assistantPromoDateString()) {
  return dateString <= assistantPromoDefaultState.validUntil;
}

function shouldAutoShowAssistantPromo() {
  const path = normalizePath(window.location.pathname);
  return !path.startsWith(FLEET_ROUTE);
}

function applyAssistantPromoPayload(payload = {}) {
  assistantPromoState.promoKey = String(payload.promoKey || "");
  assistantPromoState.promoDate = String(payload.promoDate || "");
  assistantPromoState.validUntil = String(payload.validUntil || assistantPromoDefaultState.validUntil);
  assistantPromoState.action = String(payload.action || "");
  assistantPromoState.videoUrl = String(payload.videoUrl || assistantPromoDefaultState.videoUrl);
  assistantPromoState.fallbackImageUrl = String(payload.fallbackImageUrl || assistantPromoDefaultState.fallbackImageUrl);
}

async function recordAssistantPromoAction(action) {
  const result = await apiJson("/api/sarlota-promo", {
    method: "POST",
    body: JSON.stringify({ action })
  });
  applyAssistantPromoPayload(result);
  return result;
}

async function loadAssistantPromo(options = {}) {
  if (assistantPromoState.loaded || assistantPromoState.loading || authState.status !== "authenticated" || !authState.user) {
    return;
  }

  assistantPromoState.loading = true;
  assistantPromoState.error = "";

  try {
    const result = await apiJson("/api/sarlota-promo");
    applyAssistantPromoPayload(result);

    if (result.show && shouldAutoShowAssistantPromo()) {
      assistantPromoState.visible = true;
      assistantPromoState.videoFailed = false;
      aiAssistantState.welcomeVisible = false;
      aiAssistantState.welcomeAnimate = false;
      aiAssistantState.launcherVisible = false;
    } else {
      assistantPromoState.visible = false;
    }
  } catch (error) {
    assistantPromoState.error = error?.payload?.error || error?.message || "Promo Šarloty se teď nepodařilo ověřit.";
    assistantPromoState.promoDate = assistantPromoDateString();
    assistantPromoState.validUntil = assistantPromoDefaultState.validUntil;
    assistantPromoState.videoUrl = assistantPromoDefaultState.videoUrl;
    assistantPromoState.fallbackImageUrl = assistantPromoDefaultState.fallbackImageUrl;
    assistantPromoState.visible = isAssistantPromoActive(assistantPromoState.promoDate) && shouldAutoShowAssistantPromo();
    assistantPromoState.videoFailed = false;
    if (assistantPromoState.visible) {
      aiAssistantState.welcomeVisible = false;
      aiAssistantState.welcomeAnimate = false;
      aiAssistantState.launcherVisible = false;
    }
  } finally {
    assistantPromoState.loaded = true;
    assistantPromoState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function renderAssistantPromoLayer() {
  return AiAssistantPromoModal({
    visible: assistantPromoState.visible && shouldAutoShowAssistantPromo(),
    videoUrl: assistantPromoState.videoUrl,
    fallbackImageUrl: assistantPromoState.fallbackImageUrl,
    videoFailed: assistantPromoState.videoFailed,
    saving: assistantPromoState.saving
  });
}

function unmuteAssistantPromoVideo(video) {
  if (!video) {
    return;
  }

  try {
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
  } catch {
    // Browser media policy is allowed to ignore volume changes.
  }
}

function syncAssistantPromoVideo() {
  const promoVideo = document.querySelector("[data-ai-promo-video]");

  if (!promoVideo) {
    return;
  }

  unmuteAssistantPromoVideo(promoVideo);
  promoVideo.addEventListener("loadedmetadata", () => unmuteAssistantPromoVideo(promoVideo), { once: true });
  promoVideo.addEventListener("play", () => unmuteAssistantPromoVideo(promoVideo), { once: true });
}

async function declineAssistantPromo() {
  if (assistantPromoState.saving) {
    return;
  }

  assistantPromoState.saving = true;
  render();

  try {
    await recordAssistantPromoAction("declined");
  } catch (error) {
    assistantPromoState.error = error?.payload?.error || error?.message || "Volbu se nepodařilo uložit.";
  } finally {
    assistantPromoState.visible = false;
    assistantPromoState.saving = false;
    render();
  }
}

async function acceptAssistantPromo() {
  if (assistantPromoState.saving) {
    return;
  }

  assistantPromoState.saving = true;
  assistantPromoState.visible = false;
  render();
  const savePromise = recordAssistantPromoAction("accepted").catch((error) => {
    assistantPromoState.error = error?.payload?.error || error?.message || "Volbu se nepodařilo uložit.";
  });

  try {
    openAiAssistant("voice");
    triggerAiHaptic(15);
    await startAiVoiceRecognition();
  } finally {
    await savePromise;
    assistantPromoState.saving = false;
    render();
  }
}

async function loadModuleFeedback(options = {}) {
  const user = currentUser();
  if (feedbackState.loaded || feedbackState.loading || !hasPermission(user, "feedback", "view")) {
    return;
  }

  feedbackState.loading = true;
  feedbackState.error = "";

  try {
    const result = await apiJson("/api/module-feedback");
    feedbackState.items = (result.feedback || [])
      .map(normalizeFeedback)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    feedbackState.apiStatus = result.apiStatus || "ready";
  } catch (error) {
    const missing = error.payload?.missingEndpoint;
    feedbackState.error = missing
      ? `Čeká na API: ${missing}`
      : "Připomínky se teď nepodařilo načíst.";
    feedbackState.apiStatus = error.payload?.apiStatus || "waiting";
  } finally {
    feedbackState.loaded = true;
    feedbackState.loading = false;
    if (options.render !== false) {
      render();
    }
  }
}

function normalizeNotificationLog(item) {
  return {
    id: String(item?.id || ""),
    moduleId: String(item?.moduleId || ""),
    relatedEntityType: String(item?.relatedEntityType || ""),
    relatedEntityId: String(item?.relatedEntityId || ""),
    absenceRequestId: String(item?.absenceRequestId || item?.relatedEntityId || ""),
    channel: String(item?.channel || ""),
    type: String(item?.type || ""),
    status: String(item?.status || "not_sent"),
    recipient: String(item?.recipient || ""),
    recipientName: String(item?.recipientName || ""),
    employeeId: String(item?.employeeId || ""),
    employeeName: String(item?.employeeName || ""),
    managerId: String(item?.managerId || ""),
    managerName: String(item?.managerName || ""),
    subject: String(item?.subject || ""),
    messagePreview: String(item?.messagePreview || ""),
    provider: String(item?.provider || ""),
    providerMessageId: String(item?.providerMessageId || ""),
    attempts: Number(item?.attempts || 1),
    lastError: String(item?.lastError || ""),
    sentAt: String(item?.sentAt || ""),
    failedAt: String(item?.failedAt || ""),
    createdAt: String(item?.createdAt || ""),
    updatedAt: String(item?.updatedAt || "")
  };
}

function notificationQueryString() {
  const params = new URLSearchParams();
  const filters = notificationCenterState.filters;

  for (const key of ["dateFrom", "dateTo", "channel", "status", "type", "employeeId", "managerId", "search"]) {
    const value = String(filters[key] || "").trim();
    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(notificationCenterState.page));
  params.set("pageSize", String(notificationCenterState.pageSize));
  return params.toString();
}

function canViewNotificationCenter(user) {
  const role = normalizeRole(user?.role);
  return hasPermission(user, "reports", "view") && (isFullAccessRole(user) || role === "kancelar");
}

async function loadNotificationCenter(options = {}) {
  const user = currentUser();
  if (!canViewNotificationCenter(user)) {
    return;
  }

  if (notificationCenterState.loading) {
    return;
  }

  notificationCenterState.loading = true;
  notificationCenterState.error = "";

  try {
    const query = notificationQueryString();
    const [listResult, summaryResult] = await Promise.all([
      apiJson(`/api/notifications?${query}`),
      apiJson(`/api/notifications/summary?${query}`)
    ]);

    notificationCenterState.items = (listResult.items || []).map(normalizeNotificationLog);
    notificationCenterState.summary = {
      emailSent: Number(summaryResult.emailSent || 0),
      emailNotSent: Number(summaryResult.emailNotSent || 0),
      smsSent: Number(summaryResult.smsSent || 0),
      smsNotSent: Number(summaryResult.smsNotSent || 0),
      pending: Number(summaryResult.pending || 0),
      failed: Number(summaryResult.failed || 0)
    };
    notificationCenterState.total = Number(listResult.total || 0);
    notificationCenterState.page = Number(listResult.page || notificationCenterState.page);
    notificationCenterState.pageSize = Number(listResult.pageSize || notificationCenterState.pageSize);
    notificationCenterState.apiStatus = listResult.apiStatus || "ready";
  } catch (error) {
    const missing = error.payload?.missingEndpoint;
    notificationCenterState.error = missing
      ? `Čeká na API: ${missing}`
      : error.payload?.error || "Notifikace se nepodařilo načíst.";
    notificationCenterState.apiStatus = error.payload?.apiStatus || "waiting";
  } finally {
    notificationCenterState.loaded = true;
    notificationCenterState.loading = false;
    if (options.render !== false) {
      render();
    }
  }
}

function selectedNotification() {
  return notificationCenterState.items.find((item) => item.id === notificationCenterState.selectedId) || null;
}

function applyNotificationFilters(form) {
  notificationCenterState.filters = {
    dateFrom: form.elements.dateFrom?.value || notificationDefaultDateFrom(),
    dateTo: form.elements.dateTo?.value || notificationDefaultDateTo(),
    channel: form.elements.channel?.value || "",
    status: form.elements.status?.value || "",
    type: form.elements.type?.value || "",
    employeeId: form.elements.employeeId?.value.trim() || "",
    managerId: form.elements.managerId?.value.trim() || "",
    search: form.elements.search?.value.trim() || ""
  };
  notificationCenterState.page = 1;
  notificationCenterState.loaded = false;
  notificationCenterState.selectedId = "";
  render();
  loadNotificationCenter();
}

function resetNotificationFilters() {
  notificationCenterState.filters = {
    dateFrom: notificationDefaultDateFrom(),
    dateTo: notificationDefaultDateTo(),
    channel: "",
    status: "",
    type: "",
    employeeId: "",
    managerId: "",
    search: ""
  };
  notificationCenterState.page = 1;
  notificationCenterState.loaded = false;
  notificationCenterState.selectedId = "";
  render();
  loadNotificationCenter();
}

function notificationCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportNotificationsCsv() {
  const header = [
    "Datum / čas",
    "Kanál",
    "Typ",
    "Zaměstnanec",
    "Nadřízený",
    "Příjemce",
    "Stav",
    "Pokusů",
    "Poslední chyba",
    "ID žádosti",
    "Provider",
    "Provider Message ID"
  ];
  const rows = notificationCenterState.items.map((item) => [
    formatDateTime(item.createdAt || item.sentAt),
    notificationChannelLabel(item.channel),
    notificationTypeLabel(item.type),
    item.employeeName,
    item.managerName || item.recipientName,
    item.recipient,
    notificationStatusLabel(item.status),
    item.attempts || 1,
    item.lastError || item.messagePreview,
    item.absenceRequestId,
    item.provider,
    item.providerMessageId
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(notificationCsvValue).join(";"))
    .join("\n");

  downloadText("notifikace-smart-odpady.csv", csv, "text/csv;charset=utf-8");
}

function replaceFeedbackItem(feedback) {
  const normalized = normalizeFeedback(feedback);
  feedbackState.items = [
    normalized,
    ...feedbackState.items.filter((item) => item.id !== normalized.id)
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function feedbackCardMessage(id) {
  return feedbackState.cardMessages[id] || { message: "", error: "" };
}

function mergeQuickAbsenceRecent(request) {
  if (!request?.id) {
    return;
  }

  quickAbsenceState.recent = [
    request,
    ...quickAbsenceState.recent.filter((item) => item.id !== request.id)
  ].slice(0, 3);
  quickAbsenceState.recentLoaded = true;
}

async function loadQuickAbsenceRequests(options = {}) {
  if (
    authState.status !== "authenticated" ||
    !authState.user ||
    !hasPermission(currentUser(), "absence", "view") ||
    quickAbsenceState.recentLoading ||
    (quickAbsenceState.recentLoaded && options.force !== true)
  ) {
    return;
  }

  quickAbsenceState.recentLoading = true;

  try {
    const result = await apiJson("/api/absence-requests?mine=1&limit=3");
    quickAbsenceState.recent = Array.isArray(result.requests) ? result.requests.slice(0, 3) : [];
    quickAbsenceState.apiStatus = result.apiStatus || "ready";
    quickAbsenceState.missingEndpoint = "";
    quickAbsenceState.recentLoaded = true;
  } catch (error) {
    quickAbsenceState.apiStatus = error.payload?.apiStatus || "waiting";
    quickAbsenceState.missingEndpoint = error.payload?.missingEndpoint || "POST /api/absence-requests";
  } finally {
    quickAbsenceState.recentLoading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function loadAbsenceRequests(options = {}) {
  if (
    authState.status !== "authenticated" ||
    !authState.user ||
    !hasPermission(currentUser(), "absence", "view") ||
    absenceApiState.loading ||
    (absenceApiState.loaded && options.force !== true)
  ) {
    return;
  }

  absenceApiState.loading = true;
  absenceApiState.error = "";

  try {
    const result = await apiJson("/api/absence-requests?limit=100");
    absenceApiState.requests = Array.isArray(result.requests) ? result.requests : [];
    absenceApiState.apiStatus = result.apiStatus || "ready";
    absenceApiState.loaded = true;
  } catch (error) {
    absenceApiState.apiStatus = error.payload?.apiStatus || "waiting";
    absenceApiState.error = error.payload?.error || "Žádosti se teď nepodařilo načíst.";
  } finally {
    absenceApiState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function loadAbsenceApprovalRequests(options = {}) {
  if (
    authState.status !== "authenticated" ||
    !authState.user ||
    !hasPermission(currentUser(), "absence", "view") ||
    absenceApiState.pendingLoading ||
    (absenceApiState.pendingLoaded && options.force !== true)
  ) {
    return;
  }

  absenceApiState.pendingLoading = true;
  absenceApiState.error = "";

  try {
    const result = await apiJson("/api/absence-requests/pending?limit=100");
    absenceApiState.pendingRequests = Array.isArray(result.requests) ? result.requests : [];
    absenceApiState.apiStatus = result.apiStatus || "ready";
    absenceApiState.pendingLoaded = true;
  } catch (error) {
    absenceApiState.apiStatus = error.payload?.apiStatus || "waiting";
    absenceApiState.error = error.payload?.error || "Žádosti ke schválení se teď nepodařilo načíst.";
  } finally {
    absenceApiState.pendingLoading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function mergeAbsenceRequest(request) {
  if (!request?.id) {
    return;
  }

  const pendingWasLoaded = absenceApiState.pendingLoaded;
  absenceApiState.requests = [
    request,
    ...absenceApiState.requests.filter((item) => item.id !== request.id)
  ];
  if (pendingWasLoaded) {
    absenceApiState.pendingRequests = [
      request,
      ...absenceApiState.pendingRequests.filter((item) => item.id !== request.id)
    ].filter((item) => requestStatusLabel(item) === "Čeká na schválení");
  }
  absenceApiState.loaded = true;
}

function applyQuickDateChoice(choiceId) {
  const type = quickAbsenceType();
  const today = isoDateAfter(0);
  const tomorrow = isoDateAfter(1);

  if (!type) {
    return;
  }

  if (choiceId === "custom") {
    quickAbsenceState.dateMode = "custom";
    quickAbsenceState.dateFrom = quickAbsenceState.dateFrom || today;
    quickAbsenceState.dateTo = quickAbsenceState.dateTo || quickAbsenceState.dateFrom;
    quickAbsenceState.error = "";
    render();
    return;
  }

  quickAbsenceState.dateMode = "";

  if (choiceId === "tomorrow" || choiceId === "tomorrow-open") {
    quickSetDate(tomorrow, tomorrow);
  } else if (choiceId === "two-days") {
    quickSetDate(today, isoDateAfter(1));
  } else if (choiceId === "week") {
    quickSetDate(today, isoDateAfter(4));
  } else if (choiceId === "half-day") {
    quickSetDate(today, today, true);
  } else {
    quickSetDate(today, today);
  }

  render();
}

function continueQuickCustomDate() {
  const type = quickAbsenceType();
  const fromInput = document.querySelector("[data-quick-date-from]");
  const toInput = document.querySelector("[data-quick-date-to]");
  const startInput = document.querySelector("[data-quick-start-time]");
  const endInput = document.querySelector("[data-quick-end-time]");
  const from = fromInput?.value || quickAbsenceState.dateFrom || isoDateAfter(0);
  const to = toInput?.value || from;

  if (type?.id === "doctor") {
    const startTime = startInput?.value || quickAbsenceState.startTime;
    const endTime = endInput?.value || quickAbsenceState.endTime;
    const hours = countAbsenceHours(startTime, endTime);

    if (!from || !startTime || !endTime) {
      quickAbsenceState.error = "U lékaře zadejte datum, čas od a čas do.";
      render();
      return;
    }

    if (hours <= 0) {
      quickAbsenceState.error = "Čas do musí být po času od.";
      render();
      return;
    }

    quickAbsenceState.dateFrom = from;
    quickAbsenceState.dateTo = from;
    quickAbsenceState.halfDay = false;
    quickAbsenceState.startTime = startTime;
    quickAbsenceState.endTime = endTime;
    quickAbsenceState.step = "summary";
    quickAbsenceState.error = "";
    render();
    return;
  }

  if (!from || !to || countAbsenceDays(from, to, false, false) <= 0) {
    quickAbsenceState.error = "Zkontrolujte prosím datum.";
    render();
    return;
  }

  quickSetDate(from, to);
  render();
}

function updateQuickDateField(field, value) {
  if (field === "from") {
    quickAbsenceState.dateFrom = value;
    if (!quickAbsenceState.dateTo || quickAbsenceState.dateTo < value) {
      quickAbsenceState.dateTo = value;
    }
  }

  if (field === "to") {
    quickAbsenceState.dateTo = value;
  }

  if (field === "startTime") {
    quickAbsenceState.startTime = value;
  }

  if (field === "endTime") {
    quickAbsenceState.endTime = value;
  }
}

async function submitQuickAbsenceRequest() {
  const user = currentUser();
  const type = quickAbsenceType();

  if (!user || !type || !quickAbsenceState.dateFrom || quickAbsenceState.saving) {
    return;
  }

  if (type.id === "doctor" && countAbsenceHours(quickAbsenceState.startTime, quickAbsenceState.endTime) <= 0) {
    quickAbsenceState.error = "Čas do musí být po času od.";
    render();
    return;
  }

  quickAbsenceState.saving = true;
  quickAbsenceState.error = "";
  render();

  try {
    const result = await apiJson("/api/absence-requests", {
      method: "POST",
      body: JSON.stringify({
        employeeId: user.id,
        type: type.id,
        dateFrom: quickAbsenceState.dateFrom,
        dateTo: quickAbsenceState.dateTo || quickAbsenceState.dateFrom,
        halfDay: quickAbsenceState.halfDay,
        unit: type.id === "doctor" ? "hours" : "days",
        startTime: type.id === "doctor" ? quickAbsenceState.startTime : "",
        endTime: type.id === "doctor" ? quickAbsenceState.endTime : "",
        note: quickAbsenceState.note.trim(),
        status: type.status
      })
    });

    quickAbsenceState.apiStatus = result.apiStatus || "ready";
    quickAbsenceState.missingEndpoint = "";
    mergeQuickAbsenceRecent(result.request);
    quickAbsenceState.success = true;
  } catch (error) {
    quickAbsenceState.apiStatus = error.payload?.apiStatus || "waiting";
    quickAbsenceState.missingEndpoint = error.payload?.missingEndpoint || "POST /api/absence-requests";
    quickAbsenceState.error = "Nepodařilo se odeslat. Zkuste to znovu.";
  } finally {
    quickAbsenceState.saving = false;
    render();
  }
}

function upsertEmployeeCardInList(employee) {
  const existingIndex = employeeCardState.employees.findIndex((item) => item.id === employee.id);

  if (existingIndex >= 0) {
    employeeCardState.employees = [
      ...employeeCardState.employees.slice(0, existingIndex),
      employee,
      ...employeeCardState.employees.slice(existingIndex + 1)
    ];
    return;
  }

  employeeCardState.employees = [...employeeCardState.employees, employee]
    .sort((a, b) => employeeFullName(a).localeCompare(employeeFullName(b), "cs"));
}

async function loadEmployeeList(options = {}) {
  if (
    authState.status !== "authenticated" ||
    !authState.user ||
    employeeCardState.employeesLoaded ||
    employeeCardState.employeesLoading ||
    !hasPermission(currentUser(), "absence", "view")
  ) {
    return;
  }

  employeeCardState.employeesLoading = true;
  employeeCardState.error = "";

  try {
    const result = await apiJson("/api/employees");
    employeeCardState.employees = Array.isArray(result.employees) ? result.employees : [];
    employeeCardState.apiStatus = result.apiStatus || "waiting";
    employeeCardState.employeesLoaded = true;
  } catch (error) {
    console.error("smart_odpady_employees_load_failed", error);
    employeeCardState.error = "Seznam zaměstnanců se teď nepodařilo načíst.";
  } finally {
    employeeCardState.employeesLoading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function loadEmployeeCard(employeeId, options = {}) {
  if (
    !employeeId ||
    authState.status !== "authenticated" ||
    !authState.user ||
    employeeCardState.loadingId === employeeId
  ) {
    return;
  }

  employeeCardState.loadingId = employeeId;
  employeeCardState.failedId = "";
  employeeCardState.error = "";
  employeeCardState.message = "";

  if (options.clearCurrent !== false && employeeCardState.employee?.id !== employeeId) {
    employeeCardState.employee = null;
    employeeCardState.absence = null;
    employeeCardState.vacationBalance = null;
    employeeCardState.workHistory = [];
    employeeCardState.documents = [];
    employeeCardState.medicalExam = null;
    employeeCardState.medicalExamDraft = null;
    employeeCardState.medicalExamError = "";
    employeeCardState.medicalExamMessage = "";
    employeeCardState.medicalExamApiStatus = "waiting";
    employeeCardState.formDraft = null;
    employeeCardState.documentUploading = false;
  }

  if (options.renderBefore !== false) {
    render();
  }

  try {
    const detail = await apiJson(`/api/employees/${encodeURIComponent(employeeId)}`);
    employeeCardState.employee = detail.employee || null;
    employeeCardState.apiStatus = detail.apiStatus || employeeCardState.apiStatus;

    if (detail.employee) {
      upsertEmployeeCardInList(detail.employee);
    }

    const shouldLoadMedicalExam = canManageEmployeeMedicalExams(authState.user);
    const [vacation, absence, history, documents, medicalExam] = await Promise.allSettled([
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/vacation-balance`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/absence`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/work-history`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/documents`),
      shouldLoadMedicalExam
        ? apiJson(`/api/employees/${encodeURIComponent(employeeId)}/medical-exam`)
        : Promise.resolve(null)
    ]);

    if (vacation.status === "fulfilled") {
      employeeCardState.vacationBalance = vacation.value;
    }

    if (absence.status === "fulfilled") {
      employeeCardState.absence = absence.value;
    }

    if (history.status === "fulfilled") {
      employeeCardState.workHistory = Array.isArray(history.value.items) ? history.value.items : [];
    }

    if (documents.status === "fulfilled") {
      employeeCardState.documents = Array.isArray(documents.value.documents) ? documents.value.documents : [];
      employeeCardState.documentsUploadStatus = documents.value.uploadStatus || "waiting";
      employeeCardState.documentsMissingEndpoint = documents.value.missingEndpoint || "POST /api/employees/:id/documents";
    }

    if (medicalExam.status === "fulfilled" && medicalExam.value) {
      employeeCardState.medicalExam = medicalExam.value.medicalExam || null;
      employeeCardState.medicalExamApiStatus = medicalExam.value.apiStatus || "waiting";
      employeeCardState.medicalExamError = "";
    } else if (shouldLoadMedicalExam && medicalExam.status === "rejected") {
      employeeCardState.medicalExam = null;
      employeeCardState.medicalExamApiStatus = "waiting";
      employeeCardState.medicalExamError = "Lékařské prohlídky se teď nepodařilo načíst.";
    }
  } catch (error) {
    console.error("smart_odpady_employee_card_load_failed", error);
    employeeCardState.failedId = employeeId;
    employeeCardState.error = "Kartu zaměstnance se teď nepodařilo načíst.";
  } finally {
    employeeCardState.loadingId = "";
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function ensureEmployeeCardData(employeeId) {
  if (authState.status !== "authenticated" || !authState.user) {
    return;
  }

  loadEmployeeList();

  if (
    employeeId &&
    employeeCardState.employee?.id !== employeeId &&
    employeeCardState.loadingId !== employeeId &&
    employeeCardState.failedId !== employeeId
  ) {
    loadEmployeeCard(employeeId, { renderBefore: false });
  }
}

async function loadThemeSettings(options = {}) {
  if (!authState.user || themeState.loading) {
    return;
  }

  themeState.loading = true;
  themeState.error = "";

  try {
    const result = await apiJson("/api/theme-settings");
    const settings = normalizeThemeSettings(result.settings);
    themeState.settings = settings;
    themeState.draft = settings;
    themeState.preview = null;
    themeState.loaded = true;
    themeState.message = "";
  } catch (error) {
    console.error("smart_odpady_theme_load_failed", error);
    themeState.settings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
    themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
    themeState.preview = null;
    themeState.error = "Nastavení vzhledu se teď nepodařilo načíst. Používá se výchozí vzhled.";
  } finally {
    themeState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function setAbsenceSettings(settings) {
  absenceState = saveAbsenceState({
    ...absenceState,
    settings: normalizeAbsenceSettings(settings)
  });
}

async function loadAbsenceSettings(options = {}) {
  if (!authState.user || absenceSettingsState.loading || absenceSettingsState.loaded) {
    return;
  }

  absenceSettingsState.loading = true;
  absenceSettingsState.error = "";

  try {
    const result = await apiJson("/api/absence-settings");
    setAbsenceSettings(result.settings || {});
    absenceSettingsState.apiStatus = result.apiStatus || "ready";
    absenceSettingsState.missingEndpoint = "";
    absenceSettingsState.loaded = true;
  } catch (error) {
    absenceSettingsState.apiStatus = error.payload?.apiStatus || "waiting";
    absenceSettingsState.missingEndpoint = error.payload?.missingEndpoint || "PATCH /api/absence-settings";
    absenceSettingsState.error = error.payload?.error || "Nastavení reportu se teď nepodařilo načíst.";
  } finally {
    absenceSettingsState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function resetModuleRulesState() {
  moduleRulesState.moduleKey = "absence";
  moduleRulesState.rules = [];
  moduleRulesState.auditLog = [];
  moduleRulesState.automationRuns = [];
  moduleRulesState.automationRunnerRuns = [];
  moduleRulesState.loaded = false;
  moduleRulesState.loading = false;
  moduleRulesState.saving = false;
  moduleRulesState.apiStatus = "waiting";
  moduleRulesState.error = "";
  moduleRulesState.message = "";
  moduleRulesState.formOpen = false;
  moduleRulesState.editingId = "";
  moduleRulesState.formType = "rule";
  moduleRulesState.selectedId = "";
  moduleRulesState.searchQuery = "";
  moduleRulesState.typeFilter = "all";
  moduleRulesState.statusFilter = "all";
}

function ensureModuleRulesData(moduleKey = "absence") {
  if (!authState.user || moduleRulesState.loading) {
    return;
  }

  if (moduleRulesState.moduleKey !== moduleKey) {
    resetModuleRulesState();
    moduleRulesState.moduleKey = moduleKey;
  }

  if (!moduleRulesState.loaded) {
    void loadModuleRules(moduleKey);
  }
}

async function loadModuleRules(moduleKey = moduleRulesState.moduleKey, options = {}) {
  if (!authState.user || moduleRulesState.loading) {
    return;
  }

  moduleRulesState.moduleKey = moduleKey;
  moduleRulesState.loading = true;
  moduleRulesState.error = "";

  try {
    const [result, runsResult] = await Promise.all([
      apiJson(`/api/modules/${encodeURIComponent(moduleKey)}/rules`),
      apiJson(`/api/modules/${encodeURIComponent(moduleKey)}/automation-runs`).catch(() => ({ runs: [] }))
    ]);
    moduleRulesState.rules = Array.isArray(result.rules) ? result.rules : [];
    moduleRulesState.automationRuns = Array.isArray(runsResult.runs) ? runsResult.runs : [];
    moduleRulesState.automationRunnerRuns = Array.isArray(runsResult.runnerRuns) ? runsResult.runnerRuns : [];
    moduleRulesState.loaded = true;
    moduleRulesState.apiStatus = result.apiStatus || "ready";
    if (
      moduleRulesState.selectedId &&
      !moduleRulesState.rules.some((item) => item.id === moduleRulesState.selectedId)
    ) {
      moduleRulesState.selectedId = "";
    }
    if (!moduleRulesState.selectedId && moduleRulesState.rules[0]) {
      moduleRulesState.selectedId = moduleRulesState.rules[0].id;
      void loadModuleRuleAudit(moduleKey, moduleRulesState.selectedId, { renderAfter: false });
    }
  } catch (error) {
    moduleRulesState.rules = [];
    moduleRulesState.automationRuns = [];
    moduleRulesState.automationRunnerRuns = [];
    moduleRulesState.loaded = false;
    moduleRulesState.apiStatus = error.payload?.apiStatus || "waiting";
    moduleRulesState.error = error.payload?.error || "Pravidla a automatizace se teď nepodařilo načíst.";
  } finally {
    moduleRulesState.loading = false;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function loadModuleRuleAudit(moduleKey, ruleId, options = {}) {
  if (!authState.user || !ruleId) {
    return;
  }

  try {
    const result = await apiJson(`/api/modules/${encodeURIComponent(moduleKey)}/rules/${encodeURIComponent(ruleId)}/audit`);
    moduleRulesState.auditLog = Array.isArray(result.auditLog) ? result.auditLog : [];
  } catch (error) {
    moduleRulesState.auditLog = [];
    moduleRulesState.error = error.payload?.error || "Audit log pravidla se teď nepodařilo načíst.";
  }

  if (options.renderAfter !== false) {
    render();
  }
}

function openModuleRuleForm(type = "rule", id = "") {
  moduleRulesState.formOpen = true;
  moduleRulesState.formType = type === "automation" ? "automation" : "rule";
  moduleRulesState.editingId = id;
  moduleRulesState.error = "";
  moduleRulesState.message = "";
  render();
}

function closeModuleRuleForm() {
  moduleRulesState.formOpen = false;
  moduleRulesState.editingId = "";
  moduleRulesState.error = "";
  render();
}

function parseModuleRuleJson(value, fieldLabel) {
  const cleaned = String(value || "").trim() || "{}";
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    throw new Error(`${fieldLabel} musí být platný JSON.`);
  }
}

function moduleRuleFormData(form) {
  const formData = new FormData(form);
  const type = String(formData.get("type") || "rule");
  return {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    type,
    status: String(formData.get("status") || "draft"),
    isAutomation: type === "automation",
    triggerType: String(formData.get("triggerType") || "manual"),
    scheduleCron: String(formData.get("scheduleCron") || "").trim(),
    eventName: String(formData.get("eventName") || "").trim(),
    cloudRunner: String(formData.get("cloudRunner") || "").trim(),
    conditionsJson: parseModuleRuleJson(formData.get("conditionsJson"), "Podmínky JSON"),
    actionsJson: parseModuleRuleJson(formData.get("actionsJson"), "Akce JSON"),
    auditNote: String(formData.get("auditNote") || "").trim()
  };
}

async function saveModuleRuleForm(form) {
  if (!hasPermission(currentUser(), moduleRulesState.moduleKey, "manage")) {
    moduleRulesState.error = "Nemáte oprávnění měnit pravidla a automatizace.";
    render();
    return;
  }

  let payload = null;
  try {
    payload = moduleRuleFormData(form);
  } catch (error) {
    moduleRulesState.error = error.message;
    render();
    return;
  }

  const ruleId = String(form.dataset.ruleId || "").trim();
  moduleRulesState.saving = true;
  moduleRulesState.error = "";
  moduleRulesState.message = "Ukládám pravidlo do cloud DB...";
  render();

  try {
    const path = ruleId
      ? `/api/modules/${encodeURIComponent(moduleRulesState.moduleKey)}/rules/${encodeURIComponent(ruleId)}`
      : `/api/modules/${encodeURIComponent(moduleRulesState.moduleKey)}/rules`;
    const result = await apiJson(path, {
      method: ruleId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    moduleRulesState.message = ruleId ? "Pravidlo bylo uloženo." : "Pravidlo bylo vytvořeno.";
    moduleRulesState.formOpen = false;
    moduleRulesState.editingId = "";
    moduleRulesState.selectedId = result.rule?.id || ruleId || moduleRulesState.selectedId;
    await loadModuleRules(moduleRulesState.moduleKey, { renderAfter: false });
    await loadModuleRuleAudit(moduleRulesState.moduleKey, moduleRulesState.selectedId, { renderAfter: false });
  } catch (error) {
    moduleRulesState.error = error.payload?.error || "Pravidlo se nepodařilo uložit.";
    moduleRulesState.message = "";
  } finally {
    moduleRulesState.saving = false;
    render();
  }
}

async function toggleModuleRuleStatus(ruleId, nextStatus) {
  if (!hasPermission(currentUser(), moduleRulesState.moduleKey, "manage")) {
    moduleRulesState.error = "Nemáte oprávnění měnit stav pravidla.";
    render();
    return;
  }

  const action = nextStatus === "active" ? "activate" : "deactivate";
  moduleRulesState.saving = true;
  moduleRulesState.error = "";
  moduleRulesState.message = nextStatus === "active" ? "Aktivuji pravidlo..." : "Deaktivuji pravidlo...";
  render();

  try {
    const result = await apiJson(`/api/modules/${encodeURIComponent(moduleRulesState.moduleKey)}/rules/${encodeURIComponent(ruleId)}/${action}`, {
      method: "POST"
    });
    moduleRulesState.selectedId = result.rule?.id || ruleId;
    moduleRulesState.message = nextStatus === "active" ? "Pravidlo bylo aktivováno." : "Pravidlo bylo deaktivováno.";
    await loadModuleRules(moduleRulesState.moduleKey, { renderAfter: false });
    await loadModuleRuleAudit(moduleRulesState.moduleKey, moduleRulesState.selectedId, { renderAfter: false });
  } catch (error) {
    moduleRulesState.error = error.payload?.error || "Stav pravidla se nepodařilo změnit.";
    moduleRulesState.message = "";
  } finally {
    moduleRulesState.saving = false;
    render();
  }
}

function selectModuleRule(ruleId) {
  moduleRulesState.selectedId = ruleId;
  moduleRulesState.error = "";
  moduleRulesState.message = "";
  void loadModuleRuleAudit(moduleRulesState.moduleKey, ruleId);
  render();
}

function updateAppearanceDraft(form, options = {}) {
  themeState.draft = appearanceFormData(form);
  themeState.error = "";

  if (options.preview) {
    themeState.preview = themeState.draft;
    themeState.message = "Náhled změn je zapnutý pro přihlášenou část aplikace.";
  }
}

async function saveAppearanceSettings(settings = themeState.draft) {
  if (!canManageAppearanceSettings()) {
    themeState.error = "Nemáte oprávnění upravovat vzhled aplikace.";
    render();
    return false;
  }

  const payload = normalizeThemeSettings(settings);
  themeState.saving = true;
  themeState.message = "Ukládám vzhled...";
  themeState.error = "";
  themeState.preview = payload;
  render();

  try {
    const result = await apiJson("/api/theme-settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const savedSettings = normalizeThemeSettings(result.settings || payload);
    themeState.settings = savedSettings;
    themeState.draft = savedSettings;
    themeState.preview = null;
    themeState.loaded = true;
    themeState.message = "Vzhled aplikace byl uložen.";
    themeState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_theme_save_failed", error);
    themeState.preview = null;
    themeState.error = "Vzhled se nepodařilo uložit. Zkuste to prosím znovu.";
    themeState.message = "";
    return false;
  } finally {
    themeState.saving = false;
    render();
  }
}

function previewAppearanceSettings(form) {
  updateAppearanceDraft(form, { preview: true });
  render();
}

async function resetAppearanceSettings() {
  themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.preview = themeState.draft;
  await saveAppearanceSettings(themeState.draft);
}

function exportAppearanceSettings() {
  const json = JSON.stringify(normalizeThemeSettings(themeState.draft), null, 2);
  downloadText(`smart-odpady-vzhled-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json;charset=utf-8");
}

async function importAppearanceSettings(input) {
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    themeState.draft = normalizeThemeSettings(JSON.parse(text));
    themeState.preview = themeState.draft;
    themeState.message = "Import je připravený v náhledu. Pro trvalé uložení klikněte na Uložit vzhled.";
    themeState.error = "";
  } catch (error) {
    console.error("smart_odpady_theme_import_failed", error);
    themeState.error = "Import vzhledu se nepodařil. Zkontrolujte JSON soubor.";
    themeState.message = "";
  } finally {
    input.value = "";
    render();
  }
}

async function startLogin(form) {
  const identifier = form.elements.identifier.value.trim();

  if (!identifier) {
    authState.error = "Vyplňte e-mail nebo telefon.";
    render();
    return;
  }

  authState = {
    ...authState,
    status: "submitting",
    pendingIdentifier: identifier,
    message: "",
    error: "",
    mockCode: false
  };
  render();

  try {
    const result = await apiJson("/api/auth/start", {
      method: "POST",
      body: JSON.stringify({ identifier })
    });

    authState = {
      ...authState,
      status: "anonymous",
      codeSent: true,
      message: "Pokud je účet povolený, kód byl odeslán.",
      error: "",
      mockCode: Boolean(result.mock)
    };
  } catch {
    authState = {
      ...authState,
      status: "anonymous",
      error: "Ověřovací kód teď nejde odeslat. Zkuste to prosím znovu.",
      mockCode: false
    };
  }

  render();
}

async function verifyLogin(form) {
  const identifier = authState.pendingIdentifier || form.elements.identifier.value.trim();
  const code = form.elements.code.value.trim();

  if (!code) {
    authState.error = "Vyplňte ověřovací kód.";
    render();
    return;
  }

  authState = {
    ...authState,
    status: "submitting",
    message: "",
    error: ""
  };
  render();

  try {
    const result = await apiJson("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, code })
    });

    authState = {
      status: "authenticated",
      user: result.user,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    await loadThemeSettings({ renderAfter: false });
    await loadAbsenceSettings({ renderAfter: false });
    await loadAssistantPromo({ renderAfter: false });
  } catch {
    authState = {
      ...authState,
      status: "anonymous",
      error: "Přihlášení se nepodařilo. Zkontrolujte kód a zkuste to znovu."
    };
  }

  render();
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  resetAiAssistantSession();
  resetAssistantPromoState();
  authState = {
    status: "anonymous",
    user: null,
    pendingIdentifier: "",
    codeSent: false,
    message: "",
    error: "",
    mockCode: false
  };
  adminUsersState.loaded = false;
  adminUsersState.users = [];
  accessUsersSearchState.query = "";
  feedbackState.items = [];
  feedbackState.loaded = false;
  feedbackState.loading = false;
  feedbackState.error = "";
  feedbackState.apiStatus = "waiting";
  feedbackState.savingId = "";
  feedbackState.cardMessages = {};
  resetFeedbackCreateState();
  themeState.loaded = false;
  themeState.loading = false;
  themeState.saving = false;
  themeState.settings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.draft = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);
  themeState.preview = null;
  themeState.message = "";
  themeState.error = "";
  absenceState = loadAbsenceState();
  absenceSettingsState.loaded = false;
  absenceSettingsState.loading = false;
  absenceSettingsState.saving = false;
  absenceSettingsState.apiStatus = "waiting";
  absenceSettingsState.error = "";
  absenceSettingsState.missingEndpoint = "PATCH /api/absence-settings";
  resetModuleRulesState();
  resetDataBoxState();
  resetVehicleTrackingLiveState();
  navigateToUrl(routeHref("/"));
}

async function loadAdminUsers() {
  if (adminUsersState.loaded || adminUsersState.loading || !hasPermission(currentUser(), "users", "view")) {
    return;
  }

  adminUsersState.loading = true;
  adminUsersState.error = "";

  try {
    const result = await apiJson("/api/users");
    adminUsersState.users = result.users || [];
    adminUsersState.loaded = true;
  } catch {
    adminUsersState.error = "Seznam uživatelů teď nejde načíst.";
  } finally {
    adminUsersState.loading = false;
    render();
  }
}

function renderAuthenticatedApp(user) {
  const path = normalizePath(window.location.pathname);
  const userPrimaryRoutes = new Map(visibleModules(user).map((moduleItem) => [moduleItem.route, moduleItem]));
  const userDashboardRoutes = new Map(visibleDashboardRoutes(user).map((moduleItem) => [moduleItem.route, moduleItem]));

  if (hasPermission(user, "feedback", "view")) {
    loadModuleFeedback({ render: true });
  }

  if (path === "/") {
    app.innerHTML = homePage(user);
    document.title = APP_NAME;
    return;
  }

  if (path === FEEDBACK_ROUTE) {
    if (!canViewModule(user, "feedback")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    app.innerHTML = feedbackPage(user);
    document.title = `Připomínky | ${APP_NAME}`;
    return;
  }

  if (path === "/dovolena-nemoc/notifikace") {
    navigateToUrl(routeHref("/reporty"));
    return;
  }

  const routeTab = absenceTabForRoute(path);
  if (routeTab) {
    if (!canUseAbsenceTab(user, routeTab)) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    absenceUiState.tab = routeTab;
    const moduleItem = absenceModuleItem();
    loadEmployeeList();
    app.innerHTML = absenceModulePage(moduleItem, user, false, { tab: routeTab });
    const tabLabel = ABSENCE_TABS.find((tab) => tab.id === routeTab)?.label || "Dovolená / Nemoc";
    document.title = `${tabLabel} | ${APP_NAME}`;
    if (routeTab === "quick") {
      loadQuickAbsenceRequests();
    } else {
      loadAbsenceRequests();
      if (routeTab === "approval" || routeTab === "dashboard") {
        loadAbsenceApprovalRequests();
      }
    }
    return;
  }

  const employeeId = routeEmployeeId(path);
  if (employeeId) {
    if (!canViewModule(user, "absence")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    const moduleItem = absenceModuleItem();
    app.innerHTML = absenceModulePage(moduleItem, user, false, { employeeId });
    const titleName = employeeCardState.employee?.id === employeeId
      ? employeeFullName(employeeCardState.employee)
      : "Karta zaměstnance";
    document.title = `${titleName} | ${APP_NAME}`;
    return;
  }

  const fleetVehicleId = routeFleetVehicleId(path);
  if (fleetVehicleId) {
    if (!canViewModule(user, "fleet")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    const moduleItem = orderedModules.find((item) => item.id === "fleet");
    app.innerHTML = fleetModulePage(moduleItem, user, { vehicleId: fleetVehicleId });
    document.title = `Detail vozidla | ${APP_NAME}`;
    loadFleetVehicles();
    return;
  }

  const trackingContext = routeVehicleTrackingContext(path);
  if (trackingContext) {
    if (!canViewModule(user, "vehicle-tracking")) {
      app.innerHTML = forbiddenPage(user);
      document.title = `Bez oprávnění | ${APP_NAME}`;
      return;
    }

    const moduleItem = orderedModules.find((item) => item.id === "vehicle-tracking");
    app.innerHTML = vehicleTrackingPage(moduleItem, user, trackingContext);
    document.title = `${trackingContext.view === "today-trip" ? "Dnešní trasa" : trackingContext.view === "history" ? "Historie jízd" : "Detail sledování vozidla"} | ${APP_NAME}`;
    if (vehicleTrackingActiveSourceMode() === "tcars") {
      loadVehicleTrackingStatus();
      loadVehicleTrackingWimSites();
      queueVehicleTrackingTcarsGoogleSync({ forceFit: true });
    }
    return;
  }

  if (userPrimaryRoutes.has(path)) {
    const moduleItem = userPrimaryRoutes.get(path);
    app.innerHTML = modulePage(moduleItem, user);
    document.title = `${moduleItem.title} | ${APP_NAME}`;

    if (moduleItem.id === "users" && hasPermission(user, "users", "view")) {
      loadAdminUsers();
    }
    if (moduleItem.id === "reports") {
      loadNotificationCenter();
    }
    if (moduleItem.id === "absence") {
      loadEmployeeList();
      loadAbsenceRequests();
      loadAbsenceApprovalRequests();
      if (absenceUiState.tab === "quick" || normalizeRole(user?.role) === "ridic") {
        loadQuickAbsenceRequests();
      }
    }
    if (moduleItem.id === "vehicle-tracking" && vehicleTrackingActiveSourceMode() === "tcars") {
      loadVehicleTrackingStatus();
      loadVehicleTrackingWimSites();
      queueVehicleTrackingTcarsGoogleSync({ forceFit: true });
    }
    if (moduleItem.id === "fleet") {
      loadFleetVehicles();
    }
    return;
  }

  if (userDashboardRoutes.has(path)) {
    const moduleItem = userDashboardRoutes.get(path);
    app.innerHTML = modulePage(moduleItem, user, true);
    document.title = `${moduleItem.pageTitle} | ${APP_NAME}`;
    if (moduleItem.id === "absence") {
      loadEmployeeList();
      loadAbsenceRequests();
      loadAbsenceApprovalRequests();
    }
    if (moduleItem.id === "fleet") {
      loadFleetVehicles();
    }
    return;
  }

  if (primaryRoutes.has(path) || dashboardRoutes.has(path)) {
    app.innerHTML = forbiddenPage(user);
    document.title = `Bez oprávnění | ${APP_NAME}`;
    return;
  }

  app.innerHTML = notFoundPage(user);
  document.title = `Nenalezeno | ${APP_NAME}`;
}

function renderApp() {
  if (authState.status === "loading") {
    app.innerHTML = loadingPage();
    document.title = `Přihlášení | ${APP_NAME}`;
    return;
  }

  if (!authState.user) {
    app.innerHTML = loginPage();
    document.title = `Přihlášení | ${APP_NAME}`;
    return;
  }

  const user = currentUser();

  if (!isUserActive(user)) {
    app.innerHTML = forbiddenPage(user || authState.user);
    document.title = `Bez oprávnění | ${APP_NAME}`;
    return;
  }

  renderAuthenticatedApp(user);
}

function render() {
  try {
    accessUnsavedChangesGuard.unmountModal();
    applyActiveThemeToRoot();
    renderApp();
    app.insertAdjacentHTML("beforeend", renderAiAssistantLayer());
    app.insertAdjacentHTML("beforeend", renderAssistantPromoLayer());
    syncAssistantPromoVideo();
    syncVehicleTrackingDemoRuntime();
    if (aiAssistantState.welcomeVisible && aiAssistantState.welcomeAnimate) {
      aiAssistantState.welcomeAnimate = false;
    }
    app.insertAdjacentHTML("beforeend", accessUnsavedChangesGuard.renderModal());
    scrollToQuickAbsenceEntry();
  } catch (error) {
    console.error("smart_odpady_render_failed", error);
    app.innerHTML = appErrorPage();
    document.title = `Chyba | ${APP_NAME}`;
    scrollToPageTop();
  }
}

async function bootstrapAuth() {
  try {
    const result = await apiJson("/api/me");
    authState = {
      status: "authenticated",
      user: result.user,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    await loadThemeSettings({ renderAfter: false });
    await loadAbsenceSettings({ renderAfter: false });
    await loadAssistantPromo({ renderAfter: false });
  } catch {
    authState = {
      status: "anonymous",
      user: null,
      pendingIdentifier: "",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
  }

  render();
}

function hasUnsavedChanges() {
  return Boolean(currentDirtyTarget());
}

const accessUnsavedChangesGuard = useUnsavedChangesGuard({
  isDirty: hasUnsavedChanges,
  saveChanges: saveDirtyChanges,
  discardChanges: discardDirtyChanges,
  render
});

function navigateToUrl(url) {
  window.history.pushState({}, "", url);
  lastRenderedUrl = window.location.href;
  render();
}

function guardedAccessAction(action) {
  accessUnsavedChangesGuard.confirm(action);
}

function handlePopStateNavigation() {
  const targetUrl = window.location.href;

  if (accessUnsavedChangesGuard.isDirty()) {
    window.history.pushState({}, "", lastRenderedUrl);
    accessUnsavedChangesGuard.confirm(() => {
      window.history.pushState({}, "", targetUrl);
      lastRenderedUrl = window.location.href;
      render();
    });
    return;
  }

  lastRenderedUrl = targetUrl;
  render();
}

function handleHashChangeNavigation() {
  if (accessUnsavedChangesGuard.isDirty()) {
    window.history.replaceState({}, "", lastRenderedUrl);
    accessUnsavedChangesGuard.confirm(() => {
      lastRenderedUrl = window.location.href;
      render();
    });
    return;
  }

  lastRenderedUrl = window.location.href;
  render();
}

async function submitModuleFeedback(form) {
  const user = currentUser();
  if (!hasPermission(user, "feedback", "create")) {
    feedbackFormState[form.dataset.moduleId || ""] = {
      message: "",
      error: "Nemáte oprávnění odeslat připomínku."
    };
    render();
    return;
  }

  const moduleId = form.dataset.moduleId || "";
  const moduleName = form.dataset.moduleName || "";
  const message = form.elements.message.value;
  const priority = form.elements.priority.value;

  try {
    const result = await apiJson("/api/module-feedback", {
      method: "POST",
      body: JSON.stringify({
        moduleId,
        moduleName,
        message,
        priority
      })
    });

    if (result.feedback) {
      replaceFeedbackItem(result.feedback);
    }

    form.reset();
    feedbackState.apiStatus = result.apiStatus || "ready";
    feedbackState.loaded = true;
    feedbackFormState[moduleId] = {
      message: "Děkujeme, připomínka byla uložena.",
      error: ""
    };
  } catch (error) {
    const missing = error.payload?.missingEndpoint;
    feedbackFormState[moduleId] = {
      message: "",
      error: missing
        ? `Čeká na API: ${missing}`
        : "Připomínku se nepodařilo uložit. Zkuste to prosím znovu."
    };
  }

  render();
}

async function submitCentralModuleFeedback(form) {
  const user = currentUser();
  if (!canCreateCentralFeedback(user)) {
    feedbackCreateState.error = "Nemáte oprávnění vytvořit připomínku.";
    render();
    return false;
  }

  const draft = updateFeedbackCreateDraft(form);
  const moduleName = feedbackCreateModuleName(draft.moduleId);

  if (!draft.moduleId || !moduleName) {
    feedbackCreateState.error = "Vyberte modul připomínky.";
    render();
    return false;
  }

  if (!draft.title) {
    feedbackCreateState.error = "Vyplňte název připomínky.";
    render();
    return false;
  }

  if (!draft.description) {
    feedbackCreateState.error = "Vyplňte popis připomínky.";
    render();
    return false;
  }

  feedbackCreateState.saving = true;
  feedbackCreateState.error = "";
  feedbackCreateState.message = "";
  render();

  try {
    const result = await apiJson("/api/module-feedback/admin", {
      method: "POST",
      body: JSON.stringify({
        moduleId: draft.moduleId,
        moduleName,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        status: draft.status,
        internalNote: draft.internalNote
      })
    });

    if (result.feedback) {
      replaceFeedbackItem(result.feedback);
    }

    feedbackState.apiStatus = result.apiStatus || "ready";
    feedbackState.loaded = true;
    feedbackCreateState.message = "Připomínka byla vytvořena.";
    resetFeedbackCreateState({ keepMessage: true });
    render();
    return true;
  } catch (error) {
    const missing = error.payload?.missingEndpoint;
    feedbackCreateState.error = missing
      ? `Čeká na API: ${missing}`
      : error.payload?.error || "Připomínku se nepodařilo vytvořit.";
    feedbackCreateState.saving = false;
    render();
    return false;
  }
}

function feedbackResolutionNotificationMessage(notification) {
  if (!notification) {
    return "";
  }

  if (notification.status === "sent") {
    return "E-mail uživateli byl odeslán.";
  }

  const detail = notification.errorMessage ? ` ${notification.errorMessage}` : "";

  if (notification.status === "skipped") {
    return `E-mail uživateli nebyl odeslán.${detail}`;
  }

  if (notification.status === "failed") {
    return `E-mail uživateli se nepodařilo odeslat.${detail}`;
  }

  return "";
}

async function updateFeedbackCard(form) {
  const user = currentUser();
  const id = form.dataset.feedbackId || "";

  if (!canManageFeedback(user) || !id) {
    return;
  }

  feedbackState.savingId = id;
  feedbackState.cardMessages = {
    ...feedbackState.cardMessages,
    [id]: { message: "", error: "" }
  };
  render();

  try {
    const result = await apiJson(`/api/module-feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: form.elements.status?.value || "new",
        internalNote: form.elements.internalNote?.value || "",
        resolutionMessage: form.elements.resolutionMessage?.value || ""
      })
    });

    if (result.feedback) {
      replaceFeedbackItem(result.feedback);
    }

    feedbackState.cardMessages = {
      ...feedbackState.cardMessages,
      [id]: { message: ["Uloženo", feedbackResolutionNotificationMessage(result.notification)].filter(Boolean).join(". "), error: "" }
    };
    feedbackState.apiStatus = result.apiStatus || "ready";
  } catch (error) {
    const missing = error.payload?.missingEndpoint;
    feedbackState.cardMessages = {
      ...feedbackState.cardMessages,
      [id]: {
        message: "",
        error: missing ? `Čeká na API: ${missing}` : "Změny se nepodařilo uložit"
      }
    };
  } finally {
    feedbackState.savingId = "";
    render();
  }
}

function resetFeedbackFilters() {
  feedbackFilters.moduleId = "";
  feedbackFilters.status = "";
  feedbackFilters.priority = "";
  feedbackFilters.author = "";
  feedbackFilters.search = "";
  render();
}

function applyFeedbackFilters(form) {
  feedbackFilters.moduleId = form.elements.moduleId?.value || "";
  feedbackFilters.status = form.elements.status?.value || "";
  feedbackFilters.priority = form.elements.priority?.value || "";
  feedbackFilters.author = form.elements.author?.value || "";
  feedbackFilters.search = form.elements.search?.value || "";
  render();
}

function currentFilteredFeedback() {
  return filterModuleFeedback(visibleFeedbackForUser(feedbackState.items, currentUser()), feedbackFilters);
}

function exportFeedbackCsv() {
  if (!hasPermission(currentUser(), "feedback", "export")) {
    return;
  }

  const csv = moduleFeedbackToCsv(currentFilteredFeedback());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smart-odpady-pripominky-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function absenceSettingsFormData(form) {
  return normalizeAbsenceSettings({
    recipientEmail: form.elements.recipientEmail?.value,
    reportDay: form.elements.reportDay?.value,
    reportTime: form.elements.reportTime?.value,
    emailProvider: form.elements.emailProvider?.value
  });
}

function setAbsenceNotice(message, error = "") {
  absenceUiState.message = message;
  absenceUiState.error = error;
}

function canSeeAbsenceNotificationWarning(user) {
  const role = normalizeRole(user?.role);
  return isFullAccessRole(user) || role === "kancelar";
}

function absenceNotificationWarning(notification, channelLabel, user = currentUser()) {
  if (!canSeeAbsenceNotificationWarning(user) || !notification) {
    return "";
  }

  if (notification.status !== "failed" && notification.status !== "skipped") {
    return "";
  }

  const errorMessage = String(notification.errorMessage || "").trim();
  const recipientName = String(notification.recipientName || "").trim();
  const showRecipientInChannel = recipientName && !errorMessage.includes(recipientName);
  const channelWithRecipient = showRecipientInChannel ? `${channelLabel} (${recipientName})` : channelLabel;
  const reason = errorMessage ? ` ${errorMessage}` : "";
  return `Workflow je uložený, ale ${channelWithRecipient} se nepodařilo odeslat.${reason}`;
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename, csv) {
  downloadText(filename, csv, "text/csv;charset=utf-8");
}

function fleetCsvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function fleetImportPreviewToCsv(preview) {
  const headers = ["radek", "stav", "spz_maskovana", "vin_maskovany", "vozidlo", "parovani", "kontrola"];
  const rows = (preview?.matching?.rows || []).map((row) => [
    row.rowNumber,
    row.statusLabel,
    row.registrationNumberMasked || "",
    row.vinMasked || "",
    row.name || row.internalVehicleNumber || "",
    row.matchedBy || "",
    (row.warnings || []).join(", ")
  ]);

  return `\uFEFF${[headers, ...rows].map((row) => row.map(fleetCsvCell).join(";")).join("\n")}`;
}

async function submitFleetVistosImport(form) {
  const user = currentUser();

  if (!hasPermission(user, "fleet", "edit")) {
    fleetImportPreviewState.error = "Nemáte oprávnění zpracovat náhled importu.";
    fleetImportPreviewState.message = "";
    render();
    return;
  }

  const file = form.elements.file?.files?.[0] || null;

  if (!file) {
    fleetImportPreviewState.error = "Vyberte soubor exportu z Vistos.";
    fleetImportPreviewState.message = "";
    render();
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  fleetImportPreviewState.loading = true;
  fleetImportPreviewState.error = "";
  fleetImportPreviewState.message = "";
  render();

  try {
    const result = await apiJson("/api/fleet/vistos-import/preview", {
      method: "POST",
      body: formData
    });
    fleetImportPreviewState.preview = result.preview;
    fleetImportPreviewState.message = "Náhled je připravený. Produkční data nebyla změněná.";
  } catch (error) {
    fleetImportPreviewState.error = error.message || "Náhled importu se nepodařilo zpracovat.";
  } finally {
    fleetImportPreviewState.loading = false;
    render();
  }
}

function exportFleetImportPreviewCsv() {
  if (!fleetImportPreviewState.preview) {
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`vozovy-park-vistos-preview-${date}.csv`, fleetImportPreviewToCsv(fleetImportPreviewState.preview));
}

function setFleetActionMessage(message) {
  fleetUiState.message = message;
  fleetUiState.error = "";
  render();
}

function scrollToFleetTarget(targetId) {
  if (!targetId) {
    return;
  }

  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function activateFleetTab(tabId) {
  if (!isFleetTabId(tabId)) {
    setFleetActionMessage("Akce není dostupná.");
    return false;
  }

  const nextHash = `#fleet-${encodeURIComponent(tabId)}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    lastRenderedUrl = window.location.href;
  }

  return true;
}

function handleFleetTab(tab) {
  const tabId = String(tab.dataset.fleetTab || "").trim();

  if (!activateFleetTab(tabId)) {
    return;
  }

  fleetUiState.message = "";
  fleetUiState.error = "";
  render();
}

function handleFleetAction(button) {
  const action = button.dataset.fleetAction || "";
  const vehicleId = String(button.dataset.fleetVehicleId || "").trim();
  const target = String(button.dataset.fleetTarget || "").trim();

  if (action === "openModule") {
    guardedAccessAction(() => navigateToUrl(routeHref(FLEET_ROUTE)));
    return;
  }

  if (action === "addVehicle") {
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.addVehicle);
    return;
  }

  if (action === "detail") {
    if (vehicleId) {
      guardedAccessAction(() => navigateToUrl(routeHref(`${FLEET_ROUTE}/${encodeURIComponent(vehicleId)}`)));
      return;
    }

    activateFleetTab("detail");
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.detail);
    return;
  }

  if (action === "defect") {
    activateFleetTab("defects");
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.defect);
    return;
  }

  if (action === "service") {
    activateFleetTab("service");
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.service);
    return;
  }

  if (action === "documents") {
    activateFleetTab("documents");
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.documents);
    scrollToFleetTarget(target);
    return;
  }

  if (action === "export") {
    setFleetActionMessage(FLEET_ACTION_WAITING_MESSAGES.export);
    return;
  }

  setFleetActionMessage("Akce není dostupná.");
}

async function submitAbsenceRequest(form) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "create")) {
    setAbsenceNotice("", "Nemáte oprávnění vytvořit žádost.");
    render();
    return;
  }

  const type = form.elements.type.value;
  const isDoctor = absenceTypeLabel(type) === "Lékař";
  const dateFrom = form.elements.dateFrom.value;
  const dateTo = isDoctor ? dateFrom : form.elements.dateTo.value;
  const startTime = isDoctor ? form.elements.startTime?.value || "" : "";
  const endTime = isDoctor ? form.elements.endTime?.value || "" : "";
  const halfDayFrom = isDoctor ? false : Boolean(form.elements.halfDayFrom?.checked);
  const halfDayTo = isDoctor ? false : Boolean(form.elements.halfDayTo?.checked);
  const daysCount = isDoctor ? 0 : countAbsenceDays(dateFrom, dateTo, halfDayFrom, halfDayTo);
  const hoursCount = isDoctor ? countAbsenceHours(startTime, endTime) : 0;

  if (!dateFrom || (!isDoctor && (!dateTo || daysCount <= 0))) {
    setAbsenceNotice("", "Zkontrolujte prosím datum od a do.");
    render();
    return;
  }

  if (isDoctor && (!startTime || !endTime || hoursCount <= 0)) {
    setAbsenceNotice("", "U lékaře zadejte čas od a čas do. Čas do musí být po času od.");
    render();
    return;
  }

  const employees = absenceSelectableEmployees(user);
  const selectedEmployee = employees.find((employee) => employee.id === form.elements.employeeId.value) || employees[0];

  if (!selectedEmployee?.id) {
    setAbsenceNotice("", "Vyberte prosím zaměstnance.");
    render();
    return;
  }

  try {
    const result = await apiJson("/api/absence-requests", {
      method: "POST",
      body: JSON.stringify({
        employeeId: selectedEmployee.id,
        type,
        dateFrom,
        dateTo,
        halfDay: halfDayFrom || halfDayTo,
        unit: isDoctor ? "hours" : "days",
        startTime,
        endTime,
        note: form.elements.note.value.trim()
      })
    });

    mergeAbsenceRequest(result.request);
    absenceUiState.tab = "my";
    const isApprovalRequest = requestStatusLabel(result.request) === "Čeká na schválení";
    setAbsenceNotice(
      requestStatusLabel(result.request) === "Evidováno"
        ? "Nepřítomnost byla evidována."
        : "Žádost byla odeslána ke schválení.",
      isApprovalRequest
        ? absenceNotificationWarning(result.notification, "e-mail nadřízenému", user)
        : ""
    );
    navigateToUrl(routeHref(absenceRouteForTab("my")));
  } catch (error) {
    setAbsenceNotice("", error.payload?.error || "Žádost se nepodařilo uložit přes cloud API.");
    render();
  }
}

async function saveAbsenceSettings(targetOrForm) {
  if (!hasPermission(currentUser(), "absence", "manage")) {
    setAbsenceNotice("", "Nemáte oprávnění měnit nastavení.");
    render();
    return false;
  }

  const settings = targetOrForm?.current || absenceSettingsFormData(targetOrForm);
  absenceSettingsState.saving = true;
  absenceSettingsState.error = "";
  setAbsenceNotice("Ukládám nastavení reportu...");
  render();

  try {
    const result = await apiJson("/api/absence-settings", {
      method: "PATCH",
      body: JSON.stringify(settings)
    });
    setAbsenceSettings(result.settings || settings);
    absenceSettingsState.loaded = true;
    absenceSettingsState.apiStatus = result.apiStatus || "ready";
    absenceSettingsState.missingEndpoint = "";
    setAbsenceNotice("Nastavení reportu bylo uloženo přes cloud API.");
    return true;
  } catch (error) {
    absenceSettingsState.apiStatus = error.payload?.apiStatus || "waiting";
    absenceSettingsState.missingEndpoint = error.payload?.missingEndpoint || "PATCH /api/absence-settings";
    absenceSettingsState.error = error.payload?.error || "Nastavení reportu se nepodařilo uložit.";
    setAbsenceNotice("", absenceSettingsState.error);
    return false;
  } finally {
    absenceSettingsState.saving = false;
    render();
  }
}

function applyAbsenceFilters(form) {
  absenceUiState.typeFilter = form.elements.type?.value || "";
  absenceUiState.employeeFilter = form.elements.employeeId?.value || "";
  absenceUiState.monthFilter = form.elements.month?.value || currentMonthKey();
  render();
}

function updateAbsenceFormPreview(form) {
  const type = form.elements.type.value;
  const isDoctor = absenceTypeLabel(type) === "Lékař";
  const dateFrom = form.elements.dateFrom.value;
  const dateTo = isDoctor ? dateFrom : form.elements.dateTo.value;
  const days = countAbsenceDays(
    dateFrom,
    dateTo,
    Boolean(form.elements.halfDayFrom?.checked),
    Boolean(form.elements.halfDayTo?.checked)
  );
  const hours = countAbsenceHours(form.elements.startTime?.value, form.elements.endTime?.value);
  const dayFields = form.querySelectorAll("[data-absence-day-field]");
  const doctorTimeFields = form.querySelector("[data-absence-doctor-time-fields]");
  const durationTitle = form.querySelector("[data-absence-duration-title]");
  const daysPreview = form.querySelector("[data-absence-days-preview]");
  const statusPreview = form.querySelector("[data-absence-status-preview]");
  const submitButton = form.querySelector("[data-absence-submit]");

  dayFields.forEach((field) => {
    field.hidden = isDoctor;
  });

  if (doctorTimeFields) {
    doctorTimeFields.hidden = !isDoctor;
  }

  if (durationTitle) {
    durationTitle.textContent = isDoctor ? "Počet hodin" : "Počet dnů";
  }

  if (daysPreview) {
    daysPreview.textContent = isDoctor
      ? (hours > 0 ? formatAbsenceHours(hours) : "zkontrolujte čas")
      : (days > 0 ? formatAbsenceDays(days) : "zkontrolujte datum");
  }

  if (statusPreview) {
    statusPreview.textContent = initialStatusForAbsenceType(type);
  }

  if (submitButton) {
    submitButton.textContent = absenceSubmitLabel(type);
  }
}

async function approveAbsenceRequest(requestId) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "approve") && !isFullAccessRole(user)) {
    setAbsenceNotice("", "Nemáte oprávnění schvalovat žádosti.");
    render();
    return;
  }

  absenceUiState.actionLoadingId = requestId;
  setAbsenceNotice("");
  render();

  try {
    const result = await apiJson(`/api/absence-requests/${encodeURIComponent(requestId)}/approve`, {
      method: "POST",
      body: JSON.stringify({
        approvedByUserId: user?.id || "",
        note: "Schváleno v modulu Dovolená / Nemoc."
      })
    });
    mergeAbsenceRequest(result.request);
    absenceUiState.rejectRequestId = "";
    absenceUiState.rejectReason = "";
    setAbsenceNotice(
      "Žádost byla schválena.",
      absenceNotificationWarning(result.notification, "SMS zaměstnanci", user)
    );
  } catch (error) {
    setAbsenceNotice("", error.payload?.error || "Žádost se nepodařilo schválit.");
  } finally {
    absenceUiState.actionLoadingId = "";
    await loadAbsenceApprovalRequests({ force: true, renderAfter: false });
    await loadAbsenceRequests({ force: true, renderAfter: false });
    render();
  }
}

function toggleRejectAbsenceRequest(requestId) {
  absenceUiState.rejectRequestId = absenceUiState.rejectRequestId === requestId ? "" : requestId;
  absenceUiState.rejectReason = "";
  render();
}

async function rejectAbsenceRequest(requestId) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "approve") && !isFullAccessRole(user)) {
    setAbsenceNotice("", "Nemáte oprávnění zamítat žádosti.");
    render();
    return;
  }

  absenceUiState.actionLoadingId = requestId;
  setAbsenceNotice("");
  render();

  try {
    const result = await apiJson(`/api/absence-requests/${encodeURIComponent(requestId)}/reject`, {
      method: "POST",
      body: JSON.stringify({
        rejectedByUserId: user?.id || "",
        reason: absenceUiState.rejectReason.trim()
      })
    });
    mergeAbsenceRequest(result.request);
    absenceUiState.rejectRequestId = "";
    absenceUiState.rejectReason = "";
    setAbsenceNotice(
      "Žádost byla zamítnuta.",
      absenceNotificationWarning(result.notification, "SMS zaměstnanci", user)
    );
  } catch (error) {
    setAbsenceNotice("", error.payload?.error || "Žádost se nepodařilo zamítnout.");
  } finally {
    absenceUiState.actionLoadingId = "";
    await loadAbsenceApprovalRequests({ force: true, renderAfter: false });
    await loadAbsenceRequests({ force: true, renderAfter: false });
    render();
  }
}

async function cancelAbsenceRequest(requestId) {
  if (!window.confirm("Opravdu zrušit tuto žádost?")) {
    return;
  }

  absenceUiState.actionLoadingId = requestId;
  setAbsenceNotice("");
  render();

  try {
    const result = await apiJson(`/api/absence-requests/${encodeURIComponent(requestId)}`, {
      method: "DELETE"
    });
    mergeAbsenceRequest(result.request);
    setAbsenceNotice("Žádost byla zrušena.");
  } catch (error) {
    setAbsenceNotice("", error.payload?.error || "Žádost se nepodařilo zrušit.");
  } finally {
    absenceUiState.actionLoadingId = "";
    await loadAbsenceRequests({ force: true, renderAfter: false });
    render();
  }
}

function exportAbsenceCsv() {
  const user = currentUser();
  if (!hasPermission(user, "absence", "export")) {
    setAbsenceNotice("", "Nemáte oprávnění exportovat reporty.");
    render();
    return;
  }

  const displayState = absenceDisplayState();
  const requests = filterAbsenceRequests(visibleAbsenceRequests(displayState, user), {
    type: absenceUiState.typeFilter,
    employeeId: absenceUiState.employeeFilter,
    month: absenceUiState.monthFilter
  });

  downloadCsv(`dovolena-nemoc-${absenceUiState.monthFilter}.csv`, absenceRequestsToCsv(requests));
}

function generateAbsenceMonthlyReport() {
  const user = currentUser();
  if (!hasPermission(user, "absence", "export")) {
    setAbsenceNotice("", "Nemáte oprávnění generovat report.");
    render();
    return;
  }

  const result = generateMonthlyAbsenceReport(absenceDisplayState(), user);
  const period = `${String(result.report.periodMonth).padStart(2, "0")}-${result.report.periodYear}`;

  downloadCsv(
    `mesicni-report-nepritomnosti-${period}.csv`,
    monthlyAbsenceReportToCsv(result.report, result.requests)
  );
  setAbsenceNotice("Měsíční report byl vygenerovaný jako CSV export. Reálné odesílání e-mailem čeká na potvrzený backend worker.");
  render();
}

async function saveEmployeeCardChanges(target = currentEmployeeCardDirtyTarget()) {
  if (!target?.isDirty || !employeeCardState.employee?.id) {
    return true;
  }

  employeeCardState.formDraft = target.current;
  employeeCardState.saving = true;
  employeeCardState.message = "Ukládám kartu zaměstnance...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}`, {
      method: "PATCH",
      body: JSON.stringify(employeeCardComparable(target.current))
    });
    const savedEmployee = result.employee || target.current;
    employeeCardState.employee = savedEmployee;
    employeeCardState.formDraft = null;
    upsertEmployeeCardInList(savedEmployee);
    employeeCardState.message = "Karta zaměstnance byla uložena.";
    employeeCardState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_employee_card_save_failed", error);
    employeeCardState.formDraft = target.current;
    employeeCardState.error = "Kartu zaměstnance se nepodařilo uložit. Zkuste to prosím znovu.";
    employeeCardState.message = "";
    return false;
  } finally {
    employeeCardState.saving = false;
    render();
  }
}

function discardEmployeeCardDirtyChanges() {
  employeeCardState.formDraft = null;
  employeeCardState.message = "Neuložené změny karty byly zahozeny.";
  employeeCardState.error = "";
  render();
}

async function saveEmployeeMedicalExamChanges(target = currentEmployeeMedicalExamDirtyTarget()) {
  if (!target?.isDirty || !employeeCardState.employee?.id) {
    employeeCardState.medicalExamMessage = "Lékařské prohlídky nemají žádné změny k uložení.";
    employeeCardState.medicalExamError = "";
    render();
    return true;
  }

  employeeCardState.medicalExamDraft = target.current;
  employeeCardState.medicalExamSaving = true;
  employeeCardState.medicalExamMessage = "Ukládám lékařskou prohlídku...";
  employeeCardState.medicalExamError = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}/medical-exam`, {
      method: "PATCH",
      body: JSON.stringify(employeeMedicalExamComparable(target.current))
    });

    employeeCardState.medicalExam = result.medicalExam || target.current;
    employeeCardState.medicalExamDraft = null;
    employeeCardState.medicalExamApiStatus = result.apiStatus || employeeCardState.medicalExamApiStatus;
    employeeCardState.medicalExamMessage = "Lékařská prohlídka byla uložena.";
    employeeCardState.medicalExamError = "";
    return true;
  } catch (error) {
    employeeCardState.medicalExamDraft = target.current;
    employeeCardState.medicalExamError = error.message || "Lékařskou prohlídku se nepodařilo uložit.";
    employeeCardState.medicalExamMessage = "";
    return false;
  } finally {
    employeeCardState.medicalExamSaving = false;
    render();
  }
}

function discardEmployeeMedicalExamDirtyChanges() {
  employeeCardState.medicalExamDraft = null;
  employeeCardState.medicalExamMessage = "Neuložené změny lékařské prohlídky byly zahozeny.";
  employeeCardState.medicalExamError = "";
  render();
}

async function saveEmployeeManager(employeeId, managerId) {
  if (!canEditEmployeeCards()) {
    employeeCardState.error = "Nemáte oprávnění měnit nadřízeného.";
    render();
    return false;
  }

  employeeCardState.managerSaving = true;
  employeeCardState.managerPendingId = employeeId;
  employeeCardState.message = "Ukládám nadřízeného...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      body: JSON.stringify({ managerId })
    });
    const savedEmployee = result.employee;

    if (savedEmployee) {
      employeeCardState.employee = savedEmployee;
      upsertEmployeeCardInList(savedEmployee);
    }

    employeeCardState.message = "Nadřízený byl uložen.";
    employeeCardState.error = "";
    return true;
  } catch (error) {
    console.error("smart_odpady_employee_manager_save_failed", error);
    employeeCardState.error = "Nadřízeného se nepodařilo uložit.";
    employeeCardState.message = "";
    return false;
  } finally {
    employeeCardState.managerSaving = false;
    employeeCardState.managerPendingId = "";
    render();
  }
}

async function saveEmployeeWorkHistory(form) {
  if (!employeeCardState.employee?.id || !canEditEmployeeCards()) {
    employeeCardState.error = "Nemáte oprávnění upravit pracovní historii.";
    render();
    return;
  }

  employeeCardState.workHistorySaving = true;
  employeeCardState.message = "Ukládám pracovní historii...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}/work-history`, {
      method: "POST",
      body: JSON.stringify({
        dateFrom: form.elements.dateFrom.value,
        dateTo: form.elements.dateTo.value,
        position: form.elements.position.value.trim(),
        department: form.elements.department.value.trim(),
        note: form.elements.note.value.trim()
      })
    });

    employeeCardState.workHistory = [result.item, ...employeeCardState.workHistory].filter(Boolean);
    employeeCardState.message = "Pracovní historie byla uložena.";
    employeeCardState.error = "";
  } catch (error) {
    console.error("smart_odpady_employee_work_history_save_failed", error);
    employeeCardState.error = "Pracovní historii se nepodařilo uložit.";
    employeeCardState.message = "";
  } finally {
    employeeCardState.workHistorySaving = false;
    render();
  }
}

async function saveEmployeeDocumentUpload(form) {
  if (!employeeCardState.employee?.id || !canEditEmployeeCards()) {
    employeeCardState.error = "Nemáte oprávnění nahrávat dokumenty.";
    render();
    return;
  }

  const file = form.elements.file?.files?.[0] || null;
  if (!file) {
    employeeCardState.error = "Vyberte soubor dokumentu.";
    employeeCardState.message = "";
    render();
    return;
  }

  const formData = new FormData(form);
  employeeCardState.documentUploading = true;
  employeeCardState.message = "Nahrávám dokument...";
  employeeCardState.error = "";
  render();

  try {
    const result = await apiJson(`/api/employees/${encodeURIComponent(employeeCardState.employee.id)}/documents`, {
      method: "POST",
      body: formData
    });

    if (result.document) {
      employeeCardState.documents = [result.document, ...employeeCardState.documents];
    }

    employeeCardState.documentsUploadStatus = result.uploadStatus || "ready";
    employeeCardState.documentsMissingEndpoint = "";
    employeeCardState.message = "Dokument byl nahrán.";
    employeeCardState.error = "";
  } catch (error) {
    console.error("smart_odpady_employee_document_upload_failed", error);
    employeeCardState.error = error.message || "Dokument se nepodařilo nahrát.";
    employeeCardState.message = "";
  } finally {
    employeeCardState.documentUploading = false;
    render();
  }
}

function canEditAccessUsers() {
  const user = currentUser();
  return hasPermission(user, "users", "edit") || hasPermission(user, "users", "manage");
}

function canManageAccessRoles() {
  return hasPermission(currentUser(), "users", "manage");
}

function setAccessError(error, feedbackTarget = "") {
  setAccessState({
    ...accessState,
    message: "",
    error,
    feedbackTarget
  });
}

function handleAccessActionError(error, message, feedbackTarget = "user") {
  console.error("smart_odpady_access_action_failed", error);
  try {
    setAccessError(message, feedbackTarget);
    render();
  } catch (renderError) {
    console.error("smart_odpady_access_error_render_failed", renderError);
    app.innerHTML = appErrorPage();
    document.title = `Chyba | ${APP_NAME}`;
    scrollToPageTop();
  }
}

async function saveAccessUserForm(form) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění upravovat uživatele.", "user");
    render();
    return false;
  }

  const now = new Date().toISOString();
  const payload = accessUserFormData(form, { updatedAt: now });

  if (!payload.name) {
    setAccessError("Vyplňte jméno uživatele.", "user");
    render();
    return false;
  }

  if (!payload.email && !payload.phone) {
    setAccessError("Vyplňte alespoň e-mail nebo telefon.", "user");
    render();
    return false;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  const targetUserId = String(payload.id || form.dataset.userId || "").trim().toLowerCase();
  if (!payload.active && signedUserId && signedUserId === targetUserId) {
    setAccessError("Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.", "user");
    render();
    return false;
  }

  if (
    signedUserId &&
    signedUserId === targetUserId &&
    isFullAccessRole(currentUser()) &&
    !isFullAccessRole({ role: payload.role, active: true })
  ) {
    setAccessError("Vlastní účet s plným přístupem nejde v testovacím režimu změnit na omezenou roli.", "user");
    render();
    return false;
  }

  setAccessState({
    ...accessState,
    selectedUserId: payload.id,
    message: "Ukládám změny...",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const savedSourceUser = findSavedAccessUser(form.dataset.userId);
    const isNewUser = !savedSourceUser?.id || String(payload.id || "").startsWith("draft-user-");
    const result = await apiJson(isNewUser ? "/api/users" : `/api/users/${encodeURIComponent(payload.id)}`, {
      method: isNewUser ? "POST" : "PATCH",
      body: JSON.stringify(payload)
    });
    const savedUser = result.user || payload;
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    const users = accessState.users.filter((user) => (
      !sameAccessUserIdentity(user, payload) &&
      !sameAccessUserIdentity(user, savedUser)
    ));
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      users,
      selectedUserId: savedUser.id,
      message: "Změny byly uloženy.",
      error: "",
      feedbackTarget: "user"
    });
    render();
    return true;
  } catch (error) {
    console.error("smart_odpady_user_save_failed", error);
    setAccessError("Změny se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "user");
    render();
    return false;
  }
}

async function saveAccessUserStatus(user, active) {
  const payload = {
    ...user,
    active,
    status: active ? "active" : "disabled",
    updatedAt: new Date().toISOString()
  };

  setAccessState({
    ...accessState,
    selectedUserId: user.id,
    message: active ? "Zapínám uživatele..." : "Vypínám uživatele...",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const result = await apiJson(`/api/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    const savedUser = result.user || payload;
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      selectedUserId: savedUser.id,
      message: "Stav uživatele byl uložen.",
      error: "",
      feedbackTarget: "user"
    });
  } catch (error) {
    console.error("smart_odpady_user_status_save_failed", error);
    setAccessError("Stav uživatele se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "user");
  }

  render();
}

async function saveAccessUserManager(userId, managerId) {
  if (!canEditManagers()) {
    setAccessError("Nemáte oprávnění měnit nadřízeného.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  const normalizedManagerId = String(managerId || "").trim();
  if (
    normalizedManagerId &&
    normalizedManagerId.toLowerCase() === String(user.id || "").trim().toLowerCase()
  ) {
    setAccessError("Uživatel nesmí být sám sobě nadřízený.", "user");
    render();
    return;
  }

  if (normalizedManagerId) {
    const manager = allAccessUsers().find((item) => (
      String(item.id || "").trim().toLowerCase() === normalizedManagerId.toLowerCase() &&
      item.active !== false &&
      String(item.status || "active").toLowerCase() !== "disabled"
    ));

    if (!manager) {
      setAccessError("Nadřízeného se nepodařilo uložit.", "user");
      render();
      return;
    }
  }

  accessManagerState.savingUserId = user.id;
  accessManagerState.pendingManagerId = normalizedManagerId;
  setAccessState({
    ...accessState,
    selectedUserId: user.id,
    message: "Ukládám…",
    error: "",
    feedbackTarget: "user"
  });
  render();

  try {
    const result = await apiJson(`/api/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ managerId: normalizedManagerId })
    });
    const savedUser = result.user || {
      ...user,
      managerId: normalizedManagerId,
      managerName: managerLabel({ managerId: normalizedManagerId }, allAccessUsers())
    };
    adminUsersState.users = mergeAccessUsers(adminUsersState.users, [savedUser]);
    if (String(authState.user?.id || "") === String(savedUser.id || "")) {
      authState = {
        ...authState,
        user: savedUser
      };
    }
    setAccessState({
      ...accessState,
      selectedUserId: savedUser.id,
      message: "Nadřízený byl uložen.",
      error: "",
      feedbackTarget: "user"
    });
  } catch (error) {
    console.error("smart_odpady_user_manager_save_failed", error);
    setAccessError("Nadřízeného se nepodařilo uložit.", "user");
  } finally {
    accessManagerState.savingUserId = "";
    accessManagerState.pendingManagerId = "";
    render();
  }
}

function saveAccessRoleForm(form) {
  if (!canManageAccessRoles()) {
    setAccessError("Nemáte oprávnění upravovat role.", "role");
    render();
    return false;
  }

  const roleId = normalizeRole(form.dataset.roleId);
  if (isFullAccessRole({ role: roleId, active: true })) {
    setAccessError("Admin a Management mají v testovacím režimu vždy plná práva a nejde je omezit.", "role");
    render();
    return false;
  }

  setAccessError("Změny oprávnění se teď nepodařilo uložit. Zkuste to prosím znovu za chvíli.", "role");
  render();
  return false;
}

async function saveAccessDirtyChanges() {
  const target = currentAccessDirtyTarget();

  if (!target) {
    return true;
  }

  if (target.type === "user") {
    return saveAccessUserForm(target.form);
  }

  if (target.type === "role") {
    return saveAccessRoleForm(target.form);
  }

  return false;
}

async function saveDirtyChanges() {
  const accessTarget = currentAccessDirtyTarget();

  if (accessTarget) {
    return saveAccessDirtyChanges();
  }

  const appearanceTarget = currentAppearanceDirtyTarget();

  if (appearanceTarget?.isDirty) {
    return saveAppearanceSettings(appearanceTarget.current);
  }

  const absenceSettingsTarget = currentAbsenceSettingsDirtyTarget();

  if (absenceSettingsTarget?.isDirty) {
    return saveAbsenceSettings(absenceSettingsTarget);
  }

  const feedbackCreateTarget = currentFeedbackCreateDirtyTarget();

  if (feedbackCreateTarget?.isDirty) {
    return submitCentralModuleFeedback(feedbackCreateTarget.form);
  }

  const employeeTarget = currentEmployeeCardDirtyTarget();
  let savedEmployeeSection = false;

  if (employeeTarget?.isDirty) {
    const saved = await saveEmployeeCardChanges(employeeTarget);
    if (!saved) {
      return false;
    }
    savedEmployeeSection = true;
  }

  const employeeMedicalExamTarget = currentEmployeeMedicalExamDirtyTarget();

  if (employeeMedicalExamTarget?.isDirty) {
    return saveEmployeeMedicalExamChanges(employeeMedicalExamTarget);
  }

  return savedEmployeeSection || true;
}

function discardDirtyChanges() {
  const accessTarget = currentAccessDirtyTarget();

  if (accessTarget) {
    discardAccessDirtyChanges();
    return;
  }

  const appearanceTarget = currentAppearanceDirtyTarget();

  if (appearanceTarget?.isDirty) {
    discardAppearanceDirtyChanges();
    return;
  }

  const absenceSettingsTarget = currentAbsenceSettingsDirtyTarget();

  if (absenceSettingsTarget?.isDirty) {
    discardAbsenceSettingsDirtyChanges();
    return;
  }

  const feedbackCreateTarget = currentFeedbackCreateDirtyTarget();

  if (feedbackCreateTarget?.isDirty) {
    resetFeedbackCreateState();
    render();
    return;
  }

  const employeeTarget = currentEmployeeCardDirtyTarget();
  let discardedEmployeeSection = false;

  if (employeeTarget?.isDirty) {
    discardEmployeeCardDirtyChanges();
    discardedEmployeeSection = true;
  }

  const employeeMedicalExamTarget = currentEmployeeMedicalExamDirtyTarget();

  if (employeeMedicalExamTarget?.isDirty) {
    discardEmployeeMedicalExamDirtyChanges();
    return;
  }

  if (discardedEmployeeSection) {
    return;
  }
}

function createAccessUser() {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění přidávat uživatele.", "user");
    render();
    return;
  }

  const now = new Date().toISOString();
  const role = "ridic";
  upsertAccessUserInMemory({
    id: nextDraftUserId(),
    name: "Nový uživatel",
    email: "",
    phone: "",
    role,
    department: "",
    position: "",
    managerId: "",
    managerName: "",
    active: true,
    status: "active",
    permissions: userDefaultPermissions(role),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  }, "Nový uživatel je připravený. Pro dokončení klikněte na Uložit uživatele.");
  render();
  focusAccessUserEditor();
}

function selectAccessUser(userId) {
  try {
    const user = findAccessUser(userId);

    if (!user) {
      setAccessError("Uživatel nebyl nalezen.", "user");
      render();
      return;
    }

    setAccessState({
      ...accessState,
      selectedUserId: user.id,
      message: "",
      error: "",
      feedbackTarget: ""
    });
    render();
    requestAnimationFrame(focusAccessUserEditor);
  } catch (error) {
    handleAccessActionError(error, "Uživatele se nepodařilo otevřít. Zkuste obnovit aplikaci.", "user");
  }
}

function selectAccessRole(roleId) {
  setAccessState({
    ...accessState,
    selectedRoleId: normalizeRole(roleId),
    message: "",
    error: "",
    feedbackTarget: ""
  });
  render();
}

function setAccessUserActive(userId, active) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit stav uživatele.", "user");
    render();
    return;
  }

  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  if (!active && signedUserId && signedUserId === String(userId || "").trim().toLowerCase()) {
    setAccessError("Vlastní účet nejde vypnout, abyste se nezamkli mimo správu.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  saveAccessUserStatus(user, active);
}

function resetAccessUserPermissions(userId) {
  if (!canEditAccessUsers()) {
    setAccessError("Nemáte oprávnění měnit oprávnění uživatele.", "user");
    render();
    return;
  }

  const user = findAccessUser(userId);
  if (!user) {
    setAccessError("Uživatel nebyl nalezen.", "user");
    render();
    return;
  }

  const form = currentAccessUserFormFor(userId);
  const sourceUser = form ? accessUserFormData(form) : user;

  upsertAccessUserInMemory({
    ...sourceUser,
    permissions: userDefaultPermissions(sourceUser.role),
    updatedAt: new Date().toISOString()
  }, "Výchozí práva jsou připravená ve formuláři. Pro trvalou změnu použijte Uložit uživatele.");
  render();
}

function changeAccessUserRole(select) {
  if (!canEditAccessUsers()) {
    return;
  }

  const form = select.closest("[data-access-user-form]");
  const user = findAccessUser(form?.dataset.userId);
  if (!user) {
    return;
  }

  const role = normalizeRole(select.value);
  const signedUserId = String(currentUser()?.id || "").trim().toLowerCase();
  const targetUserId = String(user.id || "").trim().toLowerCase();

  if (
    signedUserId &&
    signedUserId === targetUserId &&
    isFullAccessRole(currentUser()) &&
    !isFullAccessRole({ role, active: true })
  ) {
    setAccessError("Vlastní účet s plným přístupem nejde v testovacím režimu změnit na omezenou roli.", "user");
    render();
    return;
  }

  const sourceUser = accessUserFormData(form, {
    role,
    permissions: userDefaultPermissions(role),
    updatedAt: new Date().toISOString()
  });

  upsertAccessUserInMemory({
    ...sourceUser,
    role,
    permissions: userDefaultPermissions(role)
  }, "Role je změněná jen ve formuláři. Pro trvalou změnu použijte Uložit uživatele.");
  render();
}

document.addEventListener("submit", async (event) => {
  const aiForm = event.target.closest("[data-ai-form]");
  if (aiForm) {
    event.preventDefault();
    await submitAiAssistantQuestion(aiForm.elements.question?.value || aiAssistantState.input);
    return;
  }

  const appearanceForm = event.target.closest("[data-appearance-form]");
  if (appearanceForm) {
    event.preventDefault();
    updateAppearanceDraft(appearanceForm, { preview: true });
    saveAppearanceSettings(themeState.draft);
    return;
  }

  const accessUserForm = event.target.closest("[data-access-user-form]");
  if (accessUserForm) {
    event.preventDefault();
    saveAccessUserForm(accessUserForm);
    return;
  }

  const accessRoleForm = event.target.closest("[data-access-role-form]");
  if (accessRoleForm) {
    event.preventDefault();
    saveAccessRoleForm(accessRoleForm);
    return;
  }

  const employeeCardForm = event.target.closest("[data-employee-card-form]");
  if (employeeCardForm) {
    event.preventDefault();
    saveEmployeeCardChanges(currentEmployeeCardDirtyTarget());
    return;
  }

  const employeeMedicalExamForm = event.target.closest("[data-employee-medical-exam-form]");
  if (employeeMedicalExamForm) {
    event.preventDefault();
    saveEmployeeMedicalExamChanges(currentEmployeeMedicalExamDirtyTarget());
    return;
  }

  const employeeWorkHistoryForm = event.target.closest("[data-employee-work-history-form]");
  if (employeeWorkHistoryForm) {
    event.preventDefault();
    saveEmployeeWorkHistory(employeeWorkHistoryForm);
    return;
  }

  const employeeDocumentUploadForm = event.target.closest("[data-employee-document-upload-form]");
  if (employeeDocumentUploadForm) {
    event.preventDefault();
    saveEmployeeDocumentUpload(employeeDocumentUploadForm);
    return;
  }

  const fleetVistosImportForm = event.target.closest("[data-fleet-vistos-import-form]");
  if (fleetVistosImportForm) {
    event.preventDefault();
    await submitFleetVistosImport(fleetVistosImportForm);
    return;
  }

  const absenceRequestForm = event.target.closest("[data-absence-request-form]");
  if (absenceRequestForm) {
    event.preventDefault();
    await submitAbsenceRequest(absenceRequestForm);
    return;
  }

  const absenceSettingsForm = event.target.closest("[data-absence-settings-form]");
  if (absenceSettingsForm) {
    event.preventDefault();
    await saveAbsenceSettings(absenceSettingsForm);
    return;
  }

  const moduleRuleFormElement = event.target.closest("[data-module-rule-form]");
  if (moduleRuleFormElement) {
    event.preventDefault();
    await saveModuleRuleForm(moduleRuleFormElement);
    return;
  }

  const feedbackCreateForm = event.target.closest("[data-feedback-create-form]");
  if (feedbackCreateForm) {
    event.preventDefault();
    await submitCentralModuleFeedback(feedbackCreateForm);
    return;
  }

  const absenceFilterForm = event.target.closest("[data-absence-filter-form]");
  if (absenceFilterForm) {
    event.preventDefault();
    applyAbsenceFilters(absenceFilterForm);
    return;
  }

  const feedbackForm = event.target.closest("[data-feedback-form]");
  if (feedbackForm) {
    event.preventDefault();
    submitModuleFeedback(feedbackForm);
    return;
  }

  const feedbackUpdateForm = event.target.closest("[data-feedback-update-form]");
  if (feedbackUpdateForm) {
    event.preventDefault();
    updateFeedbackCard(feedbackUpdateForm);
    return;
  }

  const filtersForm = event.target.closest("[data-feedback-filters]");
  if (filtersForm) {
    event.preventDefault();
    applyFeedbackFilters(filtersForm);
    return;
  }

  const notificationFilters = event.target.closest("[data-notification-filters]");
  if (notificationFilters) {
    event.preventDefault();
    applyNotificationFilters(notificationFilters);
    return;
  }

  const form = event.target.closest("[data-auth-form]");

  if (!form) {
    return;
  }

  event.preventDefault();

  if (form.dataset.step === "verify") {
    verifyLogin(form);
    return;
  }

  startLogin(form);
});

document.addEventListener("input", (event) => {
  const aiInput = event.target.closest("[data-ai-input]");
  if (aiInput) {
    aiAssistantState.input = aiInput.value;
    return;
  }

  const accessUsersSearch = event.target.closest("[data-access-users-search]");
  if (accessUsersSearch) {
    updateAccessUsersSearch(accessUsersSearch);
    return;
  }

  const moduleRulesSearch = event.target.closest("[data-module-rules-search]");
  if (moduleRulesSearch) {
    updateModuleRulesSearch(moduleRulesSearch);
    return;
  }

  const quickNote = event.target.closest("[data-quick-note]");
  if (quickNote) {
    quickAbsenceState.note = quickNote.value;
    return;
  }

  const quickDateFrom = event.target.closest("[data-quick-date-from]");
  if (quickDateFrom) {
    updateQuickDateField("from", quickDateFrom.value);
    return;
  }

  const quickDateTo = event.target.closest("[data-quick-date-to]");
  if (quickDateTo) {
    updateQuickDateField("to", quickDateTo.value);
    return;
  }

  const quickStartTime = event.target.closest("[data-quick-start-time]");
  if (quickStartTime) {
    updateQuickDateField("startTime", quickStartTime.value);
    return;
  }

  const quickEndTime = event.target.closest("[data-quick-end-time]");
  if (quickEndTime) {
    updateQuickDateField("endTime", quickEndTime.value);
    return;
  }

  const absenceRejectReason = event.target.closest("[data-absence-reject-reason]");
  if (absenceRejectReason) {
    absenceUiState.rejectReason = absenceRejectReason.value;
    return;
  }

  const appearanceField = event.target.closest("[data-appearance-field]");
  if (appearanceField) {
    const form = appearanceField.closest("[data-appearance-form]");
    if (form) {
      updateAppearanceDraft(form);
    }
  }

  const feedbackCreateField = event.target.closest("[data-feedback-create-field]");
  if (feedbackCreateField) {
    const form = feedbackCreateField.closest("[data-feedback-create-form]");
    updateFeedbackCreateDraft(form);
  }
});

document.addEventListener("change", (event) => {
  const appearanceImport = event.target.closest("[data-appearance-import]");
  if (appearanceImport) {
    importAppearanceSettings(appearanceImport);
    return;
  }

  const appearanceField = event.target.closest("[data-appearance-field]");
  if (appearanceField) {
    const form = appearanceField.closest("[data-appearance-form]");
    if (form) {
      updateAppearanceDraft(form);
      render();
    }
    return;
  }

  const accessManagerSelect = event.target.closest("[data-access-manager-select]");
  if (accessManagerSelect) {
    const userId = accessManagerSelect.dataset.accessManagerUser;
    const nextManagerId = accessManagerSelect.value;
    const previousManagerId = findAccessUser(userId)?.managerId || "";
    accessManagerSelect.value = previousManagerId;
    guardedAccessAction(() => saveAccessUserManager(userId, nextManagerId));
    return;
  }

  const accessUserRole = event.target.closest("[data-access-user-role]");
  if (accessUserRole) {
    changeAccessUserRole(accessUserRole);
    return;
  }

  const moduleRulesFilter = event.target.closest("[data-module-rules-type-filter], [data-module-rules-status-filter]");
  if (moduleRulesFilter) {
    updateModuleRulesFilters(moduleRulesFilter);
    return;
  }

  const employeeCardSelect = event.target.closest("[data-employee-card-select]");
  if (employeeCardSelect) {
    const nextEmployeeId = employeeCardSelect.value;
    employeeCardSelect.value = employeeCardState.employee?.id || "";
    guardedAccessAction(() => navigateToUrl(routeHref(employeeCardRoute(nextEmployeeId))));
    return;
  }

  const employeeMedicalExamField = event.target.closest("[data-employee-medical-exam-form] input, [data-employee-medical-exam-form] select, [data-employee-medical-exam-form] textarea");
  if (employeeMedicalExamField) {
    const form = employeeMedicalExamField.closest("[data-employee-medical-exam-form]");
    if (form) {
      employeeCardState.medicalExamDraft = normalizeEmployeeMedicalExamFormData(employeeMedicalExamFormData(form));
      render();
    }
    return;
  }

  const absenceFilter = event.target.closest("[data-absence-filter]");
  if (absenceFilter) {
    const form = absenceFilter.closest("[data-absence-filter-form]");
    if (form) {
      applyAbsenceFilters(form);
    }
    return;
  }

  const absenceFormField = event.target.closest("[data-absence-type], [data-absence-date]");
  if (absenceFormField) {
    const form = absenceFormField.closest("[data-absence-request-form]");
    if (form) {
      updateAbsenceFormPreview(form);
    }
    return;
  }

  const filterField = event.target.closest("[data-feedback-filter]");
  if (filterField) {
    const form = filterField.closest("[data-feedback-filters]");
    if (form) {
      applyFeedbackFilters(form);
    }
    return;
  }

  const feedbackCreateField = event.target.closest("[data-feedback-create-field]");
  if (feedbackCreateField) {
    const form = feedbackCreateField.closest("[data-feedback-create-form]");
    updateFeedbackCreateDraft(form);
    return;
  }

  const notificationFilter = event.target.closest("[data-notification-filter]");
  if (notificationFilter) {
    const form = notificationFilter.closest("[data-notification-filters]");
    if (form) {
      applyNotificationFilters(form);
    }
    return;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncAiVoiceWakeLock({ renderAfter: true });
  }
});

document.addEventListener("error", (event) => {
  const tcarsMarkerIcon = event.target?.closest?.("[data-tracking-tcars-marker-icon]");
  if (tcarsMarkerIcon) {
    tcarsMarkerIcon.hidden = true;
    tcarsMarkerIcon.closest(".tracking-tcars-google-pin")?.classList.add("tracking-tcars-google-pin--fallback");
    return;
  }

  const vehicleIcon = event.target?.closest?.("[data-tracking-vehicle-icon]");
  if (vehicleIcon) {
    const marker = vehicleIcon.closest("[data-tracking-vehicle-marker]");
    marker?.classList.remove("tracking-vehicle-marker--has-image");
    marker?.classList.add("tracking-vehicle-marker--missing-icon");
    vehicleIcon.hidden = true;
    return;
  }

  const promoVideo = event.target?.closest?.("[data-ai-promo-video]");

  if (!promoVideo || assistantPromoState.videoFailed) {
    return;
  }

  assistantPromoState.videoFailed = true;
  render();
}, true);

document.addEventListener("pointerup", (event) => {
  handleVehicleTrackingTcarsSelectEvent(event);
  handleVehicleTrackingWimSelectEvent(event);
}, true);

document.addEventListener("click", async (event) => {
  const trackingSourceMode = event.target.closest("[data-tracking-source-mode]");
  if (trackingSourceMode) {
    event.preventDefault();
    handleVehicleTrackingSourceMode(trackingSourceMode.dataset.trackingSourceMode || "demo");
    return;
  }

  const trackingDemoControl = event.target.closest("[data-tracking-demo-control]");
  if (trackingDemoControl) {
    event.preventDefault();
    handleVehicleTrackingDemoControl(trackingDemoControl.dataset.trackingDemoControl || "");
    return;
  }

  const trackingDemoFilter = event.target.closest("[data-tracking-demo-filter]");
  if (trackingDemoFilter) {
    event.preventDefault();
    handleVehicleTrackingDemoFilter(trackingDemoFilter.dataset.trackingDemoFilter || "all");
    return;
  }

  const trackingDemoSelect = event.target.closest("[data-tracking-demo-select]");
  if (trackingDemoSelect) {
    event.preventDefault();
    handleVehicleTrackingDemoSelect(trackingDemoSelect.dataset.trackingDemoSelect || "");
    return;
  }

  if (handleVehicleTrackingTcarsSelectEvent(event)) {
    return;
  }

  if (handleVehicleTrackingWimSelectEvent(event)) {
    return;
  }

  const fleetTab = event.target.closest("[data-fleet-tab]");
  if (fleetTab) {
    event.preventDefault();
    handleFleetTab(fleetTab);
    return;
  }

  const fleetAction = event.target.closest("[data-fleet-action]");
  if (fleetAction) {
    event.preventDefault();
    handleFleetAction(fleetAction);
    return;
  }

  const aiPromoAction = event.target.closest("[data-ai-promo-action]");
  if (aiPromoAction) {
    const action = aiPromoAction.dataset.aiPromoAction;

    if (action === "accepted") {
      await acceptAssistantPromo();
      return;
    }

    await declineAssistantPromo();
    return;
  }

  const aiWelcomeAction = event.target.closest("[data-ai-welcome-action]");
  if (aiWelcomeAction) {
    const action = aiWelcomeAction.dataset.aiWelcomeAction;

    if (action === "dismiss") {
      dismissAiAssistantWelcome();
      return;
    }

    openAiAssistant(action === "voice" ? "voice" : "text");
    return;
  }

  const aiLauncher = event.target.closest("[data-ai-launcher]");
  if (aiLauncher) {
    openAiAssistant(aiLauncher.dataset.aiLauncherMode || "text");
    return;
  }

  const aiClose = event.target.closest("[data-ai-close]");
  if (aiClose) {
    closeAiAssistant();
    return;
  }

  const aiMode = event.target.closest("[data-ai-mode]");
  if (aiMode) {
    openAiAssistant(aiMode.dataset.aiMode || "text");
    return;
  }

  const aiStartVoice = event.target.closest("[data-ai-start-voice]");
  if (aiStartVoice) {
    triggerAiHaptic(15);
    await startAiVoiceRecognition();
    return;
  }

  const aiStopVoice = event.target.closest("[data-ai-stop-voice]");
  if (aiStopVoice) {
    stopAiVoiceRecognition();
    return;
  }

  const aiRoute = event.target.closest("[data-ai-route]");
  if (aiRoute) {
    navigateFromAiAssistant(aiRoute.dataset.aiRoute || "/");
    return;
  }

  const aiAssistantSelect = event.target.closest("[data-ai-assistant-select]");
  if (aiAssistantSelect) {
    setAiAssistant(aiAssistantSelect.dataset.aiAssistantSelect);
    return;
  }

  const aiConfirmationAction = event.target.closest("[data-ai-confirmation-action]");
  if (aiConfirmationAction) {
    resolveAiConfirmation(aiConfirmationAction.dataset.aiConfirmationAction === "confirm");
    return;
  }

  const appearancePreview = event.target.closest("[data-appearance-preview]");
  if (appearancePreview) {
    const form = appearancePreview.closest("[data-appearance-form]");
    if (form) {
      previewAppearanceSettings(form);
    }
    return;
  }

  const appearanceReset = event.target.closest("[data-appearance-reset]");
  if (appearanceReset) {
    await resetAppearanceSettings();
    return;
  }

  const appearanceExport = event.target.closest("[data-appearance-export]");
  if (appearanceExport) {
    exportAppearanceSettings();
    return;
  }

  const unsavedAction = event.target.closest("[data-unsaved-action]");
  if (unsavedAction) {
    const action = unsavedAction.dataset.unsavedAction;

    if (action === "save") {
      await accessUnsavedChangesGuard.saveAndContinue();
      return;
    }

    if (action === "discard") {
      await accessUnsavedChangesGuard.discardAndContinue();
      return;
    }

    accessUnsavedChangesGuard.stay();
    return;
  }

  const newAccessUser = event.target.closest("[data-access-new-user]");
  if (newAccessUser) {
    guardedAccessAction(createAccessUser);
    return;
  }

  const editAccessUser = event.target.closest("[data-access-edit-user]");
  if (editAccessUser) {
    guardedAccessAction(() => selectAccessUser(editAccessUser.dataset.accessEditUser));
    return;
  }

  const disableAccessUser = event.target.closest("[data-access-disable-user]");
  if (disableAccessUser) {
    guardedAccessAction(() => setAccessUserActive(disableAccessUser.dataset.accessDisableUser, false));
    return;
  }

  const enableAccessUser = event.target.closest("[data-access-enable-user]");
  if (enableAccessUser) {
    guardedAccessAction(() => setAccessUserActive(enableAccessUser.dataset.accessEnableUser, true));
    return;
  }

  const resetUserPermissions = event.target.closest("[data-access-reset-user-permissions]");
  if (resetUserPermissions) {
    resetAccessUserPermissions(resetUserPermissions.dataset.accessResetUserPermissions);
    return;
  }

  const editAccessRole = event.target.closest("[data-access-edit-role]");
  if (editAccessRole) {
    guardedAccessAction(() => selectAccessRole(editAccessRole.dataset.accessEditRole));
    return;
  }

  const employeeFocusEdit = event.target.closest("[data-employee-focus-edit]");
  if (employeeFocusEdit) {
    const firstInput = document.querySelector("[data-employee-card-form] input:not([disabled]), [data-employee-card-form] select:not([disabled]), [data-employee-card-form] textarea:not([disabled])");
    firstInput?.focus();
    return;
  }

  const employeeDiscard = event.target.closest("[data-employee-discard]");
  if (employeeDiscard) {
    discardEmployeeCardDirtyChanges();
    return;
  }

  const employeeMedicalExamSave = event.target.closest("[data-employee-medical-exam-save]");
  if (employeeMedicalExamSave) {
    event.preventDefault();
    saveEmployeeMedicalExamChanges(currentEmployeeMedicalExamDirtyTarget());
    return;
  }

  const employeeMedicalExamDiscard = event.target.closest("[data-employee-medical-exam-discard]");
  if (employeeMedicalExamDiscard) {
    discardEmployeeMedicalExamDirtyChanges();
    return;
  }

  const employeeOpenRequests = event.target.closest("[data-employee-open-requests]");
  if (employeeOpenRequests) {
    const employeeId = employeeOpenRequests.dataset.employeeOpenRequests || "";
    guardedAccessAction(() => {
      absenceUiState.tab = "reports";
      absenceUiState.employeeFilter = employeeId;
      navigateToUrl(routeHref(absenceRouteForTab("reports")));
    });
    return;
  }

  const absenceTab = event.target.closest("[data-absence-tab]");
  if (absenceTab) {
    const nextTab = absenceTab.dataset.absenceTab || "dashboard";
    const resolvedTab = resolveAbsenceTab(currentUser(), nextTab);
    if (resolvedTab === "employee-card") {
      guardedAccessAction(() => navigateToUrl(routeHref(absenceRouteForTab("employee-card"))));
      return;
    }

    guardedAccessAction(() => {
      absenceUiState.tab = resolvedTab;
      setAbsenceNotice("");
      navigateToUrl(routeHref(absenceRouteForTab(resolvedTab)));
    });
    return;
  }

  const moduleRuleNew = event.target.closest("[data-module-rule-new]");
  if (moduleRuleNew) {
    openModuleRuleForm(moduleRuleNew.dataset.moduleRuleNew || "rule");
    return;
  }

  const moduleRuleFormClose = event.target.closest("[data-module-rule-form-close]");
  if (moduleRuleFormClose) {
    closeModuleRuleForm();
    return;
  }

  const moduleRuleEdit = event.target.closest("[data-module-rule-edit]");
  if (moduleRuleEdit) {
    const ruleId = moduleRuleEdit.dataset.moduleRuleEdit || "";
    const rule = moduleRulesState.rules.find((item) => item.id === ruleId);
    openModuleRuleForm(rule?.type || "rule", ruleId);
    return;
  }

  const moduleRuleSelect = event.target.closest("[data-module-rule-select]");
  if (moduleRuleSelect) {
    selectModuleRule(moduleRuleSelect.dataset.moduleRuleSelect || "");
    return;
  }

  const moduleRuleToggle = event.target.closest("[data-module-rule-toggle]");
  if (moduleRuleToggle) {
    await toggleModuleRuleStatus(
      moduleRuleToggle.dataset.moduleRuleToggle || "",
      moduleRuleToggle.dataset.nextStatus || "inactive"
    );
    return;
  }

  const absenceApprove = event.target.closest("[data-absence-approve]");
  if (absenceApprove) {
    await approveAbsenceRequest(absenceApprove.dataset.absenceApprove);
    return;
  }

  const absenceRejectToggle = event.target.closest("[data-absence-reject-toggle]");
  if (absenceRejectToggle) {
    toggleRejectAbsenceRequest(absenceRejectToggle.dataset.absenceRejectToggle);
    return;
  }

  const absenceReject = event.target.closest("[data-absence-reject]");
  if (absenceReject) {
    await rejectAbsenceRequest(absenceReject.dataset.absenceReject);
    return;
  }

  const absenceRejectCancel = event.target.closest("[data-absence-reject-cancel]");
  if (absenceRejectCancel) {
    absenceUiState.rejectRequestId = "";
    absenceUiState.rejectReason = "";
    render();
    return;
  }

  const absenceCancel = event.target.closest("[data-absence-cancel]");
  if (absenceCancel) {
    await cancelAbsenceRequest(absenceCancel.dataset.absenceCancel);
    return;
  }

  const absenceExport = event.target.closest("[data-absence-export-csv]");
  if (absenceExport) {
    exportAbsenceCsv();
    return;
  }

  const fleetImportReport = event.target.closest("[data-fleet-import-download-report]");
  if (fleetImportReport) {
    exportFleetImportPreviewCsv();
    return;
  }

  const absenceReport = event.target.closest("[data-absence-generate-report]");
  if (absenceReport) {
    generateAbsenceMonthlyReport();
    return;
  }

  const quickType = event.target.closest("[data-quick-type]");
  if (quickType) {
    quickAbsenceState.type = quickType.dataset.quickType || "";
    quickAbsenceState.step = "date";
    quickAbsenceState.dateMode = "";
    quickAbsenceState.dateFrom = "";
    quickAbsenceState.dateTo = "";
    quickAbsenceState.halfDay = false;
    quickAbsenceState.startTime = "09:00";
    quickAbsenceState.endTime = "11:00";
    quickAbsenceState.success = false;
    quickAbsenceState.error = "";
    render();
    return;
  }

  const quickDateChoice = event.target.closest("[data-quick-date-choice]");
  if (quickDateChoice) {
    applyQuickDateChoice(quickDateChoice.dataset.quickDateChoice || "");
    return;
  }

  const quickCustomContinue = event.target.closest("[data-quick-custom-continue]");
  if (quickCustomContinue) {
    continueQuickCustomDate();
    return;
  }

  const quickBack = event.target.closest("[data-quick-back]");
  if (quickBack) {
    if (quickBack.dataset.quickBack === "type") {
      quickAbsenceReset({ keepRecent: true });
    } else {
      quickAbsenceState.step = "date";
      quickAbsenceState.success = false;
      quickAbsenceState.error = "";
    }
    render();
    return;
  }

  const quickNoteToggle = event.target.closest("[data-quick-note-toggle]");
  if (quickNoteToggle) {
    quickAbsenceState.noteOpen = !quickAbsenceState.noteOpen;
    render();
    return;
  }

  const quickAttachmentToggle = event.target.closest("[data-quick-attachment-toggle]");
  if (quickAttachmentToggle) {
    quickAbsenceState.attachmentOpen = !quickAbsenceState.attachmentOpen;
    render();
    return;
  }

  const quickSubmit = event.target.closest("[data-quick-submit]");
  if (quickSubmit) {
    await submitQuickAbsenceRequest();
    return;
  }

  const quickReset = event.target.closest("[data-quick-reset]");
  if (quickReset) {
    quickAbsenceReset({ keepRecent: true });
    render();
    return;
  }

  const feedbackCreateOpen = event.target.closest("[data-feedback-create-open]");
  if (feedbackCreateOpen) {
    openFeedbackCreateForm();
    return;
  }

  const feedbackCreateClose = event.target.closest("[data-feedback-create-close]");
  if (feedbackCreateClose) {
    closeFeedbackCreateForm();
    return;
  }

  const feedbackExport = event.target.closest("[data-feedback-export]");
  if (feedbackExport) {
    exportFeedbackCsv();
    return;
  }

  const feedbackReset = event.target.closest("[data-feedback-reset-filters]");
  if (feedbackReset) {
    resetFeedbackFilters();
    return;
  }

  const notificationExport = event.target.closest("[data-notification-export]");
  if (notificationExport) {
    exportNotificationsCsv();
    return;
  }

  const notificationReset = event.target.closest("[data-notification-reset]");
  if (notificationReset) {
    resetNotificationFilters();
    return;
  }

  const notificationReload = event.target.closest("[data-notification-reload]");
  if (notificationReload) {
    notificationCenterState.loaded = false;
    loadNotificationCenter();
    return;
  }

  const notificationDetail = event.target.closest("[data-notification-detail]");
  if (notificationDetail) {
    notificationCenterState.selectedId = notificationDetail.dataset.notificationDetail || "";
    render();
    return;
  }

  const notificationDetailClose = event.target.closest("[data-notification-detail-close]");
  if (notificationDetailClose) {
    notificationCenterState.selectedId = "";
    render();
    return;
  }

  const changeIdentifier = event.target.closest("[data-change-identifier]");
  if (changeIdentifier) {
    authState = {
      ...authState,
      status: "anonymous",
      codeSent: false,
      message: "",
      error: "",
      mockCode: false
    };
    render();
    return;
  }

  const logoutButton = event.target.closest("[data-logout]");
  if (logoutButton) {
    guardedAccessAction(logout);
    return;
  }

  const link = event.target.closest("a[data-link]");

  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  guardedAccessAction(() => navigateToUrl(link.href));
});

window.addEventListener("beforeunload", (event) => accessUnsavedChangesGuard.beforeUnload(event));
window.addEventListener("popstate", handlePopStateNavigation);
window.addEventListener("hashchange", handleHashChangeNavigation);
render();
probeAiAssistantAvatarAssets();
bootstrapAuth();
