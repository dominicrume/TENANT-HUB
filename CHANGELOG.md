# Changelog

## [1.1.0] - Support Plan Goals & UX Polish
### Added
- **Dynamic Support Plan System**: New Goals infrastructure based on the Reliance format (AEW, BH, EAA, Mpc, SS). Staff can set goals, log interactions, sign/date steps, and track 3-month review dates.
- **Deduplication Constraints**: Enforced unique constraints on `tenant_signature_hash` to physically prevent duplicate tenant creation under network latency or React StrictMode edge cases.

### Changed
- **Unified Master Record**: Repurposed the disparate Forms buttons into a single unified record tab. Updating a tenant's information here inherently updates it everywhere, reducing repetitive data entry.
- **Creator Audit Logic**: The Audit Stamp now explicitly queries the `CREATE` action to correctly attribute the original creator of a record.
- **Save Feedback**: Empty form fields now properly save as `null` in the database, and Zod validation errors (e.g., formatting issues with room numbers or dates) are explicitly highlighted to the user on the exact fields that failed.

## [1.0.0] - Initial Production Release
### Added
- Full Enterprise Hardening (Tiers 1-8 completed).
- Production-ready Vercel Deployment.
- Stripe Billing integration for SaaS Multi-Tenancy.
- Blockchain Audit Hashing worker implementation.
