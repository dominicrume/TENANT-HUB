import { writeWithAudit } from "./packages/db/src/write-with-audit";
async function main() {
    const org_id = "9c8618c4-0113-4a15-9686-029f5dfb18c8";
    const user_id = "ce3de13f-1dd0-499e-8b0b-3c5a9c269584";
    const { data: tenant } = await writeWithAudit({
        table: "tenants",
        record: {
            full_name: "Test Tenant DB Script",
            org_id: org_id,
            created_by: user_id,
            brand: "tenant_hub",
            entry_method: "manual"
        },
        action: "CREATE",
        user_id: user_id,
        user_name: "Test",
        user_role: "manager"
    });
    console.log("Tenant inserted:", tenant);
}
main().catch(console.error);
