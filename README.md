# PawTrack remake (React + TypeScript + Supabase)

This folder is the native React remake of the vanilla PawTrack app. The original app in the parent folder is unchanged.

## 1. Create the database on Supabase

1. Open https://supabase.com and create a project.
2. Go to **SQL Editor**.
3. Paste and run `supabase/schema.sql` (tables, roles, RLS, storage buckets, triggers).
4. Paste and run `supabase/seed.sql` (demo dogs and donations).
5. In **Authentication → Providers**, turn on **Email**, and turn off **Allow new users to sign up**. There is no public sign-up; only staff and admins log in.
6. In **Authentication → Users**, create (tick **Auto Confirm User**):
   - `admin@pawtrack.app` / a password you choose
   - `staff@pawtrack.app` / a password you choose
7. New logins start as pending staff with no access. Run this in the SQL Editor (also in `supabase/promote-staff.sql`):

```sql
update public.profiles
  set role = 'admin', status = 'active'
  where email = 'admin@pawtrack.app';

update public.profiles
  set role = 'staff', status = 'active'
  where email = 'staff@pawtrack.app';
```

### Tables created

| Table | Purpose |
| --- | --- |
| profiles | Staff and admin logins linked to auth.users (staff / admin / volunteer) |
| dogs | Shelter dogs, including mother/puppy links |
| adoptions | Applications (phone, ID photo, who wants to adopt) |
| donations | Auto-accepted gifts |
| inbox_messages | Shared staff/admin inbox |
| activity_log | Shelter activity |

Storage buckets: `dog-photos` (public), `id-photos` (private, staff can read).

**Upgrading an existing database?** If you set up Supabase with an older version that had the Community feature, also run `supabase/remove-community.sql` to drop the community tables. It permanently deletes posts, comments, likes, follows and chats.

If that older database still had client sign-up, also run `supabase/remove-clients.sql`. Client accounts become pending staff with no access, and the client links on dogs and adoptions are dropped.

## 2. Run the React app

```bash
cd pawtrack-remake
cp .env.example .env.local
```

Put your project URL and **anon** key from **Project Settings → API** into `.env.local`.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

- Public site: Home, Adopt, Donate, About, Contact (no account needed to apply or donate)
- Staff desk: `/ops` after staff/admin login
- Adoption form still requires telephone, valid ID photo, and a note naming who wants to adopt
