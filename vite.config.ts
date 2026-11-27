import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import replace from '@rollup/plugin-replace'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
    server: { open: '/demo/', port: 8000 },
    resolve: { alias: { tslib: 'tslib/tslib.es6.js' }, conditions: ['browser'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [replace({ versionplaceholder: pkg.version, preventAssignment: true })],
    build: {
        lib: { entry: 'src/widget-value.ts', formats: ['es'], fileName: 'widget-value' },
        sourcemap: true,
        rollupOptions: {
            external: [/^lit/, /^@lit/],
            output: { banner: '/* @license Copyright (c) 2026 Record Evolution GmbH. All rights reserved.*/' }
        }
    }
})
