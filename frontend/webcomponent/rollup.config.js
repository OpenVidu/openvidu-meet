// rollup.config.js
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import postcss from 'rollup-plugin-postcss'
import fs from 'fs'

const production = !process.env.ROLLUP_WATCH

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
        const dir = '../../backend/public/webcomponent'
        const bundleName = 'openvidu-meet.bundle.min.js'
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.copyFileSync(`./dist/${bundleName}`, `${dir}/${bundleName}`)
        console.log(`✅ Bundle copied to ${dir}/${bundleName}`)
      }
    }
  ]
}
