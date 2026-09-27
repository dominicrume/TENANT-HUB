import { defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const postgresVolume5H9e = volume("postgres-volume-5H9e", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const worker = service("worker", {
    replicas: { "sfo": 1 },
    env: { DATABASE_URL: preserve(), LOG_LEVEL: preserve(), NIXPACKS_START_CMD: preserve(), NODE_ENV: preserve(), SKIP_ENV_VALIDATION: preserve() },
  });

  return project("tenant-hub", {
    resources: [Postgres, worker, postgresVolume5H9e, postgresVolume],
  });
});
