import './compatibility-check.scss';
import { compare } from 'compare-versions';
import { useState, useEffect, useCallback } from 'react';
import { render, unmountComponentAtNode } from 'react-dom';

interface ButtonProps {
	text: string;
	clickedText?: string;
	disabled?: boolean;
	disabledAfterDone?: boolean;
	onClick: () => Promise<void> | void;
}

function Button({ text, clickedText, disabled: propDisabled, disabledAfterDone = true, onClick }: ButtonProps) {
	const [clicked, setClicked] = useState(false);
	const [disabled, setDisabled] = useState(false);

	const handleClick = async () => {
		if (disabled || propDisabled) return;
		setDisabled(true);

		try {
			await onClick();
		} catch (e) {
			console.error(e);
		}

		setClicked(true);
		if (!disabledAfterDone) setDisabled(false);
	};

	return (
		<button className='action-button' disabled={disabled || propDisabled} onClick={handleClick}>
			{clicked ? (clickedText ?? text) : text}
		</button>
	);
}

// 主组件
interface WizardProps {
	onClose: () => void;
}
function Wizard({ onClose }: WizardProps) {
	const [status, setStatus] = useState({
		ncmOutdated: false,
		betterNcmOutdated: false,
		gpuDisabled: false,
		hijackDisabled: false,
		loading: true,
	});

	useEffect(() => {
		(async () => {
			const newStatus = {
				ncmOutdated: false,
				betterNcmOutdated: false,
				gpuDisabled: false,
				hijackDisabled: false,
				loading: false,
			};

			// 检查网易云版本
			try {
				newStatus.ncmOutdated = compare(betterncm.ncm.getNCMVersion(), '2.10.6', '<');
			} catch (e) {
				/* ignore */
			}

			// 检查 BetterNCM 核心 API
			newStatus.betterNcmOutdated =
				!betterncm_native?.app?.reloadIgnoreCache || !betterncm?.app?.writeConfig || !betterncm.app.readConfig;

			// 检查 GPU 加速
			if (!newStatus.betterNcmOutdated) {
				try {
					const removeDisableGpu = await betterncm.app.readConfig(
						'cc.microblock.betterncm.remove-disable-gpu',
						'false',
					);
					const gpuAccelerationEnabled = await new Promise<boolean>(resolve => {
						channel.call(
							'app.getLocalConfig',
							(GpuAccelerationEnabled: string | number) => resolve(!!+GpuAccelerationEnabled),
							['setting', 'hardware-acceleration'],
						);
					});
					newStatus.gpuDisabled = removeDisableGpu !== 'true' && !gpuAccelerationEnabled;
				} catch (e) {
					/* ignore */
				}
			}

			// 检查 Hijack 注入
			if (!newStatus.betterNcmOutdated) {
				try {
					const hijackDisabled = await betterncm.app.readConfig(
						'cc.microblock.betterncm.cpp_side_inject_feature_disabled',
						'false',
					);
					newStatus.hijackDisabled = hijackDisabled === 'true';
				} catch (e) {
					/* ignore */
				}
			}

			setStatus(newStatus);
		})();
	}, []);

	useEffect(() => {
		if (status.loading || status.ncmOutdated || status.betterNcmOutdated || status.gpuDisabled || status.hijackDisabled) {
			return;
		}
		localStorage.setItem('refined-now-playing-wizard-done', 'true');
	}, [status]);

	const handleSkip = useCallback(() => {
		localStorage.setItem('refined-now-playing-wizard-done', 'true');
		onClose();
	}, [onClose]);

	if (status.loading) return null;

	const hasError = status.ncmOutdated || status.betterNcmOutdated || status.gpuDisabled || status.hijackDisabled;

	return (
		<div className='rnp-compatibility-check'>
			<div className='rnp-compatibility-check__title'>
				<h2>兼容性检查</h2>
				<h3>Refined Now Playing</h3>
			</div>
			<div className='rnp-compatibility-check__content'>
				<p>欢迎使用 Refined Now Playing。</p>
				<p>在开始之前，请依照本提示检查和更正兼容性问题，否则可能会遇到渲染错误、性能降低、功能失效等问题。</p>

				{status.ncmOutdated && (
					<>
						<h1>网易云版本</h1>
						<p>Refined Now Playing 需要 2.10.6 及以上版本的网易云才能正常工作。</p>
						<p className='warning'>
							检测到您的网易云版本过旧，将会导致 Refined Now Playing 无法正常工作。请更新网易云。
						</p>
						<Button
							text='下载新版网易云'
							disabledAfterDone={false}
							onClick={async () => {
								await betterncm.app.exec('https://music.163.com/#/download');
							}}
						/>
					</>
				)}

				<h1>BetterNCM 版本</h1>
				<p>请尽可能将 BetterNCM 更新到最新版本，BetterNCM 版本过低会导致 Refined Now Playing 插件无法运行。</p>
				<p>目前推荐使用最新稳定版。如果版本过旧，请在 BetterNCM Installer 中，点击 “重装/更新” 以更新最新版。</p>
				{status.betterNcmOutdated ? (
					<p className='warning'>
						检测到您的 BetterNCM 版本过旧，可能会导致 Refined Now Playing 无法正常工作。请更新 BetterNCM。
					</p>
				) : (
					<p className='pass'>检测到您的 BetterNCM 版本没有过旧。但如果仍然出现问题，请尝试更新 BetterNCM。</p>
				)}
				<Button
					text='下载 BetterNCM Installer'
					disabledAfterDone={false}
					onClick={async () => {
						await betterncm.app.exec('https://github.com/MicroCBer/BetterNCM-Installer/releases');
					}}
				/>

				<h1>GPU 加速</h1>
				<p>如果 GPU 加速被禁用，可能会导致：卡顿、模糊背景渲染错误、帧数低、CPU 占用高等问题。</p>
				{status.gpuDisabled ? (
					<p className='warning'>
						检测到您的 GPU 加速已被禁用，可能会导致 Refined Now Playing 无法正常工作。请启用 GPU 加速。
					</p>
				) : (
					<p className='pass'>
						未检测到您的 GPU 加速被禁用。但如果仍旧出现以上问题，请尝试使用以下的按钮启用 GPU 加速。
					</p>
				)}
				<Button
					text='启用 GPU 加速'
					disabledAfterDone={true}
					disabled={status.betterNcmOutdated}
					onClick={async () => {
						await betterncm.app.writeConfig('cc.microblock.betterncm.remove-disable-gpu', 'true');
						betterncm_native.app.restart();
					}}
					clickedText='已启用 GPU 加速'
				/>

				<h1>Hijack JS 注入</h1>
				<p>如果 Hijack JS 注入被禁用，会导致无法正常显示歌词。</p>
				{status.hijackDisabled ? (
					<p className='warning'>检测到您的 Hijack JS 注入已被禁用。请启用 Hijack JS 注入。</p>
				) : (
					<p className='pass'>Hijack JS 注入未被禁用。但如果仍旧无法显示歌词，请点击以下 "清空 Hijack 缓存按钮"。</p>
				)}
				<Button
					text='启用 Hijack JS 注入'
					disabledAfterDone={true}
					disabled={!status.hijackDisabled || status.betterNcmOutdated}
					onClick={async () => {
						await betterncm.app.writeConfig('cc.microblock.betterncm.cpp_side_inject_feature_disabled', 'false');
						setStatus(s => ({ ...s, hijackDisabled: false }));
						betterncm_native.app.reloadIgnoreCache();
					}}
					clickedText='已启用 Hijack JS 注入'
				/>
				{!status.hijackDisabled && (
					<Button
						text='清空 Hijack 缓存'
						disabledAfterDone={true}
						disabled={status.betterNcmOutdated}
						onClick={async () => betterncm_native.app.reloadIgnoreCache()}
					/>
				)}

				<h1>性能</h1>
				<p>Refined Now Playing 的某些效果依赖 GPU 渲染，如果设备 GPU 性能较差，会造成低帧率、高占用等问题。</p>
				<p>
					如果已完成上述步骤，<b>但仍然出现性能问题，请尝试在播放页面右上角菜单中，检查以下选项：</b>
				</p>
				<ul>
					<li>
						<b>打开 "静态流体" 开关，这将大幅减少 GPU 占用</b>
					</li>
				</ul>

				<h1>完成</h1>
				{hasError ? (
					<>
						<p className='warning'>请先完成上述检查步骤，然后点击完成。</p>
						<p>您也可以选择跳过。如果出现问题需要修复，可以在插件设置中调出此页面。</p>
					</>
				) : (
					<>
						<p className='pass'>🎉 您的 Refined Now Playing 已经可以正常工作了。</p>
						<p>点击下方按钮关闭本引导。如果需要，您可以随时可以在插件设置中调出此页面。</p>
						<p>
							<b>如果不显示歌词，请重启一次网易云。（退出并再次打开）</b>
						</p>
					</>
				)}

				<button
					className='finish'
					onClick={() => {
						localStorage.setItem('refined-now-playing-wizard-done', 'true');
						if (status.betterNcmOutdated) return onClose();
						betterncm_native.app.reloadIgnoreCache();
					}}
					disabled={hasError}
				>
					完成并不再提示
				</button>

				{hasError && (
					<>
						<Button text='跳过' disabledAfterDone={true} onClick={onClose} />
						<Button text='跳过并不再提示' disabledAfterDone={true} onClick={handleSkip} />
					</>
				)}
			</div>
		</div>
	);
}

// 弹窗管理
export function compatibilityWizard(force = false): void {
	if (force) localStorage.removeItem('refined-now-playing-wizard-done');

	const wizardDone = localStorage.getItem('refined-now-playing-wizard-done');
	if (wizardDone) return;

	const container = document.createElement('div');
	container.id = 'refined-now-playing-wizard';
	document.body.appendChild(container);

	const handleClose = () => {
		setTimeout(() => {
			unmountComponentAtNode(container);
			container.remove();
		}, 0);
	};

	render(<Wizard onClose={handleClose} />, container);
}

function HijackFailureNotice({ onClose }: { onClose: () => void }) {
	return (
		<div className='hijack-failure-notice'>
			<div className='info'>
				<div>Hijack 错误</div>
				<div>
					Refined Now Playing 无法正常工作，可能导致歌词无法显示。<strong>请重启网易云以修复此问题。</strong>
				</div>
			</div>
			<div className='action'>
				<button onClick={onClose}>×</button>
			</div>
		</div>
	);
}

export async function hijackFailureNoticeCheck(): Promise<void> {
	if (!betterncm?.app?.getSucceededHijacks) return;

	const hijacks = await betterncm.app.getSucceededHijacks();
	if (hijacks.filter(x => x.includes('RefinedNowPlaying')).length > 0) return;

	const container = document.createElement('div');
	container.id = 'refined-now-playing-hijack-failure-notice';
	document.body.appendChild(container);

	const handleClose = () => {
		setTimeout(() => {
			unmountComponentAtNode(container);
			container.remove();
		}, 0);
	};

	render(<HijackFailureNotice onClose={handleClose} />, container);
}
