/**
 * SmartProposal v2.0 — tools.js
 * 工具层：处理鼠标/触摸交互
 * 订阅 renderer 高亮事件，管理当前工具状态
 */
(function(global) {
    'use strict';

    var SP = global.SmartProposal || {};
    var model = SP.model;
    var renderer = SP.renderer;
    if (!model || !renderer) { console.error('tools.js: dependencies not found'); return; }

    // ============================================================
    // 工具状态
    // ============================================================
    var currentTool = 'select';  // select | hand | pen | eraser | connector | [shape types]
    var currentConnType = 'straight';
    var selectedIds = [];          // 当前选中的 shape id 列表
    var selectedConnIds = [];     // 当前选中的 connector id 列表

    // 选中回调
    var selectionChangeCallback = null;

    // 选中颜色常量（与 renderer.js 一致）
    var SELECT_COLOR = '#e63946';

    // 拖拽状态
    var isDragging = false;
    var dragStart = null;
    var dragTargets = [];         // [{id, startX, startY}]
    var originalPositions = {};

    // 平移状态
    var isPanning = false;
    var panStart = null;

    // 框选状态
    var isMarqueeSelecting = false;
    var marqueeStart = null;
    var marqueeDidDrag = false;

    // 连接工具状态
    var connectorStart = null;    // {shapeId, pointIndex}
    var connectorPreview = null; // preview <line> element
    var connectorMoveHandler = null;  // 文档级 mousemove，用于连接预览（解决某些浏览器 SVG mousemove 不触发的问题）

    // Pen 工具
    var penState = {
        drawing: false,
        pathStr: '',
        pathEl: null,
        color: '#e34c26',
        width: 2
    };

    // Eraser 工具
    var eraserState = {
        size: 16,
        erasing: false
    };

    // ============================================================
    // 初始化
    // ============================================================
    function init(canvasId) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // 事件绑定（统一在 canvas 上监听，区分 target）
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('contextmenu', onContextMenu);
        canvas.addEventListener('dblclick', onDblClick);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        // Touch 事件（小程序适配）
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        // 键盘事件
        document.addEventListener('keydown', onKeyDown);

        // Ctrl+V 粘贴
        document.addEventListener('paste', onPaste);
    }

    // ============================================================
    // 工具切换
    // ============================================================
    function setTool(tool) {
        // 离开连接工具时清理预览状态
        if (tool !== 'connector' && (connectorStart || connectorPreview)) {
            resetConnectorStart();
        }
        currentTool = tool;
        var canvas = renderer.getCanvas();
        if (tool === 'select') { canvas.style.cursor = 'default'; }
        else if (tool === 'hand') { canvas.style.cursor = tool === 'hand' ? 'grab' : 'default'; }
        else if (tool === 'pen') { canvas.style.cursor = 'crosshair'; }
        else if (tool === 'eraser') { canvas.style.cursor = 'cell'; }
        else { canvas.style.cursor = 'crosshair'; }
    }

    function setConnectorType(type) {
        currentConnType = type;
        setTool('connector');
    }

    function getTool() { return currentTool; }
    function getSelectedIds() { return selectedIds; }
    function getSelectedConnIds() { return selectedConnIds; }

    // ============================================================
    // 坐标辅助
    // ============================================================
    function getSVGPoint(e) {
        var canvas = renderer.getCanvas();
        var state = model.getState();
        var rect = canvas.getBoundingClientRect();
        return {
            x: state.viewBox.x + (e.clientX - rect.left) * (state.viewBox.w / rect.width),
            y: state.viewBox.y + (e.clientY - rect.top) * (state.viewBox.h / rect.height)
        };
    }

    function isCanvasBackground(e) {
        var t = e.target;
        return t.id === 'canvas' || t.tagName === 'use' ||
               t.classList.contains('sp-marquee') ||
               (t.tagName === 'rect' && t.id && t.id.includes('grid'));
    }

    // ============================================================
    // 选中管理
    // ============================================================
    function selectShape(id, additive) {
        model.pushState();
        if (!additive) {
            selectedIds.forEach(function(sid) {
                var el = renderer.getShapeEl(sid);
                if (el) {
                    el.classList.remove('sp-selected');
                    // 恢复原样式
                    var shape = model.getShapeById(sid);
                    if (shape) {
                        el.setAttribute('stroke', shape.style.stroke || '#6b7280');
                        el.setAttribute('stroke-width', shape.style.strokeWidth || 2);
                    }
                }
            });
            selectedIds = [];
            selectedConnIds = [];
        }
        if (id && selectedIds.indexOf(id) === -1) {
            selectedIds.push(id);
        }
        renderer.setSelected(selectedIds, selectedConnIds);
        // 触发选中回调
        if (selectionChangeCallback) selectionChangeCallback(selectedIds, selectedConnIds);
        return selectedIds;
    }

    function selectConnector(id) {
        model.pushState();
        selectedConnIds = [id];
        renderer.setSelected(selectedIds, selectedConnIds);
    }

    function clearSelection() {
        if (selectedIds.length === 0 && selectedConnIds.length === 0) return;
        selectedIds.forEach(function(sid) {
            var shape = model.getShapeById(sid);
            if (!shape) return;
            var el = renderer.getShapeEl(sid);
            if (el) {
                el.classList.remove('sp-selected');
                el.setAttribute('stroke', shape.style.stroke || '#6b7280');
                el.setAttribute('stroke-width', shape.style.strokeWidth || 2);
            }
        });
        selectedConnIds.forEach(function(cid) {
            var conn = model.getConnectorById(cid);
            if (!conn) return;
            var el = renderer.getConnEl(cid);
            if (el) {
                el.classList.remove('sp-selected-conn');
                el.setAttribute('stroke', conn.style.stroke || '#6b7280');
                el.setAttribute('stroke-width', conn.style.strokeWidth || 2);
            }
        });
        selectedIds = [];
        selectedConnIds = [];
        renderer.setSelected([], []);
        if (selectionChangeCallback) selectionChangeCallback([], []);
    }

    function isSelected(id) {
        return selectedIds.indexOf(id) !== -1 || selectedConnIds.indexOf(id) !== -1;
    }

    // ============================================================
    // Mouse Events
    // ============================================================
    function onMouseDown(e) {
        var pt = getSVGPoint(e);
        var t = e.target;

        // 跳过非画布背景
        if (currentTool === 'connector') {
            handleConnectorClick(e, pt, t);
            return;
        }

        if (currentTool === 'pen') {
            handlePenStart(e, pt);
            return;
        }

        if (currentTool === 'eraser') {
            handleEraserStart(e, pt);
            return;
        }

        if (currentTool === 'hand') {
            handlePanStart(e);
            return;
        }

        if (currentTool === 'select') {
            // 检查是否点击图形
            var shapeEl = t.closest ? t.closest('[data-type="shape"]') : null;
            var connEl = t.closest ? t.closest('[data-type="connector"]') : null;

            if (shapeEl) {
                var id = shapeEl.getAttribute('data-id');
                var shape = model.getShapeById(id);
                if (!shape) return;

                if (!e.shiftKey && !isSelected(id)) {
                    clearSelection();
                }
                selectShape(id, e.shiftKey);

                // 开始拖拽
                isDragging = true;
                dragStart = pt;
                dragTargets = selectedIds.map(function(sid) {
                    var s = model.getShapeById(sid);
                    return { id: sid, startX: s.x, startY: s.y };
                });
                e.preventDefault();
                return;
            }

            if (connEl) {
                var cid = connEl.getAttribute('data-id');
                clearSelection();
                selectConnector(cid);
                return;
            }

            // 框选
            if (isCanvasBackground(e)) {
                clearSelection();
                isMarqueeSelecting = true;
                marqueeStart = pt;
                marqueeDidDrag = false;
                e.preventDefault();
            }
        }

        // 图形绘制工具
        if (isShapeTool(currentTool)) {
            if (isCanvasBackground(e)) {
                model.createShape(currentTool, pt.x, pt.y);
                setTool('select');
            }
        }
    }

    function onMouseMove(e) {
        var pt = getSVGPoint(e);

        // 连接线预览由文档级 mousemove（connectorMoveHandler）处理，
        // 此处不再重复处理，避免与文档级 handler 冲突

        if (isDragging && dragTargets.length > 0) {
            marqueeDidDrag = true;
            var dx = pt.x - dragStart.x;
            var dy = pt.y - dragStart.y;
            dragTargets.forEach(function(tgt) {
                var snapped = model.snapPoint(tgt.startX + dx, tgt.startY + dy);
                model.updateShape(tgt.id, { x: snapped.x, y: snapped.y });
            });
            return;
        }

        if (isMarqueeSelecting && marqueeStart) {
            marqueeDidDrag = true;
            var x = Math.min(marqueeStart.x, pt.x);
            var y = Math.min(marqueeStart.y, pt.y);
            var w = Math.abs(pt.x - marqueeStart.x);
            var h = Math.abs(pt.y - marqueeStart.y);
            if (w > 4 || h > 4) {
                renderer.showMarquee(x, y, w, h);
            }
            return;
        }

        if (isPanning && panStart) {
            handlePanMove(e);
            return;
        }

        if (penState.drawing) {
            handlePenMove(e, pt);
            return;
        }

        if (eraserState.erasing) {
            handleEraserMove(e, pt);
            return;
        }
    }

    function onMouseUp(e) {
        var pt = getSVGPoint(e);

        if (isDragging) {
            if (!marqueeDidDrag) {
                // 是点击非拖拽，什么都不做
            }
            isDragging = false;
            dragTargets = [];
            dragStart = null;
        }

        if (isMarqueeSelecting) {
            isMarqueeSelecting = false;
            renderer.hideMarquee();
            if (marqueeDidDrag) {
                var x = parseFloat(renderer.getCanvas().querySelector('.sp-marquee')?.getAttribute('x') || 0);
                // 从 marquee 获取区域
                var allShapes = model.getShapesInRect({
                    x: Math.min(marqueeStart.x, pt.x),
                    y: Math.min(marqueeStart.y, pt.y),
                    width: Math.abs(pt.x - marqueeStart.x),
                    height: Math.abs(pt.y - marqueeStart.y)
                });
                if (allShapes.length > 0) {
                    model.pushState();
                    selectedIds = allShapes.map(function(s) { return s.id; });
                    renderer.setSelected(selectedIds, []);
                }
                marqueeDidDrag = false;
            }
            marqueeStart = null;
        }

        if (isPanning) {
            isPanning = false;
            panStart = null;
        }

        if (penState.drawing) {
            handlePenEnd(e);
        }

        if (eraserState.erasing) {
            eraserState.erasing = false;
        }
    }

    function onClick(e) {
        // 阻止 marquee 后点击冒泡
        if (marqueeDidDrag) {
            marqueeDidDrag = false;
            e.stopPropagation();
        }
    }

    function onContextMenu(e) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        SP.contextMenu && SP.contextMenu.show(e.clientX, e.clientY, selectedIds);
    }

    function onDblClick(e) {
        var t = e.target;
        var shapeEl = t.closest ? t.closest('[data-type="shape"]') : null;
        if (shapeEl) {
            var id = shapeEl.getAttribute('data-id');
            SP.textEditor && SP.textEditor.start(id);
        }
    }

    function onWheel(e) {
        e.preventDefault();
        var pt = getSVGPoint(e);
        var factor = e.deltaY > 0 ? 1.12 : 0.9;
        model.zoomAt(pt.x, pt.y, factor);
    }

    // ============================================================
    // Pan
    // ============================================================
    function handlePanStart(e) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY, vx: model.getState().viewBox.x, vy: model.getState().viewBox.y };
        renderer.getCanvas().style.cursor = 'grabbing';
    }

    function handlePanMove(e) {
        var state = model.getState();
        var rect = renderer.getCanvas().getBoundingClientRect();
        var scaleX = state.viewBox.w / rect.width;
        var scaleY = state.viewBox.h / rect.height;
        model.setViewBox(
            panStart.vx - (e.clientX - panStart.x) * scaleX,
            panStart.vy - (e.clientY - panStart.y) * scaleY,
            state.viewBox.w, state.viewBox.h
        );
    }

    // ============================================================
    // Connector
    // ============================================================
    function handleConnectorClick(e, pt, t) {
        var connPt = t.closest ? t.closest('.sp-conn-point') : null;
        var canvas = renderer.getCanvas();

        if (connPt) {
            var shapeId = connPt.getAttribute('data-shape-id');
            var pointIndex = parseInt(connPt.getAttribute('data-point-index'));
            if (!connectorStart) {
                // 第一步：选起点
                connectorStart = { shapeId: shapeId, pointIndex: pointIndex };
                connPt.setAttribute('r', '9');
                connPt.style.fill = SELECT_COLOR;

                // 创建预览线
                connectorPreview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                var srcPt = getConnPtPos(shapeId, pointIndex);
                connectorPreview.setAttribute('x1', srcPt.x);
                connectorPreview.setAttribute('y1', srcPt.y);
                connectorPreview.setAttribute('x2', pt.x);
                connectorPreview.setAttribute('y2', pt.y);
                connectorPreview.setAttribute('stroke', SELECT_COLOR);
                connectorPreview.setAttribute('stroke-width', 2);
                connectorPreview.setAttribute('stroke-dasharray', '5,4');
                connectorPreview.style.pointerEvents = 'none';
                canvas.appendChild(connectorPreview);
                // 强制同步布局：确保预览线立即渲染
                connectorPreview.getBBox();

                showToast('点击下一个连接点完成连线');

                // 添加文档级 mousemove：确保预览线在任何情况下都跟随鼠标
                //（某些浏览器 SVG canvas 的 mousemove 事件可能无法持续触发）
                if (!connectorMoveHandler) {
                    connectorMoveHandler = function(ev) {
                        if (!connectorStart || !connectorPreview) return;
                        var svgPt = getSVGPoint(ev);
                        connectorPreview.setAttribute('x2', svgPt.x);
                        connectorPreview.setAttribute('y2', svgPt.y);
                        connectorPreview.getBBox();
                    };
                    document.addEventListener('mousemove', connectorMoveHandler);
                }

            } else {
                // 第二步：选终点，创建连接线
                // 先移除文档级监听
                if (connectorMoveHandler) {
                    document.removeEventListener('mousemove', connectorMoveHandler);
                    connectorMoveHandler = null;
                }
                model.createConnector(
                    connectorStart.shapeId, shapeId,
                    connectorStart.pointIndex, pointIndex,
                    currentConnType
                );
                resetConnectorStart();
                setTool('select');
                showToast('连接线已创建');
            }
            return;
        }

        // 点空白处取消
        if (isCanvasBackground(e)) {
            if (connectorStart) showToast('已取消连线');
            resetConnectorStart();
        }
    }

    function resetConnectorStart() {
        // 移除文档级监听
        if (connectorMoveHandler) {
            document.removeEventListener('mousemove', connectorMoveHandler);
            connectorMoveHandler = null;
        }
        connectorStart = null;
        if (connectorPreview) {
            connectorPreview.remove();
            connectorPreview = null;
        }
        // 恢复连接点样式
        document.querySelectorAll('.sp-conn-point').forEach(function(cp) {
            cp.setAttribute('r', '6');
            cp.style.fill = '';
        });
    }

    function getConnPtPos(shapeId, pointIndex) {
        var shape = model.getShapeById(shapeId);
        if (!shape) return { x: 0, y: 0 };
        var pts = [
            { x: shape.x + shape.width / 2, y: shape.y },
            { x: shape.x + shape.width,     y: shape.y + shape.height / 2 },
            { x: shape.x + shape.width / 2, y: shape.y + shape.height },
            { x: shape.x,                    y: shape.y + shape.height / 2 }
        ];
        return pts[pointIndex] || pts[0];
    }

    // ============================================================
    // Pen
    // ============================================================
    function handlePenStart(e, pt) {
        if (e.button !== 0) return;
        penState.drawing = true;
        var canvas = renderer.getCanvas();
        penState.pathStr = 'M' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1);
        penState.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        penState.pathEl.setAttribute('d', penState.pathStr);
        penState.pathEl.setAttribute('stroke', penState.color);
        penState.pathEl.setAttribute('stroke-width', penState.width);
        penState.pathEl.setAttribute('fill', 'none');
        penState.pathEl.setAttribute('stroke-linecap', 'round');
        penState.pathEl.setAttribute('stroke-linejoin', 'round');
        penState.pathEl.classList.add('sp-shape', 'sp-pen-path');
        canvas.appendChild(penState.pathEl);
    }

    function handlePenMove(e, pt) {
        if (!penState.drawing) return;
        penState.pathStr += ' L' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1);
        penState.pathEl.setAttribute('d', penState.pathStr);
    }

    function handlePenEnd(e) {
        if (!penState.drawing) return;
        penState.drawing = false;
        var pts = (penState.pathEl.getAttribute('d') || '').split('L').length;
        if (pts < 3) {
            penState.pathEl.remove();
        } else {
            model.pushState();
        }
        penState.pathEl = null;
        penState.pathStr = '';
    }

    // ============================================================
    // Eraser
    // ============================================================
    function handleEraserStart(e, pt) {
        eraserState.erasing = true;
        eraseAt(pt);
    }

    function handleEraserMove(e, pt) {
        eraseAt(pt);
    }

    function eraseAt(pt) {
        var canvas = renderer.getCanvas();
        var sz = eraserState.size;
        var shapes = model.getShapes();
        shapes.forEach(function(s) {
            var cx = s.x + s.width / 2;
            var cy = s.y + s.height / 2;
            var dist = Math.sqrt(Math.pow(pt.x - cx, 2) + Math.pow(pt.y - cy, 2));
            if (dist < sz + Math.max(s.width, s.height) / 2) {
                if (pt.x >= s.x - sz && pt.x <= s.x + s.width + sz &&
                    pt.y >= s.y - sz && pt.y <= s.y + s.height + sz) {
                    model.deleteShape(s.id);
                }
            }
        });
        // 擦除笔迹
        var penPaths = canvas.querySelectorAll('.sp-pen-path');
        penPaths.forEach(function(p) {
            var bbox = p.getBBox();
            if (bbox.width === 0) return;
            if (pt.x >= bbox.x - sz && pt.x <= bbox.x + bbox.width + sz &&
                pt.y >= bbox.y - sz && pt.y <= bbox.y + bbox.height + sz) {
                p.remove();
            }
        });
    }

    // ============================================================
    // Touch Events（小程序兼容）
    // ============================================================
    function onTouchStart(e) {
        if (e.touches.length === 1) {
            var t = e.touches[0];
            onMouseDown({ clientX: t.clientX, clientY: t.clientY, target: e.target, button: 0, preventDefault: e.preventDefault });
        }
    }

    function onTouchMove(e) {
        if (e.touches.length === 1) {
            var t = e.touches[0];
            onMouseMove({ clientX: t.clientX, clientY: t.clientY, target: e.target });
        }
    }

    function onTouchEnd(e) {
        if (e.changedTouches.length === 1) {
            var t = e.changedTouches[0];
            onMouseUp({ clientX: t.clientX, clientY: t.clientY, target: e.target });
        }
    }

    // ============================================================
    // 键盘快捷键
    // ============================================================
    function onKeyDown(e) {
        var key = e.key;
        var ctrl = e.ctrlKey || e.metaKey;

        // 文本编辑器打开时，忽略所有形状快捷键
        var editorOverlay = document.getElementById('text-editor-overlay');
        if (editorOverlay && editorOverlay.classList.contains('show')) {
            return;
        }

        // ESC：取消选择 + 清除连接预览
        if (key === 'Escape') {
            clearSelection();
            if (connectorStart || connectorPreview) {
                resetConnectorStart();
            }
            setTool('select');
            return;
        }

        // Delete / Backspace
        if (key === 'Delete' || key === 'Backspace') {
            if (selectedIds.length > 0) {
                model.pushState();
                selectedIds.forEach(function(id) { model.deleteShape(id); });
                selectedIds = [];
                selectedConnIds = [];
                renderer.setSelected([], []);
            }
            if (selectedConnIds.length > 0) {
                model.pushState();
                selectedConnIds.forEach(function(id) { model.deleteConnector(id); });
                selectedConnIds = [];
                renderer.setSelected([], []);
            }
            return;
        }

        // Ctrl+A：全选
        if (ctrl && key === 'a') {
            e.preventDefault();
            var shapes = model.getShapes();
            selectedIds = shapes.map(function(s) { return s.id; });
            renderer.setSelected(selectedIds, []);
            return;
        }

        // Ctrl+D：复制
        if (ctrl && key === 'd') {
            e.preventDefault();
            if (selectedIds.length > 0) {
                model.pushState();
                var newIds = [];
                selectedIds.forEach(function(id) {
                    var clone = model.cloneShape(id);
                    if (clone) newIds.push(clone.id);
                });
                selectedIds = newIds;
                renderer.setSelected(selectedIds, []);
            }
            return;
        }

        // Ctrl+Z：撤销
        if (ctrl && !e.shiftKey && key === 'z') {
            e.preventDefault();
            model.undo();
            return;
        }

        // Ctrl+Y / Ctrl+Shift+Z：重做
        if ((ctrl && key === 'y') || (ctrl && e.shiftKey && key === 'z')) {
            e.preventDefault();
            model.redo();
            return;
        }

        // Ctrl+C / Ctrl+X / Ctrl+V：复制/剪切/粘贴
        if (ctrl && key === 'c') {
            if (selectedIds.length > 0) {
                storeClipboard(selectedIds);
                SP.contextMenu && SP.contextMenu.showToast('已复制 ' + selectedIds.length + ' 个图形');
            }
            return;
        }

        if (ctrl && key === 'x') {
            if (selectedIds.length > 0) {
                storeClipboard(selectedIds);
                model.pushState();
                selectedIds.forEach(function(id) { model.deleteShape(id); });
                selectedIds = [];
                renderer.setSelected([], []);
                SP.contextMenu && SP.contextMenu.showToast('已剪切 ' + selectedIds.length + ' 个图形');
            }
            return;
        }

        if (ctrl && key === 'v') {
            var clip = getClipboard();
            if (clip && clip.length > 0) {
                model.pushState();
                var newIds = [];
                clip.forEach(function(s) {
                    var clone = model.cloneShape(s.id);
                    if (clone) newIds.push(clone.id);
                });
                selectedIds = newIds;
                renderer.setSelected(selectedIds, []);
                SP.contextMenu && SP.contextMenu.showToast('已粘贴 ' + newIds.length + ' 个图形');
            }
            return;
        }

        // 方向键移动
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(key) !== -1) {
            if (selectedIds.length > 0) {
                e.preventDefault();
                var step = e.shiftKey ? 10 : 1;
                var dx = key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0;
                var dy = key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0;
                model.pushState();
                selectedIds.forEach(function(id) {
                    var s = model.getShapeById(id);
                    if (s) {
                        var snapped = model.snapPoint(s.x + dx, s.y + dy);
                        model.updateShape(id, { x: snapped.x, y: snapped.y });
                    }
                });
            }
            return;
        }
    }

    // ============================================================
    // 剪贴板
    // ============================================================
    var clipboard = [];

    function storeClipboard(ids) {
        clipboard = ids.map(function(id) {
            return JSON.parse(JSON.stringify(model.getShapeById(id)));
        });
    }

    function getClipboard() {
        return clipboard;
    }

    // ============================================================
    // Paste 事件
    // ============================================================
    function onPaste(e) {
        if (selectedIds.length === 0) return;
        storeClipboard(selectedIds);
    }

    // ============================================================
    // 工具判断
    // ============================================================
    function isShapeTool(tool) {
        var shapeTools = ['rect','roundrect','circle','diamond','triangle',
            'hexagon','parallelogram','document','text',
            'flowchart_start','flowchart_end','flowchart_process',
            'flowchart_decision','flowchart_data','flowchart_document'];
        return shapeTools.indexOf(tool) !== -1;
    }

    // ============================================================
    // 导出 API
    // ============================================================
    SP.tools = {
        init: init,
        setTool: setTool,
        setConnectorType: setConnectorType,
        getTool: getTool,
        getSelectedIds: getSelectedIds,
        getSelectedConnIds: getSelectedConnIds,
        selectShape: selectShape,
        clearSelection: clearSelection,
        onSelectionChanged: function(cb) { selectionChangeCallback = cb; },
        setPenColor: function(c) { penState.color = c; },
        setPenWidth: function(w) { penState.width = w; },
        setEraserSize: function(sz) { eraserState.size = sz; }
    };

    global.SmartProposal = SP;

})(window);
