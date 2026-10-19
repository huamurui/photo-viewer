# Photos of HMR

一个原生 JavaScript 照片墙，无前端框架、无需构建，可直接部署到 GitHub Pages 等静态托管。

## 添加照片

将扩展名为 `.jpg` 或 `.JPG` 的照片放入 `photos/`，然后运行：

```sh
npm install
npm run make
```

脚本会生成 `photos/thumbs/` 中的缩略图和 `photos/map.json` 照片清单，读取拍摄参数并自动修正 EXIF 方向。未变化的缩略图会复用。

## 浏览

点击照片进入大图；`←` / `→` 切换，`Esc` 关闭，滚轮或双指缩放，双击放大 / 还原，放大后拖动查看。
