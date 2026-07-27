# AIDN v2 — Plan de durcissement du workflow (post-M7)

Rédigé après un test de bout en bout par Fred (SU + postulant sur un seul écran,
2026-07-27) qui a révélé que la logique métier des 5 phases est posée, mais que le
parcours utilisateur — feedback visuel, navigation, revue documentaire, notifications —
n'a jamais été durci. Ce document couvre les workstreams A, C, D, E (le workstream B,
durcissement des rôles côté UI, est **délibérément reporté** : à bundler avec
l'intégration API ANAC pour la création de comptes, décision prise le 2026-07-27 —
voir `active-session/current-task.md`).

Chaque constat ci-dessous a été vérifié dans le code réel, pas supposé.

---

## A — Navigation entre phases & feedback visuel (`PhaseSidebar`)

### Constat (vérifié dans `apps/admin/src/pages/phases/preliminary/components/PhaseSidebar.tsx`)

Le composant n'a qu'une seule branche conditionnelle : `isCurrent`. Toute autre phase —
qu'elle soit **déjà clôturée** (ex. Préliminaire quand on est sur Demande Formelle) ou
**jamais ouverte** (ex. Évaluation Approfondie vue depuis M3) — reçoit exactement le
même traitement : texte gris, icône cadenas, et au clic un tooltip statique "Phase non
encore ouverte" qui s'affiche **inconditionnellement**, jamais une navigation réelle.

**Cause racine** : composant écrit pour M3 (où, par construction, toutes les autres
phases sont toujours non-ouvertes) puis réutilisé tel quel jusqu'à M7 sans jamais
recevoir la donnée multi-phase nécessaire pour distinguer les deux cas. Ce n'est pas
une régression — c'est un composant resté au stade M3.

### Design proposé

- Nouvel endpoint léger `GET /api/requests/:id/phases-summary` → statut
  (`not_started` / `open` / `closed`) + dates pour les 5 phases M3–M7 d'une demande.
- `PhaseSidebar` reçoit cette liste et rend 3 états visuels distincts :
  - **Clôturée** : icône check verte, **cliquable**, navigue vers la page de cette
    phase (chaque page gère déjà son propre affichage lecture-seule quand son statut
    n'est plus modifiable — ex. `CertificateFieldsCard` désactive déjà ses champs si
    `status !== 'in_preparation'` — donc aucun changement requis dans les pages
    elles-mêmes)
  - **Actuelle** : style existant conservé (bleu, point plein)
  - **Pas encore ouverte** : cadenas gris, non cliquable, tooltip conservé mais
    seulement pour ce cas réel
- Un seul appel réseau par page de détail demande (react-query avec une clé
  `phasesSummary(requestId)` partagée — pas de duplication même si plusieurs
  composants la consomment)

### Cas limites

- **Dossier rejeté en cours de route** (ex. paiement rejeté → `reject_dossier`) : les
  phases futures ne s'ouvriront jamais. `not_started` reste correct visuellement —
  pas besoin d'un 4ᵉ état pour la V1, juste noter que "jamais ouverte" et "pas encore
  ouverte" sont visuellement identiques par choix, pas par oubli.
- **Deep link direct** vers une page de phase clôturée (URL tapée à la main, pas via
  la sidebar) : déjà couvert nativement, chaque page vérifie son propre état serveur
  au chargement, indépendamment de comment on y arrive.
- **Course entre deux onglets** : DN a deux onglets ouverts, clôture une phase dans
  l'un — l'autre onglet affiche un état sidebar périmé jusqu'au prochain focus/refetch
  react-query. Comportement accepté (pattern déjà implicite ailleurs dans l'app), pas
  de correctif spécifique prévu.

---

## C — Visualiseur de documents intégré

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
- **PDF** : `<iframe>` — les navigateurs modernes le rendent nativement, pas de
  librairie lourde nécessaire pour ce cas
- **Images (PNG/JPG)** : `<img>` direct dans la modale
- **DOCX** : pas de rendu natif possible côté navigateur. V1 : lien de téléchargement
  classique conservé pour ce type précis (pas de blocage). V2 éventuelle : conversion
  à la volée en PDF côté serveur via LibreOffice (déjà utilisé pour la génération de
  certificats, réutilisable) — à ne construire que si le besoin est confirmé après la
  V1, coût CPU par prévisualisation à ne pas payer sans preuve d'usage
- Priorité d'intégration : **M5** (`DocumentEvaluationsCard`) en premier, comme
  demandé — c'est l'écran à plus forte densité de consultation documentaire

### Cas limites

- Fichier volumineux (MPM/Manuel Qualité en M4 peuvent être conséquents) : indicateur
  de chargement dans l'iframe, pas de timeout artificiel, message d'échec explicite
  si le fichier ne charge pas
- Type non supporté (ex. `.doc` binaire pré-2007, pas `.docx`) : fallback direct sur
  téléchargement, jamais d'erreur bloquante
- Navigation séquentielle (revoir 11 documents à la suite en M5 sans fermer/rouvrir
  la modale à chaque fois) : amélioration naturelle, **non tranchée** — à décider avec
  Fred une fois la V1 de base en place

---

## D — Réduction du scroll (pages de phase longues)

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

### Cas limites

- Une carte "repliée par défaut car complète" doit se déplier automatiquement si son
  état change après coup (ex. preuve de paiement rejetée après avoir été validée une
  première fois n'est normalement pas possible métier, mais un document M5 rejeté
  après correction doit rouvrir sa carte) — l'état replié doit dépendre du statut réel
  à chaque rendu, jamais d'un simple booléen figé au montage
- Accessibilité clavier de base pour le collapse (pas seulement souris)

---

## E — Notifications (M11) & cas limites généraux

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
| Certificat prêt pour retrait (M7)                                        | feasibility.md M11    | ✅ (partiel — DB only) |
| Blocage parapheur (3j ouvrés configurable) → DN + reception/assistant_dg | pattern Circuit DG    | ❌                     |
| Rappel corbeille documents qui traîne → SU                               | pattern M8            | ❌                     |

### Design proposé (V1 raisonnable — pas tout M11 d'un coup)

- Vrai service M11 : `createNotification()` centralisé (au lieu d'inserts ad-hoc par
  module), utilisé partout où un événement du tableau ci-dessus se produit
- Seuils 24h/3j : vérification à la demande (pas de vrai cron pour la V1) — un flag
  "déjà notifié" par déclenchement pour éviter les doublons si la vérification tourne
  plusieurs fois avant qu'une action soit prise
- UI admin : icône de notification dans `AppShell` avec compteur non-lues + liste —
  **à clarifier avec Fred** : la feasibility doc mentionne "consultation obligatoire",
  ce qui pourrait vouloir dire un vrai point de blocage (modal non-fermable) ou juste
  un badge fort — les deux sont des designs très différents
- Email réservé aux événements "à fort enjeu" déjà listés (certificat prêt, dossier
  rejeté, document à corriger) — pas systématique

### Cas limites

- Échec d'envoi email (postulant sans email valide) ne doit **jamais** bloquer
  l'action métier elle-même (changement de statut, etc.) — seulement logger l'échec
- "24h" et "3 jours ouvrés" ne sont pas équivalents — le pattern Circuit DG précise
  explicitement "ouvrés", nécessite une fonction utilitaire dédiée (pas
  `Date.now() - N*86400000`), sinon une alerte se déclenche un lundi matin pour un
  dépôt du vendredi soir
- Notification dupliquée si plusieurs agents DN consultent la même demande : la
  notification est liée à la demande/certificat, pas à un agent individuel — un seul
  enregistrement, visible par tous les DN concernés, pas une copie par agent

---

## Séquencement proposé

1. **A (sidebar)** — le plus isolé, le moins de dépendances, corrige un vrai bug de
   navigation (pas juste un raffinement)
2. **D-V1 (collapse/expand)** — petit changement, gain UX immédiat sur M4/M5
3. **C (visualiseur, M5 d'abord)** — plus gros morceau, composant réutilisable ensuite
4. **E** — le plus large ; recommandation : scoper une V1 minimale (les 3 déclencheurs
   déjà partiellement prévus : certificat prêt, document à corriger, dossier rejeté)
   avant de construire les seuils 24h/3j qui demandent un vrai mécanisme de
   vérification périodique

B (rôles UI) reste hors scope, à bundler avec l'intégration ANAC.

## Ouvert, à trancher avec Fred avant de commencer E

- "Consultation obligatoire" du centre de notifications = badge fort ou vrai blocage ?
- E V1 minimale (3 déclencheurs) acceptable, ou faut-il les seuils 24h/3j dès
  maintenant ?
