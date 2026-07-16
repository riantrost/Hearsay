// config.js — cloud connection settings.
//
// Hearsay is local-first: with these left blank the app runs exactly as it always
// has — everything in IndexedDB, campaigns shared by export/import. Fill both values
// (from your Supabase project's API settings) to light up the sync layer: publishing a
// campaign to the cloud, joining by code, and live updates across the table.
//
// The publishable/anon key is DESIGNED to ship in client code — it grants nothing on
// its own. All access is enforced by row-level security in the database (see
// supabase/schema.sql), so a reader of this file can do only what a table member could.

export const SUPABASE_URL = '';         // e.g. 'https://abcdefgh.supabase.co'
export const SUPABASE_ANON_KEY = '';    // the project's "anon" / publishable key

export function cloudConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}
