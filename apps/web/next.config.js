/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `output: "standalone"` yet — Phase 5 will add a Dockerfile that
  // sets this when the web app gets its own deploy target.
}

module.exports = nextConfig
