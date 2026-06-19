export default class PhotoViewer {
    constructor(photo, targetElement) {
        this.photo = photo;
        this.targetElement = targetElement;
        
        this.state = { scale: 1, x: 0, y: 0 };
        this.pointers = new Map();
        this.initialPinchDistance = null;
        this.initialScale = 1;
        this.isDragging = false;
        this.lastPanPoint = null;

        // 绑定 this，确保 addEventListener 和 removeEventListener 用的是同一个函数引用 (防止内存泄漏)
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.hide = this.hide.bind(this);

        this.initDOM();
        this.bindEvents();
        this.animateIn();
    }

    // 路径转换辅助函数：解决 GitHub Pages 子目录 404 问题
    getSafeUrl(url) {
        if (!url) return '';
        return url.startsWith('/') ? `.${url}` : url;
    }

    initDOM() {
        // 计算滚动条宽度，并用 padding 填充，防止 body 设为 hidden 时页面抖动跳跃
        this.scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.paddingRight = `${this.scrollbarWidth}px`;
        document.body.style.overflow = 'hidden';

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
        
        // 缩略图优先加载，高分辨率图后加载覆盖
        this.img.src = this.getSafeUrl(this.photo.thumb_url);
        const highRes = new Image();
        highRes.src = this.getSafeUrl(this.photo.url);
        highRes.onload = () => { this.img.src = highRes.src; };

        this.img.style.cssText = `
            max-width: 100vw; max-height: 100vh; object-fit: contain;
            cursor: grab; user-select: none; -webkit-user-drag: none;
            transform-origin: center center;
        `;

        this.el.appendChild(this.img);
        this.el.appendChild(this.closeBtn);
        document.body.appendChild(this.el);
    }

    animateIn() {
        const rect = this.targetElement.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        
        // 防御性设计：如果被回收或者没有 naturalWidth，给个默认兜底比例
        const targetRatio = rect.width / (rect.height || 1);
        const imgRatio = (this.targetElement.naturalWidth / this.targetElement.naturalHeight) || targetRatio;
        const winRatio = winW / winH;
        
        let finalW, finalH;
        if (imgRatio > winRatio) {
            finalW = winW;
            finalH = winW / imgRatio;
        } else {
            finalH = winH;
            finalW = winH * imgRatio;
        }

        const startScale = rect.width / finalW;
        const startX = rect.left + rect.width / 2 - winW / 2;
        const startY = rect.top + rect.height / 2 - winH / 2;

        this.img.style.transform = `translate(${startX}px, ${startY}px) scale(${startScale})`;
        this.img.getBoundingClientRect(); // 强制回流重绘

        this.el.style.backgroundColor = 'rgba(0,0,0,0.95)';
        this.closeBtn.style.opacity = '1';
        
        this.img.animate([
            { transform: `translate(${startX}px, ${startY}px) scale(${startScale})` },
            { transform: `translate(0px, 0px) scale(1)` }
        ], { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });

        this.img.style.transform = `translate(0px, 0px) scale(1)`;
    }

    hide() {
        // 【关键修复】注销全局事件，防止内存泄漏和多次绑定触发错乱
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);

        const rect = this.targetElement.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const imgRatio = (this.targetElement.naturalWidth / this.targetElement.naturalHeight) || (rect.width / rect.height);
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
        ], { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

        animation.onfinish = () => {
            this.el.remove();
            // 恢复底层滚动和边距
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }

    applyTransform(smooth = false) {
        this.img.style.transition = smooth ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.img.style.transform = `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;
    }

    bindEvents() {
        this.closeBtn.addEventListener('click', this.hide);
        this.el.addEventListener('wheel', this.handleWheel, { passive: false });
        this.img.addEventListener('pointerdown', this.handlePointerDown);

        // 监听挂载在 Window 上，确保鼠标/手指拖出图片范围外也能响应
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerUp);
    }

    handlePointerDown(e) {
        e.preventDefault();
        this.img.style.cursor = 'grabbing';
        this.pointers.set(e.pointerId, e);
        
        if (this.pointers.size === 1) {
            this.isDragging = true;
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            this.img.style.transition = 'none';
        } else if (this.pointers.size === 2) {
            this.initialPinchDistance = this.getPinchDistance();
            this.initialScale = this.state.scale;
        }
    }

    handlePointerMove(e) {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, e); 

        if (this.pointers.size === 1 && this.isDragging) {
            const dx = e.clientX - this.lastPanPoint.x;
            const dy = e.clientY - this.lastPanPoint.y;
            this.state.x += dx;
            this.state.y += dy;
            this.lastPanPoint = { x: e.clientX, y: e.clientY };
            this.applyTransform();
        } else if (this.pointers.size === 2) {
            const currentDist = this.getPinchDistance();
            const scaleFactor = currentDist / this.initialPinchDistance;
            this.zoomTo(this.initialScale * scaleFactor, this.getPinchCenter());
        }
    }

    handlePointerUp(e) {
        this.pointers.delete(e.pointerId);
        
        if (this.pointers.size < 2) {
            this.initialPinchDistance = null;
        }

        if (this.pointers.size === 0) {
            this.isDragging = false;
            this.img.style.cursor = 'grab';
            this.checkBoundsAndReset();
        } else if (this.pointers.size === 1) {
            // 【关键修复】双指缩放时如果先松开一根手指，必须重置记录的单指拖拽点，防止画面闪现瞬移
            const remainingPointer = Array.from(this.pointers.values())[0];
            this.lastPanPoint = { x: remainingPointer.clientX, y: remainingPointer.clientY };
        }
    }

    handleWheel(e) {
        e.preventDefault();
        const zoomSpeed = 0.05;
        // 兼容不同操作系统的滚轮方向差
        const delta = e.deltaY < 0 ? 1 : -1; 
        let newScale = this.state.scale * (1 + delta * zoomSpeed);
        this.zoomTo(newScale, { x: e.clientX, y: e.clientY });
        
        clearTimeout(this.wheelTimeout);
        this.wheelTimeout = setTimeout(() => this.checkBoundsAndReset(), 150);
    }

    zoomTo(newScale, center) {
        newScale = Math.max(0.5, Math.min(newScale, 5));
        const winW = window.innerWidth / 2;
        const winH = window.innerHeight / 2;
        
        const cx = center.x - winW;
        const cy = center.y - winH;

        const ratio = newScale / this.state.scale;
        this.state.x = cx - (cx - this.state.x) * ratio;
        this.state.y = cy - (cy - this.state.y) * ratio;
        this.state.scale = newScale;

        this.applyTransform();
    }

    getPinchDistance() {
        const pts = Array.from(this.pointers.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPinchCenter() {
        const pts = Array.from(this.pointers.values());
        return {
            x: (pts[0].clientX + pts[1].clientX) / 2,
            y: (pts[0].clientY + pts[1].clientY) / 2
        };
    }

    checkBoundsAndReset() {
        let { x, y, scale } = this.state;
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const imgRect = this.img.getBoundingClientRect();
        
        const baseW = imgRect.width / scale;
        const baseH = imgRect.height / scale;

        const currentW = baseW * scale;
        const currentH = baseH * scale;

        if (scale < 1) {
            scale = 1; x = 0; y = 0;
        } else {
            if (currentW <= winW) x = 0; 
            else {
                const maxX = (currentW - winW) / 2;
                if (x > maxX) x = maxX;
                if (x < -maxX) x = -maxX;
            }

            if (currentH <= winH) y = 0; 
            else {
                const maxY = (currentH - winH) / 2;
                if (y > maxY) y = maxY;
                if (y < -maxY) y = -maxY;
            }
        }
        this.state = { x, y, scale };
        this.applyTransform(true);
    }
}