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

Les données de référence sont vérifiées et créées automatiquement au
démarrage de l'API, avant d'accepter la moindre requête :

- **paramètres système** : les clés manquantes sont ajoutées avec leur valeur
  par défaut ; les valeurs existantes ne sont jamais modifiées ;
- **modèles de documents officiels** (4 formulaires DN) : un modèle dont la clé
  n'existe pas encore est installé à partir des copies approuvées par DN dans
  `apps/api/seed-assets/document-templates/`. Un modèle déjà présent n'est
  **jamais** remplacé, réparé ni réactivé, même si son fichier est introuvable.

Si ce contrôle échoue (base inaccessible, fichier source manquant pour un
modèle à créer...), l'API ne démarre pas. Commandes manuelles (maintenance,
déploiement) :

```bash
npm run seed --workspace=apps/api          # paramètres + modèles de documents
npm run seed:params --workspace=apps/api   # paramètres système uniquement
```

Un Super Utilisateur peut aussi consulter **Paramètres → État du système** :
présence des paramètres système, état de chaque modèle officiel (conforme,
manquant, fichier introuvable, inactif, non vérifié), accès à la base de données
et au stockage des fichiers. Le bouton « Créer les éléments manquants »
(`POST /api/seeding/run`, SU uniquement, audité) crée seulement les éléments
absents, sans redémarrer l'API ; il ne remplace, ne répare ni ne réactive
jamais un modèle existant et ne réinitialise aucune valeur.

**Fichiers stockés.** Chaque fichier est un `upload_asset` ; son adresse stable
est `/api/files/<id>` (jamais le chemin physique). Il n'y a pas de `/uploads`
public : l'application demande un lien signé de 5 minutes
(`POST /api/files/:id/access`) après un contrôle d'accès par type de document.
Pour joindre un fichier, l'application envoie `POST /api/uploads` puis ne
transmet que l'`uploadAssetId` reçu : le serveur vérifie que l'utilisateur
est bien l'auteur de l'upload et déduit lui-même l'adresse et le type du
fichier (STORAGE-0B).
Les anciennes adresses `/uploads/...` se convertissent API arrêtée :

```bash
npm run storage:rewrite-addresses --workspace=apps/api            # à blanc
npm run storage:rewrite-addresses --workspace=apps/api -- --apply # applique
```

**Migrations de base de données.** Workflow a suivre pour tout changement de
`apps/api/src/shared/db/schema.ts` :

```bash
npm run db:generate --workspace=apps/api   # genere le SQL + le snapshot
# relire le SQL genere
git add apps/api/drizzle/                  # SQL + snapshot + journal ensemble
npm run db:migrate --workspace=apps/api
```

`drizzle-kit push` ne doit **jamais** etre utilise contre une base de
developpement partagee, le staging ou la production — uniquement contre une
base jetable/scratch si besoin ponctuel (ex. prototypage local rapide). Une
fois l'historique des migrations entre dans l'historique partage (commit
pousse), il ne doit plus etre reecrit ni consolide : une migration deja
generee peut encore etre relue/corrigee avant son commit, jamais apres.

Deux commandes de diagnostic, en lecture seule pour la premiere :

```bash
npm run db:status --workspace=apps/api
# liste les migrations du depot, celles deja appliquees en base, les
# migrations en attente et les hash appliques qui ne correspondent a aucun
# fichier du depot (historique perime)

npm run db:reset:dev --workspace=apps/api -- --yes
# DROP + CREATE + migrate + seed d'une base de developpement locale.
# Refuse de s'executer si DATABASE_URL ne pointe pas vers un hote loopback
# (localhost/127.0.0.1/::1) ou si le nom de la base ressemble a de la
# production/du staging. Sans --yes, affiche ce qu'il ferait sans rien executer.
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
