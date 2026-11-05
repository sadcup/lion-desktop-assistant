# 发布检查

## 仓库范围

- 桌宠、助手和语音服务的运行源码，Electron/npm 锁文件，Compose 和本机启动脚本。
- 原项目中的实验台网页、基准日志、测试数据、录音和截图保留在原工作目录。当前 BOLT 网页界面随助手源码提供。README 随附经过审查的演示 GIF，使用合成语音和专用测试图片。
- 模型下载固定了两个上游提交并校验权重。上游模型分别声明 OpenMDW 1.1 和 LFM Open License v1.0。项目自身的许可证在发布前由维护者选择。

## 检查方式

```bash
./scripts/services.sh config --quiet
python3 -m py_compile bolt/assistant/*.py omni/server.py scripts/download-models.py
npm --prefix desktop ci
node --check desktop/main.cjs
node --check desktop/panel.js
git add --dry-run .
```

本机仓库整理验证结果：

- `npm ci` 安装成功。用安装后的 Electron 启动并核对 3D 桌宠和当前助手面板。
- BOLT 服务用单独的测试端口连接整理版桌面桥和本机 llama.cpp。健康检查、会话和系统状态工具通过。
- Omni 使用现有 GPU 镜像及已下载权重加载整理版服务。转写、WAV 合成和截图描述接口通过。
- Compose 配置解析、源码语法检查、3D 导出脚本及待提交清单通过。

完整新机器安装仍需验证，包括从零下载权重、构建镜像、配置 NVIDIA 运行环境，以及连接实际 X11 桌面和麦克风。

## 推送准备

1. 审查待提交文件和项目许可证。
2. 确认 `.env`、模型权重、`node_modules`、截图、会话数据和审计日志未列入待提交清单。
3. 在 GitHub 创建空仓库后，从本地目录创建提交并添加自己的远端。

```bash
git status --short
git add .
git commit -m "Initial release of the local Lion desktop assistant"
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```
