(() => {
  'use strict';

  let authMode = 'login';
  let profileUser = null;
  let profileStats = window.StatsStore?.obtenir?.() || null;

  function parseServerDate(value) {
    if (!value) return null;
    const raw = String(value);
    const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.includes('Z') ? '' : 'Z'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function statsPourProfil(user) {
    if (user) {
      const accountStats = window.ByeBaillySync?.getCachedAccountStats?.(user.id);
      if (accountStats) return accountStats;

      // Tant qu'aucune vue agrégée n'a été reçue, afficher uniquement la
      // contribution locale de CE compte. Ne jamais réutiliser le total local
      // de l'appareil, qui peut contenir l'activité d'un autre compte.
      const localUserStats = window.ByeBaillySync?.getLocalUserStats?.(user.id);
      if (localUserStats) return localUserStats;
    }
    return window.StatsStore?.obtenir?.() || null;
  }

  function afficherStatsProfil() {
    profileStats = statsPourProfil(profileUser);
    afficherStatistiques(profileStats);
  }

  function mettreAJourProfil(user) {
    profileUser = user || null;

    const name = document.getElementById('profileName');
    const meta = document.getElementById('profileMeta');
    const authButton = document.getElementById('profileAuthButton');
    const logoutButton = document.getElementById('profileLogoutButton');

    if (profileUser) {
      name.textContent = profileUser.username;
      const date = parseServerDate(profileUser.created_at);
      meta.textContent = date
        ? `Inscrit le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : '';
      authButton.hidden = true;
      logoutButton.hidden = false;
    } else {
      name.textContent = 'Profil local';
      meta.textContent = '';
      authButton.hidden = false;
      logoutButton.hidden = true;
    }

    afficherStatsProfil();
  }

  function definirModeAuth(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    document.querySelectorAll('#authModeControl [data-auth-mode]').forEach(button => {
      const active = button.dataset.authMode === authMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const submit = document.getElementById('authSubmitButton');
    const password = document.getElementById('authPassword');
    submit.textContent = authMode === 'register' ? 'Créer un compte' : 'Se connecter';
    password.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    afficherMessageAuth('');
  }

  function afficherMessageAuth(message, type = 'error') {
    const element = document.getElementById('authMessage');
    element.textContent = message || '';
    element.className = `auth-message${message ? ` is-${type}` : ''}`;
  }

  function ouvrirAuth() {
    definirModeAuth(authMode);
    const modal = document.getElementById('modalAuth');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('authUsername')?.focus());
  }

  function fermerAuth() {
    const modal = document.getElementById('modalAuth');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function synchroniserProfil({ forceUpload = false } = {}) {
    if (!profileUser || !window.ByeBaillySync) return;

    try {
      const stats = await window.ByeBaillySync.syncNow({ forceUpload });
      if (stats && profileUser) {
        profileStats = stats;
        afficherStatistiques(profileStats);
      }
    } catch (error) {
      // Le profil local/cache reste utilisable même si la synchronisation échoue.
      console.warn('Synchronisation du profil indisponible :', error);
    }
  }

  async function verifierSession() {
    const cached = window.ByeBaillyAuth?.getCachedUser?.() || null;
    mettreAJourProfil(cached);

    if (!window.ByeBaillyAuth?.isLoggedIn?.()) return;

    try {
      const user = await window.ByeBaillyAuth.getCurrentUser();
      mettreAJourProfil(user);
      if (user) synchroniserProfil();
    } catch (error) {
      console.warn('Vérification de session indisponible :', error);
    }
  }

  document.querySelectorAll('#statsViewControl button').forEach(button => {
    button.addEventListener('click', () => {
      currentStatsView = button.dataset.view || 'global';
      afficherStatistiques(profileStats);
    });
  });

  document.getElementById('profileAuthButton').addEventListener('click', ouvrirAuth);
  document.getElementById('btnCloseAuth').addEventListener('click', fermerAuth);

  document.querySelectorAll('#authModeControl [data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => definirModeAuth(button.dataset.authMode));
  });

  document.getElementById('authForm').addEventListener('submit', async event => {
    event.preventDefault();

    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const submit = document.getElementById('authSubmitButton');

    afficherMessageAuth('');
    submit.disabled = true;
    submit.textContent = authMode === 'register' ? 'Création…' : 'Connexion…';

    try {
      const user = authMode === 'register'
        ? await window.ByeBaillyAuth.register(username, password)
        : await window.ByeBaillyAuth.login(username, password);

      document.getElementById('authPassword').value = '';
      mettreAJourProfil(user);
      fermerAuth();
      synchroniserProfil({ forceUpload: true });
    } catch (error) {
      afficherMessageAuth(
        error.code === 'NETWORK_ERROR'
          ? 'Connexion au serveur impossible. Les statistiques locales restent disponibles.'
          : error.message || 'Authentification impossible.'
      );
    } finally {
      submit.disabled = false;
      submit.textContent = authMode === 'register' ? 'Créer un compte' : 'Se connecter';
    }
  });

  document.getElementById('profileLogoutButton').addEventListener('click', async () => {
    const button = document.getElementById('profileLogoutButton');
    button.disabled = true;
    button.textContent = 'Déconnexion…';
    try {
      await window.ByeBaillyAuth.logout();
      mettreAJourProfil(null);
      definirModeAuth('login');
    } finally {
      button.disabled = false;
      button.textContent = 'Se déconnecter';
    }
  });

  document.getElementById('modalAuth').addEventListener('click', event => {
    if (event.target === event.currentTarget) fermerAuth();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modalAuth').classList.contains('active')) {
      fermerAuth();
    }
  });

  window.addEventListener('byebailly:account-stats-updated', event => {
    if (!profileUser) return;
    if (String(event.detail?.userId) !== String(profileUser.id)) return;
    profileStats = event.detail.stats;
    afficherStatistiques(profileStats);
  });

  window.addEventListener('byebailly:auth-changed', event => {
    mettreAJourProfil(event.detail?.user || null);
  });

  mettreAJourProfil(window.ByeBaillyAuth?.getCachedUser?.() || null);
  verifierSession();
})();
