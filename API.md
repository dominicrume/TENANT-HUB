# API Documentation

All API routes are protected by the `withRouteHandler` middleware, which enforces:
1. **Authentication**: Requests must have a valid session.
2. **Authorization (RBAC)**: Enforces `can(role, resource, action)`.
3. **Rate Limiting**: 10 requests per 10 seconds via Upstash Redis.

## Routes
- `GET /api/tenants` - List tenants (Filtered by org via RLS).
- `POST /api/tenants` - Create a new tenant.
- `GET /api/tenants/[id]` - Retrieve a tenant.
- `PATCH /api/tenants/[id]` - Update a tenant.
- `DELETE /api/tenants/[id]` - Archive a tenant.
- `POST /api/invites` - Invite a user to the organisation.
- `POST /api/organisations` - Create an organisation (SaaS onboarding).
- `POST /api/erasure-request` - Submit a GDPR Right to Erasure request.
