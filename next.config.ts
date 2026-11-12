import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El panel vive en /studio; la raíz redirige allí.
  async redirects() {
    return [{ source: "/", destination: "/studio", permanent: false }];
  },
};

export default nextConfig;
