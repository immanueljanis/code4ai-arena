import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { nitro } from 'nitro/vite'

// The plugin list assembled directly rather than through a hosting provider's
// wrapper: the build should depend on the framework, not on where it was first
// authored. Order matters — tsconfig paths resolve before the framework
// plugins, and nitro builds from tanstackStart's server entry.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      // src/server.ts is our SSR error wrapper; nitro builds from it.
      server: { entry: 'server' },
    }),
    nitro(),
    viteReact(),
  ],
  server: {
    port: 8080,
  },
})
