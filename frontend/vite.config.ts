import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const PROXIED = ["/api", "/auth", "/hooks", "/healthz"];

/**
 * Le serveur Python doit voir l'adresse que le navigateur a réellement appelée (en-tête Host) :
 * en développement, il en déduit l'adresse de retour donnée à GitLab pour la connexion.
 */
const toBackend: ProxyOptions = {
  target: backend,
  changeOrigin: false,
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq, req) => {
      if (req.headers.host) proxyReq.setHeader("host", req.headers.host);
    });
  },
};

/**
 * `npm run dev:mock` : sert des données d'exemple à la place du serveur Python,
 * pour travailler sur l'interface sans rien lancer d'autre.
 */
function mockApi(): Plugin {
  return {
    name: "mock-api",
    async configureServer(server) {
      const { buildMock, buildIssueDetail } = await import("./dev-mock/data.mjs");
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const json = (body: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        const empty = process.env.MOCK === "vide";
        if (url === "/api/me") return json(buildMock({ empty }).me);
        if (url === "/api/snapshot") return json(buildMock({ empty }).snapshot);
        const detail = url.match(/^\/api\/issues\/(\d+)$/);
        if (detail) {
          const issue = buildIssueDetail(Number(detail[1]));
          return issue ? json(issue) : json({ detail: "Tâche introuvable" }, 404);
        }
        if (url === "/api/stream") {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.write(`data: ${JSON.stringify({ type: "hello", version: 1, activity: [] })}\n\n`);
          const ping = setInterval(() => res.write(": ping\n\n"), 15000);
          req.on("close", () => clearInterval(ping));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.MOCK ? [mockApi()] : [])],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: process.env.MOCK ? undefined : Object.fromEntries(PROXIED.map((path) => [path, toBackend])),
  },
});
