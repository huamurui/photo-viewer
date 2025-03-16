
export default class PhotoViewer {
    constructor(parent, photo, target) {
        // 可以根据 rect 的信息做一个动画

        this.el = document.createElement('div');
        this.el.innerHTML = `
            <div class="mask" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center;">
                <div id="close" >x</div>
                <img srcset="">
            </div>
        `;
        this.initRect = target.getBoundingClientRect();
        this.img = this.el.querySelector('img');
        parent.appendChild(this.el);
        this.img.animate([
            {
                transform: `scale(0) translate(${this.initRect.x + this.initRect.width / 2}px, ${this.initRect.y + this.initRect.height / 2}px)`,
            },
            {
                transform: `scale(1) translate(0, 0)`,
            },
        ], {
            duration: 300,
            easing: 'ease-in-out'
        });

        this.el.querySelector('#close').addEventListener('click', () => {
            this.hide();
        });
        this.state = new Proxy({
            scale: 1,
            translateX: 0,
            translateY: 0,
            tramsformOrigin: '50% 50%'
        }, {
            set: (target, key, value) => {
                target[key] = value;
                
                this.img.style.transform = `scale(${target.scale}) translate(${target.translateX}px, ${target.translateY}px)`;
                this.img.style.transformOrigin = target.tramsformOrigin;
                return true;
            },
            get: (target, key) => {
                return target[key];
            }
        });

        this.photo = photo;
        this.show(this.photo)
    }

    show(photo) {

        this.img.srcset = `${photo.url} , ${photo.thumb_url}`; // 这里应该是 photo.thumb_url
        this.img.src = photo.url;

        this.el.querySelector('img').addEventListener('wheel', (e) => {
            // 我希望滚轮可以放大图片，并且放大的中心是鼠标所在的位置
            e.preventDefault();
            this.state.scale = (e.deltaY > 0 ? 0.8 : 1.2) * (this.state.scale);

            
            // this.state.scale = (e.deltaY > 0 ? 0.8 : 1.2) * (this.state.scale);
            const rect = this.img.getBoundingClientRect();
            const percentX = (e.clientX - rect.left) / rect.width;
            const percentY = (e.clientY - rect.top) / rect.height;

            this.img.style.transformOrigin = `${percentX * 100}% ${percentY * 100}%`;
        });

        this.el.querySelector('img').addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startTranslateX = this.state.translateX;
            const startTranslateY = this.state.translateY;

            const move = (e) => {
                const x = e.clientX - startX;
                const y = e.clientY - startY;
                this.state.translateX = startTranslateX + x;
                this.state.translateY = startTranslateY + y;

                e.target.style.cursor = 'grabbing';
            }

            const up = (e) => {
                e.target.style.cursor = null
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            }

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        // 写一个二指缩放的事件
        this.el.querySelector('img').addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const startDistance = getDistance(e.touches);
                const startScale = this.state.scale;

                document.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (e.touches.length === 2) {
                        const distance = getDistance(e.touches);
                        const scale = distance / startDistance * startScale;
                        this.state.scale = scale;
                    }
                });
                function getDistance(touches) {
                    const dx = touches[0].clientX - touches[1].clientX;
                    const dy = touches[0].clientY - touches[1].clientY;
                    return Math.sqrt(dx * dx + dy * dy);
                }
                return
            }


            if (e.touches.length === 1) {
                const startX = e.touches[0].clientX;
                const startY = e.touches[0].clientY;
                const startTranslateX = this.state.translateX;
                const startTranslateY = this.state.translateY;

                document.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (e.touches.length === 1) {
                        const x = e.touches[0].clientX - startX;
                        const y = e.touches[0].clientY - startY;
                        this.state.translateX = startTranslateX + x;
                        this.state.translateY = startTranslateY + y;
                    }
                });
                return
            }
        });

    }

    hide() {
        this.el.remove();
    }
}

// 我希望放大缩小或移动的时候，不要让图片飞出屏幕外, 然后尽量居中
function getAdjustRect(rect, window) {
    let res = { x: rect.x, y: rect.y }
    // 具体而言，在图片长或宽小于屏幕长或宽的时候，可以在竖直方向或水平方向上居中
    // 在图片长或宽大于屏幕长或宽的时候，根据当前的位置，移动到填满屏幕的一边，另一边超出屏幕的部分不可见
    if (rect.width < window.width) {
        res.x = (window.width - rect.width) / 2
    } else {
        if (rect.x > 0) {
            res.x = 0
        } else if (rect.x + rect.width < window.width) {
            res.x = window.width - rect.width
        }
    }

    if (rect.height < window.height) {
        res.y = (window.height - rect.height) / 2
    } else {
        if (rect.y > 0) {
            res.y = 0
        } else if (rect.y + rect.height < window.height) {
            res.y = window.height - rect.height
        }
    }
    // 0,0 意味着刚好调整到中心。而不是调整到屏幕的左上角。所以应该修正...
    res.x = res.x - rect.x
    res.y = res.y - rect.y
    return res
}

// 上面的功能都...还有待考虑和完善