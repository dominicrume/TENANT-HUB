const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://rkxpuymuhwgunumndlqc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJreHB1eW11aHdndW51bW5kbHFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ3NzA2MSwiZXhwIjoyMDk2MDUzMDYxfQ.0j-3rwqRrMND7TO3Uls1S-2Hf8QNss1RonpuD5Sagz8');

async function fixUser() {
  const email = 'Matty2411@gmail.com';
  console.log('Finding user...', email);
  
  const { data: users, error: findErr } = await supabase.auth.admin.listUsers();
  if (findErr) {
    console.error('List error:', findErr);
    return;
  }
  
  const user = users.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    console.log('User not found. Creating...');
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Matloob',
        role: 'manager',
        brand: 'mattys_place'
      }
    });
    if (createErr) console.error('Create error:', createErr);
    else console.log('Created user:', created.user.id);
  } else {
    console.log('User found! Forcing password reset and email confirmation...');
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
      user.id,
      { 
        password: 'Password123!',
        email_confirm: true 
      }
    );
    if (updateErr) console.error('Update error:', updateErr);
    else console.log('Successfully reset password for:', user.id);
  }
}

fixUser();
