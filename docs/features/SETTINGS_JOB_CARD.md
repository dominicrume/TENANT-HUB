# Settings Feature Job Card

**1. What comes in?**
An authenticated HTTP PATCH request to `/api/settings` containing a JSON payload with `id` and `service_charge_default`.

**2. What do you do with it?**
- Authenticate the user and ensure they possess the `manager` role (RBAC).
- Validate the JSON payload against the `SettingsUpdateSchema` from `@tenant-hub/validation`.
- Execute a database UPDATE via the `writeWithAudit` RPC function, anchoring the mutation to the user's identity and generating an audit hash.

**3. What goes out?**
- On success: The updated `settings` row and a 200 HTTP status.
- On failure: Appropriate 400 (Bad Request), 401 (Unauthenticated), or 403 (Forbidden) JSON error responses.

**4. How do you know the stage is done?**
The UI can securely fetch and update the default service charge, only managers can change it, bad inputs (e.g., negative amounts) are blocked by Zod, and all mutations are immutably logged in the `audit_logs` table with a corresponding hash.
