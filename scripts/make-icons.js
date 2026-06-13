// Generate toolbar icons from the Frendz logo mark.
// Run: node scripts/make-icons.js   (requires `npm install sharp` at repo root)
const sharp = require("sharp");
const dir = "extension/images/";

(async () => {
  // 1) Crop the smiley/owl mark from the left of the wordmark.
  const strip = await sharp(dir + "logo-el-nido.png")
    .extract({ left: 0, top: 0, width: 60, height: 52 })
    .toBuffer();

  // 2) Recolor the (black-on-transparent) mark to white, preserving its shape.
  const { data, info } = await sharp(strip).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; }
  const whiteMark = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();

  // 3) Compose onto a rounded Frendz-red tile at each required size.
  for (const size of [16, 32, 48, 128]) {
    const r = Math.round(size * 0.22);
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
    );
    const inner = Math.round(size * 0.7);
    const mark = await sharp(whiteMark)
      .resize({ width: inner, height: inner, fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    await sharp({ create: { width: size, height: size, channels: 4, background: "#e44a3c" } })
      .composite([
        { input: roundMask, blend: "dest-in" }, // round the corners
        { input: mark, gravity: "center" },     // white mark on top
      ])
      .png()
      .toFile(dir + `icon-${size}.png`);
  }
  console.log("icons written: icon-16/32/48/128.png");
})();
