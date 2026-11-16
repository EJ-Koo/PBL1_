export type UserSession = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string | null;
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, message = '로그인이 만료됐어요. 다시 로그인해주세요.') {
    super(message);
    this.status = status;
  }
}

type Storage = { getItem: () => Promise<string | null>; setItem: (value: string) => Promise<void>; removeItem: () => Promise<void> };
type Snapshot = { session: UserSession | null; ready: boolean };
const EMPTY: Snapshot = { session: null, ready: false };

export function parseSession(raw: string | null): UserSession | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || !['access_token', 'refresh_token', 'user_id'].every(key => typeof value[key] === 'string' && value[key].length > 0)) return null;
    return { access_token: value.access_token, refresh_token: value.refresh_token, user_id: value.user_id,
      email: typeof value.email === 'string' ? value.email : null };
  } catch { return null; }
}

// Only a scheduling hint. The server verifies authenticity and permissions.
export function tokenExpiresSoon(token: string, now = Date.now()): boolean {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(body));
    return typeof exp !== 'number' || exp * 1000 <= now + 60_000;
  } catch { return true; }
}

export function createSessionManager(options: {
  storage: Storage;
  refresh: (token: string) => Promise<Omit<UserSession, 'email'>>;
  validate: (session: UserSession) => Promise<void>;
}) {
  let snapshot = EMPTY;
  let revision = 0;
  let issued = new Set<string>();
  let restoring: Promise<void> | undefined;
  let refreshing: { revision: number; promise: Promise<UserSession | null> } | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = (session: UserSession | null) => {
    snapshot = { session, ready: true };
    listeners.forEach(listener => listener());
  };
  const persist = (session: UserSession | null) => {
    // Serialize writes so a slow login save cannot undo a later logout.
    writes = writes.catch(() => {}).then(() => session
      ? options.storage.setItem(JSON.stringify(session)) : options.storage.removeItem());
    return writes;
  };
  const clear = () => {
    revision++;
    issued = new Set();
    emit(null);
    void persist(null).catch(() => {});
  };
  const establish = async (session: UserSession) => {
    const ticket = ++revision;
    issued = new Set([session.access_token]);
    try { await persist(session); }
    catch {
      if (ticket === revision) clear();
      throw new Error('로그인 정보를 기기에 저장하지 못했어요. 저장소 접근을 확인해주세요.');
    }
    if (ticket === revision) emit(session);
  };
  const refresh = (): Promise<UserSession | null> => {
    if (!snapshot.session) return Promise.resolve(null);
    if (refreshing?.revision === revision) return refreshing.promise;
    const ticket = revision;
    const before = snapshot.session;
    const promise = (async () => {
      try {
        const tokens = await options.refresh(before.refresh_token);
        if (ticket !== revision) return null;
        if (tokens.user_id !== before.user_id) throw new AuthError(401);
        const next = { ...tokens, email: before.email };
        issued.add(next.access_token);
        // Publish rotated credentials even if local persistence is unavailable.
        emit(next);
        await persist(next).catch(() => {});
        return ticket === revision ? next : null;
      } catch (error) {
        if (ticket === revision && error instanceof AuthError && error.status === 401) clear();
        throw error;
      } finally {
        if (refreshing?.revision === ticket) refreshing = undefined;
      }
    })();
    refreshing = { revision: ticket, promise };
    return promise;
  };
  const restore = () => restoring ??= (async () => {
    const ticket = revision;
    let stored: UserSession | null = null;
    try { stored = parseSession(await options.storage.getItem()); } catch { /* storage unavailable */ }
    if (ticket !== revision) return;
    if (!stored) { clear(); return; }
    issued = new Set([stored.access_token]);
    // Stay in the restoring state until validation or refresh finishes.
    snapshot = { session: stored, ready: false };
    try {
      if (tokenExpiresSoon(stored.access_token)) await refresh();
      else {
        try { await options.validate(stored); }
        catch (error) {
          if (!(error instanceof AuthError) || error.status !== 401) throw error;
          await refresh();
        }
      }
    } catch (error) {
      // Network/server failures do not discard a potentially valid login.
      if (error instanceof AuthError && error.status === 401) {
        if (ticket === revision) clear();
      }
    } finally {
      if (ticket === revision && snapshot.session) emit(snapshot.session);
    }
  })();
  const getToken = async (provided: string) => {
    if (!snapshot.session || !issued.has(provided)) throw new AuthError(401);
    const owner = snapshot.session.user_id;
    const ticket = revision;
    const current = tokenExpiresSoon(snapshot.session.access_token) ? await refresh() : snapshot.session;
    if (!current || ticket !== revision || current.user_id !== owner) throw new AuthError(401);
    return current.access_token;
  };
  return {
    getSnapshot: () => snapshot,
    getRevision: () => revision,
    getServerSnapshot: () => EMPTY,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore, establish, clear, refresh, getToken,
    async request(provided: string, send: (token: string) => Promise<Response>) {
      const ticket = revision;
      const token = await getToken(provided);
      if (ticket !== revision) throw new AuthError(401);
      let response = await send(token);
      if (response.status !== 401 || ticket !== revision) return response;
      // Another request may already have refreshed this same access token.
      const current = snapshot.session;
      const next = current?.access_token !== token ? current : await refresh();
      if (!next || ticket !== revision) throw new AuthError(401);
      response = await send(next.access_token);
      if (response.status === 401 && ticket === revision) clear();
      return response;
    },
  };
}
