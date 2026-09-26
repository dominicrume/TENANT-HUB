# Telemetry Stage (packages/telemetry)

**1. What comes in?**
Agent runs and structured log events.

**2. What do you do with it?**
Wrap each run in a span that records start, end, duration, errors and health through an injected sink. Emit one-line JSON logs.

**3. What goes out?**
Events the console reads (agent_telemetry, agent_health) and logs the host collects. No database import: the sink is injected from packages/db.

**4. How do you know the stage is done?**
No agent works silently: every run is a span and every failure marks health.
