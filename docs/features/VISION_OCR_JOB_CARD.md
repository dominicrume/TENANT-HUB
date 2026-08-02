# Vision OCR Parsing Job Card

**1. What comes in?**
An authenticated HTTP POST request to `/api/intake/ocr` containing a JSON payload with an optional `text` string and/or an `image` (base64 Data URL) string.

**2. What do you do with it?**
- Verify the active AI provider is configured and available.
- Transform the incoming base64 image and prompt into the Vercel AI SDK unified format (`{ type: "image", image: data }`).
- Call the configured LLM (e.g. GPT-4o, Claude 3.5 Sonnet) requesting structured JSON extraction of tenant schema fields.
- Parse the resulting string output strictly as JSON.

**3. What goes out?**
- On success: A JSON object containing `extracted` (the structured tenant fields) and `confidence` (a map of field keys to confidence levels).
- On failure: Appropriate error messages and fallback empty extractions (`{ extracted: {}, confidence: {} }`) so the UI degrades gracefully to manual entry.

**4. How do you know the stage is done?**
The frontend can pass a photographed image of a tenant intake form to the backend, the backend forwards it natively to the multimodal LLM, and the UI correctly populates the parsed JSON data into the form fields without breaking.
