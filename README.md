# Railway Accommodation Maintenance Portal (RAMP)

RAMP is a Node.js, Express, and SQLite application for submitting, assigning,
tracking, and resolving railway accommodation maintenance complaints.

## What works

- Public complaint submission with optional JPEG/PNG evidence
- Tracking by request ID or by email and employee ID
- Admin dashboards, filters, CSV export, locations, supervisors, and assignments
- Supervisor queues, status updates, forwarding, and performance statistics
- Optional SMTP notifications and optional local Ollama assistant
- Automatic database creation and migration on startup

## Requirements

- Node.js 20 or 22 LTS
- npm

Do not upload or copy `node_modules` between operating systems. Native
dependencies such as SQLite must be installed on the machine that runs RAMP.

## Setup

### macOS or Linux

```bash
cp .env.example .env
npm install
npm test
npm start
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
npm install
npm test
npm start
```

Open <http://localhost:3000>.

The database and upload directory are created automatically. On a brand-new
database, the initial credentials come from `ADMIN_USERNAME` and
`ADMIN_PASSWORD` in `.env`. Change the example password before deployment.
RAMP never resets an existing admin password during startup.

## Main pages

- Public request form: `/`
- Track requests: `/track.html`
- Staff login: `/login.html`
- Admin dashboard: `/admin`
- Supervisor dashboard: `/supervisor/dashboard.html`

## Configuration

Copy `.env.example` to `.env`, then update at least:

- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `BASE_URL` for deployed email links

Email and the Ollama assistant are disabled by default. Enable them only after
configuring the related values in `.env`.

## Useful commands

```bash
npm start       # Start the application
npm run dev     # Start with nodemon
npm run check   # Check JavaScript syntax
npm test        # Run the end-to-end smoke test
```

The smoke test uses a temporary database and verifies login, seeded locations,
supervisor creation, request submission, automatic assignment, status update,
tracking, contact submission, and core admin APIs.

## Project layout

```text
ramp/
├── config/                 Email configuration
├── db/                     SQLite database location (created at runtime)
├── email-templates/        Notification templates
├── public/                 HTML, CSS, browser JavaScript, and images
├── routes/                 Auth, public, admin, supervisor, and AI routes
├── scripts/                Validation and smoke-test scripts
├── services/               Email and AI services
├── uploads/                Uploaded evidence (created at runtime)
├── .env.example            Safe configuration template
├── package.json
└── server.js
```

## Deployment notes

- Use HTTPS and set `NODE_ENV=production`.
- Use a strong, unique `SESSION_SECRET`.
- Persist both `db/` and `uploads/`.
- The default in-memory session store is suitable for local use. Replace it
  with a persistent session store before running multiple production instances.
- Back up the SQLite database before upgrading or changing location data.

## API groups

- Authentication: `/api/auth/*`
- Public data and requests: `/api/*`
- Admin operations: `/api/admin/*`
- Supervisor operations: `/api/supervisor/*`
- Optional AI assistant: `/api/ai/*`

## License

ISC
