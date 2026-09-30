# Properties refinement — the brief from the 2026-09-30 client walkthrough

> Read this alongside `docs/BUILD_PLAN.md`. That file is the ordered build plan up to
> M7 (the Supabase→Railway migration). This is a **separate, parallel track** — new
> product requirements from a live demo with the client (Matloob) and a prospective
> user (Osama), captured here so they survive between sessions. New commits: **C45–C53,
> milestone M8**. This track does not block, and is not blocked by, M6/M7.

## Where this came from

A live screen-share walkthrough of the Homes page. Matloob and Osama gave detailed,
concrete feedback — not a wishlist, a correction of how the app should actually work.
One thing worth holding onto: they described almost every item below as "a five-minute
job." **It is not.** C46, C47, C50 and C51 are real data-model work — new tables, new
relationships, new UI built on both. C45, C48, C49 are smaller and more mechanical.

## The core message

Reorganise the app around **properties**, not rooms — and build it so **several
housing associations / landlords can each see only their own properties**, with the
list of who those associations are able to grow, not fixed to the two or three that
exist today.

## Scoped items

- **C45 · Rename Homes → Properties** · nav label, page titles, the `/homes` route
  itself renamed to `/properties` (old links redirect, nothing breaks) · **done when**
  the word "Home"/"Homes" no longer appears anywhere staff can see it, and `/homes/*`
  still works via redirect.

- **C46 · Landlords, for real** · a `landlords` table (not a hardcoded list), an
  "Add landlord" form (name, contact email, contact phone), and a `properties.landlord_id`
  link · **done when** a manager adds a landlord without touching SQL, and can assign
  it to a property.

- **C47 · Group and filter properties by landlord** · a dropdown at the top of
  Properties: "All", then one entry per landlord (from C46's real table, so a newly
  added landlord appears immediately) · **done when** picking a landlord shows only
  that landlord's properties, and adding a new landlord (C46) makes it selectable here
  with no code change.

- **C48 · Search properties by address** · a search box that jumps straight to a
  property by address/postcode, without picking a landlord first · **done when**
  typing part of a real address returns that property regardless of which landlord
  owns it.

- **C49 · Active / Pending status filter** · Properties list splits into Active (has
  tenants, or ready for them) and Pending (missing something) · **done when** clicking
  Pending shows only properties missing what's needed to go active, and says what's
  missing in plain words.

- **C50 · Two separate document trees — property vs tenant** · property documents
  (EPC, gas, electric, FRA, EICR, HMO licence, the lease with the landlord, invoices)
  live under the property; tenant documents (ID, deposit, licence agreement,
  authorisation letter, HB form, UC, photo) live under the tenant. A document's type
  is picked from a dropdown (not typed), with an "Other" option · **done when** a
  document added to a property never appears on a tenant's page and vice versa, and
  every document has a real type from the list.

- **C51 · Request a document from the landlord, in-app** · pick a document type and a
  property, send the request to that property's landlord (from C46's contact details)
  · **done when** the request is real (not "write an email yourself") and its status
  (asked / received) is visible on the property.

- **C52 · Room-status overview, colour-coded by landlord** · one view: how many rooms
  are filled vs empty, per property, coloured by which landlord owns it · **done when**
  a manager can see at a glance, across every landlord, where the empty rooms are.

- **C53 · Sessions: export + per-user AI key + provider choice** · download a session
  as a real Word document and PDF (not just on-screen); a support worker can save
  their own AI API key so sessions run on their own account rather than a shared one;
  Claude available as a selectable provider alongside whatever's already there ·
  **done when** a session downloads as an actual `.docx`/PDF file, and a second
  provider genuinely works end to end, not just appears in a dropdown.

## Not a build item, but real: the cadence

Matloob wants a working session most days, roughly an hour, to keep refining this
live — not a one-and-done spec handed over once. Treat each of the items above as
something to demo working, not just describe as done.

## Data model note

None of C46, C47, C50, C51, C52 can show anything real until landlords and their
properties actually exist in the database — this whole track depends on real seed
data (or the client's own data) before a demo of it means anything.
