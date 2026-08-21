(() => {
  'use strict';

  const STATS_KEY = 'byebailly_stats';
  const q = selector => document.querySelector(selector);

  document.body.dataset.theme = localStorage.getItem('app_theme') || 'system';

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
      schemaVersion: 1,
      updatedAt: null,
      global: {
        ...creerCompteurStats(),
        streak: { actuel: 0, meilleur: 0 }
      },
      streaks: {
        beginner: { actuel: 0, meilleur: 0 },
        intermediate: { actuel: 0, meilleur: 0 },
        advanced: { actuel: 0, meilleur: 0 },
        version: { actuel: 0, meilleur: 0 }
      },
      parCategorie: {
        declinaison: { analyse: creerCompteurStats(), production: creerCompteurStats() },
        conjugaison: { analyse: creerCompteurStats(), production: creerCompteurStats() },
        version: { qcm: creerCompteurStats(), theme: creerCompteurStats() }
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

  function arrondirDixieme(valeur) {
    return Math.round((Number(valeur) + Number.EPSILON) * 10) / 10;
  }

  function normaliserCompteur(source) {
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

  function normaliserStats(source) {
    const stats = creerStatsVides();
    if (!source || typeof source !== 'object') return stats;

    stats.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null;
    stats.global = {
      ...normaliserCompteur(source.global),
      streak: {
        actuel: nombreStats(source.global?.streak?.actuel),
        meilleur: nombreStats(source.global?.streak?.meilleur)
      }
    };

    for (const cle of Object.keys(stats.streaks)) {
      stats.streaks[cle] = {
        actuel: nombreStats(source.streaks?.[cle]?.actuel),
        meilleur: nombreStats(source.streaks?.[cle]?.meilleur)
      };
    }

    for (const [categorie, modes] of Object.entries(stats.parCategorie)) {
      for (const mode of Object.keys(modes)) {
        stats.parCategorie[categorie][mode] = normaliserCompteur(
          source.parCategorie?.[categorie]?.[mode]
        );
      }
    }

    for (const dimension of Object.keys(stats.parDimension)) {
      const table = source.parDimension?.[dimension];
      if (!table || typeof table !== 'object') continue;
      for (const [cle, compteur] of Object.entries(table)) {
        stats.parDimension[dimension][cle] = normaliserCompteur(compteur);
      }
    }

    const jours = source.parJour;
    if (jours && typeof jours === 'object') {
      for (const [cle, compteur] of Object.entries(jours)) {
        stats.parJour[cle] = normaliserCompteur(compteur);
      }
    }

    return stats;
  }

  function lireStatsLocales() {
    try {
      const brut = localStorage.getItem(STATS_KEY);
      return normaliserStats(brut ? JSON.parse(brut) : null);
    } catch (error) {
      console.warn('Statistiques locales illisibles :', error);
      return creerStatsVides();
    }
  }

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

  // Important : on conserve exactement la logique de l'ancien modal.
  // La réussite est fondée sur les points obtenus / points possibles,
  // et non sur un nouveau ratio "réponses exactes / tentatives".
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

    ajouterMetriqueStats(grille, `${pourcentageStats(compteur)} %`, 'Réussite', true);
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

  function cleJourLocal(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, '0');
    const jour = String(date.getDate()).padStart(2, '0');
    return `${annee}-${mois}-${jour}`;
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

  function creerSeriesParDifficulte(stats) {
    const section = creerGroupeStats(
      'Séries par difficulté',
      'Une mauvaise réponse interrompt seulement la série de la difficulté concernée.'
    );
    const grille = creerElementStats('div', 'stats-streak-grid');
    const series = [
      ['beginner', 'Débutant'],
      ['intermediate', 'Intermédiaire'],
      ['advanced', 'Avancé'],
      ['version', 'Version']
    ];

    for (const [cle, libelle] of series) {
      const serie = stats.streaks?.[cle] || { actuel: 0, meilleur: 0 };
      const carte = creerElementStats('div', 'stats-streak-card');
      carte.append(
        creerElementStats('strong', '', libelle),
        creerElementStats('span', '', `Série : ${formaterNombreStatsInterface(serie.actuel)}`),
        creerElementStats('span', '', `Record : ${formaterNombreStatsInterface(serie.meilleur)}`)
      );
      grille.appendChild(carte);
    }

    section.appendChild(grille);
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
      creerActiviteStats(stats),
      creerSeriesParDifficulte(stats)
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

  let currentStatsView = 'global';
  let displayedStats = lireStatsLocales();

  function afficherStatistiques() {
    const contenu = q('#statsContent');
    const dateMiseAJour = q('#statsUpdatedAt');
    if (!contenu) return;

    q('#statsViewControl').querySelectorAll('button').forEach(bouton => {
      const active = bouton.dataset.view === currentStatsView;
      bouton.classList.toggle('active', active);
      bouton.setAttribute('aria-pressed', String(active));
    });

    contenu.replaceChildren();

    if (currentStatsView === 'declinaison') {
      rendreStatsDeclinaison(contenu, displayedStats);
    } else if (currentStatsView === 'conjugaison') {
      rendreStatsConjugaison(contenu, displayedStats);
    } else if (currentStatsView === 'version') {
      rendreStatsVersion(contenu, displayedStats);
    } else {
      rendreStatsGlobales(contenu, displayedStats);
    }

    if (dateMiseAJour) {
      if (displayedStats.updatedAt) {
        const date = new Date(displayedStats.updatedAt);
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
  }

  q('#statsViewControl').addEventListener('click', event => {
    const bouton = event.target.closest('button[data-view]');
    if (!bouton) return;
    currentStatsView = bouton.dataset.view;
    afficherStatistiques();
  });

  function dateFr(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function renderHeader({ username = null, createdAt = null, rank = null, isPublic = false } = {}) {
    q('#profileName').textContent = username || 'Profil local';
    q('#profileMeta').textContent = username
      ? `Inscrit le ${dateFr(createdAt)}${rank ? ` · #${rank} au classement` : ''}`
      : 'Statistiques enregistrées sur cet appareil.';
    q('#authActions').hidden = isPublic;
    q('#logoutBtn').hidden = !username || isPublic;
    q('#authPanel').hidden = Boolean(username) || isPublic;
    q('#localAccountHint').hidden = Boolean(username) || isPublic;
  }

  async function load() {
    const publicName = new URLSearchParams(location.search).get('user');
    q('#profileNotice').textContent = '';

    try {
      if (publicName) {
        const data = await ByeBaillyAPI.request(`/users/${encodeURIComponent(publicName)}`);
        displayedStats = normaliserStats(data.stats);
        renderHeader({
          username: data.username,
          createdAt: data.createdAt,
          rank: data.rank,
          isPublic: true
        });
      } else if (ByeBaillyAPI.token()) {
        await ByeBaillyAPI.syncNow({ force: true }).catch(() => {});
        const data = await ByeBaillyAPI.me();
        displayedStats = normaliserStats(data.stats || lireStatsLocales());
        renderHeader({
          username: data.user.username,
          createdAt: data.user.createdAt,
          rank: data.user.rank
        });
      } else {
        displayedStats = lireStatsLocales();
        renderHeader();
      }
    } catch (error) {
      q('#profileNotice').textContent = error.message;
      displayedStats = lireStatsLocales();
      renderHeader();
    }

    afficherStatistiques();
  }

  q('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    q('#profileNotice').textContent = '';
    try {
      await ByeBaillyAPI.login(q('#loginUsername').value, q('#loginPassword').value);
      await load();
    } catch (error) {
      q('#profileNotice').textContent = error.message;
    }
  });

  q('#registerForm').addEventListener('submit', async event => {
    event.preventDefault();
    q('#profileNotice').textContent = '';
    try {
      await ByeBaillyAPI.register(q('#registerUsername').value, q('#registerPassword').value);
      await load();
    } catch (error) {
      q('#profileNotice').textContent = error.message;
    }
  });

  q('#logoutBtn').addEventListener('click', async () => {
    await ByeBaillyAPI.logout();
    displayedStats = lireStatsLocales();
    renderHeader();
    afficherStatistiques();
  });

  load();
})();
