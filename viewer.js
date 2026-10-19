const icons = {
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    previous: '<path d="m14 6-6 6 6 6"/>',
    next: '<path d="m10 6 6 6-6 6"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M7.5 10.5h6m-3-3v6"/>',
    reset: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>'
};
const icon = (name) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const exifValue = (value) => {
    const text = value == null ? '' : String(value).trim();
    return !text || /^[-–—]+(?:\s*mm)?$/i.test(text) || /^(?:n\/?a|null|undefined|unknown|nan)$/i.test(text) ? null : text;
};
const photoDate = (value) => {
    const match = exifValue(value)?.match(/^(\d{4})[-/:](\d{2})[-/:](\d{2})(?:[T\s].*)?$/);
    if (!match) return '日期未记录';
    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)
        ? '日期未记录' : `${year}.${month}.${day}`;
};

export default class PhotoViewer {
    constructor(allPhotos, currentIndex = 0, getTargetElement = () => null) {
        if (!Array.isArray(allPhotos)) {
            this.allPhotos = allPhotos ? [allPhotos] : [];
            this.currentIndex = 0;
            this.getTargetElement = () => currentIndex;
        } else {
            this.allPhotos = allPhotos;
            this.currentIndex = Math.max(0, Math.min(Number(currentIndex) || 0, allPhotos.length - 1));
            this.getTargetElement = getTargetElement;
        }
        if (!this.allPhotos.length) return;
        this.state = { scale: 1, x: 0, y: 0 };
        this.pointers = new Map();
        this.loadToken = 0;
        this.closed = false;
        this.events = new AbortController();
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.previousFocus = document.activeElement;
        this.bodyStyles = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
        this.shell = document.getElementById('page-shell');
        this.previousInert = this.shell?.inert;
        this.initDOM();
        this.bindEvents();
        this.loadPhoto();
        this.closeBtn.focus({ preventScroll: true });
        if (this.shell) this.shell.inert = true;
        this.openFrame = requestAnimationFrame(() => this.el.classList.add('is-visible'));
    }

    getSafeUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return '';
        return url.startsWith('/') && !url.startsWith('//') ? `.${url}` : url;
    }

    makeButton(label, symbol, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `viewer-button ${className}`;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = icon(symbol);
        return button;
    }

    initDOM() {
        const scrollbar = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
        document.body.style.overflow = 'hidden';

        this.el = document.createElement('div');
        this.el.className = 'photo-viewer';
        this.el.setAttribute('role', 'dialog');
        this.el.setAttribute('aria-modal', 'true');
        this.el.setAttribute('aria-label', '照片查看器');
        this.el.tabIndex = -1;

        const header = document.createElement('header');
        header.className = 'viewer-header';
        const heading = document.createElement('div');
        heading.className = 'viewer-heading';
        this.indicator = document.createElement('span');
        this.indicator.className = 'viewer-count';
        this.indicator.setAttribute('aria-live', 'polite');
        this.date = document.createElement('span');
        this.date.className = 'viewer-date';
        heading.append(this.indicator, this.date);
        const toolbar = document.createElement('div');
        toolbar.className = 'viewer-toolbar';
        this.zoomBtn = this.makeButton('放大照片', 'zoom');
        this.resetBtn = this.makeButton('恢复适应屏幕', 'reset');
        this.originalLink = document.createElement('a');
        this.originalLink.className = 'viewer-button viewer-original';
        this.originalLink.target = '_blank';
        this.originalLink.rel = 'noopener noreferrer';
        this.originalLink.title = '在新标签页打开原图';
        this.originalLink.setAttribute('aria-label', '在新标签页打开原图');
        this.originalLink.innerHTML = icon('external');
        this.closeBtn = this.makeButton('关闭查看器（Esc）', 'close', 'viewer-close');
        toolbar.append(this.zoomBtn, this.resetBtn, this.originalLink, this.closeBtn);
        header.append(heading, toolbar);

        this.stage = document.createElement('div');
        this.stage.className = 'viewer-stage';
        this.img = document.createElement('img');
        this.img.className = 'viewer-image';
        this.img.draggable = false;
        this.img.decoding = 'async';
        this.status = document.createElement('p');
        this.status.className = 'viewer-status';
        this.status.setAttribute('role', 'status');
        this.prevBtn = this.makeButton('上一张（←）', 'previous', 'viewer-previous');
        this.nextBtn = this.makeButton('下一张（→）', 'next', 'viewer-next');
        this.prevBtn.hidden = this.nextBtn.hidden = this.allPhotos.length < 2;
        this.stage.append(this.img, this.status, this.prevBtn, this.nextBtn);

        const footer = document.createElement('footer');
        footer.className = 'viewer-footer';
        this.filename = document.createElement('span');
        this.filename.className = 'viewer-filename';
        this.details = document.createElement('dl');
        this.details.className = 'viewer-details';
        const hint = document.createElement('span');
        hint.className = 'viewer-hint';
        hint.textContent = '← → 切换 · 滚轮缩放 · 双击放大';
        footer.append(this.filename, this.details, hint);
        this.el.append(header, this.stage, footer);
        document.body.append(this.el);
    }

    bindEvents() {
        const on = (element, name, handler, options = {}) => element.addEventListener(name, handler, { ...options, signal: this.events.signal });
        on(this.closeBtn, 'click', () => this.hide());
        on(this.prevBtn, 'click', () => this.switchPhoto(-1));
        on(this.nextBtn, 'click', () => this.switchPhoto(1));
        on(this.zoomBtn, 'click', () => {
            this.zoomTo(Math.min(this.state.scale * 1.5, 5));
            this.checkBoundsAndReset();
        });
        on(this.resetBtn, 'click', () => this.reset());
        on(this.stage, 'click', (event) => {
            if (event.target === this.stage) this.hide();
        });
        on(this.img, 'dblclick', (event) => {
            event.preventDefault();
            if (this.state.scale > 1.05) this.reset();
            else {
                this.zoomTo(2.5, { x: event.clientX, y: event.clientY });
                this.checkBoundsAndReset();
            }
        });
        on(this.img, 'pointerdown', (event) => this.handlePointerDown(event));
        on(window, 'pointermove', (event) => this.handlePointerMove(event), { passive: false });
        on(window, 'pointerup', (event) => this.handlePointerUp(event));
        on(window, 'pointercancel', (event) => this.handlePointerUp(event));
        on(this.stage, 'wheel', (event) => this.handleWheel(event), { passive: false });
        on(window, 'resize', () => { this.fitImage(); this.checkBoundsAndReset(); });
        on(document, 'keydown', (event) => this.handleKeyDown(event));
        on(document, 'focusin', (event) => {
            if (!this.closed && !this.el.contains(event.target)) this.closeBtn.focus({ preventScroll: true });
        });
    }

    loadPhoto() {
        const token = ++this.loadToken;
        this.cancelLoaders();
        this.photo = this.allPhotos[this.currentIndex];
        this.reset();
        this.pointers.clear();
        this.gesture = null;
        const exif = this.photo.exif || {};
        this.indicator.textContent = `${String(this.currentIndex + 1).padStart(2, '0')} / ${String(this.allPhotos.length).padStart(2, '0')}`;
        this.date.textContent = photoDate(exif.Date);
        this.filename.textContent = this.photo.name || '未命名照片';
        this.img.alt = this.photo.name || '照片';
        this.details.replaceChildren();
        const focal = exifValue(exif.Focal);
        const aperture = exifValue(exif.FNumber);
        const exposure = exifValue(exif.ExposureTime);
        const iso = exifValue(exif.ISO);
        const metadata = [
            ['焦距', focal], ['光圈', aperture ? `ƒ/${aperture}` : null],
            ['快门', exposure ? `${exposure} s` : null], ['感光度', iso ? `ISO ${iso}` : null]
        ];
        this.details.hidden = metadata.every(([, value]) => value == null);
        for (const [label, value] of metadata) {
            if (value == null || value === '') continue;
            const item = document.createElement('div');
            const term = document.createElement('dt');
            const description = document.createElement('dd');
            term.textContent = label;
            description.textContent = String(value);
            item.append(term, description);
            this.details.append(item);
        }
        const originalUrl = this.getSafeUrl(this.photo.url);
        const thumbUrl = this.getSafeUrl(this.photo.thumb_url);
        if (originalUrl) this.originalLink.href = originalUrl;
        else this.originalLink.removeAttribute('href');
        this.originalLink.hidden = !originalUrl;
        this.img.removeAttribute('src');
        this.img.style.visibility = 'hidden';
        this.imageReady = false;
        this.imageRatio = Number(this.photo.width) / Number(this.photo.height);
        this.fitImage();
        this.setStatus('正在载入照片…');
        this.loaders = [];
        let originalLoaded = false;
        let thumbnailLoaded = false;
        let originalFailed = !originalUrl;
        let thumbnailFailed = !thumbUrl || thumbUrl === originalUrl;
        const updateFailure = () => {
            if (originalFailed) this.setStatus(thumbnailLoaded ? '原图暂时无法载入，已显示预览图' : thumbnailFailed ? '照片无法载入，请稍后重试' : '正在载入预览图…');
        };
        const load = (url, original) => {
            const loader = new Image();
            this.loaders.push(loader);
            loader.onload = () => {
                if (this.closed || token !== this.loadToken) return;
                if (original) originalLoaded = true;
                else thumbnailLoaded = true;
                if (original || !originalLoaded) {
                    this.imageRatio = loader.naturalWidth / loader.naturalHeight;
                    this.img.src = url;
                    this.img.style.visibility = 'visible';
                    this.imageReady = true;
                    this.fitImage();
                    this.checkBoundsAndReset();
                }
                this.setStatus(originalLoaded ? '' : originalFailed ? '原图暂时无法载入，已显示预览图' : '正在载入高清原图…');
            };
            loader.onerror = () => {
                if (this.closed || token !== this.loadToken) return;
                if (original) originalFailed = true;
                else thumbnailFailed = true;
                updateFailure();
            };
            loader.src = url;
        };
        if (thumbUrl && thumbUrl !== originalUrl) load(thumbUrl, false);
        if (originalUrl) load(originalUrl, true);
        updateFailure();
    }

    cancelLoaders() {
        for (const loader of this.loaders || []) {
            loader.onload = null;
            loader.onerror = null;
            loader.removeAttribute('src');
        }
        this.loaders = [];
    }

    setStatus(message) {
        this.status.textContent = message;
        this.status.hidden = !message;
        this.status.classList.toggle('is-error', message.includes('无法载入'));
    }

    fitImage() {
        const ratio = this.imageRatio > 0 && Number.isFinite(this.imageRatio) ? this.imageRatio : 1.5;
        const margin = window.innerWidth <= 600 ? 12 : 100;
        const maxWidth = Math.max(1, this.stage.clientWidth - margin);
        const maxHeight = Math.max(1, this.stage.clientHeight - 20);
        this.baseWidth = Math.min(maxWidth, maxHeight * ratio);
        this.baseHeight = this.baseWidth / ratio;
        this.img.style.width = `${this.baseWidth}px`;
        this.img.style.height = `${this.baseHeight}px`;
    }

    switchPhoto(direction) {
        if (this.closed || this.allPhotos.length < 2) return;
        clearTimeout(this.wheelTimeout);
        this.currentIndex = (this.currentIndex + direction + this.allPhotos.length) % this.allPhotos.length;
        this.loadPhoto();
    }

    handleKeyDown(event) {
        if (this.closed || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Escape') { event.preventDefault(); this.hide(); }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            this.switchPhoto(event.key === 'ArrowLeft' ? -1 : 1);
        } else if (event.key === 'Tab') {
            const controls = [...this.el.querySelectorAll('button, a[href]')].filter((element) => !element.hidden && !element.disabled);
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
                event.preventDefault(); first?.focus();
            }
        }
    }

    handlePointerDown(event) {
        if (this.closed || !this.imageReady || event.button !== 0) return;
        event.preventDefault();
        this.img.setPointerCapture?.(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.img.classList.add('is-dragging');
        if (this.pointers.size === 1) {
            this.gesture = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, canSwipe: this.state.scale <= 1.01 };
        } else if (this.pointers.size === 2) {
            this.gesture.canSwipe = false;
            this.initialPinchDistance = Math.max(1, this.getPinchDistance());
            this.initialScale = this.state.scale;
        }
    }

    handlePointerMove(event) {
        if (!this.pointers.has(event.pointerId)) return;
        event.preventDefault();
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2) {
            this.zoomTo(this.initialScale * this.getPinchDistance() / this.initialPinchDistance, this.getPinchCenter());
        } else if (this.pointers.size === 1 && this.gesture) {
            this.state.x += event.clientX - this.gesture.lastX;
            this.state.y += event.clientY - this.gesture.lastY;
            this.gesture.lastX = event.clientX;
            this.gesture.lastY = event.clientY;
            this.applyTransform();
        }
    }

    handlePointerUp(event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (event.type === 'pointercancel' && this.gesture) this.gesture.canSwipe = false;
        if (this.pointers.size === 1 && this.gesture) {
            const remaining = [...this.pointers.values()][0];
            this.gesture.lastX = remaining.x;
            this.gesture.lastY = remaining.y;
            this.gesture.canSwipe = false;
        } else if (this.pointers.size === 2) {
            this.initialPinchDistance = Math.max(1, this.getPinchDistance());
            this.initialScale = this.state.scale;
        } else if (this.pointers.size === 0) {
            this.img.classList.remove('is-dragging');
            const gesture = this.gesture;
            this.gesture = null;
            const dx = event.clientX - (gesture?.x || 0);
            const dy = event.clientY - (gesture?.y || 0);
            if (event.type !== 'pointercancel' && gesture?.canSwipe && this.state.scale <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                this.switchPhoto(dx > 0 ? -1 : 1);
            } else this.checkBoundsAndReset();
        }
    }

    getPinchDistance() {
        const [a, b] = [...this.pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    getPinchCenter() {
        const [a, b] = [...this.pointers.values()];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    handleWheel(event) {
        if (!this.imageReady) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.stage.clientHeight : 1);
        this.zoomTo(this.state.scale * Math.exp(-Math.max(-100, Math.min(delta, 100)) * 0.003), { x: event.clientX, y: event.clientY });
        clearTimeout(this.wheelTimeout);
        this.wheelTimeout = setTimeout(() => this.checkBoundsAndReset(), 120);
    }

    zoomTo(newScale, center) {
        if (!this.imageReady) return;
        const rect = this.stage.getBoundingClientRect();
        const cx = center ? center.x - rect.left - rect.width / 2 : 0;
        const cy = center ? center.y - rect.top - rect.height / 2 : 0;
        const scale = Math.max(1, Math.min(newScale, 5));
        const ratio = scale / this.state.scale;
        this.state = { scale, x: cx - (cx - this.state.x) * ratio, y: cy - (cy - this.state.y) * ratio };
        this.applyTransform();
    }

    reset() {
        this.state = { scale: 1, x: 0, y: 0 };
        this.img?.classList.remove('is-dragging');
        this.applyTransform(true);
    }

    checkBoundsAndReset() {
        if (this.closed) return;
        const maxX = Math.max(0, (this.baseWidth * this.state.scale - this.stage.clientWidth) / 2);
        const maxY = Math.max(0, (this.baseHeight * this.state.scale - this.stage.clientHeight) / 2);
        this.state.x = Math.max(-maxX, Math.min(maxX, this.state.x));
        this.state.y = Math.max(-maxY, Math.min(maxY, this.state.y));
        this.applyTransform(true);
    }

    applyTransform(smooth = false) {
        if (!this.img) return;
        this.img.style.transition = smooth && !this.reducedMotion ? 'transform 180ms ease-out' : 'none';
        this.img.style.transform = `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;
        this.zoomBtn.disabled = this.state.scale >= 5;
        this.resetBtn.disabled = this.state.scale === 1 && this.state.x === 0 && this.state.y === 0;
    }

    hide() {
        if (this.closed) return;
        this.closed = true;
        ++this.loadToken;
        this.events.abort();
        this.cancelLoaders();
        this.pointers.clear();
        clearTimeout(this.wheelTimeout);
        cancelAnimationFrame(this.openFrame);
        this.el.classList.remove('is-visible');
        const finish = () => {
            this.el.remove();
            document.body.style.overflow = this.bodyStyles.overflow;
            document.body.style.paddingRight = this.bodyStyles.paddingRight;
            if (this.shell) this.shell.inert = this.previousInert;
            const target = this.getTargetElement?.(this.currentIndex);
            const focusTarget = this.previousFocus?.isConnected ? this.previousFocus : target?.closest('button, a, [tabindex]');
            focusTarget?.focus({ preventScroll: true });
        };
        if (this.reducedMotion) finish();
        else this.closeTimeout = setTimeout(finish, 180);
    }
}
