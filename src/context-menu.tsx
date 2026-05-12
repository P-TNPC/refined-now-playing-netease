import './context-menu.scss';
import { useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { render, unmountComponentAtNode } from 'react-dom';

interface BaseMenuItem {
	label: string; // 分割线可能不需要 label
	html?: string;
}

interface NormalMenuItem extends BaseMenuItem {
	divider?: false;
	callback?: () => void;
}

interface DividerMenuItem extends BaseMenuItem {
	divider: true;
	callback?: never;
}

export type ContextMenuItem = NormalMenuItem | DividerMenuItem;

interface ContextMenuProps {
	items: ContextMenuItem[];
	x: number;
	y: number;
	onClose: () => void;
}

function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const isClosing = useRef(false); // 防抖锁，防止疯狂点击导致动画抽搐喵

	useLayoutEffect(() => {
		const menu = menuRef.current;
		if (!menu) return;

		const { width, height } = menu.getBoundingClientRect();
		const { innerWidth, innerHeight } = window;

		menu.style.left = '';
		menu.style.right = '';
		menu.style.top = '';
		menu.style.bottom = '';

		let anchor = '';

		// 贴边计算
		if (x + width > innerWidth) {
			menu.style.right = `${innerWidth - x}px`;
			anchor += 'right';
		} else {
			menu.style.left = `${x}px`;
			anchor += 'left';
		}

		anchor += ' ';

		if (y + height > innerHeight) {
			menu.style.bottom = `${innerHeight - y}px`;
			anchor += 'bottom';
		} else {
			menu.style.top = `${y}px`;
			anchor += 'top';
		}

		menu.style.transformOrigin = anchor;
		menu.animate(
			[
				{ width: '0px', height: '0px', opacity: 0.3 },
				{ width: `${width}px`, height: `${height}px`, opacity: 1 },
			],
			{
				duration: 150,
				easing: 'cubic-bezier(0.4, 0, 0, 1)',
				fill: 'forwards',
			},
		);
	}, [x, y]);

	const closeMenu = useCallback(() => {
		if (isClosing.current || !menuRef.current) return;
		isClosing.current = true;

		const anim = menuRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: 150,
			easing: 'ease-out',
			fill: 'forwards',
		});

		anim.onfinish = () => onClose();
	}, [onClose]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node | null)) closeMenu();
		};
		document.addEventListener('mousedown', handleClickOutside);

		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [closeMenu]);

	return (
		<div className='rnp-context-menu' ref={menuRef}>
			{items.map((item, index) =>
				item.divider ? (
					<div className='rnp-context-menu-divider' key={`divider-${index}`} />
				) : (
					<div
						key={`item-${index}`}
						className='rnp-context-menu-item'
						onClick={e => {
							e.stopPropagation(); // 阻止冒泡，防止误触
							item.callback?.();
							closeMenu();
						}}
					>
						{item.html ? <div dangerouslySetInnerHTML={{ __html: item.html }} /> : item.label}
					</div>
				),
			)}
		</div>
	);
}

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
	const container = document.createElement('div');
	document.body.appendChild(container);

	const handleDispose = () => {
		unmountComponentAtNode(container);
		container.remove();
	};

	render(<ContextMenu items={items} x={x} y={y} onClose={handleDispose} />, container);
}
