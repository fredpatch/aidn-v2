# AIDN v2 - Étude de faisabilité par module

Méthodologie : chaque module a été interrogé (questions Claude / réponses métier Fred,
issues d'échanges directs avec DN) avant toute spécification technique, sur le modèle
appliqué au projet SICOT. Objectif : fermer les ambiguïtés qu'un cahier des charges seul
ne peut résoudre, et éviter la dérive qui a affecté la première version d'AIDN
(4 mois de « vibe coding » sans checkpoint métier).

Les patterns réutilisés à travers plusieurs modules sont documentés une seule fois dans
`technical/cross-cutting-patterns.md` et référencés ici plutôt que répétés.

---

## M1+M2 - Intake & Circuit DG (fusionnés)

Fusionnés car le circuit parapheur (M2 dans le découpage initial) fait partie
intégrante du dépôt de la demande - ce n'est pas une étape séparée après coup.

**Ce qui est faisable rapidement :**

- Formulaire de demande unique (portail ou saisie manuelle par reception/assistant_dg
  pour dépôt physique) : type de demande (agrément/reconnaissance/renouvellement/
  modification), message, contacts, upload du document scanné (PDF/Word/PNG/JPG)
- Statuts : voir pattern « Circuit DG »
- Autoriser une seule demande active par postulant (pattern « Une seule demande active »)

**Décisions verrouillées :**

- Un seul point d'entrée formulaire, identique que ce soit portail ou guichet physique
  - le portail reste recommandé à terme, DN sensibilise les postulants à son usage,
    mais le dépôt physique reste possible indéfiniment en parallèle
- Le circuit papier réel (parapheur) n'est jamais modélisé étape par étape dans l'app -
  seulement les 3 statuts du pattern « Circuit DG »
- Aucune notification/validation numérique côté DG - le déclencheur humain est toujours
  l'action de scan
- Annulation : possible en `Déposé` uniquement, verrouillée dès `Signé` (version
  simplifiée retenue - pas de tracking par lecture/ouverture, jugé trop complexe pour
  le bénéfice apporté)

**Cas limites résolus :**

- Document mal scanné → remplaçable par le scanneur, consultable par les deux parties
- Demande bloquée en parapheur → alerte à seuil configurable (pattern « Circuit DG »)
- Contournement multi-demandes (annuler via nouvelle demande) → fermé par la règle
  « une seule demande active »

---

## M3 - Phase Préliminaire

**Ce qui est faisable rapidement :**

- Planification de réunion : voir pattern « Réunion / Visite »
- Formulaire « Déclaration de pré-évaluation » : document statique (template ANAC),
  mis à disposition en téléchargement pour le postulant **après** la réunion (DN
  déclenche la mise à disposition)
- Le postulant retourne le formulaire rempli (upload, comme la demande initiale)
- Clôture : voir pattern « Clôture de phase »

**Décisions verrouillées :**

- Réunion toujours en personne, date trackée, ticket/PDF généré, email optionnel
- **Pas de re-soumission prévue** pour la déclaration de pré-évaluation - confirmé
  auprès de DN que ce cas n'arrive pas en pratique ; si incomplète, DN gère hors app
  via les statuts No-Show/Reportée/Annulée
- Délai de retour de la déclaration : valeur configurable dynamiquement par DN, pas de
  défaut codé en dur
- Statuts de réunion : tenue / No-Show / Reportée / Dossier annulé, choix libre DN

**Cas limites résolus :**

- No-show → DN choisit No-Show / Reprogrammer / Annuler dossier
- Re-soumission de la déclaration → hors scope (n'arrive pas en pratique)
- Délai de retour → dynamique, fixé par DN

---

## M4 - Phase Demande formelle

11 documents requis : lettre de demande officielle, formulaires
DN-AIR-R2-3-F-E-010/011/012, MPM, Manuel Qualité, Manuel SGS, liste des capacités,
programme de formation, contrats sous-traitants, documents techniques, état de
conformité.

**Ce qui est faisable rapidement :**

- Circuit documents : voir tableau ci-dessous
- Checklist par document : voir pattern « Checklist documentaire »
- Réunion formelle : voir pattern « Réunion / Visite »
- Clôture : voir pattern « Clôture de phase »

**Circuit documents (décision clé) :**

| Document                     | Circuit                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| Lettre de demande officielle | Seule pièce à traverser le circuit DG (pattern « Circuit DG ») |
| Les 10 autres documents      | Upload direct dans le dossier ouvert, aucun passage DG         |

**Déclenchement de la phase :** la réception de la lettre officielle (signée) débloque
la réunion formelle - pas besoin d'attendre les 10 autres documents. Ceux-ci peuvent
être uploadés avant ou après la réunion, à tout moment tant que la phase reste ouverte.

**Décisions verrouillées :**

- Vue checklist par document, visible à tout moment par DN
- Phase non-clôturable tant que les 11 documents ne sont pas tous « Soumis »
- **Correction appliquée** : la clôture ne porte **pas** de décision recevable/
  non-recevable dans l'app - la décision d'admissibilité est communiquée par DN au
  postulant manuellement via Outlook (email individualisé, pas de template - DN gère
  chaque entité au cas par cas selon sa sensibilité)

---

## M5 - Évaluation approfondie des documents

**Séquence :**

1. Phase ouverte → upload facture débloqué (pattern « Facture / Preuve de paiement »)
2. Postulant dépose preuve de paiement → validation par DN/S5 → débloque l'évaluation
   documentaire
3. Évaluation document par document, **sur les 11 fichiers déjà déposés en M4** (pas
   de nouvel upload initial) : verdict individuel (Validé / Rejeté / À corriger)
4. Document Rejeté/À corriger → postulant re-upload une version corrigée, avec délai
   configurable dynamiquement par DN pour créer un sentiment d'urgence
5. Clôture : tous documents Validés + facture/preuve validées → DN clôture manuellement
   (pattern « Clôture de phase »)

**Décisions verrouillées :**

- Réutilisation des fichiers M4, pas de nouvel upload en bloc
- Re-upload ciblé par document individuel, pas un renvoi complet du dossier
- Pas de re-circuit DG (aucune lettre n'est concernée à cette phase)

---

## M6 - Phase Démonstration et Inspection sur site

**Rôle R3 :** équipe ANAC séparée, login propre, file de dossiers propre - même statut
que reception/assistant_dg (pas une casquette DN).

**Séquence :**

1. Phase ouverte → upload facture (pattern « Facture / Preuve de paiement »)
2. Visite sur site : DN planifie, pattern « Réunion / Visite » (même format que M3/M4)
3. R3 soumet son avis en **une seule action** : verdict (conforme / non-conforme /
   conforme avec réserves) **+ note incluse dans la même soumission** - pas une note
   DN séparée
4. Une fois l'avis R3 soumis, **DN n'a aucune décision à prendre** - clôture selon le
   pattern habituel

**Décisions verrouillées :**

- R3 = rôle applicatif distinct, pas un agent DN avec une autre casquette
- Avis + note = une seule soumission R3, jamais deux étapes séparées
- Facture/preuve identique à M5, clôture identique à M3/M4/M5

---

## M7 - Phase Délivrance & Certificats

**Séquence :**

1. Phase ouverte → upload facture (pattern « Facture / Preuve de paiement »)
2. **À la validation de la preuve de paiement**, le certificat est créé en base
   (statut initial `En préparation`) - c'est le point zéro du KPI « délai de
   délivrance », avant même impression/signature
3. Cycle impression → signature → archivage hors app (physique), l'app reflète la
   progression de statut
4. DN notifie le postulant de la disponibilité (pas de ticket/date planifiée - juste
   une notification « disponible »)
5. Compteur « temps jusqu'au retrait » démarre à la notification, s'arrête au passage
   au statut `Retiré`
6. Type de certificat : déterminé automatiquement depuis le type de demande initiale,
   **modifiable par DN à tout moment du processus** (champ override, pas verrouillé)

**Décision de conception clé :** la phase reste ouverte tout le long du cycle
(création certificat → impression → signature → archivage → retrait) parce que le
temps-jusqu'à-délivrance est le KPI suivi - jamais un simple binaire fermé/ouvert.

---

## M8 - Documents

Module générique sous-jacent à tous les uploads/checklists déjà définis (M1-M7).

**Décisions verrouillées :**

- Types de fichiers acceptés : PDF, Word, PNG, JPG - pas de restriction aux seuls
  PDF/DOCX (postulant peut avoir besoin d'uploader une photo)
- Historique de version : remplacement ne supprime jamais - l'ancienne version part
  dans une **corbeille**, jamais purgée automatiquement
- Corbeille : conservée indéfiniment jusqu'à suppression manuelle par SU ; un
  **rappel** signale à SU depuis combien de temps un élément traîne dans la corbeille
  (pas de seuil de purge automatique - juste une alerte de visibilité)
- Rôle SU (Super Admin) : porté par le département IT, transverse à tous les modules
  - gestion utilisateurs, nettoyage corbeille, configuration (seuils d'alerte, délais
    dynamiques). Invoqué à la demande de DN pour des tâches spécifiques, pas un usage
    quotidien de DN lui-même

**Visibilité documentaire (postulant) :**

- Visible : ses propres documents uploadés, notes de clôture DN
- Masqué : avis R3 (usage DN-interne uniquement)

---

## M9 - Paiements

**Rôle de l'app :** upload/consultation uniquement - **aucun calcul de montant, aucune
comptabilité**. La facture (montant, référence) est générée hors app (Sage) et
uploadée telle quelle pour lecture par le postulant. Voir pattern « Facture / Preuve
de paiement » pour la séquence complète et le statut terminal `Dossier rejeté`.

---

## M10 - Réunions

Les mécaniques ticket/date/no-show sont déjà entièrement définies (pattern « Réunion
/ Visite »). Ce module ajoute une couche de visibilité transverse.

**Décisions verrouillées :**

- **Vue calendrier transverse** : tableau de bord dédié montrant tous les rendez-vous
  à venir (réunions + visites sur site) tous dossiers/postulants confondus - pas de
  vue « par dossier » isolée
- **Conflits :**
  - Même agent DN, même créneau horaire exact → conflit dur, **blocage** de
    l'enregistrement, DN doit choisir un autre créneau
  - Même agent DN, même jour, horaires différents → chevauchement doux, simple
    **avertissement** informatif, non bloquant

---

## M11 - Notifications

**Canaux :** in-app (centre de notifications, consultation obligatoire - pas de push
automatique côté postulant pour tout) + email (réservé aux événements à fort enjeu)

**Déclenchement :** automatique par défaut pour tout événement système ; le
déclenchement manuel reste possible mais **aucun cas d'usage identifié pour
l'instant** - capacité gardée en réserve, pas de spec à ce stade

**Côté postulant - email :**

- Certificat prêt / disponible pour retrait
- Dossier rejeté (avec motif)
- Document rejeté / à corriger, avec délai de re-upload (crée le sentiment d'urgence
  recherché en M5)

**Côté postulant - in-app uniquement (pas d'email) :**

- Changements de statut de routine (dossier en traitement, phase ouverte, etc.) - pas
  de spam

**Côté interne ANAC - déjà défini par les patterns précédents :**

- Alerte blocage parapheur (3j configurable) → DN + reception/assistant_dg
- Rappel corbeille documents qui traîne → SU

---

## M12 - Dashboard & Rapports

**Audience :** rapport imprimable/exportable (PDF/Excel), **pas** un dashboard temps
réel consulté directement par le DG - DN génère et transmet le document. Décision
prise car le DG n'a pas le temps de consulter des KPIs applicatifs directement.

**KPIs (issus du CDC) :**

- Durée de traitement par phase (M3–M7)
- Durée globale demande → délivrance
- Nombre de demandes sur une période donnée
- Nombre d'agréments/reconnaissances délivrés sur une période

**Filtres :** plage de dates libre, export PDF/Excel

**Section Analyse IA (nouveau, inspiré de SICOT) :**

- Génération automatique mensuelle (1er du mois) + génération manuelle à la demande,
  quota/jour à définir (référence SICOT : 15/jour par modèle, rotation Gemini 2.5
  Flash / 2.5 Flash Lite / 3.1 Flash Lite - mécanique exacte à vérifier sur le Notion
  SICOT au moment du build technique)
- Fournisseur swappable en théorie, **Gemini par défaut** (clé API déjà disponible)
- Chaque rapport généré = statut `Non relu` jusqu'à ce que DN **édite le texte
  généré** puis `Valide` (relu), ou `Rejette`
- Basé sur les KPIs ci-dessus, pas sur un découpage par module comme SICOT (AIDN n'a
  pas d'équivalent Accords/Traductions/Glossaire)

---

## M13 - Administration & Rôles

Voir `technical/cross-cutting-patterns.md` section 7 pour le tableau complet des
rôles. Point clé : **`SU` est le seul rôle réellement distinct en droits** -
`dn_agent`/`dn_supervisor` sont fonctionnellement identiques aujourd'hui (aucun gate
d'approbation), `r3_agent` et `s5_agent` ont des périmètres étroits et séparés.

**Multi-rôle autorisé** : un utilisateur peut cumuler plusieurs rôles.

**Comptes Postulant (repris et affiné du legacy `aidn_v2`) :**

Le legacy contient un flux de demande de compte déjà bien structuré, à conserver :

- Formulaire public avec anti-bot (champ honeypot invisible + délai minimum entre
  affichage et soumission du formulaire) et anti-doublon (une seule demande active par
  email de contact, refus si un compte postulant existe déjà pour cet email)
- Revue ANAC : rattachement à un organisme **existant** (recherche par nom normalisé,
  évite les doublons du type variantes d'orthographe d'un même organisme) ou création
  d'un nouvel organisme
- Rejet de demande avec motif obligatoire, tracé

**Affinement décidé (diffère du legacy) :** pas de rôles à permissions différenciées
par contact (le legacy proposait primary_contact/representative/viewer). À la place :
**contacts multiples par organisme à permissions strictement égales**, étiquetés
Principal/Secondaire/Tertiaire - uniquement pour savoir qui contacter en premier côté
ANAC. L'objectif réel de cette revue manuelle est la **déduplication d'organisme** pour
préserver l'intégrité des KPIs (M12) : éviter qu'un même organisme (ex. une compagnie
aérienne) se retrouve enregistré sous plusieurs variantes de nom.
