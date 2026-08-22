(() => {
  'use strict';

  const ACCOUNT_STATS_KEY = 'byebailly_account_stats';
  const SYNC_STATE_KEY = 'byebailly_sync_state';
  const SYNC_DELAY_MS = 25000;

  let syncTimer = null;
  let inFlight = null;

  function currentUser() {
    return window.ByeBaillyAuth?.getCachedUser?.() || null;
  }

  function isReady() {
    return Boolean(
      window.ByeBaillyAuth?.isLoggedIn?.() &&
      window.ByeBaillyAuth?.request &&
      window.StatsStore
    );
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Synchronisation : cache local indisponible.', error);
      return false;
    }
  }

  function clearAccountCache() {
    try {
      localStorage.removeItem(ACCOUNT_STATS_KEY);
      localStorage.removeItem(SYNC_STATE_KEY);
    } catch {
      // Aucun impact sur le jeu si le stockage local est indisponible.
    }
  }

  function getCachedAccountStats(userId = currentUser()?.id) {
    const cache = readJson(ACCOUNT_STATS_KEY);
    if (!cache || userId == null || String(cache.userId) !== String(userId)) {
      return null;
    }

    return window.StatsStore?.normaliser
      ? window.StatsStore.normaliser(cache.stats)
      : cache.stats;
  }

  function saveAccountStats(user, stats, deviceCount = null) {
    if (!user || user.id == null || !stats) return null;

    const normalised = window.StatsStore?.normaliser
      ? window.StatsStore.normaliser(stats)
      : stats;

    writeJson(ACCOUNT_STATS_KEY, {
      userId: user.id,
      username: user.username,
      fetchedAt: new Date().toISOString(),
      deviceCount,
      stats: normalised,
    });

    window.dispatchEvent(new CustomEvent('byebailly:account-stats-updated', {
      detail: {
        userId: user.id,
        stats: normalised,
        deviceCount,
      }
    }));

    return normalised;
  }

  function readSyncState() {
    return readJson(SYNC_STATE_KEY) || {};
  }

  function saveSyncState(userId, deviceId, statsUpdatedAt) {
    writeJson(SYNC_STATE_KEY, {
      userId,
      deviceId,
      statsUpdatedAt: statsUpdatedAt || null,
      syncedAt: new Date().toISOString(),
    });
  }

  function shouldUpload(user, deviceId, stats, forceUpload) {
    if (forceUpload) return true;

    const state = readSyncState();
    return !(
      String(state.userId) === String(user.id) &&
      state.deviceId === deviceId &&
      (state.statsUpdatedAt || null) === (stats.updatedAt || null)
    );
  }

  async function doSync({ forceUpload = false } = {}) {
    if (!isReady()) return null;
    if (navigator.onLine === false) return getCachedAccountStats();

    const user = currentUser();
    if (!user || user.id == null) return null;

    const deviceId = window.StatsStore.obtenirDeviceId();
    const localStats = window.StatsStore.normaliser(window.StatsStore.obtenir());

    try {
      if (shouldUpload(user, deviceId, localStats, forceUpload)) {
        await window.ByeBaillyAuth.request('/stats/me', {
          method: 'PUT',
          body: JSON.stringify({
            deviceId,
            stats: localStats,
          }),
        });

        saveSyncState(user.id, deviceId, localStats.updatedAt);
      }

      const response = await window.ByeBaillyAuth.request('/stats/me');
      if (!response?.stats || !response?.user) return getCachedAccountStats(user.id);

      return saveAccountStats(
        response.user,
        response.stats,
        response.deviceCount ?? null
      );
    } catch (error) {
      // Une panne de synchronisation ne doit jamais interrompre le jeu.
      if (error.status === 401) {
        try {
          await window.ByeBaillyAuth.getCurrentUser();
        } catch {
          // getCurrentUser gère déjà le cas hors connexion.
        }
      } else if (error.code !== 'NETWORK_ERROR') {
        console.warn('Synchronisation des statistiques impossible :', error);
      }

      return getCachedAccountStats(user.id);
    }
  }

  function syncNow(options = {}) {
    if (inFlight) return inFlight;

    clearTimeout(syncTimer);
    syncTimer = null;

    inFlight = doSync(options).finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  function schedule(delay = SYNC_DELAY_MS) {
    if (!isReady()) return;

    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncNow().catch(() => {});
    }, Math.max(0, delay));
  }

  window.addEventListener('byebailly:stats-changed', () => {
    schedule();
  });

  window.addEventListener('byebailly:auth-changed', event => {
    const user = event.detail?.user || null;
    if (!user) {
      clearTimeout(syncTimer);
      syncTimer = null;
      clearAccountCache();
      return;
    }

    // Une connexion/création de compte rattache immédiatement les stats déjà locales.
    syncNow({ forceUpload: true }).catch(() => {});
  });

  window.addEventListener('online', () => {
    syncNow().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isReady()) {
      syncNow().catch(() => {});
    }
  });

  window.ByeBaillySync = Object.freeze({
    syncNow,
    schedule,
    getCachedAccountStats,
    clearAccountCache,
  });

  // Session persistante : actualise le compte peu après le chargement sans bloquer l'UI.
  if (isReady()) schedule(1500);
})();
