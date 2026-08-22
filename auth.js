(() => {
  'use strict';

  const API_BASE = 'https://byebailly.ayrtonpavot.workers.dev';
  const TOKEN_KEY = 'byebailly_auth_token';
  const USER_KEY = 'byebailly_auth_user';

  function lireUtilisateurCache() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const user = raw ? JSON.parse(raw) : null;
      return user && typeof user.username === 'string' ? user : null;
    } catch {
      return null;
    }
  }

  function lireToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function sauvegarderSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function effacerSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function requete(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = options.auth === false ? '' : lireToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body,
      });
    } catch (error) {
      const networkError = new Error('Connexion au serveur impossible.');
      networkError.code = 'NETWORK_ERROR';
      networkError.cause = error;
      throw networkError;
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(data?.error || `Erreur HTTP ${response.status}.`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function register(username, password) {
    const data = await requete('/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    });

    sauvegarderSession(data.token, data.user);
    return data.user;
  }

  async function login(username, password) {
    const data = await requete('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    });

    sauvegarderSession(data.token, data.user);
    return data.user;
  }

  async function getCurrentUser({ verify = true } = {}) {
    const cached = lireUtilisateurCache();
    const token = lireToken();

    if (!token) return null;
    if (!verify) return cached;

    try {
      const data = await requete('/auth/me');
      if (data?.authenticated && data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return data.user;
      }
      effacerSession();
      return null;
    } catch (error) {
      if (error.status === 401) {
        effacerSession();
        return null;
      }
      // Hors connexion : on conserve la session locale et l'utilisateur mis en cache.
      if (error.code === 'NETWORK_ERROR') return cached;
      throw error;
    }
  }

  async function logout() {
    const token = lireToken();
    if (!token) {
      effacerSession();
      return;
    }

    try {
      await requete('/auth/logout', { method: 'POST' });
    } catch (error) {
      // La déconnexion locale reste toujours possible, même si l'API est indisponible.
      console.warn('Déconnexion serveur non confirmée :', error);
    } finally {
      effacerSession();
    }
  }

  window.ByeBaillyAuth = Object.freeze({
    register,
    login,
    logout,
    getCurrentUser,
    getCachedUser: lireUtilisateurCache,
    isLoggedIn: () => Boolean(lireToken()),
  });
})();
