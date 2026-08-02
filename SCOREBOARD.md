# The KYA Scoreboard (Thirteen Checks)

Before anything ships, it faces this full inspection. 
**PASS**: it is built, and you can point to the exact file or mechanism that proves it.
**GROWING**: started, not finished — name what is missing.
**MISSING**: not there — fix it, or sign your name and a date to why it can wait.

---

1. **The Written Rules:** PASS (Rules defined in `CLAUDE.md`)
2. **Plan Before Code:** PASS (Job cards exist in all package folders)
3. **Small Pieces:** PASS (Monorepo architecture with distinct packages)
4. **A Route, Not a Reflex:** PASS (XState machines in `packages/intake-core`)
5. **Know What Done Means:** PASS (Completion criteria defined in all `JOB_CARD.md` files)
6. **Feed It Only What It Needs:** PASS (ESLint boundaries enforce strict dependencies)
7. **Contain the Fire:** PASS (Row Level Security and strict API route bounds)
8. **Show Your Working:** PASS (Audit log table tracks every mutation)
9. **Fences That Hold:** PASS (Zod schemas strictly validate all I/O)
10. **Check Your Own Work:** PASS (Unit tests and integration pipelines)
- [x] 11. **Say Where You Learned It** - AI draft routes trace facts back to source doc chunks
- [x] 12. **Ship Through a Gate** - `scripts/kya-gate.js` runs on `pnpm test`
- [x] 13. **Learn From Last Time** - Attack Log template added for future sprints

## Feature Certifications
- **Settings Table (2026-08-01):** Validated. Retrofitted API with RBAC, Zod `SettingsUpdateSchema`, and added to ATTACK_LOG.
- **Vision OCR Parsing (2026-08-02):** Validated. Tested base64 image pass-through to LLM (Vercel AI SDK), enforced failure boundary limits in `provider.ts`, and updated ATTACK_LOG.
