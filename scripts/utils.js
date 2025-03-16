/**
 * 小数转分数...快门速度偷懒版
 */

// 完整1/3档快门序列（单位：秒）
const fullShutterSpeeds = [
    1/8000, 1/6400, 1/5000, 
    1/4000, 1/3200, 1/2500,
    1/2000, 1/1600, 1/1250,
    1/1000, 1/800,  1/640,
    1/500,  1/400,  1/320,
    1/250,  1/200,  1/160,
    1/125,  1/100,  1/80,
    1/60,   1/50,   1/40,
    1/30,   1/25,   1/20,
    1/15,   1/13,   1/10,
    1/8,    1/6,    1/5,
    1/4,    0.3,    1/2.5,
    0.5,    0.6,    0.8,
    1
    // ,      1.3,    1.6,
    // 2,      2.5,    3.2,
    // 4,      5,      6,
    // 8,      10,     13,
    // 15,     20,     25,
    // 30
].map(t => [t, `1/${Math.round(1/t)}`]);

export function findClosestShutterSpeed(input) {
    const target = typeof input === 'string' ? 
        parseFloat(input.replace(',', '.')) : 
        input;

    let minDiff = Infinity;
    let result = '';

    // 线性查找最近似值（已排序可优化为二分查找）
    for (const [value, fraction] of fullShutterSpeeds) {
        const diff = Math.abs(value - target);
        if (diff < minDiff) {
            minDiff = diff;
            result = fraction;
        }
    }

    // 误差超过阈值时返回原始值
    return minDiff < 0.001 ? result : target.toString();
}


