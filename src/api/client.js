const TOKEN_KEY = 'portfolio_admin_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore quota */ }
}

export function clearToken() { setToken(null); }

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

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),

  login:  (password) => request('POST', '/auth/login', { password }),
  me:     () => request('GET', '/auth/me'),
  list:   (c) => request('GET', `/${c}`),
  create: (c, body) => request('POST', `/${c}`, body),
  update: (c, id, body) => request('PUT', `/${c}/${id}`, body),
  remove: (c, id) => request('DELETE', `/${c}/${id}`),
  reorder:(c, order) => request('POST', `/${c}/reorder`, { order }),
};
