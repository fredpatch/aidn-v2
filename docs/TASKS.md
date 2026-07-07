# AIDN v2 (nouveau repo) — TASKS

> Backlog de développement seedé à partir de l'étude de faisabilité module par module
> (`project/modules-feasibility.md`). Aucune ligne de code n'existe encore dans ce
> nouveau repo — ce fichier sert de point de départ, à raffiner au fur et à mesure de
> l'implémentation, sur le modèle du `docs/TASKS.md` de SICOT.
>
> Référence de logique métier déjà implémentée (mais non reprise telle quelle) :
> `aidn-v2-legacy` (ancien `aidn_v2`).

**Stack cible (validée) :** React + TypeScript + Tailwind CSS (frontend) / Node.js +
Express + TypeScript (backend) / **PostgreSQL + Drizzle ORM** (base de données) —
identique à SICOT. Voir `technical/conventions.md` (à créer) pour le détail complet
des conventions de code/naming.

**Décision base de données :** PostgreSQL retenu plutôt que MongoDB (utilisé par le
legacy `aidn-v2-legacy`) — les règles métier verrouillées (une seule demande active,
checklist 11/11, création certificat à validation paiement) sont des problèmes
d'intégrité relationnelle mieux garantis par contraintes SQL ; les KPIs (M12) et la
détection de conflit de créneaux (M10) sont des requêtes d'agrégation/chevauchement
naturelles en SQL. Migration des données historiques Mongo, si nécessaire, traitée
comme un ETL ponctuel.

---

## Sprint 0 — Fondations spec-first

- [x] Étude de faisabilité complète des 13 modules (M1–M13)
- [x] Patterns transverses consolidés (`technical/cross-cutting-patterns.md`)
- [x] Décision de stack technique : React+TS+Tailwind / Express+TS / **PostgreSQL +
      Drizzle ORM**
- [x] Conventions détaillées (`technical/conventions.md`) — naming, structure dossiers,
      style UI/UX ANAC
- [x] Init repo `aidn-v2` (monorepo, structure alignée SICOT)
- [ ] Renommer ancien repo en `aidn-v2-legacy`, archivage clair
- [x] Schéma PostgreSQL initial (19 tables : users, user_roles, organisations,
      applicants, account_requests, requests, dg_circuit_documents, phases,
      meetings, preliminary_evaluation_forms, formal_request_documents,
      document_evaluations, site_inspections, payments, certificates,
      document_versions, notifications, reports, audit_logs)

## Sprint 1 — Intake & Circuit DG (M1+M2)

- [x] Modèle de données : Demande (type, statut, contacts, postulant)
- [x] Formulaire unique portail + saisie manuelle reception/assistant_dg
      (`POST /api/requests` - un seul endpoint pour les deux canaux)
- [x] Statuts Déposé → Signé → En attente de traitement
      (`mark-signed`, `mark-pending-review`)
- [x] Règle « une seule demande active » par postulant (contrainte DB -
      index unique partiel, pas seulement une vérification applicative)
- [x] Alerte blocage parapheur (seuil configurable, défaut 3j ouvrés) → DN +
      reception/assistant_dg (`jobs/dg-circuit-alert.job.ts`, écrit dans
      `notifications` ; envoi email réel différé au Sprint 10)
- [x] Annulation possible en `Déposé` uniquement (`cancel`)

### Prérequis ajouté en cours de sprint : Auth & Utilisateurs (calqué sur SICOT)

- [x] Authentification matricule + OTP première connexion + mot de passe
      (bcrypt), verrouillage après échecs répétés, JWT access+refresh en
      cookies httpOnly — même modèle que SICOT, adapté au multi-rôle
      (`user_roles` au lieu d'une colonne `role` unique)
- [x] Bootstrap du premier Super Admin (`/api/bootstrap/status`, `/init`)
- [x] Gestion des utilisateurs (création avec envoi OTP, liste, mise à jour,
      activation/désactivation, réinitialisation OTP) - réservé au rôle `SU`
- [x] `system_parameters` (équivalent des `parametres` SICOT) : seuils OTP,
      verrouillage, alerte parapheur - configurables sans redéploiement
- [x] Emails réels via Nodemailer (mêmes noms de variables d'env que SICOT :
      SMTP_HOST/PORT/USER/PASS/FROM, pour réutiliser les identifiants
      existants tel quel)

## Sprint 2 — Phase Préliminaire (M3)

- [ ] Planification réunion (date, ticket/PDF téléchargeable, email optionnel)
- [ ] Statuts réunion : tenue / No-Show / Reportée / Dossier annulé
- [ ] Mise à disposition Déclaration de pré-évaluation (post-réunion)
- [ ] Upload retour formulaire par postulant
- [ ] Clôture de phase (doc attaché ou note facultative)
- [ ] Délai de retour configurable dynamiquement par DN

## Sprint 3 — Phase Demande formelle (M4)

- [ ] Checklist 11 documents (Soumis / Manquant)
- [ ] Circuit DG limité à la lettre de demande officielle
- [ ] Upload direct des 10 autres documents (avant/après réunion)
- [ ] Réunion formelle (réutilise pattern M3)
- [ ] Clôture de phase (sans décision recevable/non-recevable dans l'app)
- [ ] Verrou : phase non-clôturable tant que 11/11 documents non soumis

## Sprint 4 — Évaluation approfondie (M5)

- [ ] Upload facture + preuve de paiement (S5)
- [ ] Évaluation individuelle des 11 documents (Validé/Rejeté/À corriger)
- [ ] Re-upload ciblé par document rejeté, avec délai configurable
- [ ] Clôture de phase (pattern standard)

## Sprint 5 — Démonstration/Inspection (M6)

- [ ] Rôle `r3_agent` (file de dossiers propre, login séparé)
- [ ] Facture + preuve de paiement (réutilise pattern M5)
- [ ] Planification visite sur site (réutilise pattern réunion)
- [ ] Soumission avis R3 (verdict + note en une action)
- [ ] Clôture de phase automatique après avis R3 (aucune décision DN requise)

## Sprint 6 — Délivrance & Certificats (M7)

- [ ] Facture + preuve de paiement (réutilise pattern M5/M6)
- [ ] Création certificat à validation du paiement (statut `En préparation`)
- [ ] KPI temps-jusqu'à-délivrance : point zéro = validation paiement
- [ ] Suivi statuts : impression → signature → archivage → notification → retrait
- [ ] Override manuel du type de certificat par DN
- [ ] Compteur temps-jusqu'au-retrait (notification → `Retiré`)

## Sprint 7 — Documents (transverse, M8)

- [ ] Upload multi-format (PDF/Word/PNG/JPG)
- [ ] Corbeille (pas de purge auto) + rappel d'ancienneté pour SU
- [ ] Visibilité différenciée (postulant : ses docs + notes DN ; avis R3 masqué)

## Sprint 8 — Paiements (transverse, M9)

- [ ] Upload/consultation facture (aucun calcul de montant dans l'app)
- [ ] Statut terminal `Dossier rejeté` (libère la règle une-seule-demande)

## Sprint 9 — Réunions (transverse, M10)

- [ ] Vue calendrier transverse (tous rendez-vous, tous dossiers)
- [ ] Détection conflit dur (même agent, même créneau) → blocage
- [ ] Détection chevauchement doux (même agent, même jour) → avertissement

## Sprint 10 — Notifications (transverse, M11)

- [ ] Centre de notifications in-app (postulant + interne)
- [ ] Envoi email ciblé : certificat prêt, dossier rejeté, document à corriger
- [ ] Pas d'email pour changements de statut de routine

## Sprint 11 — Dashboard & Rapports (M12)

- [ ] KPIs : durée par phase, durée globale, volumes de demandes/délivrances
- [ ] Export PDF/Excel, plage de dates libre
- [ ] Génération rapport mensuel automatique (1er du mois)
- [ ] Génération manuelle à la demande (quota/jour à définir)
- [ ] Intégration IA (Gemini) : analyse + statut Non relu/Relu, édition avant validation

## Sprint 12 — Administration & Rôles (M13)

- [ ] Matrice de rôles (`reception`, `assistant_dg`, `dn_agent`, `dn_supervisor`,
      `r3_agent`, `s5_agent`, `SU`), multi-rôle supporté
- [ ] Repriser flux demande de compte postulant (anti-bot, anti-doublon, revue
      organisme, rejet motivé) — affiné du legacy `aidn-v2-legacy`
- [ ] Contacts multiples par organisme, permissions égales, étiquetage
      Principal/Secondaire/Tertiaire
- [ ] Panneau SU : gestion utilisateurs, corbeille documents, configuration
      (seuils d'alerte, délais dynamiques)

---

## Notes de méthode

- Chaque sprint ci-dessus correspond à un module de `project/modules-feasibility.md` —
  s'y référer pour les décisions de conception et cas limites déjà résolus avant
  d'implémenter quoi que ce soit
- Les patterns transverses (`technical/cross-cutting-patterns.md`) doivent être
  implémentés comme des modules/composants partagés, pas redéveloppés à chaque sprint
- Le suivi vivant (nouvelles idées, pistes non retenues) reste dans la base Notion
  « Idées & Pistes d'Exploration », pas dans ce fichier
