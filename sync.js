(() => {
  'use strict';

  const LEGACY_ACCOUNT_STATS_KEY = 'byebailly_account_stats';
  const LEGACY_SYNC_STATE_KEY = 'byebailly_sync_state';

  const ACCOUNT_CACHE_PREFIX = 'byebailly_account_stats_v2:';
  const USER_DEVICE_STATS_PREFIX = 'byebailly_user_device_stats_v1:';
  const USER_SYNC_STATE_PREFIX = 'byebailly_sync_state_v2:';
  const GUEST_STATS_KEY = 'byebailly_guest_stats_v1';
  const PARTITION_MIGRATION_KEY = 'byebailly_stats_partition_v1';

  const SYNC_DELAY_MS = 25000;

  let syncTimer = null;
  const inFlightByUser = new Map();

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

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Aucun impact sur le jeu si le stockage local est indisponible.
    }
  }

  function normaliser(stats) {
    return window.StatsStore?.normaliser
      ? window.StatsStore.normaliser(stats)
      : stats;
  }

  function statsVides() {
    return window.StatsStore?.creerVides
      ? window.StatsStore.creerVides()
      : normaliser({ schemaVersion: 1 });
  }

  function userKey(prefix, userId) {
    return `${prefix}${String(userId)}`;
  }

  function accountCacheKey(userId) {
    return userKey(ACCOUNT_CACHE_PREFIX, userId);
  }

  function deviceStatsKey(userId) {
    return userKey(USER_DEVICE_STATS_PREFIX, userId);
  }

  function syncStateKey(userId) {
    return userKey(USER_SYNC_STATE_PREFIX, userId);
  }

  function hasStats(stats) {
    return Number(stats?.global?.tentatives || 0) > 0;
  }

  function latestIso(a, b) {
    const da = Date.parse(a || '') || 0;
    const db = Date.parse(b || '') || 0;
    if (!da && !db) return null;
    return da >= db ? a : b;
  }

  function ajouterCompteurs(destination, source) {
    const fields = ['points', 'pointsPossibles', 'tentatives', 'assistees'];
    for (const field of fields) {
      destination[field] = Number(destination[field] || 0) + Number(source?.[field] || 0);
    }

    for (const statut of Object.keys(destination.resultats || {})) {
      destination.resultats[statut] =
        Number(destination.resultats[statut] || 0) +
        Number(source?.resultats?.[statut] || 0);
    }
  }

  function fusionnerStatsSequentielles(baseSource, additionSource) {
    const base = normaliser(baseSource || statsVides());
    const addition = normaliser(additionSource || statsVides());
    const result = normaliser(base);

    ajouterCompteurs(result.global, addition.global);

    const additionADeLActivite = hasStats(addition);
    result.global.streak = {
      actuel: additionADeLActivite
        ? Number(addition.global?.streak?.actuel || 0)
        : Number(base.global?.streak?.actuel || 0),
      meilleur: Math.max(
        Number(base.global?.streak?.meilleur || 0),
        Number(addition.global?.streak?.meilleur || 0)
      )
    };

    for (const [categorie, modes] of Object.entries(result.parCategorie || {})) {
      for (const mode of Object.keys(modes)) {
        ajouterCompteurs(
          result.parCategorie[categorie][mode],
          addition.parCategorie?.[categorie]?.[mode]
        );
      }
    }

    for (const dimension of Object.keys(result.parDimension || {})) {
      const sourceDimension = addition.parDimension?.[dimension] || {};
      for (const [cle, compteur] of Object.entries(sourceDimension)) {
        if (!result.parDimension[dimension][cle]) {
          result.parDimension[dimension][cle] = normaliser({
            schemaVersion: 1,
            parDimension: { [dimension]: { [cle]: compteur } }
          }).parDimension[dimension][cle];
        } else {
          ajouterCompteurs(result.parDimension[dimension][cle], compteur);
        }
      }
    }

    for (const [jour, compteur] of Object.entries(addition.parJour || {})) {
      if (!result.parJour[jour]) {
        const temp = normaliser({
          schemaVersion: 1,
          parJour: { [jour]: compteur }
        });
        result.parJour[jour] = temp.parJour[jour];
      } else {
        ajouterCompteurs(result.parJour[jour], compteur);
      }
    }

    const jours = Object.keys(result.parJour).sort();
    if (jours.length > 90) {
      jours.slice(0, jours.length - 90).forEach(jour => delete result.parJour[jour]);
    }

    result.updatedAt = latestIso(base.updatedAt, addition.updatedAt);
    return normaliser(result);
  }

  function migrateLegacyPartitionIfNeeded() {
    if (readJson(PARTITION_MIGRATION_KEY)?.done) return;

    const localStats = normaliser(window.StatsStore?.obtenir?.() || statsVides());
    const legacyState = readJson(LEGACY_SYNC_STATE_KEY);
    const legacyCache = readJson(LEGACY_ACCOUNT_STATS_KEY);
    const cachedUser = currentUser();

    const priorUserId =
      legacyState?.userId ??
      legacyCache?.userId ??
      cachedUser?.id ??
      null;

    if (legacyCache?.userId != null && legacyCache?.stats) {
      writeJson(accountCacheKey(legacyCache.userId), {
        userId: legacyCache.userId,
        username: legacyCache.username || null,
        fetchedAt: legacyCache.fetchedAt || new Date().toISOString(),
        deviceCount: legacyCache.deviceCount ?? null,
        stats: normaliser(legacyCache.stats),
      });
    }

    if (priorUserId != null) {
      writeJson(deviceStatsKey(priorUserId), localStats);
      writeJson(GUEST_STATS_KEY, statsVides());
    } else {
      // Avant toute connexion, tout l'historique local est encore non attribué.
      writeJson(GUEST_STATS_KEY, localStats);
    }

    writeJson(PARTITION_MIGRATION_KEY, {
      done: true,
      migratedAt: new Date().toISOString(),
      priorUserId,
    });

    removeKey(LEGACY_ACCOUNT_STATS_KEY);
    removeKey(LEGACY_SYNC_STATE_KEY);
  }

  function getGuestStats() {
    migrateLegacyPartitionIfNeeded();
    return normaliser(readJson(GUEST_STATS_KEY) || statsVides());
  }

  function saveGuestStats(stats) {
    return writeJson(GUEST_STATS_KEY, normaliser(stats));
  }

  function getLocalUserStats(userId) {
    if (userId == null) return null;
    migrateLegacyPartitionIfNeeded();
    return normaliser(readJson(deviceStatsKey(userId)) || statsVides());
  }

  function saveLocalUserStats(userId, stats) {
    if (userId == null) return false;
    return writeJson(deviceStatsKey(userId), normaliser(stats));
  }

  function claimGuestStats(user) {
    if (!user || user.id == null) return null;
    migrateLegacyPartitionIfNeeded();

    const guest = getGuestStats();
    let owned = getLocalUserStats(user.id);

    if (hasStats(guest)) {
      owned = fusionnerStatsSequentielles(owned, guest);
      saveLocalUserStats(user.id, owned);
      saveGuestStats(statsVides());
    }

    return owned;
  }

  function getCachedAccountStats(userId = currentUser()?.id) {
    if (userId == null) return null;
    const cache = readJson(accountCacheKey(userId));
    if (!cache || String(cache.userId) !== String(userId)) return null;
    return normaliser(cache.stats);
  }

  function saveAccountStats(user, stats, deviceCount = null) {
    if (!user || user.id == null || !stats) return null;

    const normalised = normaliser(stats);

    writeJson(accountCacheKey(user.id), {
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

  function clearAccountCache(userId = null) {
    if (userId != null) {
      removeKey(accountCacheKey(userId));
      removeKey(syncStateKey(userId));
      return;
    }

    // Les nouveaux caches étant isolés par utilisateur, on ne les efface pas à la
    // déconnexion : ils restent utiles hors ligne et ne peuvent pas contaminer un autre compte.
    removeKey(LEGACY_ACCOUNT_STATS_KEY);
    removeKey(LEGACY_SYNC_STATE_KEY);
  }

  function readSyncState(userId) {
    return readJson(syncStateKey(userId)) || {};
  }

  function saveSyncState(userId, deviceId, statsUpdatedAt) {
    writeJson(syncStateKey(userId), {
      userId,
      deviceId,
      statsUpdatedAt: statsUpdatedAt || null,
      syncedAt: new Date().toISOString(),
    });
  }

  function shouldUpload(user, deviceId, stats, forceUpload) {
    if (forceUpload) return true;

    const state = readSyncState(user.id);
    return !(
      String(state.userId) === String(user.id) &&
      state.deviceId === deviceId &&
      (state.statsUpdatedAt || null) === (stats.updatedAt || null)
    );
  }

  function sameCurrentUser(userId) {
    const user = currentUser();
    return user && String(user.id) === String(userId);
  }

  async function doSync(user, { forceUpload = false } = {}) {
    if (!user || user.id == null) return null;
    if (!isReady() || !sameCurrentUser(user.id)) return getCachedAccountStats(user.id);
    if (navigator.onLine === false) {
      return getCachedAccountStats(user.id) || getLocalUserStats(user.id);
    }

    const deviceId = window.StatsStore.obtenirDeviceId();
    const localStats = claimGuestStats(user) || getLocalUserStats(user.id);

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

      // Le compte peut avoir changé pendant le PUT ; ne mélangeons jamais deux sessions.
      if (!sameCurrentUser(user.id)) return getCachedAccountStats(user.id);

      const response = await window.ByeBaillyAuth.request('/stats/me');
      if (!response?.stats || !response?.user) {
        return getCachedAccountStats(user.id) || getLocalUserStats(user.id);
      }

      if (String(response.user.id) !== String(user.id)) {
        return getCachedAccountStats(user.id) || getLocalUserStats(user.id);
      }

      return saveAccountStats(
        response.user,
        response.stats,
        response.deviceCount ?? null
      );
    } catch (error) {
      // Une panne de synchronisation ne doit jamais interrompre le jeu.
      if (error.status === 401 && sameCurrentUser(user.id)) {
        try {
          await window.ByeBaillyAuth.getCurrentUser();
        } catch {
          // getCurrentUser gère déjà le cas hors connexion.
        }
      } else if (error.code !== 'NETWORK_ERROR') {
        console.warn('Synchronisation des statistiques impossible :', error);
      }

      return getCachedAccountStats(user.id) || getLocalUserStats(user.id);
    }
  }

  function syncNow(options = {}) {
    const user = currentUser();
    if (!user || user.id == null || !isReady()) return Promise.resolve(null);

    const userId = String(user.id);
    if (inFlightByUser.has(userId)) return inFlightByUser.get(userId);

    clearTimeout(syncTimer);
    syncTimer = null;

    const promise = doSync(user, options).finally(() => {
      if (inFlightByUser.get(userId) === promise) {
        inFlightByUser.delete(userId);
      }
    });

    inFlightByUser.set(userId, promise);
    return promise;
  }

  function schedule(delay = SYNC_DELAY_MS) {
    if (!isReady()) return;

    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncNow().catch(() => {});
    }, Math.max(0, delay));
  }

  function recordEventForCurrentIdentity(evenement) {
    if (!evenement || !window.StatsStore?.appliquerEvenement) return;

    migrateLegacyPartitionIfNeeded();
    const user = currentUser();

    if (user?.id != null && window.ByeBaillyAuth?.isLoggedIn?.()) {
      const owned = getLocalUserStats(user.id);
      const next = window.StatsStore.appliquerEvenement(owned, evenement).stats;
      saveLocalUserStats(user.id, next);
      return;
    }

    const guest = getGuestStats();
    const next = window.StatsStore.appliquerEvenement(guest, evenement).stats;
    saveGuestStats(next);
  }

  window.addEventListener('byebailly:stats-changed', event => {
    recordEventForCurrentIdentity(event.detail?.evenement);
    schedule();
  });

  window.addEventListener('byebailly:auth-changed', event => {
    const user = event.detail?.user || null;

    clearTimeout(syncTimer);
    syncTimer = null;

    if (!user) return;

    // Les éventuelles statistiques anonymes non attribuées sont revendiquées une
    // seule fois par le compte qui se connecte ensuite, jamais par tous les comptes.
    claimGuestStats(user);
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

  migrateLegacyPartitionIfNeeded();

  window.ByeBaillySync = Object.freeze({
    syncNow,
    schedule,
    getCachedAccountStats,
    getLocalUserStats,
    clearAccountCache,
  });

  // Session persistante : actualise le compte peu après le chargement sans bloquer l'UI.
  if (isReady()) schedule(1500);
})();
