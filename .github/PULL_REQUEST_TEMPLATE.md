## Description
Briefly describe the changes in this PR.

## Hardening Checklist (H1-H8)
Please verify this PR adheres to the Tenant Hub Hardening Directives:
- [ ] No RLS bypasses introduced (H2)
- [ ] All writes use `writeWithAudit` (H1)
- [ ] No browser storage used for intake state (H5)
- [ ] UI components do not import domain/db/auth logic directly

## Deployment
- [ ] Requires new environment variables
- [ ] Requires database migrations (run `supabase db push` or equivalent)

## Related Issues
Fixes #
