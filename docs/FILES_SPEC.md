# Files, photos and documents — the specification

> Written 2026-10-10 after re-reading every call transcript and message since 27 Sept.
> This is the contract the file layer is built to. Rume: "go through the transcripts again
> in detail, then build to specification." Everything below traces to something that was said.

## 1. What was asked, in their words, and where

| Date | Who | Ask |
|---|---|---|
| 27 Sep | Rume | Click the tenant photo to change it; a save that actually confirms; **snap the person standing in front of me**; snap the paper form live for OCR; upload from device |
| 30 Sep / 1 Oct | Osama + Matloob | **Two separate document trees** — property (EPC, gas, electric, FRA, EICR, HMO licence, lease with landlord, invoices) and tenant (licence agreement, authorisation letter, HB form, UC, ID, photo, deposit). Pick the type from a **dropdown + Other**, never free-type. **Request from the landlord** inside the app. A **checklist** per tenant: what's done, what's missing. Download a session as Word/PDF. |
| 7 Oct (call) | Osama | "**Where are the papers for the landlord? Where are the papers for the property?**" Photos on the property **and on every room**. Apex27 as the template: Media, Documents (with counts), Descriptions, Rooms. |
| 7 Oct 15:24 | Rume | "For every landlord, every tenant, every property there are documents they must upload. Saved to the database, **view it, retrieve it, no lag** — perfect on retrieval, viewing, seeing, uploading, downloading." |
| 7 Oct 15:43 | Rume | Uploaded doc visible but **download didn't work**; no **view** button on hover |
| 7 Oct 19:04 / 23:57 | Rume | Tenant and landlord **photos must save and show**; "proper database management"; photo saved with timestamp yet not reflected |
| 8 Oct | Osama | **Media section just below Landlord** on the property; **media per room**, "I need pictures for every single room" |
| 8 Oct 19:12 | Rume | "You are building a **data storage system**, a **retrieval** way where people upload photos, download photos and see them" |
| 9 Oct | Rume | "A more **robust image adding feel and logic**" |
| 9 Oct 21:37 | Rume | **WhatsApp-style** photo: hover, click to see it, change, remove — "media side, profile side, tenant side, property side" |
| 10 Oct | Rume | **Take photo must open the camera** on every device; "**file sharing, file storage, profile picture link**… rethink from start to finish… from a **manager's perspective**" |

## 2. Principles (from the above)

1. **One file layer, every surface.** Tenant, property, room, landlord and staff photo all use the same storage, the same viewer, the same upload, the same share link. No surface gets a worse version.
2. **Fast to look at.** Every image has a server-held thumbnail; grids never load full-size bytes. Blobs are immutable so the browser caches them for a year (ETag = SHA-256).
3. **Every file is verifiable.** SHA-256 stored at upload, shown in the viewer, served as the ETag. Pairs with the audit chain: "this is the file that was filed on that date".
4. **Shareable without an account.** A manager can hand a document or photo to a landlord, a council officer or a solicitor as a link that expires — and see it was opened, and revoke it. Nobody emails attachments around.
5. **The manager sees the whole estate.** A Files page: how much is stored, by landlord, what is **missing** (required documents not yet filed, per tenant / property / landlord), what arrived recently, which share links are live.
6. **Required lists are explicit and per entity** — dropdown + Other on every upload, and a checklist showing have / missing / expired.
7. **Camera is a camera.** "Take photo" opens the device camera everywhere; the picker is only ever offered as the honest fallback.
8. Nothing in browser storage; server is the truth; a background refresh never blanks a populated grid (H7/H8). Every write goes through `writeWithAudit` (H1).

## 3. Data (migration 057)

- `document_blobs` gains `sha256 TEXT`, `thumb BYTEA` (≤ 320px JPEG, made on the device at upload), `width`, `height`. Backfilled sha256 for existing rows.
- `landlord_documents` — the third tree: `org_id, landlord_id, document_type, blob_id, uploaded_by, expires_on, created_at`.
- `entity_media` gains `is_cover`, `sort_order`.
- `file_shares` — `org_id, blob_id, token_hash UNIQUE, label, expires_at, created_by, created_at, revoked_at, open_count, last_opened_at`.

Required lists (dropdown + Other on every upload; checklist on every panel):

- **Tenant**: Tenancy agreement · Authorisation letter · Initial Risk Assessment · Housing Benefit form · ID · Photo · Proof of Income
- **Property**: Lease with landlord · EPC · Gas Safety Certificate · Electrical (EICR) · Fire Risk Assessment · HMO Licence (+ Invoice, optional). Certificates themselves keep living in the Paperwork matrix.
- **Landlord**: Photo ID · Proof of ownership (Land Registry) · Management agreement · Buildings insurance · Bank details (+ Gas Safety, EPC if they hold them)

## 4. API (one path for everything)

| Route | Purpose |
|---|---|
| `GET /api/files?entity=tenant\|property\|unit\|landlord&id=` | Every file for that thing: photos, documents, with thumb/view/download URLs, SHA-256, who/when, plus the required-document checklist |
| `POST /api/files/upload` (multipart: entity, id, kind=photo\|document, type, caption?, file, thumb?) | The single upload path; files into the right table; audited |
| `PATCH /api/files/item` `{ kind, id, caption?, type?, isCover? }` | Rename/retype, caption, make cover |
| `DELETE /api/files/item?kind=&id=` | Remove (audited) |
| `GET /api/files/[blobId]` (`?download=1`) · `GET /api/files/[blobId]/thumb` | Bytes, org-scoped, `ETag: sha256`, immutable cache, 304 on `If-None-Match` |
| `POST /api/files/share` `{ blobId, days, label? }` → `{ url }` · `GET /api/files/share` · `DELETE /api/files/share?id=` | Expiring share links, opens counted, revocable |
| `GET /api/share/[token]` + page `/share/[token]` | Public: the shared file, inline preview + download, no account |
| `GET /api/files/overview` | Manager view: totals, by landlord, missing required documents across the estate, recent uploads, live shares |

Existing routes (`/api/documents`, `/api/property-documents`, `/api/*/media`, `/api/*/photo`) stay for compatibility; new UI uses the routes above.

## 5. UI

- **FilesPanel** — one component, three modes (photos / documents / both): header with count, Add photos · Take photo · Add document (type dropdown + Other) · Request from landlord (property); required checklist as chips (have ✓ / missing / expired); grid of **FileCards** (thumbnail or type icon, type chip, name, size, who/when); hover → View · Download · Share · Cover · Remove; drag-and-drop, many at once, per-file progress.
- **FileViewer** — portal, full-screen: images (← →, fit), PDFs inline, anything else as a download card; a details rail: type, size, uploaded by/when, SHA-256 (copy), **Share link** (1/7/30 days → copies URL), Download, Make cover, Edit type/caption, Remove.
- **AvatarPhoto** + **CameraCapture** — already built; the viewer, camera and compression are shared with FilesPanel.
- **Files page** (`/files`, managers) — storage used, files by kind, by landlord; **what's missing** (tenants / properties / landlords with required documents not filed); recent uploads; live share links with revoke.
- Property page: cover photo + counts in the header; FilesPanel (photos) directly under Landlord; FilesPanel (documents) with Request from landlord; each room → FilesPanel (photos).
- Tenant page → Documents tab is FilesPanel (documents, tenant list) with the checklist.
- Landlord profile → FilesPanel (documents, landlord list).
