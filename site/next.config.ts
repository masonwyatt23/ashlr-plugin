import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["react-bits", "framer-motion", "lucide-react"],
  },

};

// fumadocs-mdx generates .source/ but doesn't register a webpack alias for
// @/.source. Wrap the final config to inject the alias after withMDX runs.
function withSourceAlias(config: NextConfig): NextConfig {
  const upstream = config.webpack;
  return {
    ...config,
    webpack(webpackConfig, options) {
      const base = upstream ? upstream(webpackConfig, options) : webpackConfig;
      base.resolve ??= {};
      base.resolve.alias ??= {};
      const aliases = base.resolve.alias as Record<string, string>;

      // fumadocs-mdx generates .source/ but doesn't register a webpack alias.
      aliases["@/.source"] = path.resolve(__dirname, ".source");

      return base;
    },
  };
}

const sentryOptions = {
  // Only upload source maps when DSN is configured (production builds).
  silent: true,
  // Avoid blocking CI builds if Sentry upload fails.
  dryRun: !process.env["NEXT_PUBLIC_SENTRY_DSN"],
};

export default withSentryConfig(withSourceAlias(withMDX(nextConfig)), sentryOptions);
