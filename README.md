# The Newsroom

The Newsroom is a role-based workspace for independent publications, journalists, editors and readers. This package includes a sample newsroom that is ready to explore after deployment.

## What is included

- An editor workspace with a review queue and publication management
- A journalist workspace for submitting stories and building newsletters
- A reader workspace for following publications and journalists
- Five example stories, three publications, contributor profiles, a newsletter, activity history and queued notifications
- An indigo and lilac interface with coral accents

The example stories and contributor profiles are fictional. Email notifications are recorded in the outbox; no email provider is connected.

## Deploy on Render

1. Extract this ZIP and upload the contents of `Newsroom_Render_Deploy` to a new GitHub repository.
2. In Render, create a new **Blueprint** and connect that GitHub repository.
3. Render reads `render.yaml`, builds the app and starts the demo service. Open the service URL after the deploy finishes.

The demo opens as **Ntando rocks** without a separate password. It uses one shared workspace, so changes made by any tester are visible to everyone using the link. The owner role selector lets you explore the editor, journalist and reader screens.

This is a testing deployment. Render's free service filesystem is temporary, so changes may be cleared after a restart or redeploy and the sample issue may be created again.

## Local development

Install Node.js 22.13 or later, then run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

To produce a production build:

```bash
corepack pnpm run build
```

## Project structure

- `app/` contains the application pages and API routes
- `components/` contains the newsroom interface
- `db/` and `drizzle/` contain the data model and database setup
- `lib/demo-content.ts` creates the example workspace for its first visit
- `render.yaml` and `scripts/render-start.mjs` configure the Render test deployment
