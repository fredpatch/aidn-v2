# AIDN V2 - Infrastructure staging

Cette infrastructure reprend les politiques validées sur SICOT :

- projet Compose `aidn_staging`;
- réseau privé `aidn_staging_internal`;
- PostgreSQL non exposé;
- API non exposée directement;
- frontends non exposés directement;
- seul Nginx publie des ports;
- healthchecks;
- `restart: unless-stopped`;
- volumes persistants PostgreSQL + uploads;
- migrations avant démarrage complet;
- seed des paramètres système idempotent;
- `.env.staging` non versionné.

## Deux ports publics

Admin et Portal utilisent actuellement `BrowserRouter` sans `basename`.
Pour éviter de modifier l'application uniquement pour le déploiement :

- `8200` -> Admin
- `8201` -> Portal

Les deux entrées proxifient `/api` vers la même API privée. Il n'y a plus de
`/uploads` public (STORAGE-0A) : les fichiers sont servis uniquement par
`/api/files` (contrôle d'accès, ou lien signé de 5 minutes). Le journal d'accès
Nginx de `/api/files/` n'enregistre jamais la chaîne de requête (`grant=`).

## Installation

```bash
cd ~/apps/aidn-v2
cp .env.staging.example .env.staging
nano .env.staging
chmod +x scripts/deploy-staging.sh
docker compose -f docker-compose.staging.yml --env-file .env.staging config
./scripts/deploy-staging.sh
```

`FILE_GRANT_SECRET` est obligatoire (signature des liens de fichiers, distinct
des secrets JWT) : l'API refuse de démarrer sans lui.

Pour les secrets, utiliser par exemple :

```bash
openssl rand -hex 32
```

## Validation

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging ps
curl -s http://localhost:8200/health && echo
curl -s http://localhost:8201/health && echo
```

## Déploiement et adresses de fichiers (STORAGE-0A)

`scripts/deploy-staging.sh` suit cet ordre :

1. sauvegarde vérifiée base + volume uploads (**avant** le script) ;
2. build ; 3. arrêt de l'API et de ses tâches ; 4. `db:migrate` ;
5. `storage:rewrite-addresses` à blanc ; 6. arrêt s'il reste des blocages ;
7. `--apply` uniquement s'il y a des changements **et** si
   `STORAGE_BACKUP_CONFIRMED=<identifiant de sauvegarde>` est fourni ;
8. démarrage de la nouvelle API ; 9. contrôles de santé ;
10. rechargement de Nginx ; 11. ouverture de documents depuis l'admin et le portail.

```bash
STORAGE_BACKUP_CONFIRMED=backup-2026-09-25 ./scripts/deploy-staging.sh
```

La conversion ne tourne jamais pendant que l'API est active (nettoyage des
orphelins, uploads et écritures métier ne peuvent pas la concurrencer).

Ne jamais supprimer sans sauvegarde :

- `aidn_postgres_staging_data`
- `aidn_uploads_staging_data`

Le staging utilise `NODE_ENV=staging` tant que l'accès reste en HTTP, afin
d'éviter l'activation des cookies `Secure` réservée au HTTPS.
