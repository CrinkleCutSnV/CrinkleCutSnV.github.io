// @ts-check
import { defineConfig } from 'astro/config';

// User site: https://github.com/CrinkleCutSnV/CrinkleCutSnV.github.io -> https://crinklecutsnv.github.io
// (no `base` needed for a <user>.github.io repo)
export default defineConfig({
  site: 'https://crinklecutsnv.github.io',
  output: 'static',
  trailingSlash: 'ignore',
});
