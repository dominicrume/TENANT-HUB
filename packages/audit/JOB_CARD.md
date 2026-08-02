# Audit Stage (packages/audit)

**1. What comes in?**
Authenticated actions targeting database mutations (table names, records, user IDs).

**2. What do you do with it?**
Record the mutation securely in the `audit_logs` table, computing a cryptographic hash over the previous record to form a tamper-proof chain.

**3. What goes out?**
The successful mutation to the target table, alongside an immutable audit trail entry and its cryptographic seal.

**4. How do you know the stage is done?**
The `audit_logs` entry is committed atomically with the main transaction, the hash chain remains unbroken, and a verifiable signature is produced.
