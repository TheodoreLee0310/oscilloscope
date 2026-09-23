# Packaging README

打包与发布说明已合并到根目录 README：

- [README.md](C:/Users/ASUS/Desktop/demo1/README.md)

优先查看以下章节：

- `构建与打包`
- `关键配置`
- `故障排查`

当前目录内文件的职责：

- [electron-main.js](C:/Users/ASUS/Desktop/demo1/packaging/electron-main.js): Electron 主进程代理入口
- [common.js](C:/Users/ASUS/Desktop/demo1/packaging/common.js): packaging 脚本共享路径、日志与命令执行工具
- [build.js](C:/Users/ASUS/Desktop/demo1/packaging/build.js): 多平台构建脚本，内置本地 `winCodeSign` 镜像逻辑
- [binaries/README.md](C:/Users/ASUS/Desktop/demo1/packaging/binaries/README.md): 本地打包资源放置说明
- [optimize-build.js](C:/Users/ASUS/Desktop/demo1/packaging/optimize-build.js): 构建优化脚本
- [electron-builder.yml](C:/Users/ASUS/Desktop/demo1/packaging/electron-builder.yml): 参考打包配置
