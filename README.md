# Pulse Grid — Aim Trainer

A **radial tunnel aim trainer** built with Next.js: targets spawn along rays from the center, grow as they move outward, and arrive in **waves**. Click or tap them before they reach the edge. Tune modes, difficulty, and goals—then review a session summary and send feedback by email.

---

## Highlights

| | |
| --- | --- |
| **Playfield** | Square arena, no page scroll; tuned for desktop and mobile (`touch-action`, coarse pointer bump). |
| **Modes** | Standard, Precision, Speed, Tracking, Flick—each changes wave timing, targets, and movement. |
| **Difficulty** | Casual / Standard / Hard—scales speed and spacing. |
| **Audio** | Web Audio hit / miss / wave / tick SFX; mute and volume. |
| **HUD** | Score, accuracy (tenths of a percent), hits/misses, wave & batch, rank, session timer. |
| **Persistence** | Best score & best accuracy per **mode + difficulty** in `localStorage`. |
| **Feedback** | Optional SMTP email via `/api/feedback` (Nodemailer). |

---

## Tech stack

- **[Next.js](https://nextjs.org) 16** (App Router)
- **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Nodemailer** (server route for feedback mail)
- Fonts: **Rajdhani** (display), **Geist Mono** (via layout)

---

## Gameplay (quick reference)

### Modes

- **Standard** — Balanced waves and target counts.
- **Precision** — Slower waves, smaller targets, tighter tuning.
- **Speed** — Faster cadence and more aggressive scaling.
- **Tracking** — Targets can orbit with angular velocity.
- **Flick** — One target per wave (flick-style).

### Session goals (optional)

- **None** — Open-ended run.
- **50 hits** — Progress bar toward 50 hits.
- **85% × 2 min** — Hold ≥85% accuracy (with enough attempts) for a cumulative 2-minute window.

### Rank letter (S / A / B / C)

The large letter is a **grade from your session score** (same as **Score** on the HUD), not from accuracy:

| Rank | Score (this run) |
| --- | --- |
| **S** | ≥ 500,000 |
| **A** | ≥ 200,000 |
| **B** | ≥ 80,000 |
| **C** | ≥ 20,000 |
| **—** | Below 20,000 |

**Accuracy** is listed separately (stored in tenths of a percent to avoid rounding artifacts).

### Best stats

“Best score” and “best accuracy” are saved per **mode + difficulty** in the browser (`localStorage`). They only update when you beat your previous best (accuracy rules require enough attempts; very high tiers are gated so short streaks don’t dominate).

---

## Project layout

```text
app/
  api/feedback/route.ts    # POST feedback → email (Nodemailer)
  components/
    AimTrainer.tsx           # Main game + HUD + loop
    FeedbackPanel.tsx        # Feedback button + modal
    aim/SessionSummary.tsx   # Session stats modal
  hooks/useAimAudio.ts       # Web Audio SFX
  lib/aim/
    config.ts                # Params, storage keys, thresholds
    geometry.ts              # Ray math, sizes, RNG helpers, accuracy
    types.ts                 # Shared types
  icon.svg                   # Favicon
  layout.tsx / page.tsx / globals.css
```

---

## Getting started

### Prerequisites

- **Node.js** 20+ (recommended)

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

---

## Feedback email (optional)

The app can send feedback through **`POST /api/feedback`** using SMTP. Copy `.env.example` to **`.env.local`** and set:

| Variable | Purpose |
| --- | --- |
| `FEEDBACK_SMTP_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `FEEDBACK_SMTP_PORT` | Usually `587` (STARTTLS) or `465` (SSL) |
| `FEEDBACK_SMTP_SECURE` | `false` for 587, `true` for 465 |
| `FEEDBACK_SMTP_USER` | SMTP username |
| `FEEDBACK_SMTP_PASS` | App password or SMTP secret |
| `FEEDBACK_MAIL_TO` | Inbox that receives feedback |
| `FEEDBACK_MAIL_FROM` | Optional; defaults to `FEEDBACK_SMTP_USER` |
| `FEEDBACK_SMTP_TLS_REJECT_UNAUTHORIZED` | Set to `false` only if you hit TLS/cert issues (e.g. some proxies) |

**Gmail:** use an [App Password](https://support.google.com/accounts/answer/185833) with 2FA enabled, not your normal login password.

If env vars are missing, the API returns **503** and the UI shows an error after submit.

---

## Deploying

Works on **Vercel** (or any Node host). Add the same env vars in the project dashboard. Prefer **strict TLS** in production (`FEEDBACK_SMTP_TLS_REJECT_UNAUTHORIZED` unset or `true`) unless you know you need otherwise.

---

## License

Private / all rights reserved unless you add a license file.

---

## Credits

- **Made by [Kashan](https://itzkashan.dev/)**
- UI and game logic: **Pulse Grid** / aim-trainer project.
- Bootstrapped with [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
