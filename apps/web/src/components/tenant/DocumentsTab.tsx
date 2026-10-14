"use client";

import { FilesPanel } from "../files/FilesPanel";

/**
 * Tenant → Documents: the tenant's own tree (tenancy agreement,
 * authorisation letter, risk assessment, HB form, ID, photo, proof of
 * income — dropdown + Other) with the required checklist, on the shared
 * file layer (docs/FILES_SPEC.md). Property documents never mix in here.
 */
export function DocumentsTab({ tenantId }: { tenantId: string }) {
  return (
    <div style={{ marginTop: 20 }}>
      <FilesPanel entity="tenant" id={tenantId} mode="documents" title="Documents" />
      <p className="muted" style={{ fontSize: 12.5, margin: "-8px 0 0" }}>
        Everything personal to this person. Open any file to download it, share it as an expiring link, or check its fingerprint against the audit trail.
      </p>
    </div>
  );
}
