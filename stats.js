// Stockage et rendu statistique partagés entre le jeu et la page Profil.
const STATS_STORAGE_KEY = 'byebailly_stats';
const DEVICE_STORAGE_KEY = 'byebailly_device_id';
const STATS_SCHEMA_VERSION = 1;
const STATS_HISTORY_DAYS = 90;

function arrondirDixieme(valeur) {
  return Math.round((Number(valeur) + Number.EPSILON) * 10) / 10;
}

function creerCompteurStats() {
  return {
    points: 0,
    pointsPossibles: 0,
    tentatives: 0,
    assistees: 0,
    resultats: {
      exact: 0,
      orthographe: 0,
      partiel: 0,
      incorrect: 0,
      revelee: 0
    }
  };
}

function creerStatsVides() {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    updatedAt: null,
    global: {
      ...creerCompteurStats(),
      streak: { actuel: 0, meilleur: 0 }
    },
    parCategorie: {
      declinaison: {
        analyse: creerCompteurStats(),
        production: creerCompteurStats()
      },
      conjugaison: {
        analyse: creerCompteurStats(),
        production: creerCompteurStats()
      },
      version: {
        qcm: creerCompteurStats(),
        theme: creerCompteurStats()
      }
    },
    parDimension: {
      typeDeclinaison: {},
      cas: {},
      nombre: {},
      mode: {},
      temps: {},
      voix: {}
    },
    parJour: {}
  };
}

function nombreStats(valeur) {
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}

function normaliserCompteurStats(source) {
  const compteur = creerCompteurStats();
  if (!source || typeof source !== 'object') return compteur;

  compteur.points = nombreStats(source.points);
  compteur.pointsPossibles = nombreStats(source.pointsPossibles);
  compteur.tentatives = nombreStats(source.tentatives);
  compteur.assistees = nombreStats(source.assistees);

  for (const statut of Object.keys(compteur.resultats)) {
    compteur.resultats[statut] = nombreStats(source.resultats?.[statut]);
  }

  return compteur;
}

function normaliserTableCompteurs(source) {
  const resultat = {};
  if (!source || typeof source !== 'object') return resultat;

  for (const [cle, compteur] of Object.entries(source)) {
    resultat[cle] = normaliserCompteurStats(compteur);
  }

  return resultat;
}

function normaliserStatsV1(source) {
  const stats = creerStatsVides();
  stats.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null;
  stats.global = {
    ...normaliserCompteurStats(source.global),
    streak: {
      actuel: nombreStats(source.global?.streak?.actuel),
      meilleur: nombreStats(source.global?.streak?.meilleur)
    }
  };

  for (const [categorie, modes] of Object.entries(stats.parCategorie)) {
    for (const mode of Object.keys(modes)) {
      stats.parCategorie[categorie][mode] = normaliserCompteurStats(
        source.parCategorie?.[categorie]?.[mode]
      );
    }
  }

  for (const dimension of Object.keys(stats.parDimension)) {
    stats.parDimension[dimension] = normaliserTableCompteurs(
      source.parDimension?.[dimension]
    );
  }

  stats.parJour = normaliserTableCompteurs(source.parJour);
  return stats;
}

function migrerStats(anciennesDonnees) {
  if (!anciennesDonnees || typeof anciennesDonnees !== 'object') {
    return creerStatsVides();
  }

  const version = Number(
    anciennesDonnees.schemaVersion ?? anciennesDonnees.version
  );

  if (version === 1) return normaliserStatsV1(anciennesDonnees);

  console.warn('Version de statistiques inconnue : réinitialisation locale.', version);
  return creerStatsVides();
}

function genererIdentifiantLocal() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chargerOuCreerDeviceId() {
  try {
    const existant = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existant) return existant;

    const nouveau = genererIdentifiantLocal();
    localStorage.setItem(DEVICE_STORAGE_KEY, nouveau);
    return nouveau;
  } catch (error) {
    console.warn('Identifiant local non persistant :', error);
    return genererIdentifiantLocal();
  }
}

function ajouterEvenementAuCompteur(compteur, evenement) {
  compteur.points = arrondirDixieme(compteur.points + evenement.points);
  compteur.pointsPossibles = arrondirDixieme(
    compteur.pointsPossibles + evenement.pointsPossibles
  );
  compteur.tentatives += 1;
  if (evenement.assisted) compteur.assistees += 1;

  if (Object.prototype.hasOwnProperty.call(compteur.resultats, evenement.statut)) {
    compteur.resultats[evenement.statut] += 1;
  }
}

function categorieEtModeStats(kind) {
  const correspondances = {
    'declension-production': ['declinaison', 'production'],
    'declension-analysis': ['declinaison', 'analyse'],
    'conjugation-production': ['conjugaison', 'production'],
    'conjugation-analysis': ['conjugaison', 'analyse'],
    'version-qcm': ['version', 'qcm'],
    'version-theme': ['version', 'theme']
  };
  return correspondances[kind] || null;
}

function resultatContinueStreak(resultat) {
  return resultat.statut === 'exact' || resultat.statut === 'orthographe';
}

function cleJourLocal(date = new Date()) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

function elaguerHistoriqueJournalier(parJour) {
  const jours = Object.keys(parJour).sort();
  const excedent = jours.length - STATS_HISTORY_DAYS;
  if (excedent <= 0) return;
  jours.slice(0, excedent).forEach(jour => delete parJour[jour]);
}

function appliquerEvenementAuxStats(stats, evenement, deviceId = null) {
  const date = evenement.date ? new Date(evenement.date) : new Date();
  const dateValide = Number.isNaN(date.getTime()) ? new Date() : date;
  const resultat = {
    ...evenement,
    deviceId: evenement.deviceId || deviceId || null,
    date: dateValide.toISOString()
  };

  ajouterEvenementAuCompteur(stats.global, resultat);

  if (resultatContinueStreak(resultat)) {
    stats.global.streak.actuel += 1;
    stats.global.streak.meilleur = Math.max(
      stats.global.streak.meilleur,
      stats.global.streak.actuel
    );
  } else {
    stats.global.streak.actuel = 0;
  }

  const emplacement = categorieEtModeStats(resultat.kind);
  if (emplacement) {
    const [categorie, mode] = emplacement;
    ajouterEvenementAuCompteur(stats.parCategorie[categorie][mode], resultat);
  }

  for (const dimension of Object.keys(stats.parDimension)) {
    const valeur = resultat.dimensions?.[dimension];
    const valeurs = Array.isArray(valeur) ? valeur : [valeur];

    for (const cle of new Set(valeurs.filter(Boolean).map(String))) {
      stats.parDimension[dimension][cle] ||= creerCompteurStats();
      ajouterEvenementAuCompteur(
        stats.parDimension[dimension][cle],
        resultat
      );
    }
  }

  const jour = cleJourLocal(dateValide);
  stats.parJour[jour] ||= creerCompteurStats();
  ajouterEvenementAuCompteur(stats.parJour[jour], resultat);
  elaguerHistoriqueJournalier(stats.parJour);

  stats.updatedAt = resultat.date;
  return resultat;
}

const StatsStore = {
  _stats: creerStatsVides(),
  _deviceId: null,

  charger() {
    try {
      const brut = localStorage.getItem(STATS_STORAGE_KEY);
      return brut ? migrerStats(JSON.parse(brut)) : creerStatsVides();
    } catch (error) {
      console.warn('Statistiques locales illisibles : réinitialisation.', error);
      return creerStatsVides();
    }
  },

  sauvegarder(stats = this._stats) {
    this._stats = stats;
    try {
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
      return true;
    } catch (error) {
      console.warn('Statistiques non sauvegardées :', error);
      return false;
    }
  },

  initialiser() {
    this._deviceId = chargerOuCreerDeviceId();
    this._stats = this.charger();
    return this._stats;
  },

  obtenir() {
    return this._stats;
  },

  obtenirDeviceId() {
    if (!this._deviceId) this._deviceId = chargerOuCreerDeviceId();
    return this._deviceId;
  },

  normaliser(source) {
    return migrerStats(source);
  },

  creerVides() {
    return creerStatsVides();
  },

  appliquerEvenement(statsSource, evenement) {
    const stats = normaliserStatsV1(statsSource);
    const resultat = appliquerEvenementAuxStats(
      stats,
      evenement,
      evenement?.deviceId || this.obtenirDeviceId()
    );
    return { stats, evenement: resultat };
  },

  enregistrerReponse(evenement) {
    const stats = this._stats || this.initialiser();
    const resultat = appliquerEvenementAuxStats(
      stats,
      evenement,
      this.obtenirDeviceId()
    );

    this.sauvegarder(stats);
    window.dispatchEvent(new CustomEvent('byebailly:stats-changed', {
      detail: {
        updatedAt: stats.updatedAt,
        evenement: resultat
      }
    }));
    return stats;
  }
};

StatsStore.initialiser();
window.StatsStore = StatsStore;

// ---------------------------------------------------------------------------
// 1 bis. Rendu de l'interface des statistiques
// ---------------------------------------------------------------------------

let currentStatsView = 'global';

const STATS_RESULT_LABELS = {
  exact: 'Exactes',
  orthographe: 'Orthographe tolérée',
  partiel: 'Partielles',
  incorrect: 'Incorrectes',
  revelee: 'Révélées'
};

const STATS_DIMENSION_CONFIG = {
  typeDeclinaison: {
    titre: 'Type de déclinaison',
    ordre: [
      'nom_1', 'nom_2', 'nom_3',
      'adjectif_1', 'adjectif_2', 'adjectif_3',
      'autre'
    ],
    labels: {
      nom_1: 'Noms — 1re déclinaison',
      nom_2: 'Noms — 2e déclinaison',
      nom_3: 'Noms — 3e déclinaison',
      adjectif_1: 'Adjectifs — 1re classe',
      adjectif_2: 'Adjectifs — 2e classe',
      adjectif_3: 'Adjectifs — 3e classe',
      autre: 'Autres formes'
    }
  },
  cas: {
    titre: 'Cas',
    ordre: ['nom', 'voc', 'acc', 'gen', 'dat'],
    labels: {
      nom: 'Nominatif', voc: 'Vocatif', acc: 'Accusatif',
      gen: 'Génitif', dat: 'Datif'
    }
  },
  nombre: {
    titre: 'Nombre',
    ordre: ['sg', 'pl'],
    labels: { sg: 'Singulier', pl: 'Pluriel' }
  },
  mode: {
    titre: 'Mode verbal',
    ordre: ['indicative', 'participle', 'infinitive'],
    labels: {
      indicative: 'Indicatif', participle: 'Participe', infinitive: 'Infinitif'
    }
  },
  temps: {
    titre: 'Temps',
    ordre: ['present', 'imperfect', 'future', 'aorist'],
    labels: {
      present: 'Présent', imperfect: 'Imparfait', future: 'Futur', aorist: 'Aoriste'
    }
  },
  voix: {
    titre: 'Voix',
    ordre: ['active', 'middle', 'middle_passive', 'passive'],
    labels: {
      active: 'Active',
      middle: 'Moyenne',
      middle_passive: 'Moyenne / passive',
      passive: 'Passive'
    }
  }
};

function creerElementStats(tag, classe = '', texte = null) {
  const element = document.createElement(tag);
  if (classe) element.className = classe;
  if (texte !== null) element.textContent = texte;
  return element;
}

function formaterNombreStatsInterface(valeur) {
  const nombre = arrondirDixieme(nombreStats(valeur));
  return Number.isInteger(nombre)
    ? String(nombre)
    : String(nombre).replace('.', ',');
}

function pourcentageStats(compteur) {
  const possible = nombreStats(compteur?.pointsPossibles);
  if (possible <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((nombreStats(compteur?.points) / possible) * 100))
  );
}

function fusionnerCompteursStats(compteurs) {
  const fusion = creerCompteurStats();

  for (const compteur of compteurs.filter(Boolean)) {
    fusion.points = arrondirDixieme(fusion.points + nombreStats(compteur.points));
    fusion.pointsPossibles = arrondirDixieme(
      fusion.pointsPossibles + nombreStats(compteur.pointsPossibles)
    );
    fusion.tentatives += nombreStats(compteur.tentatives);
    fusion.assistees += nombreStats(compteur.assistees);

    for (const statut of Object.keys(fusion.resultats)) {
      fusion.resultats[statut] += nombreStats(compteur.resultats?.[statut]);
    }
  }

  return fusion;
}

function compteurCategorieStats(stats, categorie) {
  return fusionnerCompteursStats(
    Object.values(stats.parCategorie?.[categorie] || {})
  );
}

function creerGroupeStats(titre, note = '') {
  const section = creerElementStats('section', 'setting-group stats-group');
  const entete = creerElementStats('div', 'stats-group-title-row');
  const heading = creerElementStats('h3', 'setting-label', titre);
  entete.appendChild(heading);

  if (note) {
    entete.appendChild(creerElementStats('span', 'stats-group-note', note));
  }

  section.appendChild(entete);
  return section;
}

function ajouterMetriqueStats(grille, valeur, libelle, accent = false) {
  const bloc = creerElementStats('div', 'stats-metric');
  const valeurElement = creerElementStats(
    'span',
    `stats-metric-value${accent ? ' is-accent' : ''}`,
    valeur
  );
  bloc.append(
    valeurElement,
    creerElementStats('span', 'stats-metric-label', libelle)
  );
  grille.appendChild(bloc);
}

function creerResumeStats(compteur, options = {}) {
  const {
    titre = "Vue d'ensemble",
    streak = null,
    compact = false,
    afficherIndices = true
  } = options;
  const section = creerGroupeStats(titre);
  const grille = creerElementStats(
    'div',
    `stats-summary-grid${compact ? ' stats-summary-grid-compact' : ''}`
  );

  ajouterMetriqueStats(
    grille,
    `${pourcentageStats(compteur)} %`,
    'Réussite',
    true
  );
  ajouterMetriqueStats(
    grille,
    `${formaterNombreStatsInterface(compteur.points)} / ${formaterNombreStatsInterface(compteur.pointsPossibles)}`,
    'Points'
  );
  ajouterMetriqueStats(
    grille,
    formaterNombreStatsInterface(compteur.tentatives),
    'Tentatives'
  );
  if (afficherIndices) {
    ajouterMetriqueStats(
      grille,
      formaterNombreStatsInterface(compteur.assistees),
      'Avec indice'
    );
  }

  if (streak) {
    ajouterMetriqueStats(
      grille,
      formaterNombreStatsInterface(streak.actuel),
      'Série actuelle'
    );
    ajouterMetriqueStats(
      grille,
      formaterNombreStatsInterface(streak.meilleur),
      'Meilleure série'
    );
  }

  section.appendChild(grille);
  return section;
}

function creerLigneDetailStats(libelle, compteur, options = {}) {
  const { classe = '', ratio = null, piedGauche = null } = options;
  const ligne = creerElementStats(
    'div',
    `stats-detail-row${classe ? ` ${classe}` : ''}`
  );
  const pourcentage = ratio === null
    ? pourcentageStats(compteur)
    : Math.max(0, Math.min(100, Math.round(ratio)));

  const entete = creerElementStats('div', 'stats-detail-head');
  entete.append(
    creerElementStats('span', 'stats-detail-label', libelle),
    creerElementStats('span', 'stats-detail-value', `${pourcentage} %`)
  );

  const piste = creerElementStats('div', 'stats-progress-track');
  const remplissage = creerElementStats('div', 'stats-progress-fill');
  remplissage.style.width = `${pourcentage}%`;
  piste.appendChild(remplissage);

  const pied = creerElementStats('div', 'stats-detail-foot');
  pied.append(
    creerElementStats(
      'span',
      '',
      piedGauche ?? `${formaterNombreStatsInterface(compteur.points)} / ${formaterNombreStatsInterface(compteur.pointsPossibles)} point${compteur.pointsPossibles > 1 ? 's' : ''}`
    ),
    creerElementStats(
      'span',
      '',
      `${formaterNombreStatsInterface(compteur.tentatives)} tentative${compteur.tentatives > 1 ? 's' : ''}`
    )
  );

  ligne.append(entete, piste, pied);
  return ligne;
}

function creerRepartitionStats(compteur) {
  const section = creerGroupeStats('Répartition des réponses');
  const liste = creerElementStats('div', 'stats-result-list');
  const totalTentatives = Math.max(0, nombreStats(compteur.tentatives));

  for (const statut of Object.keys(STATS_RESULT_LABELS)) {
    const nombre = nombreStats(compteur.resultats?.[statut]);
    const ratio = totalTentatives > 0 ? (nombre / totalTentatives) * 100 : 0;
    liste.appendChild(
      creerLigneDetailStats(
        STATS_RESULT_LABELS[statut],
        { points: nombre, pointsPossibles: totalTentatives, tentatives: nombre },
        {
          classe: `stats-result-${statut}`,
          ratio,
          piedGauche: `${formaterNombreStatsInterface(nombre)} réponse${nombre > 1 ? 's' : ''}`
        }
      )
    );
  }

  section.appendChild(liste);
  return section;
}

function creerModesStats(titre, modes) {
  const section = creerGroupeStats(titre);
  const grille = creerElementStats('div', 'stats-mode-grid');

  for (const { libelle, compteur } of modes) {
    const carte = creerElementStats('div', 'stats-mode-card');
    carte.append(
      creerElementStats('span', 'stats-mode-name', libelle),
      creerElementStats('span', 'stats-mode-score', `${pourcentageStats(compteur)} %`),
      creerElementStats(
        'span',
        'stats-mode-detail',
        `${formaterNombreStatsInterface(compteur.points)} / ${formaterNombreStatsInterface(compteur.pointsPossibles)} · ${formaterNombreStatsInterface(compteur.tentatives)} tentative${compteur.tentatives > 1 ? 's' : ''}`
      )
    );
    grille.appendChild(carte);
  }

  section.appendChild(grille);
  return section;
}

function clesDimensionStats(table, configuration) {
  const ordre = configuration.ordre || [];
  const presentes = Object.keys(table || {});
  const extras = presentes
    .filter(cle => !ordre.includes(cle))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return [...ordre, ...extras];
}

function creerDimensionStats(stats, nomDimension) {
  const configuration = STATS_DIMENSION_CONFIG[nomDimension];
  const table = stats.parDimension?.[nomDimension] || {};
  const section = creerGroupeStats(configuration.titre);
  const liste = creerElementStats('div', 'stats-detail-list');

  for (const cle of clesDimensionStats(table, configuration)) {
    const compteur = table[cle] || creerCompteurStats();
    const libelle = configuration.labels?.[cle] || cle.replaceAll('_', ' ');
    liste.appendChild(creerLigneDetailStats(libelle, compteur));
  }

  section.appendChild(liste);
  return section;
}

function joursRecentsStats(nombreJours = 14) {
  const jours = [];
  const maintenant = new Date();
  maintenant.setHours(12, 0, 0, 0);

  for (let decalage = nombreJours - 1; decalage >= 0; decalage--) {
    const date = new Date(maintenant);
    date.setDate(maintenant.getDate() - decalage);
    jours.push({ date, cle: cleJourLocal(date) });
  }

  return jours;
}

function creerActiviteStats(stats) {
  const jours = joursRecentsStats(14);
  const compteurs = jours.map(({ cle }) => stats.parJour?.[cle] || creerCompteurStats());
  const maxTentatives = Math.max(1, ...compteurs.map(compteur => compteur.tentatives || 0));
  const totalRecent = fusionnerCompteursStats(compteurs);
  const section = creerGroupeStats('Activité récente', '14 derniers jours');

  const resume = creerElementStats('div', 'stats-activity-summary');
  resume.append(
    creerElementStats(
      'span',
      '',
      `${formaterNombreStatsInterface(totalRecent.tentatives)} tentative${totalRecent.tentatives > 1 ? 's' : ''}`
    ),
    creerElementStats('span', '', `${pourcentageStats(totalRecent)} % de réussite`)
  );

  const detail = creerElementStats('div', 'stats-activity-detail');
  detail.hidden = true;
  detail.setAttribute('aria-live', 'polite');

  const detailJourValeur = creerElementStats('span', 'stats-activity-detail-value');
  const detailPointsValeur = creerElementStats('span', 'stats-activity-detail-value');
  const detailReussiteValeur = creerElementStats('span', 'stats-activity-detail-value');

  const detailJour = creerElementStats('div', 'stats-activity-detail-item');
  detailJour.append(
    detailJourValeur,
    creerElementStats('span', 'stats-activity-detail-label', 'Jour')
  );

  const detailPoints = creerElementStats('div', 'stats-activity-detail-item');
  detailPoints.append(
    detailPointsValeur,
    creerElementStats('span', 'stats-activity-detail-label', 'Points')
  );

  const detailReussite = creerElementStats('div', 'stats-activity-detail-item');
  detailReussite.append(
    detailReussiteValeur,
    creerElementStats('span', 'stats-activity-detail-label', 'Réussite')
  );

  detail.append(detailJour, detailPoints, detailReussite);

  const graphique = creerElementStats('div', 'stats-activity-chart');
  let jourSelectionne = null;

  jours.forEach(({ date, cle }) => {
    const compteur = stats.parJour?.[cle] || creerCompteurStats();
    const pourcentage = pourcentageStats(compteur);
    const dateLisible = date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long'
    });
    const jour = creerElementStats(
      'button',
      `stats-day${compteur.tentatives ? '' : ' is-empty'}`
    );
    jour.type = 'button';
    jour.setAttribute(
      'aria-label',
      compteur.tentatives
        ? `${dateLisible} : ${formaterNombreStatsInterface(compteur.points)} sur ${formaterNombreStatsInterface(compteur.pointsPossibles)}, ${pourcentage} % de réussite`
        : `${dateLisible} : aucune tentative`
    );

    const enveloppe = creerElementStats('span', 'stats-day-bar-wrap');
    const barre = creerElementStats('span', 'stats-day-bar');
    barre.style.height = `${Math.max(3, Math.round((compteur.tentatives / maxTentatives) * 64))}px`;
    enveloppe.appendChild(barre);

    jour.append(
      enveloppe,
      creerElementStats('span', 'stats-day-label', String(date.getDate()))
    );

    jour.addEventListener('click', () => {
      if (jourSelectionne) {
        jourSelectionne.classList.remove('is-selected');
        jourSelectionne.setAttribute('aria-pressed', 'false');
      }

      jourSelectionne = jour;
      jour.classList.add('is-selected');
      jour.setAttribute('aria-pressed', 'true');

      detailJourValeur.textContent = dateLisible;
      detailPointsValeur.textContent = compteur.tentatives
        ? `${formaterNombreStatsInterface(compteur.points)} / ${formaterNombreStatsInterface(compteur.pointsPossibles)}`
        : '—';
      detailReussiteValeur.textContent = compteur.tentatives
        ? `${pourcentage} %`
        : 'Aucun essai';
      detail.hidden = false;
    });

    jour.setAttribute('aria-pressed', 'false');
    graphique.appendChild(jour);
  });

  section.append(resume, detail, graphique);
  return section;
}

function creerEtatVideStats(titre, texte) {
  const section = creerElementStats('section', 'setting-group stats-group stats-empty');
  const icone = creerElementStats('div', 'stats-empty-icon');
  icone.innerHTML = '<svg viewBox="0 0 280 280" aria-hidden="true"><path d="M271,262h-49.238V158.694c0-4.971-4.029-9-9-9h-30.664c-4.971,0-9,4.029-9,9V262h-17.901V115.338c0-4.971-4.029-9-9-9h-30.664c-4.971,0-9,4.029-9,9V262H88.633V71.553c0-4.971-4.029-9-9-9H48.969c-4.971,0-9,4.029-9,9V262H18V9c0-4.971-4.029-9-9-9S0,4.029,0,9v262c0,4.971,4.029,9,9,9h262c4.971,0,9-4.029,9-9S275.971,262,271,262z M191.098,167.694h12.664V262h-12.664V167.694z M124.534,124.338h12.664V262h-12.664V124.338z M57.969,80.553h12.664V262H57.969V80.553z"/></svg>';
  section.append(
    icone,
    creerElementStats('h3', 'stats-empty-title', titre),
    creerElementStats('p', 'stats-empty-text', texte)
  );
  return section;
}

function rendreStatsGlobales(conteneur, stats) {
  if (!stats.global.tentatives) {
    conteneur.appendChild(
      creerEtatVideStats(
        'Aucune statistique pour le moment',
        'Les résultats apparaîtront ici dès que tu auras validé une première réponse.'
      )
    );
    return;
  }

  conteneur.append(
    creerResumeStats(stats.global, {
      titre: "Vue d'ensemble",
      streak: stats.global.streak
    }),
    creerRepartitionStats(stats.global),
    creerActiviteStats(stats)
  );
}

function rendreStatsDeclinaison(conteneur, stats) {
  const compteur = compteurCategorieStats(stats, 'declinaison');
  if (!compteur.tentatives) {
    conteneur.appendChild(
      creerEtatVideStats(
        'Pas encore de données en déclinaison',
        'Joue quelques questions de production ou d’analyse pour faire apparaître les résultats par déclinaison, cas et nombre.'
      )
    );
    return;
  }

  conteneur.append(
    creerResumeStats(compteur, { titre: 'Déclinaison', afficherIndices: false }),
    creerModesStats('Modes d’exercice', [
      { libelle: 'Analyse', compteur: stats.parCategorie.declinaison.analyse },
      { libelle: 'Production', compteur: stats.parCategorie.declinaison.production }
    ]),
    creerDimensionStats(stats, 'typeDeclinaison'),
    creerDimensionStats(stats, 'cas'),
    creerDimensionStats(stats, 'nombre')
  );
}

function rendreStatsConjugaison(conteneur, stats) {
  const compteur = compteurCategorieStats(stats, 'conjugaison');
  if (!compteur.tentatives) {
    conteneur.appendChild(
      creerEtatVideStats(
        'Pas encore de données en conjugaison',
        'Joue quelques questions de production ou d’analyse pour faire apparaître les résultats par mode, temps et voix.'
      )
    );
    return;
  }

  conteneur.append(
    creerResumeStats(compteur, { titre: 'Conjugaison', afficherIndices: false }),
    creerModesStats('Modes d’exercice', [
      { libelle: 'Analyse', compteur: stats.parCategorie.conjugaison.analyse },
      { libelle: 'Production', compteur: stats.parCategorie.conjugaison.production }
    ]),
    creerDimensionStats(stats, 'mode'),
    creerDimensionStats(stats, 'temps'),
    creerDimensionStats(stats, 'voix')
  );
}

function rendreStatsVersion(conteneur, stats) {
  const compteur = compteurCategorieStats(stats, 'version');
  if (!compteur.tentatives) {
    conteneur.appendChild(
      creerEtatVideStats(
        'Pas encore de données en version',
        'Joue quelques questions de Version ou de Thème pour comparer tes résultats dans les deux sens de traduction.'
      )
    );
    return;
  }

  conteneur.append(
    creerResumeStats(compteur, { titre: 'Version et thème', compact: true }),
    creerModesStats('Sens de traduction', [
      { libelle: 'Version ', compteur: stats.parCategorie.version.qcm },
      { libelle: 'Thème ', compteur: stats.parCategorie.version.theme }
    ]),
    creerRepartitionStats(compteur)
  );
}

function afficherStatistiques(statsSource = null) {
  const stats = statsSource
    ? migrerStats(statsSource)
    : (StatsStore.obtenir() || creerStatsVides());
  const contenu = document.getElementById('statsContent');
  const dateMiseAJour = document.getElementById('statsUpdatedAt');
  if (!contenu) return;

  document.querySelectorAll('#statsViewControl button').forEach(bouton => {
    const active = bouton.dataset.view === currentStatsView;
    bouton.classList.toggle('active', active);
    bouton.setAttribute('aria-pressed', String(active));
  });

  contenu.replaceChildren();

  if (currentStatsView === 'declinaison') {
    rendreStatsDeclinaison(contenu, stats);
  } else if (currentStatsView === 'conjugaison') {
    rendreStatsConjugaison(contenu, stats);
  } else if (currentStatsView === 'version') {
    rendreStatsVersion(contenu, stats);
  } else {
    rendreStatsGlobales(contenu, stats);
  }

  if (stats.updatedAt) {
    const date = new Date(stats.updatedAt);
    dateMiseAJour.textContent = Number.isNaN(date.getTime())
      ? ''
      : `Dernière mise à jour : ${date.toLocaleString('fr-FR', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })}`;
  } else {
    dateMiseAJour.textContent = '';
  }
}
