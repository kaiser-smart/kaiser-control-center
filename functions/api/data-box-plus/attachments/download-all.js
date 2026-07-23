import { json, readJson, requireUserPermission } from "../../../_lib/auth.js";
import {
  dataBoxPlusStoreErrorResponse,
  getDataBoxPlusAttachmentArchiveFiles
} from "../../../_lib/data-box-plus-store.js";

const encoder = new TextEncoder();
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function join(parts) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function zipFiles(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.fileName);
    const bytes = file.bytes;
    const checksum = crc32(bytes);
    const local = join([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(checksum), u32(bytes.byteLength), u32(bytes.byteLength),
      u16(name.byteLength), u16(0), name, bytes
    ]);
    localParts.push(local);
    centralParts.push(join([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(checksum), u32(bytes.byteLength), u32(bytes.byteLength),
      u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
    ]));
    offset += local.byteLength;
  }
  const central = join(centralParts);
  return join([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.byteLength), u32(offset), u16(0)
  ]);
}

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "data-box-plus", "view");
  if (response) return response;
  try {
    const payload = await readJson(request);
    const files = await getDataBoxPlusAttachmentArchiveFiles(env, payload.messageIds);
    return new Response(zipFiles(files), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="datove-zpravy-prilohy-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const result = dataBoxPlusStoreErrorResponse(error);
    return json(result.payload, result.status);
  }
}
