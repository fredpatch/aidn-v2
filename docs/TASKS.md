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
- [x] Renommer ancien repo en `aidn-v2-legacy` — https://github.com/fredpatch/aidn-v2-legacy.git
- [x] Schéma PostgreSQL initial (20 tables : users, user_roles, organisations,
      applicants, account_requests, requests, dg_circuit_documents, phases,
      meetings, preliminary_evaluation_forms, formal_request_documents,
      document_evaluations, site_inspections, payments, certificates,
      document_versions, notifications, reports, audit_logs,
      system_parameters — cette dernière ajoutée pendant le prérequis
      Auth & Utilisateurs du Sprint 1, voir plus bas)
- [x] `db:migrate` pointe vers un script personnalisé
      (`apps/api/src/scripts/migrate.ts`) plutôt que le CLI `drizzle-kit`
      brut — bug confirmé en amont (drizzle-kit@0.31.10) qui masque
      silencieusement les vraies erreurs de migration. Détail complet dans
      `exploration-cache/technical/gotchas.md`

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

### UI (React) - couche manquante identifiée après coup

L'implémentation initiale du Sprint 1 ne couvrait que l'API ; les deux
frontends sont maintenant construits et testés bout-en-bout (portail →
admin → retour portail, pas seulement des tests API isolés) :

- [x] `apps/admin` : Bootstrap (création SU), Login (matricule + OTP
      première connexion / mot de passe), liste des demandes avec actions
      de circuit (signer, transmettre, annuler), formulaire de saisie
      manuelle guichet (upload + soumission au nom d'un postulant)
- [x] `apps/portal` : Login postulant, formulaire de soumission de demande
      avec upload, vue statut de la demande active + historique, annulation
      tant que `Déposé`
- [x] Authentification postulant (email + mot de passe) — manquait
      initialement ; seule l'auth interne (SICOT-style) avait été
      construite. Création de compte reste M13 (Sprint 12) ; ceci ne
      couvre que la connexion pour un compte déjà existant
- [x] Module `uploads` générique (multer, disque local) — prérequis non
      identifié au départ, nécessaire pour que les formulaires puissent
      réellement joindre un fichier

### Prérequis ajouté en cours de sprint : Auth & Utilisateurs (calqué sur SICOT)

- [x] Authentification matricule + OTP première connexion + mot de passe
      (bcrypt), verrouillage après échecs répétés, JWT access+refresh en
      cookies httpOnly — même modèle que SICOT, adapté au multi-rôle
      (`user_roles` au lieu d'une colonne `role` unique)
- [x] Bootstrap du premier Super Admin (`/api/bootstrap/status`, `/init`)
- [x] Gestion des utilisateurs (création avec envoi OTP, liste, mise à jour,
      activation/désactivation, réinitialisation OTP) - réservé au rôle `SU`
      **— provisoire** : création manuelle (matricule/nom/email saisis à la
      main). Sera remplacée par une activation depuis l'annuaire personnel
      ANAC une fois construite (voir note sous Sprint 12)
- [x] `system_parameters` (équivalent des `parametres` SICOT) : seuils OTP,
      verrouillage, alerte parapheur - configurables sans redéploiement
- [x] Emails réels via Nodemailer (mêmes noms de variables d'env que SICOT :
      SMTP_HOST/PORT/USER/PASS/FROM, pour réutiliser les identifiants
      existants tel quel)

### Correction post-implémentation : UI/UX alignée sur SICOT (pas seulement les couleurs)

Le premier passage sur les écrans Bootstrap/Login/Layout n'avait repris que
les tokens de couleur ANAC de SICOT, pas sa structure réelle de composants.
Corrigé après retour explicite :

- [x] `Bootstrap`, `Login` (admin + portail), `Layout` (sidebar rétractable)
      reconstruits avec le même système que SICOT : react-hook-form + zod,
      framer-motion, primitives shadcn écrites à la main (`Button`, `Input`,
      `Label`), indicateur de force de mot de passe, arrière-plan à motif de
      grille
- [x] Authentification postulant repensée dans le même langage visuel
      (portail) — étape unique, pas de tabs OTP (l'applicant n'a pas de
      flux OTP)
- [x] Page `Utilisateurs` (SU uniquement) ajoutée — pas prévue initialement,
      mais nécessaire pour que le système multi-rôle du Sprint 1 soit
      utilisable via l'UI (sans elle, aucun moyen de créer un compte
      `dn_agent`/`reception` autrement qu'en curl)

### ✅ Résolu au début de la session suivante : builds admin ET portail cassés

Deux bugs réels trouvés en vérifiant l'état du repo avant de démarrer le Sprint 2 :
`apps/portal/src/lib/axios.ts` était référencé mais jamais créé (build portail cassé),
et `apps/admin/src/hooks/useAuth.tsx` importait depuis un chemin `@/src/lib/axios`
avec un `src/src` doublé (build admin cassé aussi, pas seulement le portail). Un
troisième bug lié a été trouvé au passage : la clé `sessionStorage` pour le message
« session expirée » était écrite en anglais (`session_expired`) mais lue en français
(`session_expiree`) — ne correspondait jamais. Tout corrigé et re-vérifié (typecheck +
build + flow complet contre un vrai Postgres). Détail complet dans
`exploration-cache/active-session/blockers.md`.

## Sprint 2 — Phase Préliminaire (M3)

- [x] Ouverture de phase M3 (`POST /api/phases/requests/:requestId/start-preliminary-phase`,
      dn_agent/dn_supervisor/SU) — passe la demande en `in_progress`
- [x] Planification réunion (date, ticket HTML simple téléchargeable — pas de
      génération PDF réelle ce sprint, voir décision ci-dessous)
- [x] Statuts réunion : tenue / No-Show / Reportée / Dossier annulé
      (`PATCH /api/meetings/:id/status`, `POST /api/meetings/:id/reschedule`)
- [x] Conflit dur (même agent, même créneau exact) → bloqué par contrainte DB ;
      chevauchement doux (même jour) → avertissement non bloquant
- [x] Mise à disposition Déclaration de pré-évaluation (post-réunion),
      s'appuie sur un modèle configurable par DN (voir module Modèles de
      documents ci-dessous)
- [x] Upload retour formulaire par postulant (portail)
- [x] Clôture de phase (doc attaché ou note facultative)
- [x] Délai de retour configurable dynamiquement par DN (paramètre par
      défaut 15 jours dans `system_parameters`, ajustable par instance)
- [x] UI admin complète : ouverture phase, planification/statuts réunion,
      ticket, mise à disposition + suivi déclaration, clôture
- [x] UI portail : ticket de réunion, téléchargement du formulaire vierge,
      soumission de la déclaration remplie

### Maintenance post-Sprint 2 (2026-07-09) — refactor de maintenabilité UI M3

- [x] Refactor de `PreliminaryPhasePage.tsx` en architecture modulaire
      (composants, hooks, helpers, API layer, types/constants) pour réduire
      le couplage et faciliter Sprint 3+
- [x] Migration des hooks M3 vers **React Query** (`useQuery`/`useMutation`)
      avec invalidation ciblée via clés de requêtes centralisées
- [x] Déplacement de la logique d'appels API M3 dans `src/lib/api/`
      (couche partagée, séparée du feature folder)
- [x] Infrastructure React Query globale branchée dans `main.tsx`
      (`QueryClientProvider` + defaults + devtools)
- [x] Extension de la convention React Query + `src/lib/api` aux domaines
      **Auth** et **Paramètres/Dev-tools** (hooks dédiés + query keys +
      invalidation)
- [x] Intégration de **shadcn Sonner** dans `apps/admin` et `apps/portal`
      (toaster global + helpers `notify` + notifications sur actions clés)
- [x] Préparation état global léger avec **Zustand** (`src/lib/stores/ui.store.ts`)
      pour usages UI cross-feature (sans mélange avec le server-state)
- [x] Extraction d'un composant de badge de statut réutilisable
      (`PhaseStatusBadge`) pour éviter la duplication de mapping visuel
- [x] Ajout d'un scaffold de tests helpers (`helpers.test.ts`) pour valider
      la logique pure de checklist/gating M3

### Convention frontend data-layer (adoptée le 2026-07-09)

- [x] Les appels API métier ne sont plus faits directement dans les pages :
      ils vivent dans `apps/admin/src/lib/api/*`
- [x] Les états serveur sont pilotés par React Query (`useQuery`/
      `useMutation`) avec invalidation via `queryKeys`
- [x] Les hooks feature/domain encapsulent les mutations et messages d'erreur,
      les pages restent des orchestrateurs UI
- [ ] **Suivi planifié (portail)** : appliquer la même convention
      React Query + `src/lib/api` au portail (auth/demandes/phase préliminaire)
      dans une passe dédiée, sans bloquer Sprint 3

### Module ajouté, anticipant M4 : Modèles de documents (`document_templates`)

Généralisé au-delà du seul besoin M3, sur demande explicite — les mêmes
formulaires DN-AIR-R2-3-F-E-010/011/012 de M4 en auront besoin :

- [x] Table `document_templates` (clé, libellé, fichier, historique via le
      pattern M8 version/corbeille)
- [x] 4 clés initiales : déclaration de pré-évaluation (M3),
      DN-AIR-R2-3-F-E-010/011/012 (M4, prêtes pour Sprint 3)
- [x] Page admin `Modèles de documents` (dn_agent/dn_supervisor/SU) —
      upload/remplacement par clé
- [x] Endpoint de téléchargement accessible aux deux types d'auth (staff +
      postulant)

### Décision : ticket HTML simple, pas de PDF généré

Confirmé avec Fred — un vrai générateur PDF est un besoin transverse (M3 + M4

- M6 en ont tous besoin) mieux construit une seule fois plus tard que trois
  fois maintenant. Le ticket de réunion est du HTML servi directement
  (`GET /api/meetings/:id/ticket`), pas un fichier stocké.

### 6 bugs réels trouvés et corrigés pendant ce sprint

1. **Contrôleurs plantant sur un corps de requête vide** (`req.body`
   `undefined` quand aucun body/Content-Type n'est envoyé) — bug systémique
   présent depuis le Sprint 1 (login, création d'utilisateur, soumission de
   demande...), pas seulement dans le nouveau code. Tous les contrôleurs
   déstructurent désormais `req.body ?? {}`.
2. **Collision de routage** : `phases.route.ts` applique un `router.use(authenticate,
requireRole(...))` global sans restriction de chemin ; monter les routes
   de `preliminary-evaluation` sous `/api/phases/*` les faisait intercepter
   par ce garde staff-only avant même d'atteindre `authenticateEither` —
   bloquant tout accès postulant. Déplacé vers son propre préfixe
   `/api/preliminary-evaluation`.
3. Ordre de vérification dans `openPreliminaryPhase` corrigé : la phase
   déjà-ouverte est maintenant détectée avant l'état de la demande, pour un
   message d'erreur plus clair en cas de double-ouverture.
4. Dérive trouvée entre schéma et `packages/shared` : `MEETING_STATUSES`
   dans `packages/shared` n'incluait pas `"scheduled"` (statut initial réel
   en base) — corrigé.
5. Nouvel endpoint `by-request/:requestId` ajouté pour que le portail
   assemble phase+réunion+déclaration en un seul appel, sans dépendre des
   routes staff-only de `phases`/`meetings` — testé avec isolation
   inter-postulant confirmée (un postulant ne peut pas lire la phase d'un
   autre).
6. `and`/`desc`/`meetings` manquants aux imports lors de l'ajout du bundle —
   détecté immédiatement par le typecheck.

Voir `exploration-cache/technical/gotchas.md` pour le détail complet.

## Sprint 3 — Phase Demande formelle (M4)

- [~] Checklist 11 documents (Soumis / Manquant) — API amorcée
- [~] Circuit DG limité à la lettre de demande officielle — API amorcée
- [~] Upload direct des 10 autres documents (avant/après réunion) — API amorcée
- [ ] Réunion formelle (réutilise pattern M3)
- [~] Clôture de phase (sans décision recevable/non-recevable dans l'app) — API amorcée
- [~] Verrou : phase non-clôturable tant que 11/11 documents non soumis — API amorcée

### Sprint 3 — avancement backend (2026-07-09, en cours)

- [x] Nouveau module API `formal-request` monté sous `/api/formal-request`
- [x] Démarrage phase M4 conditionné à la clôture M3
- [x] Circuit DG de la lettre de demande formelle (`submitted` -> `signed` -> `pending_review`)
- [x] Bundle `by-request/:requestId` (phase, circuit lettre, checklist docs, réunion, completionRate)
- [x] Upload par slot des documents formels + versioning M8 (`document_versions`, trash à remplacement)
- [x] Contrôles de clôture M4 : lettre transmise, 11/11 documents soumis, réunion résolue

### Sprint 3 — avancement frontend admin (2026-07-09, en cours)

- [x] Route admin M4 ajoutée : `/demandes/:requestId/phase-formelle`
- [x] Nouveau module UI `pages/phases/formal/*` (page, hooks, cartes, helpers, constantes)
- [x] Couche API admin M4 dans `apps/admin/src/lib/api/formal.api.ts` + types associés
- [x] Intégration React Query M4 (query keys `formal.*`, hooks mutations + invalidation)
- [~] UI admin M4 amorcée (lettre DG, checklist documents, réunion, clôture)
- [ ] UI portail M4 à implémenter

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
- [ ] **Remplacer la création manuelle d'utilisateur (Sprint 1) par une
      activation depuis l'annuaire personnel ANAC** — le legacy
      `aidn-v2-legacy` a déjà un module `personnel/` complet et fonctionnel
      à reprendre comme référence : interface `PersonnelAdapter` avec 2
      intégrations réelles (`ApiPersonnelAdapter` — API personnel ANAC
      externe ; `MariaPersonnelAdapter` — base MariaDB existante), plus un
      adaptateur mock pour le dev, sélectionnées via `PERSONNEL_SOURCE`.
      Flux : SU recherche dans l'annuaire par matricule/nom, puis
      `activateInternalAccount` crée le compte AIDN en récupérant
      fullName/email/service/direction depuis la fiche personnel (pas de
      saisie manuelle). **Attention** : le legacy est mono-rôle
      (`role: Role`) — garder notre modèle multi-rôle (`user_roles`) plutôt
      que reprendre cette limitation. Vérifier l'implémentation réelle côté
      SICOT une fois construite là-bas avant de bâtir la version AIDN
      (Idées & Pistes Notion, 2026-07-08)

---

## Notes de méthode

- Chaque sprint ci-dessus correspond à un module de `project/modules-feasibility.md` —
  s'y référer pour les décisions de conception et cas limites déjà résolus avant
  d'implémenter quoi que ce soit
- Les patterns transverses (`technical/cross-cutting-patterns.md`) doivent être
  implémentés comme des modules/composants partagés, pas redéveloppés à chaque sprint
- Le suivi vivant (nouvelles idées, pistes non retenues) reste dans la base Notion
  « Idées & Pistes d'Exploration », pas dans ce fichier
