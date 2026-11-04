// 模擬 Firebase 匿名登入與 Firestore REST API（含 firestore.rules 的權限規則），測試用。
export function createFakeFirebase() {
  const docs = new Map();
  let users = 0;
  let clock = Date.parse('2026-11-04T00:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();
  const json = (status, body) => ({ status, body });
  const denied = () => json(403, { error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } });
  const uidOf = (headers) => {
    const auth = headers?.Authorization || headers?.authorization || '';
    const m = auth.match(/^Bearer tok-(.+)$/);
    return m ? m[1] : null;
  };

  function handle(method, url, headers, body) {
    const u = new URL(url);
    if (u.hostname === 'identitytoolkit.googleapis.com') {
      const uid = `user${++users}`;
      return json(200, { localId: uid, idToken: `tok-${uid}`, refreshToken: `ref-${uid}`, expiresIn: '3600' });
    }
    if (u.hostname === 'securetoken.googleapis.com') {
      const uid = new URLSearchParams(body).get('refresh_token').replace(/^ref-/, '');
      return json(200, { user_id: uid, id_token: `tok-${uid}`, refresh_token: `ref-${uid}`, expires_in: '3600' });
    }
    if (u.hostname !== 'firestore.googleapis.com') return json(404, {});
    const path = decodeURIComponent(u.pathname.split('/documents/')[1] || '');
    const uid = uidOf(headers);
    const data = body ? JSON.parse(body) : null;
    if (method === 'POST' && path === 'shares') {
      const id = u.searchParams.get('documentId');
      if (!uid || data.fields.owner.stringValue !== uid) return denied();
      if (docs.has(id)) return json(409, { error: { code: 409, status: 'ALREADY_EXISTS', message: 'exists' } });
      const doc = { name: `shares/${id}`, fields: data.fields, updateTime: tick() };
      docs.set(id, doc);
      return json(200, doc);
    }
    const id = path.replace(/^shares\//, '');
    const doc = docs.get(id);
    if (method === 'GET') return doc ? json(200, doc) : json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'not found' } });
    if (!doc) return json(404, { error: { code: 404, status: 'NOT_FOUND', message: 'not found' } });
    if (!uid || doc.fields.owner.stringValue !== uid) return denied();
    if (method === 'PATCH') {
      if (data.fields.owner.stringValue !== uid) return denied();
      const next = { ...doc, fields: { ...doc.fields, ...data.fields }, updateTime: tick() };
      docs.set(id, next);
      return json(200, next);
    }
    if (method === 'DELETE') {
      docs.delete(id);
      return json(200, {});
    }
    return json(400, {});
  }

  return {
    docs,
    handle,
    /** 給 globalThis.fetch 用 */
    fetch: async (url, { method = 'GET', headers = {}, body } = {}) => {
      const { status, body: out } = handle(method, url, headers, body);
      return { ok: status >= 200 && status < 300, status, json: async () => out };
    },
  };
}
