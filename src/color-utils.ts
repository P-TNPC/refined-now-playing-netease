type RgbColor = [number, number, number];
type MetaColor = {
	color: RgbColor;
	r: number;
	g: number;
	b: number;
	lum: number;
	saturation: number;
	L: number;
	A: number;
	B: number;
};

// const rgb2Hsl = ([r, g, b]: RgbColor): [number, number, number] => {
// 	const max = Math.max(r, g, b);
// 	const min = Math.min(r, g, b);

// 	if (max === min) return [0, 0, max / 255];

// 	const d = max - min;
// 	const sum = max + min;

// 	const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
// 	const s = sum > 255 ? d / (510 - sum) : d / sum;
// 	const l = sum / 510;

// 	return [h, s, l];
// };

// 饱和度计算，避免计算无用的 H 和 L
const rgb2Saturation = (r: number, g: number, b: number): number => {
	let max = r,
		min = r;
	if (g > max) max = g;
	else min = g;
	if (b > max) max = b;
	else if (b < min) min = b;
	if (max === min) return 0;
	const sum = max + min;
	return sum > 255 ? (max - min) / (510 - sum) : (max - min) / sum;
};

// sRGB 线性化
const linearize = (c: number): number => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); // 0.03928 -> 0.04045
};

const xyz2Lab = (c: number): number => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);

export const getGradientFromPalette = (palette: RgbColor[], angle: string = '-45deg'): string | null => {
	if (!palette.length) return null;
	if (palette.length === 1) {
		const [r, g, b] = palette[0]!;
		return `linear-gradient(${angle}, rgb(${r},${g},${b}), rgb(${r},${g},${b}))`;
	}

	// 预处理：缓存线性值和 Luminance
	let metaPalette: MetaColor[] = palette.map(color => {
		const r = linearize(color[0]);
		const g = linearize(color[1]);
		const b = linearize(color[2]);
		const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		return { color, r, g, b, lum, saturation: 0, L: 0, A: 0, B: 0 };
	});

	// 按 Luminance 排序截取
	metaPalette.sort((a, b) => a.lum - b.lum);
	const mid = Math.floor(metaPalette.length / 2);
	metaPalette = metaPalette.slice(Math.max(0, mid - 4), mid + 4);

	// 按 Saturation 排序截取
	for (const mClr of metaPalette) mClr.saturation = rgb2Saturation(mClr.color[0], mClr.color[1], mClr.color[2]);
	metaPalette.sort((a, b) => b.saturation - a.saturation);
	metaPalette = metaPalette.slice(0, 6);

	// 计算最终的 6 个 LAB
	for (const mClr of metaPalette) {
		const x = mClr.r * 41.24 + mClr.g * 35.76 + mClr.b * 18.05;
		const y = mClr.lum * 100;
		const z = mClr.r * 1.93 + mClr.g * 11.92 + mClr.b * 95.05;

		const fy = xyz2Lab(y / 100);
		mClr.L = 116 * fy - 16;
		mClr.A = 500 * (xyz2Lab(x / 95.047) - fy);
		mClr.B = 200 * (fy - xyz2Lab(z / 108.883));
	}

	const colorCount = metaPalette.length;
	if (colorCount === 1) {
		const [r, g, b] = metaPalette[0]!.color;
		return `linear-gradient(${angle}, rgb(${r},${g},${b}), rgb(${r},${g},${b}))`;
	}

	// 距离矩阵
	const differences = Array.from({ length: colorCount }, () => new Float64Array(colorCount));
	for (let i = 0; i < colorCount; i++) {
		for (let j = i + 1; j < colorCount; j++) {
			const c1 = metaPalette[i]!,
				c2 = metaPalette[j]!;
			const dL = c1.L - c2.L;
			const dA = c1.A - c2.A;
			const dB = c1.B - c2.B;
			const distSq = dL * dL + dA * dA + dB * dB;
			differences[i]![j] = distSq;
			differences[j]![i] = distSq;
		}
	}

	// DFS 搜索
	let minMaxDiff = Infinity;
	let ansSeq = new Uint8Array(colorCount);
	let currentSeq = new Uint8Array(colorCount);

	// mask: 第 i 位为 1 表示 metaPalette[i] 已被使用
	const dfs = (depth: number, currentMax: number, mask: number): void => {
		if (currentMax >= minMaxDiff) return;

		if (depth === colorCount) {
			minMaxDiff = currentMax;
			ansSeq.set(currentSeq);
			return;
		}

		const lastIdx = currentSeq[depth - 1]!;
		for (let i = 0; i < colorCount; i++) {
			if ((mask & (1 << i)) !== 0) continue; // 检查第 i 个颜色是否已使用

			currentSeq[depth] = i;
			dfs(depth + 1, Math.max(currentMax, differences[lastIdx]![i]!), mask | (1 << i));
		}
	};
	for (let i = 0; i < colorCount; i++) {
		currentSeq[0] = i;
		dfs(1, 0, 1 << i); // 初始传入深度 1，最大差值 0，以及只包含第 i 位的 mask
	}

	const colorsStr = Array.from(ansSeq)
		.map(idx => `rgb(${metaPalette[idx]!.color[0]},${metaPalette[idx]!.color[1]},${metaPalette[idx]!.color[2]})`)
		.join(',');

	return `linear-gradient(${angle},${colorsStr})`;
};

export const argb2Rgb = (x: number): RgbColor => [/*R*/ (x >>> 16) & 0xff, /*G*/ (x >>> 8) & 0xff, /*B*/ x & 0xff]; // 忽略 A (x >>> 24) & 0xff
export const rgb2Argb = (r: number, g: number, b: number): number => ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
