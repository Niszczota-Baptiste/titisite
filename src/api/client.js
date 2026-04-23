const TOKEN_KEY = 'portfolio_admin_token';
const USER_KEY = 'portfolio_current_user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}
export function clearSession() {
  setToken(null);
  setStoredUser(null);
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function uploadFile(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error(data?.error || `HTTP ${xhr.status}`);
        err.status = xhr.status;
        err.body = data;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network_error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(formData);
  });
}

export async function triggerDownload(url, suggestedName) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken() || ''}` },
  });
  if (!res.ok) throw new Error('download_failed');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = suggestedName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export const api = {
  get:  (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put:  (path, body) => request('PUT', path, body),
  del:  (path) => request('DELETE', path),

  login: async (email, password) => {
    const out = await request('POST', '/auth/login', { email, password });
    if (out?.token) { setToken(out.token); setStoredUser(out.user); }
    return out;
  },
  me: () => request('GET', '/auth/me'),

  // Public-site collections (admin-only writes)
  list:    (c) => request('GET', `/${c}`),
  create:  (c, body) => request('POST', `/${c}`, body),
  update:  (c, id, body) => request('PUT', `/${c}/${id}`, body),
  remove:  (c, id) => request('DELETE', `/${c}/${id}`),
  reorder: (c, order) => request('POST', `/${c}/reorder`, { order }),

  // Users
  users:      () => request('GET', '/users'),
  createUser: (body) => request('POST', '/users', body),
  updateUser: (id, body) => request('PUT', `/users/${id}`, body),
  deleteUser: (id) => request('DELETE', `/users/${id}`),

  // Workspaces (team projects)
  workspaces: {
    list:       () => request('GET', '/workspaces'),
    get:        (slug) => request('GET', `/workspaces/${slug}`),
    create:     (body) => request('POST', '/workspaces', body),
    update:     (id, body) => request('PUT', `/workspaces/${id}`, body),
    remove:     (id) => request('DELETE', `/workspaces/${id}`),
    setMembers: (id, memberIds) => request('PUT', `/workspaces/${id}/members`, { memberIds }),
  },

  // Scoped per-workspace resources
  ws: (slug) => ({
    base: `/workspaces/${slug}`,
    features: {
      list:   () => request('GET', `/workspaces/${slug}/features`),
      create: (b) => request('POST', `/workspaces/${slug}/features`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/features/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/features/${id}`),
    },
    meetings: {
      list:   () => request('GET', `/workspaces/${slug}/meetings`),
      create: (b) => request('POST', `/workspaces/${slug}/meetings`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/meetings/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/meetings/${id}`),
    },
    documents: {
      list:   () => request('GET', `/workspaces/${slug}/documents`),
      update: (id, b) => request('PUT', `/workspaces/${slug}/documents/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/documents/${id}`),
      uploadPath: `/workspaces/${slug}/documents`,
      downloadUrl: (id) => `/api/workspaces/${slug}/documents/${id}/download`,
    },
    builds: {
      list:   () => request('GET', `/workspaces/${slug}/builds`),
      create: (b) => request('POST', `/workspaces/${slug}/builds`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/builds/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/builds/${id}`),
      uploadPath: `/workspaces/${slug}/builds`,
      downloadUrl: (id) => `/api/workspaces/${slug}/builds/${id}/download`,
    },
  }),

  // Global
  events:   (params = {}) => {
    const q = new URLSearchParams();
    if (params.from !== undefined) q.set('from', params.from);
    if (params.to !== undefined) q.set('to', params.to);
    const s = q.toString();
    return request('GET', `/me/events${s ? `?${s}` : ''}`);
  },
  comments: (targetType, targetId = 0) =>
    request('GET', `/comments?target_type=${targetType}&target_id=${targetId}`),
  addComment:    (targetType, targetId, body) =>
    request('POST', '/comments', { targetType, targetId, body }),
  deleteComment: (id) => request('DELETE', `/comments/${id}`),
};
