# AmbulaSync

> A production-grade clinical scheduling engine that replaces paper registers with atomic Postgres booking transactions, AI-powered SOAP notes, and real-time doctor dashboards.

AmbulaSync is a high-concurrency clinic scheduling platform built for the Indian healthcare context. It guarantees zero double-bookings using database-level row locks and a unique slot constraint, so two patients can never reserve the same time slot — even under race conditions.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running Locally](#running-locally)
- [Demo Walkthrough](#demo-walkthrough)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

---

## Features

- **Atomic Slot Booking** — PostgreSQL `SELECT ... FOR UPDATE` row lock + `UNIQUE(slot_id)` constraint prevents double-bookings at the database level.
- **Patient Booking Flow** — Search doctors, view live availability, and book a slot in under 2 minutes.
- **Doctor Console** — Onboard as a doctor, open availability slots, view appointments, and write consultation notes.
- **AI SOAP Note Summarizer** — Convert messy shorthand into structured clinical notes using the Lovable AI Gateway.
- **AI Mock Patient Generator** — Generate realistic demo patient profiles for pitches and testing.
- **Google & Email Authentication** — Secure auth via Supabase Auth with Google OAuth and email/password.
- **Real-Time UI** — Slot grids auto-refresh every 5 seconds so booked slots immediately appear locked.
- **Mobile Responsive** — Fully responsive design for clinic staff and patients on any device.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TanStack Start, TanStack Query, Tailwind CSS v4, shadcn/ui |
| Backend | TanStack Server Functions (`createServerFn`) |
| Database & Auth | Supabase (PostgreSQL + Row Level Security + Auth) |
| AI | Lovable AI Gateway (Gemini 3 Flash) |
| Language | TypeScript |
| Package Manager | Bun |

---

## System Architecture

```
Patient/Doctor Action
        ↓
TanStack Server Function
        ↓
Supabase RPC / PostgREST
        ↓
PostgreSQL Transaction
        ↓
SELECT ... FOR UPDATE (Open slot row locked
        ↓
INSERT appointment
        ↓
UPDATE slot → is_booked = true
        ↓
COMMIT
```

The `book_slot` PostgreSQL function runs as a security definer and serializes concurrent attempts on the same slot. If two patients race for the same slot, PostgreSQL queues the second transaction until the first commits. The second transaction then sees `is_booked = true` and raises `SLOT_ALREADY_BOOKED`.

A `UNIQUE(slot_id)` constraint on the `appointments` table provides a final belt-and-suspenders guarantee against duplicate bookings.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and [Bun](https://bun.sh/) 1.2+
- A [Supabase](https://supabase.com/) project
- A [Google Cloud Console](https://console.cloud.google.com/) project for OAuth (optional, for Google sign-in)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ambulasync.git
cd ambulasync
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your Supabase credentials:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section for details.

### 4. Run Database Migrations

Apply the migrations in `supabase/migrations/` to your Supabase project. If you are using the Supabase CLI:

```bash
supabase migration up
```

Or run the SQL files directly from the Supabase SQL Editor.

### 5. Configure Google OAuth

In your Supabase Auth settings, add Google as a provider and set the authorized redirect URI to:

```
http://localhost:8080/auth/callback
```

Update the client ID and secret in Supabase. The app uses the Lovable OAuth broker, so no manual redirect handling is required in code.

---

## Environment Variables

Create a `.env` file in the project root with the following values:

```env
# Supabase project URL and public anon/publishable key (visible to browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id

# Server-side Supabase credentials (never expose to browser)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id
```

### Variable Reference

| Variable | Required | Client/Server | Description |
|----------|----------|---------------|-------------|
| `VITE_SUPABASE_URL` | Yes | Client | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Client | Supabase publishable (anon) key |
| `VITE_SUPABASE_ANON_KEY` | Yes | Client | Alias for publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Yes | Client | Supabase project ID |
| `SUPABASE_URL` | Yes | Server | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Server | Supabase publishable key for public reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server | Service role key for admin operations only |
| `SUPABASE_PROJECT_ID` | Yes | Server | Supabase project ID |

> **Security note:** Never commit `.env` to Git. It is already ignored in `.gitignore`. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or loader data.

---

## Database Setup

The project relies on the following schema:

- `profiles` — User profile information
- `user_roles` — Role-based access control (patient, doctor, admin)
- `doctors` — Doctor profiles linked to auth users
- `appointment_slots` — Availability slots created by doctors
- `appointments` — Confirmed patient bookings

Key database objects:

- `public.book_slot(slot_id, patient_name, patient_phone, reason)` — Atomic booking RPC using row-level locking.
- `public.has_role(user_id, role)` — Security definer helper for role checks.
- `public.handle_new_user()` — Trigger function that creates a profile and default patient role on sign-up.

### Row Level Security

All user-facing tables have RLS enabled. The migration grants the minimum required privileges:

- `authenticated` role can read/write its own data and book available slots.
- `service_role` is reserved for admin/maintenance operations.
- `anon` access is intentionally limited.

---

## Running Locally

Start the development server:

```bash
bun dev
```

The app will be available at:

```
http://localhost:8080
```

### Build for Production

```bash
bun build
```

### Preview Production Build

```bash
bun preview
```

---

## Demo Walkthrough

Use this flow to record a winning 2-minute demo video.

### 0:00 — Landing Page

Open `http://localhost:8080`. The landing page shows the hero, problem statement, and a live doctor search grid.

### 0:30 — Patient Books a Slot

1. Click on any doctor card.
2. Select an available time slot from the grid.
3. Fill in the booking form (name, phone, reason).
4. Submit and see instant confirmation.

### 1:00 — The WOW Moment: Concurrency Lock in Action

1. Open the same doctor page in two separate browser windows or incognito windows.
2. In both windows, click the **same available time slot**.
3. Submit both booking forms as close to simultaneously as possible.
4. **Result:** One window shows a success confirmation. The other shows a toast: **"Slot no longer available"**.
5. Explain: the database serialized both transactions with `SELECT ... FOR UPDATE`; only one commit won.

### 1:30 — Doctor Dashboard

1. Sign in as the doctor who created the slot.
2. Open the **Doctor Console**.
3. See the newly booked appointment in the appointments table.
4. Click **Consultation Notes** on the appointment.
5. Type shorthand like `"fever 3 days, cough, temp 102, prescribed paracetamol"`.
6. Click **Summarize with AI** and watch it become a structured SOAP note.

### 2:00 — Generate Demo Patients

1. In the Doctor Console, click **Generate Mock Patients**.
2. The AI creates realistic patient profiles and appointments for a polished dashboard during the pitch.

---

## Project Structure

```
.
├── src/
│   ├── components/          # Reusable UI components
│   ├── hooks/               # Custom React hooks
│   ├── integrations/        # Supabase client + auth integration
│   ├── lib/                 # Server functions and utilities
│   │   ├── ai.functions.ts          # AI SOAP summarizer + mock patient generator
│   │   ├── booking.functions.ts     # Atomic booking RPC wrapper
│   │   └── doctors.functions.ts     # Doctor search + slot queries
│   ├── routes/              # TanStack file-based routes
│   │   ├── __root.tsx               # Root layout
│   │   ├── index.tsx                # Landing page
│   │   ├── auth.tsx                 # Sign-in / sign-up page
│   │   ├── doctors.$doctorId.tsx   # Doctor profile + booking page
│   │   └── _authenticated/          # Protected routes
│   │       └── doctor.tsx           # Doctor console
│   ├── styles.css           # Tailwind v4 theme tokens
│   └── router.tsx           # TanStack Router configuration
├── supabase/
│   └── migrations/          # Database migrations
├── public/                  # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Deployment

### Option 1: Deploy with Lovable (Recommended)

Click **Publish** in the Lovable editor for a one-click deployment. This automatically handles the TanStack Start server functions and Supabase integration.

### Option 2: Deploy Frontend to Vercel

> **Note:** Vercel will only host the frontend and TanStack server functions. The Supabase backend remains hosted by Supabase. On Lovable Cloud, the `SUPABASE_SERVICE_ROLE_KEY` and DB password are not exposed, so any feature requiring service-role access must be tested carefully.

1. Push your code to GitHub.
2. Import the repository at [vercel.com/new](https://vercel.com/new).
3. Add the environment variables from `.env` to Vercel Project Settings.
4. Deploy.

### Option 3: Self-Host

Self-hosting TanStack Start requires manual setup. See the [Lovable self-hosting guide](https://docs.lovable.dev/tips-tricks/self-hosting) for details.

---

## Security

- All database access goes through Row Level Security policies.
- The `book_slot` function uses `SECURITY DEFINER` with a narrow search path to prevent privilege escalation.
- Service role access is restricted to server-side admin operations only.
- Environment variables keep sensitive keys out of the browser bundle.

For the latest security scan results, run the security scanner in your Lovable project dashboard.

---

## License

MIT © AmbulaSync Team

---

## Contact

Built for hackathon judges, clinic operators, and patients who deserve a better booking experience.

If you found this project useful, please ⭐ the repo!
