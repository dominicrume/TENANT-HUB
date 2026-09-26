# KYA Stage (packages/kya)

**1. What comes in?**
An agent's mandate (what it may read, what it may never do) and the action it is about to take.

**2. What do you do with it?**
Assert the action is inside the mandate, record every source read and every refusal on a receipt.

**3. What goes out?**
An ActionReceipt that travels with the audit row (agent, sources read, refusals, outcome). Pure: no infrastructure.

**4. How do you know the stage is done?**
Every agent write carries a receipt; a mandate violation throws before any write happens.
