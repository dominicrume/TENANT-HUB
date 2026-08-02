# Intake Core Stage (packages/intake-core)

**1. What comes in?**
Raw unverified user requests, file uploads, and unstructured data for the intake pipeline.

**2. What do you do with it?**
Orchestrate the multi-step intake flow using a defined state machine (XState), coordinating with the AI package for data extraction and Validation for integrity.

**3. What goes out?**
A perfectly formed, fully validated draft intake object ready to be persisted to the database.

**4. How do you know the stage is done?**
The state machine reaches its final `complete` state, all required fields have been successfully extracted and validated, and no steps were bypassed.
