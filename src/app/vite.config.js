import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /* Servi à la RACINE (impastio.com/) → chemins d'assets ABSOLUS (`/assets/…`). NE PAS remettre `./` :
     en relatif, rafraîchir une route à PLUSIEURS segments (ex. /stagiaires/<uuid>) résolvait les
     assets sur /stagiaires/assets/… ; nginx (fallback SPA) renvoyait alors index.html à la place du
     JS → le script ne se chargeait pas → PAGE BLANCHE au rechargement. Les routes à un seul segment
     (/dashboard) y échappaient, d'où le « seulement quand l'URL contient un uuid ». */
  base: '/',
  build: {
    outDir: './dist-react',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
