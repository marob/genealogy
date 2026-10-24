-- Microsoft profile pictures are Graph API URLs that require an access token:
-- the browser cannot display them.
UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" LIKE 'https://graph.microsoft.com/%';
