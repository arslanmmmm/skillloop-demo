# SkillLoop

Peer-learning app for grades 7–12. Students post short text explanations. Reputation in a subject is the count of **helpful votes from other students**, never a self-reported score.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, paste and run [`supabase/schema.sql`](supabase/schema.sql).
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

The `feedback` table is in the schema for comments/ratings (wired in Phase 2). Match “Request trade” is still a placeholder until Phase 2 help requests.
