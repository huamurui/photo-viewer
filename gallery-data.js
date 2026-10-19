// Keep layout independent of image downloads: all dimensions come from the manifest.
export function preparePhotos(photos) {
    return photos.filter(photo => photo && typeof photo.url === 'string').map(photo => {
        const exif = photo.exif || {};
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(exif.Date) ? new Date(`${exif.Date}T00:00:00Z`) : null;
        const date = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === exif.Date ? exif.Date : '';
        const dimensions = [[photo.thumb_width, photo.thumb_height], [photo.width, photo.height]]
            .map(pair => pair.map(Number))
            .find(pair => pair.every(value => Number.isFinite(value) && value > 0));
        return { ...photo, exif, date, year: date.slice(0, 4), ratio: dimensions ? dimensions[1] / dimensions[0] : 0.75 };
    });
}

export function selectPhotos(photos, year = 'all', order = 'newest') {
    return photos.filter(photo => year === 'all' || photo.year === year).sort((a, b) => {
        // Undated photos always come last, regardless of sort direction.
        if (!a.date || !b.date) return Number(Boolean(b.date)) - Number(Boolean(a.date));
        return order === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
}

export function layoutPhotos(photos, width, columns, gap, captionHeight) {
    const heights = Array(columns).fill(0);
    const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
    const items = photos.map((photo, index) => {
        const column = heights.indexOf(Math.min(...heights));
        const imageHeight = cardWidth * photo.ratio;
        const item = { photo, index, x: column * (cardWidth + gap), y: heights[column], width: cardWidth, height: imageHeight + captionHeight, imageHeight };
        heights[column] += item.height + gap;
        return item;
    });
    return { items, height: Math.max(0, ...heights) - (items.length ? gap : 0) };
}

export function formatUrl(url) {
    return typeof url === 'string' ? (url.startsWith('/') && !url.startsWith('//') ? `.${url}` : url) : '';
}

export function formatExif(exif = {}) {
    return [
        exif.Focal && exif.Focal !== '-mm' && exif.Focal !== '-' ? exif.Focal : null,
        exif.FNumber && exif.FNumber !== '-' ? `ƒ/${exif.FNumber}` : null,
        exif.ExposureTime && exif.ExposureTime !== '-' ? `${exif.ExposureTime}s` : null,
        exif.ISO && exif.ISO !== '-' ? `ISO ${exif.ISO}` : null
    ].filter(Boolean);
}
