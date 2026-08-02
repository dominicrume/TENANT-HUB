# Web App Stage (apps/web)

**1. What comes in?**
User traffic, client-side interactions, and HTTP requests.

**2. What do you do with it?**
Compose the application views using Next.js, securely proxying requests to the backend logic (packages) and rendering the UI layer.

**3. What goes out?**
Rendered HTML, JSON API responses, and client-side JavaScript bundles.

**4. How do you know the stage is done?**
The application builds successfully, pages render without layout shifts, all client interactions result in expected API calls, and the frontend remains entirely decoupled from direct database or business logic execution.
