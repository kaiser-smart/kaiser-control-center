import assert from 'node:assert/strict';
import { ACTIONS, hasPermission } from '../src/permissions.js';
import { collectionRoutesDriverKioskRedirectPath } from '../src/data/collectionRoutesDriverKiosk.js';
import { normalizeAiRoute } from '../src/elevenLabsClientTools.js';

for (const role of ['admin', 'management', 'kancelar', 'garazmistr', 'dispecer', 'ridic', 'readonly']) {
  for (const overrides of [{}, {active:false}, {deniedModules:['absence']}, {modules:['fleet']}, {modules:['absence']}, {permissions:[{moduleId:'absence',action:'view',allowed:false}]}]) {
    const user = {id:'test', role, status:'active', ...overrides};
    for (const action of ACTIONS) {
      assert.equal(hasPermission(user,'employees',action), hasPermission(user,'absence',action), `${role}: ${action} must retain the existing HR permission`);
    }
  }
}
const driver = {id:'test', role:'ridic', active:true};
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, '/zamestnanci'), '');
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, '/zamestnanci/test'), '');
assert.equal(collectionRoutesDriverKioskRedirectPath(driver, '/nastaveni'), '/trasy-svozu');
assert.equal(normalizeAiRoute('zamestnanci'), '/zamestnanci');
console.log('Employee module permissions, driver navigation and assistant routes passed.');
