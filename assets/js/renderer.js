/**
 * SmartProposal v2.0 — renderer.js
 * 渲染层：将 model 数据渲染为 SVG DOM 元素
 * 原则：只做 DOM 操作，订阅 model 事件，响应式更新
 */
(function(global) {
    'use strict';

    var SP = global.SmartProposal || {};
    var model = SP.model;
    if (!model) { console.error('renderer.js: model not found'); return; }

    // ============================================================
    // 画布引用
    // ============================================================
    var canvas = null;       // <svg id="canvas">
    var defs = null;        // <defs>
    var gridGroup = null;   // <g id="grid-layer">
    var mainLayer = null;   // <g id="main-layer">

    // 缓存：id → DOM 元素
    var shapeEls = {};
    var connEls = {};
    var textEls = {};
    var marqueeEl = null;

    // 选中高亮颜色
    var SELECT_COLOR = '#e63946';
    var SELECT_STROKE_WIDTH = 2.5;

    // ============================================================
    // 初始化
    // ============================================================
    function init(canvasId) {
        canvas = document.getElementById(canvasId);
        if (!canvas) { console.error('renderer: canvas not found:', canvasId); return; }

        // 创建图层结构
        defs = canvas.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gridGroup.id = 'grid-layer';
        mainLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        mainLayer.id = 'main-layer';

        canvas.appendChild(defs);
        canvas.appendChild(gridGroup);
        canvas.appendChild(mainLayer);

        // 确保 grid 在最低层
        canvas.insertBefore(gridGroup, canvas.firstChild);
        canvas.appendChild(mainLayer);

        // 定义 marker（箭头）
        createMarkers();

        // 定义网格 pattern
        createGridPattern();

        // 订阅 model 事件
        model.on('shapeAdded', onShapeAdded);
        model.on('shapeUpdated', onShapeUpdated);
        model.on('shapeDeleted', onShapeDeleted);
        model.on('connectorAdded', onConnectorAdded);
        model.on('connectorUpdated', onConnectorUpdated);
        model.on('connectorDeleted', onConnectorDeleted);
        model.on('stateRestored', onStateRestored);
        model.on('viewBoxChanged', onViewBoxChanged);
        model.on('gridChanged', onGridChanged);
    }

    function createMarkers() {
        var markers = [
            { id: 'arrow-default', color: '#6b7280' },
            { id: 'arrow-start-default', color: '#6b7280' }
        ];
        markers.forEach(function(m) {
            var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', m.id);
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '3.5');
            marker.setAttribute('orient', 'auto');
            var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', '0 0, 10 3.5, 0 7');
            poly.setAttribute('fill', m.color);
            marker.appendChild(poly);
            defs.appendChild(marker);
        });

        // 双向箭头开始
        var markerB = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        markerB.setAttribute('id', 'arrow-start-default');
        markerB.setAttribute('markerWidth', '10');
        markerB.setAttribute('markerHeight', '7');
        markerB.setAttribute('refX', '1');
        markerB.setAttribute('refY', '3.5');
        markerB.setAttribute('orient', 'auto-start-reverse');
        var polyB = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polyB.setAttribute('points', '0 0, 10 3.5, 0 7');
        polyB.setAttribute('fill', '#6b7280');
        markerB.appendChild(polyB);
        defs.appendChild(markerB);
    }

    function createGridPattern() {
        var state = model.getState();
        // 移除旧 pattern
        var old = defs.querySelector('#grid-pattern');
        if (old) old.remove();

        var pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.id = 'grid-pattern';
        pattern.setAttribute('width', state.gridSize);
        pattern.setAttribute('height', state.gridSize);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M ' + state.gridSize + ' 0 L 0 0 0 ' + state.gridSize);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#e5e7eb');
        path.setAttribute('stroke-width', '0.5');
        pattern.appendChild(path);
        defs.appendChild(pattern);

        // 移除旧 grid rect
        var oldRect = gridGroup.querySelector('#grid-bg');
        if (oldRect) oldRect.remove();

        // 绘制 grid
        renderGrid();
    }

    function renderGrid() {
        gridGroup.innerHTML = '';
        var state = model.getState();
        if (!state.gridVisible) return;

        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.id = 'grid-bg';
        rect.setAttribute('x', state.viewBox.x);
        rect.setAttribute('y', state.viewBox.y);
        rect.setAttribute('width', state.viewBox.w);
        rect.setAttribute('height', state.viewBox.h);
        rect.setAttribute('fill', 'url(#grid-pattern)');
        gridGroup.appendChild(rect);
    }

    // ============================================================
    // Shape 渲染
    // ============================================================
    function onShapeAdded(shape) {
        renderShape(shape);
        sortByZIndex();
    }

    function renderShape(shape) {
        if (shapeEls[shape.id]) {
            // 已有元素，更新之
            updateShapeEl(shape);
            return;
        }

        var def = model.SHAPE_TYPES[shape.type] || model.SHAPE_TYPES.rect;
        var style = shape.style || {};
        var el;

        if (def.tag === 'rect') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', shape.x);
            el.setAttribute('y', shape.y);
            el.setAttribute('width', shape.width);
            el.setAttribute('height', shape.height);
            if (style.rx) el.setAttribute('rx', style.rx);
        } else if (def.tag === 'ellipse') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            el.setAttribute('cx', shape.x + shape.width / 2);
            el.setAttribute('cy', shape.y + shape.height / 2);
            el.setAttribute('rx', shape.width / 2);
            el.setAttribute('ry', shape.height / 2);
        } else if (def.tag === 'polygon') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            var pts = style.polygonPoints;
            if (!pts) {
                if (shape.type === 'flowchart_document') pts = getFlowchartDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'flowchart_data' || shape.type === 'parallelogram') pts = getParallelogramPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'document') pts = getDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'triangle') pts = getTrianglePoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'hexagon') pts = getHexagonPoints(shape.x, shape.y, shape.width, shape.height);
                else pts = getDiamondPoints(shape.x, shape.y, shape.width, shape.height);
            }
            el.setAttribute('points', pts);
        } else if (def.tag === 'line') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            el.setAttribute('x1', shape.x);
            el.setAttribute('y1', shape.y);
            el.setAttribute('x2', shape.x + shape.width);
            el.setAttribute('y2', shape.y + shape.height);
        } else if (def.tag === 'text') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            el.setAttribute('x', shape.x + shape.width / 2);
            el.setAttribute('y', shape.y + shape.height / 2);
            el.setAttribute('font-size', shape.textStyle?.fontSize || 14);
            el.setAttribute('text-anchor', 'middle');
            el.setAttribute('dominant-baseline', 'central');
        }

        if (!el) return;

        el.setAttribute('data-id', shape.id);
        el.setAttribute('data-type', 'shape');
        el.classList.add('sp-shape');

        applyShapeStyle(el, shape);
        mainLayer.appendChild(el);
        shapeEls[shape.id] = el;

        // 文本
        if (def.hasText) {
            renderText(shape);
        }

        // 连接点
        renderConnectionPoints(shape);

        return el;
    }

    function applyShapeStyle(el, shape) {
        var style = shape.style || {};
        var def = model.SHAPE_TYPES[shape.type] || model.SHAPE_TYPES.rect;

        if (def.tag !== 'text') {
            el.setAttribute('fill', style.fill || '#ffffff');
            el.setAttribute('stroke', style.stroke || '#6b7280');
            el.setAttribute('stroke-width', style.strokeWidth || 2);
        }
        if (style.opacity !== undefined) {
            el.setAttribute('opacity', style.opacity);
        }
        if (style.rotation) {
            el.setAttribute('transform', 'rotate(' + style.rotation + ',' +
                (shape.x + shape.width/2) + ',' + (shape.y + shape.height/2) + ')');
        }
    }

    function renderText(shape) {
        // 移除旧文本
        var old = mainLayer.querySelector('[data-parent="' + shape.id + '"]');
        if (old) old.remove();

        if (!shape.text && shape.text !== 0) return;

        var textStyle = shape.textStyle || {};
        var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('data-parent', shape.id);
        txt.setAttribute('data-type', 'text');
        txt.classList.add('sp-text');

        var x = shape.x + shape.width / 2;
        var y = shape.y + shape.height / 2;

        txt.setAttribute('x', x);
        txt.setAttribute('y', y);
        txt.setAttribute('font-size', textStyle.fontSize || 14);
        txt.setAttribute('font-family', textStyle.fontFamily || 'Inter, sans-serif');
        txt.setAttribute('font-weight', textStyle.fontWeight || 'normal');
        txt.setAttribute('font-style', textStyle.fontStyle || 'normal');
        txt.setAttribute('text-decoration', textStyle.textDecoration || 'none');
        txt.setAttribute('fill', textStyle.fill || '#1a1a1a');
        txt.setAttribute('text-anchor', textStyle.textAlign === 'left' ? 'start' :
                                      textStyle.textAlign === 'right' ? 'end' : 'middle');
        txt.setAttribute('dominant-baseline', 'central');

        // 多行文本
        var lines = (shape.text || '').split('\n');
        var lineHeight = (textStyle.fontSize || 14) * 1.3;
        var startY = y - (lines.length - 1) * lineHeight / 2;

        if (lines.length === 1) {
            txt.textContent = shape.text;
        } else {
            lines.forEach(function(line, i) {
                var tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.setAttribute('x', x);
                tspan.setAttribute('dy', i === 0 ? 0 : lineHeight);
                tspan.textContent = line;
                txt.appendChild(tspan);
            });
        }

        mainLayer.appendChild(txt);
        textEls[shape.id] = txt;
    }

    function renderConnectionPoints(shape) {
        // 移除旧连接点
        mainLayer.querySelectorAll('.sp-conn-point[data-shape-id="' + shape.id + '"]').forEach(function(el) {
            el.remove();
        });

        // 8 个锚点：上右下左 + 四个角
        var points = [
            { x: shape.x + shape.width / 2, y: shape.y,                     name: 'top' },
            { x: shape.x + shape.width,     y: shape.y + shape.height / 2,   name: 'right' },
            { x: shape.x + shape.width / 2, y: shape.y + shape.height,        name: 'bottom' },
            { x: shape.x,                    y: shape.y + shape.height / 2,   name: 'left' }
        ];

        points.forEach(function(pt, i) {
            var cp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            cp.setAttribute('cx', pt.x);
            cp.setAttribute('cy', pt.y);
            cp.setAttribute('r', 6);
            cp.setAttribute('data-shape-id', shape.id);
            cp.setAttribute('data-point-index', i);
            cp.classList.add('sp-conn-point');
            mainLayer.appendChild(cp);
        });
    }

    function updateShapeEl(shape) {
        var el = shapeEls[shape.id];
        if (!el) return;

        var def = model.SHAPE_TYPES[shape.type] || model.SHAPE_TYPES.rect;
        var style = shape.style || {};

        if (def.tag === 'rect') {
            el.setAttribute('x', shape.x);
            el.setAttribute('y', shape.y);
            el.setAttribute('width', shape.width);
            el.setAttribute('height', shape.height);
            if (style.rx !== undefined) el.setAttribute('rx', style.rx);
        } else if (def.tag === 'ellipse') {
            el.setAttribute('cx', shape.x + shape.width / 2);
            el.setAttribute('cy', shape.y + shape.height / 2);
            el.setAttribute('rx', shape.width / 2);
            el.setAttribute('ry', shape.height / 2);
        } else if (def.tag === 'polygon') {
            var pts = style.polygonPoints;
            if (!pts) {
                if (shape.type === 'flowchart_document') pts = getFlowchartDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'flowchart_data' || shape.type === 'parallelogram') pts = getParallelogramPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'document') pts = getDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'triangle') pts = getTrianglePoints(shape.x, shape.y, shape.width, shape.height);
                else if (shape.type === 'hexagon') pts = getHexagonPoints(shape.x, shape.y, shape.width, shape.height);
                else pts = getDiamondPoints(shape.x, shape.y, shape.width, shape.height);
            }
            el.setAttribute('points', pts);
        } else if (def.tag === 'text') {
            el.setAttribute('x', shape.x + shape.width / 2);
            el.setAttribute('y', shape.y + shape.height / 2);
        }

        applyShapeStyle(el, shape);

        // 更新文本
        if (def.hasText) {
            renderText(shape);
        }

        // 更新连接点
        renderConnectionPoints(shape);

        // 更新连接线（端点跟随图形）
        var conns = model.getConnectorsForShape(shape.id);
        conns.forEach(function(c) {
            renderConnector(c);
        });
    }

    function onShapeUpdated(shape) {
        updateShapeEl(shape);
        sortByZIndex();
    }

    function onShapeDeleted(shape) {
        var el = shapeEls[shape.id];
        if (el) { el.remove(); delete shapeEls[shape.id]; }
        var txt = textEls[shape.id];
        if (txt) { txt.remove(); delete textEls[shape.id]; }
        // 删除连接点
        mainLayer.querySelectorAll('.sp-conn-point[data-shape-id="' + shape.id + '"]').forEach(function(el) {
            el.remove();
        });
    }

    // ============================================================
    // Connector 渲染
    // ============================================================
    function onConnectorAdded(conn) {
        renderConnector(conn);
    }

    function renderConnector(conn) {
        var old = connEls[conn.id];
        if (old) { old.remove(); }

        var src = model.getShapeById(conn.sourceId);
        var tgt = model.getShapeById(conn.targetId);
        if (!src || !tgt) return;

        var srcPt = getConnectionPoint(src, conn.sourcePoint);
        var tgtPt = getConnectionPoint(tgt, conn.targetPoint);
        var style = conn.style || {};

        var el;
        var connDef = model.CONNECTOR_TYPES.find(function(c) { return c.id === conn.type; }) || {};

        if (connDef.bezier) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            var mx = (srcPt.x + tgtPt.x) / 2;
            var my = (srcPt.y + tgtPt.y) / 2;
            var d = 'M' + srcPt.x + ',' + srcPt.y +
                    ' C' + (srcPt.x + Math.abs(tgtPt.x - srcPt.x) * 0.5) + ',' + srcPt.y +
                    ',' + (tgtPt.x - Math.abs(tgtPt.x - srcPt.x) * 0.5) + ',' + tgtPt.y +
                    ',' + tgtPt.x + ',' + tgtPt.y;
            el.setAttribute('d', d);
        } else if (connDef.elbow) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            var midX = (srcPt.x + tgtPt.x) / 2;
            el.setAttribute('points',
                srcPt.x + ',' + srcPt.y + ' ' +
                midX + ',' + srcPt.y + ' ' +
                midX + ',' + tgtPt.y + ' ' +
                tgtPt.x + ',' + tgtPt.y
            );
        } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            el.setAttribute('x1', srcPt.x);
            el.setAttribute('y1', srcPt.y);
            el.setAttribute('x2', tgtPt.x);
            el.setAttribute('y2', tgtPt.y);
        }

        el.setAttribute('data-id', conn.id);
        el.setAttribute('data-type', 'connector');
        el.classList.add('sp-connector');
        el.setAttribute('stroke', style.stroke || '#6b7280');
        el.setAttribute('stroke-width', style.strokeWidth || 2);

        if (style.strokeDasharray) {
            el.setAttribute('stroke-dasharray', style.strokeDasharray);
        }

        // 箭头
        if (style.arrowEnd) {
            el.setAttribute('marker-end', 'url(#arrow-default)');
        }
        if (style.arrowStart) {
            el.setAttribute('marker-start', 'url(#arrow-start-default)');
        }

        el.style.fill = 'none';

        mainLayer.appendChild(el);
        connEls[conn.id] = el;

        // 连接线标签
        if (conn.label) {
            renderConnectorLabel(conn, (srcPt.x + tgtPt.x) / 2, (srcPt.y + tgtPt.y) / 2);
        }
    }

    function getConnectionPoint(shape, pointIndex) {
        var x = shape.x, y = shape.y, w = shape.width, h = shape.height;
        var pts = [
            { x: x + w/2, y: y },         // 0: top
            { x: x + w,   y: y + h/2 },   // 1: right
            { x: x + w/2, y: y + h },     // 2: bottom
            { x: x,       y: y + h/2 }    // 3: left
        ];
        return pts[pointIndex] || pts[0];
    }

    function renderConnectorLabel(conn, cx, cy) {
        var old = mainLayer.querySelector('[data-conn-label="' + conn.id + '"]');
        if (old) old.remove();

        var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', cx);
        txt.setAttribute('y', cy - 8);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', conn.style.labelFontSize || 12);
        txt.setAttribute('fill', conn.style.labelFill || '#1a1a1a');
        txt.setAttribute('data-conn-label', conn.id);
        txt.textContent = conn.label;
        txt.style.pointerEvents = 'none';
        txt.style.userSelect = 'none';
        mainLayer.appendChild(txt);
    }

    function onConnectorUpdated(conn) {
        renderConnector(conn);
    }

    function onConnectorDeleted(conn) {
        var el = connEls[conn.id];
        if (el) { el.remove(); delete connEls[conn.id]; }
        var label = mainLayer.querySelector('[data-conn-label="' + conn.id + '"]');
        if (label) label.remove();
    }

    // ============================================================
    // 状态恢复（全量重绘）
    // ============================================================
    function onStateRestored(state) {
        // 清空主图层
        mainLayer.innerHTML = '';
        shapeEls = {};
        connEls = {};
        textEls = {};

        // 按 zIndex 排序后重绘
        var shapes = state.shapes.slice().sort(function(a, b) {
            return (a.zIndex || 0) - (b.zIndex || 0);
        });
        shapes.forEach(function(s) { renderShape(s); });

        state.connectors.forEach(function(c) { renderConnector(c); });

        updateViewBox(model.getState().viewBox);
    }

    // ============================================================
    // ViewBox 同步
    // ============================================================
    function onViewBoxChanged(vb) {
        updateViewBox(vb);
    }

    function updateViewBox(vb) {
        if (!canvas) return;
        canvas.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
        renderGrid();
    }

    function onGridChanged(size) {
        createGridPattern();
    }

    // ============================================================
    // Z-Order
    // ============================================================
    function sortByZIndex() {
        var sorted = model.getShapes().slice().sort(function(a, b) {
            return (a.zIndex || 0) - (b.zIndex || 0);
        });
        sorted.forEach(function(shape) {
            var el = shapeEls[shape.id];
            if (el) mainLayer.appendChild(el);
            var txt = textEls[shape.id];
            if (txt) mainLayer.appendChild(txt);
        });
    }

    // ============================================================
    // 选中效果
    // ============================================================
    function setSelected(shapeIds, connIds) {
        // 清除所有选中
        mainLayer.querySelectorAll('.sp-selected').forEach(function(el) {
            el.classList.remove('sp-selected');
        });
        mainLayer.querySelectorAll('.sp-selected-conn').forEach(function(el) {
            el.classList.remove('sp-selected-conn');
        });

        // 高亮选中图形
        (shapeIds || []).forEach(function(id) {
            var el = shapeEls[id];
            if (el) {
                el.classList.add('sp-selected');
                el.setAttribute('stroke', SELECT_COLOR);
                el.setAttribute('stroke-width', SELECT_STROKE_WIDTH);
            }
        });

        // 高亮选中连接线
        (connIds || []).forEach(function(id) {
            var el = connEls[id];
            if (el) {
                el.classList.add('sp-selected-conn');
                el.setAttribute('stroke', SELECT_COLOR);
                el.setAttribute('stroke-width', SELECT_STROKE_WIDTH);
            }
        });
    }

    // ============================================================
    // Marquee 选择框
    // ============================================================
    function showMarquee(x, y, w, h) {
        if (!marqueeEl) {
            marqueeEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            marqueeEl.classList.add('sp-marquee');
            marqueeEl.setAttribute('fill', 'rgba(59,130,246,0.10)');
            marqueeEl.setAttribute('stroke', '#3b82f6');
            marqueeEl.setAttribute('stroke-width', '1.5');
            marqueeEl.setAttribute('rx', '3');
            marqueeEl.style.pointerEvents = 'none';
            mainLayer.appendChild(marqueeEl);
        }
        marqueeEl.setAttribute('x', x);
        marqueeEl.setAttribute('y', y);
        marqueeEl.setAttribute('width', w);
        marqueeEl.setAttribute('height', h);
        marqueeEl.style.display = '';
    }

    function hideMarquee() {
        if (marqueeEl) marqueeEl.style.display = 'none';
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function getDiamondPoints(x, y, w, h) {
        return (x+w/2)+','+y+' '+(x+w)+','+(y+h/2)+' '+(x+w/2)+','+(y+h)+' '+x+','+(y+h/2);
    }
    function getTrianglePoints(x, y, w, h) {
        return (x + w/2) + ',' + y + ' ' + (x + w) + ',' + (y + h) + ' ' + x + ',' + (y + h);
    }
    function getHexagonPoints(x, y, w, h) {
        var qw = w * 0.25, qh = h * 0.25;
        return (x + qw) + ',' + y + ' ' + (x + w - qw) + ',' + y + ' ' +
               (x + w) + ',' + (y + qh) + ' ' + (x + w) + ',' + (y + h - qh) + ' ' +
               (x + w - qw) + ',' + (y + h) + ' ' + (x + qw) + ',' + (y + h);
    }
    function getParallelogramPoints(x, y, w, h) {
        var skew = w * 0.2;
        return (x + skew) + ',' + y + ' ' + (x + w) + ',' + y + ' ' +
               (x + w - skew) + ',' + (y + h) + ' ' + x + ',' + (y + h);
    }
    function getDocumentPoints(x, y, w, h) {
        return x + ',' + y + ' ' + (x + w * 0.7) + ',' + y + ' ' +
               (x + w) + ',' + (y + h * 0.3) + ' ' + (x + w) + ',' + (y + h) + ' ' +
               x + ',' + (y + h);
    }
    function getFlowchartDocumentPoints(x, y, w, h) {
        var wave = h * 0.12;
        var steps = 4;
        var stepW = w / steps;
        var pts = [x + ',' + y];
        for (var i = 1; i <= steps; i++) {
            var px = x + stepW * i;
            var py = y + (i % 2 === 1 ? wave : 0);
            pts.push(px + ',' + py);
        }
        pts.push((x + w) + ',' + (y + h));
        pts.push(x + ',' + (y + h));
        return pts.join(' ');
    }

    function getEl(id) { return shapeEls[id] || connEls[id]; }

    // ============================================================
    // 导出 PNG（使用 canvas 绘制）
    // ============================================================
    function exportPNG(scale) {
        scale = scale || 2;
        var svgStr = new XMLSerializer().serializeToString(canvas);
        var vb = model.getState().viewBox;
        var w = vb.w * scale, h = vb.h * scale;

        return new Promise(function(resolve) {
            var img = new Image();
            img.onload = function() {
                var cvs = document.createElement('canvas');
                cvs.width = w; cvs.height = h;
                var ctx = cvs.getContext('2d');
                ctx.fillStyle = model.getState().background || '#f5f5f5';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(cvs.toDataURL('image/png'));
            };
            img.onerror = function() { resolve(null); };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
        });
    }

    function exportSVGString() {
        var clone = canvas.cloneNode(true);
        // 移除选中效果
        clone.querySelectorAll('.sp-selected, .sp-selected-conn').forEach(function(el) {
            el.classList.remove('sp-selected', 'sp-selected-conn');
        });
        // 移除连接点
        clone.querySelectorAll('.sp-conn-point').forEach(function(el) { el.remove(); });
        return new XMLSerializer().serializeToString(clone);
    }

    // ============================================================
    // 导出 API
    // ============================================================
    SP.renderer = {
        init: init,
        exportPNG: exportPNG,
        exportSVGString: exportSVGString,
        setSelected: setSelected,
        showMarquee: showMarquee,
        hideMarquee: hideMarquee,
        getCanvas: function() { return canvas; },
        getShapeEl: function(id) { return shapeEls[id]; },
        getConnEl: function(id) { return connEls[id]; }
    };

    global.SmartProposal = SP;

})(window);
