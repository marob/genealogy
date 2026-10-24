#!/bin/sh
set -e
cd /app/backend
# Applique les migrations en attente avant de démarrer l'API.
npx --no-install prisma migrate deploy
exec node dist/main.js
