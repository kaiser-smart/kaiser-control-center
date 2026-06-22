const STORAGE_KEY = "smart_odpady_module_feedback_v1";

export const FEEDBACK_PRIORITIES = ["Nízká", "Běžná", "Důležitá", "Kritická"];
export const FEEDBACK_STATUSES = ["Nová", "Převzato", "V řešení", "Hotovo", "Zamítnuto", "Archiv"];
const FINISHED_STATUSES = new Set(["Hotovo", "Zamítnuto", "Archiv"]);

function storage() {
  try {
    const probe = "__smart_odpady_feedback_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function generateId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeFeedback(item) {
  return {
    id: String(item.id || generateId()),
    moduleId: String(item.moduleId || ""),
    moduleName: String(item.moduleName || ""),
    userId: String(item.userId || ""),
    userName: String(item.userName || ""),
    userRole: String(item.userRole || ""),
    message: String(item.message || ""),
    priority: FEEDBACK_PRIORITIES.includes(item.priority) ? item.priority : "Běžná",
    status: FEEDBACK_STATUSES.includes(item.status) ? item.status : "Nová",
    createdAt: item.createdAt || new Date().toISOString(),
    resolvedAt: item.resolvedAt || null,
    resolvedByUserId: item.resolvedByUserId || null,
    internalNote: String(item.internalNote || "")
  };
}

export function canManageFeedback(user) {
  return ["admin", "management"].includes(user?.role);
}

export function readModuleFeedback() {
  const target = storage();
  if (!target) {
    return [];
  }

  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeFeedback).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      : [];
  } catch {
    return [];
  }
}

function writeModuleFeedback(items) {
  const target = storage();
  if (!target) {
    throw new Error("Feedback storage is not available");
  }

  target.setItem(STORAGE_KEY, JSON.stringify(items.map(normalizeFeedback)));
}

export function createModuleFeedback({ moduleId, moduleName, currentUser, message, priority = "Běžná" }) {
  const cleanMessage = String(message || "").trim();

  if (!cleanMessage) {
    throw new Error("Feedback message is required");
  }

  const feedback = normalizeFeedback({
    id: generateId(),
    moduleId,
    moduleName,
    userId: currentUser?.id || "",
    userName: currentUser?.name || currentUser?.email || "Uživatel",
    userRole: currentUser?.role || "readonly",
    message: cleanMessage,
    priority,
    status: "Nová",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedByUserId: null,
    internalNote: ""
  });

  writeModuleFeedback([feedback, ...readModuleFeedback()]);
  return feedback;
}

export function updateModuleFeedback(id, updates, currentUser) {
  const items = readModuleFeedback();
  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    const next = normalizeFeedback({
      ...item,
      ...updates
    });

    if (updates.status) {
      if (FINISHED_STATUSES.has(next.status)) {
        next.resolvedAt = next.resolvedAt || new Date().toISOString();
        next.resolvedByUserId = next.resolvedByUserId || currentUser?.id || null;
      } else {
        next.resolvedAt = null;
        next.resolvedByUserId = null;
      }
    }

    return next;
  });

  writeModuleFeedback(nextItems);
  return nextItems.find((item) => item.id === id) || null;
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
