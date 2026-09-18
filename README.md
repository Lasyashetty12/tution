# Infinite Tutorial

A secure, responsive student management and scorecard system for Students, Parents, Sir/Teachers, and Admins.

## Live application

- Public website: https://tution-lemon.vercel.app/
- Secure portal: https://tution-lemon.vercel.app/portal.html

## Included

- First-login student profile completion with automatic profile locking
- Parent-mobile student login and DOB-based initial password (MMDDYY)
- Student password changes and authorized DOB password resets
- Student, parent, teacher, and admin role-based dashboards
- Monday-Saturday attendance with morning/evening sessions
- Batch-wise attendance history and percentage
- Permanent leave requests with Pending/Approved/Rejected decisions
- Board-specific CBSE and State Board subjects
- Custom tests, marks, percentage calculation, remarks, and paper uploads
- Overall and subject-wise bar charts
- Search and combined student filters
- Configurable batches and teacher-batch assignments
- Profile history, password-reset history, and audit logs
- Private Supabase Storage for student photos and test papers
- Row Level Security on every exposed application table
- No application delete permissions for historical academic records

## Architecture

- Frontend: static HTML, CSS, JavaScript
- Hosting: Vercel
- Authentication, database, storage, and server functions: Supabase
- Charts: Chart.js

The browser uses only a Supabase publishable key. Privileged account creation and password resets run inside the protected `account-admin` Edge Function. Never place a service-role key in this repository.

## First administrator

Open `portal.html`, choose **First administrator setup**, and create the first administrator using the private one-time setup token supplied separately. The token is stored only as a SHA-256 hash in the database and becomes unusable after the first admin is claimed.

## Student login

- Username: registered parent mobile number
- Initial password: date of birth in `MMDDYY`
- Example: 15 August 2010 becomes `081510`

## Database

The production schema is documented in `supabase-schema.sql`. Its setup-token value is intentionally a placeholder; never commit a real setup token.

## Contact

- Phone: +91 81470 65530
- Email: info@infinitetutorial.com
