import { hasPermission } from "../permissions.js";

export const FEEDBACK_PRIORITIES = ["Nízká", "Běžná", "Důležitá", "Kritická"];
export const FEEDBACK_STATUSES = ["Nová", "Převzato", "V řešení", "Hotovo", "Zamítnuto", "Archiv"];

export const FEEDBACK_STATUS_API_VALUES = {
  Nová: "new",
  Převzato: "accepted",
  "V řešení": "in_progress",
  Hotovo: "done",
  Zamítnuto: "rejected",
  Archiv: "archived"
};

export const FEEDBACK_STATUS_LABELS = Object.fromEntries(
  Object.entries(FEEDBACK_STATUS_API_VALUES).map(([label, value]) => [value, label])
);

export function canManageFeedback(user) {
  return hasPermission(user, "feedback", "edit") || hasPermission(user, "feedback", "manage");
}

export function normalizeFeedback(item = {}) {
  return {
    id: String(item.id || ""),
    moduleId: String(item.moduleId || item.module_id || ""),
    moduleName: String(item.moduleName || item.module_name || ""),
    userId: String(item.userId || item.user_id || ""),
    userName: String(item.userName || item.user_name || ""),
    userRole: String(item.userRole || item.user_role || ""),
    message: String(item.message || ""),
    priority: normalizeFeedbackPriority(item.priority),
    status: normalizeFeedbackStatus(item.status),
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    resolvedAt: item.resolvedAt || item.resolved_at || null,
    resolvedByUserId: item.resolvedByUserId || item.resolved_by_user_id || null,
    internalNote: String(item.internalNote || item.internal_note || "")
  };
}

export function normalizeFeedbackPriority(value) {
  return FEEDBACK_PRIORITIES.includes(value) ? value : "Běžná";
}

export function normalizeFeedbackStatus(value) {
  return FEEDBACK_STATUSES.includes(value) ? value : FEEDBACK_STATUS_LABELS[value] || "Nová";
}

export function feedbackStatusApiValue(status) {
  return FEEDBACK_STATUS_API_VALUES[normalizeFeedbackStatus(status)] || "new";
}

export function visibleFeedbackForUser(items, user) {
  if (canManageFeedback(user)) {
    return items;
  }

  return items.filter((item) => item.userId === user?.id);
}

export function filterModuleFeedback(items, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const author = String(filters.author || "").trim().toLowerCase();

  return items.filter((item) => {
    if (filters.moduleId && item.moduleId !== filters.moduleId) {
      return false;
    }

    if (filters.status && item.status !== filters.status) {
      return false;
    }

    if (filters.priority && item.priority !== filters.priority) {
      return false;
    }

    if (author && !item.userName.toLowerCase().includes(author)) {
      return false;
    }

    if (search) {
      const haystack = `${item.message} ${item.moduleName} ${item.internalNote}`.toLowerCase();
      return haystack.includes(search);
    }

    return true;
  });
}

export function feedbackSummary(items) {
  return {
    newCount: items.filter((item) => item.status === "Nová").length,
    inProgressCount: items.filter((item) => item.status === "V řešení" || item.status === "Převzato").length,
    doneCount: items.filter((item) => item.status === "Hotovo").length,
    byModule: groupCount(items, "moduleName"),
    byPriority: groupCount(items, "priority")
  };
}

function groupCount(items, key) {
  return items.reduce((acc, item) => {
    const label = item[key] || "Neuvedeno";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function moduleFeedbackToCsv(items) {
  const header = [
    "id",
    "moduleId",
    "moduleName",
    "userId",
    "userName",
    "userRole",
    "message",
    "priority",
    "status",
    "createdAt",
    "resolvedAt",
    "resolvedByUserId",
    "internalNote"
  ];
  const rows = items.map((item) => header.map((key) => csvCell(item[key])).join(","));

  return [header.join(","), ...rows].join("\n");
}
