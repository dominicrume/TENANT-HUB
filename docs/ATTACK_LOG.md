# The Attack Log (The Five Hats)

This file tracks the required stress-testing of all major features before they are built. 

## Instructions
For every new feature or major refactor, record the arguments from the Five Hats below. Do not look for agreement; look for disagreement.

1. **The Planner:** Is the shape right? (Are the stages in the right order? Is anything missing?)
2. **The Builder:** Can it be built? (Can it actually be made with the tools and time you have?)
3. **The Thief:** How do I steal from it? (Steal data, trick the AI, misuse the product.)
4. **The Firefighter:** What burns at 3 AM? (What fails first under real load, and how would anyone know?)
5. **The Doubter:** What are we assuming? (Every "of course it will" is a place it might not.)

---

## Log

### Feature: Settings Table (Default Service Charge)
*Date: 2026-08-01*

*   **Planner:** Is the shape right? The `005_settings_table.sql` already exists but the API lacks fences. The UI calls `PATCH /api/settings`. The order of operations needs to enforce validation before mutating the database.
*   **Builder:** Can it be built? Yes, the database schema already supports it. We just need to wire Zod into `@tenant-hub/validation` and the API route.
*   **Thief:** How do I steal from it? A regular user (non-manager) might try to `PATCH` the settings route to lower their service charge default.
*   **Firefighter:** What burns at 3 AM? If a negative number or a string is sent as the service charge, it might break downstream calculations that expect numeric positive values.
*   **Doubter:** What are we assuming? We assume the incoming `brand` parameter is valid. We assume that if someone updates the setting, there is an audit trail. (Fortunately, `writeWithAudit` handles the trail).

**Resolution/Fixes applied to plan:**
- Enforce strict RBAC in `PATCH /api/settings` to ensure only `manager` role can update settings.
- Create `SettingsUpdateSchema` in `@tenant-hub/validation` to enforce that `service_charge_default` is a positive number.
- Reject requests that fail Zod validation with a 400 Bad Request.

---

## Log

### Feature: AI Image Vision Parsing (OCR)
*Date: 2026-08-02*

*   **Planner:** Is the shape right? The frontend captures the file, generates a data URL, and posts to `/api/intake/ocr`. The API passes it to `@tenant-hub/ai`, which translates it into the Vercel AI format. This is correct.
*   **Builder:** Can it be built? Yes, the multimodal models (GPT-4o, Claude 3.5 Sonnet) natively support this. 
*   **Thief:** How do I steal from it? Passing a massive, malicious payload to the `/api/intake/ocr` endpoint to cause a denial of service (OOM error or Vercel function timeout).
*   **Firefighter:** What burns at 3 AM? If the chosen LLM hallucinates an invalid JSON string, the `JSON.parse(json)` call will throw an error, causing a 500 status.
*   **Doubter:** What are we assuming? We assume the base64 string provided is actually a valid image format supported by the LLM. 

**Resolution/Fixes applied to plan:**
- The `/api/intake/ocr` explicitly catches `JSON.parse` errors and returns an empty extraction block rather than hard-crashing the app. This gracefully degrades the UI back to manual entry.
- The `complete()` provider explicitly clamps `maxTokens` to 700 to prevent runaway generation costs.

---

## Log

### Feature: [Feature Name]
*Date: YYYY-MM-DD*

*   **Planner:**
*   **Builder:**
*   **Thief:**
*   **Firefighter:**
*   **Doubter:**

**Resolution/Fixes applied to plan:**
- ...
