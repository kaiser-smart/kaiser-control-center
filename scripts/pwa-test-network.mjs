// Unit tests use in-memory mocks. Prevent an accidental real external request.
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
const denied=()=>{throw new Error("External network disabled by PWA test harness; use a mock");};
globalThis.fetch=async()=>denied();
for(const module of [http,https]) {
 for(const method of ["request","get"]) {
  const original=module[method];
  module[method]=function(first,...rest) {
   const host=typeof first==="string" || first instanceof URL ? new URL(first).hostname : first?.hostname || first?.host || "localhost";
   if(!["localhost","127.0.0.1","::1","[::1]"].includes(host)) denied();
   return original.call(this,first,...rest);
  };
 }
}

syncBuiltinESMExports();
