import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    env: process.env.NODE_ENV,
    app: "tenant-hub",
    service: process.env.RAILWAY_SERVICE_NAME || "web",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || "dev",
  },
});
