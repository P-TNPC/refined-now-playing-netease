import './font-settings.scss';
import { TextField, Autocomplete, ThemeProvider, createTheme } from '@mui/material';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { getSetting, setSetting } from './utils.js';

const darkTheme = createTheme({
	palette: {
		mode: 'dark',
	},
});

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

	return (
		<>
			<ThemeProvider theme={darkTheme}>
				<Autocomplete
					multiple
					value={fontFamily}
					onChange={(_, newValue) => handleFontChange(newValue)}
					options={fontList}
					getOptionLabel={option => option}
					fullWidth
					freeSolo
					forcePopupIcon={false}
					renderInput={params => <TextField {...params} variant='outlined' label='选择字体' placeholder='' />}
				/>
			</ThemeProvider>

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
