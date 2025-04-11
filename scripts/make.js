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


// 获取 dir 下所有文件的文件名及照片信息，存入 map.json
const map = await Promise.all(files
    .filter(file => (file.endsWith('.jpg')||file.endsWith('.JPG')) )
    .map(async file => {
        let photo = {
            name: file,
            url: dir + '/' + file,
            thumb_url: thumbsDir + '/' + file,
            exif: {}
        };
        sharp(path.join(dir, file))
            .resize(500)
            .toFile(path.join(thumbsDir, file), (err, info) => {
                if (err) {
                    console.error(err);
                } else {
                    console.log(info);
                }
            });

        try {
            const exif = await getExif(path.join(dir, file));
            console.log(exif);
            photo.exif = {
                Date: exif.DateTimeOriginal.split(' ')[0].replace(/:/g, '-'),
                Focal: `${exif.FocalLength || '-'}mm`,
                // Focal: `${exif.FocalLength || '-'} mm ( 35mm film equivalent: ${exif.FocalLengthIn35mmFilm || '-'} mm )`,
                FNumber: exif.FNumber || '-',
                ISO: exif.ISO || '-',
                // ExposureTime: `${exif.ExposureTime ||'-'} s`
                // 将小数转为分数，尽量整除...也要处理无限循环小数的情况
                ExposureTime: (() => {
                    const value = exif.ExposureTime || '-';
                    return findClosestShutterSpeed(value);
                })()
            }
        } catch (err) {
            console.error(err);
        }

        return photo;
    })
);
fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(map, null, 2));

// ...其实还可以考虑存一份压缩小图，不然加载要等所有原图加载完才出列表有点那啥了...


