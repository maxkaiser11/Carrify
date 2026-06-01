export type GameLink = {
  name: string;
  emoji: string;
  /** Route this game links to, e.g. "/dota2". */
  href: string;
  /** Tailwind gradient used for the hover accent on cards. */
  accent: string;
  /** Whether the game's page is live yet. Non-available games render as "coming soon". */
  available: boolean;
};

export const GAMES: GameLink[] = [
  { name: 'Valorant', emoji: '🎯', href: '/valorant', accent: 'from-rose-500/20 to-rose-500/0', available: true },
  { name: 'League of Legends', emoji: '⚔️', href: '/lol', accent: 'from-sky-500/20 to-sky-500/0', available: true },
  { name: 'Dota 2', emoji: '🛡️', href: '/dota2', accent: 'from-red-500/20 to-red-500/0', available: true },
  { name: 'CS2', emoji: '💣', href: '/cs2', accent: 'from-amber-500/20 to-amber-500/0', available: false },
  { name: 'Deadlock', emoji: '🪖', href: '/overwatch', accent: 'from-orange-500/20 to-orange-500/0', available: false },
  { name: 'Apex Legends', emoji: '🏆', href: '/apex', accent: 'from-fuchsia-500/20 to-fuchsia-500/0', available: false },
];
