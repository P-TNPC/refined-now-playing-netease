import type { LyricLine } from './liblyric';

// 设置
export interface SettingsMap {
	'cover-blurry-shadow': boolean;
	'enable-progressbar-preview': boolean;
	'lyric-blur': boolean;
	'lyric-fade': boolean;
	'lyric-glow': boolean;
	'lyric-rotate': boolean;
	'lyric-stagger': boolean;
	'lyric-zoom': boolean;
	'rectangle-cover': boolean;
	'show-romaji': boolean;
	'show-translation': boolean;
	'static-fluid': boolean;
	'use-karaoke-lyrics': boolean;
	'current-lyric-alignment-percentage': number;
	'fluid-max-framerate': number;
	'lyric-font-size': number;
	'lyric-offset': number;
	'lyric-rotate-curvature': number;
	'background-type': 'fluid' | 'blur' | 'gradient' | 'solid' | 'none';
	'karaoke-animation': 'float' | 'slide';
	'time-indicator': 'total' | 'remain';
	'font-family': string[];
}
export type SettingOption = keyof SettingsMap;
const SETTING_PREFIX = 'refined-now-playing-';
const formatOption = (option: SettingOption) => option.replace(/-fm$/, '') as SettingOption; // 历史遗留问题
export const getSetting = <K extends SettingOption>(option: K, defaultValue: SettingsMap[K]): SettingsMap[K] => {
	const key = `${SETTING_PREFIX}${formatOption(option)}`;
	const value = localStorage.getItem(key);
	if (value === null) return defaultValue;

	try {
		return JSON.parse(value) as SettingsMap[K];
	} catch (e) {
		console.error('getSetting error:', e, '\nkey:', key, 'value:', value);
		return value as SettingsMap[K];
	}
};
export interface SettingChangedDetail {
	option: SettingOption;
	value: SettingsMap[SettingOption];
}
declare global {
	interface WindowEventMap {
		'rnp-setting-changed': CustomEvent<SettingChangedDetail>;
	}
}
export const setSetting = <K extends SettingOption>(option: K, value: SettingsMap[K]): void => {
	const formattedOption = formatOption(option);
	localStorage.setItem(`${SETTING_PREFIX}${formattedOption}`, JSON.stringify(value));

	window.dispatchEvent(
		new CustomEvent<SettingChangedDetail>('rnp-setting-changed', {
			detail: { option: formattedOption, value },
		}),
	);
};

// 其他
export const waitForElementAsync = (selector: string): Promise<Element | null> => betterncm.utils.waitForElement(selector);
export const waitForElement = async (selectors: string, callback: (el: Element) => void): Promise<void> => {
	const selectorList = selectors.split(',');
	const elements = await Promise.all(selectorList.map(s => waitForElementAsync(s)));
	for (const element of elements) if (element) callback(element);
};

export const getARGBPixels = (imageDataData: ImageDataArray): Uint32Array => {
	const dataLength = imageDataData.length;
	const result = new Uint32Array(dataLength >> 2);

	for (let i = 3, j = 0; i < dataLength; i += 4, j++) {
		const r = imageDataData[i - 3]!;
		const g = imageDataData[i - 2]!;
		const b = imageDataData[i - 1]!;
		const a = imageDataData[i]!;

		result[j] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
	}

	return result;
};

export const copyTextToClipboard = async (text: string): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
	} catch (err) {
		console.warn('剪贴板写入失败，降级使用上古魔法喵...', err);
		// 只有在极度受限的环境（通常是安全上下文问题）才降级
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		textarea.remove();
	}
};

export const isFMSession = (): boolean => !!betterncm.ncm.getPlayingSong()?.from.fm;
export const isPureMusicLyrics = (lyrics: LyricLine[]): boolean => {
	return (
		lyrics[0]?.unsynced ||
		lyrics.length === 1 ||
		(lyrics.length <= 10 && lyrics.some(x => x.originalLyric.includes('纯音乐')))
	);
};

// 看不懂喵
export const cyrb53 = (str: string, seed = 0): number => {
	let h1 = 0xdeadbeef ^ seed,
		h2 = 0x41c6ce57 ^ seed;
	for (let i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
