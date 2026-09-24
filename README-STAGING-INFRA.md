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

Les deux entrées proxifient `/api` et `/uploads` vers la même API privée.

## Installation

```bash
cd ~/apps/aidn-v2
cp .env.staging.example .env.staging
nano .env.staging
chmod +x scripts/deploy-staging.sh
docker compose -f docker-compose.staging.yml --env-file .env.staging config
./scripts/deploy-staging.sh
```

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

Ne jamais supprimer sans sauvegarde :

- `aidn_postgres_staging_data`
- `aidn_uploads_staging_data`

Le staging utilise `NODE_ENV=staging` tant que l'accès reste en HTTP, afin
d'éviter l'activation des cookies `Secure` réservée au HTTPS.
