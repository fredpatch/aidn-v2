# AIDN v2 — Vue d'ensemble du projet

## Contexte

**Application :** AIDN — Application Informatique de la Direction de la Navigabilité
**Direction :** Navigabilité (ANAC)
**Service demandeur :** Organismes de Maintenance des Aéronefs (OMA) et Navigabilité

## Situation actuelle (avant AIDN)

Travail manuel avec fichiers Excel/Word, communication par Outlook, usage du progiciel
QLOG pour la gestion des processus.

## Problèmes identifiés

- Absence de données statistiques sur l'activité de la Direction pour aider à la décision
- Absence d'application métier ouverte à l'industrie pour la soumission/réception de
  documents administratifs (certificats d'agrément OMA, immatriculation, navigabilité,
  acoustique, laissez-passer, etc.)
- Absence de suivi structuré des courriers entrants/sortants
- Données de réunions et missions (internes, locales, à l'étranger) non centralisées

## Résultat attendu

- Centralisation des données
- Amélioration de la visibilité (statistiques, KPIs)
- Facilitation des échanges avec l'industrie (postulants)

## Processus métier central

Le cœur d'AIDN est le **workflow de certification OMA** en 5 phases officielles :

1. **Préliminaire**
2. **Demande formelle**
3. **Évaluation approfondie des documents**
4. **Démonstration et inspection sur site**
5. **Délivrance**

Quatre types de demande possibles : reconnaître, délivrer, modifier, renouveler un
agrément d'organisme de maintenance des aéronefs.

## Utilisateurs

| Type                              | Rôle                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| Postulant (industrie)             | Soumission de la demande et des documents associés          |
| Direction Générale (DG)           | Instruit le dossier (signature physique, circuit parapheur) |
| Direction de la Navigabilité (DN) | Traite le dossier (les 5 phases)                            |

Voir `technical/cross-cutting-patterns.md` pour le détail complet des rôles internes
identifiés pendant l'étude de faisabilité (`reception`, `assistant_dg`, `dn_agent`,
`dn_supervisor`, `r3_agent`, `s5_agent`, `SU`).

## Règle fondamentale

Le passage d'une phase à une autre est **matérialisé par un courrier formel** clôturant
la phase précédente — jamais une transition purement numérique/automatique côté DG.

## Alertes attendues

- Création de demande par le postulant (délai de suivi 24h)
- Envoi de documents par le postulant (délai de suivi 24h)
- Tout transfert du DG vers la DN

## Résultats attendus (rapports/KPIs)

- Durée de traitement du processus par phase
- Durée globale du processus (demande → délivrance)
- Nombre de demandes d'agrément/reconnaissance sur une période donnée
- Nombre d'agréments/reconnaissances délivrés sur une période donnée

## Accès et sécurité (haut niveau)

- Postulant : accès restreint (son propre dossier uniquement)
- DG : accès restreint (parapheur uniquement, aucune action applicative)
- DN : accès complet aux phases de traitement

## Origine documentaire

Ce document synthétise le `Cahier_des_charges.docx` (ANAC, Mars 2026) et l'étude de
faisabilité module par module conduite avec Fred (juillet 2026) — voir
`project/modules-feasibility.md` pour le détail complet des décisions.
