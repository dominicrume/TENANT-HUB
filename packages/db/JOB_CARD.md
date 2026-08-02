# Database Stage (packages/db)

**1. What comes in?**
Authenticated user requests and validated domain objects destined for storage.

**2. What do you do with it?**
Execute SQL migrations, manage Supabase types, and enforce Row Level Security (RLS).

**3. What goes out?**
Persisted data, strict generated database types, and authenticated Supabase client instances.

**4. How do you know the stage is done?**
Data is saved securely, RLS policies prevent unauthorized access, and all state mutations are recorded via the canonical `writeWithAudit` pipeline.
