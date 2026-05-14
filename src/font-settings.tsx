import './font-settings.scss';
import type { StylesConfig, MultiValue } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { getSetting, setSetting } from './utils.js';

interface FontOption {
	label: string;
	value: string;
}
const customDarkStyles: StylesConfig<FontOption, true> = {
	control: (base, state) => ({
		...base,
		minHeight: '56px',
		fontSize: '16px',
		borderRadius: '6px',
		backgroundColor: 'transparent',
		boxShadow: state.isFocused ? '0 0 0 1px var(--rnp-accent-color)' : 'none',
		borderColor: state.isFocused ? 'var(--rnp-accent-color)' : 'rgba(255, 255, 255, 0.23)',
		'&:hover': {
			borderColor: state.isFocused ? 'var(--rnp-accent-color)' : 'rgba(255, 255, 255, 0.87)',
		},
		cursor: 'text',
		transition: 'border-color .2s, box-shadow .2s',
	}),

	valueContainer: base => ({
		...base,
		padding: '4px 9px',
	}),

	input: base => ({
		...base,
		color: '#fff',
		margin: '0 2px',
		padding: 0,
	}),

	placeholder: base => ({
		...base,
		color: 'rgba(255, 255, 255, 0.5)',
		fontSize: '16px',
	}),

	multiValue: base => ({
		...base,
		backgroundColor: 'rgba(255, 255, 255, 0.08)',
		borderRadius: '16px',
		margin: '2px 4px 2px 0',
		height: '32px',
		alignItems: 'center',
	}),
	multiValueLabel: base => ({
		...base,
		color: '#e0e0e0',
		fontSize: '13px',
		paddingLeft: '12px',
		paddingRight: '8px',
	}),

	multiValueRemove: base => ({
		...base,
		color: 'rgba(255, 255, 255, 0.26)',
		marginRight: '4px',
		borderRadius: '50%',
		height: '22px',
		width: '22px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		cursor: 'pointer',
		'& > svg': {
			width: '14px',
			height: '14px',
		},
		':hover': {
			backgroundColor: 'rgba(255, 255, 255, .12)',
			color: '#fff',
		},
	}),

	menu: base => ({
		...base,
		backgroundColor: '#1e1e1e88',
		borderRadius: '6px',
		marginTop: '4px',
		boxShadow: '0px 5px 5px -3px rgba(0,0,0,.2), 0px 8px 10px 1px rgba(0,0,0,.14), 0px 3px 14px 2px rgba(0,0,0,.12)',
		zIndex: 9999,
	}),
	menuList: base => ({
		...base,
		padding: '8px 0',
	}),

	option: (base, state) => ({
		...base,
		minHeight: '48px',
		display: 'flex',
		alignItems: 'center',
		padding: '6px 16px',
		fontSize: '16px',
		backgroundColor: state.isFocused ? 'rgba(255, 255, 255, .08)' : 'transparent',
		color: '#fff',
		cursor: 'pointer',
		transition: 'background-color 150ms cubic-bezier(.4, 0, .2, 1) 0ms',
		'&:active': {
			backgroundColor: 'rgba(255, 255, 255, .12)',
		},
	}),

	clearIndicator: base => ({
		...base,
		color: 'rgba(255, 255, 255, .54)',
		cursor: 'pointer',
		padding: '8px',
		'& > svg': {
			width: '20px',
			height: '20px',
		},
		'&:hover': { color: 'rgba(255, 255, 255, .87)' },
	}),
	dropdownIndicator: base => ({
		...base,
		color: 'rgba(255, 255, 255, .54)',
		cursor: 'pointer',
		padding: '8px',
		'& > svg': {
			width: '24px',
			height: '24px',
		},
		'&:hover': { color: 'rgba(255, 255, 255, .87)' },
	}),

	indicatorSeparator: () => ({
		display: 'none',
	}),
};

const FONT_PRESETS = [
	{
		name: 'MISans',
		fonts: ['MiSans Medium', 'MiSans'],
		url: 'https://cdn.cnbj1.fds.api.mi-img.com/vipmlmodel/font/MiSans/MiSans.zip',
	},
	{
		name: '思源黑体',
		fonts: [
			'Source Han Sans SC VF',
			'Source Han Sans CN',
			'Noto Sans',
			'思源黑体',
			'Source Han Sans VF',
			'Source Han Sans',
		],
		url: 'https://github.com/adobe-fonts/source-han-sans/raw/release/Variable/OTF/SourceHanSansSC-VF.otf',
	},
	{
		name: '思源宋体',
		fonts: [
			'Source Han Serif SC VF',
			'Source Han Serif CN',
			'Noto Serif',
			'思源宋体',
			'Source Han Serif VF',
			'Source Han Serif',
		],
		url: 'https://github.com/adobe-fonts/source-han-serif/raw/release/Variable/OTF/SourceHanSerifSC-VF.otf',
	},
	{
		name: '苹方',
		fonts: ['PingFang SC', '苹方 常规'],
		url: 'https://github.com/ShmilyHTT/PingFang/archive/refs/heads/master.zip',
	},
	{ name: '微软雅黑', fonts: ['Microsoft YaHei UI', 'Microsoft YaHei'], url: '' },
	{ name: '微软正黑', fonts: ['Microsoft JhengHei UI', 'Microsoft JhengHei'], url: '' },
];

export function FontSettings() {
	const [fontList, setFontList] = useState<string[]>([]);
	const [fontFamily, setFontFamily] = useState(() => getSetting('font-family', []));

	useEffect(() => {
		let isMounted = true;
		legacyNativeCmder.call('os.querySystemFonts').then(([status, fonts]) => {
			if (isMounted && status === 'success') setFontList(fonts);
		});
		return () => {
			isMounted = false;
		};
	}, []);

	// 统一更新逻辑
	const handleFontChange = useCallback((newFonts: string[]) => {
		setFontFamily(newFonts);
		setSetting('font-family', newFonts);
	}, []);

	const handleSelectChange = useCallback(
		(newValue: MultiValue<FontOption>) => {
			const fontStrings = newValue.map(item => item.value);
			handleFontChange(fontStrings);
		},
		[handleFontChange],
	);

	const options: FontOption[] = useMemo(() => fontList.map(font => ({ label: font, value: font })), [fontList]);
	const selectValue: FontOption[] = useMemo(() => fontFamily.map(font => ({ label: font, value: font })), [fontFamily]);

	return (
		<>
			<div style={{ marginBottom: '16px' }}>
				<CreatableSelect
					isMulti
					options={options}
					value={selectValue}
					onChange={handleSelectChange}
					styles={customDarkStyles}
					className='rnp-select-container'
					classNamePrefix='rnp-select'
					placeholder='选择或输入字体...'
					formatCreateLabel={inputValue => `添加手动输入的字体 "${inputValue}"`}
					noOptionsMessage={() => '未找到字体'}
				/>
			</div>

			<span className='rnp-checkbox-note'>某些字体可能不在列表中，需要手动输入</span>
			<span className='rnp-checkbox-note'>如果顺序在前的字体缺少某些字符，则会使用顺序在后的字体，依次顺延</span>
			<label className='rnp-checkbox-label'>字体预设</label>

			{FONT_PRESETS.map(preset => (
				<FontPreset key={preset.name} {...preset} fontList={fontList} setFontFamily={handleFontChange} />
			))}
		</>
	);
}

interface FontPresetProps {
	name: string;
	fonts: string[];
	url: string;
	fontList: string[];
	setFontFamily: (fonts: string[]) => void;
}

function FontPreset({ name, fonts, url, fontList, setFontFamily }: FontPresetProps) {
	const hasFont = useMemo(() => fonts.some(font => fontList.includes(font)), [fonts, fontList]);

	const handleDownload = () => {
		if (url) betterncm.ncm.openUrl(url);
	};

	return (
		<div className='rnp-font-preset'>
			<label className='rnp-font-preset-label'>{name}</label>
			{hasFont ? (
				<button className='rnp-font-preset-button' onClick={() => setFontFamily(fonts)}>
					应用
				</button>
			) : (
				<button className='rnp-download-font-button' onClick={handleDownload} title='下载该字体'>
					<svg xmlns='http://www.w3.org/2000/svg' height='20' viewBox='0 96 960 960' width='20'>
						<path d='M259.717 895q-40.442 0-69.08-28.787Q162 837.425 162 797v-74h98v74h440v-74h98v74q0 40.425-28.799 69.213Q740.401 895 699.96 895H259.717ZM481 727 249 495l70-68 113 113V203h98v337l113-113 70 68-232 232Z' />
					</svg>
				</button>
			)}
		</div>
	);
}
