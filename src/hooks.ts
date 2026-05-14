import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getSetting, type SettingChangedDetail, type SettingOption, type SettingsMap } from './utils.js';
import type { ProcessedLyricsData } from './lyric-provider.js';

export interface NativeAudioEventMap {
	Load: [trackHash: string, info: AudioPlayerLoadInfo];
	PlayState: [trackHash: string, stateString: string];
}

export function useNativeAudioEvent<K extends keyof NativeAudioEventMap>(
	action: K,
	callback: (...args: NativeAudioEventMap[K]) => void,
): void {
	// 用 useRef 保存最新回调，防上古闭包陷阱
	const callbackRef = useRef(callback);

	// 每次渲染都更新 ref，即使传入内联函数，也不触发下面的副作用重复注册
	useLayoutEffect(() => {
		callbackRef.current = callback;
	});

	useEffect(() => {
		// 代理函数桥接底层
		const proxyCallback = (...args: NativeAudioEventMap[K]) => callbackRef.current(...args);
		legacyNativeCmder.appendRegisterCall(action, 'audioplayer', proxyCallback); // 注册！

		return () => legacyNativeCmder.removeRegisterCall(action, 'audioplayer', proxyCallback);
	}, [action]); // action 变化时（基本不可能变）重新注册底层的桥接
}

export function useSetting<K extends SettingOption>(key: K, defaultValue: SettingsMap[K]): SettingsMap[K] {
	const [value, setValue] = useState(() => getSetting(key, defaultValue));

	useEffect(() => {
		const handleSettingChange = (e: CustomEvent<SettingChangedDetail>) => {
			if (e.detail.option === key) setValue(e.detail.value as SettingsMap[K]);
		};

		window.addEventListener('rnp-setting-changed', handleSettingChange);
		return () => window.removeEventListener('rnp-setting-changed', handleSettingChange);
	}, [key]);

	return value;
}

export function useLyrics(): ProcessedLyricsData | null {
	const [lyricsData, setLyricsData] = useState<ProcessedLyricsData | null>(() => window.currentLyrics ?? null);

	useEffect(() => {
		const handleLyricsUpdate = (e: CustomEvent<ProcessedLyricsData>) => setLyricsData(e.detail);

		document.addEventListener('lyrics-updated', handleLyricsUpdate);
		if (window.currentLyrics) setLyricsData(window.currentLyrics);
		return () => document.removeEventListener('lyrics-updated', handleLyricsUpdate);
	}, []);

	return lyricsData;
}
