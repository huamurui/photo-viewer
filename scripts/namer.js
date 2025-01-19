import fs from 'fs';
import path from 'path';


const dir = "./photos";
const files = fs.readdirSync(dir);

// 获取 dir 下所有文件的文件名字并存入  names.json
const names = files.map(file => {
    return {
        name: file,
    }
}).filter(file => file.name !== 'names.json');
fs.writeFileSync(path.join('', 'names.json'), JSON.stringify(names, null, 2));

// ...其实还可以考虑存一份压缩小图，不然加载要等所有原图加载完才出列表有点那啥了...