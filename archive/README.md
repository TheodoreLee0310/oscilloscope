# Archive

这个目录存放已移出主链路的归档文件，只保留参考价值，不属于当前运行链路。

约定：

- 归档脚本统一使用 `.archived.js` 后缀
- 不保证可直接运行
- 不作为 `src/`、`scripts/`、Webpack、Electron 的输入
- 如需恢复使用，必须先重新核对依赖、入口和验证链路

当前文件：

- `GLWaveformRenderer.archived.js`
- `OscilloscopeState.archived.js`
- `WaveformRenderer.archived.js`

说明：

- 这些脚本来自历史重构或替代实现
- 其中部分文件仍保留旧依赖引用，但当前项目不会加载它们
- 当前 `archive/` 目录不再区分 `demos/` 或 `legacy-scripts/` 子目录
