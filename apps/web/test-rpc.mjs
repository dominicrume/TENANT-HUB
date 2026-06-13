import { createClient } from '@supabase/supabase-js';
const supabase = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTEyMjMyMjh9.dummy');
async function run() {
  const { data, error } = await supabase.rpc('write_with_audit', { p_table: 'tenants', p_record: { full_name: 'test', org_id: '00000000-0000-0000-0000-000000000000' }, p_audit: {} });
  console.log("DATA:", data);
  console.log("ERROR:", error);
}
run();
