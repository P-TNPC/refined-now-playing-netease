import './progressbar-preview.scss';
import type { LyricLine } from './liblyric/index.js';
import { getSetting, isFMSession } from './utils.js';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNativeAudioEvent } from './hooks.js';

if (getSetting('enable-progressbar-preview', true)) document.body.classList.add('enable-progressbar-preview');

function formatTime(time: number): string {
	if (Number.isNaN(time) || time < 0) return '0:00';
	const h = Math.floor(time / 3600);
	const m = Math.floor((time % 3600) / 60);
	const s = Math.floor(time % 60);
	return `${h ? `${h}:` : ''}${h ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
}

function findLyricIndex(lyrics: LyricLine[], time: number): number {
	let left = 0,
		right = lyrics.length - 1;
	while (left <= right) {
		const mid = (left + right) >> 1;
		if (lyrics[mid]!.time <= time) left = mid + 1;
		else right = mid - 1;
	}
	return right;
}

export function ProgressbarPreview({ dom, isFM }: { dom: HTMLElement; isFM: boolean }) {
	const isCurrentModeSession = useCallback(() => {
		return isFM ? isFMSession() : !isFMSession();
	}, [isFM]);

	const [visible, setVisible] = useState(false);
	const [lyrics, setLyrics] = useState<LyricLine[]>([]);
	const [totalLength, setTotalLength] = useState(betterncm.ncm.getPlayingSong()?.data.duration ?? 0);

	const [interludeMap, setInterludeMap] = useState<number[]>([]);

	const [previewState, setPreviewState] = useState({
		currentTime: 0,
		currentLine: -1,
		nonInterludeIndex: 0,
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const xRef = useRef(0);
	const rafIdRef = useRef(0);

	const nonInterludeCount = useMemo((): number => {
		return interludeMap.length > 0 ? interludeMap[interludeMap.length - 1]! : 0;
	}, [interludeMap]);

	useEffect(() => {
		const buildInterludeMap = (newLyrics: LyricLine[]) => {
			if (!newLyrics) return [];
			const map: number[] = [];
			let count = 0;
			for (const l of newLyrics) map.push(!l.isInterlude ? ++count : count);
			return map;
		};

		const onLyricsUpdate = (e: CustomEvent<{ lyrics: LyricLine[] }>) => {
			if (!isCurrentModeSession() || !e.detail) return;
			setLyrics(e.detail.lyrics);
			setInterludeMap(buildInterludeMap(e.detail.lyrics));
		};

		if (window.currentLyrics && isCurrentModeSession()) {
			setLyrics(window.currentLyrics.lyrics);
			setInterludeMap(buildInterludeMap(window.currentLyrics.lyrics));
		}

		document.addEventListener('lyrics-updated', onLyricsUpdate);
		return () => document.removeEventListener('lyrics-updated', onLyricsUpdate);
	}, [isCurrentModeSession]);

	useNativeAudioEvent('Load', (_, info) => {
		if (info.duration) setTotalLength(info.duration * 1000);
	});

	const updatePosition = useCallback(() => {
		if (!containerRef.current || !dom) return;
		const width = containerRef.current.clientWidth;
		const height = containerRef.current.clientHeight;
		const rect = dom.getBoundingClientRect();

		const left = Math.max(0, Math.min(xRef.current - width / 2, window.innerWidth - width));

		containerRef.current.style.transform = `translate(${left}px, ${rect.top - height - 5}px)`;
	}, [dom]);

	const updateHoverContent = useCallback((): void => {
		if (!dom || totalLength === 0) return;
		const rect = dom.getBoundingClientRect();
		const percent = Math.max(0, Math.min((xRef.current - rect.left) / rect.width, 1));
		const currentTime = totalLength * percent;

		if (lyrics.length === 0) {
			setPreviewState(prev => ({ ...prev, currentTime, currentLine: -1 }));
			return;
		}

		const cur = findLyricIndex(lyrics, currentTime);
		const isOutOfRange =
			cur === -1 ||
			(cur === lyrics.length - 1 &&
				lyrics[cur]!.duration &&
				currentTime > lyrics[cur]!.time + lyrics[cur]!.duration + 500);

		setPreviewState(prev =>
			isOutOfRange
				? { ...prev, currentTime, currentLine: -1 }
				: { currentTime, currentLine: cur, nonInterludeIndex: interludeMap[cur]! },
		);
	}, [dom, totalLength, lyrics, interludeMap]);

	useEffect(() => {
		if (!dom) return;

		const scheduleUpdate = () => {
			rafIdRef.current ||= requestAnimationFrame(() => {
				updateHoverContent();
				updatePosition();
				rafIdRef.current = 0;
			});
		};

		const onMouseEnter = (e: MouseEvent) => {
			xRef.current = e.clientX;
			setVisible(true);
			updateHoverContent();
			scheduleUpdate();
		};

		const onMouseLeave = () => setVisible(false);

		const onMouseMove = (e: MouseEvent) => {
			xRef.current = e.clientX;
			scheduleUpdate();
		};

		dom.addEventListener('mouseenter', onMouseEnter);
		dom.addEventListener('mouseleave', onMouseLeave);
		dom.addEventListener('mousemove', onMouseMove);

		return () => {
			dom.removeEventListener('mouseenter', onMouseEnter);
			dom.removeEventListener('mouseleave', onMouseLeave);
			dom.removeEventListener('mousemove', onMouseMove);
			if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
		};
	}, [dom, updateHoverContent, updatePosition]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const observer = new ResizeObserver(() => updatePosition());
		observer.observe(container);
		return () => observer.disconnect();
	}, [updatePosition]);

	const isPureMusic = useMemo((): boolean => {
		return (
			lyrics[0]?.unsynced ||
			lyrics.length === 1 ||
			(lyrics.length <= 10 && lyrics.some(x => x.originalLyric.includes('纯音乐')))
		);
	}, [lyrics]);

	const { currentLine, currentTime, nonInterludeIndex } = previewState;
	const currentLyricObj: LyricLine | undefined = lyrics[currentLine];

	const hasLyricObj = !!currentLyricObj;
	const isInterlude = hasLyricObj && !!currentLyricObj.isInterlude;
	const hasContentLine = hasLyricObj && !isInterlude;

	const hasDynamicLyric = hasContentLine && !!currentLyricObj.dynamicLyric?.length;
	const hasOriginalLyric = hasContentLine && !!currentLyricObj.originalLyric;
	const hasTranslatedLyric = hasContentLine && !!currentLyricObj.translatedLyric;

	const safeDuration = hasLyricObj ? currentLyricObj.duration || totalLength - currentLyricObj.time || 1 : 1;
	const widthPercent = hasLyricObj
		? Math.max(0, Math.min(100, ((currentTime - currentLyricObj.time) / safeDuration) * 100))
		: 0;

	const timeDisplay = useMemo(() => {
		if (!hasLyricObj) {
			return {
				left: formatTime(currentTime / 1000),
				right: formatTime(totalLength / 1000),
			};
		}
		return {
			left: formatTime(currentLyricObj.time / 1000),
			right: formatTime(
				(currentLyricObj.duration > 0 ? currentLyricObj.time + currentLyricObj.duration : totalLength) / 1000,
			),
		};
	}, [currentLyricObj, currentTime, totalLength]);

	return (
		<div
			ref={containerRef}
			className={`progressbar-preview ${visible && !isPureMusic ? '' : 'invisible'}`}
			style={{ position: 'fixed', top: 0, left: 0, willChange: 'transform' }}
		>
			{hasContentLine && (
				<div className='progressbar-preview-number'>
					{nonInterludeIndex} / {nonInterludeCount}
				</div>
			)}

			{isInterlude && <div className='progressbar-preview-line-original'>♪</div>}

			{currentLine === -1 && <div className='progressbar-preview-line-original'>~</div>}

			{hasDynamicLyric && (
				<div className='progressbar-preview-line-karaoke'>
					{currentLyricObj.dynamicLyric!.map((word, i) => {
						const wordDuration = word.duration || 1;
						const percent = (currentTime - word.time) / wordDuration;
						const maskPercent = 100 * (1 - Math.max(0, Math.min(1, percent)));
						return (
							<span
								key={i}
								className={`progressbar-preview-line-karaoke-word ${percent >= 0 && percent <= 1 ? 'current' : ''} ${percent < 0 ? 'upcoming' : ''}`}
								style={{ WebkitMaskPosition: `${maskPercent}%` }}
							>
								{word.word}
							</span>
						);
					})}
				</div>
			)}

			{hasOriginalLyric && !hasDynamicLyric && (
				<div className='progressbar-preview-line-original'>{currentLyricObj.originalLyric}</div>
			)}

			{hasTranslatedLyric && <div className='progressbar-preview-line-translated'>{currentLyricObj.translatedLyric}</div>}

			{hasLyricObj && (
				<div className='progressbar-preview-subprogressbar'>
					<div className='progressbar-preview-subprogressbar-inner' style={{ width: `${widthPercent}%` }} />
				</div>
			)}

			<div className='progressbar-preview-line-time'>
				<div>{timeDisplay.left}</div>
				<div>{timeDisplay.right}</div>
			</div>
		</div>
	);
}
