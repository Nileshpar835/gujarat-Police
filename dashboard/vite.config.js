import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";
import querystring from "querystring";

// Proxy targets (configured for Docker or local dev)
const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:8000";
const streamGatewayTarget = process.env.VITE_STREAM_GATEWAY_PROXY_TARGET || "http://localhost:8888";
const sentinelHost = process.env.SENTINEL_HOST || process.env.VITE_SENTINEL_HOST || "103.250.160.189";
const sentinelCdn = process.env.SENTINEL_CDN || "https://cctv.corp8.cloud";
const sentinelUser = process.env.SENTINEL_USERNAME || process.env.VITE_SENTINEL_USERNAME || "";
const sentinelPass = process.env.SENTINEL_PASSWORD || process.env.VITE_SENTINEL_PASSWORD || "";

// In-memory cache for Sentinel session cookie
let cachedSentinelCookie = "";
let isLoggingIn = false;

function refreshSentinelCookie() {
  if (isLoggingIn || !sentinelUser || !sentinelPass) return;
  isLoggingIn = true;
  const postData = querystring.stringify({ email: sentinelUser, password: sentinelPass });

  const req = https.request(
    `${sentinelCdn.replace(/\/+$/, "")}/auth/login`,
    {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": postData.length,
      },
    },
    (res) => {
      const setCookies = res.headers["set-cookie"] || [];
      const cookie = setCookies.find((c) => c.startsWith("sentinel="));
      if (cookie) {
        cachedSentinelCookie = cookie.split(";")[0];
        console.log("[vite-sentinel] Authenticated session cookie obtained");
      }
      isLoggingIn = false;
    }
  );

  req.on("error", (err) => {
    console.warn("[vite-sentinel] Auth error:", err.message);
    isLoggingIn = false;
  });

  req.write(postData);
  req.end();
}

// Initial session cookie retrieval
refreshSentinelCookie();

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      // Local MediaMTX HLS proxy
      "/hls": {
        target: streamGatewayTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hls/, ""),
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const setCookie = proxyRes.headers["set-cookie"];
            if (setCookie) {
              proxyRes.headers["set-cookie"] = setCookie.map((c) =>
                c.replace(/;\s*Secure/i, "")
              );
            }
            if (proxyRes.headers.location && proxyRes.headers.location.startsWith("/")) {
              proxyRes.headers.location = "/hls" + proxyRes.headers.location;
            }
          });
        },
      },
      // Sentinel WebRTC / WHEP signaling proxy with server-side Basic Auth
      "/sentinel-whep": {
        target: `http://${sentinelHost}:8889`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sentinel-whep/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            if (sentinelUser && sentinelPass) {
              const basicAuth = Buffer.from(`${sentinelUser}:${sentinelPass}`).toString("base64");
              proxyReq.setHeader("Authorization", `Basic ${basicAuth}`);
            }
          });
        },
      },
      // Official Sentinel HLS CDN fallback for dashboards
      "/sentinel-hls": {
        target: sentinelCdn,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sentinel-hls/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader(
              "User-Agent",
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            );
            if (cachedSentinelCookie) {
              proxyReq.setHeader("Cookie", cachedSentinelCookie);
            }
            proxyReq.removeHeader("Authorization");
          });
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.statusCode === 403 || proxyRes.statusCode === 401) {
              refreshSentinelCookie();
            }
          });
        },
      },
      // AES-128 key endpoint used by Sentinel HLS streams
      "/enc.key": {
        target: sentinelCdn,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader(
              "User-Agent",
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            );
            if (cachedSentinelCookie) {
              proxyReq.setHeader("Cookie", cachedSentinelCookie);
            }
            proxyReq.removeHeader("Authorization");
          });
        },
      },
    },
  },
});
