const TOKEN_KEY = 'portfolio_admin_token';
const USER_KEY = 'portfolio_current_user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore quota */ }
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* ignore quota */ }
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

/**
 * Upload with optional progress callback. Uses XHR because fetch has no
 * upload-progress in the browser yet.
 */
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
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
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

export const api = {
  get:  (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put:  (path, body) => request('PUT', path, body),
  del:  (path) => request('DELETE', path),

  login: async (email, password) => {
    const out = await request('POST', '/auth/login', { email, password });
    if (out?.token) {
      setToken(out.token);
      setStoredUser(out.user);
    }
    return out;
  },
  me: () => request('GET', '/auth/me'),

  // Generic public collections (admin-only writes)
  list:    (c) => request('GET', `/${c}`),
  create:  (c, body) => request('POST', `/${c}`, body),
  update:  (c, id, body) => request('PUT', `/${c}/${id}`, body),
  remove:  (c, id) => request('DELETE', `/${c}/${id}`),
  reorder: (c, order) => request('POST', `/${c}/reorder`, { order }),

  // Project workspace
  users:    () => request('GET', '/users'),
  createUser: (body) => request('POST', '/users', body),
  updateUser: (id, body) => request('PUT', `/users/${id}`, body),
  deleteUser: (id) => request('DELETE', `/users/${id}`),
  comments: (targetType, targetId = 0) =>
    request('GET', `/comments?target_type=${targetType}&target_id=${targetId}`),
  addComment:    (targetType, targetId, body) =>
    request('POST', '/comments', { targetType, targetId, body }),
  deleteComment: (id) => request('DELETE', `/comments/${id}`),
};

export function downloadUrl(kind, id) {
  const token = getToken() || '';
  // Browsers can't attach Authorization headers to regular anchor clicks, so
  // we trigger a programmatic fetch + blob-download from the caller side.
  return `/api/${kind}/${id}/download#token=${encodeURIComponent(token)}`;
}

export async function triggerDownload(kind, id, suggestedName) {
  const res = await fetch(`/api/${kind}/${id}/download`, {
    headers: { Authorization: `Bearer ${getToken() || ''}` },
  });
  if (!res.ok) throw new Error('download_failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
