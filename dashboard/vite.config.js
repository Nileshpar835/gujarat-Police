import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Allows the proxy target to be overridden inside Docker (where the backend
// is reachable as "backend", not "localhost").
const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:8000";
const streamGatewayTarget = process.env.VITE_STREAM_GATEWAY_PROXY_TARGET || "http://localhost:8888";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // avoids CORS friction during local dev; production should hit the
      // API gateway directly per the HLD security architecture.
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      // Proxies the Stream Gateway's HLS output. MediaMTX (since v1.18) sets
      // a session cookie with the `Secure` attribute on its HLS responses,
      // which browsers refuse to store/send over plain HTTP — only HTTPS.
      // Real deployments serve everything over TLS anyway (HLD Section 13),
      // but for local HTTP dev we strip the Secure flag here so the cookie
      // round-trip actually works without standing up certificates.
      "/hls": {
        target: streamGatewayTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hls/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const setCookie = proxyRes.headers["set-cookie"];
            if (setCookie) {
              proxyRes.headers["set-cookie"] = setCookie.map((c) =>
                c.replace(/;\s*Secure/i, "")
              );
            }
            // MediaMTX's redirect Location is an absolute path with no
            // knowledge of the /hls mount prefix we're proxying under —
            // without rewriting it, the browser's follow-up request escapes
            // the proxy and 404s.
            if (proxyRes.headers.location && proxyRes.headers.location.startsWith("/")) {
              proxyRes.headers.location = "/hls" + proxyRes.headers.location;
            }
          });
        },
      },
    },
  },
});
