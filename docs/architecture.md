# Architecture — Tenant Hub

## Dependency Graph
```
apps/web ──► packages/auth ──► packages/env
         ──► packages/ui
         ──► packages/domain ──► packages/validation
                              ──► packages/audit (ports only)
         ──► packages/intake-core ──► packages/validation
         ──► packages/db  (ONLY write path)
              └── packages/audit (hash chain)
              └── packages/blockchain (outbox enqueue)

apps/worker ──► packages/db
            ──► packages/blockchain
            ──► packages/ai ──► packages/validation
                            ──► packages/audit
```

## 6 Principles → Package Map

| Principle | Package(s) |
|---|---|
| 1. Single-entry cross-population | packages/domain (CanonicalTenantSchema + ProjectionRegistry) |
| 2. Tablet-first UI | packages/ui (56px touch targets, SignaturePad, tokens) |
| 3. 5-step intake pipeline | packages/intake-core (XState), apps/web/app/(intake)/ |
| 4. Wallet-less RBAC | packages/auth (TS matrix + RLS parity test) |
| 5. Tamper-proof audit | packages/audit (SHA-256 chain), packages/db (writeWithAudit) |
| 6. Isolated AI/DBMS | packages/ai (SecureDbGateway injection), packages/db (quarantine) |

## 5-Step Intake Pipeline (URL == machine state)
```
/intake/new          → Step 1: choose input mode (manual | OCR | voice)
/intake/[id]/extract → Step 2: OCR correction UI
/intake/[id]/review  → Step 3: staff confirm (WHO+WHEN immutable)
/intake/[id]/verify  → Step 4: tenant signature portal
/intake/[id]/complete→ Step 5: DB commit + async blockchain stamp
```

## Three Brands (letterhead switching)
- Matty's Place
- Ash Shahada Housing Association Ltd
- Reliance Housing

One click changes the letterhead header. Content identical.
