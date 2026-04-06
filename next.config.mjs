/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — required for Capacitor (Android/iOS) packaging.
  // This is safe for this app because all data fetching is client-side
  // (Supabase + OpenAI are called from the browser, no SSR routes).
  output: "export",
  distDir: "dist",

  images: {
    // next/image optimisation requires a server; disable for static export.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zebmqkgyomrkfrvoeszt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
