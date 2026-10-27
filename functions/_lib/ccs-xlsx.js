// Bounded reader for the observed CCS XLSX contract. Runs in Workers without Python.
import { CCS_HEADERS } from './ccs-import.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
function xml(text) {
  if (/<!DOCTYPE|<!ENTITY|<\w+:|\bTargetMode\s*=\s*["']External/i.test(text)) fail('unsupported_xml');
  return text;
}
const attr = (s, name) => new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`).exec(s)?.[1] || '';
const unescape = s => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, v) => v[0] === '#' ? String.fromCodePoint(v[1].toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : Number(v.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[v]);
const texts = s => [...s.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unescape(m[1])).join('');
export async function unzipCcs(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 10_000_000) fail('file_size_or_type');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { end = i; break; }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail('invalid_zip');
  const count = u16(end + 10), entries = new Map(); let pos = u32(end + 16), total = 0;
  if (!count || count > 200 || pos + u32(end + 12) !== end) fail('zip_limit');
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || u32(pos) !== 0x02014b50) fail('invalid_zip');
    const method = u16(pos + 10), size = u32(pos + 24), compressed = u32(pos + 20), offset = u32(pos + 42);
    const nameLen = u16(pos + 28), extra = u16(pos + 30), comment = u16(pos + 32);
    if (pos + 46 + nameLen + extra + comment > end || u16(pos + 8) & 1) fail('invalid_zip');
    const name = decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    total += size;
    if (total > 30_000_000 || entries.has(name) || /(^\/|\.\.|\\|externalLinks|vbaProject)/i.test(name)) fail('xlsx_expansion_or_external_content');
    if (offset + 30 > pos || u32(offset) !== 0x04034b50 || ![0, 8].includes(method)) fail('unsupported_zip');
    const start = offset + 30 + u16(offset + 26) + u16(offset + 28);
    if (start + compressed > pos || decode(bytes.subarray(offset + 30, offset + 30 + u16(offset + 26))) !== name) fail('invalid_zip');
    let data = bytes.subarray(start, start + compressed);
    if (method === 8) {
      const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = []; let n = 0;
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; n += chunk.value.length; if (n > size || n > 30_000_000) fail('xlsx_expansion_limit'); chunks.push(chunk.value); } }
      catch (e) { await reader.cancel().catch(() => {}); throw e; }
      data = new Uint8Array(n); let at = 0; for (const c of chunks) { data.set(c, at); at += c.length; }
    }
    if (data.length !== size) fail('invalid_zip_size');
    // CRC32 catches silent corruption even when compressed bytes still inflate.
    let crc = 0xffffffff;
    for (const b of data) { crc ^= b; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    if ((~crc >>> 0) !== u32(pos + 16)) fail('invalid_zip_crc');
    entries.set(name, data); pos += 46 + nameLen + extra + comment;
  }
  if (pos !== end) fail('invalid_zip_directory');
  return entries;
}
export async function readCcsXlsx(bytes) {
  const entries = await unzipCcs(bytes);
  const read = (key, required = true) => { const v = entries.get(key); if (!v && required) fail('xlsx_missing_part'); return v ? xml(decode(v)) : ''; };
  const workbook = read('xl/workbook.xml'), rels = read('xl/_rels/workbook.xml.rels');
  if (/date1904=["'](?:1|true)["']/.test(workbook)) fail('unsupported_date_system');
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)];
  if (sheets.length !== 1) fail('unexpected_sheet_count');
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].find(m => attr(m[0], 'Id') === attr(sheets[0][0], 'r:id'));
  if (!rel || !['worksheets/sheet1.xml', '/xl/worksheets/sheet1.xml'].includes(attr(rel[0], 'Target'))) fail('unexpected_sheet_target');
  const shared = [...read('xl/sharedStrings.xml', false).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const sheet = read('xl/worksheets/sheet1.xml');
  if (/<f\b/.test(sheet)) fail('formula_not_allowed');
  const matrix = [];
  for (const m of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (matrix.length >= 20001) fail('row_limit');
    const cells = Array(23).fill(''), seen = new Set();
    for (const c of m[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)\d+$/.exec(attr(c[1], 'r')); if (!ref) fail('cell_address');
      let col = 0; for (const a of ref[1]) col = col * 26 + a.charCodeAt(0) - 64;
      if (col > 23 || seen.has(col)) fail('schema_changed'); seen.add(col);
      const kind = attr(c[1], 't'), body = c[2] || ''; let value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] || '';
      if (kind === 's') { if (!/^\d+$/.test(value) || shared[Number(value)] === undefined) fail('invalid_shared_string'); value = shared[Number(value)]; }
      else if (kind === 'inlineStr') value = texts(body);
      else if (kind && kind !== 'n') fail('unsupported_cell_type');
      if (matrix.length && col === 7 && !['s', 'inlineStr'].includes(kind)) fail('numeric_card_precision_unsafe');
      if (matrix.length && [5, 6].includes(col) && value && !['s', 'inlineStr'].includes(kind)) {
        if (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 36526 || Number(value) > 73415) fail('date_out_of_range');
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(value) * 86400) * 1000), iso = d.toISOString();
        value = col === 5 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso.slice(11, 19);
      }
      cells[col - 1] = value;
    }
    matrix.push(cells);
  }
  if (!matrix.length || matrix[0].some((h, i) => h.trim() !== CCS_HEADERS[i])) fail('schema_changed');
  return matrix;
}
