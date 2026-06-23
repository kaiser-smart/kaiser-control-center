import { moduleDashboards, modules } from "./data/modules.js";
import { AiAssistantChat } from "./components/AiAssistantChat.js";
import { AiAssistantLauncher } from "./components/AiAssistantLauncher.js";
import { AiWelcomeModal } from "./components/AiWelcomeModal.js";
import { VersionBackupInfo } from "./components/VersionBackupInfo.js";
import { VersionNewsInfo } from "./components/VersionNewsInfo.js";
import { ModuleFeedbackBox } from "./components/ModuleFeedbackBox.js";
import { AppearanceSettingsBox } from "./components/AppearanceSettingsBox.js";
import { QuickAbsenceIcon, ReportsIcon } from "./components/icons/index.js";
import { useSpeechRecognition } from "./useSpeechRecognition.js";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard.js";
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
  absenceRequestsToCsv,
  absenceSummary,
  absenceStatusLabel,
  absenceTypeLabel,
  approvalAbsenceRequests,
  canApproveAbsence,
  canCancelAbsence,
  canSeeAllAbsences,
  canSubmitAbsenceForOthers,
  countAbsenceDays,
  currentMonthKey,
  employeeIdForUser,
  filterAbsenceRequests,
  generateMonthlyAbsenceReport,
  initialStatusForAbsenceType,
  loadAbsenceState,
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
const TYRES_MODULE_URL = "https://oplustil-prog.github.io/kaiser-pneu-evidence/";
const APP_NAME = "Smart odpady";
const HOME_SUBTITLE = "Provozní systém pro odpady, vozidla a trasy";
const LOGIN_SUBTITLE = "Přihlášení do interního provozního systému";
const FEEDBACK_ROUTE = "/pripominky";
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
  absence_sickness_recorded_email: "Nemoc evidována"
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
  "Ahoj, jsem Smart pomocník. Zeptej se mě na dovolenou, nemoc, pneumatiky, závady, uživatele nebo nastavení.";
const AI_STATUS_READY = "Připraven";
const AI_STATUS_DONE = "Hotovo";
const AI_STATUS_DEMO = "Přehrávám ukázku…";
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
const quickAbsenceState = {
  step: "type",
  type: "",
  dateMode: "",
  dateFrom: "",
  dateTo: "",
  halfDay: false,
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

let aiAssistantMessageId = 0;
const aiAssistantState = {
  welcomeVisible: true,
  chatOpen: false,
  launcherVisible: false,
  mode: "text",
  input: "",
  voiceStatus: AI_STATUS_READY,
  voiceNotice: "",
  isListening: false,
  demoPlaying: false,
  demoSpeaker: "",
  demoSpeakerLabel: "",
  demoLine: "",
  demoStatus: "",
  messages: [createAiAssistantMessage("bot", AI_INITIAL_MESSAGE)]
};
let aiVoiceDemoTimer = 0;

const speechRecognition = useSpeechRecognition({
  onResult: (transcript) => submitAiAssistantQuestion(transcript, { fromVoice: true }),
  onStatusChange: (status) => {
    aiAssistantState.voiceStatus = status || AI_STATUS_READY;
    render();
  },
  onListeningChange: (isListening) => {
    aiAssistantState.isListening = isListening;
    render();
  },
  onError: (error) => {
    aiAssistantState.voiceStatus = error?.status || aiAssistantState.voiceStatus;
    aiAssistantState.voiceNotice = error?.message || "";
    render();
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
  formDraft: null,
  documentUploading: false,
  documentsUploadStatus: "waiting",
  documentsMissingEndpoint: "POST /api/employees/:id/documents"
};

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

function employeeCardRoute(employeeId) {
  return `${EMPLOYEE_CARD_ROUTE_PREFIX}/${encodeURIComponent(employeeId || employeeIdForUser(currentUser()))}`;
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
    HOTOVO: "HOTOVO",
    "připraveno": "PŘIPRAVENO",
    skeleton: "ČEKÁ NA API",
    "mock data": "ROZPRACOVÁN",
    ROZPRACOVÁN: "ROZPRACOVÁN",
    správa: "SPRÁVA"
  }[moduleItem?.status] || moduleItem?.status || "";
}

function moduleStatusTone(moduleItem) {
  return moduleItem?.status === "HOTOVO" ? "done" : "progress";
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

function createAiAssistantMessage(sender, text, actions = []) {
  aiAssistantMessageId += 1;
  return {
    id: `ai-message-${aiAssistantMessageId}`,
    sender,
    text,
    actions
  };
}

function resetAiAssistantSession() {
  speechRecognition.stop({ status: false });
  aiAssistantState.welcomeVisible = true;
  aiAssistantState.chatOpen = false;
  aiAssistantState.launcherVisible = false;
  aiAssistantState.mode = "text";
  aiAssistantState.input = "";
  aiAssistantState.voiceStatus = AI_STATUS_READY;
  aiAssistantState.voiceNotice = "";
  aiAssistantState.isListening = false;
  aiAssistantState.messages = [createAiAssistantMessage("bot", AI_INITIAL_MESSAGE)];
}

function normalizeAiPrompt(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function aiPromptIncludes(normalizedPrompt, keywords) {
  return keywords.some((keyword) => normalizedPrompt.includes(keyword));
}

function aiAssistantResponse(question) {
  const prompt = normalizeAiPrompt(question);

  if (aiPromptIncludes(prompt, ["nemoc", "jsem nemocny", "nahlasit nemoc"])) {
    return {
      text: "Pro nahlášení nemoci použij Rychlé zadání. Otevřu ti ho.",
      actions: [{ label: "Nahlásit nemoc", route: ABSENCE_QUICK_ROUTE }]
    };
  }

  if (aiPromptIncludes(prompt, ["dovolena", "chci dovolenou", "zadost o dovolenou"])) {
    return {
      text: "Pro zadání dovolené použij Rychlé zadání. Otevřu ti ho.",
      actions: [{ label: "Otevřít Rychlé zadání", route: ABSENCE_QUICK_ROUTE }]
    };
  }

  if (aiPromptIncludes(prompt, ["lekar", "doktor", "jdu k lekari"])) {
    return {
      text: "Lékaře zadáte v rychlém zadání dovolené a nemoci.",
      actions: [{ label: "Otevřít Rychlé zadání", route: ABSENCE_QUICK_ROUTE }]
    };
  }

  if (aiPromptIncludes(prompt, ["pneumatiky", "pneu"])) {
    return {
      text: "Otevřu modul Pneumatiky.",
      actions: [{ label: "Otevřít Pneumatiky", route: "/pneumatiky" }]
    };
  }

  if (aiPromptIncludes(prompt, ["zavada", "hlaseni", "nahlasit zavadu", "porucha"])) {
    return {
      text: "Pro nahlášení závady otevři modul Hlášení řidičů.",
      actions: [{ label: "Otevřít Hlášení řidičů", route: "/hlaseni-ridicu" }]
    };
  }

  if (aiPromptIncludes(prompt, ["uzivatel", "uzivatele", "prava", "role"])) {
    return {
      text: "Uživatelé a práva se spravují v modulu Uživatelé a role.",
      actions: [{ label: "Otevřít Uživatelé a role", route: "/uzivatele" }]
    };
  }

  if (aiPromptIncludes(prompt, ["nastaveni", "vzhled", "barvy", "logo"])) {
    return {
      text: "Nastavení aplikace najdeš v modulu Nastavení.",
      actions: [{ label: "Otevřít Nastavení", route: "/nastaveni" }]
    };
  }

  return {
    text: "Zatím jsem jen testovací pomocník. Umím poradit se základní orientací v aplikaci.",
    actions: []
  };
}

function openAiAssistant(mode = "text") {
  stopAiVoiceDemo({ renderAfter: false });
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.chatOpen = true;
  aiAssistantState.launcherVisible = false;
  aiAssistantState.mode = mode === "voice" ? "voice" : "text";
  aiAssistantState.voiceStatus = AI_STATUS_READY;
  aiAssistantState.voiceNotice = "";
  render();
}

function dismissAiAssistantWelcome() {
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.launcherVisible = true;
  render();
}

function closeAiAssistant() {
  stopAiVoiceDemo({ renderAfter: false });
  speechRecognition.stop({ status: false });
  aiAssistantState.chatOpen = false;
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.launcherVisible = true;
  aiAssistantState.isListening = false;
  aiAssistantState.voiceStatus = AI_STATUS_DONE;
  render();
}

function submitAiAssistantQuestion(question, options = {}) {
  const text = String(question || "").trim();

  if (!text) {
    return;
  }

  const response = aiAssistantResponse(text);
  aiAssistantState.messages = [
    ...aiAssistantState.messages,
    createAiAssistantMessage("user", text),
    createAiAssistantMessage("bot", response.text, response.actions)
  ];
  aiAssistantState.input = "";
  aiAssistantState.voiceNotice = "";

  if (options.fromVoice) {
    aiAssistantState.voiceStatus = AI_STATUS_DONE;
  }

  render();
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
    render();
  }
}

function playAiVoiceDemoLine(index = 0) {
  if (!aiAssistantState.demoPlaying || index >= AI_VOICE_DEMO_SCRIPT.length) {
    stopAiVoiceDemo({ renderAfter: false });
    aiAssistantState.demoStatus = "Ukázka dokončena.";
    render();
    return;
  }

  const line = AI_VOICE_DEMO_SCRIPT[index];
  aiAssistantState.demoSpeaker = line.speaker;
  aiAssistantState.demoSpeakerLabel = line.label;
  aiAssistantState.demoLine = line.text;
  aiAssistantState.demoStatus = line.speaker === "ai" ? "Mluví AI Smart pomocník…" : "Mluví uživatel Kaiser smart…";
  aiAssistantState.voiceStatus = AI_STATUS_DEMO;
  aiAssistantState.isListening = true;
  render();

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
    render();
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

function startAiVoiceRecognition() {
  startAiVoiceDemo();
}

function stopAiVoiceRecognition() {
  stopAiVoiceDemo({ renderAfter: false });
  speechRecognition.stop();
  aiAssistantState.isListening = false;
  aiAssistantState.voiceStatus = AI_STATUS_DONE;
  render();
}

function navigateFromAiAssistant(route) {
  stopAiVoiceDemo({ renderAfter: false });
  speechRecognition.stop({ status: false });
  aiAssistantState.chatOpen = false;
  aiAssistantState.welcomeVisible = false;
  aiAssistantState.launcherVisible = true;
  aiAssistantState.isListening = false;
  guardedAccessAction(() => navigateToUrl(routeHref(route)));
}

function renderAiAssistantLayer() {
  const user = authState.user ? currentUser() : null;

  if (!user || !isUserActive(user)) {
    return "";
  }

  return [
    AiWelcomeModal({ visible: aiAssistantState.welcomeVisible }),
    AiAssistantChat({
      open: aiAssistantState.chatOpen,
      mode: aiAssistantState.mode,
      messages: aiAssistantState.messages,
      input: aiAssistantState.input,
      isListening: aiAssistantState.isListening,
      demoPlaying: aiAssistantState.demoPlaying,
      demoSpeaker: aiAssistantState.demoSpeaker,
      demoSpeakerLabel: aiAssistantState.demoSpeakerLabel,
      demoLine: aiAssistantState.demoLine,
      demoStatus: aiAssistantState.demoStatus
    }),
    AiAssistantLauncher({
      visible: aiAssistantState.launcherVisible && !aiAssistantState.chatOpen && !aiAssistantState.welcomeVisible
    })
  ].join("");
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
    managerId: normalizeEmployeeCardText(data.managerId),
    employmentStatus: normalizeEmployeeCardText(data.employmentStatus) || "active",
    startDate: normalizeEmployeeCardText(data.startDate),
    employmentType: normalizeEmployeeCardText(data.employmentType),
    workload: normalizeEmployeeCardNumber(data.workload),
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
    managerId,
    managerName: managerId ? employeeFullName(manager) : "",
    employmentStatus: employeeCardFormValue(form, "employmentStatus") || "active",
    startDate: employeeCardFormValue(form, "startDate"),
    employmentType: employeeCardFormValue(form, "employmentType").trim(),
    workload: Number(employeeCardFormValue(form, "workload") || 0),
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
    logoUrl: form.elements.logoUrl.value,
    primaryColor: form.elements.primaryColor.value,
    secondaryColor: form.elements.secondaryColor.value,
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

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    return employeeTarget;
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
    <main class="app-shell home-page-fixed-theme">
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
      { id: "half-day", label: "Půl dne" },
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
  if (quickAbsenceState.dateMode !== "custom") {
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
      <div class="quick-absence-choices">
        ${quickDateChoices(type).map(quickChoiceButton).join("")}
      </div>
      ${type.id === "sick" ? '<p class="quick-absence-hint">Nemoc od dnešního dne</p>' : ""}
      ${quickAbsenceCustomDate(type)}
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
      <small>${escapeHtml(formatAbsenceDate(normalized.dateFrom))}${normalized.dateTo && normalized.dateTo !== normalized.dateFrom ? ` - ${escapeHtml(formatAbsenceDate(normalized.dateTo))}` : ""}</small>
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
          <strong>${escapeHtml(formatAbsenceDate(normalized.dateFrom))} - ${escapeHtml(formatAbsenceDate(normalized.dateTo))}</strong>
          <span>${escapeHtml(formatAbsenceDays(normalized.daysCount))}${normalized.halfDay ? " · půlden" : ""}</span>
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
            <th>Dny</th>
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
                <strong>${formatAbsenceDate(request.dateFrom)} - ${formatAbsenceDate(request.dateTo)}</strong>
                <span>${request.halfDayFrom || request.halfDayTo ? "obsahuje půlden" : "celý den"}</span>
              </td>
              <td data-label="Dny">${escapeHtml(formatAbsenceDays(request.daysCount))}</td>
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
            ${formatAbsenceDate(request.dateFrom)} - ${formatAbsenceDate(request.dateTo)}
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
        <label>
          <span>Datum do</span>
          <input name="dateTo" type="date" value="${toIsoDate(new Date())}" data-absence-date required />
        </label>
        <label class="absence-checkbox">
          <input name="halfDayFrom" type="checkbox" data-absence-date />
          <span>Půlden od</span>
        </label>
        <label class="absence-checkbox">
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
          <span>Počet dnů</span>
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
                    title="${escapeHtml(`${request.employeeName} · ${request.type}`)}"
                  >
                    ${escapeHtml(request.employeeName)} · ${escapeHtml(request.type)}
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
          <td data-label="Termín">${escapeHtml(formatAbsenceDate(item.dateFrom))} - ${escapeHtml(formatAbsenceDate(item.dateTo))}</td>
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
              ${employeeCardField("Stav zaměstnance", employeeCardSelect("employmentStatus", EMPLOYMENT_STATUS_OPTIONS, formEmployee.employmentStatus || "active", disabled))}
              ${employeeCardField("Datum nástupu", employeeCardInput("startDate", formEmployee.startDate, { type: "date", disabled }))}
              ${employeeCardField("Pracovní úvazek", employeeCardInput("workload", formEmployee.workload, { type: "number", step: "0.1", min: "0", disabled }))}
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

function modulePage(moduleItem, user, isDashboard = false) {
  if (moduleItem.id === "absence") {
    return absenceModulePage(moduleItem, user, isDashboard);
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
      <td data-label="Poslední chyba">${escapeHtml(item.lastError || item.messagePreview || "bez chyby")}</td>
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
  const canExport = hasPermission(user, "feedback", "export");
  const moduleOptions = orderedModules.map((moduleItem) => ({
    value: moduleItem.id === "absence" ? "dovolena-nemoc" : moduleItem.id,
    label: moduleItem.title
  }));
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
          ${canExport ? `
            <button class="primary-action feedback-admin__export" type="button" data-feedback-export>
              Export CSV
            </button>
          ` : ""}
        </div>

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
  const fromInput = document.querySelector("[data-quick-date-from]");
  const toInput = document.querySelector("[data-quick-date-to]");
  const from = fromInput?.value || quickAbsenceState.dateFrom || isoDateAfter(0);
  const to = toInput?.value || from;

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
}

async function submitQuickAbsenceRequest() {
  const user = currentUser();
  const type = quickAbsenceType();

  if (!user || !type || !quickAbsenceState.dateFrom || quickAbsenceState.saving) {
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

    const [vacation, absence, history, documents] = await Promise.allSettled([
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/vacation-balance`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/absence`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/work-history`),
      apiJson(`/api/employees/${encodeURIComponent(employeeId)}/documents`)
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

function updateAppearanceDraft(form, options = {}) {
  themeState.draft = appearanceFormData(form);
  themeState.error = "";

  if (options.preview) {
    themeState.preview = themeState.draft;
    themeState.message = "Náhled změn je zapnutý pouze pro vnitřní modulové stránky.";
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
    renderApp();
    app.insertAdjacentHTML("beforeend", renderAiAssistantLayer());
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
        internalNote: form.elements.internalNote?.value || ""
      })
    });

    if (result.feedback) {
      replaceFeedbackItem(result.feedback);
    }

    feedbackState.cardMessages = {
      ...feedbackState.cardMessages,
      [id]: { message: "Uloženo", error: "" }
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

async function submitAbsenceRequest(form) {
  const user = currentUser();
  if (!hasPermission(user, "absence", "create")) {
    setAbsenceNotice("", "Nemáte oprávnění vytvořit žádost.");
    render();
    return;
  }

  const type = form.elements.type.value;
  const dateFrom = form.elements.dateFrom.value;
  const dateTo = form.elements.dateTo.value;
  const halfDayFrom = Boolean(form.elements.halfDayFrom?.checked);
  const halfDayTo = Boolean(form.elements.halfDayTo?.checked);
  const daysCount = countAbsenceDays(dateFrom, dateTo, halfDayFrom, halfDayTo);

  if (!dateFrom || !dateTo || daysCount <= 0) {
    setAbsenceNotice("", "Zkontrolujte prosím datum od a do.");
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
  const days = countAbsenceDays(
    form.elements.dateFrom.value,
    form.elements.dateTo.value,
    Boolean(form.elements.halfDayFrom?.checked),
    Boolean(form.elements.halfDayTo?.checked)
  );
  const daysPreview = form.querySelector("[data-absence-days-preview]");
  const statusPreview = form.querySelector("[data-absence-status-preview]");
  const submitButton = form.querySelector("[data-absence-submit]");

  if (daysPreview) {
    daysPreview.textContent = days > 0 ? formatAbsenceDays(days) : "zkontrolujte datum";
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

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    return saveEmployeeCardChanges(employeeTarget);
  }

  return true;
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

  const employeeTarget = currentEmployeeCardDirtyTarget();

  if (employeeTarget?.isDirty) {
    discardEmployeeCardDirtyChanges();
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
    submitAiAssistantQuestion(aiForm.elements.question?.value || aiAssistantState.input);
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

  const employeeCardSelect = event.target.closest("[data-employee-card-select]");
  if (employeeCardSelect) {
    const nextEmployeeId = employeeCardSelect.value;
    employeeCardSelect.value = employeeCardState.employee?.id || "";
    guardedAccessAction(() => navigateToUrl(routeHref(employeeCardRoute(nextEmployeeId))));
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

  const notificationFilter = event.target.closest("[data-notification-filter]");
  if (notificationFilter) {
    const form = notificationFilter.closest("[data-notification-filters]");
    if (form) {
      applyNotificationFilters(form);
    }
    return;
  }
});

document.addEventListener("click", async (event) => {
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
    openAiAssistant("text");
    return;
  }

  const aiClose = event.target.closest("[data-ai-close]");
  if (aiClose) {
    closeAiAssistant();
    return;
  }

  const aiStartVoice = event.target.closest("[data-ai-start-voice]");
  if (aiStartVoice) {
    startAiVoiceRecognition();
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
render();
bootstrapAuth();
