import { MEDICAL_EXAM_RULES, normalizeMedicalExamCategory } from "../../src/data/medicalExamRules.js";

const COMPANY = {
  name: "Kaiser servis, spol. s r.o.",
  address: "Trnkova 3052/137, 628 00 Brno",
  companyId: "26274906"
};

const EXAM_TYPE_LABELS = {
  entry: "Vstupní prohlídky do zaměstnání",
  periodic: "Periodické preventivní prohlídky zaměstnance",
  extraordinary: "Mimořádné zdravotní prohlídky zaměstnance"
};

export const MEDICAL_EXAM_REQUEST_CATEGORIES = {
  administration_i: {
    label: "Administrativa / kategorie I.",
    workPosture: "1",
    physicalLoad: "1",
    chemicalSubstances: "1"
  },
  driver_ii: {
    label: "Řidič / kategorie II.",
    workPosture: "2",
    physicalLoad: "2",
    chemicalSubstances: "1"
  },
  technician_ii: {
    label: "Technik / kategorie II.",
    workPosture: "1",
    physicalLoad: "2",
    chemicalSubstances: "1"
  },
  wastewater_operator_ii: {
    label: "Obsluha ČOV / kategorie II.",
    workPosture: "1",
    physicalLoad: "2",
    chemicalSubstances: "1"
  }
};

function cleanString(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].map(cleanString).filter(Boolean).join(" ") ||
    cleanString(employee?.name) ||
    "Zaměstnanec";
}

function dateLabel(value) {
  const cleaned = cleanString(value);
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}. ${match[2]}. ${match[1]}` : "";
}

function numberLabel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function selectedExamType(exam) {
  const type = cleanString(exam?.requestExamType);
  return EXAM_TYPE_LABELS[type] ? type : "entry";
}

function selectedCategory(employee, exam) {
  const saved = normalizeMedicalExamCategory(exam?.requestCategory || exam?.category);
  if (saved) {
    return saved;
  }

  const lookup = `${employee?.position || ""} ${employee?.department || ""}`.toLowerCase();
  if (lookup.includes("řidi") || lookup.includes("ridi")) return "driver_ii";
  if (lookup.includes("technik")) return "technician_ii";
  if (lookup.includes("čov") || lookup.includes("cov")) return "wastewater_operator_ii";
  if (lookup.includes("admin") || lookup.includes("manaž") || lookup.includes("manaz")) return "administration_i";
  return "";
}

function categoryRows(selected) {
  return Object.entries(MEDICAL_EXAM_REQUEST_CATEGORIES).map(([key, row]) => `
    <tr>
      <td class="check-cell">${key === selected ? "X" : ""}</td>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.workPosture)}</td>
      <td>${escapeHtml(row.physicalLoad)}</td>
      <td>${escapeHtml(row.chemicalSubstances)}</td>
    </tr>
  `).join("");
}

function examTypeList(selected) {
  return Object.entries(EXAM_TYPE_LABELS).map(([key, label]) => `
    <div class="checkbox-line"><span>${key === selected ? "X" : ""}</span>${escapeHtml(label)}</div>
  `).join("");
}

function field(label, value) {
  return `
    <div class="field-row">
      <strong>${escapeHtml(label)}:</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

export function renderMedicalExamRequestDocument({ employee, exam, mode = "download" } = {}) {
  const selectedType = selectedExamType(exam);
  const selectedCategoryKey = selectedCategory(employee, exam);
  const category = MEDICAL_EXAM_REQUEST_CATEGORIES[selectedCategoryKey] || null;
  const examRule = MEDICAL_EXAM_RULES[normalizeMedicalExamCategory(exam?.category || selectedCategoryKey)] || null;
  const autoPrint = mode === "print";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Žádost o posouzení zdravotní způsobilosti k práci</title>
  <style>
    @page { size: A4; margin: 13mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef3ec;
      color: #111;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 12px;
      line-height: 1.28;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #fff;
      padding: 16mm 18mm 12mm;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
    }
    .toolbar {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      background: #eef3ec;
    }
    .toolbar button {
      min-height: 44px;
      border: 1px solid #cfd8ca;
      border-radius: 8px;
      padding: 0 18px;
      background: #fff;
      font-weight: 800;
      cursor: pointer;
    }
    .toolbar button.primary {
      border-color: #75bd25;
      background: #75bd25;
      color: #fff;
    }
    .logo {
      width: 36mm;
      height: auto;
      margin-bottom: 5mm;
      opacity: 0.88;
    }
    h1, h2 {
      margin: 0;
      text-align: center;
      font-size: 15px;
      letter-spacing: 0.01em;
      text-transform: uppercase;
    }
    h2 {
      margin-top: 12mm;
      margin-bottom: 6mm;
      font-size: 14px;
    }
    .section {
      margin-top: 6mm;
    }
    .field-row {
      display: grid;
      grid-template-columns: 48mm 1fr;
      gap: 4mm;
      margin: 1.5mm 0;
    }
    .field-row strong {
      font-weight: 800;
    }
    .checkbox-line {
      display: grid;
      grid-template-columns: 8mm 1fr;
      gap: 2mm;
      margin: 1.5mm 0 1.5mm 30mm;
    }
    .checkbox-line span,
    .check-cell {
      font-weight: 900;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 5mm;
    }
    th, td {
      border: 1px solid #111;
      padding: 2mm 2.5mm;
      text-align: center;
      vertical-align: middle;
    }
    th:nth-child(2), td:nth-child(2) {
      text-align: left;
    }
    th {
      font-weight: 900;
      background: #f4f4f4;
    }
    .check-cell {
      width: 9mm;
      font-size: 16px;
    }
    .muted {
      color: #555;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12mm;
      margin-top: 8mm;
    }
    .line {
      border-bottom: 1px dotted #111;
      min-height: 8mm;
      margin-top: 3mm;
    }
    .stamp-box {
      min-height: 26mm;
      border: 1px dashed #777;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      margin-top: 3mm;
    }
    .footer {
      margin-top: 10mm;
      text-align: center;
      color: #555;
      font-size: 10px;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
    }
    @media (max-width: 760px) {
      .page {
        width: 100%;
        min-height: auto;
        padding: 18px;
      }
      .field-row {
        grid-template-columns: 1fr;
        gap: 2px;
      }
      table {
        font-size: 11px;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" type="button" onclick="window.print()">Tisk / uložit jako PDF</button>
    <button type="button" onclick="window.close()">Zavřít</button>
  </div>
  <main class="page">
    <img class="logo" src="/logo-kaiser.svg" alt="Kaiser" />
    <h1>Žádost o posouzení zdravotní způsobilosti k práci</h1>

    <section class="section">
      ${field("Jméno zaměstnavatele", COMPANY.name)}
      ${field("Sídlo", COMPANY.address)}
      ${field("IČ", COMPANY.companyId)}
    </section>

    <section class="section">
      ${field("Jméno zaměstnance", employeeName(employee))}
      ${field("Bydliště", employee?.address || "")}
      ${field("Datum narození", dateLabel(exam?.dateOfBirth))}
    </section>

    <section class="section">
      ${field("Místo výkonu práce", employee?.workplace || "")}
      ${field("Pracovní pozice", employee?.position || "")}
      ${field("Týdenní úvazek", numberLabel(employee?.weeklyHours || (Number(employee?.workload || 0) * 40)))}
    </section>

    <section class="section">
      <strong>Žádáme o provedení:</strong>
      ${examTypeList(selectedType)}
    </section>

    <table aria-label="Zařazení zaměstnance">
      <thead>
        <tr>
          <th></th>
          <th>Zařazení</th>
          <th>Pracovní poloha</th>
          <th>Celková fyz. zátěž</th>
          <th>Chemické látky</th>
        </tr>
      </thead>
      <tbody>${categoryRows(selectedCategoryKey)}</tbody>
    </table>

    <section class="section">
      ${field("Zařazení zaměstnance", category?.label || examRule?.label || "")}
      ${field("Datum nástupu do pracovního poměru", dateLabel(employee?.startDate))}
      ${!selectedCategoryKey ? '<p class="muted">Zařazení zkontrolujte před exportem PDF.</p>' : ""}
    </section>

    <h2>Lékařský posudek o zdravotní způsobilosti k výkonu práce</h2>

    <section class="section">
      ${field("Jméno zařízení", exam?.medicalFacilityName || "")}
      ${field("Posuzující lékař", exam?.medicalDoctorName || "")}
      ${field("Sídlo", exam?.medicalFacilityAddress || "")}
      ${field("IČ", exam?.medicalFacilityCompanyId || "")}
    </section>

    <section class="section">
      ${field("Posuzovaná osoba", "Zdravotně způsobilá:   ANO / NE")}
      ${field("", "Zdravotně způsobilá s omezením:")}
      ${field("Datum vydání posudku", "")}
      ${field("Datum převzetí posudku", "")}
    </section>

    <div class="signature-grid">
      <div>
        <div class="line"></div>
        <p>Jméno, příjmení a podpis lékaře</p>
      </div>
      <div>
        <div class="stamp-box">Místo pro razítko</div>
      </div>
    </div>

    <p class="footer">Dokument byl vygenerován ze systému Kaiser Smart. Citlivé údaje nevkládejte do e-mailu ani veřejného úložiště.</p>
  </main>
  ${autoPrint ? '<script>setTimeout(() => window.print(), 300);</script>' : ""}
</body>
</html>`;
}
