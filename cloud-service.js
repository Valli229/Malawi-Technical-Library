import { auth } from './auth.js';
import { firebaseConfig } from './firebase-config.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BUCKET } from './supabase-config.js';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/default/documents`;

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_BUCKET) {
    throw new Error('Supabase is not configured in supabase-config.js.');
  }
}

function safePathPart(value) {
  return String(value || 'file')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra
  };
}

async function readError(response, fallback) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.error?.message || data?.message || data?.error || data?.error_description || '';
  } catch {
    detail = await response.text().catch(() => '');
  }
  throw new Error(detail || fallback);
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]);
}

async function firebaseToken(required = false) {
  const user = auth?.currentUser;
  if (!user) {
    if (required) throw new Error('Your login session is not ready. Refresh the page, log in again, and retry.');
    return '';
  }
  return withTimeout(
    user.getIdToken(),
    15000,
    'Firebase could not verify your login session. Check your internet connection and log in again.'
  );
}

async function firestoreRequest(url, options = {}, { requireAuth = false, timeout = 30000 } = {}) {
  const token = await firebaseToken(requireAuth);
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      await readError(response, 'Firestore rejected the request. Check your Firestore rules and login session.');
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Firestore did not respond within ${Math.round(timeout / 1000)} seconds. Check your internet connection.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined && typeof value !== 'function')
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

function fromFirestoreValue(value = {}) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function mapFirestoreDocument(document) {
  const name = document?.name || '';
  return {
    id: name.split('/').pop(),
    ...fromFirestoreFields(document?.fields || {})
  };
}

export function uploadResourceFile(file, userId, onProgress = () => {}) {
  requireSupabaseConfig();
  const unique = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const storagePath = `${safePathPart(userId || 'user')}/${unique}-${safePathPart(file.name)}`;
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${storagePath.split('/').map(encodeURIComponent).join('/')}`;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint, true);
    request.timeout = 90000;
    request.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    request.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('x-upsert', 'false');

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.max(1, Math.min(100, Math.round((event.loaded / event.total) * 100))));
      }
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(storagePath);
        return;
      }
      let message = 'The document could not be uploaded to cloud storage.';
      try {
        const data = JSON.parse(request.responseText || '{}');
        message = data.message || data.error || message;
      } catch {
        if (request.responseText) message = request.responseText;
      }
      reject(new Error(message));
    });

    request.addEventListener('error', () => reject(new Error(
      'The browser could not connect to Supabase Storage. Check your internet connection and try again.'
    )));
    request.addEventListener('timeout', () => reject(new Error(
      'The file upload timed out after 90 seconds. Check your connection or try a smaller file.'
    )));
    request.addEventListener('abort', () => reject(new Error('The file upload was cancelled.')));
    request.send(file);
  });
}

export async function createResource(resource, callbacks = {}) {
  const { file, ...metadata } = resource;
  callbacks.onStage?.('uploading');
  const storagePath = await uploadResourceFile(file, metadata.submittedByUid, callbacks.onProgress);
  const createdAtMs = Date.now();

  try {
    callbacks.onStage?.('saving');
    const data = await firestoreRequest(
      `${FIRESTORE_BASE}/resources`,
      {
        method: 'POST',
        body: JSON.stringify({
          fields: toFirestoreFields({
            ...metadata,
            storagePath,
            createdAtMs,
            createdAt: new Date(createdAtMs).toISOString()
          })
        })
      },
      { requireAuth: true, timeout: 30000 }
    );
    callbacks.onStage?.('complete');
    return mapFirestoreDocument(data);
  } catch (error) {
    throw new Error(`The file uploaded, but its library record could not be saved: ${error.message}`);
  }
}

async function runResourceQuery(structuredQuery, requireAuth = false) {
  const rows = await firestoreRequest(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/default/documents:runQuery`,
    {
      method: 'POST',
      body: JSON.stringify({ structuredQuery })
    },
    { requireAuth, timeout: 30000 }
  );
  return (rows || []).filter((row) => row.document).map((row) => mapFirestoreDocument(row.document));
}

function resourceQuery(where) {
  const query = {
    from: [{ collectionId: 'resources' }],
    limit: 500
  };
  if (where) query.where = where;
  return query;
}

function fieldEquals(fieldPath, value) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: 'EQUAL',
      value: toFirestoreValue(value)
    }
  };
}

export async function fetchResources({ isAdmin = false, userId = '' } = {}) {
  let resources = [];
  if (isAdmin) {
    resources = await runResourceQuery(resourceQuery(), true);
  } else {
    const approved = await runResourceQuery(resourceQuery(fieldEquals('status', 'approved')), false);
    if (!userId) return approved.sort(sortNewest);
    const mine = await runResourceQuery(resourceQuery(fieldEquals('submittedByUid', userId)), true);
    const merged = new Map();
    [...approved, ...mine].forEach((item) => merged.set(item.id, item));
    resources = [...merged.values()];
  }
  return resources.sort(sortNewest);
}

function sortNewest(a, b) {
  return Number(b.createdAtMs || Date.parse(b.createdAt) || 0) - Number(a.createdAtMs || Date.parse(a.createdAt) || 0);
}

export async function saveResource(resource) {
  const { id, createdAt, ...changes } = resource;
  if (!id) throw new Error('The resource ID is missing.');
  const fieldNames = Object.keys(changes).filter((key) => changes[key] !== undefined && typeof changes[key] !== 'function');
  const mask = fieldNames.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const data = await firestoreRequest(
    `${FIRESTORE_BASE}/resources/${encodeURIComponent(String(id))}${mask ? `?${mask}` : ''}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ fields: toFirestoreFields(changes) })
    },
    { requireAuth: true, timeout: 30000 }
  );
  return mapFirestoreDocument(data);
}

export async function removeResourceRecord(id) {
  if (!id) throw new Error('The resource ID is missing.');
  await firestoreRequest(
    `${FIRESTORE_BASE}/resources/${encodeURIComponent(String(id))}`,
    { method: 'DELETE' },
    { requireAuth: true, timeout: 30000 }
  );
}

export async function getSignedResourceUrl(storagePath, expiresIn = 900) {
  requireSupabaseConfig();
  if (!storagePath) throw new Error('This resource has no cloud file path.');
  const path = storagePath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(SUPABASE_BUCKET)}/${path}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn })
  });
  if (!response.ok) await readError(response, 'A temporary file link could not be created.');
  const data = await response.json();
  const signedPath = data.signedURL || data.signedUrl || data.signed_url;
  if (!signedPath) throw new Error('Supabase did not return a signed file link.');
  return signedPath.startsWith('http') ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`;
}
