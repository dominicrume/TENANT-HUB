# Adapters Stage (packages/adapters)

**1. What comes in?**
A port to satisfy and, when credentials exist, the outside service to call.

**2. What do you do with it?**
Implement each port twice: live (real service) and simulated (deterministic, badged). A live adapter without credentials fails loudly; it never silently simulates.

**3. What goes out?**
AdapterResult values carrying data, mode, source and time, so the receipt and the screen can say where it came from (H9).

**4. How do you know the stage is done?**
Swapping an adapter changes no agent; nothing simulated can be shown as real.
