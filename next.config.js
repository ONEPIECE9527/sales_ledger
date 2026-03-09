/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["xlsx", "exceljs", "tesseract.js"],
  },
};

module.exports = nextConfig;
