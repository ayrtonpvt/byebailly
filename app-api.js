(() => {
  'use strict';

  const TOKEN_KEY = 'byebailly_auth_token';
  const USER_KEY = 'byebailly_auth_user';
  const SYNC_BASELINE_PREFIX = 'byebailly_sync_baseline_';
  const API_BASE = String(window.BYEBailly_API_BASE || '/api').replace(/\/$/, '');

  const readJson = (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const currentUser = () => readJson(USER_KEY, null);
  const baselineKey = () => `${SYNC_BASELINE_PREFIX}${currentUser()?.id || 'anonymous'}`;

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
    return body;
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function mergeMax(local, remote, path = '') {
    if (typeof local === 'number' || typeof remote === 'number') {
      const a = Number(local) || 0;
      const b = Number(remote) || 0;
      return Math.max(a, b);
    }
    if (!isPlainObject(local) && !isPlainObject(remote)) return local ?? remote;
    const out = {};
    for (const key of new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])) {
      if (key === 'updatedAt') {
        out[key] = [local?.[key], remote?.[key]].filter(Boolean).sort().at(-1) || null;
      } else if (key === 'schemaVersion') {
        out[key] = Math.max(Number(local?.[key]) || 1, Number(remote?.[key]) || 1);
      } else {
        out[key] = mergeMax(local?.[key], remote?.[key], `${path}.${key}`);
      }
    }
    return out;
  }

  function diffPositive(current, baseline) {
    if (typeof current === 'number') return Math.max(0, current - (Number(baseline) || 0));
    if (!isPlainObject(current)) return undefined;
    const out = {};
    for (const [key, value] of Object.entries(current)) {
      if (key === 'updatedAt' || key === 'schemaVersion' || key === 'streak' || key === 'streaks') continue;
      const delta = diffPositive(value, baseline?.[key]);
      if (typeof delta === 'number') {
        if (delta > 0) out[key] = delta;
      } else if (delta && Object.keys(delta).length) out[key] = delta;
    }
    return out;
  }

  function streakSnapshot(stats) {
    return {
      global: stats?.global?.streak || { actuel: 0, meilleur: 0 },
      streaks: stats?.streaks || {}
    };
  }

  async function login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    writeJson(USER_KEY, data.user);
    return data;
  }

  async function register(username, password) {
    const data = await request('/auth/register', {
      method: 'POST', body: JSON.stringify({ username, password })
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    writeJson(USER_KEY, data.user);
    return data;
  }

  async function logout() {
    try { if (token()) await request('/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function me() {
    if (!token()) return null;
    const data = await request('/me');
    writeJson(USER_KEY, data.user);
    return data;
  }

  async function syncNow({ force = false } = {}) {
    if (!token() || !navigator.onLine || !window.StatsStore) return null;
    const localStats = window.StatsStore.obtenir();
    const deviceId = window.StatsStore._deviceId;
    const baseline = readJson(baselineKey(), null);

    if (!baseline) {
      const remote = await me();
      const merged = mergeMax(localStats, remote.stats || {});
      window.StatsStore.sauvegarder(merged);
      writeJson(baselineKey(), merged);
      const importDelta = diffPositive(localStats, remote.stats || {});
      const hasDelta = importDelta && Object.keys(importDelta).length;
      if (hasDelta) {
        const synced = await request('/sync', {
          method: 'POST',
          body: JSON.stringify({ deviceId, delta: importDelta, streaks: streakSnapshot(localStats) })
        });
        const mergedAgain = mergeMax(window.StatsStore.obtenir(), synced.stats || {});
        window.StatsStore.sauvegarder(mergedAgain);
        writeJson(baselineKey(), mergedAgain);
        return synced;
      }
      return remote;
    }

    const delta = diffPositive(localStats, baseline);
    if (!force && (!delta || Object.keys(delta).length === 0)) return null;
    const data = await request('/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId, delta: delta || {}, streaks: streakSnapshot(localStats) })
    });
    const merged = mergeMax(localStats, data.stats || {});
    window.StatsStore.sauvegarder(merged);
    writeJson(baselineKey(), merged);
    return data;
  }

  let syncTimer = 0;
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => syncNow().catch(() => {}), 2500);
  }

  window.addEventListener('online', () => syncNow({ force: true }).catch(() => {}));
  window.ByeBaillyAPI = {
    API_BASE, request, token, currentUser, login, register, logout, me,
    syncNow, scheduleSync, mergeMax
  };
})();
