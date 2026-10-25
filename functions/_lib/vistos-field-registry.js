// Derived from the supplied v1.1 registry; candidates are NOT verified mappings.
export const VISTOS_FIELD_REGISTRY = [
  {
    "logical_key": "job.issuer",
    "label_cs": "Výstavce",
    "source_entity": "ServiceList",
    "candidate_source_fields": ["Issuer_FK"],
    "disclosure_class": "operational",
    "evidence": "Live DbColumn 137 + ServiceList 181458 / UI 2026-10-25",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.vehicle_record",
    "label_cs": "Vozidlo",
    "source_entity": "ServiceList",
    "candidate_source_fields": ["Vozidlo_FK"],
    "disclosure_class": "operational",
    "evidence": "Live dbo.Vehicle 172 + ServiceList 181458 / UI 2026-10-25",
    "expected_normalized_type": "reference",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.id",
    "label_cs": "ID zakázkového listu",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Id"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_id",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.number",
    "label_cs": "Číslo zakázkového listu",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Number"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.source_status",
    "label_cs": "Původní stav",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Status_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.is_done",
    "label_cs": "Příznak dokončení",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "IsDone"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "boolean",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.parent",
    "label_cs": "Nadřazený dokument",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "MasterParent_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.created",
    "label_cs": "Vytvořeno ve Vistosu",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Created"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.modified",
    "label_cs": "Změněno ve Vistosu",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Modified"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.document_date",
    "label_cs": "Datum zakázkového listu",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "DateOfServiceList"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_date_or_datetime",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.realization_date",
    "label_cs": "Datum realizace ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "DateOfRealization"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "source_date_or_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.date_start",
    "label_cs": "DateStart ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "DateStart"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.date_end",
    "label_cs": "DateEnd ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "DateEnd"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.resolution_start",
    "label_cs": "StartOfResolution ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "StartOfResolution"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.resolution_end",
    "label_cs": "EndOfResolution ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "EndOfResolution"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.customer",
    "label_cs": "Zákazník",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "CustomerCompany_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.branch",
    "label_cs": "Provozovna zákazníka",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "CustomerBranch_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.contact",
    "label_cs": "Kontaktní osoba zákazníka",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "CustomerContact_FK"
    ],
    "disclosure_class": "personal",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.phone",
    "label_cs": "Telefon u zakázky",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Phone"
    ],
    "disclosure_class": "personal",
    "evidence": "K",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.service_address",
    "label_cs": "Nakládková / servisní adresa",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Nakladkovaadresa_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.site",
    "label_cs": "Stanoviště",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Stanoviste"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_value",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.contract",
    "label_cs": "Smlouva",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Contract_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.waste",
    "label_cs": "Odpad ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Waste"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_value",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.vehicle",
    "label_cs": "Vozidlo ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Auto_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "reference",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.allocated_vehicles",
    "label_cs": "Přidělená vozidla",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "AllocatedVehicle"
    ],
    "disclosure_class": "operational",
    "evidence": "H",
    "expected_normalized_type": "reference_or_reference_array",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.driver_contact",
    "label_cs": "Řidič ze zdroje",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "RidicContact_FK"
    ],
    "disclosure_class": "personal",
    "evidence": "H",
    "expected_normalized_type": "reference",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.finance.Currency_FK",
    "label_cs": "Měna zakázky",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "Currency_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "H",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job.finance.PriceWithoutTax",
    "label_cs": "Cena zakázky bez DPH",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "PriceWithoutTax"
    ],
    "disclosure_class": "financial",
    "evidence": "H",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job.finance.PriceTax",
    "label_cs": "DPH zakázky",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "PriceTax"
    ],
    "disclosure_class": "financial",
    "evidence": "H",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job.finance.PriceWithTax",
    "label_cs": "Cena zakázky s DPH",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "PriceWithTax"
    ],
    "disclosure_class": "financial",
    "evidence": "H",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job.finance.TransferredTaxLiability",
    "label_cs": "Přenesená daňová povinnost",
    "source_entity": "ServiceList",
    "candidate_source_fields": [
      "TransferredTaxLiability"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "boolean",
    "ui_section": "items"
  },
  {
    "logical_key": "job.company",
    "label_cs": "Právnická osoba / firma KAISER",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "reference",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.kind",
    "label_cs": "Typ služby",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "reference_or_string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.description",
    "label_cs": "Popis práce",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.customer_ico",
    "label_cs": "IČO zákazníka",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.customer_dic",
    "label_cs": "DIČ zákazníka",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.customer_email",
    "label_cs": "E-mail zákazníka",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "personal",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.other_stops",
    "label_cs": "Další místa / zastávky",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "array",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.coordinates",
    "label_cs": "Souřadnice servisního místa",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "coordinates",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.crew",
    "label_cs": "Další členové posádky",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "personal",
    "evidence": "P",
    "expected_normalized_type": "reference_array",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.planned_duration",
    "label_cs": "Potvrzená plánovaná délka",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "duration",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.actual_segments",
    "label_cs": "Skutečné úseky práce",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "array",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.waste_code",
    "label_cs": "Katalogové číslo odpadu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "items"
  },
  {
    "logical_key": "job.waste_category",
    "label_cs": "Kategorie odpadu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "string",
    "ui_section": "items"
  },
  {
    "logical_key": "job.measured_weight",
    "label_cs": "Skutečně naměřená hmotnost",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "quantity_with_unit",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.measured_volume",
    "label_cs": "Skutečně naměřený objem",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "quantity_with_unit",
    "ui_section": "execution"
  },
  {
    "logical_key": "job.order_link",
    "label_cs": "Obchodní objednávka",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "reference_array",
    "ui_section": "documents"
  },
  {
    "logical_key": "job.invoice_links",
    "label_cs": "Vazby na faktury",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "reference_array",
    "ui_section": "documents"
  },
  {
    "logical_key": "job.invoice_allocations",
    "label_cs": "Doložená alokace částky k faktuře",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "array",
    "ui_section": "documents"
  },
  {
    "logical_key": "job.instructions",
    "label_cs": "Pokyny k provedení",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "sanitized_text",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.notes",
    "label_cs": "Poznámky",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "sanitized_text",
    "ui_section": "overview"
  },
  {
    "logical_key": "job.attachments",
    "label_cs": "Metadata příloh / dokumentů / fotek",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "array",
    "ui_section": "documents"
  },
  {
    "logical_key": "job_item.Id",
    "label_cs": "ID položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Id"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_id",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.ServiceList_FK",
    "label_cs": "Zakázkový list položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "ServiceList_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.MasterParent_FK",
    "label_cs": "Nadřazený záznam položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "MasterParent_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.ContractRow_FK",
    "label_cs": "Smluvní položka",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "ContractRow_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.Product_FK",
    "label_cs": "Produkt / služba položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Product_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.Quantity",
    "label_cs": "Množství ze zdroje",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Quantity"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.c_OrderedQuantity",
    "label_cs": "Objednané množství ze zdroje",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "c_OrderedQuantity"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.Status_FK",
    "label_cs": "Stav položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Status_FK"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.IsDone",
    "label_cs": "Příznak dokončení položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "IsDone"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "boolean",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.DateOfRealization",
    "label_cs": "Datum realizace položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "DateOfRealization"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_date_or_datetime",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.Created",
    "label_cs": "Vytvoření položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Created"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.Modified",
    "label_cs": "Změna položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Modified"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.UnitPrice",
    "label_cs": "Jednotková cena",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "UnitPrice"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.ListPrice",
    "label_cs": "Ceníková cena",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "ListPrice"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.UnitPriceDiscount",
    "label_cs": "Sleva na jednotku",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "UnitPriceDiscount"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.UnitPriceDiscountPercentage",
    "label_cs": "Sleva v procentech",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "UnitPriceDiscountPercentage"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.TaxIncluded",
    "label_cs": "Daň zahrnuta v ceně",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "TaxIncluded"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "boolean",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.TaxRate_FK",
    "label_cs": "Sazba DPH",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "TaxRate_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.PriceWithoutTax",
    "label_cs": "Položka bez DPH",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "PriceWithoutTax"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.PriceTax",
    "label_cs": "DPH položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "PriceTax"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.PriceWithTax",
    "label_cs": "Položka s DPH",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "PriceWithTax"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.finance.Currency_FK",
    "label_cs": "Měna položky",
    "source_entity": "ServiceListItem",
    "candidate_source_fields": [
      "Currency_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "K",
    "expected_normalized_type": "reference",
    "ui_section": "items"
  },
  {
    "logical_key": "job_item.unit",
    "label_cs": "Jednotka množství",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "P",
    "expected_normalized_type": "reference_or_string",
    "ui_section": "items"
  },
  {
    "logical_key": "invoice.Id",
    "label_cs": "ID faktury Vistos",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "Id"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "source_id",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.InvoiceNumber",
    "label_cs": "Číslo faktury",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "InvoiceNumber"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "string",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.Currency_FK",
    "label_cs": "Měna faktury",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "Currency_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.PriceWithTax",
    "label_cs": "Částka faktury s DPH",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "PriceWithTax"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "decimal_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.AmountPaid",
    "label_cs": "Evidované úhrady Vistos",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "AmountPaid"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "decimal_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.AmountPaidProformaInvoice",
    "label_cs": "Odpočet zálohových faktur",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "AmountPaidProformaInvoice"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "decimal_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.RemainToPay",
    "label_cs": "Zůstatek Vistos",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "RemainToPay"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "decimal",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.IsPaid",
    "label_cs": "Příznak úhrady Vistos",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "IsPaid"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "boolean",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.InAccounting",
    "label_cs": "Evidence v účetnictví",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "InAccounting"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "boolean",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.Modified",
    "label_cs": "Změna faktury ve Vistosu",
    "source_entity": "InvoiceIssued",
    "candidate_source_fields": [
      "Modified"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "source_datetime",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.company",
    "label_cs": "Firma vystavitele",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "source_value",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.customer",
    "label_cs": "Zákazník faktury",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "source_value",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.money_id",
    "label_cs": "Identita faktury v Money",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "source_value",
    "ui_section": "payments"
  },
  {
    "logical_key": "invoice.fully_paid_date",
    "label_cs": "Autoritativní datum úplného doplacení",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "P",
    "expected_normalized_type": "source_value",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Id",
    "label_cs": "ID Payment ve Vistosu",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Id"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "source_id",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.InvoiceIssued_FK",
    "label_cs": "Faktura úhrady",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "InvoiceIssued_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Amount",
    "label_cs": "Částka alokace",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Amount"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "decimal_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Date",
    "label_cs": "Datum evidence Vistos",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Date"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "source_date",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Currency_FK",
    "label_cs": "Měna úhrady",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Currency_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.PaymentType_FK",
    "label_cs": "Směr platby",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "PaymentType_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Type_FK",
    "label_cs": "Způsob platby",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Type_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Ext_ID",
    "label_cs": "Externí ID podle Vistosu",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Ext_ID"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "string_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.AdvancedPayment",
    "label_cs": "Příznak zálohové platby",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "AdvancedPayment"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "boolean",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.BusinessUnit_FK",
    "label_cs": "Firma platby",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "BusinessUnit_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Directory_FK",
    "label_cs": "Adresářová vazba",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Directory_FK"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "reference_nullable",
    "ui_section": "payments"
  },
  {
    "logical_key": "payment.Modified",
    "label_cs": "Změna Payment",
    "source_entity": "Payment",
    "candidate_source_fields": [
      "Modified"
    ],
    "disclosure_class": "financial",
    "evidence": "M",
    "expected_normalized_type": "source_datetime",
    "ui_section": "payments"
  },
  {
    "logical_key": "meta.source_installation",
    "label_cs": "Instalace zdroje",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "string",
    "ui_section": "provenance"
  },
  {
    "logical_key": "meta.imported_at",
    "label_cs": "Načteno do Smartu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "instant",
    "ui_section": "provenance"
  },
  {
    "logical_key": "meta.mapping_version",
    "label_cs": "Verze mapování",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "string",
    "ui_section": "provenance"
  },
  {
    "logical_key": "meta.source_hash",
    "label_cs": "Fingerprint zdrojových hodnot",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "string",
    "ui_section": "provenance"
  },
  {
    "logical_key": "meta.availability",
    "label_cs": "Dostupnost jednotlivých polí",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "provenance"
  },
  {
    "logical_key": "meta.extensions",
    "label_cs": "Další dostupné oborové údaje",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "unclassified",
    "evidence": "L",
    "expected_normalized_type": "object",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.id",
    "label_cs": "Stálé ID alokace Smart",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "string",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.bank_transaction_id",
    "label_cs": "ID bankovní transakce",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "string",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.booking_date",
    "label_cs": "Datum zaúčtování v bance",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "date",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.revision",
    "label_cs": "Neměnná revize alokace",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "integer",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.export_authority",
    "label_cs": "Výlučný zapisovatel",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.vistos_payment_id",
    "label_cs": "Výsledek zápisu Vistos",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "source_id_nullable",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.transfer_status",
    "label_cs": "Stav přenosu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.confirmation_method",
    "label_cs": "Způsob potvrzení alokace",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.confirmation_evidence",
    "label_cs": "Důkaz potvrzení alokace",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "object",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.operation_kind",
    "label_cs": "Druh účetního příkazu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "provenance"
  },
  {
    "logical_key": "allocation.reservation",
    "label_cs": "Rezervace bankovní částky",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "financial",
    "evidence": "L",
    "expected_normalized_type": "object",
    "ui_section": "provenance"
  },
  {
    "logical_key": "tracking.trip.id",
    "label_cs": "ID jízdy T-Cars",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaId"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_id",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.started_at",
    "label_cs": "Začátek jízdy T-Cars",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaOd"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.ended_at",
    "label_cs": "Konec jízdy T-Cars",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaDo"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.origin",
    "label_cs": "Počáteční místo ze zdroje",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaOdkud"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "string",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.destination",
    "label_cs": "Cílové místo ze zdroje",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaKam"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "string",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.distance",
    "label_cs": "Vzdálenost jízdy",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaDelkaKm"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.odometer_start",
    "label_cs": "Počáteční stav tachometru",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaStavKmPocatek"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.odometer_end",
    "label_cs": "Koncový stav tachometru",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaStavKmKonec"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.engine_hours_start",
    "label_cs": "Počáteční stav motohodin",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaStavMthPocatek"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.engine_hours_end",
    "label_cs": "Koncový stav motohodin",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaStavMthKonec"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.driver",
    "label_cs": "Řidič podle T-Cars",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaRidic"
    ],
    "disclosure_class": "personal",
    "evidence": "K",
    "expected_normalized_type": "provider_person_reference",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.responsible",
    "label_cs": "Odpovědná osoba podle T-Cars",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaOdpovedny"
    ],
    "disclosure_class": "personal",
    "evidence": "K",
    "expected_normalized_type": "provider_person_reference",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.trip.private",
    "label_cs": "Soukromá jízda",
    "source_entity": "T-Cars.knihaJizdVozidlo",
    "candidate_source_fields": [
      "jizdaSoukroma"
    ],
    "disclosure_class": "personal",
    "evidence": "K",
    "expected_normalized_type": "boolean",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.point_id",
    "label_cs": "ID bodu poskytovatele",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "id"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_id",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.observed_at",
    "label_cs": "Původní GPS čas",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "datumCas"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "source_datetime",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.valid",
    "label_cs": "Platnost GPS fixu",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "gpsValid"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "boolean_nullable",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.latitude",
    "label_cs": "Zeměpisná šířka",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "latitude"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.longitude",
    "label_cs": "Zeměpisná délka",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "longitude"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.speed",
    "label_cs": "Rychlost ze zdroje",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "rychlost"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "decimal_nullable",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.ignition",
    "label_cs": "Zapalování",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "zapalovani"
    ],
    "disclosure_class": "operational",
    "evidence": "K",
    "expected_normalized_type": "boolean_nullable",
    "ui_section": "execution"
  },
  {
    "logical_key": "tracking.gps.switch",
    "label_cs": "Přepínač bez potvrzeného významu",
    "source_entity": "T-Cars.vozidlaPozice",
    "candidate_source_fields": [
      "prepinac"
    ],
    "disclosure_class": "unclassified",
    "evidence": "K",
    "expected_normalized_type": "boolean_nullable",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.arrival_bounds",
    "label_cs": "Časové rozmezí příjezdu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "datetime_interval",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.departure_bounds",
    "label_cs": "Časové rozmezí odjezdu",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "datetime_interval",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.visit_duration_bounds",
    "label_cs": "Rozmezí pozorované doby na místě",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "duration_interval",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.association",
    "label_cs": "Stav přiřazení",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "enum",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.coverage",
    "label_cs": "Pokrytí a mezery časových dat",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "object",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.evidence",
    "label_cs": "Podklady a verze časového odvození",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "L",
    "expected_normalized_type": "object",
    "ui_section": "execution"
  },
  {
    "logical_key": "execution.technology_time",
    "label_cs": "Doložený chod technologie",
    "source_entity": null,
    "candidate_source_fields": [],
    "disclosure_class": "operational",
    "evidence": "P",
    "expected_normalized_type": "duration_nullable",
    "ui_section": "execution"
  }
];
