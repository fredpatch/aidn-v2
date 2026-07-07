# AIDN v2 — Seed de spécification (pré-repo)

Ce dossier est le point de départ du nouveau repo `aidn-v2`, produit **avant tout code**,
suivant la méthodologie appliquée sur SICOT : étude de faisabilité module par module,
questions/réponses avec le métier (DN), verrouillage des décisions de conception au fur
et à mesure.

L'ancien repo (`aidn_v2`, à renommer `aidn-v2-legacy`) reste une **référence** — logique
métier déjà implémentée et partiellement validée en production — mais n'est jamais copié
directement. Chaque module ci-dessous a été ré-étudié à partir du Cahier des charges et
de la connaissance terrain de Fred, indépendamment du code existant.

## Contenu

- `project/overview.md` — contexte, objectifs, utilisateurs (issu du CDC)
- `project/modules-feasibility.md` — étude de faisabilité complète des 13 modules (M1–M13),
  avec décisions de conception verrouillées et cas limites résolus
- `technical/cross-cutting-patterns.md` — 6 patterns transverses réutilisés à travers
  plusieurs modules (Circuit DG, Réunion/Visite, Clôture de phase, Facture/Paiement,
  Checklist documentaire, Une seule demande active) + tableau des rôles
- `docs/TASKS.md` — backlog de développement seedé à partir des modules, format sprint
  identique à SICOT

## Miroir Notion

Le même contenu (+ le suivi vivant des idées/pistes) est disponible dans l'espace Notion :

- Dashboard : AIDN v2 — Tableau de Bord Projet
- Patterns transverses : AIDN v2 — Patterns Transverses (Cross-Cutting)
- Backlog de Développement (base liée)
- Idées & Pistes d'Exploration (base liée)

## Prochaine étape

1. Créer le repo `aidn-v2` (nouveau, vide)
2. Copier ce dossier tel quel comme base de `exploration-cache/` / `docs/`
3. Décider des conventions techniques (`technical/conventions.md` — naming, stack,
   structure des dossiers), alignées sur SICOT et sur le style UI/UX ANAC déjà en place
4. Reconstruction phase par phase, en utilisant `aidn-v2-legacy` comme référence de
   logique métier — jamais comme dépendance ou copier-coller direct
