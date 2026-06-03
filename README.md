# SmartProposal

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![HTML](https://img.shields.io/badge/HTML5-E34F26.svg?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS](https://img.shields.io/badge/CSS3-1572B6.svg?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E.svg?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Stars](https://img.shields.io/github/stars/ATEMall/SmartProposal?style=social)](https://github.com/ATEMall/SmartProposal)
[![ATEMall](https://img.shields.io/badge/Platform-ATEMall-orange.svg)](https://github.com/ATEMall)

一个智能化的项目提案生成工具，帮助你快速创建专业的项目提案文档。纯前端实现，无需后端服务，打开即用。

## 在线 Demo

> 在线 Demo 即将上线，敬请期待！

[![Demo](https://img.shields.io/badge/Demo-即将上线-lightgrey.svg)](https://github.com/ATEMall/SmartProposal)

## 功能特性

- **智能模板** — 内置多种行业提案模板，一键套用
- **在线编辑** — 所见即所得的富文本编辑器
- **导出 PDF** — 一键导出精美 PDF 文档
- **数据持久化** — 本地存储，刷新不丢失
- **响应式设计** — 适配桌面和移动端
- **无需后端** — 纯前端实现，零部署成本

## 快速开始

### 直接使用

1. Clone 本仓库
   ```bash
   git clone https://github.com/ATEMall/SmartProposal.git
   ```
2. 用浏览器打开 `index.html` 即可使用

### 本地服务器（推荐）

```bash
# 使用 Python 简易服务器
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

然后访问 `http://localhost:8080`

## 使用示例

### 创建新提案

1. 打开应用后，选择「新建提案」
2. 选择一个模板（如：项目方案、技术评审、测试计划）
3. 填写各章节内容
4. 预览并导出 PDF

### 自定义模板

```javascript
// 在 templates.js 中添加自定义模板
const customTemplate = {
  name: "EMB测试方案",
  sections: [
    { title: "测试目标", type: "richtext" },
    { title: "测试环境", type: "table" },
    { title: "测试用例", type: "list" },
    { title: "风险评估", type: "richtext" }
  ]
};
```

### 与团队协作

SmartProposal 支持通过导出 JSON 文件与团队成员共享提案草稿：

1. 点击「导出」→ 选择 JSON 格式
2. 将 JSON 文件分享给团队成员
3. 团队成员通过「导入」加载草稿继续编辑

## 截图

> 截图即将补充

| 提案编辑界面 | PDF 导出预览 |
|-------------|-------------|
| ![编辑界面](docs/screenshot_editor.png) | ![PDF预览](docs/screenshot_pdf.png) |

## 项目结构

```
SmartProposal/
├── index.html          # 入口页面
├── css/                # 样式文件
├── js/                 # JavaScript 逻辑
│   ├── app.js          # 主应用逻辑
│   ├── templates.js    # 模板定义
│   └── export.js       # PDF 导出
├── assets/             # 静态资源
├── docs/               # 文档与截图
└── README.md
```

## 技术栈

| 技术 | 用途 |
|------|------|
| HTML5 | 页面结构 |
| CSS3 | 样式与动画 |
| Vanilla JS | 核心逻辑 |
| html2pdf.js | PDF 导出 |
| localStorage | 数据持久化 |

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/new-template`)
3. 提交更改 (`git commit -m 'Add new template'`)
4. 推送到分支 (`git push origin feature/new-template`)
5. 发起 Pull Request

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🔗 更多资源

- 🤖 [ATEMall AI知识库](https://atemall-ai.com) — 汽车测试工程师的AI助手
- 💬 免费使用AI问答，覆盖 HIL / CAN / UDS / EMB 测试领域
- 📋 注册即可获取完整测试模板和DBC文件库
- ⭐ 如果这个工具对你有帮助，欢迎 Star 支持我们！
