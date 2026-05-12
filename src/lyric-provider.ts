import { parseLyric, type LyricLine } from './liblyric/index.js';
import { cyrb53 } from './utils.js';

export interface LyricUser {
	nickname: string;
	userid: number;
}

export interface ArtistMeta {
	artistName: string;
	artistId: number;
}

export interface LyricRole {
	roleName: string;
	artistMetaList: ArtistMeta[];
}

export interface RawLyricData {
	data?: number;
	lrc?: { lyric: string };
	ytlrc?: { lyric: string };
	ttlrc?: { lyric: string };
	tlyric?: { lyric: string };
	yromalrc?: { lyric: string };
	romalrc?: { lyric: string };
	yrc?: { lyric: string };
	lyricUser?: LyricUser;
	transUser?: LyricUser;
	roles?: LyricRole[];
	source?: { name: string };
}

export interface ProcessedLyricsData {
	lyrics: LyricLine[];
	contributors: {
		original?: { name: string; userid: number };
		translation?: { name: string; userid: number };
		roles?: LyricRole[];
		lyricSource?: { name: string };
	};
	unsynced: boolean;
	hash: string;
}

declare global {
	interface Window {
		onProcessLyrics?: (rawLyrics: RawLyricData | string, songID: number) => unknown;
		currentLyrics?: ProcessedLyricsData;
	}
	interface DocumentEventMap {
		'lyrics-updated': CustomEvent<ProcessedLyricsData>;
	}
}

const preProcessLyrics = (lyrics: RawLyricData): LyricLine[] => {
	const original = (lyrics.lrc?.lyric ?? '').replace(/\u3000/g, ' ');
	// 逐行翻译与罗马音
	const translation = lyrics.tlyric?.lyric ?? lyrics.ttlrc?.lyric ?? '';
	const roman = lyrics.romalrc?.lyric ?? '';

	// 逐字动态数据
	const dynamic = lyrics.yrc?.lyric ?? '';
	const dynamicTranslation = lyrics.ytlrc?.lyric ?? '';
	const dynamicRoman = lyrics.yromalrc?.lyric ?? '';

	const approxLines = original.match(/\[\d{1,2}:\d{1,2}([.:]\d{1,3})?\]/g)?.length ?? 0;

	const parsed = parseLyric(original, dynamic, translation, roman, dynamicTranslation, dynamicRoman);

	return approxLines - parsed.length > approxLines * 0.7
		? parseLyric(original, '', translation, roman, '', '') // 逐字歌词可能残缺，保守方案
		: parsed;
};

const deduplicateRoles = (roles: LyricRole[] = []): LyricRole[] => {
	const validRoles = roles.filter(
		({ artistMetaList: m }) => !(m.length === 1 && m[0]!.artistName === '无' && m[0]!.artistId === 0),
	);

	const roleMap = new Map<string, LyricRole>();

	for (const role of validRoles) {
		const metaKey = JSON.stringify(role.artistMetaList);
		const existingRole = roleMap.get(metaKey);

		if (existingRole) existingRole.roleName += `、${role.roleName}`;
		else roleMap.set(metaKey, { ...role });
	}

	return Array.from(roleMap.values());
};

let currentRawLRC: string | null = null;
const originalOnProcessLyrics = window.onProcessLyrics ?? ((x: unknown) => x);

window.onProcessLyrics = (rawInput: RawLyricData | string, songID: number) => {
	if (!rawInput || (typeof rawInput === 'object' && rawInput.data === -400)) return originalOnProcessLyrics(rawInput, songID);

	const rawLyrics = typeof rawInput === 'string' ? { lrc: { lyric: rawInput }, source: { name: '本地' } } : rawInput;
	const incomingLyricText = rawLyrics.lrc?.lyric ?? '';
	if (incomingLyricText === currentRawLRC) return originalOnProcessLyrics(rawInput, songID);

	console.log('Update Raw Lyrics', rawLyrics);
	currentRawLRC = incomingLyricText;

	const preprocessedLyrics = preProcessLyrics(rawLyrics);

	// 原生微任务
	queueMicrotask(() => {
		const playingSong = betterncm.ncm.getPlayingSong();
		const playingId = playingSong?.data.id ?? 0;
		const lyricsData: ProcessedLyricsData = {
			lyrics: preprocessedLyrics,
			contributors: {
				roles: deduplicateRoles(rawLyrics.roles),
			},
			unsynced: preprocessedLyrics[0]?.unsynced ?? false,
			hash: `${playingId}-${cyrb53(preprocessedLyrics.map(x => x.originalLyric).join('\\'))}`,
		};

		if (rawLyrics.lyricUser) {
			lyricsData.contributors.original = {
				name: rawLyrics.lyricUser.nickname,
				userid: rawLyrics.lyricUser.userid,
			};
		}
		if (rawLyrics.transUser) {
			lyricsData.contributors.translation = {
				name: rawLyrics.transUser.nickname,
				userid: rawLyrics.transUser.userid,
			};
		}
		if (rawLyrics.source) lyricsData.contributors.lyricSource = rawLyrics.source;

		window.currentLyrics = lyricsData;

		console.group('Update Processed Lyrics');
		console.log('lyrics', lyricsData.lyrics);
		console.log('contributors', lyricsData.contributors);
		console.log('hash', lyricsData.hash);
		console.groupEnd();

		document.dispatchEvent(new CustomEvent('lyrics-updated', { detail: lyricsData }));
	});

	return originalOnProcessLyrics(rawInput, songID);
};
