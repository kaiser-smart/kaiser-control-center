const FIELD_TEST_STATUS_PRIORITY = Object.freeze([
  "active",
  "confirmed",
  "draft",
  "completed"
]);

function cleanString(value) {
  return String(value || "").trim();
}

export function collectionRoutesFieldTestOwnedByUser(run = {}, userId = "") {
  const ownerId = cleanString(run?.metadata?.fieldTesterUserId);
  const currentUserId = cleanString(userId);
  return Boolean(ownerId && currentUserId && ownerId === currentUserId);
}

export function selectCollectionRoutesFieldTestRun(routes = [], options = {}) {
  const fieldTests = Array.isArray(routes) ? routes.filter(Boolean) : [];
  const selectedRunId = cleanString(options.selectedRunId);
  const currentUserId = cleanString(options.userId);

  if (selectedRunId) {
    const explicitlySelected = fieldTests.find((run) => cleanString(run?.id) === selectedRunId);
    if (explicitlySelected) return explicitlySelected;
  }

  const ownTests = fieldTests.filter((run) => collectionRoutesFieldTestOwnedByUser(run, currentUserId));
  for (const status of FIELD_TEST_STATUS_PRIORITY) {
    const matchingRun = ownTests.find((run) => cleanString(run?.status) === status);
    if (matchingRun) return matchingRun;
  }

  return ownTests[0] || null;
}
