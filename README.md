# AveLoop

AveLoop turns a hospital discharge note into a care plan, then walks the patient through the next steps. Paste the note or snap a photo, review medications and follow-ups, and send the approved steps on to Fo.

## What you can do

1. **Extract.** Paste a discharge summary, or upload a photo or PDF. AveLoop pulls out medications, follow-ups, warnings, and the actions to take next.
2. **Review.** Ready steps are separated from ones that still need a date or a clinic. Medication times start at 8am, 12pm, and 6pm. Those boxes stay visible, and changing them is optional.
3. **Execute.** Approved steps run one at a time. If the clinic is ambiguous, Fo asks which Riverside location to use.
4. **Keep it.** Signed-in plans are saved so they can be reopened from History. A caregiver can open a read-only share link. The plan can also be downloaded as a PDF.
5. **Check symptoms.** Red-flag symptoms, such as trouble breathing or a stiff neck, tell the patient to call 911 instead of waiting on the agent.
6. **Hear it.** Fo's questions and the end-of-plan summary are spoken aloud.

## Run it locally

```bash
cd aveloop
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in, then use **Use sample notes** on the home page to try the Alex Chen sinusitis discharge without typing one.

## Environment

Create `aveloop/.env.local`. Do not commit it.

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_JWT_SECRET=

# Google — extraction, follow-up replies, and speech
GOOGLE_TTS_API_KEY=

# Optional. Live Fo calendar and email. Without it, steps are confirmed in the app.
WAJO_TOKEN=
```

`GOOGLE_API_KEY` or `GEMINI_API_KEY` can be used in place of `GOOGLE_TTS_API_KEY`. `GEMINI_MODEL` overrides the default extraction model (`gemini-3.5-flash-lite`).

### Supabase

In the Clerk dashboard, activate the Supabase integration and add the Clerk domain under Supabase Authentication. Then run `supabase/schema.sql` in the Supabase SQL editor. That creates `care_plans` and the row-level policies so each person only sees their own plans.

History still works from this browser if Supabase is not set up. Those plans stay in local storage.

### Fo

Set `WAJO_TOKEN` when Fo should create the Google Calendar events and send email through Wajo. The default MCP URL is `https://mcp.api.wajo.ai/fo`. Override it with `WAJO_MCP_URL`.

Without that token, AveLoop uses the Google key to confirm each step in the app. Those replies do not write to Google Calendar.

## Stack

Next.js 16, React 19, Clerk, Supabase, and the Google Gemini API for extraction, follow-up replies, and text-to-speech.
