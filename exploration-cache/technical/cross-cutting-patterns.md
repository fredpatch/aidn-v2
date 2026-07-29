# AIDN v2 - Patterns transverses

Référence consolidée des comportements qui se répètent à l'identique à travers plusieurs
modules (M1–M13). À lire avant de spécifier ou d'implémenter un nouveau module - si un
besoin ressemble à l'un de ces patterns, réutiliser plutôt que redéfinir.

Miroir vivant de la page Notion **AIDN v2 - Patterns Transverses (Cross-Cutting)**.

---

## 1. Pattern « Circuit DG » (parapheur physique)

**Utilisé par :** intake initial (M1+M2), lettre de demande officielle (M4)

**Statuts :** `Déposé` → `Signé` → `En attente de traitement`

- Déclenchement toujours manuel, par la personne qui détient physiquement le document
  (reception, assistant_dg, ou DN)
- Aucune action DG dans l'app - le DG signe le papier, quelqu'un d'autre re-scanne
- Annulation possible uniquement en `Déposé` ; verrouillé dès `Signé`
- Document scanné toujours consultable par les deux parties ; remplaçable par le
  scanneur en cas d'erreur
- Alerte de blocage : seuil configurable (défaut 3 jours ouvrés) si `Signé` sans
  transition → notifie DN **et** reception/assistant_dg simultanément
- **Ne s'applique qu'à un seul document à la fois** (la lettre officielle en M4, pas
  les 10 autres pièces jointes)

## 2. Pattern « Réunion / Visite » (ticket + date)

**Utilisé par :** réunion préliminaire (M3), réunion formelle (M4), visite sur site (M6)

- Toujours en personne, jamais à distance (décision actuelle, révisable)
- DN fixe la date, l'app génère un document/« ticket » PDF téléchargeable par le
  postulant
- Email optionnel en doublon du ticket (jamais le seul canal)
- Statuts de réunion : tenue / **No-Show** / **Reportée** / **Dossier annulé** - choix
  libre DN
- Le compte rendu officiel part toujours par Outlook, hors app - l'app ne fait que
  tracker la clôture

## 3. Pattern « Clôture de phase »

**Utilisé par :** M3, M4, M5, M6 (M7 a une variante - voir note)

- Action explicite DN (bouton), jamais automatique
- Deux voies interchangeables, une seule suffit : (a) joindre un document/courrier,
  ou (b) note textuelle facultative
- **Aucune décision d'admissibilité n'est portée par l'app** (recevable/non-recevable,
  satisfaisant/non-satisfaisant) - toujours communiquée au postulant par email Outlook
  individualisé, hors app
- Exception M7 : la « clôture » n'est pas binaire, c'est un statut à étapes (création
  certificat → impression → signature → archivage → retrait) qui reste ouvert jusqu'au
  retrait effectif, car le délai est un KPI suivi

## 4. Pattern « Facture / Preuve de paiement » (S5)

**Utilisé par :** M5 (évaluation), M6 (inspection), M7 (délivrance), M9 (paiements)

- Facture générée hors app (Sage, processus S5 existant), upload du PDF dans l'app dès
  l'ouverture de la phase, pour consultation/téléchargement postulant
- **L'app ne calcule jamais de montant** - upload/consultation uniquement
- Postulant dépose une preuve de paiement (upload)
- Validation de la preuve par DN/S5 → débloque l'étape suivante de la phase
  (évaluation documentaire en M5, poursuite en M6, création certificat en M7)
- Preuve rejetée → deux issues au choix de DN : (a) redemande d'une nouvelle preuve,
  dossier reste ouvert, ou (b) **rejet du dossier**, statut terminal `Dossier rejeté`
  avec motif obligatoire, visible au postulant
- `Dossier rejeté` libère la règle « une seule demande active » (pattern 6) - le
  postulant peut soumettre une nouvelle demande ensuite

## 5. Pattern « Checklist documentaire »

**Utilisé par :** M4 (soumission), M5 (évaluation)

- M4 : chaque document sur 11 a un état binaire Soumis / Manquant, upload progressif
  possible avant/après réunion, aucune évaluation de contenu
- M5 : les **mêmes 11 fichiers** (pas de nouvel upload) reçoivent un verdict individuel
  (Validé / Rejeté / À corriger) ; document rejeté → re-upload ciblé par le postulant,
  avec délai configurable dynamiquement par DN (même mécanique que le rappel M3),
  volontairement pour créer un sentiment d'urgence
- Phase non-clôturable tant que la checklist n'est pas complète (tous Soumis en M4,
  tous Validés en M5)

## 6. Pattern « Une seule demande active »

- Un postulant ne peut avoir qu'**une seule demande active** à la fois, tous statuts et
  toutes phases confondus (pas « une par type de certificat »)
- Ferme le contournement « annuler en créant une nouvelle demande » découvert pendant
  l'étude M1
- `Dossier rejeté` (pattern 4) est le seul état qui libère cette contrainte

## 7. Rôles identifiés

| Rôle               | Périmètre                                                                  | Particularité                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reception`        | Guichet physique, scan des dépôts et retours parapheur                     | Fusionné avec l'ancien `bureau_courrier` (même rôle, pas distinct)                                                                                             |
| `assistant_dg`     | Parapheur DG                                                               | Ne déclenche jamais rien dans l'app côté DG lui-même. (Nom correct - `dg_secretariat` n'existe pas dans le process réel)                                       |
| `dn_agent`         | Traitement des 5 phases OMA, peut clôturer les phases                      |                                                                                                                                                                |
| `dn_supervisor`    | Identique à `dn_agent` aujourd'hui                                         | Aucun gate d'approbation pour l'instant ; capacité de configuration envisagée plus tard                                                                        |
| `r3_agent`         | Équipe séparée, file de dossiers propre, avis d'inspection uniquement (M6) | Jamais une casquette DN                                                                                                                                        |
| `s5_agent`         | Upload facture (M5/M6/M7)                                                  |                                                                                                                                                                |
| `SU` (Super Admin) | Transverse à tous les modules, porté par le département IT                 | Seul rôle réellement distinct en droits - gestion utilisateurs, corbeille documents, configuration système. Invoqué à la demande de DN, pas un usage quotidien |
| Postulant          | Accès à son propre dossier uniquement                                      | Comptes multiples par organisme possibles (Principal/Secondaire/Tertiaire), permissions strictement égales entre eux                                           |

**Multi-rôle autorisé** : un utilisateur peut cumuler plusieurs rôles internes.

---

_Document vivant - à mettre à jour si un pattern évolue pendant la reconstruction du
nouveau repo._
