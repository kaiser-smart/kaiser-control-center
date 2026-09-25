export function receivablesInvoicePage(invoices = [], requestedPage = 1) {
  const pageSize = 10;
  const totalRows = invoices.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.floor(Number(requestedPage) || 1)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, totalRows, totalPages, start: totalRows ? offset + 1 : 0,
    end: Math.min(totalRows, offset + pageSize), rows: invoices.slice(offset, offset + pageSize) };
}
