# TaskFlow

TaskFlow is a small team task manager built with Next.js, TypeScript, Flask,
Supabase Auth/Postgres, and Gmail notifications.

## Features

- Sign up and sign in with email/password or Google.
- Create tasks and assign them to another registered user.
- View tasks you created or were assigned.
- Update task status and delete tasks you created.
- Email the assignee when a task is created and the task creator when it is
  completed.

## Setup

### 1. Configure Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`backend/schema.sql`](./backend/schema.sql).
   It creates the profile sync trigger, task tables, indexes, and row-level
   security policies.
3. In **Authentication → Providers**, enable Email and Google.
4. Configure Google OAuth credentials in Supabase. In Google Cloud, add the
   Supabase callback URL shown by the Google provider settings as an authorized
   redirect URI.
5. In **Authentication → URL Configuration**, add `http://localhost:3000` as
   the site URL and `http://localhost:3000/dashboard` as a redirect URL. Add
   the corresponding URLs for your deployed site before production use.

Use the project URL and the public anon/publishable key in the frontend and
backend. Do not put a Supabase service-role key in the frontend.

### 2. Configure Gmail notifications

Create Google OAuth credentials for the account that will send notifications
and obtain a refresh token with the
`https://www.googleapis.com/auth/gmail.send` scope. Set the sender address to
that Gmail account. Keep the refresh token and OAuth client secret only in the
backend environment.

Copy `backend/.env.example` to `backend/.env` and fill in the Supabase and Gmail
values. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the
Supabase values. The existing `.env` files are intentionally not overwritten.

### 3. Install and start the backend (Windows PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

The API listens on `http://127.0.0.1:5000`.

### 4. Install and start the frontend

In another PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production deployment

The repository includes [`render.yaml`](./render.yaml) for the Flask API.
Push the project to GitHub, create a Render Blueprint from the repository, and
provide the prompted environment variables. Render will build from `backend/`
and start the API with Gunicorn.

Deploy the frontend to Vercel with `frontend/` as the project root. Set these
environment variables in the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (the Render API URL, without a trailing slash)

Add them to the Production environment (and Preview/Development if needed).
The `NEXT_PUBLIC_` Supabase values are public browser configuration; do not
put Gmail OAuth credentials or a Supabase service-role key in the frontend.
After changing environment variables, redeploy the frontend.

Set `FRONTEND_ORIGINS` on Render to the deployed Vercel origin. Then add the
Vercel site URL and `/dashboard` redirect URL in Supabase Authentication URL
Configuration, and add the Vercel site URL to the Google OAuth authorized
origins. Keep Gmail OAuth secrets and the Supabase key in Render only.

The public application URL is assigned by Vercel and depends on your
Supabase, Google OAuth, Gmail, and hosting accounts; deploy both services and
finish the provider URL configuration to make the app available publicly.

## Tests

Run the backend API tests (they mock Supabase data and Gmail, so they do not
create real tasks or send email):

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_app
```

Check the frontend:

```powershell
cd frontend
npm run lint
npm run build
```

## API

- `GET /` — health check
- `GET /users` — registered assignees (requires a Supabase access token)
- `GET /tasks` — tasks created by or assigned to the caller
- `POST /tasks` — create and assign a task
- `PUT /tasks/<id>` — update task status
- `DELETE /tasks/<id>` — delete a task created by the caller

Authenticated API calls require `Authorization: Bearer <supabase-access-token>`.
Task access is checked by the Flask handlers and Supabase row-level security.
If Gmail delivery fails after a task is saved, the API returns the saved task
and a `notification_warning` so the UI can report the partial failure without
losing the task.
