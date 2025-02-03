// 将 ./photos 目录下的文件生成压缩后的图片到 ./thumbs 目录下

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const dir = "./photos";
const files = fs.readdirSync(dir);

const thumbsDir = "./thumbs";

if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir);
}

files.forEach(file => {
    sharp(path.join(dir, file))
        .resize(500)
        .toFile(path.join(thumbsDir, file), (err, info) => {
            if (err) {
                console.error(err);
            } else {
                console.log(info);
            }
        });
});

// 以上代码使用了 sharp 库，这是一个图片处理库，可以用来生成缩略图。这里我们将 ./photos 目录下的所有图片生成缩略图到 ./thumbs 目录下。