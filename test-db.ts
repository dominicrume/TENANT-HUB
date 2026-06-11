import { adminClient } from "./packages/db/src/client";

async function main() {
  const { data: profiles } = await adminClient.from("profiles").select("*");
  console.log("Profiles:");
  console.log(profiles);

  const { data: tenants } = await adminClient.from("tenants").select("id, org_id, full_name").limit(10);
  console.log("Tenants:");
  console.log(tenants);
}

main().catch(console.error);
