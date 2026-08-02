# Domain Stage (packages/domain)

**1. What comes in?**
Raw unvalidated data structures and type definitions from the database or external APIs.

**2. What do you do with it?**
Define the core business entities, types, and logic that govern the application.

**3. What goes out?**
Strictly typed, canonical domain models (e.g., `Tenant`, `Ledger`, `User`).

**4. How do you know the stage is done?**
The domain logic handles all required business rules, types resolve cleanly without `any`, and no UI or infrastructure concerns are present in the package.
