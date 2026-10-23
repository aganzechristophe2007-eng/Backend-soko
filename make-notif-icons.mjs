// Génère les deux icônes de notification à partir de public/Favicon.png
// Usage (à la racine du frontend) :  npm i -D sharp   puis   node make-notif-icons.mjs
import sharp from 'sharp';

const SRC = 'public/Favicon.png';

// 1. Grande image : carrée, légère
await sharp(SRC)
  .flatten({ background: '#FFFFFF' })
  .resize(192, 192, { fit: 'contain', background: '#FFFFFF' })
  .png({ compressionLevel: 9, palette: true })
  .toFile('public/notif-icon-192.png');

// 2. Petite icône : silhouette blanche sur fond transparent (Android ne garde que la forme).
//    Les pixels foncés ou colorés du logo deviennent opaques ; le blanc devient transparent.
const SIZE = 96;
const { data } = await sharp(SRC)
  .flatten({ background: '#FFFFFF' })
  .resize(SIZE, SIZE, { fit: 'contain', background: '#FFFFFF' })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  const alpha = Math.max(0, Math.min(255, (255 - data[i]) * 1.6)); // renforce les contours
  rgba[i * 4] = 255;
  rgba[i * 4 + 1] = 255;
  rgba[i * 4 + 2] = 255;
  rgba[i * 4 + 3] = alpha;
}
await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile('public/notif-badge-96.png');

console.log('OK : public/notif-icon-192.png et public/notif-badge-96.png créés');
