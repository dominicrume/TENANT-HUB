# Ports Stage (packages/ports)

**1. What comes in?**
Nothing at runtime. These are the interfaces every external connection must satisfy.

**2. What do you do with it?**
Name the verbs the system may perform against the outside world. Binding, paying and serving notices are not among them (H10, H11).

**3. What goes out?**
Typed ports with a declared mode (live | simulated) so every screen can badge provenance (H9).

**4. How do you know the stage is done?**
An adapter can be swapped without changing any agent.
