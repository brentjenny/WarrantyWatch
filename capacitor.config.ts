import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.brent.warrantyvault",
  appName: "WarrantyVault",
  webDir: "dist",
  server: {
    // Use HTTPS scheme on Android (required for secure cookies / Supabase auth).
    androidScheme: "https",
  },
};

export default config;
