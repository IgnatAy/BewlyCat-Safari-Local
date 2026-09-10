# BewlyCat for Safari

基于 [keleus/BewlyCat](https://github.com/keleus/BewlyCat) 制作的 **Safari 浏览器适配版本**，用于改善 Bilibili 网页的浏览体验。本项目为非官方适配，原项目及主要功能由上游作者和贡献者开发，感谢他们的工作。

本仓库提供已构建的扩展文件，可在 macOS 的 Safari 中本地加载，无需安装依赖或编译。

## 本地使用

1. 在本仓库页面点击 **Code → Download ZIP**，下载并解压。
2. 打开 **Safari → 设置 → 高级**，勾选“显示 Web 开发者功能”。
3. 在 **Safari → 设置 → 开发者** 中启用“允许未签名扩展”，点击“添加临时扩展…”，选择解压后包含 `manifest.json` 的文件夹。
4. 在 **Safari → 设置 → 扩展** 中启用 BewlyCat，并允许访问 `bilibili.com` 和 `hdslb.com`。
5. 打开或刷新 [Bilibili](https://www.bilibili.com/) 即可使用。

更新文件后，请移除旧的临时扩展并重新添加，仅刷新网页不会重新加载扩展文件。临时扩展失效或被移除时，重新添加即可；不要同时启用多个 BewlyCat 版本。

# 请勿擅自发布至 App Store!!
