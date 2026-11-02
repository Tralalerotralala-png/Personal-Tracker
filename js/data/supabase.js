// Supabase glue: the "remote" used by sync.js, and sign-in helpers.
// No top-level network imports, so this file is safe to load anywhere.
import { TABLES, pickColumns } from './schema.js';

// Decide what a failed request means for the sync engine.
//   auth     -> sign in again
//   network  -> offline, or the project is paused/unreachable
//   rejected -> the server refused this data (constraint etc.); park the row
//   other    -> anything else
export function classifySupabaseError(e) {
  const status = e?.status ?? e?.statusCode;
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? e);
  if (code === 'AUTH' || status === 401 || status === 403 || code === 'PGRST301' || code === '42501' || /jwt/i.test(msg)) {
    return 'auth';
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg) || (status && status >= 500)) {
    return 'network';
  }
  if (/^2[23]/.test(code) || status === 400 || status === 409 || status === 422) return 'rejected';
  return 'other';
}

function wrap(error, status) {
  return Object.assign(new Error(error.message || 'Supabase request failed'), {
    code: error.code, status, details: error.details,
  });
}

export function createSupabaseRemote(client) {
  async function currentUserId() {
    const { data } = await client.auth.getSession();
    if (!data?.session) throw Object.assign(new Error('Not signed in'), { code: 'AUTH' });
    return data.session.user.id;
  }

  return {
    async pull(table, since, limit) {
      let q = client
        .from(table)
        .select('*')
        .order('synced_at', { ascending: true })
        .order(TABLES[table].pk, { ascending: true })
        .limit(limit);
      if (since) q = q.gte('synced_at', since);
      const { data, error, status } = await q;
      if (error) throw wrap(error, status);
      return data;
    },

    async push(table, rows) {
      const userId = await currentUserId();
      const payload = rows.map((r) => ({ ...pickColumns(table, r), user_id: userId }));
      const { error, status } = await client
        .from(table)
        .upsert(payload, { onConflict: TABLES[table].onConflict });
      if (error) throw wrap(error, status);
    },

    classifyError: classifySupabaseError,
  };
}

// Sign-in: a 6-digit code (works inside an installed phone app, where a
// magic link would open in the browser instead) or the link itself.
export function createAuth(client, { allowNewUser = true } = {}) {
  return {
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session;
    },
    async sendMagicLink(email, redirectTo) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: allowNewUser,
          emailRedirectTo: redirectTo ?? (globalThis.location ? location.origin + location.pathname : undefined),
        },
      });
      if (error) throw error;
    },
    async verifyCode(email, token) {
      const { data, error } = await client.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
      if (error) throw error;
      return data.session;
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((event, session) => cb(event, session));
      return () => data.subscription.unsubscribe();
    },
    async signOut() { await client.auth.signOut(); },
  };
}
