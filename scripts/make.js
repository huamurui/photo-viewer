import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';
import { findClosestShutterSpeed } from './utils.js';

const dir = './photos';
const thumbsDir = './photos/thumbs';
const mapPath = path.join(dir, 'map.json');
const concurrency = 4;

// 修改处理逻辑后使旧缓存失效，避免沿用未按 EXIF 方向修正的缩略图。
const scriptMtime = (await fs.stat(fileURLToPath(import.meta.url))).mtimeMs;
const files = (await fs.readdir(dir, { withFileTypes: true }))
    .filter(file => file.isFile() && /\.jpg$/i.test(file.name))
    .map(file => file.name)
    .sort();

await fs.mkdir(thumbsDir, { recursive: true });

let previousMap = [];
try {
    previousMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
    if (!Array.isArray(previousMap)) throw new Error('map.json 必须是数组');
} catch (error) {
    // 已有清单无法读取时停止，避免用不完整的数据覆盖它。
    if (error.code !== 'ENOENT') throw error;
}
const previousByName = new Map(previousMap.map(photo => [photo.name, photo]));
const counts = { generated: 0, cached: 0, failed: 0, preserved: 0 };

function formatExif(exif = {}) {
    let date = '-';
    if (exif.DateTimeOriginal) {
        const value = new Date(exif.DateTimeOriginal);
        if (Number.isFinite(value.getTime())) {
            date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
        }
    }
    const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
    return {
        Date: date,
        Focal: positive(exif.FocalLength) ? `${exif.FocalLength}mm` : '-',
        FNumber: positive(exif.FNumber) ? exif.FNumber : '-',
        ISO: positive(exif.ISO) ? exif.ISO : '-',
        ExposureTime: positive(exif.ExposureTime) ? findClosestShutterSpeed(exif.ExposureTime) : '-'
    };
}

async function processPhoto(file, index) {
    const filePath = path.join(dir, file);
    const thumbPath = path.join(thumbsDir, file);
    const temporaryThumb = path.join(thumbsDir, `.${file}.${process.pid}.${index}.tmp.jpg`);

    try {
        const [sourceStat, metadata, exif] = await Promise.all([
            fs.stat(filePath),
            sharp(filePath).metadata(),
            exifr.parse(filePath)
        ]);
        // EXIF 5–8 会交换显示宽高；缩略图的 rotate() 同时处理旋转和镜像。
        const swapsDimensions = metadata.orientation >= 5 && metadata.orientation <= 8;
        const width = swapsDimensions ? metadata.height : metadata.width;
        const height = swapsDimensions ? metadata.width : metadata.height;
        if (!(width > 0 && height > 0)) throw new Error('无法读取有效的图片尺寸');

        let thumbInfo;
        let cached = false;
        try {
            const thumbStat = await fs.stat(thumbPath);
            if (thumbStat.mtimeMs >= Math.max(sourceStat.mtimeMs, scriptMtime)) {
                thumbInfo = await sharp(thumbPath).metadata();
                cached = thumbInfo.width === 500 && thumbInfo.height > 0;
            }
        } catch (error) {
            // 缓存缺失或损坏时重新生成；写入失败会由外层保留旧清单项。
            if (error.code !== 'ENOENT') console.warn(`重新生成缩略图 ${file}: ${error.message}`);
        }

        const photo = {
            name: file,
            url: `${dir}/${file}`,
            thumb_url: `${thumbsDir}/${file}`,
            exif: formatExif(exif ?? {}),
            width,
            height,
            thumb_width: 0,
            thumb_height: 0
        };

        if (!cached) {
            thumbInfo = await sharp(filePath)
                .rotate()
                .resize(500)
                .toFile(temporaryThumb);
            // 先完整写入临时文件，成功后才替换现有缩略图。
            await fs.rename(temporaryThumb, thumbPath);
        }
        photo.thumb_width = thumbInfo.width;
        photo.thumb_height = thumbInfo.height;
        counts[cached ? 'cached' : 'generated']++;
        return photo;
    } catch (error) {
        counts.failed++;
        console.error(`处理图片失败 ${file}: ${error.message}`);
        const previous = previousByName.get(file);
        if (previous) counts.preserved++;
        return previous ?? null;
    } finally {
        await fs.rm(temporaryThumb, { force: true }).catch(() => {});
    }
}

// 固定数量的 worker 保持输出顺序，同时限制解码和缩略图生成的内存占用。
const results = new Array(files.length);
let nextIndex = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (nextIndex < files.length) {
        const index = nextIndex++;
        results[index] = await processPhoto(files[index], index);
    }
}));

const map = results.filter(Boolean);
if (counts.failed === files.length && counts.failed > 0) {
    console.error('所有图片处理失败，已有 map.json 保持不变。');
} else {
    const temporaryMap = `${mapPath}.${process.pid}.tmp`;
    try {
        await fs.writeFile(temporaryMap, JSON.stringify(map, null, 2));
        await fs.rename(temporaryMap, mapPath);
    } finally {
        await fs.rm(temporaryMap, { force: true }).catch(() => {});
    }
}

console.log(`图片处理完成：生成 ${counts.generated}，复用 ${counts.cached}，失败 ${counts.failed}（保留旧记录 ${counts.preserved}）。`);
if (counts.failed > 0) process.exitCode = 1;
