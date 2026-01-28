# Deployment Guide

This guide explains how to deploy the Keimenon to a production environment using Docker Compose.

## Prerequisites

- **Docker** and **Docker Compose** installed on the target machine.
- **Git** to clone the repository.
- **Node.js** (optional, for running the secrets script locally, or you can run it via Docker).

## 1. Clone the Repository

```bash
git clone <repository-url>
cd ai_convo_parser
```

## 2. Generate Production Secrets

We provide a script to generate secure random secrets for your production environment.

```bash
node scripts/generate-prod-secrets.js
```

This will create a `.env.production` file. **DO NOT commit this file to version control.**

### Manual Configuration

Open `.env.production` and configure any additional services:

- **Neo4j**: Uncomment and set URI/User/Password if using Graph mode.
- **OAuth**: Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if using Google Login.
- **AI Providers**: Add keys for OpenAI, Anthropic, etc., if using hosted models.
- **Internal API**: `INTERNAL_API_URL` is set to `http://api:4001` in `docker-compose.prod.yml` to allow the Web container to talk to the API container during Server-Side Rendering (SSR). You usually don't need to change this.

## 3. Build and Run

Use the production Docker Compose file.

```bash
# Build the images
docker-compose -f docker-compose.prod.yml build

# Start the services in detached mode
docker-compose -f docker-compose.prod.yml up -d
```

## 4. Verify Deployment

Check the health of the services:

- **API Health**: `curl http://localhost:4001/health` (Should return `200 OK`)
- **Web Health**: `curl http://localhost:3000/api/health` (Should return `200 OK`)

Visit `http://localhost:3000` in your browser.

## 5. Maintenance

### Viewing Logs

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### Stopping Services

```bash
docker-compose -f docker-compose.prod.yml down
```

### Backups

Data is stored in the `keimenon-data` volume. To backup:

```bash
# Stop services first to ensure consistency
docker-compose -f docker-compose.prod.yml stop

# Create a backup of the volume data
docker run --rm -v keimenon-data:/data -v $(pwd):/backup alpine tar cvf /backup/keimenon-data-backup.tar /data

# Restart services
docker-compose -f docker-compose.prod.yml start
```

## Troubleshooting

- **Port Conflicts**: Ensure ports 3000 and 4001 are free.
- **Permission Issues**: The Docker containers run as non-root users. Ensure volume permissions are correct if mounting host directories.
