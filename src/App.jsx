import React, { useState, useRef, useEffect, useCallback } from 'react';
import { solveStructure } from './core/Solver';
import './App.css';

const MODES = {
  SELECT: 'select',
  ADD_NODE: 'add_node',
  ADD_BEAM: 'add_beam',
  ADD_LOAD: 'add_load',
  SET_SUPPORT: 'set_support'
};

const UNIT_SYSTEMS = {
  SI_kN_m: { name: 'SI (kN, m)', force: 'kN', length: 'm', E: 210e6 },
  SI_N_mm: { name: 'SI (N, mm)', force: 'N', length: 'mm', E: 210000 },
  Imperial: { name: 'Imperial (kip, ft)', force: 'kip', length: 'ft', E: 29000 }
};

const SUPPORT_TYPES = {
  FREE: { rx: 0, ry: 0, name: 'Libre', color: '#fff', symbol: '○' },
  PINNED: { rx: 1, ry: 1, name: 'Articulado (Fijo)', color: '#00ff88', symbol: '△' },
  ROLLER_Y: { rx: 0, ry: 1, name: 'Simple (Móvil)', color: '#ffff00', symbol: '◎' }
};

const PREDEFINED_STRUCTURES = {
  triangle: {
    name: '△ Triángulo Simple',
    desc: 'Ideal para empezar',
    nodes: [
      { x: 0, y: 0, rx: 1, ry: 1 },
      { x: 4, y: 0, rx: 0, ry: 1 },
      { x: 2, y: 3, rx: 0, ry: 0 }
    ],
    elements: [[0, 1], [1, 2], [2, 0]],
    loads: [{ node: 2, fx: 0, fy: -10 }]
  },
  warren: {
    name: '◇ Warren',
    desc: 'Puente clásico',
    nodes: [
      { x: 0, y: 0, rx: 1, ry: 1 },
      { x: 2, y: 0, rx: 0, ry: 0 },
      { x: 4, y: 0, rx: 0, ry: 0 },
      { x: 6, y: 0, rx: 0, ry: 1 },
      { x: 1, y: 1.5, rx: 0, ry: 0 },
      { x: 3, y: 1.5, rx: 0, ry: 0 },
      { x: 5, y: 1.5, rx: 0, ry: 0 }
    ],
    elements: [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 3]],
    loads: [{ node: 5, fx: 0, fy: -10 }]
  },
  pratt: {
    name: '▭ Pratt',
    desc: 'Estructura industrial',
    nodes: [
      { x: 0, y: 0, rx: 1, ry: 1 },
      { x: 2, y: 0, rx: 0, ry: 0 },
      { x: 4, y: 0, rx: 0, ry: 0 },
      { x: 6, y: 0, rx: 0, ry: 0 },
      { x: 8, y: 0, rx: 0, ry: 1 },
      { x: 0, y: 2, rx: 0, ry: 0 },
      { x: 2, y: 2, rx: 0, ry: 0 },
      { x: 4, y: 2, rx: 0, ry: 0 },
      { x: 6, y: 2, rx: 0, ry: 0 },
      { x: 8, y: 2, rx: 0, ry: 0 }
    ],
    elements: [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [0, 5], [1, 6], [2, 7], [3, 8], [4, 9], [5, 1], [6, 2], [7, 3], [8, 4]],
    loads: [{ node: 7, fx: 0, fy: -15 }]
  },
  cantilever: {
    name: '⊢ Ménsula',
    desc: 'Voladizo empotrado',
    nodes: [
      { x: 0, y: 0, rx: 1, ry: 1 },
      { x: 0, y: 2, rx: 1, ry: 1 },
      { x: 3, y: 0, rx: 0, ry: 0 },
      { x: 3, y: 2, rx: 0, ry: 0 },
      { x: 6, y: 0, rx: 0, ry: 0 },
      { x: 6, y: 2, rx: 0, ry: 0 }
    ],
    elements: [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1], [2, 3], [4, 5], [1, 2], [3, 4]],
    loads: [{ node: 4, fx: 0, fy: -10 }, { node: 5, fx: 0, fy: -10 }]
  }
};

const DEFAULT_A = 10;

// Cargar triángulo por defecto
const getInitialState = (units) => {
  const preset = PREDEFINED_STRUCTURES.triangle;
  const idMap = {};
  const newNodes = preset.nodes.map((n, i) => {
    idMap[i] = i + 1;
    return { id: i + 1, x: n.x, y: n.y, rx: n.rx, ry: n.ry };
  });
  const newElements = preset.elements.map((e, i) => ({
    id: i + 1, n1: idMap[e[0]], n2: idMap[e[1]], E: units.E, A: DEFAULT_A
  }));
  const newLoads = preset.loads.map(l => ({
    nodeId: idMap[l.node], fx: l.fx, fy: l.fy
  }));
  return { nodes: newNodes, elements: newElements, loads: newLoads };
};

function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [unitSystem, setUnitSystem] = useState('SI_kN_m');
  const units = UNIT_SYSTEMS[unitSystem];

  // Iniciar con ejemplo precargado
  const initial = getInitialState(units);
  const [nodes, setNodes] = useState(initial.nodes);
  const [elements, setElements] = useState(initial.elements);
  const [loads, setLoads] = useState(initial.loads);
  const [results, setResults] = useState(null);

  const [mode, setMode] = useState(MODES.SELECT);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [tempNode, setTempNode] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');

  const [inputX, setInputX] = useState('');
  const [inputY, setInputY] = useState('');
  const [loadFx, setLoadFx] = useState('0');
  const [loadFy, setLoadFy] = useState('-10');
  const [selectedSupportType, setSelectedSupportType] = useState('PINNED');

  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  const nextNodeId = useRef(4); // Después del triángulo inicial
  const nextElemId = useRef(4);
  const canvasRef = useRef(null);

  const [scale, setScale] = useState(50);
  const [pan, setPan] = useState({ x: 250, y: 280 });

  // --- Helpers ---
  const toScreen = useCallback((x, y) => ({ x: x * scale + pan.x, y: -y * scale + pan.y }), [scale, pan]);
  const toWorld = useCallback((sx, sy) => ({ x: (sx - pan.x) / scale, y: -(sy - pan.y) / scale }), [scale, pan]);

  const findNodeAt = useCallback((cx, cy) => {
    for (let n of nodes) {
      const sx = n.x * scale + pan.x;
      const sy = -n.y * scale + pan.y;
      if (Math.hypot(cx - sx, cy - sy) < 18) return n;
    }
    return null;
  }, [nodes, scale, pan]);

  const getBarLength = (n1, n2) => Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
  const snapToGrid = (val) => Math.round(val * 2) / 2;

  // --- Mouse Events ---
  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setLastPanPos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (mode === MODES.SELECT) {
      const node = findNodeAt(cx, cy);
      if (node) {
        setSelectedNodeId(node.id);
        setDragNodeId(node.id);
        setIsDragging(true);
      } else {
        setSelectedNodeId(null);
      }
    } else if (mode === MODES.ADD_NODE) {
      const w = toWorld(cx, cy);
      addNodeAt(snapToGrid(w.x), snapToGrid(w.y));
    } else if (mode === MODES.ADD_BEAM) {
      const node = findNodeAt(cx, cy);
      if (node) {
        if (!tempNode) setTempNode(node.id);
        else {
          if (node.id !== tempNode) addBeam(tempNode, node.id);
          setTempNode(null);
        }
      } else setTempNode(null);
    } else if (mode === MODES.SET_SUPPORT) {
      const node = findNodeAt(cx, cy);
      if (node) applySupport(node.id);
    } else if (mode === MODES.ADD_LOAD) {
      const node = findNodeAt(cx, cy);
      if (node) addLoadToNode(node.id);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan(p => ({ x: p.x + e.clientX - lastPanPos.x, y: p.y + e.clientY - lastPanPos.y }));
      setLastPanPos({ x: e.clientX, y: e.clientY });
    } else if (isDragging && dragNodeId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: snapToGrid(w.x), y: snapToGrid(w.y) } : n));
      setResults(null);
    }
  };

  const handleMouseUp = () => { setIsDragging(false); setDragNodeId(null); setIsPanning(false); };
  const handleWheel = (e) => { e.preventDefault(); setScale(s => Math.max(20, Math.min(100, s + (e.deltaY > 0 ? -5 : 5)))); };
  const handleContextMenu = (e) => e.preventDefault();

  // --- Touch Events for Mobile ---
  const lastTouchRef = useRef(null);
  const pinchDistRef = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
      return;
    }

    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = touch.clientX - rect.left;
    const cy = touch.clientY - rect.top;

    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };

    if (mode === MODES.SELECT) {
      const node = findNodeAt(cx, cy);
      if (node) {
        setSelectedNodeId(node.id);
        setDragNodeId(node.id);
        setIsDragging(true);
      } else {
        setSelectedNodeId(null);
        setIsPanning(true);
      }
    } else if (mode === MODES.ADD_NODE) {
      const w = toWorld(cx, cy);
      addNodeAt(snapToGrid(w.x), snapToGrid(w.y));
    } else if (mode === MODES.ADD_BEAM) {
      const node = findNodeAt(cx, cy);
      if (node) {
        if (!tempNode) setTempNode(node.id);
        else {
          if (node.id !== tempNode) addBeam(tempNode, node.id);
          setTempNode(null);
        }
      } else setTempNode(null);
    } else if (mode === MODES.SET_SUPPORT) {
      const node = findNodeAt(cx, cy);
      if (node) applySupport(node.id);
    } else if (mode === MODES.ADD_LOAD) {
      const node = findNodeAt(cx, cy);
      if (node) addLoadToNode(node.id);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchDistRef.current) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = dist - pinchDistRef.current;
      setScale(s => Math.max(20, Math.min(100, s + delta * 0.3)));
      pinchDistRef.current = dist;
      return;
    }

    const touch = e.touches[0];
    if (!lastTouchRef.current) return;

    if (isPanning) {
      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (isDragging && dragNodeId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const w = toWorld(touch.clientX - rect.left, touch.clientY - rect.top);
      setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: snapToGrid(w.x), y: snapToGrid(w.y) } : n));
      setResults(null);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragNodeId(null);
    setIsPanning(false);
    lastTouchRef.current = null;
    pinchDistRef.current = null;
  };

  // --- Actions ---
  const addNodeAt = (x, y, rx = 0, ry = 0) => {
    setNodes(prev => [...prev, { id: nextNodeId.current++, x, y, rx, ry }]);
    setResults(null);
  };

  const handleAddNodeManual = () => {
    const x = parseFloat(inputX), y = parseFloat(inputY);
    if (isNaN(x) || isNaN(y)) return alert("Ingresa X e Y válidos");
    addNodeAt(x, y);
    setInputX(''); setInputY('');
  };

  const updateSelectedNode = (field, value) => {
    const val = parseFloat(value);
    if (isNaN(val) || !selectedNodeId) return;
    setNodes(nodes.map(n => n.id === selectedNodeId ? { ...n, [field]: val } : n));
    setResults(null);
  };

  const addBeam = (n1, n2) => {
    if (elements.some(e => (e.n1 === n1 && e.n2 === n2) || (e.n1 === n2 && e.n2 === n1))) return;
    setElements(prev => [...prev, { id: nextElemId.current++, n1, n2, E: units.E, A: DEFAULT_A }]);
    setResults(null);
  };

  const applySupport = (nodeId) => {
    const s = SUPPORT_TYPES[selectedSupportType];
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, rx: s.rx, ry: s.ry } : n));
    setResults(null);
  };

  const addLoadToNode = (nodeId) => {
    const fx = parseFloat(loadFx) || 0, fy = parseFloat(loadFy) || 0;
    const idx = loads.findIndex(l => l.nodeId === nodeId);
    if (idx >= 0) setLoads(loads.map((l, i) => i === idx ? { ...l, fx: l.fx + fx, fy: l.fy + fy } : l));
    else setLoads([...loads, { nodeId, fx, fy }]);
    setResults(null);
  };

  const handleSolve = () => {
    if (nodes.length < 2 || elements.length < 1) return alert("Necesitas al menos 2 nudos y 1 barra");
    try {
      const res = solveStructure(nodes, elements, loads);
      if (res.error) alert(res.error);
      else setResults(res);
    } catch (e) { alert("Error: " + e.message); }
  };

  const clearAll = () => {
    setNodes([]); setElements([]); setLoads([]); setResults(null);
    nextNodeId.current = 1; nextElemId.current = 1;
    setSelectedNodeId(null); setTempNode(null);
  };

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes(nodes.filter(n => n.id !== selectedNodeId));
    setElements(elements.filter(e => e.n1 !== selectedNodeId && e.n2 !== selectedNodeId));
    setLoads(loads.filter(l => l.nodeId !== selectedNodeId));
    setSelectedNodeId(null); setResults(null);
  };

  const loadPreset = (key) => {
    const preset = PREDEFINED_STRUCTURES[key];
    const idMap = {};
    const newNodes = preset.nodes.map((n, i) => { idMap[i] = i + 1; return { id: i + 1, ...n }; });
    const newElements = preset.elements.map((e, i) => ({ id: i + 1, n1: idMap[e[0]], n2: idMap[e[1]], E: units.E, A: DEFAULT_A }));
    const newLoads = preset.loads.map(l => ({ nodeId: idMap[l.node], fx: l.fx, fy: l.fy }));

    nextNodeId.current = newNodes.length + 1;
    nextElemId.current = newElements.length + 1;
    setNodes(newNodes); setElements(newElements); setLoads(newLoads);
    setResults(null); setSelectedNodeId(null); setActiveTab('editor'); setMode(MODES.SELECT);

    // Center view
    const cx = newNodes.reduce((s, n) => s + n.x, 0) / newNodes.length;
    const cy = newNodes.reduce((s, n) => s + n.y, 0) / newNodes.length;
    setPan({ x: 350 - cx * scale, y: 250 + cy * scale });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const getSupportName = (n) => n.rx && n.ry ? 'Articulado' : n.ry ? 'Simple' : n.rx ? 'Móvil' : 'Libre';

  return (
    <>
      {/* Welcome Modal */}
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-modal">
            <h2>🏗️ Analizador de Reticulados</h2>
            <p>Calcula esfuerzos axiales, reacciones y determina si las barras están en tracción o compresión.</p>
            <ol className="steps">
              <li><strong>Arrastra</strong> los nudos para modificar la geometría</li>
              <li><strong>Agrega</strong> cargas, apoyos o nuevas barras</li>
              <li><strong>Presiona "Calcular"</strong> para ver resultados</li>
            </ol>
            <p style={{ fontSize: '0.9rem', color: '#888' }}>Ya hay un triángulo cargado para que pruebes.</p>
            <button className="start-btn" onClick={() => setShowWelcome(false)}>
              ¡Empezar!
            </button>
          </div>
        </div>
      )}

      <div className="app-container">
        <div className="toolbar">
          <h3>🏗️ Reticulados</h3>

          <div className="tabs">
            <button className={activeTab === 'editor' ? 'tab active' : 'tab'} onClick={() => setActiveTab('editor')}>✏️ Editor</button>
            <button className={activeTab === 'presets' ? 'tab active' : 'tab'} onClick={() => setActiveTab('presets')}>📁 Ejemplos</button>
          </div>

          {activeTab === 'presets' ? (
            <div className="presets-panel">
              <p className="info-text">Elige un ejemplo. <strong>Luego puedes modificarlo</strong> arrastrando nudos.</p>
              <div className="preset-list">
                {Object.entries(PREDEFINED_STRUCTURES).map(([key, p]) => (
                  <button key={key} className="preset-btn" onClick={() => loadPreset(key)}>
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-desc">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="section-title">Unidades</div>
              <select value={unitSystem} onChange={e => setUnitSystem(e.target.value)} className="unit-select">
                {Object.entries(UNIT_SYSTEMS).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
              </select>

              <div className="section-title">Herramientas</div>
              <div className="button-group tools">
                <button className={mode === MODES.SELECT ? 'active' : ''} onClick={() => setMode(MODES.SELECT)}>🖱️ Mover</button>
                <button className={mode === MODES.ADD_NODE ? 'active' : ''} onClick={() => setMode(MODES.ADD_NODE)}>⊕ Nudo</button>
                <button className={mode === MODES.ADD_BEAM ? 'active' : ''} onClick={() => setMode(MODES.ADD_BEAM)}>— Barra</button>
                <button className={mode === MODES.SET_SUPPORT ? 'active' : ''} onClick={() => setMode(MODES.SET_SUPPORT)}>▽ Apoyo</button>
                <button className={mode === MODES.ADD_LOAD ? 'active' : ''} onClick={() => setMode(MODES.ADD_LOAD)}>↓ Carga</button>
              </div>

              {mode === MODES.ADD_NODE && (
                <div className="context-panel">
                  <div className="section-title">O ingresa coordenadas</div>
                  <div className="input-row">
                    <input type="number" step="0.5" placeholder="X" value={inputX} onChange={e => setInputX(e.target.value)} />
                    <input type="number" step="0.5" placeholder="Y" value={inputY} onChange={e => setInputY(e.target.value)} />
                    <button onClick={handleAddNodeManual}>+</button>
                  </div>
                </div>
              )}

              {mode === MODES.SET_SUPPORT && (
                <div className="context-panel">
                  <div className="section-title">Tipo de Apoyo (click en nudo)</div>
                  {Object.entries(SUPPORT_TYPES).map(([k, s]) => (
                    <button key={k} className={selectedSupportType === k ? 'active support-btn' : 'support-btn'} onClick={() => setSelectedSupportType(k)}>
                      <span className="support-symbol" style={{ color: s.color }}>{s.symbol}</span> {s.name}
                    </button>
                  ))}
                </div>
              )}

              {mode === MODES.ADD_LOAD && (
                <div className="context-panel">
                  <div className="section-title">Valor de Carga ({units.force})</div>
                  <div className="input-row"><label>Fx:</label><input type="number" value={loadFx} onChange={e => setLoadFx(e.target.value)} /></div>
                  <div className="input-row"><label>Fy:</label><input type="number" value={loadFy} onChange={e => setLoadFy(e.target.value)} /></div>
                  <p className="hint">Negativo = abajo/izquierda. Click en nudo para aplicar.</p>
                </div>
              )}

              {selectedNode && (
                <div className="node-editor">
                  <div className="section-title">📍 Nudo #{selectedNode.id} ({getSupportName(selectedNode)})</div>
                  <div className="input-row"><label>X:</label><input type="number" step="0.5" value={selectedNode.x} onChange={e => updateSelectedNode('x', e.target.value)} /></div>
                  <div className="input-row"><label>Y:</label><input type="number" step="0.5" value={selectedNode.y} onChange={e => updateSelectedNode('y', e.target.value)} /></div>
                  <button className="delete-btn" onClick={deleteSelected}>🗑️ Eliminar</button>
                </div>
              )}

              <div className="section-title">{nodes.length} nudos · {elements.length} barras · {loads.length} cargas</div>
            </>
          )}

          <div className="actions">
            <button className="solve-btn" onClick={handleSolve}>⚡ Calcular</button>
            <button className="clear-btn" onClick={clearAll}>🗑️ Limpiar</button>
          </div>

          {results && (
            <div className="results-panel">
              <h4>✅ Calculado</h4>
              <div className="legend"><span className="compression">■ Compresión</span><span className="tension">■ Tracción</span></div>
            </div>
          )}

          <div className="help-text">
            <strong>Controles:</strong> Arrastrar nudos · Click derecho para mover vista · Rueda para zoom
          </div>
        </div>

        <div className="canvas-wrapper" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} onContextMenu={handleContextMenu} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <svg ref={canvasRef} width="100%" height="100%" style={{ cursor: isPanning ? 'grabbing' : isDragging ? 'grabbing' : mode === MODES.SELECT ? 'grab' : 'crosshair' }}>
            <defs>
              <marker id="arrow-load" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 z" fill="orange" /></marker>
            </defs>

            {/* Barras */}
            {elements.map(el => {
              const n1 = nodes.find(n => n.id === el.n1), n2 = nodes.find(n => n.id === el.n2);
              if (!n1 || !n2) return null;
              const p1 = toScreen(n1.x, n1.y), p2 = toScreen(n2.x, n2.y);
              let color = "#555", forceVal = null, forceType = '';
              if (results?.elementResults) {
                const r = results.elementResults.find(r => r.id === el.id);
                if (r) { forceVal = r.force; color = r.force < -0.01 ? "#ff4444" : r.force > 0.01 ? "#44aaff" : "#777"; forceType = r.force < -0.01 ? 'C' : r.force > 0.01 ? 'T' : '0'; }
              }
              return (
                <g key={el.id}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={6} strokeLinecap="round" />
                  {forceVal !== null && (
                    <g><rect x={(p1.x + p2.x) / 2 - 32} y={(p1.y + p2.y) / 2 - 20} width="64" height="18" rx="4" fill="rgba(0,0,0,0.8)" />
                      <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2} fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle" dy="-6">{Math.abs(forceVal).toFixed(1)} ({forceType})</text></g>
                  )}
                  {!results && <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2} fill="#444" fontSize="10" textAnchor="middle" dy="14">{getBarLength(n1, n2).toFixed(1)}</text>}
                </g>
              );
            })}

            {/* Nudos */}
            {nodes.map(n => {
              const p = toScreen(n.x, n.y);
              let fill = SUPPORT_TYPES.FREE.color;
              if (n.rx && n.ry) fill = SUPPORT_TYPES.PINNED.color;
              else if (n.ry) fill = SUPPORT_TYPES.ROLLER_Y.color;
              if (tempNode === n.id) fill = "cyan";
              const sel = selectedNodeId === n.id;
              if (sel) fill = "#ff00ff";

              return (
                <g key={n.id}>
                  {n.rx === 1 && n.ry === 1 && <polygon points={`${p.x},${p.y + 10} ${p.x - 14},${p.y + 30} ${p.x + 14},${p.y + 30}`} fill="none" stroke="#00ff88" strokeWidth="3" />}
                  {n.rx === 0 && n.ry === 1 && <><circle cx={p.x} cy={p.y + 18} r="7" fill="none" stroke="#ffff00" strokeWidth="3" /><line x1={p.x - 16} y1={p.y + 28} x2={p.x + 16} y2={p.y + 28} stroke="#ffff00" strokeWidth="3" /></>}
                  <circle cx={p.x} cy={p.y} r={sel ? 12 : 10} fill={fill} stroke={sel ? "#fff" : "#222"} strokeWidth={sel ? 4 : 3} />
                  <text x={p.x} y={p.y} dx="16" dy="-10" fill="#fff" fontSize="14" fontWeight="bold">{n.id}</text>
                  <text x={p.x} y={p.y} dx="16" dy="6" fill="#555" fontSize="10">({n.x}, {n.y})</text>
                  {results?.reactions[n.id] && <>
                    {Math.abs(results.reactions[n.id].x) > 0.01 && <text x={p.x - 55} y={p.y} fill="#00ff88" fontSize="11" fontWeight="bold">Rx={results.reactions[n.id].x.toFixed(1)}</text>}
                    {Math.abs(results.reactions[n.id].y) > 0.01 && <text x={p.x} y={p.y + 45} textAnchor="middle" fill="#00ff88" fontSize="11" fontWeight="bold">Ry={results.reactions[n.id].y.toFixed(1)}</text>}
                  </>}
                </g>
              );
            })}

            {/* Cargas */}
            {loads.map((l, i) => {
              const n = nodes.find(nd => nd.id === l.nodeId);
              if (!n) return null;
              const p = toScreen(n.x, n.y);
              const mag = Math.hypot(l.fx, l.fy);
              if (mag === 0) return null;
              const dx = l.fx / mag, dy = -l.fy / mag;
              return (
                <g key={i}>
                  <line x1={p.x + dx * 60} y1={p.y + dy * 60} x2={p.x + dx * 12} y2={p.y + dy * 12} stroke="orange" strokeWidth="4" markerEnd="url(#arrow-load)" />
                  <text x={p.x + dx * 65} y={p.y + dy * 65} fill="orange" fontSize="12" fontWeight="bold" textAnchor={dx > 0 ? "start" : "end"}>({l.fx}, {l.fy})</text>
                </g>
              );
            })}
          </svg>

          <div className="zoom-controls">
            <button onClick={() => setScale(s => Math.min(s + 10, 100))}>+</button>
            <span>Zoom</span>
            <button onClick={() => setScale(s => Math.max(s - 10, 20))}>−</button>
          </div>

          <div className="mode-indicator">
            {mode === MODES.SELECT ? '🖱️ Mover' : mode === MODES.ADD_NODE ? '⊕ Agregar Nudo' : mode === MODES.ADD_BEAM ? '— Conectar' : mode === MODES.SET_SUPPORT ? '▽ Apoyo' : '↓ Carga'}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
