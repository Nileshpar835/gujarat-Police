import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";
import querystring from "querystring";

// Allows the proxy target to be overridden inside Docker (where the backend
// is reachable as "backend", not "localhost").
const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET || "http://localhost:8000";
const streamGatewayTarget = process.env.VITE_STREAM_GATEWAY_PROXY_TARGET || "http://localhost:8888";
const sentinelCdn = process.env.VITE_SENTINEL_CDN || "https://cctv.corp8.cloud";
const sentinelUser = process.env.VITE_SENTINEL_USERNAME || "";
const sentinelPass = process.env.VITE_SENTINEL_PASSWORD || "";

// Cache for Sentinel session cookie
let cachedSentinelCookie = "sentinel=eyJ1aWQiOiI2OTgxZjA0MTNhYjJjZDNkIiwic2lkIjoiMGU1NDRhZThiMGQ2OGFmODFlIn0.PFlQDEGrmShcfuCrKiR9poxLLAN2sJDR4Eb2rFS2FAw";
let isLoggingIn = false;

function refreshSentinelCookie() {
  if (isLoggingIn) return;
  isLoggingIn = true;
  const email = sentinelUser || "nileshpar835@gmail.com";
  const password = sentinelPass || "NYA4-3ND8-4PGV";
  const data = querystring.stringify({ email, password });

  const req = https.request("https://cctv.corp8.cloud/auth/login", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": data.length,
    },
  }, (res) => {
    const setCookies = res.headers["set-cookie"] || [];
    const cookie = setCookies.find((c) => c.startsWith("sentinel="));
    if (cookie) {
      cachedSentinelCookie = cookie.split(";")[0];
      console.log("[vite-sentinel] Successfully authenticated with Sentinel CDN");
    }
    isLoggingIn = false;
  });
  req.on("error", (err) => {
    console.warn("[vite-sentinel] Auth error:", err.message);
    isLoggingIn = false;
  });
  req.write(data);
  req.end();
}

// Initial login attempt
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
      // Official Sentinel HLS CDN for dashboards: https://cctv.corp8.cloud/<id>/index.m3u8
      "/sentinel-hls": {
        target: sentinelCdn,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sentinel-hls/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
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
            proxyReq.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
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
