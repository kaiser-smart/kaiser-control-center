import { escapeHtml } from "../moduleLayout.js";

function optionList(options = [], selectedValue = "", placeholder = "") {
  const placeholderOption = placeholder
    ? `<option value="" ${selectedValue ? "" : "selected"}>${escapeHtml(placeholder)}</option>`
    : "";

  return `${placeholderOption}${options.map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? option;
    return `
      <option value="${escapeHtml(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>
        ${escapeHtml(label)}
      </option>
    `;
  }).join("")}`;
}

function plateVehicleSummary(vehicle = {}) {
  const title = [
    vehicle.brand || vehicle.vehicleBrand,
    vehicle.model || vehicle.internalNumber || vehicle.vehicleName,
    vehicle.vehicleType || vehicle.bodyType
  ].filter(Boolean).join(" / ");

  return `
    <dl class="nm-driver-report-plate-summary">
      <div><dt>SPZ</dt><dd>${escapeHtml(vehicle.licensePlate || vehicle.tcarsLicensePlate || "-")}</dd></div>
      <div><dt>Vozidlo</dt><dd>${escapeHtml(title || "neuvedeno")}</dd></div>
      <div><dt>Ridic</dt><dd>${escapeHtml(vehicle.assignedDriverName || vehicle.driverName || "neprirazen")}</dd></div>
      <div><dt>VIN</dt><dd>${escapeHtml(vehicle.vin || "neni dostupne")}</dd></div>
    </dl>
  `;
}

function renderPlateSuggestion(item = {}) {
  const vehicle = item.vehicle || item;
  const plate = item.licensePlate || vehicle.licensePlate || vehicle.tcarsLicensePlate || "";
  const title = [
    vehicle.brand,
    vehicle.model || vehicle.internalNumber || vehicle.vehicleName,
    vehicle.assignedDriverName || vehicle.driverName
  ].filter(Boolean).join(" / ");

  return `
    <button class="nm-driver-report-plate-suggestion" type="button" data-driver-report-plate-suggestion="${escapeHtml(plate)}">
      <strong>${escapeHtml(plate || "SPZ")}</strong>
      <span>${escapeHtml(title || "Vozidlo")}</span>
    </button>
  `;
}

export function renderDriverReportPlateFeedback(validation = {}) {
  if (!validation || validation.status === "idle") {
    return `<p class="nm-driver-report-plate-help">SPZ se overuje proti Vozovemu parku.</p>`;
  }

  if (validation.status === "validating" || validation.loading) {
    return `<p class="nm-driver-report-plate-help" role="status">Overuji SPZ ve Vozovem parku...</p>`;
  }

  if (validation.status === "found") {
    return `
      <div class="nm-driver-report-plate-card nm-driver-report-plate-card--success" role="status">
        <strong>Vozidlo nalezeno</strong>
        ${plateVehicleSummary(validation.vehicle)}
      </div>
    `;
  }

  return `
    <div class="nm-driver-report-plate-card nm-driver-report-plate-card--error" role="alert">
      <strong>${escapeHtml(validation.message || "SPZ se nepodarilo overit.")}</strong>
      ${validation.suggestions?.length ? `
        <div class="nm-driver-report-plate-suggestions" aria-label="Podobne SPZ">
          ${validation.suggestions.map(renderPlateSuggestion).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderPlateOverride(viewModel) {
  if (!viewModel.canManage) {
    return "";
  }

  return `
    <div class="nm-driver-report-override">
      <label class="nm-check">
        <input type="checkbox" name="licensePlateUnverified" ${viewModel.draft.licensePlateUnverified ? "checked" : ""}>
        <span>Ulozit jako SPZ neoverena</span>
      </label>
      <label class="nm-field">
        <span>Povinna poznamka k vyjimce</span>
        <input class="nm-input" name="licensePlateOverrideNote" value="${escapeHtml(viewModel.draft.licensePlateOverrideNote)}" placeholder="Proc hlaseni ukladame bez nalezene SPZ">
      </label>
    </div>
  `;
}

export function renderDriverReportCreateForm(viewModel) {
  const disabled = viewModel.saving || !viewModel.canCreate;
  const submitDisabled = !viewModel.canSubmitCreate;
  const draft = viewModel.draft;

  return `
    <form class="nm-driver-report-form" data-driver-report-form>
      <div class="nm-driver-report-pitstop" aria-hidden="true">
        <span>Pitstop</span>
        <strong>SPZ -> hlaseni -> servis</strong>
      </div>

      <div class="nm-driver-report-form__main">
        <label class="nm-field nm-driver-report-license-field">
          <span>Potvrdit SPZ vozidla</span>
          <input
            class="nm-input"
            name="licensePlate"
            value="${escapeHtml(draft.licensePlate)}"
            placeholder="Napriklad 4B2 1234"
            autocapitalize="characters"
            autocomplete="off"
            required
            ${disabled ? "disabled" : ""}
          >
          <div class="nm-driver-report-plate-feedback" data-driver-report-plate-feedback>
            ${renderDriverReportPlateFeedback(viewModel.plateValidation)}
          </div>
          ${renderPlateOverride(viewModel)}
        </label>

        <label class="nm-field">
          <span>Co je potreba na vozidle resit</span>
          <textarea
            class="nm-textarea"
            name="defectDescription"
            rows="4"
            placeholder="Vymena steracu, pneumatik, oleje, zavada, poskozeni nebo jina servisni potreba."
            required
            ${disabled ? "disabled" : ""}
          >${escapeHtml(draft.defectDescription)}</textarea>
        </label>
      </div>

      <div class="nm-driver-report-steps" aria-label="Rychly postup hlaseni">
        <span>1 SPZ</span>
        <span>2 popis / fotka</span>
        <span>3 servis</span>
      </div>

      <details class="nm-driver-report-details">
        <summary>Doplnit vozidlo, VIN a ridice</summary>
        <div class="nm-form-grid">
          <label class="nm-field">
            <span>Ridic</span>
            <input class="nm-input" name="driverName" value="${escapeHtml(draft.driverName)}" autocomplete="name" ${disabled ? "disabled" : ""}>
          </label>
          <label class="nm-field">
            <span>Telefon ridice</span>
            <input class="nm-input" name="driverPhone" value="${escapeHtml(draft.driverPhone)}" inputmode="tel" autocomplete="tel" ${disabled ? "disabled" : ""}>
          </label>
          <label class="nm-field">
            <span>Vozidlo</span>
            <input class="nm-input" name="vehicleName" value="${escapeHtml(draft.vehicleName)}" placeholder="vozidlo / interni cislo" ${disabled ? "disabled" : ""}>
          </label>
          <label class="nm-field">
            <span>VIN</span>
            <input class="nm-input" name="vin" value="${escapeHtml(draft.vin)}" placeholder="pokud je dostupne" autocapitalize="characters" ${disabled ? "disabled" : ""}>
          </label>
          <label class="nm-field">
            <span>Znacka</span>
            <select class="nm-select" name="vehicleBrand" ${disabled ? "disabled" : ""}>
              ${optionList(viewModel.brandOptions, draft.vehicleBrand || "jine", "Vyberte znacku")}
            </select>
          </label>
        </div>
      </details>

      <details class="nm-driver-report-details">
        <summary>Pridat poznamku pro servis</summary>
        <label class="nm-field">
          <span>Poznamka</span>
          <textarea class="nm-textarea" name="note" rows="2" ${disabled ? "disabled" : ""}>${escapeHtml(draft.note)}</textarea>
        </label>
      </details>

      <label class="nm-check">
        <input type="checkbox" name="handoffAfterCreate" ${draft.handoffAfterCreate ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span>Po ulozeni predat Patrikovi a informovat servis</span>
      </label>

      <p class="nm-driver-report-form-note">
        Odeslani pouzije stejny POST /api/driver-reports workflow jako puvodni modul. Bez overene SPZ muze vyjimku ulozit jen opravnena role.
      </p>

      <button class="nm-button nm-button--primary nm-driver-report-submit" type="submit" data-driver-report-submit ${submitDisabled ? "disabled" : ""}>
        ${viewModel.saving ? "Odesilam..." : "Odeslat hlaseni"}
      </button>
    </form>
  `;
}

export function renderDriverReportManualPartForm(viewModel, item) {
  if (!viewModel.canManage || !item || !viewModel.selectedActions.canManualPart) {
    return "";
  }

  return `
    <form class="nm-driver-report-inline-form" data-driver-report-manual-part-form data-request-id="${escapeHtml(item.id)}">
      <label class="nm-field">
        <span>OE cislo</span>
        <input class="nm-input" name="oePartNumber" value="${escapeHtml(item.raw.oePartNumber || "")}" placeholder="rucne overene OE cislo">
      </label>
      <label class="nm-field">
        <span>Nazev dilu</span>
        <input class="nm-input" name="partName" value="${escapeHtml(item.raw.partName || "")}" placeholder="nazev dilu z WebParts/MyPartsHub">
      </label>
      <label class="nm-field">
        <span>Overeny dil</span>
        <input class="nm-input" name="verifiedPart" value="${escapeHtml(item.raw.verifiedPart || "")}" placeholder="napr. prave zrcatko">
      </label>
      <label class="nm-field">
        <span>Poznamka</span>
        <input class="nm-input" name="note" value="${escapeHtml(item.raw.note || "")}" placeholder="poznamka k overeni">
      </label>
      <button class="nm-button nm-button--secondary" type="submit" ${viewModel.actionLoading ? "disabled" : ""}>Ulozit overeni</button>
    </form>
  `;
}

export function renderDriverReportOrderForm(viewModel, item) {
  if (!viewModel.canManage || !item || !viewModel.selectedActions.canOrder) {
    return "";
  }

  return `
    <form class="nm-driver-report-inline-form" data-driver-report-order-form data-request-id="${escapeHtml(item.id)}">
      <label class="nm-field">
        <span>Overeny dil</span>
        <input class="nm-input" name="verifiedPart" value="${escapeHtml(item.raw.verifiedPart || "")}" placeholder="doplni nakup / servis">
      </label>
      <label class="nm-field">
        <span>OE cislo</span>
        <input class="nm-input" name="oePartNumber" value="${escapeHtml(item.raw.oePartNumber || "")}" placeholder="pokud je overene">
      </label>
      <label class="nm-field">
        <span>Nazev dilu</span>
        <input class="nm-input" name="partName" value="${escapeHtml(item.raw.partName || "")}" placeholder="nazev z katalogu">
      </label>
      <label class="nm-field">
        <span>Objednaci cislo</span>
        <input class="nm-input" name="partOrderNumber" value="${escapeHtml(item.raw.partOrderNumber || "")}" placeholder="pokud je zname">
      </label>
      <button class="nm-button nm-button--secondary" type="submit" ${viewModel.actionLoading ? "disabled" : ""}>Objednano</button>
    </form>
  `;
}

export function renderDriverReportServiceForm(viewModel, item) {
  if (!viewModel.canManage || !item || !viewModel.selectedActions.canScheduleService) {
    return "";
  }

  return `
    <form class="nm-driver-report-inline-form nm-driver-report-inline-form--service" data-driver-report-service-form data-request-id="${escapeHtml(item.id)}">
      <label class="nm-field">
        <span>Datum servisu</span>
        <input class="nm-input" type="date" name="serviceDate" value="${escapeHtml(item.serviceDateRaw)}" required>
      </label>
      <label class="nm-field">
        <span>Cas servisu</span>
        <input class="nm-input" type="time" name="serviceTime" value="${escapeHtml(item.serviceTimeRaw)}" required>
      </label>
      <label class="nm-field">
        <span>Servisni technik</span>
        <input class="nm-input" name="serviceTechnician" value="${escapeHtml(item.serviceTechnician)}">
      </label>
      <label class="nm-field">
        <span>Poznamka k pristaveni</span>
        <input class="nm-input" name="serviceNote" value="${escapeHtml(item.serviceNote)}">
      </label>
      <button class="nm-button nm-button--primary" type="submit" ${viewModel.actionLoading ? "disabled" : ""}>Naplanovat servis</button>
    </form>
  `;
}
