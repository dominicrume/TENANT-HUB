# Auth Stage (packages/auth)

**1. What comes in?**
User credentials (email/password) or session tokens.

**2. What do you do with it?**
Authenticate the user via Supabase Auth, verify session validity, and manage roles.

**3. What goes out?**
A secure session object and a validated user profile.

**4. How do you know the stage is done?**
The user session is securely established, role information is accurately attached, and unauthenticated requests are strictly rejected.
