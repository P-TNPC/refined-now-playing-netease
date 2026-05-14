import './background.scss';
import { getGradientFromPalette } from './color-utils.js';
import { getPalette } from 'colorthief';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSetting, useNativeAudioEvent } from './hooks.js';

declare const registerAudioLevelCallback: ((callback: (value: number) => void) => void) | undefined;
declare const unregisterAudioLevelCallback: ((callback: (value: number) => void) => void) | undefined;

// 缓存 URL 生成器（用 800px 防糊，毕竟背景尺寸大）
const buildCacheUrl = (url: string) => {
	return url ? `orpheus://cache/?${url}?imageView&enlarge=1&thumbnail=800y800&type=webp` : '';
};

// 主调度组件
export function Background() {
	const type = useSetting('background-type', 'blur');
	const staticFluid = useSetting('static-fluid', false);
	const [coverUrl, setCoverUrl] = useState('');
	const [fallbackUrl, setFallbackUrl] = useState('');

	// 统一拉取数据
	const fetchCover = useCallback(() => {
		const rawUrl = betterncm.ncm.getPlayingSong()?.data.album.picUrl ?? '';
		setFallbackUrl(rawUrl);
		setCoverUrl(buildCacheUrl(rawUrl));
	}, []);

	useEffect(() => fetchCover(), [fetchCover]);
	useNativeAudioEvent('Load', fetchCover); // 切歌自动重绘背景

	const handleImgError = useCallback(() => {
		if (coverUrl !== fallbackUrl) setCoverUrl(fallbackUrl);
	}, [coverUrl, fallbackUrl]);

	return (
		<>
			{/* 隐藏图片，触发 onError */}
			{coverUrl && <img src={coverUrl} alt='' onError={handleImgError} style={{ display: 'none' }} />}

			{type === 'blur' && <BlurBackground url={coverUrl} />}
			{type === 'gradient' && <GradientBackground url={coverUrl} />}
			{type === 'fluid' && <FluidBackground url={coverUrl} static={staticFluid} />}
			{type === 'solid' && <SolidBackground />}
			{type === 'none' && (
				<>
					<div className='rnp-background-none'></div>
					<style>
						{`
							body.mq-playing .g-single { background: transparent !important; }
							body.mq-playing .g-sd, body.mq-playing .g-mn { opacity: 0; }
                        `}
					</style>
				</>
			)}
		</>
	);
}

// 各种背景组件
function SolidBackground() {
	return <div className='rnp-background-solid'></div>;
}
function BlurBackground({ url }: { url: string }) {
	return <div className='rnp-background-blur' style={{ backgroundImage: url ? `url(${url})` : 'none' }} />;
}
function GradientBackground({ url }: { url: string }) {
	const defaultGradient = 'linear-gradient(-45deg, #666, #fff)';
	const [gradient, setGradient] = useState(defaultGradient);

	useEffect(() => {
		if (!url) return setGradient(defaultGradient);

		const abortController = new AbortController();
		const image = new Image();
		// image.crossOrigin = 'Anonymous';
		image.onload = async () => {
			try {
				const palette = await getPalette(image, {
					colorCount: 10,
					signal: abortController.signal,
				});

				const rgbPalette = palette?.map(c => c.array()) ?? [];
				setGradient(getGradientFromPalette(rgbPalette) ?? defaultGradient);
			} catch (e) {
				if (e instanceof Error && e.name === 'AbortError') return;
				console.error('Palette extraction failed:', e);
				setGradient(defaultGradient);
			}
		};
		image.onerror = () => setGradient(defaultGradient);

		image.src = url;

		return () => {
			abortController.abort();
			image.src = '';
		};
	}, [url]);

	return <div className='rnp-background-gradient' style={{ backgroundImage: gradient }} />;
}
// 重量级选手
function FluidBackground({ url, static: isStatic }: { url: string; static: boolean }) {
	const canvasRefs = [
		useRef<HTMLCanvasElement>(null),
		useRef<HTMLCanvasElement>(null),
		useRef<HTMLCanvasElement>(null),
		useRef<HTMLCanvasElement>(null),
	] as const;
	const feTurbulence = useRef<SVGFETurbulenceElement>(null);
	const feDisplacementMap = useRef<SVGFEDisplacementMapElement>(null);

	const [isPlaying, setIsPlaying] = useState(() => betterncm.ncm.getPlayingSong()?.state === 2);

	useNativeAudioEvent('PlayState', (_, stateStr) => {
		if (stateStr.includes('|resume|')) setIsPlaying(true);
		else if (stateStr.includes('|pause|')) setIsPlaying(false);
	});

	const randomDelays = useMemo(() => {
		if (!url) return { rectDelay: 0, canvasDelay: 0, seed: 0 };
		return {
			rectDelay: -(Math.random() * 150).toFixed(2),
			canvasDelay: -(Math.random() * 60).toFixed(2),
			seed: Math.trunc(Math.random() * 1000),
		};
	}, [url]);

	// 切歌时重绘 Canvas 阵列
	useEffect(() => {
		if (!url) return;
		const image = new Image();
		// image.crossOrigin = 'Anonymous';
		image.onload = () => {
			const { width, height } = image;
			const [ctx0, ctx1, ctx2, ctx3] = canvasRefs.map(ref => {
				const ctx = ref.current!.getContext('2d');
				if (ctx) ctx.filter = 'blur(5px)';
				return ctx;
			});

			ctx0?.drawImage(image, 0, 0, width / 2, height / 2, 0, 0, 100, 100);
			ctx1?.drawImage(image, width / 2, 0, width / 2, height / 2, 0, 0, 100, 100);
			ctx2?.drawImage(image, 0, height / 2, width / 2, height / 2, 0, 0, 100, 100);
			ctx3?.drawImage(image, width / 2, height / 2, width / 2, height / 2, 0, 0, 100, 100);
		};
		image.src = url;

		if (feTurbulence.current) feTurbulence.current.seed.baseVal = randomDelays.seed;
	}, [url, randomDelays.seed]);

	// 自适应窗口缩放
	useEffect(() => {
		const onResize = () => {
			const { innerWidth: width, innerHeight: height } = window;
			const viewSize = Math.max(width, height);
			const canvasSize = viewSize * 0.707;

			for (let x = 0; x <= 1; x++) {
				for (let y = 0; y <= 1; y++) {
					const canvas = canvasRefs[y * 2 + x]!.current!;

					canvas.style.width = `${canvasSize}px`;
					canvas.style.height = `${canvasSize}px`;

					const signX = x === 0 ? -1 : 1;
					const signY = y === 0 ? -1 : 1;

					canvas.style.left = `${width / 2 + signX * canvasSize * 0.35 - canvasSize / 2}px`;
					canvas.style.top = `${height / 2 + signY * canvasSize * 0.35 - canvasSize / 2}px`;
				}
			}
		};
		window.addEventListener('resize', onResize);
		onResize(); // 初始化调一次
		return () => window.removeEventListener('resize', onResize);
	}, []);

	const setDisplacementScale = useCallback((value: number) => {
		if (feDisplacementMap.current) feDisplacementMap.current.scale.baseVal = value;
	}, []);

	// 音频响应
	const rafRef = useRef(0);
	useEffect(() => {
		// 适配 LibFrontendPlay
		const analyser = loadedPlugins['LibFrontendPlay']?.currentAudioAnalyser;
		if (analyser) {
			const dataArray = new Float32Array(analyser.frequencyBinCount || 1024);
			const animate = () => {
				rafRef.current = requestAnimationFrame(animate);
				if (!isPlaying) return; // 暂停省力

				analyser.getFloatFrequencyData(dataArray);
				const max = Math.max(...Array.from(dataArray));
				const percentage = Math.pow(1.3, max / 20) * 2 - 1;
				setDisplacementScale(Math.min(600, Math.max(200, 800 - percentage * 800)));
			};
			rafRef.current = requestAnimationFrame(animate);
			return () => cancelAnimationFrame(rafRef.current);
		}

		// 适配已失传的 LibVolumeLevelProvider
		if (typeof registerAudioLevelCallback === 'function') {
			const WINDOW_SIZE = 128;
			const MASK = WINDOW_SIZE - 1;
			const audioLevels = new Float32Array(WINDOW_SIZE);

			const maxq = new Int32Array(WINDOW_SIZE);
			let maxqHead = 0,
				maxqTail = 0;
			const minq = new Int32Array(WINDOW_SIZE);
			let minqHead = 0,
				minqTail = 0;

			let now = 0;

			const easeInOutQuint = (x: number) => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2);

			const onAudioLevelChange = (value: number) => {
				if (!isPlaying) return;

				const idx = now & MASK;
				audioLevels[idx] = value;

				// 维护 maxq (递减队列)
				while (maxqTail > maxqHead) {
					const lastIdx = maxq[(maxqTail - 1) & MASK]!;
					if (audioLevels[lastIdx & MASK]! > value) break;
					maxqTail--;
				}
				maxq[maxqTail & MASK] = now;
				maxqTail++;

				// 淘汰过期 max
				while (maxqHead < maxqTail && maxq[maxqHead & MASK]! <= now - WINDOW_SIZE) maxqHead++;

				// 维护 minq (递增队列)
				while (minqTail > minqHead) {
					const lastIdx = minq[(minqTail - 1) & MASK]!;
					if (audioLevels[lastIdx & MASK]! < value) break;
					minqTail--;
				}
				minq[minqTail & MASK] = now;
				minqTail++;

				// 淘汰过期 min
				while (minqHead < minqTail && minq[minqHead & MASK]! <= now - WINDOW_SIZE) minqHead++;

				// 预热，不做平滑插值
				if (++now <= WINDOW_SIZE) return setDisplacementScale(400 - value * 200);

				// 当前窗口内的极值
				const currentMax = audioLevels[maxq[maxqHead & MASK]! & MASK]!;
				const currentMin = audioLevels[minq[minqHead & MASK]! & MASK]!;

				const range = currentMax - currentMin;
				let percentage = range === 0 ? 1 / 3 : (value - currentMin) / range; // 避免除以 0

				percentage = easeInOutQuint(percentage);
				const scale = 500 - percentage * 300;

				if (!feDisplacementMap.current) return;
				const oldScale = feDisplacementMap.current.scale.baseVal;
				setDisplacementScale(oldScale + (scale - oldScale) * 0.1);
			};

			registerAudioLevelCallback(onAudioLevelChange);
			return () => {
				if (typeof unregisterAudioLevelCallback === 'function') unregisterAudioLevelCallback(onAudioLevelChange);
				setDisplacementScale(400); // 清理战场
			};
		}
		return () => {}; // 抑制 TS 警告
	}, [isPlaying, url, setDisplacementScale]);

	return (
		<>
			<style type='text/css'>
				{`
					body.static-fluid .rnp-background-fluid-rect {
						animation-play-state: paused !important;
						animation-delay: ${randomDelays.rectDelay}s !important;
					}
					body.static-fluid .rnp-background-fluid-rect canvas {
						animation-play-state: paused !important;
						animation-delay: ${randomDelays.canvasDelay}s !important;
					}
				`}
			</style>

			<svg width='0' height='0' style={{ position: 'absolute' }}>
				<filter
					id='fluid-filter'
					x='-20%'
					y='-20%'
					width='140%'
					height='140%'
					filterUnits='objectBoundingBox'
					primitiveUnits='userSpaceOnUse'
					colorInterpolationFilters='sRGB'
				>
					<feTurbulence ref={feTurbulence} type='fractalNoise' baseFrequency='0.005' numOctaves='1' seed='0' />
					{isStatic ? (
						<feDisplacementMap in='SourceGraphic' scale='400' />
					) : (
						<feDisplacementMap ref={feDisplacementMap} in='SourceGraphic' scale='400' />
					)}
				</filter>
			</svg>

			<div className='rnp-background-fluid' style={{ backgroundImage: url ? `url(${url})` : 'none' }}>
				<div className={`rnp-background-fluid-rect ${!isPlaying ? 'paused' : ''}`}>
					<canvas ref={canvasRefs[0]} className='rnp-background-fluid-canvas' width='100' height='100' />
					<canvas ref={canvasRefs[1]} className='rnp-background-fluid-canvas' width='100' height='100' />
					<canvas ref={canvasRefs[2]} className='rnp-background-fluid-canvas' width='100' height='100' />
					<canvas ref={canvasRefs[3]} className='rnp-background-fluid-canvas' width='100' height='100' />
				</div>
			</div>
		</>
	);
}
