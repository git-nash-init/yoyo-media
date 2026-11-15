// Tailwind is processed by a Turbopack loader in `next dev` (see next.config.ts).
// Production builds use webpack (`next build --webpack`), which needs the PostCSS plugin.
// The flag is set in next.config.ts so the plugin never runs twice under Turbopack.
const plugins = process.env.YOYO_WEBPACK_BUILD ? { "@tailwindcss/postcss": {} } : {};

const config = { plugins };

export default config;
