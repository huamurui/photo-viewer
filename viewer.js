export default class PhotoViewer {
    constructor(photo, targetElement) {
        this.photo = photo;
        this.targetElement = targetElement;
        
        // 状态管理
        this.state = {
            scale: 1,
            x: 0,
            y: 0,
        };

        // 交互记录
        this.pointers = new Map(); // 记录多指触摸点
        this.initialPinchDistance = null;
        this.initialScale = 1;
        this.isDragging = false;
        this.lastPanPoint = null;

        this.initDOM();
        this.bindEvents();
        this.animateIn();
    }

    initDOM() {
        this.el = document.createElement('div');
        this.el.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0,0,0,0); transition: background-color 0.3s;
            z-index: 9999; display: flex; justify-content: center; align-items: center;
            overflow: hidden; touch-action: none;
        `;

        this.closeBtn = document.createElement('div');
        this.closeBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        `;
        this.closeBtn.style.cssText = `
            position: absolute; top: 20px; right: 20px; width: 40px; height: 40px;
            background: rgba(255,255,255,0.2); border-radius: 50%; color: white;
            display: flex; justify-content: center; align-items: center; cursor: pointer;
            z-index: 10000; opacity: 0; transition: opacity 0.3s, background 0.2s;
        `;

        this.img = document.createElement('img');
        // 先加载缩略图，再加载高清图
        this.img.src = this.photo.thumb_url;
        const highRes = new Image();
        highRes.src = this.photo.url;
        highRes.onload = () => { this.img.src = this.photo.url; };

        this.img.style.cssText = `
            max-width: 100vw; max-height: 100vh; object-fit: contain;
            cursor: grab; user-select: none; -webkit-user-drag: none;
            transform-origin: center center;
        `;

        this.el.appendChild(this.img);
        this.el.appendChild(this.closeBtn);
        document.body.appendChild(this.el);
    }

    // 从原图位置无缝飞入 (FLIP 思想)
    animateIn() {
        const rect = this.targetElement.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        
        // 计算目标图片最终渲染出来时的宽高 (object-fit: contain)
        const imgRatio = this.targetElement.naturalWidth / this.targetElement.naturalHeight;
        const winRatio = winW / winH;
        let finalW, finalH;
        if (imgRatio > winRatio) {
            finalW = winW;
            finalH = winW / imgRatio;
        } else {
            finalH = winH;
            finalW = winH * imgRatio;
        }

        // 计算初始缩放和偏移
        const startScale = rect.width / finalW;
        const startX = rect.left + rect.width / 2 - winW / 2;
        const startY = rect.top + rect.height / 2 - winH / 2;

        this.img.style.transform = `translate(${startX}px, ${startY}px) scale(${startScale})`;

        // 强制回流
        this.img.getBoundingClientRect();

        // 飞入动画
        this.el.style.backgroundColor = 'rgba(0,0,0,0.9)';
        this.closeBtn.style.opacity = '1';
        
        this.img.animate([
            { transform: `translate(${startX}px, ${startY}px) scale(${startScale})` },
            { transform: `translate(0px, 0px) scale(1)` }
        ], { duration: 350, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });

        this.img.style.transform = `translate(0px, 0px) scale(1)`;
    }

    // 飞出并销毁
    hide() {
        const rect = this.targetElement.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const imgRatio = this.targetElement.naturalWidth / this.targetElement.naturalHeight;
        const winRatio = winW / winH;
        let finalW = imgRatio > winRatio ? winW : winH * imgRatio;

        const endScale = rect.width / finalW;
        const endX = rect.left + rect.width / 2 - winW / 2;
        const endY = rect.top + rect.height / 2 - winH / 2;

        this.el.style.backgroundColor = 'rgba(0,0,0,0)';
        this.closeBtn.style.opacity = '0';

        const animation = this.img.animate([
            { transform: `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})` },
            { transform: `translate(${endX}px, ${endY}px) scale(${endScale})` }
        ], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

        animation.onfinish = () => this.el.remove();
    }

    applyTransform(smooth = false) {
        this.img.style.transition = smooth ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.img.style.transform = `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;
    }

    // 绑定所有的事件：Pointer Events 同时搞定鼠标和触摸
    bindEvents() {
        this.closeBtn.addEventListener('click', () => this.hide());
        
        // 阻止默认滚动
        this.el.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleWheel(e);
        }, { passive: false });

        this.img.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.img.style.cursor = 'grabbing';
            this.pointers.set(e.pointerId, e);
            
            if (this.pointers.size === 1) {
                this.isDragging = true;
                this.lastPanPoint = { x: e.clientX, y: e.clientY };
                this.img.style.transition = 'none'; // 拖拽时取消动画延迟
            } else if (this.pointers.size === 2) {
                this.initialPinchDistance = this.getPinchDistance();
                this.initialScale = this.state.scale;
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.pointers.has(e.pointerId)) return;
            this.pointers.set(e.pointerId, e); // 更新点

            if (this.pointers.size === 1 && this.isDragging) {
                // 单指拖拽
                const dx = e.clientX - this.lastPanPoint.x;
                const dy = e.clientY - this.lastPanPoint.y;
                this.state.x += dx;
                this.state.y += dy;
                this.lastPanPoint = { x: e.clientX, y: e.clientY };
                this.applyTransform();
            } else if (this.pointers.size === 2) {
                // 双指缩放
                const currentDist = this.getPinchDistance();
                const scaleFactor = currentDist / this.initialPinchDistance;
                this.zoomTo(this.initialScale * scaleFactor, this.getPinchCenter());
            }
        });

        const pointerUpHandler = (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size < 2) this.initialPinchDistance = null;
            if (this.pointers.size === 0) {
                this.isDragging = false;
                this.img.style.cursor = 'grab';
                this.checkBoundsAndReset(); // 松手时回弹限制
            }
        };

        window.addEventListener('pointerup', pointerUpHandler);
        window.addEventListener('pointercancel', pointerUpHandler);
    }

    handleWheel(e) {
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -1 : 1;
        let newScale = this.state.scale * (1 + delta * zoomSpeed);
        this.zoomTo(newScale, { x: e.clientX, y: e.clientY });
        
        // 使用防抖或计时器在滚轮停止时触发回弹
        clearTimeout(this.wheelTimeout);
        this.wheelTimeout = setTimeout(() => this.checkBoundsAndReset(), 150);
    }

    // 以特定点为中心进行缩放
    zoomTo(newScale, center) {
        newScale = Math.max(0.5, Math.min(newScale, 5)); // 限制最小最大缩放
        
        // 计算缩放中心相对于当前图片的偏移，以保持中心点不动
        const winW = window.innerWidth / 2;
        const winH = window.innerHeight / 2;
        
        // 鼠标相对视口中心的坐标
        const cx = center.x - winW;
        const cy = center.y - winH;

        // 根据缩放前后的比例，修正图片的 x,y 坐标
        const ratio = newScale / this.state.scale;
        this.state.x = cx - (cx - this.state.x) * ratio;
        this.state.y = cy - (cy - this.state.y) * ratio;
        this.state.scale = newScale;

        this.applyTransform();
    }

    // 计算双指距离
    getPinchDistance() {
        const pts = Array.from(this.pointers.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 计算双指中心点
    getPinchCenter() {
        const pts = Array.from(this.pointers.values());
        return {
            x: (pts[0].clientX + pts[1].clientX) / 2,
            y: (pts[0].clientY + pts[1].clientY) / 2
        };
    }

    // 核心边界约束算法 (保证图片不飞出屏幕边界，且若比屏幕小则居中)
    checkBoundsAndReset() {
        let { x, y, scale } = this.state;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const imgRect = this.img.getBoundingClientRect();
        
        // 基础宽高 (scale 为 1 时的可视宽高)
        const baseW = imgRect.width / scale;
        const baseH = imgRect.height / scale;

        // 当前真实宽高
        const currentW = baseW * scale;
        const currentH = baseH * scale;

        // 缩放回弹
        if (scale < 1) {
            scale = 1;
            x = 0;
            y = 0;
        } else {
            // X 轴约束
            if (currentW <= winW) {
                x = 0; // 小于屏幕宽，强制水平居中
            } else {
                const maxX = (currentW - winW) / 2;
                if (x > maxX) x = maxX;
                if (x < -maxX) x = -maxX;
            }

            // Y 轴约束
            if (currentH <= winH) {
                y = 0; // 小于屏幕高，强制垂直居中
            } else {
                const maxY = (currentH - winH) / 2;
                if (y > maxY) y = maxY;
                if (y < -maxY) y = -maxY;
            }
        }

        this.state = { x, y, scale };
        this.applyTransform(true); // smooth = true 执行回弹动画
    }
}