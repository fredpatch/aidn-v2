# AIDN v2 - Plan de durcissement du workflow (post-M7)

Rédigé après un test de bout en bout par Fred (SU + postulant sur un seul écran,
2026-07-27) qui a révélé que la logique métier des 5 phases est posée, mais que le
parcours utilisateur - feedback visuel, navigation, revue documentaire, notifications -
n'a jamais été durci. Ce document couvre les workstreams A, C, D, E. Le workstream B
(durcissement des rôles côté UI) avait été reporté pour le bundler avec
l'intégration API ANAC ; la partie **gestion/activation des utilisateurs internes
depuis Personnel ANAC est maintenant implémentée** (2026-07-28), tandis que les
permissions fines côté UI restent à traiter si un écran expose encore une action
non autorisée.

Chaque constat ci-dessous a été vérifié dans le code réel, pas supposé.

---

## Phase 2 - Demande formelle / courrier - ✅ Durci (2026-07-28)

Référence legacy auditée et conservée :
`exploration-cache/project/legacy-phase2-courrier-audit.md`.

### Implémentation

- La lettre de demande formelle suit maintenant le même circuit physique que la
  demande initiale : dépôt portail, impression, mise en signature, scan du retour
  signé, puis traitement DN.
- Nouveau module API `courrier-tasks` et page admin `Courriers a traiter` pour
  `reception`, `assistant_dg`, `SU`.
- Le workspace DN M4 ne marque plus une lettre comme signée et ne la transmet plus :
  il lit seulement le statut du retour signé.
- La réunion formelle ne peut être planifiée qu'après retour signé scanné
  (`pending_review`), avec garde backend.
- Les documents du dossier formel sont applicant-owned : DN les consulte mais ne
  peut plus les joindre/remplacer.
- `Demandes` et les pages de phase sont réservées à DN/SU ; les autres rôles
  passent par leurs écrans métier dédiés.
- La détection de conflits réunion n'occupe l'agenda que pour les rendez-vous
  encore `scheduled`; migration `0003_meeting_active_slot_index.sql`.

### Cas limites traités

- Deep link d'un rôle non DN vers une phase : écran `Acces refuse`, plus garde API.
- Staff qui tente d'uploader une pièce M4 par API : `403`.
- Réunion tenue/no-show/annulée/reprogrammée : ne déclenche plus de conflit agenda.

---

## A - Navigation entre phases & feedback visuel (`PhaseSidebar`) - ✅ Terminé (2026-07-27)

### Implémentation

- Nouvel endpoint `GET /api/phases/requests/:requestId/phases-summary` - statut
  (`not_started`/`open`/`closed`) des 5 phases M3-M7. **Volontairement hors du gate
  DN-only du reste du module `phases`** (placé avant le `router.use(requireRole(...))`)
  : donnée en lecture seule, faible sensibilité, et consultée par des rôles non-DN
  (ex. `r3_agent` via "Mes Inspections" qui atterrit sur une page de phase M6)
- `PhaseSidebar` récupère ce résumé lui-même (un seul `requestId` en prop suffit,
  pas besoin que chaque page de phase gère le fetch) et distingue maintenant 3 états
  réels : clôturée (check vert, cliquable, navigue), actuelle (bleu, inchangé), pas
  encore ouverte (cadenas gris, tooltip conservé mais seulement pour ce cas réel)
- `PHASE_ROADMAP` étendu avec le chemin de route de chaque phase pour permettre la
  navigation
- Les 5 pages de phase (M3-M7) mises à jour pour passer `requestId` - aucun autre
  changement requis dans les pages elles-mêmes, chaque page gérait déjà son propre
  affichage lecture-seule selon son statut serveur

### Cas limites traités tels que planifiés

- Dossier rejeté en cours de route : `not_started` reste correct visuellement pour
  les phases qui ne s'ouvriront jamais, pas de 4ᵉ état introduit
- Deep link direct vers une phase clôturée : déjà couvert nativement (chaque page
  vérifie son propre état serveur au chargement)

### Constat (vérifié dans `apps/admin/src/pages/phases/preliminary/components/PhaseSidebar.tsx`)

Le composant n'a qu'une seule branche conditionnelle : `isCurrent`. Toute autre phase -
qu'elle soit **déjà clôturée** (ex. Préliminaire quand on est sur Demande Formelle) ou
**jamais ouverte** (ex. Évaluation Approfondie vue depuis M3) - reçoit exactement le
même traitement : texte gris, icône cadenas, et au clic un tooltip statique "Phase non
encore ouverte" qui s'affiche **inconditionnellement**, jamais une navigation réelle.

**Cause racine** : composant écrit pour M3 (où, par construction, toutes les autres
phases sont toujours non-ouvertes) puis réutilisé tel quel jusqu'à M7 sans jamais
recevoir la donnée multi-phase nécessaire pour distinguer les deux cas. Ce n'est pas
une régression - c'est un composant resté au stade M3.

### Design proposé

- Nouvel endpoint léger `GET /api/requests/:id/phases-summary` → statut
  (`not_started` / `open` / `closed`) + dates pour les 5 phases M3–M7 d'une demande.
- `PhaseSidebar` reçoit cette liste et rend 3 états visuels distincts :
  - **Clôturée** : icône check verte, **cliquable**, navigue vers la page de cette
    phase (chaque page gère déjà son propre affichage lecture-seule quand son statut
    n'est plus modifiable - ex. `CertificateFieldsCard` désactive déjà ses champs si
    `status !== 'in_preparation'` - donc aucun changement requis dans les pages
    elles-mêmes)
  - **Actuelle** : style existant conservé (bleu, point plein)
  - **Pas encore ouverte** : cadenas gris, non cliquable, tooltip conservé mais
    seulement pour ce cas réel
- Un seul appel réseau par page de détail demande (react-query avec une clé
  `phasesSummary(requestId)` partagée - pas de duplication même si plusieurs
  composants la consomment)

### Cas limites

- **Dossier rejeté en cours de route** (ex. paiement rejeté → `reject_dossier`) : les
  phases futures ne s'ouvriront jamais. `not_started` reste correct visuellement -
  pas besoin d'un 4ᵉ état pour la V1, juste noter que "jamais ouverte" et "pas encore
  ouverte" sont visuellement identiques par choix, pas par oubli.
- **Deep link direct** vers une page de phase clôturée (URL tapée à la main, pas via
  la sidebar) : déjà couvert nativement, chaque page vérifie son propre état serveur
  au chargement, indépendamment de comment on y arrive.
- **Course entre deux onglets** : DN a deux onglets ouverts, clôture une phase dans
  l'un - l'autre onglet affiche un état sidebar périmé jusqu'au prochain focus/refetch
  react-query. Comportement accepté (pattern déjà implicite ailleurs dans l'app), pas
  de correctif spécifique prévu.

---

## C - Visualiseur de documents intégré

### Implémentation V1 - M5 d'abord (2026-07-28)

- Nouveau composant réutilisable `DocumentViewer` côté admin.
- Intégration prioritaire dans M5 (`DocumentEvaluationsCard`) : chaque document à
  évaluer s'ouvre maintenant dans un visualiseur in-app au lieu d'imposer un nouvel
  onglet.
- PDF : rendu via `<iframe>`.
- Images PNG/JPG/JPEG/WEBP : rendu via `<img>`.
- DOC/DOCX/autres formats non prévisualisables : fallback explicite avec actions
  "Nouvel onglet" et "Télécharger", sans bloquer le workflow.
- Le visualiseur garde les actions de sortie classiques : fermer, nouvel onglet,
  télécharger.

### Reste à faire

- Brancher le même composant sur les autres liens documentaires M3, M4, M6 et M7
  après validation de l'ergonomie M5.
- Décider si la navigation séquentielle entre les 11 documents M5 est nécessaire.
- Évaluer une conversion serveur DOCX → PDF seulement si l'usage terrain le justifie.

### Contexte (cahier des charges, section 4 "Informations à gérer")

Les volumes réels sont élevés, pas exceptionnels : M4 minimum 35 éléments PDF, M5 =
revue des mêmes 11 documents un par un, M7 minimum 13 éléments. L'ouverture d'un
nouvel onglet navigateur à chaque "voir le fichier" est un vrai frein UX pour un usage
quotidien à ce volume, pas un confort superflu.

### Constat

Chaque lien "voir le fichier", dans toutes les phases M3–M7, est un simple
`<a target="_blank">` vers `${API_ORIGIN}${fileUrl}`. Aucun visualiseur in-app
n'existe nulle part dans l'application.

### Design proposé

- Composant réutilisable (modale ou panneau latéral) `DocumentViewer`
- **PDF** : `<iframe>` - les navigateurs modernes le rendent nativement, pas de
  librairie lourde nécessaire pour ce cas
- **Images (PNG/JPG)** : `<img>` direct dans la modale
- **DOCX** : pas de rendu natif possible côté navigateur. V1 : lien de téléchargement
  classique conservé pour ce type précis (pas de blocage). V2 éventuelle : conversion
  à la volée en PDF côté serveur via LibreOffice (déjà utilisé pour la génération de
  certificats, réutilisable) - à ne construire que si le besoin est confirmé après la
  V1, coût CPU par prévisualisation à ne pas payer sans preuve d'usage
- Priorité d'intégration : **M5** (`DocumentEvaluationsCard`) en premier, comme
  demandé - c'est l'écran à plus forte densité de consultation documentaire

### Cas limites

- Fichier volumineux (MPM/Manuel Qualité en M4 peuvent être conséquents) : indicateur
  de chargement dans l'iframe, pas de timeout artificiel, message d'échec explicite
  si le fichier ne charge pas
- Type non supporté (ex. `.doc` binaire pré-2007, pas `.docx`) : fallback direct sur
  téléchargement, jamais d'erreur bloquante
- Navigation séquentielle (revoir 11 documents à la suite en M5 sans fermer/rouvrir
  la modale à chaque fois) : amélioration naturelle, **non tranchée** - à décider avec
  Fred une fois la V1 de base en place

---

## D - Réduction du scroll (pages de phase longues)

### Constat

M4 (11 documents + réunion + clôture) et M5 (11 évaluations + paiement + clôture)
sont les plus longues par construction (empilement vertical de cartes). Le cahier des
charges confirme que ces volumes sont la norme métier pour ces deux phases
spécifiquement, pas une exception à corriger en amont.

### Design proposé

- **V1 recommandée** : rendre chaque carte repliable (collapse/expand), repliée par
  défaut si son contenu est déjà complet/validé à l'arrivée sur la page. Change
  moins de structure que des onglets, cohérent avec le pattern sidebar-checklist déjà
  existant (qui montre déjà l'état global sans scroller), livrable plus vite.
- **V2 si le besoin persiste après retour terrain** : structure à onglets horizontaux
  par section (Paiement / Documents / Réunion / Clôture)

### Implémentation V1 - M4/M5 (2026-07-29)

- Nouveau composant admin réutilisable `CollapsibleCard`.
- M4 : lettre officielle, dossier de demande formelle, réunion formelle et clôture
  sont repliables.
- M5 : paiement, évaluation des documents et clôture sont repliables.
- Les sections complètes/résolues se replient par défaut en fonction de l'état réel
  courant, pas d'un état figé au montage.
- Les actions actives/incomplètes restent ouvertes par défaut pour ne pas cacher le
  prochain travail à faire.

### Cas limites

- Une carte "repliée par défaut car complète" doit se déplier automatiquement si son
  état change après coup (ex. preuve de paiement rejetée après avoir été validée une
  première fois n'est normalement pas possible métier, mais un document M5 rejeté
  après correction doit rouvrir sa carte) - l'état replié doit dépendre du statut réel
  à chaque rendu, jamais d'un simple booléen figé au montage
- Accessibilité clavier de base pour le collapse (pas seulement souris)

---

## E - Notifications (M11) & cas limites généraux

### Constat important : ce n'est pas du polish, c'est un module quasi entier non construit

Actuellement, un seul enregistrement brut existe (`db.insert(notifications)` pour
`CERTIFICATE_READY` en M7). Aucun centre de notification in-app, aucun envoi email
réel, aucun des autres déclencheurs listés ci-dessous n'est câblé.

### Déclencheurs requis mais non implémentés (cahier des charges + feasibility.md)

| Déclencheur                                                              | Source                | Statut                 |
| ------------------------------------------------------------------------ | --------------------- | ---------------------- |
| Demande créée sans action DG après 24h                                   | Cahier des charges §6 | ❌                     |
| Document envoyé par le postulant sans action DN après 24h                | Cahier des charges §6 | ❌                     |
| Tout transfert DG → DN                                                   | Cahier des charges §6 | ❌                     |
| Document rejeté/à corriger + délai de re-upload (M5)                     | feasibility.md M11    | ❌                     |
| Dossier rejeté avec motif (paiement)                                     | feasibility.md M11    | ❌                     |
| Certificat prêt pour retrait (M7)                                        | feasibility.md M11    | ✅ (partiel - DB only) |
| Blocage parapheur (3j ouvrés configurable) → DN + reception/assistant_dg | pattern Circuit DG    | ❌                     |
| Rappel corbeille documents qui traîne → SU                               | pattern M8            | ❌                     |

### Design proposé (V1 raisonnable - pas tout M11 d'un coup)

- Vrai service M11 : `createNotification()` centralisé (au lieu d'inserts ad-hoc par
  module), utilisé partout où un événement du tableau ci-dessus se produit
- Seuils 24h/3j : vérification à la demande (pas de vrai cron pour la V1) - un flag
  "déjà notifié" par déclenchement pour éviter les doublons si la vérification tourne
  plusieurs fois avant qu'une action soit prise
- UI admin : icône de notification dans `AppShell` avec compteur non-lues + liste -
  **à clarifier avec Fred** : la feasibility doc mentionne "consultation obligatoire",
  ce qui pourrait vouloir dire un vrai point de blocage (modal non-fermable) ou juste
  un badge fort - les deux sont des designs très différents
- Email réservé aux événements "à fort enjeu" déjà listés (certificat prêt, dossier
  rejeté, document à corriger) - pas systématique

### Cas limites

- Échec d'envoi email (postulant sans email valide) ne doit **jamais** bloquer
  l'action métier elle-même (changement de statut, etc.) - seulement logger l'échec
- "24h" et "3 jours ouvrés" ne sont pas équivalents - le pattern Circuit DG précise
  explicitement "ouvrés", nécessite une fonction utilitaire dédiée (pas
  `Date.now() - N*86400000`), sinon une alerte se déclenche un lundi matin pour un
  dépôt du vendredi soir
- Notification dupliquée si plusieurs agents DN consultent la même demande : la
  notification est liée à la demande/certificat, pas à un agent individuel - un seul
  enregistrement, visible par tous les DN concernés, pas une copie par agent

---

## Séquencement proposé

1. **A (sidebar)** - ✅ Terminé (2026-07-27), voir section A ci-dessus
2. **B partiel (Personnel ANAC / utilisateurs internes)** - ✅ Terminé (2026-07-28) :
   Users page à deux onglets, API `/api/personnel-anac`, validation matricule ANAC
   avant création, OTP, activation/réinitialisation conservées, matricules canoniques
   à 4 chiffres (`0041`).
3. **Phase 2 formal/courrier hardening** - ✅ Terminé (2026-07-28)
4. **Phase 3/M5 workflow hardening** - prochain passage fonctionnel complet
5. **D-V1 (collapse/expand)** - ✅ Terminé (2026-07-29), voir section D ci-dessus
6. **C-V2 (visualiseur hors M5)** - ✅ Terminé (2026-07-29) : M3/M4/M6/M7 utilisent le composant réutilisable
7. **E** - le plus large ; recommandation : scoper une V1 minimale (les 3 déclencheurs
   déjà partiellement prévus : certificat prêt, document à corriger, dossier rejeté)
   avant de construire les seuils 24h/3j qui demandent un vrai mécanisme de
   vérification périodique

B restant : audit des permissions fines côté UI, à faire après stabilisation des
écrans prioritaires si le backend expose encore des actions que certains rôles voient
sans pouvoir les exécuter.

## Ouvert, à trancher avec Fred avant de commencer E

- "Consultation obligatoire" du centre de notifications = badge fort ou vrai blocage ?
- E V1 minimale (3 déclencheurs) acceptable, ou faut-il les seuils 24h/3j dès
  maintenant ?

## Update 2026-07-28 - M5/M6 role hardening done

- Phase 3/M5: S5 owns invoice/payment validation, DN owns document verdicts,
  applicant owns proofs and corrected documents. DN payment UI is read-only.
- Phase 4/M6: same S5 payment ownership as M5. DN continues after payment
  validation; R3 owns only assigned inspection visit/opinion work.
- `Paiements S5` is now the dedicated S5 inbox for M5/M6 payment tasks and opens
  compact payment-only detail views.
- `Mes Inspections` now lets assigned `r3_agent` users open a compact M6 visit +
  Avis R3 view, mark the visit held, and submit the avis.
- The integrated admin document viewer no longer has the redundant top-level
  `Imprimer` button, and M5 DN verdicts can be entered directly from the viewer.
- C-V2 is done: M3 meeting/declaration files, M4 formal documents, M6 payment
  files, and M7 payment/certificate documents now reuse the integrated admin
  `DocumentViewer`.
- UI redesign workflow is done for the full DN phase path: M3-M7 now use the
  reusable admin `WorkflowCockpit` shell with breadcrumb, phase stepper, left
  phase/checklist rail, center work cards, and right next-action/key-info rail.
  M4 and M5 document lists now use compact file-icon rows with first-five display
  and show more/less expansion.
- Dashboard KPI V1 is started/done for the API and DN/SU admin landing page:
  `/api/dashboard/summary` now exposes the first operational indicators requested
  by DN (phase durations, global duration, volumes, deliveries, pending signature
  courriers, pending payments, required actions, meetings, activity, alerts).
- Dashboard SLA/delay thresholds are now configurable through `system_parameters`
  under module `M12`, with API fallbacks for existing local environments.
- Dashboard action ownership is role-aware: Reception/Assistant DG own signature
  tasks, S5 owns payment tasks, DN owns documentary review tasks, while DN/SU can
  monitor non-owned actions in read-only mode.
- Operational cockpit redesign pass completed:
  - `Courriers officiels` now uses KPI cards, bucket tabs, search/sort, a dense
    courrier table, selected courrier detail panel, integrated document viewer, and
    role-aware dossier quick action.
  - `Facturation S5` now uses the same cockpit structure over M5/M6/M7 payment
    queues, with invoice upload/record-as-sent, proof validation/rejection, in-app
    invoice/proof preview, and validated/rejected history retained after phase
    closure.
- S5 dashboard V1 is done: `/api/dashboard/s5-summary` powers a dedicated
  `Tableau de bord - Facturation S5` landing page for `s5_agent`, focused on
  invoices to transmit, proofs to verify, validation/rejection history, alerts,
  recent activity, and period progress. Amount totals remain intentionally omitted
  until invoice amounts exist in the payment model.
- Reception/Assistant DG dashboard V1 is done: `/api/dashboard/reception-summary`
  powers a dedicated signature-circuit landing page. Postulant account review was
  removed from Reception/Assistant scope and remains limited to DN/SU.
- R3 dashboard V1 is done: `/api/dashboard/r3-summary` powers a dedicated
  inspections landing page, while `Mes inspections` is now the R3 mission workbench
  with assigned-mission table, filters, selected detail panel, visit-held action,
  and Avis R3 submission.
- Transverse `Reunions` cockpit is done: `/api/meetings` powers a compact DN/SU
  meeting workbench with metrics, filters, week/list views, upcoming meetings,
  selected detail, ticket access, tenue/absence/reporting, and rescheduling.
- `Demandes` cockpit V1 is done: `/api/requests/cockpit` powers a dense request
  intake/monitoring page with KPIs, filtered list, right-side detail workspace,
  Chart.js document completeness, activity, next action, and read-only terminal
  workflow states.
- Next priority: final role replay on the redesigned cockpit/dashboard, then E V1
  notifications and M12 exports/reports.

## Update 2026-08-03 - Analytics & reports V1

- M12 analytics V1 is now implemented:
  - backend endpoint `/api/analytics/overview`, scoped to `dn_supervisor` and `SU`;
  - admin route `/analytique` with sidebar entry;
  - reusable analytics components for filters, KPI cards, charts, blocker cards,
    delayed dossier table, and report cards;
  - Chart.js used for duration trend, phase-duration bar chart, aging distribution,
    and SLA distribution.
- Metrics are intentionally conservative and based only on existing reliable
  workflow timestamps: M7 closure for completed dossier duration, open phase age vs
  SLA target, DG circuit timestamps, payment proof/invoice state, meeting CR gaps,
  and `requests.updatedAt` as the temporary inactivity proxy.
- A rerunnable seed script was added:
  `npm run seed:analytics --workspace=apps/api`. It creates 42 realistic demo
  dossiers across roughly one year under `seed-analytics-*`, covering completed
  dossiers, active phases, DG waits, payment blockers, overdue phases, missing CRs,
  cancelled and rejected cases.
- Follow-up remains: validate SLA definitions with DN, replace broad V1 table loads
  with aggregate queries, add true PDF/Excel exports, monthly/manual generation, and
  IA-assisted report review.
