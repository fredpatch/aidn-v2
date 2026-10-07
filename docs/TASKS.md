# AIDN v2 (nouveau repo) - TASKS

> Backlog de développement seedé à partir de l'étude de faisabilité module par module
> (`project/modules-feasibility.md`). Aucune ligne de code n'existe encore dans ce
> nouveau repo - ce fichier sert de point de départ, à raffiner au fur et à mesure de
> l'implémentation, sur le modèle du `docs/TASKS.md` de SICOT.
>
> Référence de logique métier déjà implémentée (mais non reprise telle quelle) :
> `aidn-v2-legacy` (ancien `aidn_v2`).

**Stack cible (validée) :** React + TypeScript + Tailwind CSS (frontend) / Node.js +
Express + TypeScript (backend) / **PostgreSQL + Drizzle ORM** (base de données) -
identique à SICOT. Voir `technical/conventions.md` (à créer) pour le détail complet
des conventions de code/naming.

**Décision base de données :** PostgreSQL retenu plutôt que MongoDB (utilisé par le
legacy `aidn-v2-legacy`) - les règles métier verrouillées (une seule demande active,
checklist 11/11, création certificat à validation paiement) sont des problèmes
d'intégrité relationnelle mieux garantis par contraintes SQL ; les KPIs (M12) et la
détection de conflit de créneaux (M10) sont des requêtes d'agrégation/chevauchement
naturelles en SQL. Migration des données historiques Mongo, si nécessaire, traitée
comme un ETL ponctuel.

---

## Sprint 0 - Fondations spec-first

- [x] Étude de faisabilité complète des 13 modules (M1–M13)
- [x] Patterns transverses consolidés (`technical/cross-cutting-patterns.md`)
- [x] Décision de stack technique : React+TS+Tailwind / Express+TS / **PostgreSQL +
      Drizzle ORM**
- [x] Conventions détaillées (`technical/conventions.md`) - naming, structure dossiers,
      style UI/UX ANAC
- [x] Init repo `aidn-v2` (monorepo, structure alignée SICOT)
- [x] Renommer ancien repo en `aidn-v2-legacy` - https://github.com/fredpatch/aidn-v2-legacy.git
- [x] Schéma PostgreSQL initial (20 tables : users, user_roles, organisations,
      applicants, account_requests, requests, dg_circuit_documents, phases,
      meetings, preliminary_evaluation_forms, formal_request_documents,
      document_evaluations, site_inspections, payments, certificates,
      document_versions, notifications, reports, audit_logs,
      system_parameters - cette dernière ajoutée pendant le prérequis
      Auth & Utilisateurs du Sprint 1, voir plus bas)
- [x] `db:migrate` pointe vers un script personnalisé
      (`apps/api/src/scripts/migrate.ts`) plutôt que le CLI `drizzle-kit`
      brut - bug confirmé en amont (drizzle-kit@0.31.10) qui masque
      silencieusement les vraies erreurs de migration. Détail complet dans
      `exploration-cache/technical/gotchas.md`

## Sprint 1 - Intake & Circuit DG (M1+M2)

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
- [x] Authentification postulant (email + mot de passe) - manquait
      initialement ; seule l'auth interne (SICOT-style) avait été
      construite. Création de compte reste M13 (Sprint 12) ; ceci ne
      couvre que la connexion pour un compte déjà existant
- [x] Module `uploads` générique (multer, disque local) - prérequis non
      identifié au départ, nécessaire pour que les formulaires puissent
      réellement joindre un fichier

### Prérequis ajouté en cours de sprint : Auth & Utilisateurs (calqué sur SICOT)

- [x] Authentification matricule + OTP première connexion + mot de passe
      (bcrypt), verrouillage après échecs répétés, JWT access+refresh en
      cookies httpOnly - même modèle que SICOT, adapté au multi-rôle
      (`user_roles` au lieu d'une colonne `role` unique)
- [x] Bootstrap du premier Super Admin (`/api/bootstrap/status`, `/init`)
- [x] Gestion des utilisateurs (création avec envoi OTP, liste, mise à jour,
      activation/désactivation, réinitialisation OTP) - réservé au rôle `SU`
      **- durci 2026-07-28** : création interne adossée à l'annuaire Personnel
      ANAC (recherche/liste live, préremplissage depuis la fiche agent, validation
      matricule avant création). Le mode manuel ne reste acceptable qu'en fallback
      local explicite via `PERSONNEL_ANAC_ENFORCE=false`. Les matricules sont
      conservés au format canonique à 4 chiffres (`0041`, jamais `41`).
- [x] `system_parameters` (équivalent des `parametres` SICOT) : seuils OTP,
      verrouillage, alerte parapheur - configurables sans redéploiement
- [x] **SEED-1A** (2026-09-25) - paramètres système garantis à chaque démarrage
      de l'API (`modules/seeding`) : création des clés manquantes uniquement,
      valeurs existantes jamais écrasées, idempotence par élément (pas de drapeau
      « seed terminé »), verrou advisory PostgreSQL entre instances, échec du
      seed = échec du démarrage. `npm run seed:params` réutilise la même
      implémentation (définitions uniques dans `seeds/system-parameters.seed.ts`).
- [x] **SEED-1B** (2026-09-25) - modèles de documents officiels installés au
      démarrage si la clé n'existe pas (copies DN approuvées dans
      `apps/api/seed-assets/document-templates/`, correspondance clé -> fichier
      explicite, F-E-015 = `preliminary_evaluation_declaration`). Un modèle
      existant n'est jamais remplacé ni réparé, même cassé. Création atomique
      (modèle + version courante + upload asset + audit sans acteur), fichier
      copié supprimé si la transaction échoue. `npm run seed` = tout,
      `npm run seed:params` = paramètres uniquement.
- [x] **SEED-2** (2026-09-25) - Paramètres → État du système (SU) :
      `GET /api/seeding/status` (observe : paramètres, modèles officiels
      conforme/manquant/fichier introuvable/inactif/non vérifié, base de données,
      stockage ; 200 même base inaccessible) et `POST /api/seeding/run` (même
      `runSeeds()` que le démarrage, crée seulement les manquants, audit
      `REFERENCE_DATA_SEED_RUN`, 409 si verrou occupé). Précédence d'état
      partagée (`classifyTemplateHealth`, `@aidn/shared`) avec Modèles de
      documents. `UPLOADS_ROOT` canonique pour service statique, uploads,
      modèles et santé.
- [x] **SEED-2b** (2026-09-25) - État du système : espace utilisé par la base
      (`pg_database_size`) et espace libre/total du disque des uploads
      (`fs.statfs` sur `UPLOADS_ROOT`) ; « Espace faible » (attention) sous 10 %
      libres (`LOW_STORAGE_FREE_RATIO`). L'espace libre du serveur de base de
      données n'est pas mesurable en SQL et n'est pas affiché.
- [x] **UPLOADS-ROOT** (2026-09-25, via STORAGE-0A) - dev-tools, rapports,
      certificats, uploads, modèles et santé utilisent `UPLOADS_ROOT` ; plus aucun
      chemin d'upload basé sur `process.cwd()`
- [x] **UPLOAD-REJECT-CLEANUP** (2026-09-29, via STORAGE-0B) - type refusé par
      le `fileFilter` Multer (jamais écrit), fichier vide ou échec d'insertion :
      fichier supprimé immédiatement
- [x] **STORAGE-0A** (2026-09-25) - livraison sécurisée des fichiers : `/api/files/:id`,
      contrôle d'accès par type de document, liens signés 5 min, fichiers
      générés enregistrés comme assets, réécriture des adresses `/uploads/…`,
      fermeture du `/uploads` public. Spec :
      `docs/superpowers/specs/2026-09-25-storage-0a-design.md` (implémenté ;
      rewrite à exécuter en staging avec sauvegarde vérifiée)
- [x] **STORAGE-0B** (2026-09-29) - rattachement par `uploadAssetId` uniquement :
      adresse, MIME et uploader dérivés de `upload_assets` ; l'acteur doit être
      l'uploader (SU compris) ; rattachement + écriture métier + version + audit
      dans une transaction (cible verrouillée puis asset) ; rattachement
      idempotent ; nettoyage des orphelins verrouillé (`SKIP LOCKED`) ; IDOR
      corrigés (resoumission M5, preuves M5/M6/M7) ; bug de corbeille des
      comptes-rendus corrigé ; réparation des liens manquants dans
      `storage:rewrite-addresses`. Spec :
      `docs/superpowers/specs/2026-09-29-storage-0b-design.md`
- [ ] **STORAGE-0B-STAGING** (bloquant avant déploiement) - en staging :
      `upload_orphan_retention_days=3650` + requêtes de
      `scripts/storage-0b-risk-check.sql` AVANT déploiement ; déployer (la
      réparation des liens passe par l'étape rewrite du script de déploiement) ;
      relancer les requêtes ; remettre la rétention (14) seulement quand la
      requête 2 renvoie 0 ligne
- [x] **FILE-CONTENT-VALIDATION** (2026-10-01) - le contenu réel est vérifié à
      l'intake (octets magiques PDF/PNG/JPEG ; OLE2 identifié par le flux
      `WordDocument`, pas la seule signature générique ; DOCX par la structure
      de l'archive ZIP, `.docm`/macro rejetés) au lieu du seul MIME déclaré par
      le navigateur ; extension/MIME déclaré/contenu doivent tous concorder ;
      MIME canonique persisté. Dépendances `adm-zip`/`cfb` (reporté de
      STORAGE-0B, D8)
- [ ] **TEST-DB-HARNESS** - base de test d'intégration réutilisable (transactions,
      verrous, rollbacks) ; STORAGE-0B est validé par un script local sur copie
      jetable de la base (D12)
- [x] **VERSION-CURRENT-DISCIPLINE** (2026-10-01) - facture, preuve de paiement,
      resoumission M5 et le cycle certificat (généré/régénéré/signé) mettent
      désormais la version précédente à la corbeille avant d'insérer la
      nouvelle version courante ; clôture de phase et compte-rendu de réunion
      durcis au même mécanisme inconditionnel ; index unique partiel
      `document_versions_one_current_per_owner` (owner_type, owner_id) WHERE
      is_current = true en garde-fou base de données ; génération de
      certificat verrouille la ligne `certificates` (FOR UPDATE) pour empêcher
      une double génération concurrente. Historique complet préservé
      (`trashed_at`), rien n'est jamais supprimé. `INVOICE-REUPLOAD-STATUS`
      reste hors périmètre.
- [x] **INVOICE-REUPLOAD-STATUS** (2026-10-01) - remplacement de facture
      autorisé avant validation ; preuve courante invalidée si le remplacement
      intervient en attente de validation ; statut remis à `awaiting_proof`
      après remplacement ; bloqué pour un paiement déjà validé ou un dossier
      rejeté ; historique (facture et preuve) préservé ; même comportement
      partagé M5/M6/M7
- [ ] **DEMO-SEED-LEGACY-ADDRESSES** - `seed-analytics-demo-data.ts` (dev)
      écrit encore des adresses `/uploads/demo/...` sans asset
- [ ] **STORAGE-1 → 4**, **INFRA-BACKUP-1** (prérequis de toute migration de
      données en staging/production) - voir la spec STORAGE-0A §1
- [x] **FILE-REFS-1** (2026-10-01) - audit du modèle de référence fichier :
      les champs `*FileUrl` dénormalisés restent (aucune incohérence trouvée,
      toujours écrits dans la même transaction que la version `document_versions`
      correspondante) ; pas de FK `document_versions.upload_asset_id` (aucun
      bénéfice concret - adresse stable garantie par construction, suppression
      impossible tant qu'un asset reste lié) ; vérification lecture seule sans
      référence invalide/orpheline. **FILE-REFS-1A** : `currentDocumentUrl`
      exposé dans `CertificateView` (résolu depuis `document_versions`) pour
      retrouver le certificat généré après rechargement, sans nouvelle colonne
      ni FK
- [x] **REPORT-FILE-ROLLBACK** (2026-09-30, STORAGE-3B) - le fichier généré
      avant la transaction est supprimé (best-effort, échec journalisé) si
      l'insertion échoue ; voir `cleanupGeneratedFileOnFailure` dans
      `apps/api/src/modules/files/generated-file-cleanup.ts`
- [ ] **FILE-TYPE-ICONS** - `DocumentFileIcon` déduit l'icône de l'extension de
      l'URL ; avec les adresses stables l'icône est générique (exposer le MIME
      dans les bundles)
- [x] **DEV-DB-MIGRATION-BASELINE** (2026-10-01) - 5 fichiers SQL orphelins
      (jamais référencés par `_journal.json`, déjà absorbés dans
      `0000_deep_satana`) supprimés ; chaîne de snapshots `meta/` réparée en
      linéaire 0000→0001→0002 (`db:generate` ne collisionnait plus et ne
      générait aucune migration, `schema.ts` inchangé) ; rejeu validé sur base
      vide (idempotent) ; base de dev locale réinitialisée (`db:migrate` +
      seeds) - table `drizzle.__drizzle_migrations` ne contient plus que les 3
      hash authentiques, dans l'ordre. Nouveaux scripts `db:status` (lecture
      seule, réutilise `readMigrationFiles` de drizzle-orm) et `db:reset:dev`
      (refuse tout hôte non loopback ou nom production/staging)
- [ ] **DROP-MEETING-TICKET-URL** - supprimer `meetings.ticket_document_url`
      (non utilisée, écrite seulement par le seed de démo analytique)
- [x] **MEETINGS-IDOR** (2026-10-01, dette sécurité) - `GET /api/meetings/:id`
      et `/:id/ticket` vérifient maintenant l'appartenance au dossier
      (postulant : phase→demande→`applicantId`, sinon 404 `MEETING_NOT_FOUND` -
      jamais 403, pour ne pas révéler l'existence d'une réunion d'un autre
      dossier) ; accès personnel restreint à `dn_agent`/`dn_supervisor`/`SU`
      (`requireApplicantOrRole`) ; génération du ticket réutilise le même
      contexte autorisé au lieu de requêter à nouveau.
- [ ] **TEMPLATE-ACTIVATION** - flux dédié d'activation/désactivation des
      modèles (aujourd'hui un modèle inactif ne se corrige qu'en base)
- [x] **DG-WORKING-DAYS** (2026-09-25) - le circuit DG compte les jours ouvrés
      (lundi-vendredi, heure de Libreville, hors jours fériés du nouveau
      paramètre `public_holidays` : AAAA-MM-JJ ou MM-JJ). Alerte
      (`subtractWorkingDays`) et cible « retour signature » du tableau de bord
      (DN, réception, délai moyen, compteur hors délai) utilisent le même calcul
      (`@aidn/shared/workingDays`). `public_holidays` est vide par défaut : DN
      doit saisir la liste officielle.
- [x] **PARAM-VALIDATION** (2026-09-25) - `PATCH /api/system-parameters/:key`
      valide avec les mêmes règles que l'admin (`validateParameterValue`,
      `@aidn/shared`) : entier 1-3650, booléen, texte non vide ≤ 500 caractères,
      dates valides pour `public_holidays` ; valeur stockée normalisée ;
      400 `INVALID_PARAMETER_VALUE` sinon.
- [ ] **SEED-1C** - consolider les valeurs de repli (`getIntegerValue` fallbacks,
      `DEFAULT_*` de `@aidn/shared`, `DASHBOARD_SLA_DEFAULTS`) sur les définitions
      de seed
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
      (portail) - étape unique, pas de tabs OTP (l'applicant n'a pas de
      flux OTP)
- [x] Page `Utilisateurs` (SU uniquement) ajoutée - pas prévue initialement,
      mais nécessaire pour que le système multi-rôle du Sprint 1 soit
      utilisable via l'UI (sans elle, aucun moyen de créer un compte
      `dn_agent`/`reception` autrement qu'en curl)

- [x] Page `Gestion des utilisateurs` durcie en cockpit maintenable :
      onglets `Comptes AIDN` / `Personnel ANAC`, resumes KPI,
      recherche/filtres, pagination, panneau de detail lateral, activation
      depuis Personnel ANAC, modification de roles, suspension et
      reinitialisation OTP. Le fichier page est desormais un orchestrateur ;
      logique, constantes, helpers et composants ont ete extraits sous
      `apps/admin/src/pages/users/`.
- [x] Durcissement UI utilisateurs 2026-08-04 : filtres AIDN remplaces par le
      `Select` partage, listes AIDN et Personnel ANAC rendues avec la primitive
      `Table`, pagination via composant commun.

### ✅ Résolu au début de la session suivante : builds admin ET portail cassés

Deux bugs réels trouvés en vérifiant l'état du repo avant de démarrer le Sprint 2 :
`apps/portal/src/lib/axios.ts` était référencé mais jamais créé (build portail cassé),
et `apps/admin/src/hooks/useAuth.tsx` importait depuis un chemin `@/src/lib/axios`
avec un `src/src` doublé (build admin cassé aussi, pas seulement le portail). Un
troisième bug lié a été trouvé au passage : la clé `sessionStorage` pour le message
« session expirée » était écrite en anglais (`session_expired`) mais lue en français
(`session_expiree`) - ne correspondait jamais. Tout corrigé et re-vérifié (typecheck +
build + flow complet contre un vrai Postgres). Détail complet dans
`exploration-cache/active-session/blockers.md`.

## Sprint 2 - Phase Préliminaire (M3)

- [x] Ouverture de phase M3 (`POST /api/phases/requests/:requestId/start-preliminary-phase`,
      dn_agent/dn_supervisor/SU) - passe la demande en `in_progress`
- [x] Planification réunion (date, ticket HTML simple téléchargeable - pas de
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

### Maintenance post-Sprint 2 (2026-07-09) - refactor de maintenabilité UI M3

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

### Correctif PRELIM-DG-CIRCUIT-1 (2026-10-05) - circuit DG obligatoire avant clôture M3

Défaut métier confirmé : la déclaration de pré-évaluation du postulant rendait la
phase M3 clôturable sans jamais passer par le circuit physique de signature DG
(Réception/Assistant DG), alors que `closePhase()` ne vérifiait que
`preliminaryEvaluationForms.submittedFileUrl`, sans aucune connaissance du circuit.

- [x] Ajout de `pre_evaluation` à `dg_circuit_entity_type` (migration additive,
      `entityType=pre_evaluation` + `requestId` existant, pas de nouvelle table,
      pas de nouvelle colonne FK)
- [x] La soumission du postulant crée désormais, dans la même transaction, à la
      fois son propre document et l'identité propre du circuit DG - avec une
      **copie physique serveur** du fichier (jamais le même `upload_assets` que
      le postulant), car `upload_assets.linkedOwnerType` ne supporte qu'un seul
      propriétaire lié et l'autorisation d'accès fichier se résout uniquement par
      ce lien (le stage M3 n'autorise que DN, seul le stage `dg_circuit` autorise
      Réception/Assistant DG) - voir `project/decisions.md`
- [x] Règle "un seul envoi" : une deuxième soumission de la déclaration est
      bloquée (`DECLARATION_ALREADY_SUBMITTED`, 409), y compris avant démarrage
      du circuit
- [x] Extension générique de `courrier-tasks` (source `pre_evaluation`, aucune
      nouvelle corbeille/action) pour que Réception/Assistant DG traitent ce
      circuit via l'inbox `Courriers à traiter` existante
- [x] Garde de clôture M3 : réunion résolue ET déclaration soumise ET circuit
      existant ET `circuit.status === 'pending_review'`, sinon
      `PRELIMINARY_DG_RETOUR_REQUIRED` (409) - explicitement scopé à
      `phase.phaseCode === 'M3'`, sans impact sur les autres phases
- [x] UI DN (`DeclarationCard`) : statut du circuit en lecture seule + lien vers
      le retour signé une fois `pending_review` ; UI portail recentrée sur le
      traitement ANAC sans exposer le circuit DG interne
- [x] Validé par un scénario UAT complet en conditions réelles (DB jetable,
      serveur réel, JWT réels, 5 acteurs) : copie applicant/circuit/retour-signé
      systématiquement sur 3 `upload_assets` distincts, accès fichier correct
      par rôle, M4 atteignable immédiatement après clôture M3

### Convention frontend data-layer (adoptée le 2026-07-09)

- [x] Les appels API métier ne sont plus faits directement dans les pages :
      ils vivent dans `apps/admin/src/lib/api/*`
- [x] Les états serveur sont pilotés par React Query (`useQuery`/
      `useMutation`) avec invalidation via `queryKeys`
- [x] Les hooks feature/domain encapsulent les mutations et messages d'erreur,
      les pages restent des orchestrateurs UI
- [x] **Suivi portail** : appliquée la même convention React Query + `src/lib/api`
      au module `MyRequestPage` (demandes, phase préliminaire, phase formelle)
      sans bloquer Sprint 3

### Module ajouté, anticipant M4 : Modèles de documents (`document_templates`)

Généralisé au-delà du seul besoin M3, sur demande explicite - les mêmes
formulaires DN-AIR-R2-3-F-E-010/011/012 de M4 en auront besoin :

- [x] Table `document_templates` (clé, libellé, fichier, historique via le
      pattern M8 version/corbeille)
- [x] 4 clés initiales : déclaration de pré-évaluation (M3),
      DN-AIR-R2-3-F-E-010/011/012 (M4, prêtes pour Sprint 3)
- [x] Page admin `Modèles de documents` (dn_agent/dn_supervisor/SU) -
      upload/remplacement par clé
- [x] Endpoint de téléchargement accessible aux deux types d'auth (staff +
      postulant)

### Décision : ticket HTML simple, pas de PDF généré

> **Révisée le 2026-10-07 (Batch L)** : le ticket est désormais une invitation
> PDF générée par Puppeteer, à la même URL. Voir *Invitation PDF L* plus bas.

Confirmé avec Fred - un vrai générateur PDF est un besoin transverse (M3 + M4

- M6 en ont tous besoin) mieux construit une seule fois plus tard que trois
  fois maintenant. Le ticket de réunion est du HTML servi directement
  (`GET /api/meetings/:id/ticket`), pas un fichier stocké.

### 6 bugs réels trouvés et corrigés pendant ce sprint

1. **Contrôleurs plantant sur un corps de requête vide** (`req.body`
   `undefined` quand aucun body/Content-Type n'est envoyé) - bug systémique
   présent depuis le Sprint 1 (login, création d'utilisateur, soumission de
   demande...), pas seulement dans le nouveau code. Tous les contrôleurs
   déstructurent désormais `req.body ?? {}`.
2. **Collision de routage** : `phases.route.ts` applique un `router.use(authenticate,
requireRole(...))` global sans restriction de chemin ; monter les routes
   de `preliminary-evaluation` sous `/api/phases/*` les faisait intercepter
   par ce garde staff-only avant même d'atteindre `authenticateEither` -
   bloquant tout accès postulant. Déplacé vers son propre préfixe
   `/api/preliminary-evaluation`.
3. Ordre de vérification dans `openPreliminaryPhase` corrigé : la phase
   déjà-ouverte est maintenant détectée avant l'état de la demande, pour un
   message d'erreur plus clair en cas de double-ouverture.
4. Dérive trouvée entre schéma et `packages/shared` : `MEETING_STATUSES`
   dans `packages/shared` n'incluait pas `"scheduled"` (statut initial réel
   en base) - corrigé.
5. Nouvel endpoint `by-request/:requestId` ajouté pour que le portail
   assemble phase+réunion+déclaration en un seul appel, sans dépendre des
   routes staff-only de `phases`/`meetings` - testé avec isolation
   inter-postulant confirmée (un postulant ne peut pas lire la phase d'un
   autre).
6. `and`/`desc`/`meetings` manquants aux imports lors de l'ajout du bundle -
   détecté immédiatement par le typecheck.

Voir `exploration-cache/technical/gotchas.md` pour le détail complet.

## Sprint 3 - Phase Demande formelle (M4) - ✅ Terminé (confirmé 2026-07-27)

- [x] Checklist 11 documents (Soumis / Manquant)
- [x] Circuit signature limité à la lettre de demande officielle
- [x] Upload direct des 10 autres documents par le postulant (avant/après réunion)
- [x] Réunion formelle (réutilise pattern M3)
- [x] Clôture de phase (sans décision recevable/non-recevable dans l'app)
- [x] Verrou : phase non-clôturable tant que 11/11 documents non soumis

### Sprint 3 - avancement backend (2026-07-09, en cours)

- [x] Nouveau module API `formal-request` monté sous `/api/formal-request`
- [x] Démarrage phase M4 conditionné à la clôture M3
- [x] Circuit signature de la lettre de demande formelle (`submitted` -> `in_signature_circuit` -> `pending_review`)
- [x] Bundle `by-request/:requestId` (phase, circuit lettre, checklist docs, réunion, completionRate)
- [x] Upload par slot des documents formels par le postulant ; DN consulte uniquement
- [x] Contrôles de clôture M4 : retour signé scanné, 11/11 documents soumis, réunion résolue

### Sprint 3 - durcissement workflow Phase 2 (2026-07-28)

- [x] Audit du legacy `aidn-v2-legacy` enregistré dans
      `exploration-cache/project/legacy-phase2-courrier-audit.md`
- [x] Nouveau module API `courrier-tasks` pour centraliser les courriers à imprimer,
      mettre en signature et scanner au retour signé
- [x] Page admin `Courriers a traiter` pour `reception`, `assistant_dg`, `SU`
- [x] Page DN M4 : lettre formelle et documents du postulant en lecture seule
- [x] Planification réunion formelle bloquée tant que la lettre officielle n'est pas
      revenue signée et scannée (`pending_review`)
- [x] Upload/remplacement des pièces M4 interdit aux rôles internes côté API et UI
- [x] Accès `Demandes`/pages de phase réservé à DN/SU ; les autres rôles utilisent
      leurs écrans dédiés
- [x] Conflit agenda réunion corrigé : seuls les rendez-vous encore `scheduled`
      occupent un créneau ; migration `0003_meeting_active_slot_index.sql`

### Correctif M4-START-AUTH-1 (2026-10-05) - accès DN/SU bloqué sur le bundle M4

Bloqueur confirmé en UAT juste après la clôture M3 : DN ouvrant la phase M4
recevait `"Accès réservé au portail postulant."` au lieu de voir
`"Démarrer la Phase - Demande Formelle"`, bien que `openFormalPhase()` et l'écran
de démarrage existent déjà et soient corrects.

- [x] Cause : `GET /formal-request/by-request/:requestId` et
      `POST /formal-request/requests/:requestId/letter` empilaient
      `requireApplicant` devant `requireApplicantOrRole(...)` - `requireApplicant`
      (prévu pour des écritures strictement portail) rejette tout acteur staff
      avant que le contrôle de rôle ne s'exécute, rendant la liste de rôles
      permise totalement inopérante
- [x] Correction minimale : suppression de `requireApplicant` sur ces deux routes,
      alignement sur le pattern déjà utilisé par M3/M5/M6/M7/réunions
      (`authenticateEither, requireApplicantOrRole(...)` seul) - aucun changement
      de `checkApplicantOwnership()`, de service, de schéma ni de frontend
- [x] Effet de bord corrigé en même temps (même cause) : la soumission de la
      lettre officielle "au nom du postulant" par DN/SU depuis l'admin, déjà
      prévue par le code/l'UI existants, était elle aussi bloquée
- [x] 4 routes "preuve de paiement"/"resoumission" (M5/M6/M7) présentent un
      écart comparable entre commentaire et code (staff-on-behalf documenté
      mais non câblé) - identifiées mais volontairement non corrigées ici,
      à auditer séparément
- [x] Validé par un scénario UAT complet (DB jetable, serveur réel) : lecture
      DN/SU/postulant propriétaire/postulant tiers/rôle non autorisé, démarrage
      M4, 11 créneaux, soumission de lettre par DN et par le postulant - 15/15

### Sprint 3 - avancement frontend admin (2026-07-09, en cours)

- [x] Route admin M4 ajoutée : `/demandes/:requestId/phase-formelle`
- [x] Nouveau module UI `pages/phases/formal/*` (page, hooks, cartes, helpers, constantes)
- [x] Couche API admin M4 dans `apps/admin/src/lib/api/formal.api.ts` + types associés
- [x] Intégration React Query M4 (query keys `formal.*`, hooks mutations + invalidation)
- [x] UI admin M4 (lettre DG, checklist documents, réunion, clôture)
- [x] UI admin M4 durcie : circuit lettre externalisé vers `Courriers a traiter`,
      documents applicant-owned en consultation seule côté DN

### Sprint 3 - avancement frontend portail (2026-07-10, en cours)

- [x] `MyRequestPage` enrichie : section M3 polish (statuts lisibles, liens API centralisés, libellés FR)
- [x] Première section M4 intégrée côté portail (`FormalPhaseSection`) : lettre officielle + checklist docs + réunion
- [x] Refactor portail vers convention React Query + `src/lib/api` (module requests désormais split en hooks/components/api/types)
- [x] Finalisation UI portail M4 (orchestration modulaire, hooks dédiés, invalidation)

## Sprint 4 - Évaluation approfondie (M5) - ✅ Terminé (confirmé 2026-07-27)

- [x] Upload facture + preuve de paiement (S5)
- [x] Évaluation individuelle des 11 documents (Validé/Rejeté/À corriger)
- [x] Re-upload ciblé par document rejeté, avec délai configurable
- [x] Clôture de phase (pattern standard)

### Sprint 4 - implémentation complète (confirmé 2026-07-27)

- [x] Module API `deep-evaluation` monté sous `/api/deep-evaluation`
- [x] Endpoints M5 : bundle, ouverture, facture, preuve, validation/rejet paiement,
      verdict document, resoumission, clôture
- [x] Route/page admin : `/demandes/:requestId/evaluation-approfondie` - 17 fichiers
      (page, hooks, cartes PaymentCard/DocumentEvaluationsCard/ClosureCard, api/types/constants/helpers)
- [x] Query keys admin `deepEvaluation.*`

### Sprint 4 - durcissement roles/UX (2026-07-28)

- [x] Facture M5 et validation/rejet paiement reserves a `s5_agent`/`SU`
      cote API.
- [x] Preuve de paiement M5 et corrections documentaires reservees au portail
      postulant ; les uploads admin de correction ont ete retires.
- [x] DN consulte le paiement M5 en lecture seule et continue le traitement apres
      validation S5.
- [x] Page `Paiements S5` ajoutee ; S5 arrive sur une inbox de paiement et ouvre
      une vue compacte paiement-only.
- [x] Page `Paiements S5` redesignée en cockpit opérationnel : factures reçues à
      transmettre, preuves attendues, preuves à valider, historique validé/rejeté
      conservé même après clôture de phase.
- [x] Durcissement UI S5 2026-08-04 : liste des paiements paginee, tri via
      `Select` partage et table remplacee par la primitive `Table`.
- [x] Visualiseur admin simplifie : bouton `Imprimer` retire, verdicts DN
      disponibles directement depuis la previsualisation M5.
- [x] Intégration portail : section `DeepEvaluationSection` dans la carte de demande active
- [x] Typecheck propre sur les 3 workspaces (api, admin, portal) - vérifié 2026-07-27

## Sprint 5 - Démonstration/Inspection (M6) - Terminé (2026-07-27)

- [x] Rôle `r3_agent` (file de dossiers propre - auth staff existante réutilisée, pas de login séparé, décision confirmée)
- [x] Facture + preuve de paiement (réutilise pattern M5)
- [x] Planification visite sur site (réutilise pattern réunion, `meetingType: 'site_visit'`)
- [x] Soumission avis R3 (verdict + note en une action)
- [x] Clôture de phase automatique après avis R3 (aucune décision DN requise)
- [x] UI portail - soumission preuve de paiement, statut visite en lecture seule

### Sprint 5 - visibilité documentaire (2026-07-27)

- [x] **Fix sécurité** : `GET /site-inspection/by-request/:requestId` renvoyait `inspection`
      (avis R3) à tout appelant authentifié, y compris le postulant via `authenticateEither`.
      Corrigé pour ne renvoyer ce champ qu'aux appelants staff - l'avis R3 est
      DN-interne uniquement (`modules-feasibility.md`, section visibilité documentaire),
      jamais exposé même en lecture seule au postulant.

### Sprint 5 - implémentation (2026-07-27)

- [x] Module API `site-inspection` monté sous `/api/site-inspection` - aucune migration
      nécessaire (`r3_agent`, `site_inspections`, `inspection_verdict`, `M6`, `site_visit`
      étaient déjà schéma-prêts)
- [x] Endpoint utilitaire `GET /api/users/by-role/:role` ajouté (staff, non SU-only) -
      nécessaire pour que DN puisse choisir l'agent R3 lors de la planification
- [x] Admin : route `/demandes/:requestId/demonstration-inspection`, page + cartes
      (Paiement, Visite sur site, Avis R3), hooks React Query, `lib/api/site-inspection.*`
- [x] Admin : page `Mes Inspections` (`/mes-inspections`), nav scopée `r3_agent`/`SU`,
      liste les dossiers M6 ouverts avec une visite assignée à l'agent connecté
- [x] Portail : `SiteInspectionSection` dans `ActiveRequestCard` - preuve de paiement,
      statut de la visite en lecture seule ; avis R3 jamais affiché (voir ci-dessus)
- [x] Typecheck propre sur les 3 workspaces (api, admin, portal) - vérifié 2026-07-27
- Décision (non explicite dans la spec, à confirmer si besoin) : planification de la
  visite gatée sur facture envoyée seulement ; validation complète du paiement gatée
  sur la soumission de l'avis R3 (comme M3/M4/M5)

### Sprint 5 - durcissement roles/UX (2026-07-28)

- [x] Facture M6 et validation/rejet paiement reserves a `s5_agent`/`SU`
      cote API ; DN voit le paiement en lecture seule.
- [x] Preuve de paiement M6 reservee au portail postulant.
- [x] Page `Paiements S5` agrege les taches M5 et M6 avec vues compactes
      paiement-only.
- [x] Historique S5 conservé pour M6 : les paiements validés/rejetés restent visibles
      dans l'inbox même si la phase n'est plus ouverte.
- [x] `r3_agent` peut ouvrir les inspections assignees depuis `Mes Inspections`.
- [x] API M6 verifie que le R3 connecte est assigne avant d'exposer le bundle ou
      d'accepter l'avis.
- [x] R3 dispose d'une vue compacte visite + Avis R3, peut marquer sa visite comme
      tenue, puis soumettre l'avis qui cloture la phase.

### Correctif M6-RESCHEDULE-1 (2026-10-06) - visite reprogrammée : ancienne ligne prise pour la courante

`rescheduleMeeting()` conserve l'ancienne réunion (statut `rescheduled`) et en crée
une nouvelle. M3/M4 excluaient déjà `rescheduled` ; les requêtes M6 non, et
prenaient la première ligne `site_visit` trouvée - donc potentiellement la visite
remplacée, y compris quand la reprogrammation change d'agent R3.

- [x] Bundle M6 (portail + admin) : renvoyait la visite remplacée - corrigé en
      Batch F1 (`getBundleForRequest`)
- [x] `assertR3AssignedToRequest` : l'ancien R3 gardait l'accès au dossier
      (contrôle d'accès) - corrigé
- [x] `submitInspectionVerdict` : le R3 courant ne pouvait pas soumettre l'avis
      (`SITE_VISIT_NOT_ASSIGNED`), et l'avis pouvait être rattaché à la visite
      remplacée - corrigé (exclusion + visite la plus récente)
- [x] `getMyQueue` : mission obsolète dans la file de l'ancien R3, dossier en
      double - corrigé
- [x] `getR3DashboardSummary` : mission comptée deux fois (indicateurs et
      pourcentages faussés) - corrigé
- [x] Garde-fou : `site-visit-reschedule.invariant.test.ts` (statique, sans DB)
      échoue si une requête `site_visit` n'exclut pas `rescheduled`
- [x] Validé sur DB réelle (reprogrammation avec changement de R3) : 7/7 après
      correctif, 5 échecs sur le code d'origine ; suite API 256/256

## Sprint 6 - Délivrance & Certificats (M7) - Terminé (2026-07-27)

- [x] Facture + preuve de paiement (réutilise pattern M5/M6)
- [x] Création certificat à validation du paiement (statut `En préparation`)
- [x] KPI temps-jusqu'à-délivrance : point zéro = validation paiement
- [x] Suivi statuts : impression → signature → archivage → notification → retrait
- [x] Override manuel du type de certificat par DN
- [x] Compteur temps-jusqu'au-retrait (notification → `Retiré`)
- [x] UI portail - preuve de paiement, statut simplifié, pas de téléchargement
      (retrait toujours en personne)

### Sprint 6 - implémentation (2026-07-27)

- [x] Templates HTML/CSS finaux (Fred) : logo intégré en base64, layout par
      tables (pas de CSS Grid sauf le bloc header), `renderCertificate(data)`
      exposé en JS pour peupler les 22 champs via `data-field`
- [x] Schéma : `certificates.scopeDetails` (jsonb, forme fixe à 4 catégories -
      pas une liste dynamique, verrouillé avec Fred), champs DN (référence
      d'approbation, dates, override DG)
- [x] Module API `certificates` monté sous `/api/certificates` - génération
      via Puppeteer (`page.setContent` + `page.evaluate(renderCertificate)` +
      `page.pdf()`), stockage via `document_versions`
      (`ownerType: 'certificate_document'`)
- [x] Admin : route `/demandes/:requestId/delivrance`, cartes Paiement /
      Informations certificat / Classes-qualifications / Génération-cycle
- [x] Portail : `CertificatesSection` dans `ActiveRequestCard` - statuts
      imprimé/signé/archivé regroupés en "en préparation" (détail interne DN
      non pertinent pour le postulant), aucun lien de téléchargement du
      document généré (retrait physique uniquement)
- [x] Typecheck propre sur les 3 workspaces - vérifié 2026-07-27
- [x] Génération Puppeteer confirmée fonctionnelle par Fred en conditions
      réelles (2026-07-27) - le rendu du PDF depuis le template HTML final
      fonctionne correctement de bout en bout

## Durcissement du workflow (post-M7, avant Sprint 7+)

Plan complet : `exploration-cache/project/hardening-plan.md`. Déclenché par un test de
bout en bout de Fred (2026-07-27) après la fin des 5 phases OMA. Workstream B a été
partiellement traité avec l'intégration Personnel ANAC pour les comptes internes ; il
reste un audit plus étroit des permissions fines côté UI.

- [x] **A** - Navigation entre phases + feedback visuel (`PhaseSidebar`) - terminé 2026-07-27
- [x] **UX phase-level** - résumé "prochaine action / responsable / blocage / métriques" harmonisé sur M3-M7 - terminé 2026-07-28
- [x] **C-V1** - Visualiseur de documents intégré, priorité M5 (`DocumentEvaluationsCard`) - terminé 2026-07-28
- [x] **B partiel / M13 interne** - Gestion utilisateurs depuis Personnel ANAC, activation OTP, détection doublons, matricules canoniques 4 chiffres - terminé 2026-07-28
- [x] **Phase 1 / M13 postulant + intake** - demande de compte portail, revue ANAC
      avec dédoublonnage organisme, recherche manuelle/sigles (`ADL` -> organisme
      existant), dashboard postulant, et circuit signature clarifié
      (`Ouvrir / imprimer` -> confirmation `En signature` -> scan retour signé) -
      terminé 2026-07-28
- [x] **D-V1** - Cartes repliables (collapse/expand) pour réduire le scroll M4/M5 - terminé 2026-07-29
- [x] **C-V2** - Brancher `DocumentViewer` aux autres liens documentaires M3/M4/M6/M7 après validation terrain M5 - terminé 2026-07-29
- [x] **UI redesign workflow** - Nouveau cockpit appliqué aux phases M3-M7 du workflow - terminé 2026-07-29
- [x] **UI redesign opérationnel** - Dashboard DN, inbox `Courriers officiels`, cockpit
      `Facturation S5`, dashboards Reception/S5/R3, `Mes inspections`, `Reunions`
      et `Demandes` alignés sur la même méthodologie UX : KPIs, listes denses,
      panneau de détail, actions role-aware, visualiseur intégré, actions terminales
      en lecture seule - terminé 2026-07-30
- [ ] **E** - Notifications (M11) - V1 minimale (certificat prêt, document à corriger, dossier rejeté)

### Cohérence backend H2 (2026-10-07) - suites du durcissement portail

- [x] `@aidn/shared` réaligné sur les enums DB (règle "update both together" de
      `schema.ts`, jusque-là manuelle et non respectée) :
      `PAYMENT_PROOF_STATUSES` (`pending` -> `awaiting_invoice`, `awaiting_proof`,
      `pending_validation`) et `REQUEST_STATUSES` (ajout de `in_signature_circuit`).
      Aucun des deux n'était importé : pas d'impact consommateur
- [x] Garde-fou `shared-enums.invariant.test.ts` : compare les 9 constantes miroirs
      aux `enumValues` drizzle (pas d'analyse de source) ; échoue sur les 2 écarts
      d'origine
- [x] Limite d'upload unique : `MAX_UPLOAD_BYTES` dans `@aidn/shared`, utilisée par
      l'API (multer) et le portail (pré-contrôle). Mesuré : 20 Mio - 1 octet accepté,
      20 Mio refusé (413)
- [x] Portail : `r3AgentId` (identifiant utilisateur interne) retiré du bundle M6
      postulant, comme l'avis R3 - la clé n'est plus présente dans la réponse
- [x] `login` et `/me` postulant renvoient `organisationName` (ajout, champs
      existants inchangés) - affichage "Mon compte" prévu en Batch J
- [x] Script lecture seule `npm run db:check:site-inspections [-- --check]` : liste
      les avis R3 rattachés à une visite remplacée ou signés par un autre R3 que
      l'assigné (données antérieures au correctif M6-RESCHEDULE-1)
- [x] ESLint API : 11 erreurs `no-unused-vars` -> 0 (code mort vérifié un par un :
      doublon `sourceAppFromOrigin`, `phasePath` dupliqué en ligne, `PHASE_SLA`
      jamais lu)
- [x] Validé : suite API 266/266, scénario réel (serveur + DB) 10/10, typecheck
      api/admin/portal/shared, build portail, lint api/portal/shared à 0

### Tests portail I (2026-10-07) - infrastructure Vitest

- [x] Vitest 2.1 + Testing Library + jsdom dans `apps/portal` (`npm run test`,
      `npm run test:watch`) ; config `vitest.config.ts` héritée de `vite.config.ts`
      (mêmes alias), `passWithNoTests: false`
- [x] **Correction de constat** : `src/lib/files.test.ts` ne faisait que *déclarer*
      `runFilesTests()` sans jamais l'appeler (aucun appelant dans le dépôt). Le
      lancer avec `tsx` sortait en 0 sans exécuter une seule assertion - les
      "✅ files.test.ts" des rapports A à H2 étaient donc sans valeur. Converti en
      Vitest (15 assertions réellement exécutées, toutes vertes). Même motif
      présent dans `apps/admin/src/lib/files.test.ts` (non traité ici)
- [x] 83 tests : règles de bandeau/étapes (`progress.ts`), lecture seule (dossier
      clos, phases clôturées, dossier annulé), confirmation d'annulation (focus,
      Échap, piège Tab, un seul appel), `FileDropzone` (limite 20 Mio mesurée,
      formats, glisser-déposer), réunions (calendrier, tri, filtres, carte
      tableau de bord), `labelOf`
- [x] Mutation : 8 bugs réalistes injectés dans le code source, 8 détectés (le 8e
      a révélé un trou - dossier annulé - comblé par un test dédié)
- [x] CI `frontend-review.yml` : étape **bloquante** `Run portal tests` (les étapes
      typecheck/lint/build restent consultatives) ; vérifié sous Node 18 (version CI)
- [x] Versions choisies pour Node 18 : `@testing-library/jest-dom` 6.9 (6.10 exige
      Node >= 22)

### Finitions portail J1 (2026-10-07) - états et compte

- [x] **Règle métier confirmée** : une seule phase ouverte à la fois. Le portail
      lit « la phase en cours » comme la première phase ouverte (`currentPhase`),
      utilisé par le bandeau et la liste *Mes dossiers*
- [x] Dossier **rejeté** : la phase encore ouverte au moment du rejet (le backend
      ne la clôture pas) s'affiche *Interrompue* (bandeau d'avancement et ligne
      repliée, icône distincte) au lieu de *En cours* ; elle rejoint les étapes
      clôturées, en lecture seule. Un dossier terminé n'a jamais de phase ouverte
      (la remise du certificat clôture M7 puis passe la demande à `completed`)
- [x] *Mon compte* affiche l'**Organisme** (`organisationName`, ajouté par H2 ;
      chaîne vide côté API → « Non renseigné »)
- [x] Bloc paiement : la quittance choisie est liée à l'identifiant du paiement
      (une nouvelle facture repart d'un champ vide)
- [x] 94 tests portail (+11) ; mutation : 9 bugs injectés, 9 détectés
- [ ] J2 : libellés rédigés pendant A-G, à valider par le métier avant correction

### Invitation PDF L (2026-10-07) - remplace le ticket HTML

- [x] `GET /api/meetings/:id/ticket` (même URL, même contrôle MEETINGS-IDOR)
      renvoie un PDF A4 : `inline`, nom `invitation-<dossier>-<date>.pdf`,
      `Cache-Control: private, no-store`. Liens admin et portail inchangés
- [x] Contenu : organisme et contact destinataires, objet (type de réunion +
      type de demande), date et heure **en heure de Libreville** quel que soit
      le fuseau du serveur, agent DN, n° d'invitation `RE-<id>`
- [x] Décisions Fred : *Lieu* affiché seulement s'il a été saisi (pas de lieu
      par défaut) ; une réunion reprogrammée / tenue / absence / dossier annulé
      garde son PDF, marqué **« Cette invitation n'est plus valable »** avec le
      motif ; mention de pied de page « généré automatiquement par AIDN, sans
      signature »
- [x] **Correctifs de l'ancien ticket** : valeurs insérées sans échappement
      (XSS stocké possible via le *Lieu* saisi par la DN, exécuté sur l'origine
      de l'API) ; heure affichée dans le fuseau du serveur (UTC en staging, soit
      1 h d'avance) ; libellés sans accents
- [x] `shared/pdf/html-pdf.ts` : `renderHtmlToPdf`, `escapeHtml`, `logoDataUri`
      (déplacés du rapport analytique, comportement inchangé - vérifié)
- [x] Portail : lien *Télécharger l'invitation (PDF)* (attribut `download`)
- [x] 15 tests API (contenu, fuseau, échappement, nom de fichier, validité) ;
      mutation 8/8 ; scénario serveur réel + Chromium : 19 vérifications
      (PDF valide, en-têtes, 09 h 00 pour 08:00Z, autre postulant 404, sans
      session 401, `dn_agent` 200, `reception` 403)
- [ ] Un lancement de Chromium par téléchargement (~0,85 s mesuré), comme les
      certificats et rapports : pool partagé à envisager si le volume augmente

## Sprint 7 - Documents (transverse, M8)

- [ ] Upload multi-format (PDF/Word/PNG/JPG)
- [ ] Corbeille (pas de purge auto) + rappel d'ancienneté pour SU
- [ ] Visibilité différenciée (postulant : ses docs + notes DN ; avis R3 masqué)

## Sprint 8 - Paiements (transverse, M9)

- [ ] Upload/consultation facture (aucun calcul de montant dans l'app)
- [ ] Statut terminal `Dossier rejeté` (libère la règle une-seule-demande)

## Sprint 9 - Réunions (transverse, M10)

- [x] Vue calendrier transverse DN/SU (`/reunions`) : KPIs, semaine compacte,
      vue liste, filtres, prochaines réunions, détail sélectionné, accès ticket,
      tenue/absence, report et compte-rendu (2026-07-30)
- [ ] Détection conflit dur (même agent, même créneau) → blocage
- [ ] Détection chevauchement doux (même agent, même jour) → avertissement

## Sprint 10 - Notifications (transverse, M11)

- [ ] Centre de notifications in-app (postulant + interne)
- [ ] Envoi email ciblé : certificat prêt, dossier rejeté, document à corriger
- [ ] Pas d'email pour changements de statut de routine

## Sprint 11 - Dashboard & Rapports (M12)

- [x] KPIs V1 : durée par phase, durée globale, volumes de demandes/délivrances,
      dossiers actifs, courriers signature, paiements en attente, répartition par
      statut - endpoint `/api/dashboard/summary` + tableau de bord DN/SU
      (2026-07-29)
- [x] Seuils SLA dashboard configurables via `system_parameters` (`M12`) :
      cibles par phase M3-M7, dépôt signature, facture S5, validation paiement,
      verdict documentaire DN (2026-07-29)
- [x] Actions dashboard role-aware : Reception/Assistant DG, S5 et DN voient leurs
      actions traitables ; DN/SU peuvent suivre les actions hors périmètre en
      lecture seule sans lien vers un écran non autorisé (2026-07-29)
- [x] Dashboard frontend redesigné en cockpit opérationnel modulaire avec composants
      réutilisables (`DashboardMetricCard`, sections, alertes, actions, timelines)
      et libellés métier clarifiés (2026-07-29)
- [x] Dashboard S5 V1 : endpoint `/api/dashboard/s5-summary` + page dédiée
      `Tableau de bord - Facturation S5` pour `s5_agent`, avec KPIs factures/preuves,
      flux S5, actions prioritaires, alertes, activité métier et progression période
      sans afficher de montants fictifs tant que le modèle paiement ne les stocke pas
      (2026-07-29)
- [x] Dashboards métiers Reception/Assistant DG et R3 : endpoints
      `/api/dashboard/reception-summary` et `/api/dashboard/r3-summary`, pages dédiées
      en cockpit opérationnel, home routing par rôle pur, retrait de la gestion des
      comptes postulants du périmètre Reception/Assistant, et redesign de `Mes
      inspections` en tableau de missions R3 avec panneau de détail (2026-07-29)
- [x] Cockpit `Demandes` V1 : endpoint `/api/requests/cockpit`, KPIs, liste filtrée,
      panneau de détail à droite, synthèse documentaire Chart.js, actions terminales
      désactivées et suivi des dossiers clôturés/auditables (2026-07-30)
- [x] Cockpit `Demandes` - pagination et primitives UI : pagination client sur la
      liste des demandes, tri via `Select` partageable, et ajout des composants
      admin reutilisables `Pagination`, `Select`, `Table` (2026-08-03)
- [x] Harmonisation visuelle des cockpits admin : tailles d'icones compactes
      normalisees sur les pages demandes, phases, documents, dashboards metiers,
      courriers, paiements S5, reunions, inspections, parametrage, authentification
      et gestion des utilisateurs (2026-08-04)
- [x] Analytique & rapports V1 : endpoint `/api/analytics/overview` + route admin
      `/analytique` pour `dn_supervisor`/`SU`, KPIs de delai, respect SLA, attente
      DG, inactivite, repartitions Chart.js, points de blocage, dossiers en retard,
      explication des KPIs et generation de rapports PDF/Excel (2026-08-03)
- [x] Seed de donnees analytiques realistes sur environ un an :
      `npm run seed:analytics --workspace=apps/api` cree 42 dossiers demo sous le
      prefixe organisme `seed-analytics-*` et peut etre rejoue sans toucher les
      dossiers manuels (2026-08-03)
- [x] Export PDF/Excel et generation effective des rapports : `/api/reports`,
      historique des rapports generes, stockage `/uploads/reports`, logo ANAC dans
      le PDF, et templates distincts par type de rapport (`full_report`, delais,
      SLA, goulots, inspections, S5) (2026-08-03)
- [ ] Génération rapport mensuel automatique (1er du mois)
- [ ] Génération manuelle à la demande (quota/jour à définir)
- [ ] Intégration IA (Gemini) : analyse + statut Non relu/Relu, édition avant validation

## Sprint 12 - Administration & Rôles (M13)

- [ ] Matrice de rôles (`reception`, `assistant_dg`, `dn_agent`, `dn_supervisor`,
      `r3_agent`, `s5_agent`, `SU`), multi-rôle supporté
- [x] Repriser flux demande de compte postulant (anti-bot, anti-doublon, revue
      organisme, rejet motivé) - implémenté 2026-07-28 avec revue ANAC,
      activation portail, recherche organisme existant et protection contre les
      variantes/sigles (`ADL`, noms abrégés)
- [x] Contacts multiples par organisme, permissions égales, étiquetage
      Principal/Secondaire/Tertiaire
- [ ] Panneau SU : gestion utilisateurs, corbeille documents, configuration
      (seuils d'alerte, délais dynamiques)
- [x] **Remplacer la création manuelle d'utilisateur interne par une activation
      depuis l'annuaire Personnel ANAC** - implémenté 2026-07-28 en reprenant la
      logique SICOT disponible (`personnel-anac` API read-only + Users page à deux
      onglets), adaptée au modèle AIDN multi-rôle (`user_roles`). Endpoints AIDN :
      `/api/personnel-anac`, `/api/personnel-anac/search`,
      `/api/personnel-anac/matricule/:employeeCode`. Cas verrouillé après test :
      les matricules sont canoniques sur 4 chiffres (`0041`), zéros inclus.

---

## Notes de méthode

- Chaque sprint ci-dessus correspond à un module de `project/modules-feasibility.md` -
  s'y référer pour les décisions de conception et cas limites déjà résolus avant
  d'implémenter quoi que ce soit
- Les patterns transverses (`technical/cross-cutting-patterns.md`) doivent être
  implémentés comme des modules/composants partagés, pas redéveloppés à chaque sprint
- Le suivi vivant (nouvelles idées, pistes non retenues) reste dans la base Notion
  « Idées & Pistes d'Exploration », pas dans ce fichier
- Un fichier `*.test.ts` doit être exécuté par un runner (`npm run test`), jamais
  lancé directement : un module qui ne fait que déclarer des fonctions sort en 0
  sans rien vérifier (cas `files.test.ts`, corrigé en Batch I)
