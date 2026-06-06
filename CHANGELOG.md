# Changelog

## [1.0.0] - 2026-06-06
### Added
- **Security**: Hardcoded secrets removed, vercel.json headers added, `@upstash/ratelimit` integrated, GDPR pages and erasure endpoints created.
- **Reliability**: Global error boundaries added, `writeWithAudit` transient DB retries added, dead-letter webhook alerting added, Optimistic UI built into `useTenants`.
- **Performance**: `009_indexes.sql` added for high-frequency queries, `optimizePackageImports` for Next.js, Realtime subscriptions active on `useTenants`.
- **SaaS**: `010_organisations.sql` migration, Stripe integration, Team invitations, Onboarding flow.
- **Observability**: `pino` logger, `@sentry/nextjs` config, `@vercel/analytics`.
- **Deployment**: `.github/workflows/deploy.yml` created, PR Template.
- **Polish**: Resend email templates.
- **Testing**: Architecture boundary tests.
