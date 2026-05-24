/**
 * SmartProposal v2.0 — model.js
 * 数据层：管理所有图形、连接线、画布状态，以及撤销/重做历史
 * 原则：纯数据操作，不涉及 DOM 渲染
 */
(function(global) {
    'use strict';

    // ============================================================
    // 全局命名空间
    // ============================================================
    var SP = global.SmartProposal = global.SmartProposal || {};

    // ============================================================
    // 工具函数
    // ============================================================
    var _shapeCounter = 0;
    var _connCounter = 0;

    function genShapeId() {
        return 'shape-' + Date.now() + '-' + (++_shapeCounter);
    }
    function genConnId() {
        return 'conn-' + Date.now() + '-' + (++_connCounter);
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function rectIntersects(a, b) {
        return !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
                 a.y + a.height <= b.y || b.y + b.height <= a.y);
    }

    // ============================================================
    // 默认样式
    // ============================================================
    var DEFAULT_SHAPE = {
        fill: '#ffffff',
        stroke: '#6b7280',
        strokeWidth: 2,
        rx: 3,              // 圆角（rect 专用）
        opacity: 1,
        rotation: 0,
        locked: false,
        visible: true
    };

    var DEFAULT_TEXT = {
        text: '双击编辑',
        fontSize: 14,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        fill: '#1a1a1a',
        textAlign: 'center',
        verticalAlign: 'middle',
        margin: 8
    };

    var DEFAULT_CONNECTOR = {
        stroke: '#6b7280',
        strokeWidth: 2,
        strokeDasharray: null,    // null = 实线，'5,4' = 虚线，'1.5,3' = 点线
        arrowStart: null,         // null = 无，'default' = 三角
        arrowEnd: 'default',
        label: '',
        labelFontSize: 12,
        labelFill: '#1a1a1a'
    };

    // ============================================================
    // 图形类型定义
    // ============================================================
    var SHAPE_TYPES = {
        rect:        { tag: 'rect',       hasText: true,  hasFill: true,  defaultW: 120, defaultH: 60  },
        roundrect:   { tag: 'rect',       hasText: true,  hasFill: true,  defaultW: 120, defaultH: 60, rx: 12 },
        circle:      { tag: 'ellipse',   hasText: true,  hasFill: true,  defaultW: 80,  defaultH: 80  },
        diamond:     { tag: 'polygon',   hasText: true,  hasFill: true,  defaultW: 100, defaultH: 70  },
        triangle:    { tag: 'polygon',   hasText: true,  hasFill: true,  defaultW: 100, defaultH: 80  },
        hexagon:     { tag: 'polygon',   hasText: true,  hasFill: true,  defaultW: 90,  defaultH: 80  },
        parallelogram:{ tag: 'polygon',   hasText: true,  hasFill: true,  defaultW: 120, defaultH: 60  },
        document:    { tag: 'polygon',   hasText: true,  hasFill: true,  defaultW: 120, defaultH: 70  },
        text:        { tag: 'text',      hasText: true,  hasFill: false, defaultW: 100, defaultH: 30  },
        // 流程图专用
        flowchart_start:  { tag: 'ellipse',  hasText: true, hasFill: true, defaultW: 100, defaultH: 50  },
        flowchart_end:    { tag: 'ellipse',  hasText: true, hasFill: true, defaultW: 100, defaultH: 50  },
        flowchart_process:{ tag: 'rect',     hasText: true, hasFill: true, defaultW: 120, defaultH: 60  },
        flowchart_decision:{ tag: 'polygon', hasText: true, hasFill: true, defaultW: 100, defaultH: 70  },
        flowchart_data:   { tag: 'polygon', hasText: true, hasFill: true, defaultW: 120, defaultH: 60  },
        flowchart_document:{ tag: 'polygon', hasText: true, hasFill: true, defaultW: 120, defaultH: 70  },
        // 连接线
        line: { tag: 'line', hasText: false, hasFill: false, defaultW: 100, defaultH: 2 }
    };

    // 连接线类型
    var CONNECTOR_TYPES = [
        { id: 'straight',     label: '直线箭头',   hasArrow: true  },
        { id: 'dashed',        label: '虚线箭头',   hasArrow: true, strokeDasharray: '5,4' },
        { id: 'dotted',       label: '点线箭头',   hasArrow: true, strokeDasharray: '1.5,3' },
        { id: 'bidirectional',label: '双向箭头',   hasArrow: true, arrowStart: 'default', arrowEnd: 'default' },
        { id: 'noarrow',      label: '无箭头',     hasArrow: false },
        { id: 'curved',       label: '曲线箭头',   hasArrow: true, bezier: true },
        { id: 'elbow',        label: '折线箭头',   hasArrow: true, elbow: true }
    ];

    // ============================================================
    // Canvas State
    // ============================================================
    var state = {
        shapes: [],           // Shape[]
        connectors: [],       // Connector[]
        viewBox: { x: 0, y: 0, w: 1600, h: 1200 },
        gridSize: 20,         // 网格大小
        snapToGrid: true,     // 是否吸附到网格
        snapToShape: true,    // 是否吸附到图形边缘
        gridVisible: true,
        background: '#f5f5f5',
        pageName: '未命名',
        modified: false       // 是否已修改（用于自动保存）
    };

    // ============================================================
    // 历史记录（undo / redo）
    // ============================================================
    var MAX_HISTORY = 100;
    var undoStack = [];
    var redoStack = [];

    // 初始空状态
    undoStack.push(serializeState());

    // ============================================================
    // 序列化 / 反序列化
    // ============================================================
    function serializeState() {
        return {
            shapes: deepClone(state.shapes),
            connectors: deepClone(state.connectors),
            viewBox: deepClone(state.viewBox)
        };
    }

    function deserializeState(snap) {
        state.shapes = deepClone(snap.shapes || []);
        state.connectors = deepClone(snap.connectors || []);
        state.viewBox = deepClone(snap.viewBox || { x: 0, y: 0, w: 1600, h: 1200 });
    }

    // ============================================================
    // 状态操作（触发 history）
    // ============================================================
    function pushState() {
        undoStack.push(serializeState());
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        state.modified = true;
        emit('stateChanged', serializeState());
    }

    function undo() {
        if (undoStack.length < 2) return false;
        redoStack.push(undoStack.pop());
        var s = undoStack[undoStack.length - 1];
        deserializeState(s);
        emit('stateRestored', serializeState());
        return true;
    }

    function redo() {
        if (redoStack.length === 0) return false;
        var s = redoStack.pop();
        undoStack.push(deepClone(s));
        deserializeState(s);
        emit('stateRestored', serializeState());
        return true;
    }

    function canUndo() { return undoStack.length >= 2; }
    function canRedo() { return redoStack.length > 0; }

    // ============================================================
    // Shape 操作
    // ============================================================
    function createShape(type, x, y, w, h, opts) {
        var def = SHAPE_TYPES[type] || SHAPE_TYPES.rect;
        w = w || def.defaultW || 120;
        h = h || def.defaultH || 60;
        x = x - w / 2;
        y = y - h / 2;

        var shape = Object.assign({
            id: genShapeId(),
            type: type,
            x: x, y: y, width: w, height: h,
            zIndex: state.shapes.length,
            style: deepClone(DEFAULT_SHAPE),
            text: def.hasText ? def.defaultText || '双击编辑' : '',
            textStyle: deepClone(DEFAULT_TEXT)
        }, opts);

        // 特殊类型处理（rx 在 snap 前设置，polygonPoints 在 snap 后设置）
        if (def.rx) shape.style.rx = def.rx;

        // 网格吸附（必须先吸附再计算 polygonPoints，否则坐标会偏移）
        if (state.snapToGrid) {
            shape.x = Math.round(shape.x / state.gridSize) * state.gridSize;
            shape.y = Math.round(shape.y / state.gridSize) * state.gridSize;
        }

        // 多边形点坐标：必须在网格吸附之后计算，使用吸附后的 shape.x/shape.y
        if (type === 'diamond') shape.style.polygonPoints = getDiamondPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'triangle') shape.style.polygonPoints = getTrianglePoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'hexagon') shape.style.polygonPoints = getHexagonPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'parallelogram') shape.style.polygonPoints = getParallelogramPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'document') shape.style.polygonPoints = getDocumentPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'flowchart_decision') shape.style.polygonPoints = getDiamondPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'flowchart_document') shape.style.polygonPoints = getFlowchartDocumentPoints(shape.x, shape.y, shape.width, shape.height);
        if (type === 'flowchart_data') shape.style.polygonPoints = getParallelogramPoints(shape.x, shape.y, shape.width, shape.height);

        state.shapes.push(shape);
        emit('shapeAdded', shape);
        return shape;
    }

    function updateShape(id, props) {
        var shape = getShapeById(id);
        if (!shape) return;
        var needsPointsUpdate = false;
        for (var key in props) {
            if (key === 'x' || key === 'y') {
                if (state.snapToGrid) {
                    shape[key] = Math.round(props[key] / state.gridSize) * state.gridSize;
                } else {
                    shape[key] = props[key];
                }
                needsPointsUpdate = true;
            } else if (key === 'width' || key === 'height') {
                shape[key] = props[key];
                needsPointsUpdate = true;
            } else if (key === 'style') {
                Object.assign(shape.style, props.style);
            } else if (key === 'textStyle') {
                Object.assign(shape.textStyle, props.textStyle);
            } else {
                shape[key] = props[key];
            }
        }
        // 多边形类型在位置/大小变化时重新计算 polygonPoints
        if (needsPointsUpdate && shape.style && shape.style.polygonPoints) {
            var def = SHAPE_TYPES[shape.type];
            if (def && def.tag === 'polygon') {
                if (shape.type === 'diamond' || shape.type === 'flowchart_decision') {
                    shape.style.polygonPoints = getDiamondPoints(shape.x, shape.y, shape.width, shape.height);
                } else if (shape.type === 'triangle') {
                    shape.style.polygonPoints = getTrianglePoints(shape.x, shape.y, shape.width, shape.height);
                } else if (shape.type === 'hexagon') {
                    shape.style.polygonPoints = getHexagonPoints(shape.x, shape.y, shape.width, shape.height);
                } else if (shape.type === 'parallelogram' || shape.type === 'flowchart_data') {
                    shape.style.polygonPoints = getParallelogramPoints(shape.x, shape.y, shape.width, shape.height);
                } else if (shape.type === 'document') {
                    shape.style.polygonPoints = getDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                } else if (shape.type === 'flowchart_document') {
                    shape.style.polygonPoints = getFlowchartDocumentPoints(shape.x, shape.y, shape.width, shape.height);
                }
            }
        }
        emit('shapeUpdated', shape);
    }

    function deleteShape(id) {
        var idx = state.shapes.findIndex(function(s) { return s.id === id; });
        if (idx === -1) return;
        var shape = state.shapes.splice(idx, 1)[0];
        // 同时删除关联的连接线
        var toDelete = state.connectors.filter(function(c) {
            return c.sourceId === id || c.targetId === id;
        });
        toDelete.forEach(function(c) { deleteConnector(c.id); });
        emit('shapeDeleted', shape);
    }

    function getShapeById(id) {
        return state.shapes.find(function(s) { return s.id === id; });
    }

    function getShapeAtPoint(x, y) {
        // 从上到下遍历（z-index 从高到低）
        for (var i = state.shapes.length - 1; i >= 0; i--) {
            var s = state.shapes[i];
            if (!s.visible) continue;
            if (x >= s.x && x <= s.x + s.width &&
                y >= s.y && y <= s.y + s.height) {
                return s;
            }
        }
        return null;
    }

    function getShapesInRect(rect) {
        return state.shapes.filter(function(s) {
            if (!s.visible) return false;
            return rectIntersects(rect, { x: s.x, y: s.y, width: s.width, height: s.height });
        });
    }

    function bringToFront(id) {
        var shape = getShapeById(id);
        if (!shape) return;
        var maxZ = Math.max.apply(null, state.shapes.map(function(s) { return s.zIndex || 0; }));
        shape.zIndex = maxZ + 1;
        emit('shapeUpdated', shape);
    }

    function sendToBack(id) {
        var shape = getShapeById(id);
        if (!shape) return;
        var minZ = Math.min.apply(null, state.shapes.map(function(s) { return s.zIndex || 0; }));
        shape.zIndex = minZ - 1;
        emit('shapeUpdated', shape);
    }

    function bringForward(id) {
        var shape = getShapeById(id);
        if (!shape) return;
        shape.zIndex = (shape.zIndex || 0) + 1;
        emit('shapeUpdated', shape);
    }

    function sendBackward(id) {
        var shape = getShapeById(id);
        if (!shape) return;
        shape.zIndex = Math.max(0, (shape.zIndex || 0) - 1);
        emit('shapeUpdated', shape);
    }

    // ============================================================
    // Connector 操作
    // ============================================================
    function createConnector(sourceId, targetId, sourcePoint, targetPoint, connType, opts) {
        var conn = Object.assign({
            id: genConnId(),
            sourceId: sourceId,
            targetId: targetId,
            sourcePoint: sourcePoint !== undefined ? sourcePoint : 0,
            targetPoint: targetPoint !== undefined ? targetPoint : 4,
            type: connType || 'straight',
            style: deepClone(DEFAULT_CONNECTOR)
        }, opts);

        // 从连接线类型定义中取默认值
        var connDef = CONNECTOR_TYPES.find(function(c) { return c.id === connType; });
        if (connDef) {
            if (connDef.strokeDasharray) conn.style.strokeDasharray = connDef.strokeDasharray;
            if (!opts || !opts.style || !opts.style.arrowStart) conn.style.arrowStart = connDef.arrowStart || null;
            if (!opts || !opts.style || !opts.style.arrowEnd) conn.style.arrowEnd = connDef.arrowEnd || (connDef.hasArrow ? 'default' : null);
        }

        state.connectors.push(conn);
        emit('connectorAdded', conn);
        return conn;
    }

    function updateConnector(id, props) {
        var conn = getConnectorById(id);
        if (!conn) return;
        for (var key in props) {
            if (key === 'style') {
                Object.assign(conn.style, props.style);
            } else {
                conn[key] = props[key];
            }
        }
        emit('connectorUpdated', conn);
    }

    function deleteConnector(id) {
        var idx = state.connectors.findIndex(function(c) { return c.id === id; });
        if (idx === -1) return;
        var conn = state.connectors.splice(idx, 1)[0];
        emit('connectorDeleted', conn);
    }

    function getConnectorById(id) {
        return state.connectors.find(function(c) { return c.id === id; });
    }

    function getConnectorsForShape(shapeId) {
        return state.connectors.filter(function(c) {
            return c.sourceId === shapeId || c.targetId === shapeId;
        });
    }

    // ============================================================
    // ViewBox 操作
    // ============================================================
    function setViewBox(x, y, w, h) {
        state.viewBox = { x: x, y: y, w: w, h: h };
        emit('viewBoxChanged', state.viewBox);
    }

    function zoomAt(cx, cy, factor) {
        var vb = state.viewBox;
        var newW = vb.w * factor;
        var newH = vb.h * factor;
        state.viewBox = {
            x: cx - (cx - vb.x) * factor,
            y: cy - (cy - vb.y) * factor,
            w: newW, h: newH
        };
        emit('viewBoxChanged', state.viewBox);
    }

    function resetViewBox() {
        state.viewBox = { x: 0, y: 0, w: 1600, h: 1200 };
        emit('viewBoxChanged', state.viewBox);
    }

    // ============================================================
    // 网格吸附
    // ============================================================
    function snapPoint(x, y) {
        if (!state.snapToGrid) return { x: x, y: y };
        return {
            x: Math.round(x / state.gridSize) * state.gridSize,
            y: Math.round(y / state.gridSize) * state.gridSize
        };
    }

    function setGridSize(size) {
        state.gridSize = size;
        emit('gridChanged', size);
    }

    function toggleSnapToGrid() {
        state.snapToGrid = !state.snapToGrid;
        return state.snapToGrid;
    }

    // ============================================================
    // 坐标转换（SVG 坐标 ↔ 屏幕坐标）
    // ============================================================
    function clientToSVG(clientX, clientY, canvasEl) {
        var rect = canvasEl.getBoundingClientRect();
        var vb = state.viewBox;
        return {
            x: vb.x + (clientX - rect.left) * (vb.w / rect.width),
            y: vb.y + (clientY - rect.top) * (vb.h / rect.height)
        };
    }

    function svgToClient(svgX, svgY, canvasEl) {
        var rect = canvasEl.getBoundingClientRect();
        var vb = state.viewBox;
        return {
            x: rect.left + (svgX - vb.x) * (rect.width / vb.w),
            y: rect.top + (svgY - vb.y) * (rect.height / vb.h)
        };
    }

    // ============================================================
    // 文件 I/O
    // ============================================================
    function exportJSON() {
        return JSON.stringify({
            version: '2.0',
            pageName: state.pageName,
            shapes: state.shapes,
            connectors: state.connectors,
            viewBox: state.viewBox,
            gridSize: state.gridSize
        }, null, 2);
    }

    function importJSON(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);
            if (!data.shapes) throw new Error('Invalid format');
            deserializeState({
                shapes: data.shapes || [],
                connectors: data.connectors || [],
                viewBox: data.viewBox || { x: 0, y: 0, w: 1600, h: 1200 }
            });
            state.pageName = data.pageName || '已导入';
            state.gridSize = data.gridSize || 20;
            // 重置计数器
            var maxShape = 0, maxConn = 0;
            state.shapes.forEach(function(s) {
                var m = parseInt(s.id.match(/-(\d+)$/)?.[1] || 0);
                if (m > maxShape) maxShape = m;
            });
            state.connectors.forEach(function(c) {
                var m = parseInt(c.id.match(/-(\d+)$/)?.[1] || 0);
                if (m > maxConn) maxConn = m;
            });
            _shapeCounter = maxShape;
            _connCounter = maxConn;
            undoStack = [serializeState()];
            redoStack = [];
            emit('stateRestored', serializeState());
            return true;
        } catch (e) {
            return false;
        }
    }

    function exportXML() {
        var xml = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<diagram version="2.0" name="' + escapeXml(state.pageName) + '" gridSize="' + state.gridSize + '">'];
        state.shapes.forEach(function(s) {
            var def = SHAPE_TYPES[s.type] || SHAPE_TYPES.rect;
            xml.push('  <shape id="' + s.id + '" type="' + s.type + '" x="' + s.x + '" y="' + s.y +
                '" w="' + s.width + '" h="' + s.height + '" zIndex="' + (s.zIndex||0) + '"' +
                ' fill="' + s.style.fill + '" stroke="' + s.style.stroke + '" strokeWidth="' + s.style.strokeWidth + '">');
            if (s.text) xml.push('    <text>' + escapeXml(s.text) + '</text>');
            xml.push('  </shape>');
        });
        state.connectors.forEach(function(c) {
            xml.push('  <connector id="' + c.id + '" type="' + c.type + '" source="' + c.sourceId +
                '" target="' + c.targetId + '" stroke="' + c.style.stroke + '"/>');
        });
        xml.push('</diagram>');
        return xml.join('\n');
    }

    function escapeXml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ============================================================
    // 事件系统（观察者模式）
    // ============================================================
    var listeners = {};
    function on(event, cb) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
    }
    function off(event, cb) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function(f) { return f !== cb; });
    }
    function emit(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(function(cb) {
            try { cb(data); } catch(e) { console.error('Event handler error:', e); }
        });
    }

    // ============================================================
    // 图形点计算（供 renderer 使用）
    // ============================================================
    function getDiamondPoints(x, y, w, h) {
        return (x + w/2) + ',' + y + ' ' + (x + w) + ',' + (y + h/2) + ' ' +
               (x + w/2) + ',' + (y + h) + ' ' + x + ',' + (y + h/2);
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

    // ============================================================
    // 导出公共 API
    // ============================================================
    SP.model = {
        // 状态
        getState: function() { return state; },
        getShapes: function() { return state.shapes; },
        getConnectors: function() { return state.connectors; },
        SHAPE_TYPES: SHAPE_TYPES,
        CONNECTOR_TYPES: CONNECTOR_TYPES,

        // 历史
        undo: undo,
        redo: redo,
        canUndo: canUndo,
        canRedo: canRedo,
        pushState: pushState,

        // Shape CRUD
        createShape: createShape,
        updateShape: updateShape,
        deleteShape: deleteShape,
        getShapeById: getShapeById,
        getShapeAtPoint: getShapeAtPoint,
        getShapesInRect: getShapesInRect,

        // 层级
        bringToFront: bringToFront,
        sendToBack: sendToBack,
        bringForward: bringForward,
        sendBackward: sendBackward,

        // Connector CRUD
        createConnector: createConnector,
        updateConnector: updateConnector,
        deleteConnector: deleteConnector,
        getConnectorById: getConnectorById,
        getConnectorsForShape: getConnectorsForShape,

        // ViewBox
        setViewBox: setViewBox,
        zoomAt: zoomAt,
        resetViewBox: resetViewBox,

        // 网格
        snapPoint: snapPoint,
        setGridSize: setGridSize,
        toggleSnapToGrid: toggleSnapToGrid,

        // 坐标
        clientToSVG: clientToSVG,
        svgToClient: svgToClient,

        // 文件 I/O
        exportJSON: exportJSON,
        importJSON: importJSON,
        exportXML: exportXML,

        // 多选支持（批量操作）
        deleteShapes: function(ids) {
            ids.forEach(function(id) { deleteShape(id); });
        },

        // 事件
        on: on,
        off: off,
        emit: emit,

        // 多选
        getSelectedShapes: function(ids) {
            return state.shapes.filter(function(s) { return ids.indexOf(s.id) !== -1; });
        },

        // 复制形状（用于 Ctrl+C）
        cloneShape: function(id) {
            var orig = getShapeById(id);
            if (!orig) return null;
            var clone = deepClone(orig);
            clone.id = genShapeId();
            clone.x += 20;
            clone.y += 20;
            clone.zIndex = state.shapes.length;
            state.shapes.push(clone);
            emit('shapeAdded', clone);
            return clone;
        },

        // 全量替换状态（用于 Ctrl+V 粘贴板）
        pasteShapes: function(newShapes, newConnectors) {
            pushState();
            newShapes.forEach(function(s) {
                s.id = genShapeId();
                s.zIndex = state.shapes.length;
                state.shapes.push(s);
                emit('shapeAdded', s);
            });
            newConnectors.forEach(function(c) {
                c.id = genConnId();
                state.connectors.push(c);
                emit('connectorAdded', c);
            });
        }
    };

})(window);
