# Vision Tuition

Responsive tuition website for Classes 9–12 with a public registration form and a secure Supabase-backed admin dashboard.

## Included

- Vision logo and public home page
- About, classes, teaching approach, achievements, testimonial and contact sections
- Central student registration
- Secure email/password admin login
- Private student records protected by PostgreSQL Row Level Security (RLS)
- Student status management
- Test-score and attendance entry
- Class-distribution and subject-performance charts
- Responsive mobile, tablet and desktop layouts

## Secure setup

Use a new Supabase project dedicated to this website. Do not reuse a school or question-bank database.

1. Create a Supabase project.
2. Run `supabase-schema.sql` in its **SQL Editor**.
3. Create the administrator in **Authentication → Users**.
4. Authorise the same email in the SQL Editor:

```sql
insert into public.admin_users (email)
values ('admin@visiontuition.com');
```

5. Replace both placeholders in `supabase-config.js` with the project URL and publishable/anon key.
6. Deploy with GitHub Pages, Netlify or Vercel.

The browser key is public by design. Never add the Supabase `service_role` key to this repository.

## Dummy contact values

- Phone: +91 98765 43210
- Email: info@visiontuition.com
- Address: 123 Education Road, Bengaluru, Karnataka 560001

Replace these values in `index.html` before the public launch.

## Preview

Open `index.html` through a local web server, such as the VS Code Live Server extension. Until Supabase is configured, the public design remains viewable while registration and admin login safely report that setup is incomplete.
