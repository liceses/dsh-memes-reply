/**
 * dsh-memes-reply — 客户端 bundle 构建（浏览器半边）。
 *
 * 复刻 dsh-hmm-wait / dsh-web-ui 的客户端产物形状：
 *  - `lib/client.js` 是一个 **CJS closure**，由 GUI 的 `__ModuleLoader__` 装载：
 *    `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })`；
 *  - 平台模块（react、slots、client-runtime…）保持 external，由 loader 的冻结模块表回答；
 *     其余依赖一律内联，客户端 bundle 不依赖本仓库的 node_modules；
 *  - host 半边不在这里构建（用 tsc 直出 ESM + d.ts，见 package.json 的 build 脚本）。
 */

import type { UserConfig } from 'tsdown'

const ID = 'dsh-memes-reply'

/** 由 loader 模块表提供的平台模块（与 dsh-hmm-wait 的清单保持一致）。 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** 外部依赖 = 平台模块 + client-runtime 的运行时豁免入口。 */
const CLIENT_EXTERNALS: readonly string[] = [
  ...PLATFORM_MODULES,
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-settings/client',
]

/** 浏览器 bundle。 */
const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: CLIENT_EXTERNALS,
    // tsdown 0.22 取消了布尔形式：`alwaysBundle: true` 会被归一化成模式表
    // `[true]`，一旦出现不在 `neverBundle` 里的裸导入就抛
    // "Expected pattern to be a non-empty string"。要用受支持的
    // `NoExternalFn` 谓词把「除平台模块外一律内联」写清楚。
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [clientConfig]
