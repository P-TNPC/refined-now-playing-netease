import { useState, useEffect, useCallback } from 'react';
import { useNativeAudioEvent, useSetting } from './hooks.js';

const buildShadowCacheUrl = (url: string) => {
	return url ? `orpheus://cache/?${url}?imageView&enlarge=1&thumbnail=200y200&type=webp` : '';
};

export function CoverShadow() {
	const isBlurryShadow = useSetting('cover-blurry-shadow', true);
	const rectangleCover = useSetting('rectangle-cover', true);

	const [coverUrl, setCoverUrl] = useState('');
	const [fallbackUrl, setFallbackUrl] = useState('');

	const fetchCover = useCallback(() => {
		const rawUrl = betterncm.ncm.getPlayingSong()?.data.album.picUrl ?? '';
		setFallbackUrl(rawUrl);
		setCoverUrl(buildShadowCacheUrl(rawUrl));
	}, []);

	useEffect(() => fetchCover(), [fetchCover]);
	useNativeAudioEvent('Load', fetchCover);

	const handleImgError = useCallback(() => {
		if (coverUrl !== fallbackUrl) setCoverUrl(fallbackUrl);
		console.log(coverUrl,'加载失败');
	}, [coverUrl, fallbackUrl]);

	if (!coverUrl) return null;

	const borderRadius = rectangleCover ? '16px' : '50%';
	const transform = rectangleCover ? 'translateY(4%)' : 'none';

	const opacity = isBlurryShadow ? 0.6 : 0;

	return (
		<>
			{/* 隐藏图片，用于触发 orpheus 缓存和 onError 兜底 */}
			<img src={coverUrl} alt='' onError={handleImgError} style={{ display: 'none' }} />

			<style>
				{`
					.n-single .cdwrap::before {
						content: '';
						display: block;
						background-image: url("${coverUrl}");
						background-size: cover;
						background-position: center;
						background-repeat: no-repeat;
						position: absolute;
						left: 0;
						right: 0;
						top: 0;
						bottom: 0;
						filter: saturate(1.3) brightness(1.2) blur(25px);
						opacity: ${opacity};
						transition: opacity .4s ease, transform .4s ease, border-radius .4s ease;
						border-radius: ${borderRadius};
						transform: ${transform};
						will-change: transform, opacity;
						pointer-events: none;
					}
					.n-single .cdwrap .cdimg {
						box-shadow: none !important;
					}
                `}
			</style>
		</>
	);
}
