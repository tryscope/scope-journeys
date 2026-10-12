import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pages are markdown files read at request time; the deployed functions must carry them.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
};

export default nextConfig;
