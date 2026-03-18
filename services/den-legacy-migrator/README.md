# Den Legacy Migrator

Temporary internal admin app for migrating selected legacy Den users from the old Render-hosted MySQL database into the post-PR-918 Den schema.

## What it does

- lists legacy users from the old database
- lets you select one or more root users in a browser UI
- previews the full migration graph anchored by those users
- migrates the selected users plus any required org collaborators into the new database
- rewrites old IDs into the new TypeID format deterministically so reruns stay stable

## What it migrates

- `user`
- `account`
- `admin_allowlist` rows for included users
- `org`
- `org_membership`
- `worker`
- `worker_instance`
- `worker_token`
- `worker_bundle`

## What it intentionally skips

- `session`
- `verification`
- `desktop_handoff_grant`
- `audit_event`
- `daytona_sandbox`

Those tables are either ephemeral auth state, not required for user recovery, or not present in the legacy pre-PR-918 schema.

## Security model

- browser access is protected by HTTP Basic Auth via `APP_USERNAME` and `APP_PASSWORD`
- no public API auth beyond that shared admin gate
- `/health` stays unauthenticated for Render health checks

## Environment

- `LEGACY_DATABASE_URL` required; points at the old Render-only MySQL database
- `TARGET_DATABASE_URL` optional direct MySQL connection string for the new database
- `TARGET_DB_MODE` optional: `mysql` or `planetscale`
- `TARGET_DATABASE_HOST`, `TARGET_DATABASE_USERNAME`, `TARGET_DATABASE_PASSWORD` required when `TARGET_DB_MODE=planetscale` and `TARGET_DATABASE_URL` is unset
- `APP_USERNAME`, `APP_PASSWORD` required
- `LIST_USERS_LIMIT` optional user list cap; defaults to `250`
- `PORT` optional; defaults to `8791`

## Local development

```bash
pnpm install
cp services/den-legacy-migrator/.env.example services/den-legacy-migrator/.env
pnpm --dir services/den-legacy-migrator dev
```

Open `http://localhost:8791` and sign in with the Basic Auth credentials.

## Build

```bash
pnpm --dir services/den-legacy-migrator build
```

## Deploy on Render

Recommended service settings:

- Service type: `Web Service`
- Root directory: `services/den-legacy-migrator`
- Runtime: `Node`
- Build command: `pnpm --dir services/den-legacy-migrator build`
- Start command: `pnpm --dir services/den-legacy-migrator start`
- Health check path: `/health`

Because the legacy database is only reachable on Render's private network, deploy this service in the same Render environment/network where that database is accessible.

## Notes

- the app uses deterministic legacy-id -> TypeID mapping, so repeated runs target the same new IDs
- if the target database already contains the same email or org slug under a different ID, the app reports a conflict instead of guessing a merge
- this service is intended to be deleted once the legacy migration is complete
