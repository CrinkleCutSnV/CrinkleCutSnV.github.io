export interface AppCard {
  slug: string;
  title: string;
  blurb: string;
  emoji: string;
  icon?: string; // path under /public, shown instead of the emoji
  colour: string;
  tags: string[];
  status?: 'new' | 'soon';
}

// Add a new app here and create src/pages/apps/<slug>/index.astro
export const apps: AppCard[] = [
  {
    slug: 'paper-plane',
    title: 'Paper Plane Throw',
    blurb: 'Fling a paper aeroplane down the office corridor. Drag, let go, and see how far it glides. Coming soon!',
    emoji: '✈️',
    icon: '/icons/paper-plane.svg',
    colour: '#48cae4',
    tags: ['Game', 'Physics', 'Canvas'],
    status: 'soon',
  },
];
