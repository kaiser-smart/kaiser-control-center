import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CI runs the setup approval test and reacts to setup UI changes',()=>{
  const ci=readFileSync(new URL('../../../.github/workflows/forpsi-connector.yml',import.meta.url),'utf8');
  assert.match(ci,/node --test[^\n]*scripts\/forpsi-(?:setup|\*)\.test\.mjs/);
  assert.match(ci,/public\/forpsi-setup\/\*\*/);
  assert.match(ci,/scripts\/forpsi-setup\.test\.mjs/);
  assert.match(ci,/permissions:\s*\n\s*contents: read/);
});
