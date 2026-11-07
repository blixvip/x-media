import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: { '*': ['./.data/**/*', './artifacts/**/*', './test-results/**/*'] },
};

export default nextConfig;
