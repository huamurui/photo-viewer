import PhotoViewer from './viewer.js';
import { preparePhotos, selectPhotos, layoutPhotos, formatUrl, formatExif } from './gallery-data.js';

const list = document.querySelector('#photo-list');
const filters = document.querySelector('#year-filters');
const status = document.querySelector('#collection-status');
const message = document.querySelector('#gallery-message');
const end = document.querySelector('#collection-end');
const topButton = document.querySelector('#back-to-top');
const detailsButton = document.querySelector('#details-toggle');
const layoutButtons = [...document.querySelectorAll('[data-layout]')];
const settings = document.querySelector('.gallery-settings');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const rendered = new Map();
let photos = [];
let selected = [];
let items = [];
let year = 'all';
let order = 'newest';
let layout = 'relaxed';
let showDetails = false;
let frame = 0;
let lastWidth = 0;
let viewer = null;
let manifestReady = false;

try {
    layout = localStorage.getItem('hmr-layout') === 'compact' ? 'compact' : 'relaxed';
    showDetails = localStorage.getItem('hmr-details') === 'true';
} catch { /* Storage is optional in private browsing. */ }

function savePreferences() {
    try {
        localStorage.setItem('hmr-layout', layout);
        localStorage.setItem('hmr-details', String(showDetails));
    } catch { /* The gallery also works without storage. */ }
}

function updateControls() {
    detailsButton.setAttribute('aria-pressed', String(showDetails));
    detailsButton.title = showDetails ? '隐藏拍摄参数' : '显示拍摄参数';
    layoutButtons.forEach(button => {
        const active = button.dataset.layout === layout;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

function columnCount(width) {
    if (layout === 'compact') return width >= 1160 ? 5 : width >= 850 ? 4 : width >= 560 ? 3 : 2;
    return width >= 1160 ? 4 : width >= 760 ? 3 : width >= 360 ? 2 : 1;
}

function computeLayout({ preservePosition = false } = {}) {
    const oldTop = list.getBoundingClientRect().top;
    const anchor = preservePosition && oldTop < 0 ? items.find(item => item.y + item.height > -oldTop) : null;
    const offset = anchor ? oldTop + anchor.y : 0;
    const width = list.clientWidth;
    if (!width) return;
    const gap = width < 560 ? 14 : 24;
    const result = layoutPhotos(selected, width, columnCount(width), gap, showDetails ? 56 : 32);
    items = result.items;
    lastWidth = width;
    list.style.height = `${result.height}px`;
    for (const [index, node] of rendered) {
        if (items[index] && node.dataset.photo === items[index].photo.url) positionCard(node, items[index]);
        else { node.remove(); rendered.delete(index); }
    }
    if (anchor && items[anchor.index]) {
        window.scrollBy({ top: list.getBoundingClientRect().top + items[anchor.index].y - offset, behavior: 'instant' });
    }
    renderViewport();
}

function positionCard(node, item) {
    node.style.transform = `translate(${item.x}px, ${item.y}px)`;
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    node.querySelector('.photo-frame').style.height = `${item.imageHeight}px`;
    node.querySelector('.photo-exif').hidden = !showDetails;
}

function createCard(item) {
    const { photo, index } = item;
    const node = document.createElement('li');
    node.className = 'photo-card';
    node.dataset.photo = photo.url;
    node.setAttribute('aria-posinset', String(index + 1));
    node.setAttribute('aria-setsize', String(selected.length));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-button';
    button.dataset.index = index;
    button.setAttribute('aria-label', `查看第 ${index + 1} 张照片，${photo.date || '日期未知'}，${photo.name || '摄影作品'}`);
    const imageFrame = document.createElement('span');
    imageFrame.className = 'photo-frame';
    const image = document.createElement('img');
    image.alt = photo.name || 'HMR 摄影作品';
    image.width = photo.thumb_width || photo.width || 500;
    image.height = photo.thumb_height || photo.height || 375;
    image.decoding = 'async';
    image.loading = index < 6 ? 'eager' : 'lazy';
    if (index < 2) image.fetchPriority = 'high';
    image.addEventListener('load', () => image.classList.add('is-loaded'));
    image.addEventListener('error', () => {
        image.hidden = true;
        const hint = document.createElement('span');
        hint.className = 'photo-error';
        hint.textContent = '缩略图暂不可用 · 点击查看原图';
        imageFrame.append(hint);
    }, { once: true });
    image.src = formatUrl(photo.thumb_url || photo.url);
    const open = document.createElement('span');
    open.className = 'photo-open';
    open.setAttribute('aria-hidden', 'true');
    open.textContent = '↗';
    imageFrame.append(image, open);
    const caption = document.createElement('span');
    caption.className = 'photo-caption';
    const date = document.createElement('span');
    date.textContent = photo.date ? photo.date.replaceAll('-', '.') : '未记录日期';
    const number = document.createElement('span');
    number.className = 'photo-number';
    number.textContent = String(index + 1).padStart(3, '0');
    caption.append(date, number);
    const exif = document.createElement('span');
    exif.className = 'photo-exif';
    const fields = formatExif(photo.exif);
    (fields.length ? fields : ['未记录拍摄参数']).forEach(value => {
        const field = document.createElement('span');
        field.textContent = value;
        exif.append(field);
    });
    exif.title = fields.join(' · ');
    button.append(imageFrame, caption, exif);
    node.append(button);
    positionCard(node, item);
    return node;
}

function renderViewport() {
    // Item positions are relative to the list, not to the document.
    const top = -list.getBoundingClientRect().top;
    const bottom = top + window.innerHeight;
    const buffer = 700;
    const visible = items.filter(item => item.y + item.height > top - buffer && item.y < bottom + buffer);
    const indices = new Set(visible.map(item => item.index));
    for (const [index, node] of rendered) {
        if (!indices.has(index) && !node.contains(document.activeElement)) {
            node.remove();
            rendered.delete(index);
        }
    }
    for (const item of visible) {
        if (rendered.has(item.index)) continue;
        const node = createCard(item);
        // Preserve chronological keyboard order when scrolling back upwards.
        const nextIndex = [...rendered.keys()].filter(index => index > item.index).sort((a, b) => a - b)[0];
        list.insertBefore(node, rendered.get(nextIndex) || null);
        rendered.set(item.index, node);
    }
    topButton.hidden = window.scrollY < 700;
}

function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
        frame = 0;
        renderViewport();
    });
}

function applySelection() {
    if (!manifestReady) return;
    selected = selectPhotos(photos, year, order);
    rendered.forEach(node => node.remove());
    rendered.clear();
    const label = year === 'all' ? '全部照片' : `${year} 年`;
    status.textContent = `${label} · ${selected.length} 张${order === 'newest' ? ' / 从近到远' : ' / 从远到近'}`;
    end.hidden = !selected.length;
    message.hidden = Boolean(selected.length);
    if (!selected.length) message.textContent = '暂无照片。';
    computeLayout();
}

function renderFilters() {
    const years = [...new Set(photos.map(photo => photo.year).filter(Boolean))].sort().reverse();
    filters.replaceChildren();
    for (const value of ['all', ...years]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `year-filter${value === year ? ' is-active' : ''}`;
        button.dataset.year = value;
        button.setAttribute('aria-pressed', String(value === year));
        button.append(document.createTextNode(value === 'all' ? '全部' : value));
        const count = document.createElement('span');
        count.textContent = value === 'all' ? photos.length : photos.filter(photo => photo.year === value).length;
        button.append(count);
        filters.append(button);
    }
}

async function loadPhotos() {
    list.setAttribute('aria-busy', 'true');
    status.textContent = '正在加载照片…';
    message.hidden = true;
    try {
        const response = await fetch('./photos/map.json');
        if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid photo manifest');
        photos = preparePhotos(data);
        manifestReady = true;
        renderFilters();
        applySelection();
    } catch (error) {
        status.textContent = '照片暂时没有加载成功';
        message.hidden = false;
        message.textContent = '暂时无法打开照片集，请检查网络后重试。';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry-button';
        retry.textContent = '重新加载';
        retry.addEventListener('click', loadPhotos, { once: true });
        message.append(retry);
        console.error('Unable to load photo gallery:', error);
    } finally {
        list.setAttribute('aria-busy', 'false');
    }
}

document.addEventListener('click', event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
});
settings.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settings.open) {
        event.preventDefault();
        settings.open = false;
        settings.querySelector('summary').focus();
    }
});
filters.addEventListener('click', event => {
    const button = event.target.closest('[data-year]');
    if (!button || year === button.dataset.year) return;
    year = button.dataset.year;
    filters.querySelectorAll('button').forEach(filter => {
        const active = filter === button;
        filter.classList.toggle('is-active', active);
        filter.setAttribute('aria-pressed', String(active));
    });
    applySelection();
});
document.querySelector('#sort-order').addEventListener('change', event => {
    order = event.target.value;
    applySelection();
});
detailsButton.addEventListener('click', () => {
    showDetails = !showDetails;
    updateControls();
    savePreferences();
    computeLayout({ preservePosition: true });
});
layoutButtons.forEach(button => button.addEventListener('click', () => {
    if (layout === button.dataset.layout) return;
    layout = button.dataset.layout;
    updateControls();
    savePreferences();
    computeLayout({ preservePosition: true });
}));
list.addEventListener('click', event => {
    const button = event.target.closest('.photo-button');
    if (!button || (viewer && viewer.el.isConnected)) return;
    // The viewer receives the full selection, including off-screen photos.
    viewer = new PhotoViewer(selected, Number(button.dataset.index), index => rendered.get(index)?.querySelector('img'));
});
list.addEventListener('keydown', event => {
    const button = event.target.closest('.photo-button');
    if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = Number(button.dataset.index);
    const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    const item = items[targetIndex];
    if (!item) return;
    const top = list.getBoundingClientRect().top + item.y;
    if (top < 0 || top + item.height > innerHeight) window.scrollBy({ top: top - 24, behavior: 'instant' });
    renderViewport();
    rendered.get(targetIndex)?.querySelector('button').focus({ preventScroll: true });
});
window.addEventListener('scroll', scheduleRender, { passive: true });
window.addEventListener('resize', () => {
    if (Math.abs(list.clientWidth - lastWidth) > 1) computeLayout({ preservePosition: true });
    else scheduleRender();
}, { passive: true });
new ResizeObserver(() => {
    if (Math.abs(list.clientWidth - lastWidth) > 1) computeLayout({ preservePosition: true });
}).observe(list);
topButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    document.querySelector('.wordmark').focus({ preventScroll: true });
});
updateControls();
loadPhotos();
