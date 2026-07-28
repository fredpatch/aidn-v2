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
      **— durci 2026-07-28** : création interne adossée à l'annuaire Personnel
      ANAC (recherche/liste live, préremplissage depuis la fiche agent, validation
      matricule avant création). Le mode manuel ne reste acceptable qu'en fallback
      local explicite via `PERSONNEL_ANAC_ENFORCE=false`. Les matricules sont
      conservés au format canonique à 4 chiffres (`0041`, jamais `41`).
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
- [x] **Suivi portail** : appliquée la même convention React Query + `src/lib/api`
      au module `MyRequestPage` (demandes, phase préliminaire, phase formelle)
      sans bloquer Sprint 3

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

## Sprint 3 — Phase Demande formelle (M4) — ✅ Terminé (confirmé 2026-07-27)

- [x] Checklist 11 documents (Soumis / Manquant)
- [x] Circuit signature limité à la lettre de demande officielle
- [x] Upload direct des 10 autres documents par le postulant (avant/après réunion)
- [x] Réunion formelle (réutilise pattern M3)
- [x] Clôture de phase (sans décision recevable/non-recevable dans l'app)
- [x] Verrou : phase non-clôturable tant que 11/11 documents non soumis

### Sprint 3 — avancement backend (2026-07-09, en cours)

- [x] Nouveau module API `formal-request` monté sous `/api/formal-request`
- [x] Démarrage phase M4 conditionné à la clôture M3
- [x] Circuit signature de la lettre de demande formelle (`submitted` -> `in_signature_circuit` -> `pending_review`)
- [x] Bundle `by-request/:requestId` (phase, circuit lettre, checklist docs, réunion, completionRate)
- [x] Upload par slot des documents formels par le postulant ; DN consulte uniquement
- [x] Contrôles de clôture M4 : retour signé scanné, 11/11 documents soumis, réunion résolue

### Sprint 3 — durcissement workflow Phase 2 (2026-07-28)

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

### Sprint 3 — avancement frontend admin (2026-07-09, en cours)

- [x] Route admin M4 ajoutée : `/demandes/:requestId/phase-formelle`
- [x] Nouveau module UI `pages/phases/formal/*` (page, hooks, cartes, helpers, constantes)
- [x] Couche API admin M4 dans `apps/admin/src/lib/api/formal.api.ts` + types associés
- [x] Intégration React Query M4 (query keys `formal.*`, hooks mutations + invalidation)
- [x] UI admin M4 (lettre DG, checklist documents, réunion, clôture)
- [x] UI admin M4 durcie : circuit lettre externalisé vers `Courriers a traiter`,
      documents applicant-owned en consultation seule côté DN

### Sprint 3 — avancement frontend portail (2026-07-10, en cours)

- [x] `MyRequestPage` enrichie : section M3 polish (statuts lisibles, liens API centralisés, libellés FR)
- [x] Première section M4 intégrée côté portail (`FormalPhaseSection`) : lettre officielle + checklist docs + réunion
- [x] Refactor portail vers convention React Query + `src/lib/api` (module requests désormais split en hooks/components/api/types)
- [x] Finalisation UI portail M4 (orchestration modulaire, hooks dédiés, invalidation)

## Sprint 4 — Évaluation approfondie (M5) — ✅ Terminé (confirmé 2026-07-27)

- [x] Upload facture + preuve de paiement (S5)
- [x] Évaluation individuelle des 11 documents (Validé/Rejeté/À corriger)
- [x] Re-upload ciblé par document rejeté, avec délai configurable
- [x] Clôture de phase (pattern standard)

### Sprint 4 — implémentation complète (confirmé 2026-07-27)

- [x] Module API `deep-evaluation` monté sous `/api/deep-evaluation`
- [x] Endpoints M5 : bundle, ouverture, facture, preuve, validation/rejet paiement,
      verdict document, resoumission, clôture
- [x] Route/page admin : `/demandes/:requestId/evaluation-approfondie` — 17 fichiers
      (page, hooks, cartes PaymentCard/DocumentEvaluationsCard/ClosureCard, api/types/constants/helpers)
- [x] Query keys admin `deepEvaluation.*`
- [x] Intégration portail : section `DeepEvaluationSection` dans la carte de demande active
- [x] Typecheck propre sur les 3 workspaces (api, admin, portal) — vérifié 2026-07-27

## Sprint 5 — Démonstration/Inspection (M6) — Terminé (2026-07-27)

- [x] Rôle `r3_agent` (file de dossiers propre — auth staff existante réutilisée, pas de login séparé, décision confirmée)
- [x] Facture + preuve de paiement (réutilise pattern M5)
- [x] Planification visite sur site (réutilise pattern réunion, `meetingType: 'site_visit'`)
- [x] Soumission avis R3 (verdict + note en une action)
- [x] Clôture de phase automatique après avis R3 (aucune décision DN requise)
- [x] UI portail — soumission preuve de paiement, statut visite en lecture seule

### Sprint 5 — visibilité documentaire (2026-07-27)

- [x] **Fix sécurité** : `GET /site-inspection/by-request/:requestId` renvoyait `inspection`
      (avis R3) à tout appelant authentifié, y compris le postulant via `authenticateEither`.
      Corrigé pour ne renvoyer ce champ qu'aux appelants staff — l'avis R3 est
      DN-interne uniquement (`modules-feasibility.md`, section visibilité documentaire),
      jamais exposé même en lecture seule au postulant.

### Sprint 5 — implémentation (2026-07-27)

- [x] Module API `site-inspection` monté sous `/api/site-inspection` — aucune migration
      nécessaire (`r3_agent`, `site_inspections`, `inspection_verdict`, `M6`, `site_visit`
      étaient déjà schéma-prêts)
- [x] Endpoint utilitaire `GET /api/users/by-role/:role` ajouté (staff, non SU-only) —
      nécessaire pour que DN puisse choisir l'agent R3 lors de la planification
- [x] Admin : route `/demandes/:requestId/demonstration-inspection`, page + cartes
      (Paiement, Visite sur site, Avis R3), hooks React Query, `lib/api/site-inspection.*`
- [x] Admin : page `Mes Inspections` (`/mes-inspections`), nav scopée `r3_agent`/`SU`,
      liste les dossiers M6 ouverts avec une visite assignée à l'agent connecté
- [x] Portail : `SiteInspectionSection` dans `ActiveRequestCard` — preuve de paiement,
      statut de la visite en lecture seule ; avis R3 jamais affiché (voir ci-dessus)
- [x] Typecheck propre sur les 3 workspaces (api, admin, portal) — vérifié 2026-07-27
- Décision (non explicite dans la spec, à confirmer si besoin) : planification de la
  visite gatée sur facture envoyée seulement ; validation complète du paiement gatée
  sur la soumission de l'avis R3 (comme M3/M4/M5)

## Sprint 6 — Délivrance & Certificats (M7) — Terminé (2026-07-27)

- [x] Facture + preuve de paiement (réutilise pattern M5/M6)
- [x] Création certificat à validation du paiement (statut `En préparation`)
- [x] KPI temps-jusqu'à-délivrance : point zéro = validation paiement
- [x] Suivi statuts : impression → signature → archivage → notification → retrait
- [x] Override manuel du type de certificat par DN
- [x] Compteur temps-jusqu'au-retrait (notification → `Retiré`)
- [x] UI portail — preuve de paiement, statut simplifié, pas de téléchargement
      (retrait toujours en personne)

### Sprint 6 — implémentation (2026-07-27)

- [x] Templates HTML/CSS finaux (Fred) : logo intégré en base64, layout par
      tables (pas de CSS Grid sauf le bloc header), `renderCertificate(data)`
      exposé en JS pour peupler les 22 champs via `data-field`
- [x] Schéma : `certificates.scopeDetails` (jsonb, forme fixe à 4 catégories —
      pas une liste dynamique, verrouillé avec Fred), champs DN (référence
      d'approbation, dates, override DG)
- [x] Module API `certificates` monté sous `/api/certificates` — génération
      via Puppeteer (`page.setContent` + `page.evaluate(renderCertificate)` +
      `page.pdf()`), stockage via `document_versions`
      (`ownerType: 'certificate_document'`)
- [x] Admin : route `/demandes/:requestId/delivrance`, cartes Paiement /
      Informations certificat / Classes-qualifications / Génération-cycle
- [x] Portail : `CertificatesSection` dans `ActiveRequestCard` — statuts
      imprimé/signé/archivé regroupés en "en préparation" (détail interne DN
      non pertinent pour le postulant), aucun lien de téléchargement du
      document généré (retrait physique uniquement)
- [x] Typecheck propre sur les 3 workspaces — vérifié 2026-07-27
- [x] Génération Puppeteer confirmée fonctionnelle par Fred en conditions
      réelles (2026-07-27) — le rendu du PDF depuis le template HTML final
      fonctionne correctement de bout en bout

## Durcissement du workflow (post-M7, avant Sprint 7+)

Plan complet : `exploration-cache/project/hardening-plan.md`. Déclenché par un test de
bout en bout de Fred (2026-07-27) après la fin des 5 phases OMA. Workstream B a été
partiellement traité avec l'intégration Personnel ANAC pour les comptes internes ; il
reste un audit plus étroit des permissions fines côté UI.

- [x] **A** — Navigation entre phases + feedback visuel (`PhaseSidebar`) — terminé 2026-07-27
- [x] **UX phase-level** — résumé "prochaine action / responsable / blocage / métriques" harmonisé sur M3-M7 — terminé 2026-07-28
- [x] **C-V1** — Visualiseur de documents intégré, priorité M5 (`DocumentEvaluationsCard`) — terminé 2026-07-28
- [x] **B partiel / M13 interne** — Gestion utilisateurs depuis Personnel ANAC, activation OTP, détection doublons, matricules canoniques 4 chiffres — terminé 2026-07-28
- [x] **Phase 1 / M13 postulant + intake** — demande de compte portail, revue ANAC
      avec dédoublonnage organisme, recherche manuelle/sigles (`ADL` -> organisme
      existant), dashboard postulant, et circuit signature clarifié
      (`Ouvrir / imprimer` -> confirmation `En signature` -> scan retour signé) —
      terminé 2026-07-28
- [ ] **D-V1** — Cartes repliables (collapse/expand) pour réduire le scroll M4/M5 — prochain
- [ ] **C-V2** — Brancher `DocumentViewer` aux autres liens documentaires M3/M4/M6/M7 après validation terrain M5
- [ ] **E** — Notifications (M11) — V1 minimale (certificat prêt, document à corriger, dossier rejeté)

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
- [x] Repriser flux demande de compte postulant (anti-bot, anti-doublon, revue
      organisme, rejet motivé) — implémenté 2026-07-28 avec revue ANAC,
      activation portail, recherche organisme existant et protection contre les
      variantes/sigles (`ADL`, noms abrégés)
- [x] Contacts multiples par organisme, permissions égales, étiquetage
      Principal/Secondaire/Tertiaire
- [ ] Panneau SU : gestion utilisateurs, corbeille documents, configuration
      (seuils d'alerte, délais dynamiques)
- [x] **Remplacer la création manuelle d'utilisateur interne par une activation
      depuis l'annuaire Personnel ANAC** — implémenté 2026-07-28 en reprenant la
      logique SICOT disponible (`personnel-anac` API read-only + Users page à deux
      onglets), adaptée au modèle AIDN multi-rôle (`user_roles`). Endpoints AIDN :
      `/api/personnel-anac`, `/api/personnel-anac/search`,
      `/api/personnel-anac/matricule/:employeeCode`. Cas verrouillé après test :
      les matricules sont canoniques sur 4 chiffres (`0041`), zéros inclus.

---

## Notes de méthode

- Chaque sprint ci-dessus correspond à un module de `project/modules-feasibility.md` —
  s'y référer pour les décisions de conception et cas limites déjà résolus avant
  d'implémenter quoi que ce soit
- Les patterns transverses (`technical/cross-cutting-patterns.md`) doivent être
  implémentés comme des modules/composants partagés, pas redéveloppés à chaque sprint
- Le suivi vivant (nouvelles idées, pistes non retenues) reste dans la base Notion
  « Idées & Pistes d'Exploration », pas dans ce fichier
