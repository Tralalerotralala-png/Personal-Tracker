// Copy this file to config.js and fill in your values.
// Leave config.js out entirely to run in local-only mode with sample data.
//
// Find both values in the Supabase dashboard: Project Settings -> API
// (the "anon" key, or the newer "publishable" key if that is what your
// dashboard shows). NEVER put the service_role / secret key in here.
export const CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-OR-PUBLISHABLE-KEY',

  // Keep true for your first sign-in (it creates your account). Then set it
  // to false AND turn off new signups in the Supabase dashboard.
  ALLOW_NEW_USER: true,

  // Optional Edge Functions are disabled by default. Set true ONLY after you
  // deploy and configure the corresponding function in your own Supabase project.
  ENABLE_AI_ICONS: false,
  ENABLE_FEED_PROXY: false,
};
