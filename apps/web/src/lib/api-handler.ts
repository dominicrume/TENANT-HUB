import { NextResponse } from "next/server";
import { can, type Resource, type Action } from "@tenant-hub/auth";
import { getApiAuth, type ApiAuth } from "./api-auth";
import { ratelimit } from "./rate-limit";

type RouteHandler = (
  req: Request,
  context: any,
  auth: ApiAuth
) => Promise<NextResponse>;

export interface RouteConfig {
  resource: Resource;
  action: Action;
  rateLimit?: boolean;
}

export function withRouteHandler(config: RouteConfig, handler: RouteHandler) {
  return async (req: Request, context: any) => {
    try {
      if (config.rateLimit) {
        const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
        const { success } = await ratelimit.limit(ip);
        if (!success) {
          return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }
      }

      const auth = await getApiAuth();
      if (!auth) {
        return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
      }

      if (!can(auth.actor.user_role, config.resource, config.action)) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }

      return await handler(req, context, auth);
    } catch (err) {
      console.error("[API Error]", err);
      const message = err instanceof Error ? err.message : "Internal Server Error";
      // Don't leak full DB errors to client
      const safeMessage = message.includes("duplicate key") ? "Resource already exists" : message;
      return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
  };
}
