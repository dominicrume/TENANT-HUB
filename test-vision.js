const fs = require('fs');

const envPath = '.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

async function test() {
  try {
    const res = await fetch("https://api.runcrate.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RUNCRATE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is this?" },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=" } }
            ]
          }
        ]
      })
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
