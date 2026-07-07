# 📐 AIDN v2 — Conventions

Convention alignée sur SICOT (même Cellule ANAC, même style d'application) — tout
écart volontaire par rapport à SICOT est signalé explicitement ci-dessous.

## Naming

**Écart volontaire par rapport à SICOT** : tout le code (variables, fonctions,
composants, services) est en **anglais**. Seul le texte affiché à l'utilisateur
(UI) reste en français. SICOT mélangeait français/anglais dans le code serveur ;
ce choix est délibérément différent pour AIDN — cohérence avec les conventions des
frameworks utilisés (React, Express, Drizzle) et code plus lisible sans changement
de langue au milieu d'une fonction.

### Fichiers & dossiers

| Type                  | Convention                   | Exemple                             |
| --------------------- | ---------------------------- | ----------------------------------- |
| Composants React      | PascalCase                   | `LoginPage.tsx`, `PhaseCard.tsx`    |
| Hooks                 | camelCase, préfixe `use`     | `useRequests.ts`, `useDocuments.ts` |
| Fichiers API (client) | camelCase, suffixe `.api.ts` | `requests.api.ts`                   |
| Services serveur      | camelCase, `.service.ts`     | `requests.service.ts`               |
| Contrôleurs serveur   | camelCase, `.controller.ts`  | `requests.controller.ts`            |
| Routes serveur        | camelCase, `.route.ts`       | `requests.route.ts`                 |
| Dossiers de page      | kebab-case                   | `pages/requests/`                   |
| Sous-composants       | co-localisés avec la page    | `pages/requests/components/`        |

### Variables & fonctions

| Type             | Convention                             | Exemple                                                    |
| ---------------- | -------------------------------------- | ---------------------------------------------------------- |
| Composants React | PascalCase                             | `function PhaseCard()`                                     |
| Hooks            | camelCase                              | `const { requests } = useRequests()`                       |
| Services serveur | camelCase, anglais                     | `list`, `create`, `closePhase`                             |
| Colonnes BDD     | camelCase en Drizzle, snake_case en PG | `firstOpenedAt` → `first_opened_at`                        |
| Endpoints API    | anglais kebab-case                     | `/close-phase`, `/validate-payment-proof`                  |
| Codes d'erreur   | SCREAMING_SNAKE_CASE                   | `REQUEST_ALREADY_ACTIVE`, `CHECKLIST_INCOMPLETE`           |
| Actions d'audit  | SCREAMING_SNAKE_CASE                   | `REQUEST_SUBMITTED`, `PHASE_CLOSED`, `CERTIFICATE_CREATED` |

### Codes de module

Utilisés de façon cohérente dans `audit_logs.module` et les préfixes de route,
correspondant aux 13 modules verrouillés lors de l'étude de faisabilité :

`M1` Intake & Circuit DG · `M3` Phase Préliminaire · `M4` Phase Demande formelle ·
`M5` Évaluation approfondie · `M6` Démonstration/Inspection · `M7` Délivrance ·
`M8` Documents · `M9` Paiements · `M10` Réunions · `M11` Notifications ·
`M12` Dashboard & Rapports · `M13` Administration & Rôles

_(M2 — Circuit DG — a été fusionné dans M1 pendant l'étude de faisabilité ; le code
`M2` n'est donc pas utilisé, pour éviter toute confusion avec un module qui n'existe
pas séparément.)_

## Politique linguistique

**Diffère de SICOT** — séparation stricte code / interface :

- **Code serveur** : anglais partout — noms de fonctions, variables, types, noms de
  fichiers (`list`, `create`, `applicant`, `signatureCircuit`)
- **Code client** : anglais partout, y compris les termes métier (`Applicant`,
  `Request`, `Phase`, pas de mélange avec le français)
- **Texte UI** : français (seule langue pour l'instant, pas de `i18n/` multi-langue
  prévu — l'app est un outil interne ANAC + portail francophone)
- **Commentaires** : anglais, y compris pour la logique métier (cohérence avec le
  reste du code)
- **Messages d'erreur retournés au client** : français (traduits depuis le code
  d'erreur anglais, jamais codés en dur dans la logique serveur)
- **Codes d'erreur (levés en interne)** : SCREAMING_SNAKE_CASE anglais

## Génération automatique de références

| Module      | Format           | Exemple          |
| ----------- | ---------------- | ---------------- |
| Demandes    | `DEM-YYYY-XXXX`  | `DEM-2026-0001`  |
| Certificats | `CERT-YYYY-XXXX` | `CERT-2026-0042` |

Implémenté dans le service, jamais dans le contrôleur. Padding à 4 chiffres.

## Organisation des fichiers (client)

Identique à SICOT, adapté aux trois apps du monorepo (`admin`, `portal`, partagé) :

```
src/
├── components/           Réutilisables entre pages
│   ├── ui/                Primitives style shadcn (Button, Input, Label, ...)
│   └── layouts/            Coquilles de mise en page (Layout.tsx)
├── hooks/                  Hooks personnalisés (useRequests, useDocuments, ...)
├── lib/                    Utilitaires + API (axios, *.api.ts, utils.ts)
├── i18n/                   Textes UI français (fichiers de traduction, un seul
│                           locale pour l'instant — structure prête pour en
│                           ajouter d'autres plus tard sans refactoring)
└── pages/                  Un dossier par page, helpers co-localisés
    ├── LoginPage.tsx        (petites pages : fichier unique)
    └── requests/            (pages plus grandes : dossier)
        ├── RequestsPage.tsx
        ├── schemas.ts
        └── components/
```

## CSS / Style — design tokens ANAC (partagés avec SICOT)

**Toujours** utiliser les tokens de design ANAC ci-dessous, jamais de couleurs
hex en dur :

```css
--color-anac-navy: #1b2a5e;
--color-anac-blue: #2b4dae;
--color-anac-sky: #4a90d9;
--color-anac-white: #ffffff;
--color-anac-gray: #f4f6fa;
--color-anac-border: #d1d9e6;
--color-anac-text: #1a2340;
--color-anac-muted: #6b7a99;
--color-anac-success: #16a34a;
--color-anac-warning: #d97706;
--color-anac-danger: #dc2626;
--color-anac-info: #0891b2;
```

- **Préférer** les utilitaires Tailwind aux CSS personnalisés
- **N'ajouter** à `@layer components` que pour les patterns multi-propriétés
  fréquemment réutilisés (ex. `.btn-primary`, `.card`, `.input`, cf. SICOT)
- **Ne jamais** utiliser `style={{}}` inline sauf valeurs réellement dynamiques
  (ex. largeur de barre de progression animée)
- **Mode sombre** : non prévu — outil interne ANAC en réseau local, thème clair fixe

## TypeScript

- **Toujours** typer explicitement paramètres et valeurs de retour côté serveur
- **Préférer** `interface` pour les formes d'objet, `type` pour unions/primitives
- **Jamais** de `any` — utiliser `unknown` avec des gardes de type, ou
  `Record<string, unknown>`
- **Importer les types** avec `import type { Foo }` pour les imports type-only

## Alias de chemins

| Package        | Alias | Résout vers        |
| -------------- | ----- | ------------------ |
| `@aidn/api`    | `@/`  | `apps/api/src/`    |
| `@aidn/admin`  | `@/`  | `apps/admin/src/`  |
| `@aidn/portal` | `@/`  | `apps/portal/src/` |

- **Toujours** utiliser `@/` pour les imports inter-modules, côté client comme serveur
- **Conserver** en relatif les imports du même dossier (`./demandes.types`)
- **Note serveur** : `tsc-alias` réécrit `@/` dans le build compilé (`dist/`) pour que
  `node dist/index.js` fonctionne en production

## Git

- Format de message de commit : `type(scope): description`
  - Types : `feat`, `fix`, `refactor`, `chore`, `docs`
  - Scopes : `intake`, `phases`, `documents`, `paiements`, `reunions`,
    `notifications`, `dashboard`, `admin`, `shared`, `db`, `audit`, etc.
- Branche : rester sur `main` pour l'instant (développement solo)
- Push après chaque fonctionnalité/correction stable

---

## Écarts assumés par rapport au legacy `aidn-v2-legacy` et à SICOT

- **Langue du code** (écart SICOT) : code entièrement en anglais, seule l'UI est en
  français — SICOT mélangeait français/anglais dans le code serveur
- Base de données : PostgreSQL + Drizzle (legacy en MongoDB) — voir décision loguée
  dans Notion (Idées & Pistes, catégorie Architecture, 2026-07-07)
- Comptes postulant (`applicant`) : contacts multiples à permissions égales
  (Principal/Secondaire/Tertiaire dans l'UI, `primary`/`secondary`/`tertiary` dans le
  code), pas de rôles différenciés type `representative`/`viewer` du legacy
- Rôle `bureau_courrier` supprimé (doublon de `reception`) ; `dg_secretariat` renommé
  `assistant_dg` (seul nom correct)

_Document vivant — à mettre à jour si une convention évolue pendant l'implémentation._
