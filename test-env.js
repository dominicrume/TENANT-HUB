const fs = require('fs');
const envPath = '.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (value.includes('#')) {
      value = value.split('#')[0].trim();
    }
    env[key] = value.trim();
  }
});
console.log("Key starts with:", env.RUNCRATE_API_KEY ? env.RUNCRATE_API_KEY.slice(0, 10) : "missing");
