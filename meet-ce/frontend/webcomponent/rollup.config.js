// rollup.config.js
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import postcss from 'rollup-plugin-postcss'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const production = !process.env.ROLLUP_WATCH
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default {
  input: 'src/index.ts',
  output: {
    file: './dist/openvidu-meet.bundle.min.js',
    format: 'iife',
    name: 'OpenViduMeet',
    sourcemap: !production
  },
  plugins: [
    resolve({
      // Prioritize modern ES modules
      mainFields: ['module', 'browser', 'main']
    }),
    commonjs({
      // Optimize CommonJS conversion
      transformMixedEsModules: true
    }),
    postcss({
      inject: true, // This injects the CSS into the JS bundle
      minimize: true,
      // Don't extract CSS to a separate file
      extract: false
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      sourceMap: !production
    }),
    terser({
      ecma: 2020, // Use modern features when possible
      compress: {
        drop_console: {
          log: production, // Remove console.logs in production
          warn: true,
          error: true
        },
        drop_debugger: production,
        pure_getters: true,
        unsafe: true,
        passes: 3, // Multiple passes for better minification
        toplevel: true // Enable top-level variable renaming
      },
      // mangle: {
      //   properties: {
      //     regex: /^_|^iframe|^error|^load|^allowed|^command|^events/, // Mangle most internal properties
      //     reserved: [
      //       'connectedCallback',
      //       'disconnectedCallback', // Web Component lifecycle methods
      //       'shadowRoot',
      //       'attachShadow', // Shadow DOM APIs
      //       'attributes',
      //       'setAttribute' // Standard element properties
      //     ]
      //   },
      //   toplevel: true // Enable top-level variable renaming
      // },
      format: {
        comments: !production
      }
    }),
    {
      name: 'copy-bundle',
      writeBundle () {
        const bundleName = 'openvidu-meet.bundle.min.js'
        const sourcePath = path.resolve(__dirname, './dist', bundleName)

        if (!fs.existsSync(sourcePath)) {
          console.warn(`⚠️ Bundle not found at ${sourcePath}, skipping copy.`)
          return
        }

        // 1. Copy to CE backend
        const ceDir = path.resolve(__dirname, '../../backend/public/webcomponent')
        try {
          if (!fs.existsSync(ceDir)) fs.mkdirSync(ceDir, { recursive: true })
          fs.copyFileSync(sourcePath, path.join(ceDir, bundleName))
          console.log(`✅ Bundle copied to CE: ${ceDir}/${bundleName}`)
        } catch (err) {
          console.error(`❌ Failed to copy bundle to CE: ${err}`)
        }

        // 2. Copy to Pro backend if it exists
        const proDir = path.resolve(__dirname, '../../../meet-pro')
        const webcomponentProDir = path.join(proDir, 'backend/public/webcomponent')

        try {
          if (fs.existsSync(proDir) && fs.lstatSync(proDir).isDirectory()) {
            if (!fs.existsSync(webcomponentProDir)) fs.mkdirSync(webcomponentProDir, { recursive: true })
            fs.copyFileSync(sourcePath, path.join(webcomponentProDir, bundleName))
            console.log(`✅ Bundle copied to PRO: ${webcomponentProDir}/${bundleName}`)
          } else {
            console.log(`ℹ️ PRO directory does not exist, skipping copy: ${proDir}`)
          }
        } catch (err) {
          console.error(`❌ Failed to copy bundle to PRO: ${err}`)
        }
      }
    }
  ]
}
