export interface DynamicLyricWord {
	time: number;
	duration: number;
	flag: number;
	word: string;
	isCJK: boolean;
	endsWithSpace: boolean;
	trailing: boolean;
}

export interface BaseLyricLine {
	time: number;
	unsynced: boolean;
	translatedLyric?: string;
	romanLyric?: string;
	rawLyric?: string;
}

export interface LyricLine extends BaseLyricLine {
	duration: number;
	isInterlude: boolean;
	originalLyric: string;
	dynamicLyricTime?: number;
	dynamicLyric?: DynamicLyricWord[];
}

export interface LyricPureLine extends BaseLyricLine {
	lyric: string;
	originalLyric?: string;
}

const PURE_MUSIC_LYRIC_LINE: LyricLine[] = [
	{
		time: 0,
		duration: 5940000,
		originalLyric: '纯音乐，请欣赏',
		unsynced: false,
		isInterlude: false,
	},
];

export const PURE_MUSIC_LYRIC_DATA = {
	sgc: false,
	sfy: false,
	qfy: false,
	needDesc: true,
	lrc: {
		version: 1,
		lyric: '[99:00.00]纯音乐，请欣赏\n',
	},
	code: 200,
	briefDesc: null,
};

// 作用域隔离正则
const BLANK_REGEX = /^\s*$/;
const ENDS_WITH_SPACE_REGEX = /\s$/;
const STARTS_WITH_SPACE_REGEX = /^\s/;
const PUNCTUATION_REGEX = /[\p{P}\p{S}]/u;
const LATIN_CONTRACTION_REGEX = /[a-zA-Z]+['’][a-zA-Z]*/u;
const LATIN_SENTENCE_REGEX = /^[\s\w\p{sc=Latin}\p{P}\p{S}]+$/u;
const TRAILING_PUNCTUATION_REGEX = /[.,，。!?？、；：…—~～·‘’“”ﾞ]$/u;
const CJK_REGEX = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

const isBlank = (str: string) => BLANK_REGEX.test(str);
const isLatinSentence = (str: string) => LATIN_SENTENCE_REGEX.test(str);
const isLatinContraction = (str: string) => LATIN_CONTRACTION_REGEX.test(str);
const hasPunctuation = (str: string) => PUNCTUATION_REGEX.test(str);
const hasTrailingPunctuation = (str: string) => TRAILING_PUNCTUATION_REGEX.test(str);
const hasCJK = (str: string) => CJK_REGEX.test(str);
const startsWithSpace = (str: string) => STARTS_WITH_SPACE_REGEX.test(str);
const endsWithSpace = (str: string) => ENDS_WITH_SPACE_REGEX.test(str);

const PUNCTUATION_MAP: Record<string, string> = {
	'‘': "'",
	'’': "'",
	'′': "'",
	'“': '"',
	'”': '"',
	'″': '"',
	'（': '(',
	'）': ')',
	'，': ',',
	'！': '!',
	'？': '?',
	'：': ':',
	'；': ';',
};
const NON_ASCII_PUNCTUATION_REGEX = /[‘’′“”″（），！？：；]/g;
const normalizePunctuation = (str: string) => str.replace(NON_ASCII_PUNCTUATION_REGEX, match => PUNCTUATION_MAP[match]!);

export function parseLyric(
	original: string,
	dynamic: string = '',
	translation: string = '',
	roman: string = '',
	dynamicTranslation: string = '',
	dynamicRoman: string = '',
): LyricLine[] {
	const editDistanceCache = new Map<string, number>();

	const MAX_LEN = 512;
	const sharedBuffer = new Uint16Array(MAX_LEN);

	function calcEditDistance(a = '', b = '') {
		if (a.length > b.length || (a.length === b.length && a > b)) [a, b] = [b, a];

		const key = `${a}\0${b}`;
		const cached = editDistanceCache.get(key);
		if (cached !== undefined) return cached;

		const m = a.length;
		const n = b.length;

		const d = m + 1 <= MAX_LEN ? sharedBuffer : new Uint16Array(m + 1);

		for (let i = 0; i <= m; i++) d[i] = i;
		for (let j = 1; j <= n; j++) {
			let preDiag = d[0]!;
			d[0] = j;
			for (let i = 1; i <= m; i++) {
				const temp = d[i]!;
				d[i] = a[i - 1] === b[j - 1] ? preDiag : 1 + Math.min(preDiag, d[i - 1]!, temp);
				preDiag = temp;
			}
		}
		const result = d[m]!;

		editDistanceCache.set(key, result);
		return result;
	}

	if (isBlank(dynamic)) {
		const originalLyrics = parsePureLyric(original);
		const result: LyricLine[] = [];

		const timeIndexMap = new Map<number, LyricLine>();
		for (const { time, lyric, unsynced } of originalLyrics) {
			const line: LyricLine = {
				time,
				originalLyric: lyric,
				duration: 0,
				unsynced,
				isInterlude: false,
			};
			result.push(line);
			// if (!timeIndexMap.has(time)) timeIndexMap.set(time, line);
			timeIndexMap.set(time, line); // 有人会用好几个 [00:00.00] 标元数据，所以用后的覆盖前的
		}

		// 挂载翻译
		for (const line of parsePureLyric(dynamicTranslation || translation)) {
			const target = timeIndexMap.get(line.time);
			if (target) target.translatedLyric = line.lyric;
		}

		// 挂载罗马音
		for (const line of parsePureLyric(dynamicRoman || roman)) {
			const target = timeIndexMap.get(line.time);
			if (target) target.romanLyric = line.lyric;
		}

		const processed = processLyric(result);
		for (let i = 0; i < processed.length - 1; i++) processed[i]!.duration = processed[i + 1]!.time - processed[i]!.time;

		return processed;
	}

	const processed = parsePureDynamicLyric(dynamic);
	const originalLyrics = parsePureLyric(original);

	// 挂载 rawLyric（双指针对齐）
	if (originalLyrics.length > 0) {
		let ptr = 0;
		for (const { time, lyric } of originalLyrics) {
			if (ptr >= processed.length) break;
			while (
				ptr + 1 < processed.length &&
				Math.abs(processed[ptr + 1]!.time - time) <= Math.abs(processed[ptr]!.time - time)
			) {
				ptr++;
			}
			const processedLine = processed[ptr]!;
			processedLine.rawLyric = `${processedLine.rawLyric ? processedLine.rawLyric + ' ' : ''}${lyric}`;
		}
	}

	// 挂载精确对齐的逐字翻译/罗马音
	const attachDynamicExtraLyric = (lyricStr: string, field: 'translatedLyric' | 'romanLyric') => {
		if (isBlank(lyricStr)) return;
		const extraLyrics = parsePureLyric(lyricStr);
		let ptr = 0;
		for (const { time, lyric } of extraLyrics) {
			if (ptr >= processed.length) break;
			while (
				ptr + 1 < processed.length &&
				Math.abs(processed[ptr + 1]!.time - time) <= Math.abs(processed[ptr]!.time - time)
			) {
				ptr++;
			}
			const processedLine = processed[ptr]!;
			processedLine[field] = `${processedLine[field] ? processedLine[field] + ' ' : ''}${lyric}`;
		}
	};

	// 挂载模糊对齐的逐行翻译/罗马音（含相似度计算）
	const attachLineExtraLyric = (lyricStr: string, field: 'translatedLyric' | 'romanLyric') => {
		if (isBlank(lyricStr)) return;
		const lyricParsed = parsePureLyric(lyricStr);
		if (lyricParsed.length === 0) return;

		const lyricTimeSet = new Set(lyricParsed.map(v => v.time));
		const originalLyricTimeSet = new Set(originalLyrics.map(v => v.time));

		let intersectCount = 0;
		let attachMatchingMode = 'equal';
		for (const t of lyricTimeSet) if (originalLyricTimeSet.has(t)) intersectCount++;
		if (intersectCount / (lyricTimeSet.size || 1) < 0.1) attachMatchingMode = 'closest';

		let lyricPtr = 0;
		for (const { time: origTime, lyric: origLyric } of originalLyrics) {
			if (lyricPtr >= lyricParsed.length) break;
			while (
				lyricPtr + 1 < lyricParsed.length &&
				Math.abs(lyricParsed[lyricPtr + 1]!.time - origTime) <= Math.abs(lyricParsed[lyricPtr]!.time - origTime)
			) {
				lyricPtr++;
			}
			const target = lyricParsed[lyricPtr]!;
			if (attachMatchingMode === 'equal' && Math.abs(target.time - origTime) >= 20) continue;
			target.originalLyric = `${target.originalLyric ? target.originalLyric + ' ' : ''}${origLyric}`;
		}

		let ptr = 0;
		for (const { time, lyric, originalLyric } of lyricParsed) {
			if (ptr >= processed.length) break;
			while (
				ptr + 1 < processed.length &&
				Math.abs(processed[ptr + 1]!.time - time) <= Math.abs(processed[ptr]!.time - time)
			) {
				ptr++;
			}

			let targetIndex = ptr;
			let sequence = [targetIndex];
			for (let offset = 1; offset <= 5; offset++) {
				if (targetIndex - offset >= 0) sequence.push(targetIndex - offset);
				if (targetIndex + offset < processed.length) sequence.push(targetIndex + offset);
			}

			let minWeight = Infinity;
			for (const index of sequence) {
				const v = processed[index]!;
				const similarity = calcEditDistance(originalLyric, v.originalLyric);
				const weight = similarity * 1000 + (v[field] ? 1 : 0);
				if (weight >= minWeight) continue;
				minWeight = weight;
				targetIndex = index;
			}

			const processedLine = processed[targetIndex]!;
			processedLine[field] = `${processedLine[field] ? processedLine[field] + ' ' : ''}${lyric}`;
		}
	};

	// 数据源分发
	if (dynamicTranslation) attachDynamicExtraLyric(dynamicTranslation, 'translatedLyric');
	else attachLineExtraLyric(translation, 'translatedLyric');

	if (dynamicRoman) attachDynamicExtraLyric(dynamicRoman, 'romanLyric');
	else attachLineExtraLyric(roman, 'romanLyric');

	// 插入空行
	for (let i = processed.length - 2; i >= 0; i--) {
		const thisLine = processed[i]!;
		const nextLine = processed[i + 1]!;
		if (isBlank(thisLine.originalLyric) || isBlank(nextLine.originalLyric) || thisLine.duration <= 0) continue;

		const thisLineEndTime = (thisLine.dynamicLyricTime ?? thisLine.time) + thisLine.duration;
		const nextLineStartTime = Math.min(nextLine.time, nextLine.dynamicLyricTime ?? Infinity);
		if (nextLineStartTime - thisLineEndTime < 5000) continue;

		processed.splice(i + 1, 0, {
			time: thisLineEndTime,
			originalLyric: '',
			duration: nextLineStartTime - thisLineEndTime,
			unsynced: false,
			isInterlude: true,
		});
	}

	for (const line of processed) {
		const dynamic = line.dynamicLyric;
		if (!dynamic?.length) continue;

		// 正向遍历：同步原文空格到逐字
		const raw = line.rawLyric ?? '';
		const spaceRegex = /\s+/y;
		let offset = 0;
		for (const item of dynamic) {
			const wordText = item.endsWithSpace ? item.word.slice(0, -1) : item.word;
			if (!raw.startsWith(wordText, offset)) break;

			offset += wordText.length;
			spaceRegex.lastIndex = offset;
			if (!spaceRegex.exec(raw)) continue;

			offset = spaceRegex.lastIndex;

			if (item.endsWithSpace) continue;
			item.word += ' ';
			item.endsWithSpace = true;
		}

		// 逆向遍历：标记尾部拖长音
		let searchingForTarget = false;
		for (let k = dynamic.length - 1; k >= 0; k--) {
			const item = dynamic[k]!;
			const word = item.word;

			const hasBoundaryMarker = k === dynamic.length - 1 || item.endsWithSpace || hasTrailingPunctuation(word);
			if (hasBoundaryMarker && !isLatinContraction(word)) searchingForTarget = true;
			if (!searchingForTarget) continue;

			if (isBlank(word) || hasPunctuation(word)) continue;

			if (item.duration >= 1000) item.trailing = true;
			searchingForTarget = false;
		}
	}

	return processLyric(processed);
}

const yrcLineRegexp = /^\[(?<time>\d+),(?<duration>\d+)\](?<line>.*)/;
const globalYrcWordTimeRegexp = /\((?<time>\d+),(?<duration>\d+),(?<flag>\d+)\)(?<word>[^(]*)/g;
const metaTimeRegexp = /^\[(?:(?<min>\d+):)?(?<sec>\d+(?:[.:]\d+)?)-(?<discriminator>\d+)\]/;
const globalTimeRegexp = /\[(?:(?<min>\d+):)?(?<sec>\d+(?:[.:]\d+)?)\]/g;

const isMetaTimeLine = (str: string) => metaTimeRegexp.test(str);

function parsePureLyric(lyric: string): LyricPureLine[] {
	const trimmedLyric = lyric.trim();
	if (!trimmedLyric) return [];

	const result: LyricPureLine[] = [];
	let needsSorting = false;
	let lastTime = -1;

	for (const line of trimmedLyric.split('\n')) {
		const text = line.trimStart();
		if (!text) continue;

		const timestamps: number[] = [];
		let expectedIndex = 0;

		for (const match of text.matchAll(globalTimeRegexp)) {
			if (match.index !== expectedIndex) break;
			expectedIndex += match[0].length;
			if (!match.groups) continue;

			const min = +(match.groups['min'] ?? 0);
			let secStr = match.groups['sec'] ?? '0';
			if (secStr.includes(':')) secStr = secStr.replace(':', '.');
			const sec = +secStr;

			if (!Number.isNaN(min) && !Number.isNaN(sec)) timestamps.push(Math.floor((min * 60 + sec) * 1000));
		}

		if (timestamps.length === 0) continue;

		const lyricText = text.slice(expectedIndex).trim();

		for (const time of timestamps) {
			if (time < lastTime) needsSorting = true;
			lastTime = time;

			result.push({ time, lyric: lyricText, unsynced: false });
		}
	}

	return result.length === 0 ? parseUnsyncedLyrics(lyric) : needsSorting ? result.sort((a, b) => a.time - b.time) : result;
}

function parseUnsyncedLyrics(lyric: string): LyricPureLine[] {
	const trimmedLyric = lyric.trim();
	if (!trimmedLyric) return [];

	const result: LyricPureLine[] = [
		{
			time: 0,
			lyric: '歌词不支持滚动',
			unsynced: true,
		},
	];

	for (const line of trimmedLyric.split('\n')) {
		const currentLyric = line.trim();
		if (!currentLyric || isMetaTimeLine(currentLyric)) continue;

		result.push({
			time: 999999999,
			lyric: currentLyric,
			unsynced: true,
		});
	}

	return result.length === 1 ? [] : result;
}

function parsePureDynamicLyric(lyric: string): LyricLine[] {
	const result: LyricLine[] = [];

	let needsSorting = false;
	let lastLineTime = -1;

	for (const line of lyric.trim().split('\n')) {
		const trimmedLine = line.trim();
		const lineMatches = trimmedLine.match(yrcLineRegexp);
		if (!lineMatches?.groups) continue;

		const time = +(lineMatches.groups['time'] ?? 0);
		const duration = +(lineMatches.groups['duration'] ?? 0);
		const lineText = lineMatches.groups['line'] ?? '';

		if (time < lastLineTime) needsSorting = true;
		lastLineTime = time;

		const words: DynamicLyricWord[] = [];
		let originalLyricStr = '';

		for (const wordMatches of lineText.matchAll(globalYrcWordTimeRegexp)) {
			if (!wordMatches.groups) continue;

			const wordTime = +(wordMatches.groups['time'] ?? 0);
			const wordDuration = +(wordMatches.groups['duration'] ?? 0);
			const flag = +(wordMatches.groups['flag'] ?? 0);

			const rawWord = wordMatches.groups['word'] ?? '';
			if (!rawWord) continue;

			const splitWords = rawWord.split(/\s+/).filter(s => s.length > 0);
			const splitLen = splitWords.length;
			if (splitLen === 0) continue;

			const splitDuration = Math.round(wordDuration / splitLen);
			const lastIdx = splitLen - 1;

			if (startsWithSpace(rawWord)) splitWords[0] = ` ${splitWords[0]}`;
			if (endsWithSpace(rawWord)) splitWords[lastIdx] = `${splitWords[lastIdx]} `;

			splitWords.forEach((word, i) => {
				const formattedWord = i !== lastIdx ? `${word} ` : word;

				originalLyricStr += formattedWord;
				words.push({
					time: Math.round(wordTime + i * splitDuration),
					duration: splitDuration,
					flag,
					word: formattedWord,
					isCJK: hasCJK(formattedWord),
					endsWithSpace: endsWithSpace(formattedWord),
					trailing: false,
				});
			});
		}

		result.push({
			time,
			duration,
			originalLyric: originalLyricStr,
			dynamicLyric: words,
			dynamicLyricTime: time,
			unsynced: false,
			isInterlude: false,
		});
	}

	return needsSorting ? result.sort((a, b) => a.time - b.time) : result;
}

/**
 * 此函数会更改传入的 lyric
 */
function processLyric(lyric: LyricLine[]): LyricLine[] {
	const len = lyric.length;
	if (len === 0) return [];

	const lastLine = lyric[len - 1]!;
	if (lastLine.time === 5940000 && lastLine.duration === 0) return PURE_MUSIC_LYRIC_LINE.map(v => ({ ...v }));

	const result: LyricLine[] = [];
	let lastPushedEmpty = false;
	for (let i = 0; i < len; i++) {
		const current = lyric[i]!;

		if (isBlank(current.originalLyric)) {
			const next = lyric[i + 1];
			if (!next) break;

			if (result.length === 0 || lastPushedEmpty || next.time - current.time <= 5000) continue;

			current.isInterlude = true;
			result.push(current);
			lastPushedEmpty = true;
			continue;
		}

		if (isLatinSentence(current.originalLyric)) {
			current.originalLyric = normalizePunctuation(current.originalLyric);
			if (current.dynamicLyric) for (const item of current.dynamicLyric) item.word = normalizePunctuation(item.word);
		}

		if (result.length === 0 && current.time > 5000) {
			result.push({
				time: 500,
				duration: current.time - 500,
				originalLyric: '',
				unsynced: false,
				isInterlude: true,
			});
		}

		result.push(current);
		lastPushedEmpty = false;
	}

	return result;
}
