// code from material you theme 但是重构版

import './refined-control-bar.scss';
import { waitForElement, getSetting, setSetting } from './utils.js';

const secondsToTime = (seconds: number): string => {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
};

const timeToSeconds = (time: string): number => time.split(':').reduce((acc, curr) => acc * 60 + parseInt(curr, 10), 0);

let currentIndicatorMode = getSetting('time-indicator', 'remain');

// 缓存 DOM 节点
type DomCache = {
	passed: HTMLSpanElement | null;
	rest: HTMLSpanElement | null;
	timeNow: HTMLSpanElement | null;
	timeAll: HTMLSpanElement | null;
	indicatorContainer: HTMLDivElement | null;
};
const domCache: DomCache = {
	passed: null,
	rest: null,
	timeNow: null,
	timeAll: null,
	indicatorContainer: null,
};

const updateTimeIndicator = (
	passedEl: HTMLSpanElement,
	restEl: HTMLSpanElement,
	timeNowEl: HTMLSpanElement,
	timeAllEl: HTMLSpanElement,
	mode: string | boolean,
): void => {
	const passedTime = timeToSeconds(timeNowEl.innerText);
	const totalTime = timeToSeconds(timeAllEl.innerText);
	const remainTime = totalTime - passedTime;

	passedEl.innerText = secondsToTime(passedTime);
	restEl.innerText = mode === 'remain' ? `-${secondsToTime(remainTime)}` : secondsToTime(totalTime);
};

const updateTimeIndicatorPosition = (containerEl: HTMLDivElement): void => {
	const selectorList = ['.brt', '.speed', '.audioEffect', '.spk'];
	let leftestButton: Element | null = null;

	for (const selector of selectorList) {
		leftestButton = document.querySelector(`.m-player ${selector}`);
		if (leftestButton?.childElementCount !== 0) break;
	}

	if (!leftestButton) return;

	const right = parseInt(window.getComputedStyle(leftestButton).right, 10) + leftestButton.clientWidth + 15;
	containerEl.style.right = `${right}px`;
};

const init = () => {
	if (
		document.body.classList.contains('material-you-theme') ||
		loadedPlugins['MaterialYouTheme'] ||
		loadedPlugins['ark-theme']
	) {
		return;
	}

	waitForElement('#main-player', playerDom => {
		const indicatorContainer = document.createElement('div');
		indicatorContainer.id = 'rnp-time-indicator';
		indicatorContainer.style.opacity = '0';
		indicatorContainer.style.pointerEvents = 'none';
		indicatorContainer.innerHTML = `
			<span id="rnp-time-passed">0:00</span>
			/
			<span id="rnp-time-rest">0:00</span>
		`;
		playerDom.appendChild(indicatorContainer);

		// 填充缓存
		domCache.indicatorContainer = indicatorContainer;
		domCache.passed = indicatorContainer.querySelector('#rnp-time-passed');
		domCache.rest = indicatorContainer.querySelector('#rnp-time-rest');
		domCache.timeNow = document.querySelector('time.now');
		domCache.timeAll = document.querySelector('time.all');

		// 守卫包装器
		const triggerTimeUpdate = () => {
			if (domCache.timeNow && domCache.timeAll) {
				updateTimeIndicator(domCache.passed!, domCache.rest!, domCache.timeNow, domCache.timeAll, currentIndicatorMode);
			}
		};

		const triggerPositionUpdate = () => updateTimeIndicatorPosition(domCache.indicatorContainer!);

		domCache.rest!.style.pointerEvents = 'auto';
		domCache.rest!.addEventListener('click', () => {
			currentIndicatorMode = currentIndicatorMode === 'remain' ? 'total' : 'remain';
			setSetting('time-indicator', currentIndicatorMode);
			triggerTimeUpdate();
			triggerPositionUpdate();
		});

		if (domCache.timeNow) new MutationObserver(triggerTimeUpdate).observe(domCache.timeNow, { childList: true });

		const positionObserver = new MutationObserver(triggerPositionUpdate);
		['.brt', '.speed'].forEach(selector => {
			const target = document.querySelector(`#main-player ${selector}`);
			if (target) positionObserver.observe(target, { childList: true });
		});
	});
};

init();
