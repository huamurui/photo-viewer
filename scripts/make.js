import fs from 'fs';
import path from 'path';
import EXIF from 'exif';
import sharp from 'sharp';
import { findClosestShutterSpeed } from './utils.js';

const dir = "./photos";
const thumbsDir = "./photos/thumbs";
const files = fs.readdirSync(dir);

if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir);
}

const getExif = async (file) => {
    return new Promise((resolve, reject) => {
        new EXIF({ image: file }, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data.exif);
            }
        });
    });
};

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

// 获取 dir 下所有文件的文件名及照片信息，存入 map.json
const map = await Promise.all(files
    .filter(file => (file.endsWith('.jpg') || file.endsWith('.JPG')))
    .map(async file => {
        const filePath = path.join(dir, file);
        let photo = {
            name: file,
            url: dir + '/' + file,
            thumb_url: thumbsDir + '/' + file,
            exif: {},
            // 预留宽高字段
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

            // 生成缩略图并获取缩略图尺寸
            const thumbInfo = await sharp(filePath)
                .resize(500)
                .toFile(path.join(thumbsDir, file));
            
            // 保存缩略图尺寸
            photo.thumb_width = thumbInfo.width;
            photo.thumb_height = thumbInfo.height;

            // 获取并处理EXIF信息
            const exif = await getExif(filePath);
            photo.exif = {
                Date: exif?.DateTimeOriginal ? exif.DateTimeOriginal.split(' ')[0].replace(/:/g, '-') : '-',
                Focal: `${exif?.FocalLength || '-'}mm`,
                FNumber: exif?.FNumber || '-',
                ISO: exif?.ISO || '-',
                ExposureTime: exif?.ExposureTime ? findClosestShutterSpeed(exif.ExposureTime) : '-'
            };
        } catch (err) {
            console.error(`处理图片失败 ${file}:`, err);
        }

        return photo;
    })
);

fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));
console.log('图片处理完成，已生成map.json');
