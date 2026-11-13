const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const outDir = path.resolve(__dirname, "../public/icons");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function createSvg(size, maskable = false) {
  const padding = maskable ? size * 0.15 : size * 0.08;
  const innerSize = size - padding * 2;
  const radius = innerSize * 0.22;
  const fontSize = Math.round(innerSize * 0.58);

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <!-- Background -->
    <rect width="${size}" height="${size}" fill="#0E0A14" />
    
    <!-- Accent Container -->
    <rect
      x="${padding}"
      y="${padding}"
      width="${innerSize}"
      height="${innerSize}"
      rx="${radius}"
      fill="#C4A7FF"
    />

    <!-- Brand Typography 'T' -->
    <text
      x="${size / 2}"
      y="${size / 2 + fontSize * 0.35}"
      font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      font-size="${fontSize}px"
      font-weight="800"
      fill="#120A20"
      text-anchor="middle"
    >T</text>
  </svg>
  `;
}

async function generate() {
  const targets = [
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-maskable-512.png", size: 512, maskable: true },
    { name: "apple-touch-icon.png", size: 180, maskable: false },
  ];

  for (const t of targets) {
    const svg = Buffer.from(createSvg(t.size, t.maskable));
    await sharp(svg)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outDir, t.name));
    console.log(`Generated ${t.name} (${t.size}x${t.size})`);
  }
}

generate().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});

