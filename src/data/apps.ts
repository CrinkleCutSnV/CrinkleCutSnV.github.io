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
    blurb: 'Fling a paper aeroplane down the office corridor. Drag, let go, and see how far it glides.',
    emoji: '✈️',
    icon: '/icons/paper-plane.svg',
    colour: '#48cae4',
    tags: ['Game', 'Physics', 'Canvas'],
  },
  {
    slug: 'disc-golf',
    title: 'Arcade Disc Golf',
    blurb: 'Time your taps for direction, power and curve, and play a three-hole round: round the old oak, past the troll bridge and up the hill.',
    emoji: '🥏',
    icon: '/icons/disc-golf.svg',
    colour: '#7bd389',
    tags: ['Game', 'Physics', 'Canvas'],
  },
  {
    slug: 'split-the-g',
    title: 'Split the G',
    blurb: 'One pint, one gulp. Hold to drink, let go to stop, and leave the line exactly halfway between the G’s bar and its curly tip. Inspired by the pub craze.',
    emoji: '🍺',
    icon: '/icons/split-the-g.svg',
    colour: '#e9c46a',
    tags: ['Game', 'Timing', 'Canvas'],
    status: 'new',
  },
];
