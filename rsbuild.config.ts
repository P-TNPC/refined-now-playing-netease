import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default defineConfig({
	plugins: [pluginReact(), pluginSass()],
	source: {
		entry: {
			main: './src/main.jsx',
		},
	},
	output: {
		distPath: {
			root: 'dist',
			js: '',
			css: '',
		},
		filename: {
			js: '[name].js',
			css: '[name].css',
		},
		externals: {
			react: 'React',
			'react-dom': 'ReactDOM',
		},
		filenameHash: false,
		injectStyles: true,
		copy: [{ from: './src/manifest.json' }, { from: './src/preview.webp' }],
	},
	performance: {
		chunkSplit: {
			strategy: 'all-in-one',
		},
	},
	tools: {
		htmlPlugin: false,
		rspack: {
			resolve: {
				fallback: {
					path: require.resolve('path-browserify'),
				},
			},
			module: {
				rules: [
					{
						test: /settings-menu\.html/i,
						type: 'asset/source',
					},
				],
			},
		},
	},
});
