import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Spawns a real server in a temp workdir and returns helpers to talk to it.
// One server per test file: cheap (~200 ms boot) and gives us full isolation
// (fresh DB, fresh rate-limiter counters, fresh in-memory state).
export async function bootServer({ port } = {}) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-test-'));
  const dbPath = path.join(workdir, 'data.sqlite');
  const uploadsDir = path.join(workdir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  // Pick a free port if not provided; using 0 doesn't help us here because we
  // also need the SPA-side base URL — so we just bind ephemeral high ports.
  const PORT = port ?? 4000 + Math.floor(Math.random() * 1000);

  const env = {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: dbPath,
    UPLOADS_DIR: uploadsDir,
    JWT_SECRET: 'test-secret-do-not-use-in-prod',
    ADMIN_EMAIL: 'admin@test.local',
    ADMIN_PASSWORD: 'adminpw1',
    MEMBER_EMAIL: 'member@test.local',
    MEMBER_PASSWORD: 'memberpw1',
    NODE_ENV: 'development',
  };

  const child = spawn(process.execPath, ['server/index.js'], {
    env,
    cwd: path.resolve(new URL('..', import.meta.url).pathname),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stderrChunks = [];
  child.stderr.on('data', (c) => stderrChunks.push(c));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(
        `server boot timeout. stderr:\n${Buffer.concat(stderrChunks).toString()}`,
      ));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(
        `server exited with code ${code}. stderr:\n${Buffer.concat(stderrChunks).toString()}`,
      ));
    });
  });

  const base = `http://127.0.0.1:${PORT}`;

  return {
    base,
    workdir,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((r) => child.on('exit', r));
      fs.rmSync(workdir, { recursive: true, force: true });
    },
  };
}

// Minimal cookie jar for fetch — Node's fetch does NOT auto-store Set-Cookie.
export class Jar {
  constructor() { this.cookies = new Map(); }
  ingest(res) {
    // Headers#getSetCookie returns each Set-Cookie individually (Node 19+).
    const headers = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of headers) {
      const [first] = sc.split(';');
      const eq = first.indexOf('=');
      if (eq < 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (value === '' || /Expires=Thu, 01 Jan 1970/.test(sc)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
  header() {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export function fetcher(base, jar = new Jar()) {
  async function call(method, path, { body, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    const cookie = jar.header();
    if (cookie) h.cookie = cookie;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      h['content-type'] = 'application/json';
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body && !(body instanceof FormData) && typeof body !== 'string'
        ? JSON.stringify(body)
        : body,
    });
    jar.ingest(res);
    if (raw) return res;
    const text = await res.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { /* not json */ } }
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    jar,
    get:    (p, opts) => call('GET',    p, opts),
    post:   (p, opts) => call('POST',   p, opts),
    put:    (p, opts) => call('PUT',    p, opts),
    delete: (p, opts) => call('DELETE', p, opts),
  };
}
