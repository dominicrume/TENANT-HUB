# AI Stage (packages/ai)

**1. What comes in?**
User prompts, raw documents, and images (OCR).

**2. What do you do with it?**
Route the request to the correct LLM provider (e.g., OpenAI, DeepSeek), extract structured information, evaluate risk flags, and critically: **execute actions under the KYA (Know Your AgenticAi) Loop**. 

**3. What goes out?**
Structured JSON data conforming to strict Zod schemas, ready for domain processing. Immutable audit trails mapping the AI's exact input to its output for cryptographic stamping.

**4. How do you know the stage is done?**
The AI returns predictably parsed data without hallucinations, routes via the defined provider fallback chain, successfully parses flat images into text, and crucially: **every AI mutation is mathematically provable, auditable, and accountable via the ledger before human intervention.**
