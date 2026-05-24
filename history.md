# SmartProposal_ATE 版本历史

## v1.0 — 初始版本
- **时间**：2026-05-11
- **文件**：`index.html`（初始）
- **变更**：初始版本，包含基础 SVG 编辑器框架、工具栏、属性面板

---

## v1.1 — 修复 JS 语法错误 & 函数作用域问题
- **时间**：2026-05-11
- **文件**：`index_v1.1_bugfix-syntax-error.html`
- **变更**：
  - 修复 `mouseup` 监听器中 `showToast(debugMsg)` 后多余的 `});`，导致函数提前关闭，之后的 `Update selection state` 代码块落到函数外部，引发 `Uncaught SyntaxError: Unexpected token '}'`
  - 删除重复的 `connectors.forEach` 代码块（第 718-728 行）
  - 将 `selectTool`、`selectConnector` 等函数显式挂载到 `window` 对象，确保 `onclick` 属性能正确调用
  - 在 `selectTool` 函数开头添加调试日志 `console.log`
  - 添加全局 `window.addEventListener('error')` 错误处理器

---

## v1.2 — 自然语言生成流程图
- **时间**：2026-05-12
- **文件**：`index_v1.2_nl-generate.html`
- **变更**：
  - 完全重写 `processNaturalLanguage()` 函数，替换原有简单关键词匹配逻辑
  - 新增 `_setLabel()`、`_extractCount()`、`_parseNodes()` 等辅助函数
  - 支持自动识别 5 种图表类型：流程图、思维导图、循环图、对比图、组织架构图
  - 节点提取支持多种输入格式：
    - 箭头分隔（`→`、`->`、`=>`）
    - 中文逗号/顿号/分号分隔
    - 第一步…第二步… 格式
    - 数量提示（"三个步骤"、"5阶段"等）
  - 新增 `_genFlowDiagram()`：自动垂直布局，首尾圆角矩形，中间矩形，包含判断关键词时自动使用菱形
  - 新增 `_genMindMap()`：放射状布局，首节点为中心，其余为外围分支
  - 新增 `_genCycle()`：循环闭合连接的环形布局
  - 新增 `_genOrgTree()`：树形两级结构
  - 新增 `_genCompare()`：水平并排对比布局
  - 生成按钮添加加载状态（"生成中..."），防止重复点击
  - 将 `processNaturalLanguage` 挂载到 `window` 对象，确保 `onclick` 可调用

---

## v1.3 — 修复自然语言生成节点标签丢失问题
- **时间**：2026-05-12
- **文件**：`index_v1.3_fix-nl-labels.html`
- **问题**：自然语言生成图表时，多个节点显示"双击编辑"而非正确文本，连线也不完整
- **根因**：`addShape()` 和 `addConnector()` 使用 `Date.now()` 生成 ID，在快速循环调用时（如 forEach 批量创建节点）产生重复 ID，导致 `_setLabel()` 通过 `data-parent` 查找文本元素时定位错误，以及连线绑定到错误的节点
- **修复**：
  - `addShape()`：ID 生成改为 `'shape-' + Date.now() + '-' + (++_shapeIdCounter)`，引入递增计数器确保唯一性
  - `addConnector()`：ID 生成改为 `'conn-' + Date.now() + '-' + (++_connIdCounter)`，同上
- **验证**：puppeteer 截图确认流程图（5节点全正确）、思维导图（中心+4分支全正确）、对比图（3节点全正确）均正常渲染

---

## v2.0 — 架构重构，轻量化模块化（对标 drawio 80% 能力）
- **时间**：2026-05-14
- **文件**：`index_v2.0.html` + `assets/js/model.js` + `assets/js/renderer.js` + `assets/js/tools.js` + `assets/css/base.css`
- **变更**：
  - **架构重构**：从 2417 行单文件拆分为 MVC 分离的模块化结构（总代码量 4072 行，分工明确）
  - **model.js（655 行）**：纯数据层，管理 shapes/connectors 数组，撤销/重做历史，ID 生成，序列化（JSON/XML），网格吸附，坐标转换，事件总线
  - **renderer.js（662 行）**：纯渲染层，订阅 model 事件响应式更新 SVG DOM，支持 shape/connector 创建、更新、删除、选中高亮、框选框
  - **tools.js（768 行）**：交互层，统一 mouse/touch 事件处理，支持选择/拖拽/框选/平移/画笔/橡皮擦/连接线/键盘快捷键
  - **base.css（926 行）**：ATEMall 红白配色系统，CSS 变量，完整组件样式（Header/工具栏/面板/画布/右键菜单/Toast/文本编辑器）
  - **index_v2.0.html（1061 行）**：主入口，UI 布局，工具栏（撤销/重做/复制/层级/对齐/缩放/网格/导出），左侧面板（工具/图形/流程图符号/连接线），属性面板，导出菜单
  - **新增功能**：
    - 层级操作（置顶/置底/上移/下移）
    - 6 种对齐工具（左对齐/居中/右对齐/顶对齐/垂直居中/底对齐）
    - 格式复制/粘贴（样式刷）
    - Ctrl+C/X/V 键盘剪贴板
    - 方向键微调位置（Shift 加速）
    - 连接线 6 种类型
    - PNG/SVG/JSON 导出 + JSON 导入
    - localStorage 30 秒自动保存 + 启动恢复
    - 文本编辑器（双击弹出编辑框）
    - 网格吸附开关
    - 小程序触摸事件适配（touchstart/move/end）
    - 新增 6 个流程图符号（开始/结束/处理/判断/数据/子流程）
  - **兼容性**：保持单 HTML 可双击直接打开（无需构建），同时架构支持未来接入 Vite 打包

---

## v1.4 — 画笔设置面板 + 橡皮擦工具
- **时间**：2026-05-13
- **文件**：`index_v1.4_pen-eraser.html`
- **变更**：
  - **修复画笔设置面板不显示**：原有 HTML/CSS 结构完整，但缺少初始化 JS；新增 `initPenPanel()` IIFE，动态生成 8 种颜色色块（橙/蓝/绿/黄/红/紫/黑/白）+ 5 档粗细按钮（1/2/4/6/8px），点击即更新 `penColor` / `penWidth`，当前选中有红色高亮
  - **新增橡皮擦工具**：
    - 工具栏新增"橡皮擦"按钮（橡皮擦 SVG 图标）
    - 选中后左侧出现"橡皮擦大小"设置面板，4 个档位（8/16/24/40px）
    - 光标切换为十字形（`cell`）
    - 擦除逻辑：拖动时实时检测笔迹路径（`.pen-path`）与鼠标位置的包围盒重叠，重叠则删除该笔划，操作自动入 Undo 历史
  - `selectTool()` 函数新增 eraser 分支，控制面板显示/隐藏与光标样式
- **验证**：Puppeteer 截图确认面板正常显示、画笔可绘制红色曲线、橡皮擦可擦除笔迹

---

## v2.0 — Bug修复与功能增强（2026-05-15）
- **时间**：2026-05-15
- **文件**：`index_v2.0.html` + `assets/js/model.js` + `assets/js/renderer.js` + `assets/js/tools.js`
- **变更**：
  - **修复 polygonPoints 网格吸附 Bug**（model.js）：多边形点坐标在网格吸附前计算，吸附后坐标偏移导致渲染位置错误；现已将 polygonPoints 计算移至网格吸附之后，使用吸附后的 shape.x/shape.y
  - **新增平行四边形按钮**（index_v2.0.html）：左侧面板基本图形区新增平行四边形工具
  - **新增点线连接线类型**（index_v2.0.html）：连接线选择区新增第 7 种类型"点线箭头"
  - **修复属性面板不自动显示**（tools.js + index_v2.0.html）：点击选中图形时属性面板不弹出；新增 `onSelectionChanged` 回调机制
  - **修复连接线预览不跟随鼠标**（tools.js）：连接工具选中起点后鼠标移动时预览线不更新
  - **增强 NL 自然语言生成器**（index_v2.0.html）：集成 v1.4 完整版，支持流程图/思维导图/循环图/组织架构图/对比图五种图表类型
  - **修复工具栏复制/粘贴按钮**（index_v2.0.html）：修复仅提示不操作的问题
  - **修正 NL 生成器连接点编号**（index_v2.0.html）：各图表类型的连接点正确指向

---

## v2.0 — 修复安全警告/连接预览/NL模板（2026-05-24）
- **时间**：2026-05-24
- **文件**：`index_v2.0.html`（副本 `index_v2.0_20250524_stable.html`）
- **变更**：
  - **修复页面安全警告**（index_v2.0.html）：移除 Google Fonts 链接的 `crossorigin="anonymous"` 属性，防止 `file://` 协议下跨域读取限制导致的 CORS 警告
  - **修复连线预览跟随不完整**（tools.js）：`onMouseMove` 中连接预览更新后添加 `return`，防止被拖拽/框选等其他状态处理器干扰，确保预览线不间断跟随鼠标
  - **新增 NL 模板按钮**（index_v2.0.html）：新增 "决策流程" 和 "PDCA循环" 两个模板按钮，匹配 NL 生成器已有检测模式（`hasDecision` 和 `isCycle`）
- **验证**：
  - 连接线预览跟随鼠标移动：`moved:735.63,414.66`（点击后拖动坐标更新）✅
  - 连接线创建完成：toast "连接线已创建"，conns=1 ✅
  - NL 模板按钮：8 个（新增 2 个）✅
  - 无 JS 错误 ✅

---

## v2.0 — 属性面板重构 & 连接预览彻底修复 & NL 增强（2026-05-24 第二轮）
- **时间**：2026-05-24
- **文件**：`index_v2.0.html` + `assets/js/tools.js` + `assets/css/base.css`
- **副本**：`index_v2.0_20250524_v2.html`
- **变更**：
  - **属性面板改为绝对定位覆盖层**（index_v2.0.html + base.css）：
    - 问题：点击图形后属性面板弹出，参与 flex 布局导致画布坐标偏移，影响画笔/图形/连接线位置
    - 方案：`.sp-right-panel` 改为 `position: absolute; right:0; top:0; bottom:0; z-index:100`，脱离 flex 流
    - 工具栏新增属性面板切换按钮（`btn-toggle-prop`），通过 `togglePropPanel()` 控制显隐
    - `onSelectionChanged` 回调仅在面板已打开时刷新内容，不再自动弹出/隐藏
  - **修复 SELECT_COLOR 未定义**（tools.js）：tools.js 中引用了 `SELECT_COLOR` 但该变量定义在 renderer.js IIFE 内部；在 tools.js 中添加 `var SELECT_COLOR = '#e63946'`
  - **修复 togglePropPanel/renderGridBtn 未导出**（index_v2.0.html）：函数在 IIFE 内声明但 HTML onclick 无法调用；添加 `window.togglePropPanel = togglePropPanel` 和 `window.renderGridBtn = renderGridBtn` 导出
  - **修复连接线预览不跟随鼠标（彻底修复）**（tools.js）：
    - 根因：SVG canvas 的 mousemove 事件在快速移动时可能丢失，导致预览线不更新（DevTools 打开时反而正常，因同步布局触发）
    - 方案：改用 `document.addEventListener('mousemove', connectorMoveHandler)` 在文档级别捕获所有鼠标移动
    - `connectorMoveHandler` 通过 `getSVGPoint()` 转换坐标后更新预览线终点，并调用 `getBBox()` 强制同步重绘
    - 在连接完成、Escape、切换工具、点击空白等场景下通过 `resetConnectorStart()` 清理 document 监听器
  - **新增连接线 toast 提示**（tools.js）：第一步点击连接点后显示"请点击下一个连接点"，参考 v1 版本功能
  - **NL 模板按钮添加 data-example 属性**（index_v2.0.html）：
    - 每个模板按钮增加 `data-example` 包含完整示例文本
    - `setNLTpl(el)` 读取 `data-example` 填充输入框
    - 页面加载时自动填充第一个模板（流程图）的示例
  - **NL 对话框尺寸优化**（base.css）：宽度从 560px→700px，`.sp-nl-input` 添加 `width:100%`，长示例文本完整可见
- **验证**：连接预览跟随鼠标 ✅ | 连接创建完成 ✅ | NL 模板示例 ✅ | 属性面板不影响坐标 ✅ | 无 JS 错误 ✅
