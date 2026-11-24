# PawTrack remake (React + TypeScript + Supabase)

This folder is the native React remake of the vanilla PawTrack app. The original app in the parent folder is unchanged.

## 1. Create the database on Supabase

1. Open https://supabase.com and create a project.
2. Go to **SQL Editor**.
3. Paste and run `supabase/schema.sql` (tables, roles, RLS, storage buckets, triggers).
4. Paste and run `supabase/seed.sql` (demo dogs and donations).
5. Staff apply for an account on `/staff-apply` and verify their email with a code, so in **Authentication**:
   - **Sign In / Providers:** keep **Allow new users to sign up** and **Confirm email** turned on.
   - **Email Templates → Confirm signup:** put the code in the email, for example `Your PawTrack verification code is {{ .Token }}`.
   - **SMTP Settings:** Supabase's built-in email only reaches members of your Supabase team and sends very few emails per hour. Set up a free SMTP provider (for example Resend or Brevo) so applicants actually receive their code.
6. In **Authentication → Users**, create (tick **Auto Confirm User**):
   - `admin@pawtrack.app` / a password you choose
   - `staff@pawtrack.app` / a password you choose
7. New logins start as pending staff with no access. Applicants are approved by an admin on the **Staff & Volunteers** page. For the very first admin, run this in the SQL Editor (also in `supabase/promote-staff.sql`):

```sql
update public.profiles
  set role = 'admin', status = 'active'
  where email = 'admin@pawtrack.app';

update public.profiles
  set role = 'staff', status = 'active'
  where email = 'staff@pawtrack.app';
```

### Email: notifications and replies

Every new inbox item (contact message, adoption application, donation, staff application) is emailed to the admin with **Reply-To** set to the sender, so replying in Gmail answers them directly. Staff can also press **Reply** on a message in the Inbox: the reply is emailed to the sender from the admin Gmail and saved under the message.

Everything goes through the admin Gmail (`pawtrackoso@gmail.com`), so one **App password** covers it all:

1. In that Google Account, turn on **2-Step Verification**, then create an **App password** (Google Account → Security → App passwords).
2. Deploy the function: `supabase functions deploy notify-admin --no-verify-jwt` (code in `supabase/functions/notify-admin`).
3. In **Edge Functions → Secrets**, add `GMAIL_APP_PASSWORD` = the app password. Optional: `ADMIN_EMAIL` (default `pawtrackoso@gmail.com`) and `SITE_URL` (adds an "Open the staff inbox" link).
4. Run `supabase/email-notifications.sql` after replacing `YOUR-PROJECT-REF` with your project ref.
5. For the staff sign-up verification codes, set **Authentication → SMTP Settings** to the same Gmail: host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the same app password.

Gmail allows about 500 emails a day, which is plenty for the shelter.

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

If that older database still had client sign-up, also run `supabase/remove-clients.sql`. Then run `supabase/staff-applications.sql` to add staff applications and admin approval. Then `supabase/donation-confirmation.sql` so donations wait for staff confirmation before they count. Then `supabase/deleted-dogs.sql` for Recently deleted dogs (kept 7 days, purged daily by pg_cron) and deleting staff accounts. Client accounts become pending staff with no access, and the client links on dogs and adoptions are dropped.

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

## 3. Build the Android app (APK)

The Android app is the same React site wrapped with [Capacitor](https://capacitorjs.com) 7. It uses the Supabase project in your `.env`, so build it with the right `.env` in place.

Needs: Node 20+, Java 21 (`/usr/lib/jvm/java-21-openjdk-amd64`) and the Android SDK (`~/Android/Sdk`, comes with Android Studio).

```bash
npm run build
npx cap sync android
cd android
echo "sdk.dir=$HOME/Android/Sdk" > local.properties
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleRelease
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk`.

**Signing key:** release builds are signed with `keystore/pawtrack-release.jks` using the passwords in `keystore/keystore.properties`. Both are git-ignored. Back them up somewhere safe: Android only installs an update over an existing install if it is signed with the same key. Without `keystore/`, `assembleRelease` makes an unsigned APK.

**New version:** raise `versionCode` (and `versionName`) in `android/app/build.gradle` before building.

**Publishing:** upload the APK to a GitHub release as `PawTrack.apk`. The website's "Download the Android app" button points at `releases/latest/download/PawTrack.apk`, so it always serves the newest release. Set `VITE_APK_URL` in `.env` to host it somewhere else.

**Icons:** edit the SVGs in `assets/`, export them to the PNGs next to them, then run `npx @capacitor/assets generate --android --iconBackgroundColor '#0f766e' --splashBackgroundColor '#0f766e'`.
