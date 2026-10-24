#!/bin/sh
set -e
cd /app/backend
# Apply pending migrations before starting the API.
npx --no-install prisma migrate deploy
exec node dist/main.js
