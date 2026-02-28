import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 ist ein natives Modul — nicht bundeln
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
