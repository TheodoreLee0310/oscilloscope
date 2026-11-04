// CommonJS 写法，Node ≥14 可直接运行
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
// 判断是否为开发模式
// 修复说明：原来只看 process.env.NODE_ENV，而它依赖 npm script 里的
// `set NODE_ENV=production`。`set` 只在 Windows cmd 下有效，在 PowerShell /
// bash / macOS / Linux 上会静默失效，导致 `npm run build` 打出的是**未压缩的
// 开发版产物**（本仓库一度出现过 8.6MB 的 docs/ 就是这个原因）。
// 现在改为以 CLI 的 --mode 为第一依据，并兼容 `webpack serve`。
const cliModeIndex = process.argv.indexOf('--mode');
const cliMode = cliModeIndex !== -1 ? process.argv[cliModeIndex + 1] : null;
const isServe = process.argv.includes('serve');
const isDev = isServe
  ? (cliMode ? cliMode !== 'production' : true)
  : (cliMode ? cliMode !== 'production' : process.env.NODE_ENV !== 'production');
module.exports = {
  mode: isDev ? 'development' : 'production',
  cache: isDev,
  entry: {
    internal: './src/main.js',
    external: './src/external.js',
  },
  output: {
    filename: 'js/[name].bundle.js',
    path: path.resolve(__dirname, 'docs'),   // 构建输出目录
    publicPath: './',                        // 始终使用相对路径，确保打包后的文件可以直接打开（Electron/file://）
    clean: !isDev,                          // 开发模式不清理，避免影响热重载
  },
  devtool: isDev ? 'eval-cheap-module-source-map' : false, // 生产环境移除 source map
  devServer: {
    // 仅开发服务器使用绝对路径 '/'：否则 webpack-dev-server 无法在根路径提供
    // index.html 与 bundle（这正是之前只能靠 docs 静态目录兜底的原因）。
    // 生产构建的 output.publicPath 仍为 './'，不受影响。
    devMiddleware: {
      publicPath: '/',
    },
    static: [
      // 注意：不要把构建输出目录 docs 放进静态目录，否则旧的构建产物会遮蔽
      // webpack 在内存中新生成的 index.html / internal.html，导致改动在 dev 下不生效
      { directory: path.resolve(__dirname, 'public') },
      { directory: path.resolve(__dirname, 'CDN') },
    ],
    hot: true,
    liveReload: true,
    watchFiles: ['src/**/*', 'public/**/*'],  // 监听文件变化
    open: ['index.html'],
    // 端口可通过环境变量覆盖，避免 8081 被占用时只能改代码：
    //   PowerShell: $env:SBQ_DEV_PORT=8082; npm run dev
    //   或直接:     npm run dev -- --port 8082
    port: Number(process.env.SBQ_DEV_PORT) || 8081,
    compress: true,
    historyApiFallback: true,
  },
  plugins: [
    // CSS 提取插件
    new MiniCssExtractPlugin({
      filename: 'css/[name].css'  // CSS 文件放到 css 文件夹
    }),
    // internal.html 走 Webpack bundle
    new HtmlWebpackPlugin({
      template: './public/internal.html',
      filename: 'internal.html',
      chunks: ['internal'],
    }),
    // index.html 作为"外部页/首页"，注入 external 入口的 bundle
    new HtmlWebpackPlugin({
      template: './public/external.html',
      filename: 'index.html',      // 作为首页
      chunks: ['external'],
      inject: 'head',              // 注入到 head 标签中，与 internal.html 保持一致
    }),
    // 将静态资源按类型分类复制
    new CopyWebpackPlugin({
      patterns: [
        // 其他静态资源：样式与第三方库
        { from: path.resolve(__dirname, 'public/styles.css'), to: 'css/styles.css' },
        // 登录页：必须一并输出到构建产物，否则打包/发布后守卫跳转会 404
        { from: path.resolve(__dirname, 'public/login.html'), to: 'login.html' },
        { from: path.resolve(__dirname, 'CDN'), to: 'assets/CDN' },
        // 迁移后的引导资源从 src/widgets/tour-guide 输出到 assets/TourGuide
        { from: path.resolve(__dirname, 'src/widgets/tour-guide/config.json'), to: 'assets/TourGuide/config.json' },
        { from: path.resolve(__dirname, 'src/widgets/tour-guide/styles.css'), to: 'assets/TourGuide/tourGuide.css' },
        // 复制贴图文件（添加图片压缩）
        { 
          from: path.resolve(__dirname, 'public/textures'), 
          to: 'textures',
          // 可以添加图片压缩插件处理
        },
        { from: path.resolve(__dirname, 'public/internal-loading-screen.js'), to: 'internal-loading-screen.js' },
      ],
    }),
  ],
  module: { 
    rules: [
      {
        test: /.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      }
    ] 
  },
  resolve: { 
    extensions: ['.js'],
    alias: {
      'vue$': 'vue/dist/vue.esm.js'  // 使用包含编译器的 Vue 版本（正确路径）
    }
  },
  // 性能和优化配置
  performance: { 
    hints: isDev ? false : 'warning',
    maxAssetSize: 512000, // 512KB
    maxEntrypointSize: 512000 // 512KB
  },
  
  // 优化配置
  optimization: {
    minimize: !isDev,
    minimizer: [
      // JS 压缩
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // 移除 console
            drop_debugger: true, // 移除 debugger
            pure_funcs: ['console.log'], // 移除特定函数调用
          },
          mangle: true, // 变量名混淆
          format: {
            comments: false, // 移除注释
          },
        },
        extractComments: false, // 不提取注释到单独文件
      }),
      // CSS 压缩
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: [
            'default',
            {
              discardComments: { removeAll: true }, // 移除所有注释
            },
          ],
        },
      }),
    ],
    
    // 代码分割
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // 第三方库单独打包
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 20,
        },
        // Three.js 单独打包（较大的库）
        three: {
          test: /[\\/]node_modules[\\/]three[\\/]/,
          name: 'three',
          chunks: 'all',
          priority: 30,
        },
        // 通用模块
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 10,
        },
      },
    },
    
    // Tree Shaking 优化
    usedExports: true,
    sideEffects: false,
  },
};
