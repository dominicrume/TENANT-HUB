# Blockchain Stage (packages/blockchain)

**1. What comes in?**
A completed audit log entry containing a cryptographic hash.

**2. What do you do with it?**
Anchor the cryptographic hash to a public blockchain ledger (Polygon) via an asynchronous job to provide third-party verifiability.

**3. What goes out?**
A transaction receipt and a permanent public ledger record (a "stamp").

**4. How do you know the stage is done?**
The transaction is confirmed on the public blockchain, and the receipt is linked back to the internal `audit_logs` entry asynchronously without blocking the user request.
