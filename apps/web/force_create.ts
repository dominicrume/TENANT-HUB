import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rkxpuymuhwgunumndlqc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJreHB1eW11aHdndW51bW5kbHFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ3NzA2MSwiZXhwIjoyMDk2MDUzMDYxfQ.0j-3rwqRrMND7TO3Uls1S-2Hf8QNss1RonpuD5Sagz8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function forceCreateUser() {
  console.log("Creating dominicrume@gmail.com...");
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'dominicrume@gmail.com',
    password: 'TenantHub2026!',
    user_metadata: { full_name: 'Orume Dominic Uririe', role: 'manager' },
    email_confirm: true // This auto-confirms them immediately without sending an email!
  });
  console.log("Created:", data);
  if (error) console.error("Error:", error);
}
forceCreateUser();
