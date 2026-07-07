# AIDN - Application Informatique de la Direction de la Navigabilite

**ANAC Gabon - Direction de la Navigabilite / Service Informatique**
Version 0.1.0 (scaffold) - Juillet 2026

Reconstruction spec-first d'AIDN, methodologie alignee sur SICOT : etude de
faisabilite module par module avant tout code (voir `exploration-cache/project/
modules-feasibility.md`). L'ancien depot (`aidn-v2-legacy`) reste une reference de
logique metier, jamais copie directement.

---

## Structure du monorepo

```
aidn-v2/
├── apps/
│   ├── api/              API Express + Drizzle ORM + PostgreSQL
│   ├── admin/             Interface interne ANAC (reception, DN, R3, S5, SU)
│   └── portal/            Portail postulant (industrie)
├── packages/
│   └── shared/            Codes de module, enums de statut partages
├── exploration-cache/
│   ├── project/            overview.md, modules-feasibility.md
│   └── technical/          cross-cutting-patterns.md, conventions.md
├── docs/
│   └── TASKS.md            Backlog de developpement, par sprint
├── scripts/
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc
└── package.json
```

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend (admin + portal) | React 18 + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| ORM | Drizzle ORM |
| Base de donnees | PostgreSQL |
| Jobs planifies | node-cron |
| Export Excel | ExcelJS |
| Email | Nodemailer |
| Analyse IA (rapports) | Gemini (fournisseur swappable) |

**Code entierement en anglais** (variables, fonctions, composants) ; seule l'UI est
en francais. Voir `exploration-cache/technical/conventions.md` pour le detail
complet (naming, tokens de design ANAC, alias de chemins).

## Demarrage rapide (developpement)

### 1. Prerequis

- Node.js >= 22
- PostgreSQL >= 15

### 2. Installation

```bash
git clone https://github.com/fredpatch/aidn-v2.git && cd aidn-v2

npm install

cp apps/api/.env.example apps/api/.env
# Editer apps/api/.env (DATABASE_URL, JWT_SECRET, SMTP, GEMINI_API_KEY)

npm run db:generate
npm run db:migrate
```

### 3. Lancer en developpement

```bash
npm run dev
# -> API    : http://localhost:4000
# -> Admin  : http://localhost:5173
# -> Portal : http://localhost:5174
```

Ou individuellement : `npm run dev:api`, `npm run dev:admin`, `npm run dev:portal`.

## Modules (13, dont M2 fusionne dans M1)

- **M1** Intake & Circuit DG (M2 - Circuit DG - fusionne ici)
- **M3** Phase Preliminaire
- **M4** Phase Demande formelle
- **M5** Evaluation approfondie des documents
- **M6** Demonstration et Inspection sur site
- **M7** Delivrance & Certificats
- **M8** Documents (transverse)
- **M9** Paiements (transverse)
- **M10** Reunions (transverse)
- **M11** Notifications (transverse)
- **M12** Dashboard & Rapports
- **M13** Administration & Roles

Voir `docs/TASKS.md` pour le decoupage en sprints et `exploration-cache/project/
modules-feasibility.md` pour les decisions de conception verrouillees module par
module.

---
