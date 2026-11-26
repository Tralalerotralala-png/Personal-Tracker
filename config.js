// Public, credential-free defaults. Local-only IndexedDB mode works out of the box.
// For cloud sync, configure Settings -> Account and sync in the browser,
// or copy this file to the git-ignored config.local.js for local development.
// Use only a project publishable/anon key, never a secret or service-role key.
// Enable ALLOW_NEW_USER only for initial setup, then disable it and backend signups.
export const CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-OR-PUBLISHABLE-KEY',
  ALLOW_NEW_USER: false,
  ENABLE_AI_ICONS: false,
  ENABLE_FEED_PROXY: false,
};
