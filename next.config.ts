import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (process.env.NODE_ENV === "development") {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: "@dyad-sh/nextjs-webpack-component-tagger",
      });
    }
    
    // Externalize server-only modules from client bundle
    if (!isServer) {
      const stubPath = path.resolve(__dirname, "src/lib/stubs/empty.js");
      
      config.resolve.alias = {
        ...config.resolve.alias,
        'bcrypt': stubPath,
        'mongoose': stubPath,
        'mongodb-memory-server': stubPath,
        '@mapbox/node-pre-gyp': stubPath,
      };
      
      // Ignore all node: prefixed imports in client bundle
      const webpack = require("webpack");
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:/,
        })
      );
      
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: stubPath,
        fs: stubPath,
        net: stubPath,
        tls: stubPath,
        dns: stubPath,
        child_process: stubPath,
        path: stubPath,
        os: stubPath,
        stream: stubPath,
        buffer: stubPath,
        util: stubPath,
        url: stubPath,
        querystring: stubPath,
      };
    }
    
    // Exclude problematic node-pre-gyp HTML file completely
    config.module.noParse = config.module.noParse || [];
    config.module.noParse.push(/node-pre-gyp/);
    
    return config;
  },
  
  // Prevent server-only packages from being bundled for client
  serverExternalPackages: ['bcrypt', 'mongoose', 'mongodb-memory-server', '@mapbox/node-pre-gyp'],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;