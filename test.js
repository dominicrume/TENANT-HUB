import { createClient } from '@supabase/supabase-js'

const supabase = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTEyMjMyMjh9.dummy')

// Just connect to check the error message for PGRST116
async function run() {
  console.log("Checking...")
}
run()
