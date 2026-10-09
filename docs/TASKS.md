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
- [x] J2 (2026-10-07) : libellés rédigés pendant A-G et L validés par Fred tels
      quels - aucune modification de code

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

### Décision M (2026-10-07) : endpoint dossier agrégé reporté

Évaluation faite avant tout code, à la demande de Fred (« seulement sans risque
de régression métier »). **Décision : ne pas le construire maintenant.**

- Gain mesuré négligeable : la page dossier fait 6 appels parallèles
  (`/requests/mine` + 5 bundles `by-request`) ; serveur local, médiane sur 50
  passages : 18 ms au total, 3,9 ms par bundle, ~1 Ko de données. Le
  navigateur les envoie déjà en parallèle
- Risques identifiés :
  1. Les contrôles d'appartenance et le masquage côté postulant (avis R3
     `inspection: null`, `r3AgentId` retiré) sont dans les **contrôleurs**, pas
     les services : un agrégateur appelant les services les contournerait
  2. Perte de la résilience par phase (Batch D : une phase en erreur n'affiche
     l'erreur que dans sa section)
  3. Refonte du cache portail (clés par phase partagées par les sections, le
     bandeau d'avancement et *Mes dossiers*, invalidées après chaque action)
  4. Codes d'erreur propres à chaque module à fusionner
  5. Tests API non exécutés en CI (base requise) - depuis couverts par
     `migration-integrity.yml` (voir K8)
- À rouvrir seulement si une latence réelle est mesurée en production
  (Libreville → serveur)
- Suite retenue : déplacer le masquage postulant de M6 du contrôleur vers une
  fonction partagée testée (durcissement sans changement visible)

### Durcissement N (2026-10-07) - vues postulant M6 et réunion

- [x] `site-inspection/applicant-view.ts` : `toApplicantSiteInspectionBundle`
      remplace le masquage écrit dans le contrôleur (avis R3 → `null`,
      `r3AgentId` retiré). Champs de la visite en **liste blanche** : un champ
      ajouté plus tard reste masqué au postulant tant qu'il n'y est pas listé.
      Réponse postulant identique à avant (mêmes clés, même ordre)
- [x] **Fuite corrigée** : `GET /api/meetings/:id`, ouvert au postulant (contrôle
      d'appartenance MEETINGS-IDOR), renvoyait `dnAgentId` - pour une visite sur
      site, c'est l'identifiant interne de l'agent R3, la même donnée que H2
      avait retirée du bundle M6. `meetings/applicant-view.ts` :
      `toApplicantMeetingView` (liste blanche, sans `dnAgentId`). Aucun client
      (portail, admin) n'appelle cette route : aucun changement visible
- [x] Personnel inchangé : bundle M6 complet et `dnAgentId` conservés
- [x] 10 tests API (dont garde-fous de câblage dans le contrôleur et le
      service) ; mutation 8/8 ; scénario serveur réel 9/9 + script H2 rejoué
- [x] Question métier tranchée par Fred (2026-10-07) : **l'invitation PDF ne
      nomme aucun agent de l'ANAC** (ni agent DN, ni inspecteur R3 pour une
      visite sur site). Ligne retirée du modèle, requête sur `users` supprimée,
      test dédié (aucun « Agent » / « Inspecteur » pour les 3 types de réunion)

### Rattrapage admin K1 (2026-10-07) - lint, tests, CI

- [x] Lint admin : 30 erreurs → 0 (23 apostrophes/guillemets JSX échappés,
      7 symboles inutilisés). Chaque symbole vérifié avant suppression : 5
      icônes importées et un composant `FutureLine` jamais rendu - supprimés
- [x] **Câblage manquant trouvé** : `PRIORITY_STYLES` (inutilisé) révélait que
      l'API calcule une `priority` par mission R3 (haute : visite du jour ou
      dépassée / avis attendu ; moyenne : visite sous 2 jours ; basse : sinon)
      que *Mes inspections* n'affichait pas. Décision Fred : badge « Priorité
      haute/moyenne/basse » à côté du statut, masqué pour une mission clôturée
- [x] Runner Vitest dans `apps/admin` (mêmes versions que le portail,
      `npm run test`) ; `passWithNoTests: false`
- [x] **Constat** : 4 fichiers de test admin n'avaient jamais été exécutés
      (fonctions `run…Tests()` déclarées, jamais appelées) : `lib/files.test.ts`
      et, découverts par le runner, `system-health-ui.test.ts`,
      `system-parameter-ui.test.ts`, `phases/preliminary/helpers.test.ts`
      (~80 assertions). Branchés sur Vitest sans toucher aux assertions : tous
      passent ; un bug injecté dans chaque source testée fait échouer la suite
- [x] 20 tests admin (dont 2 sur le badge de priorité, page réelle)
- [x] CI `frontend-review.yml` : étape **bloquante** `Run admin tests` ; étape
      lint désormais **bloquante** (api + admin + portail à 0 erreur)
- [ ] 5 avertissements `react-hooks/exhaustive-deps` dans l'admin, non traités
      (corriger des dépendances d'effets peut changer le comportement : à faire
      écran par écran, avec un test)
- [ ] Reste K : focus du `Modal` admin, premiers tests des écrans de décision
      (verdicts M3-M7, paiements, rejet) → découpé en K2a / K2b

### Rattrapage admin K2a (2026-10-07) - focus du `Modal`

- [x] `components/ui/modal.tsx` aligné sur le `Modal` du portail, API inchangée
      (+ `initialFocusRef` optionnel) : à l'ouverture le focus entre dans la
      fenêtre (`initialFocusRef`, sinon champ déjà en `autoFocus`, sinon premier
      contrôle) ; Tab / Maj+Tab bouclent dans la fenêtre, y compris quand le
      focus était tombé sur la page (bouton désactivé pendant l'envoi) ; Échap
      ferme ; à la fermeture le focus revient à l'élément déclencheur
- [x] `role="dialog"` déplacé de l'overlay vers le panneau, nommé par son titre
      (`aria-labelledby`)
- [x] Écart volontaire avec le portail : un champ en `autoFocus` garde le focus
      (*Modèles de documents* → *Libellé*) et l'élément déclencheur est capturé
      avant ce `autoFocus`
- [x] 3 écrans concernés, sans changement visuel : *Modèles de documents*,
      *Tâches courrier*, *Paiements S5* (2 fenêtres)
- [x] 12 tests (`modal.test.tsx`) ; mutation 10/10 ; `@testing-library/user-event`
      ajouté à l'admin (même version que le portail) ; 32 tests admin
- [ ] Hors périmètre, relevé : `DocumentViewer` est une fenêtre écrite à la main
      sans gestion du focus ; le `Modal` du portail n'a pas de test
- [x] K2b : voir section suivante
- [x] Rejet définitif sans seconde confirmation : tranché par Fred → lot K3

### Rattrapage admin K2b (2026-10-07) - premiers tests des écrans de décision

Tests seuls, aucun code de production modifié. Seule la couche HTTP
(`api.post`) est simulée : chaque test vérifie l'URL et le corps réellement
envoyés par le composant, son hook et le module API.

- [x] Clôture M3 (`ClosureCard` → `PhaseClosureForm`, partagé avec M4 et M5) :
      clôture directe sans note ni document ; document envoyé d'abord puis
      clôture avec son identifiant et la note, formulaire vidé ; échec de
      l'envoi du document → pas de clôture, note conservée ; pas de double
      soumission pendant l'envoi
- [x] Avis R3 M6 (`VerdictCard`) : 3 motifs de blocage (paiement d'abord) ;
      verdict + note envoyés en un seul appel, note nettoyée des espaces ; rien
      sans verdict ; note faite d'espaces refusée ; message de l'API affiché et
      saisie conservée en cas de refus ; lecture seule une fois l'avis donné
- [x] Paiement M6 (`PaymentCard`) : validation ; rejet avec motif obligatoire ;
      « nouvelle preuve » par défaut ; rejet définitif du dossier (comportement
      actuel figé : un seul clic sur *Confirmer*) ; *Annuler* n'envoie rien et
      oublie le motif ; aucune décision sans le rôle paiement ni hors
      `pending_validation` ; facture envoyée puis rattachée à la phase
- [x] 25 tests (3 fichiers) ; mutation 14/14 ; 57 tests admin
- [ ] Non couverts : clôtures M4 / M5 (hooks propres, même formulaire),
      `PaymentCard` M5 et M7 (quasi-copies de M6 : factorisation possible),
      cycle de vie du certificat M7, *Paiements S5*
- [ ] Relevé, hors périmètre : les `<label>` de `VerdictCard`,
      `PhaseClosureForm` et `PaymentCard` ne sont pas reliés à leur champ (pas de
      `htmlFor`) ; libellés « Cloturer » / « Cloture... » sans accent

### Confirmation du rejet définitif K3 (2026-10-07)

Maquette validée par Fred (canevas « K3 - Confirmation rejet dossier »). Front
seul, aucun changement d'API.

- [x] Constat : rejeter le paiement avec « Rejeter le dossier » passe paiement
      **et dossier** au statut `rejected` (motif côté postulant : « Paiement
      rejeté - dossier annulé : <motif> »), sans retour possible dans
      l'application, et partait en un clic depuis 4 écrans : cartes paiement
      M5, M6, M7 et *Paiements S5*
- [x] Cartes M5 / M6 / M7 : formulaire de rejet partagé
      `components/common/PaymentRejectionForm.tsx` (remplace 3 copies). Avec
      « Rejeter le dossier », le bouton devient « Rejeter le dossier… » et ouvre
      une confirmation ; « Nouvelle preuve » reste en un clic sur *Confirmer*
- [x] Confirmation `components/common/DossierRejectionConfirm.tsx` (`Modal`
      K2a) : avertissement « action définitive », conséquences, **motif exact vu
      par le postulant**, l'organisme peut redéposer ; focus initial sur
      *Retour* ; bouton final rouge plein ; ni *Retour* ni Échap pendant l'envoi
- [x] *Paiements S5* : 2e étape dans la même fenêtre (« Continuer… » →
      confirmation → *Retour* revient au formulaire, saisie conservée) ; une
      seule `Modal` du début à la fin, donc le focus revient bien à la ligne
- [x] Effets de bord assumés : libellés reliés à leurs champs (`htmlFor`) dans
      le formulaire partagé ; option M5 alignée sur M6/M7 (« Rejeter le dossier
      (annulation définitive) » au lieu de « …definitivement ») ; en cas d'échec
      de l'API la confirmation se ferme, le formulaire garde le motif
- [x] 34 tests (`PaymentRejectionForm.test.tsx` : 9 cas × 3 cartes ;
      `RejectModal.test.tsx` : 7) + test K2b mis à jour ; M5 et M7 testés pour la
      première fois ; 91 tests admin ; mutation 14/15 (survivant accepté : `trim()` du motif dans
      l'étape S5, non figé volontairement)
- [x] Préfixe dupliqué API / admin → traité en K4 (`@aidn/shared`)
- [x] `rejectPayment` sans transaction → traité en K4

### Décisions de paiement atomiques K4 (2026-10-08) - API

Suite de K3, sans changement visible : mêmes routes, mêmes codes et messages
d'erreur.

- [x] Constats sur `rejectPayment` (M5, M6, M7, trois copies identiques) :
      1. paiement puis demande mis à jour **sans transaction** (un échec entre
         les deux laissait le paiement rejeté et le dossier actif) ;
      2. statut lu puis mise à jour **sans condition**, et `validatePayment`
         pareil : une validation et un rejet du même justificatif pouvaient
         **réussir tous les deux**. Reproduit sur `main` en HTTP réel :
         15 tirages sur 20 avec 200 / 200 (« validé » puis « rejeté », deux
         lignes d'audit) ;
      3. aucune vérification du module : l'endpoint M6 rejetait un paiement M5
- [x] `modules/payments/payment-decisions.ts` : `rejectPhasePayment`
      (remplace les 3 copies) - une transaction, ligne verrouillée par
      `lockPhasePayment` (déjà utilisé pour facture et preuve, désormais
      exporté), qui vérifie aussi que la phase est celle du module (sinon 404
      `PAYMENT_NOT_FOUND`) ; paiement, demande et audit écrits ensemble ou pas
      du tout
- [x] `validatePayment` (M5, M6, M7) : mise à jour conditionnée au statut
      `pending_validation` (`stillPendingPayment`) ; si une autre décision a
      gagné → 409 `PAYMENT_NOT_PENDING`, et en M7 aucun certificat créé
- [x] `@aidn/shared` : `DOSSIER_REJECTION_PREFIX` + `dossierRejectionReason()`,
      utilisés par l'API (motif enregistré) et l'admin (aperçu K3) ; constante
      locale de l'admin supprimée
- [x] `payment-decisions.db.test.ts` (12 tests, PostgreSQL réel, ignoré sans
      `DATABASE_URL`) : nouvelle preuve ; rejet du dossier M5 / M6 / M7 ;
      atomicité (échec forcé de la mise à jour de la demande par un trigger) ;
      autre module refusé ; statut non en attente ; courses rendues
      déterministes par un verrou tenu sur une 2e connexion (validation
      M5 / M6 / M7 et rejet qui arrivent en second) ; 10 tirages simultanés.
      Mutation 11/12 (survivant accepté : audit écrit hors transaction, seul
      un échec au commit le révélerait)
- [x] Scénario HTTP réel (serveur + PostgreSQL `aidn_verify`) : 29
      vérifications (403 accueil, 401 sans session, 200 rejet, motif partagé,
      409 second rejet, 409 validation après rejet, 404 autre module,
      nouvelle preuve, M7 validation + 1 certificat puis 409 au rejet) + 20
      tirages simultanés validation / rejet : 20 cohérents (validation 12,
      rejet 8) contre 5 sur 20 sur `main`
- [x] Les tests API ne tournent qu'en Node ≥ 21 (`node --test` avec motif
      glob) - **corrigé le 2026-10-08** : ils tournent déjà en CI dans
      `migration-integrity.yml` (Node 22, PostgreSQL 16, migrations + seeds,
      tests base comprises) ; seule la revue frontend est en Node 18 → lot CI
- [x] `validatePayment` (module de la phase, validation M7 atomique) → K5
- [x] Relevé : l'API accepte un motif fait d'espaces et une `rejectionAction`
      inconnue (erreur d'enum PostgreSQL → 500) → K8a ; rejet possible d'un
      paiement dont le dossier est déjà terminé → K7a (`DOSSIER_CLOSED`)

### Validation de paiement K5 (2026-10-08) - API

Suite de K4, sans changement visible : mêmes routes, mêmes codes et messages.

- [x] Constats (vérifiés sur base réelle) :
      1. l'endpoint M7 validait le paiement d'une phase M5 ou M6 **et créait
         un certificat** pour un dossier qui n'est pas en délivrance ; M5 et
         M6 ne vérifiaient pas non plus le module ;
      2. M7 validait le paiement puis créait le certificat **sans
         transaction** ;
      3. référence `CERT-AAAA-NNNN` calculée par un comptage : deux dossiers
         validés au même moment obtenaient la même référence. Reproduit en
         HTTP sur `main` : 3 tirages sur 10 → 500 **et paiement « validé »
         sans certificat**, irrécupérable (nouvelle validation → 409)
- [x] `payment-decisions.ts` : `validatePhasePaymentInTx` (ligne verrouillée
      par `lockPhasePayment`, module vérifié → 404 sinon, statut lu sous le
      verrou, mise à jour conditionnée, audit) ; `validatePhasePayment` pour
      M5 / M6 ; M7 l'appelle dans **une seule transaction** avec la
      vérification « certificat existant », la création du certificat et son
      audit
- [x] `generateCertificateReference(tx)` : verrou transactionnel
      (`pg_advisory_xact_lock`) autour du comptage, tenu jusqu'au commit ;
      deux validations simultanées sont sérialisées au lieu d'entrer en
      collision
- [x] `payment-decisions.db.test.ts` : 10 tests de plus (22 au total) -
      validation M5 / M6 / M7 ; 4 appels croisés refusés sans certificat ;
      atomicité M7 (échec forcé à la création du certificat → paiement non
      validé, puis le même clic réussit) ; double validation simultanée → un
      seul certificat ; deux dossiers simultanés → deux certificats,
      références distinctes. Mutation 5/6 (survivant attendu : sans la
      vérification du statut, la mise à jour conditionnée bloque encore)
- [x] Scénario HTTP réel : 14/14 (404 croisés sans certificat, 200 puis 409,
      un certificat) + 10 doubles clics (1 certificat chaque fois) + 10 paires
      de dossiers (références distinctes) ; sur `main` : 3 paires sur 10 en
      échec
- [x] Relevé, hors K5 : la référence reste un comptage (un certificat
      supprimé ferait réutiliser un numéro) → K8a ; validation possible d'un
      paiement dont le dossier est déjà terminé → K7a
- [ ] Aucune contrainte d'unicité sur `certificates.request_id` (protégé
      désormais par le verrou du paiement) → K8b

### K6 (après K5) - Réunions sans compte-rendu : analytique et module Réunions divergent

Signalé par Fred en test (2026-10-08) : après dépôt d'un compte-rendu,
l'analytique semble ne pas le compter. **Confirmé** sur base réelle en HTTP
(dépôt du CR par un agent DN, puis lecture des deux indicateurs).

- Le dépôt **est** pris en compte : sur un dossier avec une réunion
  préliminaire tenue et une visite sur site tenue, « Réunions sans
  compte-rendu » passe de 2 à 1 dans l'analytique, de 1 à 0 dans *Réunions*
- Cause : l'analytique (`analytics.service.ts`, `missingReports`) compte
  **aussi les visites sur site**, que le module Réunions exclut
  (`meetings.service.ts`, `meetingType !== 'site_visit'`). Or une visite sur
  site n'a pas de compte-rendu à déposer : l'écran ne le propose pas
  (`canManage` faux, « Suivi inspection R3 ») et son livrable est l'avis R3.
  Une visite tenue reste donc « sans compte-rendu » pour toujours dans
  l'analytique, qui ne peut jamais revenir à 0
- Écarts secondaires : les deux écrans ne comptent pas la même population
  (Réunions : réunions de la période choisie ; analytique : réunions des
  dossiers filtrés, toutes dates) ; après un dépôt, l'analytique déjà chargée
  peut afficher l'ancien chiffre jusqu'à 30 s (`staleTime`, aucune
  invalidation de `analytics-overview`) ; la démo `seed-analytics-demo-data`
  modélise un « CR manquant » sur une visite sur site
- [x] Décision Fred (2026-10-08) : le compte-rendu n'est **pas obligatoire**
      (les agents l'envoient le plus souvent par Outlook). On garde
      l'indicateur, sans en faire une alerte :
  - [ ] « Réunions sans compte-rendu » : réunions préliminaires et formelles
        seulement (visites sur site exclues, comme le module Réunions), avec
        la liste des réunions concernées (référence, organisme, type, date,
        agent DN) et un lien direct vers la phase où déposer le CR
        (`demandes/:requestId/phase-preliminaire` ou `…/phase-formelle`)
  - [ ] Nouvel indicateur séparé « Avis R3 manquant » : visites sur site
        tenues sans avis R3, avec la liste des dossiers concernés (référence,
        organisme, date de la visite, agent R3) et un lien direct vers
        `demandes/:requestId/demonstration-inspection`
  - [ ] Ton neutre (`info`) pour les deux (confirmé par Fred), jamais
        `warning` ni `danger` : information pour intervention, pas une alerte
- [ ] Une seule règle partagée par les deux services, avec un test ; aligner
      la donnée de démo ; invalider l'analytique après un dépôt de CR
      → K6a (API) ci-dessous ; K6b (admin, maquette d'abord) à suivre

#### K6a (2026-10-08) - API

- [x] `meetings/meeting-follow-up.ts` : règle unique `lacksMeetingReport` /
      `awaitsR3Opinion`, utilisée par le cockpit Réunions **et** l'analytique.
      Ne comptent que les dossiers **actifs** (ni terminé, ni annulé, ni
      rejeté) : sur un dossier clos il n'y a plus rien à faire, et un avis R3
      y resterait « manquant » pour toujours
- [x] Analytique : « Réunions sans compte-rendu » = réunions préliminaires et
      formelles seulement ; nouvel indicateur « Avis R3 manquant » ; ton
      `info` pour les deux ; `meetingFollowUps.missingReports` et
      `.missingR3Opinions` (plus anciennes d'abord) : réunion, dossier
      (`requestId`, référence), organisme, type, phase, date, agent - de quoi
      ouvrir la phase concernée
- [x] **Trouvé en route** : le rapport « Inspections » (PDF et Excel) affichait
      `missing_reports` comme blocage d'inspection (« CR inspections ») - il
      affiche désormais « Avis R3 manquant » ; le rapport « Blocages » garde
      les deux. Test qui génère le vrai classeur Excel
- [x] Cockpit Réunions : même règle, ton `info`, aide « Facultatif - … »
- [x] Démo : la visite sur site « sans avis » ne porte plus de compte-rendu
      (`missingR3Opinion`)
- [x] 9 tests unitaires (règle) + 2 (rapport) + 3 tests PostgreSQL réel (listes et données
      de localisation ; dépôt du CR et avis qui retirent l'élément ; Réunions
      et analytique d'accord) ; mutation 12/12. Scénario HTTP du signalement :
      dépôt du CR → les deux écrans baissent de 1, la visite passe dans
      « Avis R3 manquant »
#### K6b (2026-10-08) - admin

Maquette validée par Fred (canevas « K6 - Suivi des réunions »).

- [x] *Analytique* > « Points de blocage » : 6 cartes sur une ligne ; les
      cartes « Réunions sans compte-rendu » et « Avis R3 manquant » en ton
      neutre, leur lien descend vers leur liste sur la même page
- [x] Nouvelle section « Suivi des réunions » (`MeetingFollowUpsSection`) :
      « Comptes-rendus non déposés » (dossier, organisme, réunion, date, agent
      DN) et « Avis R3 en attente » (dossier, organisme, date, inspecteur R3),
      plus anciennes d'abord ; chaque ligne « Ouvrir la phase → » vers
      `phase-preliminaire`, `phase-formelle` ou `demonstration-inspection` ;
      « Rien à suivre pour le moment » quand une liste est vide
- [x] Rafraîchissement de l'analytique (`queryKeys.analytics`) après : dépôt
      de CR et réunion marquée tenue (préliminaire, formelle, page Réunions),
      visite sur site tenue, avis R3 soumis
- [x] 11 tests (section, cartes, 6 rafraîchissements) ; mutation 10/11
      (survivant : le rafraîchissement depuis la page Réunions n'a pas de test,
      la page est lourde à monter ; les équivalents des pages de phase sont
      couverts)
- [x] Vérifié dans un vrai navigateur (Chromium, serveur API + admin, base
      PostgreSQL, connexion superviseur DN) : 6 cartes sur une ligne, lien
      « Voir les visites » → section, « Ouvrir la phase » →
      `/demandes/:id/demonstration-inspection`, aucune erreur de page. Ajusté
      après capture : référence sur une ligne, densité compacte de la maquette,
      liste longue défilant dans sa colonne (`max-h-[26rem]`) au lieu
      d'allonger la page

- [x] Relevé, hors K6 : l'avis R3 peut techniquement être soumis sur un
      dossier rejeté (la phase M6 interrompue reste ouverte, aucun contrôle du
      statut du dossier) ; le dépôt de CR non plus ne vérifie pas le dossier
      → corrigé par K7a (`DOSSIER_CLOSED`)

### Dossier clos en lecture seule K7a (2026-10-08) - API

Décision Fred : sur un dossier clos (rejeté, annulé ou terminé), seules la
consultation et le téléchargement restent possibles ; toute autre action est
refusée.

- [x] **Constat (risque de conformité)** : aucune action d'écriture des modules
      de workflow ne vérifiait le statut du dossier (seule l'ouverture de M3 le
      faisait). Reproduit sur base réelle : sur un dossier **rejeté**, l'avis R3
      était accepté et clôturait M6, puis l'ouverture de M7 (délivrance) était
      acceptée - chemin vers un certificat pour un dossier rejeté. Sur `main`,
      14 actions sur 50 acceptées et écrites sur un dossier rejeté ; les autres
      ne tombaient que sur des préconditions sans rapport
- [x] `requests/dossier-open.ts` : gardes `assertDossierOpen`,
      `assertPhaseDossierOpen`, `assertMeetingDossierOpen`,
      `assertCertificateDossierOpen`, `assertEvaluationDossierOpen` →
      `DOSSIER_CLOSED` (409, « Ce dossier est clos (rejeté, annulé ou terminé) :
      il reste consultable, mais aucune action n'est possible. »), mappé une
      fois pour tous les modules (`shared/utils/error.ts`). Silencieuses si
      l'entité n'existe pas (chaque action garde son propre NOT_FOUND) ; dans
      une transaction, ligne de la demande lue `FOR SHARE` (sérialisée avec un
      rejet concurrent). Même liste de statuts que la règle K6
- [x] Posées sur les 51 routes d'écriture concernées des modules de workflow
      (53 au total : l'ouverture de M3 exige déjà « pending_review », la
      création d'un dossier relève de la règle « un seul dossier actif ») - M1
      circuit et annulation, M3-M7, réunions, courriers DG, paiements,
      certificat - recensées route par route ; 2 actions oubliées par un premier inventaire
      (`markPrinted`, `markArchived`) trouvées ainsi. Côté postulant (preuve,
      renvoi de document, annulation) la garde passe **après** le contrôle de
      propriété : un autre postulant reçoit toujours 404
- [x] Tests : matrice PostgreSQL réel (`dossier-open.db.test.ts`) - les 50
      actions (51 routes, deux partagent `sendToSignature`) sur un dossier rejeté, annulé puis terminé → `DOSSIER_CLOSED`, et
      la base est identique avant / après (12 tables comparées) ; pas de fuite
      côté postulant ; dossier ouvert accepté. Inventaire statique des routes
      (`dossier-open.routes.test.ts`, sans base) : une nouvelle route d'écriture
      fait échouer la suite tant qu'elle n'est pas gardée et recensée.
      Mutation 10/10
- [x] Scénario HTTP réel : sur un dossier rejeté, avis R3, ouverture M7, dépôt
      de CR et preuve postulant → 409 avec le message ; rien n'est écrit ; la
      consultation (DN et postulant) et le téléchargement du CR restent
      possibles ; sur le dossier témoin ouvert, les mêmes actions passent
- [x] Effet sur K4 : si le rejet définitif gagne la course, la validation
      tardive reçoit `DOSSIER_CLOSED` (au lieu de `PAYMENT_NOT_PENDING`)
- [x] `k7-check-closed-dossiers.sql` (lecture seule) : dossiers clos ayant une
      activité après leur clôture (phase ouverte / clôturée, avis R3, paiement
      validé, certificat) - à passer sur chaque environnement ; passé par
      Fred sur chaque environnement (2026-10-09), rien à corriger
- [x] K7b (admin) : pages de phase en lecture seule sur un dossier clos -
      voir ci-dessous
- [x] K7c (API + admin) : files de travail (S5, Réunions, Courriers, Mes
      inspections) conscientes du dossier clos - voir ci-dessous
- [x] K7d (admin + API) : informations clés lisibles, rien « en attente »
      sur un dossier clos, compteurs sans les dossiers clos - voir ci-dessous
- [ ] Course résiduelle : les actions hors transaction lisent le statut puis
      écrivent (fenêtre de quelques millisecondes avec un rejet simultané)

### Dossier clos en lecture seule K7b (2026-10-08) - admin

Maquette « K7b - Dossier clos en lecture seule » validée par Fred. Même règle
que K7a : consultation et téléchargement seulement ; l'API reste le filet de
sécurité.

- [x] API : `GET /phases/requests/:requestId/dossier-state` → `{ status,
      closed, closedAt, rejectionReason }` (même public que `phases-summary` :
      tout agent connecté, `GET /requests/:id` restant réservé à la DN).
      `closedAt` = dernière mise à jour (rien ne bouge un dossier clos depuis
      K7a) ; motif renvoyé seulement pour un rejet (une annulation n'en
      enregistre pas)
- [x] `phases/components/DossierReadOnly.tsx` : état partagé par contexte,
      `useDossierReadOnly()` pour les cartes, bandeau `ClosedDossierBanner`
      (« Dossier rejeté / annulé / terminé le … - consultation uniquement »,
      motif pour un rejet), `ClosedDossierNote` à la place des actions.
      Pendant le chargement ou en cas d'erreur, la page reste comme avant
- [x] `WorkflowCockpit` (5 pages de phase) : bandeau sous l'en-tête ; phase
      ouverte affichée « Interrompue » (badge et frise, comme le portail),
      phases suivantes « Non demarree » ; rail « Dossier clos » sans bouton ni
      responsable ; plus d'étape « en cours » surlignée dans la checklist ;
      « Responsable » (porteur de la prochaine action) retiré des informations
      clés
- [x] Vues S5 seul (M5, M6, M7) et R3 seul (M6) : même bandeau et mêmes cartes
      en lecture seule
- [x] Cartes : paiements M5/M6/M7 (facture, valider / rejeter), visite et avis
      R3, réunions M3/M4 (planifier, tenue, absence, reprogrammer, annuler,
      CR), déclaration M3, évaluation des documents M5, champs / périmètre /
      cycle du certificat M7, boutons « Démarrer la phase » et cartes de
      clôture → masqués. Restent : données, statuts, liens « voir le fichier »,
      prévisualisation des documents
- [x] Rafraîchissement : un rejet définitif (S5) recharge l'état du dossier, la
      page passe en lecture seule sans rechargement ; toute action refusée en
      `DOSSIER_CLOSED` (dossier clos entre-temps par un autre agent) recharge
      aussi l'état (`MutationCache` du `queryClient`)
- [x] Tests : admin `DossierReadOnly.test.tsx` (19 : bandeau ×3 statuts, cockpit
      clos / ouvert, cartes des 5 phases, rechargement sur `DOSSIER_CLOSED`),
      mutation 4/4 ; API `dossier-state.db.test.ts` (PostgreSQL réel, 4).
      Admin 121/121, API 340/340 (Node 22), tsc admin + API, eslint, build
- [x] Vérifié en navigateur (base réelle) : M6 avec preuve en attente → rejet
      définitif via l'interface → bandeau, « Interrompue », rail clos, aucune
      action ; M3 et M7 du même dossier en lecture seule. HTTP : 401 sans
      session, 404 dossier inconnu
- [x] Fait en K7c (2026-10-09) - Hors K7b, non vérifié : les autres écrans (file S5, Réunions,
      Courriers à traiter, Mes inspections) ne connaissent pas l'état clos ;
      s'ils proposent une action sur un dossier clos, l'API la refuse (409)
- [x] Fait en K7d (2026-10-09) - Hors K7b : informations clés en codes bruts (`rejected`, `held`) et
      « Avis R3 : Attendu » en orange sur un dossier clos

### Files de travail et dossier clos K7c (2026-10-09) - API + admin

Plan validé par Fred. Même règle que K7a / K7b : sur un dossier rejeté,
annulé ou terminé, consultation et téléchargement seulement. Les dossiers clos
restent listés (historique), sans action ; l'API reste le filet de sécurité.

- [x] API (champs ajoutés, aucun contrat cassé) : chaque élément des files
      porte `dossierStatus` et `dossierClosed` (`dossierFlags()` dans
      `requests/dossier-open.ts`, à partir du `requests.status` déjà lu ;
      aucune requête en plus) : files de paiement S5 M5 / M6 / M7,
      `GET /meetings`, `GET /courrier-tasks`, `GET /site-inspection/my-queue`
- [x] Actions calculées par l'API, sur un dossier clos : réunion
      `canManage: false`, `actionLabel: 'Dossier clos'` ; courrier
      `availableActions: []` ; mission R3 `missionStatus: 'closed'`,
      `nextAction: 'consult'`, libellé « Dossier clos » (sort des files à
      traiter). Paiements : `nextAction` inchangé, l'écran le remplace
- [x] Admin : badge partagé `components/common/ClosedDossierBadge.tsx`
      (« Dossier rejeté / annulé / terminé » ; libellés repris par
      `DossierReadOnly`), sur la ligne et dans le panneau de détail des 4 écrans
- [x] File S5 : plus de facture, validation ni rejet ; note « Dossier clos -
      consultation uniquement » ; pièces (facture, preuve) consultables ;
      colonne Action « Dossier clos - consultation »
- [x] Réunions : plus de tenue, absence, report ni compte-rendu ; note dossier
      clos ; le compte-rendu existant reste consultable
- [x] Courriers : plus d'impression pour signature (« Ouvrir / imprimer »,
      validé par Fred : étape du circuit), ni mise en signature, ni retour
      signé ; le document reste consultable (« Ouvrir document », « Voir »)
- [x] Mes inspections : plus de « Enregistrer la tenue » ni d'avis R3 ; motif
      « Dossier clos » dans le panneau
- [x] Rafraîchissement : une action refusée en `DOSSIER_CLOSED` recharge aussi
      les files (MutationCache : files S5, file R3, réunions) ; S5 et Courriers
      (appels hors React Query) ferment la fenêtre ouverte et rechargent
- [x] Tests : API `closed-dossier-lists.db.test.ts` (PostgreSQL réel, 4 :
      rejeté / annulé / terminé + dossier ouvert inchangé) ; admin
      `closed-dossier-lists.test.tsx` (9 : 4 écrans clos / ouvert +
      MutationCache). API 355/355, admin 134/134, portail 94/94 (Node 22),
      typecheck, lint (0 erreur, 5 avertissements déjà présents), build
- [x] Vérifié par Fred (2026-10-09) sur base réelle
- [x] Fait en K7d - Hors K7c : compteurs « Factures à envoyer » / « À imprimer » comptent
      encore un élément en attente d'un dossier clos (il reste dans son onglet,
      marqué clos)
- [x] Fait en K7d - Hors K7c : « Avis R3 : Attendu » encore affiché dans le panneau Mes
      inspections d'un dossier clos (même sujet que les informations clés)

### Informations clés et compteurs K7d (2026-10-09) - admin + API

Plan validé par Fred (éléments en attente d'un dossier clos : sous « Tous »
seulement).

- [x] Informations clés des 5 pages de phase en libellés français, à partir des
      tables existantes de chaque phase (`constants.ts`) : paiement M5 / M6 /
      M7, réunion M3 / M4, visite M6, cycle du certificat M7 (code brut
      seulement si une valeur inconnue arrive)
- [x] Correctif : `deep-evaluation/constants.ts` utilisait la clé `pending` au
      lieu de `awaiting_invoice` ; la carte paiement M5 affichait le code brut
- [x] Dossier clos : `WorkflowKeyInfoItem.closedValue` remplace la valeur et
      un ton « warning » devient neutre (`WorkflowCockpit`). « Avis R3 : Non
      rendu » (M6), « Circuit signature : Non retourné » (M4) ; même « Avis
      R3 : Non rendu » dans le panneau Mes inspections
- [x] Compteurs : un élément encore en attente sur un dossier clos sort des
      onglets d'action et de leurs compteurs, et reste sous « Tous » (badge
      dossier clos). File S5 : facture attendue, preuve attendue, preuve à
      valider (`bucketForItem`). Courriers : « À imprimer » et « En
      signature » - API (`counts` et filtre `?bucket=`, le champ `bucket`
      garde le statut du circuit) et filtre de l'écran. Paiements validés /
      rejetés et retours signés restent dans leurs onglets
- [x] Tests : admin `KeyInfo.test.tsx` (4 : valeur clos / ouvert, tables de
      libellés complètes), `closed-dossier-lists.test.tsx` adapté (élément
      clos absent de l'onglet d'action, présent sous « Tous ») ; API
      `closed-dossier-lists.db.test.ts` +1 (filtre `to_signature`)
- [x] Vérifié par Fred (2026-10-09) sur base réelle

### Durcissement API K8a (2026-10-08) - rejet de paiement et référence de certificat

- [x] **Constat (HTTP réel sur `main`)** : `rejectionAction` inconnue → 500
      (erreur d'enum PostgreSQL) ; motif fait de 3 espaces → 200, stocké tel
      quel et affiché au postulant ; aucune limite de longueur
- [x] `payments/payment-rejection-input.ts` : `parsePaymentRejection` partagé
      par les rejets M5 / M6 / M7, appelé avant toute lecture ou écriture.
      Action dans la liste `PAYMENT_REJECTION_ACTIONS` (`@aidn/shared`, test
      d'égalité avec l'enum de la base), motif rogné non vide, au plus
      `PAYMENT_REJECTION_REASON_MAX_LENGTH` = 1000 caractères. Refus en 400
      (`REJECTION_ACTION_INVALID`, `REJECTION_REASON_REQUIRED`,
      `REJECTION_REASON_TOO_LONG`), mappés une fois pour tous les modules ;
      motif enregistré rogné
- [x] Admin : les deux formulaires de rejet (cartes de phase, modale S5)
      limitent le motif à la même longueur (`maxLength`)
- [x] Référence de certificat : plus grand `CERT-AAAA-n` de l'année + 1 (sous
      le même verrou K5) au lieu d'un comptage. Le comptage incluait les
      références d'un autre format (le seed de démo analytique écrit
      `CERT-AN-n`) et, après une suppression, retombait sur un numéro déjà
      pris → 500 sur l'index unique. Pas de migration
- [x] Tests : `payment-rejection-input.test.ts` (8, sans base : règles,
      400 dans les 3 modules, enum) ; `certificate-reference.db.test.ts` (3,
      PostgreSQL réel, transactions annulées) ; admin `maxLength` (4).
      Mutation 4/4. API 351/351 sur base neuve migrée + seeds (comme la CI),
      admin 125/125, tsc, eslint, build
- [x] HTTP réel (M6) : action inconnue, motif d'espaces, motif de 1001
      caractères → 400 avec message ; motif valide entouré d'espaces → 200,
      stocké rogné
- [x] K8b (2026-10-09) : contrainte d'unicité sur `certificates.request_id` (migration) -
      après passage d'une requête de contrôle des doublons sur chaque
      environnement
- [x] Lot CI : voir CI-1 ci-dessous
- [x] Fait en K8b (Fred, 2026-10-09 : migration 0004 seule, sans attendre) - K8b repoussé (décision Fred) : défense en profondeur, pas de bug actuel
      (la seule création de certificat est déjà protégée) ; à faire avant la
      mise en production, avec la prochaine migration nécessaire

### K8b (2026-10-09) - un certificat par demande, garanti par la base (API)

Plan validé par Fred : migration 0004 seule (aucune autre migration en
attente). Défense en profondeur : `validatePayment` (M7) vérifiait déjà
l'absence de certificat, et le verrou du paiement (K5) sérialise deux
validations simultanées.

- [x] Migration `0004_k8b_one_certificate_per_request` : index unique
      `certificates_request_id_idx` (une seule instruction `CREATE UNIQUE
      INDEX`, générée par `db:generate`). `db:migrate` applique les migrations
      dans une transaction : en cas de doublon, rien n'est appliqué
- [x] Contrôle préalable en lecture seule : `npm run db:check:certificates --
      --check` (`scripts/check-certificate-duplicates.ts`, requête dans
      `certificates/certificate-duplicates.ts`) liste chaque demande ayant
      plusieurs certificats ; code de sortie 1 si un doublon existe. Ne
      supprime rien : le certificat à garder est une décision métier
- [x] Erreur propre : si l'index refuse un second certificat (23505 sur
      `certificates_request_id_idx`), réponse `CERTIFICATE_ALREADY_EXISTS`
      (409) au lieu d'une 500 ; une collision de référence reste une autre
      erreur. La vérification applicative existante est conservée
- [x] Tests `certificate-per-request.db.test.ts` (PostgreSQL réel, 5) : index
      qui refuse le doublon, conversion de l'erreur (y compris enveloppée),
      seconde validation M7 → 409 sans écriture, contrôle qui signale un
      doublon (index retiré dans une transaction annulée), script `--check`
- [x] Vérifié à la main sur une base jetable avec un doublon : contrôle en
      code 1, `db:migrate` en échec (« could not create unique index …
      is duplicated »), 0004 non enregistrée, index absent
- [x] Déployé par Fred (2026-10-09) sur chaque environnement, sans doublon ;
      CI (Migration Integrity) au vert. **Ordre de déploiement** : 1)
      `npm run db:check:certificates -- --check` ; 2) si doublon : choisir le
      certificat à garder et corriger à la main ; 3) `npm run db:migrate`

### CI-1 (2026-10-08) - Node 22 partout, revue frontend fiabilisée

- [x] **Constat** : seule la revue frontend tournait encore en Node 18 (fin de
      vie avril 2025) ; images Docker (`node:22-*`) et Migration Integrity
      déjà en Node 22. Audit des 789 paquets : aucun incompatible avec Node
      22 ; 9 déjà incompatibles avec Node 18, dont `puppeteer@25` (Node
      ≥ 22.12) et `node-cron@4` (≥ 20) côté API → Node 22.12 est le vrai
      minimum
- [x] `.nvmrc` (22) et `engines.node` `>=22.12.0` (racine, lockfile synchronisé :
      seule l'entrée `engines` change) ; `frontend-review.yml` lit `.nvmrc`
- [x] `frontend-review.yml` : les fichiers de test ne sont plus exclus du
      déclenchement ; exécution aussi sur `main` (contrôles seulement, la revue
      de PR reste réservée aux PR) ; typecheck et build **bloquants** ;
      commentaire de revue réparé (sortie `review_report` jamais définie →
      commentaire vide ; rapport transmis par variable d'environnement au lieu
      d'être collé dans le script, ce qui cassait sur la première apostrophe -
      reproduit hors ligne)
- [x] Vérifié en Node 22.22 sur un clone neuf : `npm ci`, typecheck, lint,
      portail 94/94, admin 125/125, build ; job Migration Integrity complet
      (contrôles, 2 migrations, seeds, API 351/351) ; API construite lancée
      par `node dist/server.js` (répond) ; PDF Puppeteer généré. `actionlint`
      sans erreur sur les deux workflows
- [ ] Non vérifiable ici : la première exécution GitHub Actions (à confirmer
      par Fred) et l'étape de revue de PR (API GitHub)
- [ ] Postes de dev : Node ≥ 22.12 requis (`npm` avertit sinon)
- [ ] Optionnel : `@testing-library/jest-dom` reste en 6.9 (épinglé pour Node
      18) ; la 6.10 est désormais possible

### D1 (2026-10-09) - Demandes : vue 2 volets inspirée d'Outlook (admin)

Audit UX validé par Fred (maquette « Demandes — maquette Outlook ») :
inspiré d'Outlook, pas un clone. Deux volets (pas de 3e volet « dossiers »),
lignes denses groupées par jour, volet de lecture avec barre d'action.
Frontend seul : aucun changement d'API ni du contrat cockpit.

- [x] Onglets **exclusifs**, par priorité (`pages/requests/requestBuckets.ts`) :
      1) Clôturées = `completed`, `rejected`, `cancelled` (K7) ;
      2) En attente DG = circuit `submitted` / `in_signature_circuit` / `signed` ;
      3) À traiter = le reste. Avant : « Nouvelles » ⊂ « À examiner », et
      rejet / annulation absents de « Clôturées ». Les pastilles d'en-tête
      utilisent les mêmes compteurs (`metrics` de l'API n'est plus affiché,
      champ conservé)
- [x] Mise en page : liste 340-400 px + volet de lecture fluide ; tient en
      1366 px barre latérale ouverte (avant : débordement horizontal entre
      1280 et ~1580 px, colonnes minimales 520 + 720 px) ; volets empilés
      sous `lg`. Liste défilante (plus de pagination à 5)
- [x] Groupes par jour de dépôt (Aujourd'hui / Hier / Cette semaine / Plus
      ancien, semaine à partir du lundi) ; pas de groupe en tri par référence
- [x] Sélection dans `?id=` ; le volet n'affiche jamais un dossier absent de
      la liste (repli sur la première ligne visible, sinon état vide). Avant :
      repli sur `items[0]` même hors vue
- [x] Clavier (limité à la page, aucun écouteur global) : ↑/↓/Début/Fin
      (focus itinérant, `role="listbox"` / `aria-selected`), Entrée ouvre la
      page de phase, `/` place le curseur dans la recherche. Sur un dossier
      prêt à ouvrir, Entrée **met seulement le focus** sur « Ouvrir la phase
      préliminaire » (changement d'état : confirmation par une 2e Entrée)
- [x] Volet de lecture (`RequestReadingPane.tsx`) : une seule action (Ouvrir
      la phase préliminaire / Traiter / Consulter le dossier / libellé en
      lecture seule) ; dossier clos : badge, aucune action de workflow
- [x] Documents : une case par document (évalué / en attente de revue /
      manquant) au lieu du graphique en anneau ; total lu de l'API
- [x] Nettoyage : une seule recherche, contrôles morts retirés (« Filtres »,
      « Nouvelle demande », « ⋮ », « Notes internes ») ; libellés accentués
      côté admin
- [x] Tests : `requestBuckets.test.ts` (9), `RequestsPage.test.tsx` (7) ;
      admin 154/154, typecheck, lint (0 erreur, 5 avertissements existants),
      build admin
- [x] Vérifié à l'écran par Fred (2026-10-09) : onglets trop larges dans la
      colonne de 400 px (libellés sur 2-3 lignes, barre de défilement)
- [x] **D1b** (2026-10-09) : `BucketTabs` accepte `size="compact"` (onglets
      de largeur égale sur une ligne, texte 12 px), utilisé par Demandes
      seulement ; onglet « En attente DG » renommé « Attente DG » pour tenir
      (la pastille d'en-tête garde « en attente DG »)
- [x] **D2 (API)** : voir la section D2
- [ ] **D3 (API, option B)** : `lastActivityAt` par dossier (tri et groupes
      « Dernière activité »), fil d'activité toutes phases (aujourd'hui M1
      seul, 120 lignes globales), table `request_views` pour « Non lues »,
      drapeaux dérivés

### D2 (2026-10-09) - cockpit Demandes : consultation des dossiers clos, libellés, requêtes (API)

Suite de D1, `requests.service.ts` (`listRequestCockpit`) seulement ; contrat
du cockpit inchangé (mêmes champs).

- [x] Dossier **rejeté / annulé** (K7 : la consultation reste permise) :
      `nextActionHref` pointe vers la dernière phase démarrée (ouverte ou
      clôturée) au lieu de `null` ; l'admin affiche alors « Consulter le
      dossier ». Aucune phase démarrée (clos pendant le circuit DG) : `null`,
      description « aucune page de phase à consulter ». Ton `danger` et
      `canStartPreliminary: false` inchangés ; aucune action de workflow
- [x] Requête par dossier supprimée : le statut effectif (M7 clôturée →
      `completed`) est calculé à partir des phases déjà chargées
      (`effectiveRequestStatus`, fonction pure partagée avec
      `resolveRequestStatus`, inchangé pour les autres appels)
- [x] Libellés accentués dans le cockpit : types, statuts, circuit, phases,
      actions, activités, indicateurs (`Délivrance`, `Terminé`, `Rejeté`,
      `Préliminaire`, `Non initialisé`…)
- [x] Tests `requests-cockpit.db.test.ts` (PostgreSQL réel, 5) : rejeté →
      lien de phase, annulé sans phase → `null`, M7 clôturée → `completed`,
      libellés ; API 366/366, admin 154/154, typecheck, lint (0 erreur),
      build API
- [ ] Hors périmètre : les mêmes libellés sans accents existent ailleurs →
      passage accents A1 (admin, fait) et A2 (API, à faire)

### A1 (2026-10-09) - accents et apostrophes dans l'interface admin

Constat (scan) : ~590 lignes de texte d'interface sans accents dans ~90
fichiers (admin ~355, API ~230 ; portail déjà propre). Découpé en A1 (admin)
et A2 (API). A1 : texte affiché seulement - aucun code, valeur, clé, route
ni contrat d'API modifié.

- [x] 67 fichiers source admin : chaînes et texte JSX uniquement (hors
      `${…}` / `{…}`, identifiants, chemins, classes). Deux passes :
      dictionnaire de mots du métier (participes en contexte : « retour
      signé », « paiement validé »… ; les verbes restent : « S5 valide la
      preuve », « le serveur refuse ») puis dictionnaire français
      (`pyspellchecker`) pour les mots sans ambiguïté ; cas ambigus tranchés
      à la main (« À activer », « mise à disposition », « Dossier réservé à
      la DN », « Conforme avec réserves », « modèle »…). Apostrophes
      manquantes corrigées (« n’est », « l’avis », « l’évaluation »)
- [x] Laissés tels quels : « Email » (usage courant), exemple d'adresse
      `prenom.nom@anac.ga`, SQL de la page Paramètres
- [x] Contrôle : aucune modification hors chaîne (script de garde), valeurs
      de code (`value`, statuts, routes) inchangées, messages d'erreur
      seulement affichés
- [x] Tests : 6 fichiers de test ajustés à la main (assertions sur le texte
      affiché) ; admin 154/154, typecheck, lint (0 erreur), build admin
- [ ] Données d'API encore sans accents tant que A2 n'est pas fait (ex.
      libellés du tableau de bord, messages d'erreur `error.ts`)
- [x] **A2 (API)** : voir la section A2

### A2 (2026-10-09) - accents dans les textes de l'API

Même méthode qu'A1, sur `apps/api/src/modules` et `apps/api/src/shared`
(25 fichiers) : messages d'erreur (`error.ts`), tableaux de bord, analytique,
réunions, courriels, contrôleurs. Codes d'erreur, actions d'audit, valeurs
d'énumération, routes et clés inchangés.

- [x] Contrôles propres à l'API : aucun texte d'API comparé côté admin /
      portail (seulement des codes d'erreur) ; les comparaisons internes sur
      un libellé (`dashboard.service.ts` : `statusLabel === 'Clôturée'`)
      restent cohérentes, producteur et consommateurs convertis ensemble ;
      PDF (invitation, rapport) déclarés en UTF-8, courriels UTF-8 par défaut
      (nodemailer) ; aucun texte modifié n'atteint un en-tête HTTP (noms de
      fichiers inchangés, `file-delivery.ts` encode déjà en RFC 5987)
- [x] Corrigé pendant la vérification : un attribut HTML d'un gabarit
      (`role="alert"`), trois journaux techniques en anglais et une variable
      (`role` dans `users.service.ts`, signalée par le typecheck) avaient été
      modifiés à tort par la transformation - rétablis. A1 revérifié : aucune
      modification de ce type
- [x] Deux libellés admin oubliés par A1 (« Avis à remettre », « Preuve à
      valider »)
- [x] Tests : 2 assertions API ajustées ; API 366/366 (PostgreSQL réel),
      admin 154/154, portail 94/94, typecheck, lint (0 erreur), build complet
- [ ] Hors périmètre : graines (`seeding/`, ex. descriptions des paramètres
      système) et scripts de démo - une graine ne met pas à jour les lignes
      déjà en base, il faudrait une migration de données
- [ ] À suivre (dette) : `dashboard.service.ts` filtre les missions R3 sur le
      libellé affiché (`statusLabel === 'Clôturée'`) au lieu d'un statut ;
      fragile si le libellé change

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
