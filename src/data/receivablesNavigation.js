const RECEIVABLES_HASH_TABS = new Map([
  ["receivables-customers", "customers"],
  ["receivables-dry-run", "dry-run"]
]);

export function receivablesHashTargetId(hash = "") {
  const rawValue = String(hash || "").replace(/^#/, "");
  if (!rawValue) return "";

  try {
    const targetId = decodeURIComponent(rawValue);
    return RECEIVABLES_HASH_TABS.has(targetId) ? targetId : "";
  } catch {
    return "";
  }
}

export function receivablesActiveTab(view = "dashboard", hash = "") {
  if (view !== "dashboard") return view;
  const targetId = receivablesHashTargetId(hash);
  return RECEIVABLES_HASH_TABS.get(targetId) || "dashboard";
}
