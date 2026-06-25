import type { NextConfig } from "next";
import { NEXT_IMAGE_HOSTNAMES } from "./src/lib/next-image-hostnames";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: NEXT_IMAGE_HOSTNAMES.map((hostname) => ({
      protocol: "https",
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
