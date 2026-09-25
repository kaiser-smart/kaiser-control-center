import { requireValue } from './errors.mjs';
import { providerDiagnostic } from './diagnostics.mjs';

const bounded = items => {
  requireValue(Array.isArray(items) && items.length <= 500, 'ADMIN_RESOURCE_LIMIT');
  return items;
};
const text = value => String(value ?? '').slice(0, 500);

// Collection metadata only. Never fetch messages, events or contacts from this admin route.
export async function readResources(m, ctx) {
  const read = async fn => {
    try { const items = await fn(); return { status: items.length ? 'available' : 'empty', items }; }
    catch (error) { return { status:'failed', items:[], diagnostic:providerDiagnostic(error) }; }
  };
  const [folders, calendars, addressBooks] = await Promise.all([
    read(async () => bounded((await ctx.providerFactory(ctx.env,m).listFolders()).folders).map(f => ({
      path:f.path, name:text(f.name || f.path), specialUse:text(f.specialUse), selectable:f.selectable !== false,
    }))),
    read(async () => bounded((await ctx.calendarFactory(ctx.env,m).calendars()).calendars).map(c => ({
      name:text(c.name), eventsSupported:c.components?.includes('VEVENT') === true,
    }))),
    read(async () => bounded((await ctx.contactFactory(ctx.env,m).addressBooks()).addressBooks).map(c => ({ name:text(c.name) }))),
  ]);
  return { mailboxId:m.id, revision:m.revision, checkedAt:Date.now(), folders, calendars, addressBooks };
}

export async function validateFolderChange(m, p, ctx) {
  const fields = [['drafts_folder','draftsFolder'],['sent_folder','sentFolder'],['trash_folder','trashFolder']];
  if (fields.every(([column,key]) => (m[column] ?? null) === p[key])) return;
  // New credentials must first be stored and verified separately from folder selection.
  requireValue(p.id && !p.password, 'FOLDER_RELOAD_REQUIRED');
  const folders = bounded((await ctx.providerFactory(ctx.env,m).listFolders()).folders);
  for (const [,key] of fields) if (p[key] !== null) {
    requireValue(folders.some(f => f.path === p[key] && f.selectable !== false), 'FOLDER_NOT_AVAILABLE');
  }
}
