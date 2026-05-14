import './progressbar-preview.scss';
import type { LyricLine } from './liblyric/index.js';
import { getSetting, isPureMusicLyrics } from './utils.js';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLyrics, useNativeAudioEvent } from './hooks.js';

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

export function ProgressbarPreview({ dom }: { dom: HTMLElement }) {
	const [visible, setVisible] = useState(false);
	const [totalLength, setTotalLength] = useState(0);
	const [previewState, setPreviewState] = useState({
		currentTime: 0,
		currentLine: -1,
		nonInterludeIndex: 0,
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const xRef = useRef(0);
	const rafIdRef = useRef(0);

	// 在此初始化以防竞态问题
	useEffect(() => {
		let isMounted = true;
		betterncm.utils
			.waitForFunction(() => betterncm.ncm.getPlayingSong()?.data.duration, 200)
			.then(duration => {
				if (!isMounted || !duration) return;
				setTotalLength(duration);
			});
		return () => {
			isMounted = false;
		};
	}, []);

	useNativeAudioEvent('Load', (_, { duration }) => {
		if (duration) setTotalLength(duration * 1000); // 单位秒
	});

	const lyricsData = useLyrics();
	const lyrics = lyricsData?.lyrics ?? [];

	const interludeMap = useMemo(() => {
		const map: number[] = [];
		let count = 0;
		for (const l of lyrics) map.push(!l.isInterlude ? ++count : count);
		return map;
	}, [lyrics]);
	const nonInterludeCount = interludeMap.length > 0 ? interludeMap[interludeMap.length - 1]! : 0;

	const isPureMusic = useMemo(() => isPureMusicLyrics(lyrics), [lyrics]);

	const updatePosition = useCallback((rect: DOMRect) => {
		if (!containerRef.current) return;

		const { clientWidth: width, clientHeight: height } = containerRef.current;
		const left = Math.max(0, Math.min(xRef.current - width / 2, window.innerWidth - width));

		containerRef.current.style.transform = `translate(${left}px, ${rect.top - height - 5}px)`;
	}, []);

	const updateHoverContent = useCallback(
		(rect: DOMRect): void => {
			if (totalLength === 0) return;
			const percent = Math.max(0, Math.min((xRef.current - rect.left) / rect.width, 1));
			const currentTime = totalLength * percent;

			if (lyrics.length === 0) return setPreviewState(prev => ({ ...prev, currentTime, currentLine: -1 }));

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
		},
		[totalLength, lyrics, interludeMap],
	);

	useEffect(() => {
		if (!dom) return;

		const scheduleUpdate = () => {
			rafIdRef.current ||= requestAnimationFrame(() => {
				const rect = dom.getBoundingClientRect();
				updateHoverContent(rect);
				updatePosition(rect);
				rafIdRef.current = 0;
			});
		};

		const onMouseEnter = (e: MouseEvent) => {
			xRef.current = e.clientX;
			setVisible(true);
			const rect = dom.getBoundingClientRect();
			updateHoverContent(rect);
			updatePosition(rect);
		};

		const onMouseLeave = () => {
			setVisible(false);
			if (!rafIdRef.current) return;
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = 0;
		};

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
		if (!container || !dom) return;

		const observer = new ResizeObserver(() => updatePosition(dom.getBoundingClientRect()));
		observer.observe(container);
		return () => observer.disconnect();
	}, [dom, updatePosition]);

	const { currentLine, currentTime, nonInterludeIndex } = previewState;
	const currentLyricObj: LyricLine | undefined = lyrics[currentLine];

	const hasLyricObj = !!currentLyricObj;
	const isInterlude = hasLyricObj && currentLyricObj.isInterlude;
	const hasContentLine = hasLyricObj && !isInterlude;

	const hasDynamicLyric = hasContentLine && !!currentLyricObj.dynamicLyric?.length;
	const hasOriginalLyric = hasContentLine && !!currentLyricObj.originalLyric;
	const hasTranslatedLyric = hasContentLine && !!currentLyricObj.translatedLyric;

	const safeDuration = hasLyricObj ? currentLyricObj.duration || totalLength - currentLyricObj.time || 1 : 1;
	const widthPercent = hasLyricObj
		? Math.max(0, Math.min(100, ((currentTime - currentLyricObj.time) / safeDuration) * 100))
		: 0;

	const timeDisplay = hasLyricObj
		? {
				left: formatTime(currentLyricObj.time / 1000),
				right: formatTime(
					(currentLyricObj.duration > 0 ? currentLyricObj.time + currentLyricObj.duration : totalLength) / 1000,
				),
			}
		: {
				left: formatTime(currentTime / 1000),
				right: formatTime(totalLength / 1000),
			};

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
