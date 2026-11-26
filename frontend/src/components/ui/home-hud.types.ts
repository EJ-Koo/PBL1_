import type { ComponentProps } from 'react';
import type { HomeMenuPanel } from './home-menu-panel';

export type HomeHudProps = {
  scale: number;
  menuVisible: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  starCount: number;
  coinCount: number;
  checkCount: number;
  onStats: () => void;
  onQuest: () => void;
  highlight?: 'menu' | 'quest';
  menuProps: Omit<ComponentProps<typeof HomeMenuPanel>, 'scale' | 'onClose'>;
};
