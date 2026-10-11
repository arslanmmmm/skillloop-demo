# SkillLoop

Peer-learning app for grades 7–12. Students post short text explanations. Reputation in a subject is the count of **helpful votes from other students**, never a self-reported score.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, paste and run [`supabase/schema.sql`](supabase/schema.sql). It is safe to re-run and keeps existing data, so run it again after pulling schema changes (it also upgrades a Phase 1 database).
3. Authentication → Providers → Email → turn **off** “Confirm email” so sign-up returns a session immediately.
4. Copy env values:

```bash
cp .env.example .env
```

Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase → Project Settings → API. Do not commit `.env`.

5. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:5173

## What Phase 1 includes

- Email + password sign up, sign in, and sign out
- A `profiles` row on sign-up (display name, grade 7–12, role `student`)
- Subjects you can teach or need help with (`user_subjects`)
- Explanations stored in Postgres; data survives reload
- One vote per user per explanation (toggle). You cannot vote on your own post (unique constraint, trigger, and RLS)
- Reputation from the `subject_reputation` SQL view
- Feed, profile, match suggestions, and write pages
- Loading and error states on every data screen

Teachers are not self-serve. Promote someone in the SQL editor:

```sql
update public.profiles set role = 'teacher' where id = '<auth user uuid>';
```

## What Phase 2 adds

- Comment + 1–5 “how clear was this?” rating on each explanation (one review per student). Authors can reply. Cards show comment count and average clarity.
- Ask for help (the **Help** tab): pick a subject, optionally write your question, and send a real `help_requests` row to a helper, who accepts or declines. You can see the status of the requests you sent.
- Helpers are everyone who teaches that subject, ranked by their reputation in it, then by how close their grade is to yours. A **Trade** badge marks people you can teach something back.
- After sign-up, a 3-step onboarding: grade → subjects you can teach → subjects you need help with.
- Grade + subject reputation on explanation and match cards, with New / Trusted / Top explainer labels (`src/config/reputation.js`).

Anonymous questions, reporting, and teacher moderation are Phase 3.
