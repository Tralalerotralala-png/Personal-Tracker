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

export function createSupabaseRemote(client, expectedUserId=null) {
  async function currentUserId() {
    const { data } = await client.auth.getSession();
    if (!data?.session) throw Object.assign(new Error('Not signed in'), { code: 'AUTH' });
    const uid=data.session.user.id;
    if(expectedUserId&&uid!==expectedUserId)throw Object.assign(new Error('Account changed'),{code:'AUTH'});
    return uid;
  }

  return {
    async pull(table, since, limit, offset = 0) {
      const uid=await currentUserId();
      let q = client
        .from(table)
        .select('*')
        .eq('user_id',uid)
        .order('synced_at', { ascending: true })
        .order(TABLES[table].pk, { ascending: true });
      // Keep the same lower bound for every page. Advancing a timestamp-only
      // cursor between pages can skip records when many share a timestamp.
      if (since) q = q.gte('synced_at', since);
      const { data, error, status } = await q.range(offset, offset + limit - 1);
      if (error) throw wrap(error, status);
      await currentUserId();
      if(data.some(r=>r.user_id!==uid))throw Object.assign(new Error('Unexpected row owner'),{code:'AUTH'});
      return data;
    },

    async push(table, rows) {
      const userId = await currentUserId();
      const payload = rows.map((r) => ({ ...pickColumns(table, r), user_id: userId }));
      // Postgres's last-write-wins trigger may silently decline an older edit.
      // Request the persisted values to detect and preserve the losing copy.
      const { data, error, status } = await client
        .from(table)
        .upsert(payload, { onConflict: TABLES[table].onConflict })
        .select(TABLES[table].pk+',updated_at');
      if (error) throw wrap(error, status);
      await currentUserId();
      const server=new Map((data||[]).map(r=>[String(r[TABLES[table].pk]),r]));
      const conflicts=rows.filter(row=>{
        const returned=server.get(String(row[TABLES[table].pk]));
        return !returned || Date.parse(returned.updated_at)>Date.parse(row.updated_at)+1;
      }).map(row=>String(row[TABLES[table].pk]));
      return {conflicts};
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
