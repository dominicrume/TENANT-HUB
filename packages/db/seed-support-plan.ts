import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "path";

config({ path: path.resolve(process.cwd(), "../../packages/env/.env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) {
    console.error("No org found");
    return;
  }

  const { error } = await supabase.from("form_templates").upsert({
    id: "reliance-support-plan",
    org_id: org.id,
    name: "Reliance Pack: Support Plan",
    key: "reliance-support-plan",
    schema: [],
    created_by: "system",
  }, { onConflict: "id" });

  if (error) {
    console.error("Error seeding support plan template:", error);
  } else {
    console.log("Successfully seeded reliance-support-plan template!");
  }
}

main();
