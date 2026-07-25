import fs from 'fs';
import path from 'path';
import exifr from 'exifr'; // <-- 引入新的 exifr 库
import sharp from 'sharp';
import { findClosestShutterSpeed } from './utils.js';

const dir = "./photos";
const thumbsDir = "./photos/thumbs";
const files = fs.readdirSync(dir);

if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir);
}

// 获取图片尺寸信息
const getImageDimensions = async (filePath) => {
    try {
        const metadata = await sharp(filePath).metadata();
        return {
            width: metadata.width,
            height: metadata.height
        };
    } catch (err) {
        console.error(`获取图片尺寸失败 ${filePath}:`, err);
        return { width: 0, height: 0 };
    }
};

const map = await Promise.all(files
    .filter(file => (file.endsWith('.jpg') || file.endsWith('.JPG')))
    .map(async file => {
        const filePath = path.join(dir, file);
        let photo = {
            name: file,
            url: dir + '/' + file,
            thumb_url: thumbsDir + '/' + file,
            exif: {},
            width: 0,
            height: 0,
            thumb_width: 0,
            thumb_height: 0
        };

        try {
            // 获取原图尺寸
            const dimensions = await getImageDimensions(filePath);
            photo.width = dimensions.width;
            photo.height = dimensions.height;

            // 生成缩略图并获取尺寸
            const thumbInfo = await sharp(filePath)
                .resize(500)
                .toFile(path.join(thumbsDir, file));
            
            photo.thumb_width = thumbInfo.width;
            photo.thumb_height = thumbInfo.height;

            // 使用 exifr 获取并处理EXIF信息 (不会像旧库那样崩溃)
            const exif = await exifr.parse(filePath);
            
            // 【满足你的要求】在这里打印该图片的全部 EXIF 解析信息！
            console.log(`\n========= ${file} 的全部 EXIF 信息 =========`);
            console.log(exif);
            console.log(`================================================`);

            if (exif) {
                // exifr 默认把日期解析为 Date 对象，我们把它格式化为 YYYY-MM-DD
                let formattedDate = '-';
                if (exif.DateTimeOriginal) {
                    const d = new Date(exif.DateTimeOriginal);
                    formattedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }

                photo.exif = {
                    Date: formattedDate,
                    Focal: `${exif.FocalLength || '-'}mm`,
                    FNumber: exif.FNumber || '-',
                    ISO: exif.ISO || '-',
                    ExposureTime: exif.ExposureTime ? findClosestShutterSpeed(exif.ExposureTime) : '-'
                };
            }
        } catch (err) {
            console.error(`处理图片失败 ${file}:`, err);
        }

        return photo;
    })
);

fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));
console.log('图片处理完成，已生成map.json');