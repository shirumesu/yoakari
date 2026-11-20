import { defineConfig } from 'astro/config';
import yoakari from 'astro-yoakari';

export default defineConfig({
  site: 'https://yoakari-demo.konataizumi.com',
  // the theme's options are in yoakari.config.json (also editable in the studio at /studio/#settings)
  integrations: [yoakari()],
});
