import { adminClient } from "./client";

async function main() {
  const { data, error } = await adminClient.from("drafts").select("*").limit(5);
  if (error) {
    console.error("Error fetching drafts:", error);
    return;
  }
  console.log("Drafts in DB:", JSON.stringify(data, null, 2));
}

main();
