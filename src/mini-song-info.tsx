import './mini-song-info.scss';
import { useState, useEffect, useCallback } from 'react';
import { useNativeAudioEvent } from './hooks.js';

// 拼接缓存 URL
const buildCacheUrl = (url: string) => {
	return url ? `orpheus://cache/?${url}?imageView&enlarge=1&thumbnail=800y800&type=webp` : '';
};

export function MiniSongInfo() {
	const [title, setTitle] = useState('');
	const [artist, setArtist] = useState('');
	const [albumSrc, setAlbumSrc] = useState('');
	const [fallbackSrc, setFallbackSrc] = useState(''); // 原始链接兜底

	// 数据更新
	const fetchSongInfo = useCallback(() => {
		const { name = '', artists = [], album } = betterncm.ncm.getPlayingSong()?.data ?? {};
		const rawUrl = album?.picUrl ?? '';

		setTitle(name);
		setArtist(artists.map(a => a.name).join(' / '));
		setFallbackSrc(rawUrl);
		setAlbumSrc(buildCacheUrl(rawUrl));
	}, []);

	// 初次挂载拉取一次
	useEffect(() => fetchSongInfo(), [fetchSongInfo]);

	// 监听底层播放器 Load 事件
	useNativeAudioEvent('Load', fetchSongInfo);

	// 图片加载失败
	const handleImgError = useCallback(() => {
		// 防止死循环：只有当前没回退过，才回退
		if (albumSrc !== fallbackSrc) setAlbumSrc(fallbackSrc);
	}, [albumSrc, fallbackSrc]);

	return (
		<>
			<div className='album'>
				<img src={albumSrc} alt='' onError={handleImgError} />
			</div>
			<div className='info'>
				<div className='title'>{title}</div>
				<div className='artist'>{artist}</div>
			</div>
		</>
	);
}