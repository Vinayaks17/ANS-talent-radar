import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Resume uploads go through a Server Action (Vercel caps request bodies at 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // pdf.js inside unpdf must not be bundled into the server build.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
