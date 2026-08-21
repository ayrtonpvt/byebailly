# Déploiement du backend ByeBailly

## 1. Prérequis

- Node.js 20 ou plus récent.
- Un disque persistant pour le fichier SQLite en production.

## 2. Lancement local

```bash
cd backend
npm install
npm start
```

Le serveur écoute par défaut sur `http://localhost:8787`.

## 3. Variables d'environnement

- `PORT` : port HTTP, défaut `8787`.
- `DB_PATH` : chemin du fichier SQLite, défaut `backend/byebailly.sqlite`.
- `CORS_ORIGIN` : origine autorisée pour le frontend. En production, indiquez l'origine exacte du site, par exemple `https://exemple.fr`.

## 4. Configuration du frontend

Dans `config.js`, définissez `window.BYEBailly_API_BASE` vers l'URL HTTPS du backend, avec `/api` à la fin.

Exemple :

```js
window.BYEBailly_API_BASE = 'https://api.exemple.fr/api';
```

Si frontend et backend sont servis sous le même domaine avec `/api` routé vers Node, laissez simplement `/api`.

## 5. Persistance

Le backend utilise SQLite et crée automatiquement les tables au premier lancement. En hébergement, placez `DB_PATH` sur un volume persistant ; sinon les comptes et statistiques disparaîtront lors d'un redéploiement.
