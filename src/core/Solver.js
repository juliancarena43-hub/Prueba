import * as math from 'mathjs';

/**
 * Resuelve un reticulado plano 2D.
 * 
 * @param {Array} nodes - [{ id, x, y, rx, ry }] (rx, ry: 1 si está restringido, 0 si libre)
 * @param {Array} elements - [{ id, n1, n2, E, A }]
 * @param {Array} loads - [{ nodeId, fx, fy }]
 * 
 * @returns {Object} { displacements, reactions, elementResults }
 */
export function solveStructure(nodes, elements, loads) {
  const nNodes = nodes.length;
  const nDof = nNodes * 2; // Grados de libertad totales

  // Mapeo de ID de nodo a índices de matriz
  const nodeMap = new Map();
  nodes.forEach((node, index) => {
    nodeMap.set(node.id, index);
  });

  // Inicializar Matriz de Rigidez Global (K) y Vector de Fuerzas (F)
  let K = math.zeros(nDof, nDof);
  let F = math.zeros(nDof);

  // Ensamblaje de K
  elements.forEach(element => {
    const idx1 = nodeMap.get(element.n1);
    const idx2 = nodeMap.get(element.n2);
    
    if (idx1 === undefined || idx2 === undefined) return;

    const node1 = nodes[idx1];
    const node2 = nodes[idx2];

    const dx = node2.x - node1.x;
    const dy = node2.y - node1.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    
    if (L === 0) return;

    const c = dx / L;
    const s = dy / L;

    // Matriz de rigidez local transformada a global (4x4 para elemento barra)
    // k = (EA/L) * [ c^2   cs    -c^2  -cs ]
    //              [ cs    s^2   -cs   -s^2]
    //              [ -c^2  -cs   c^2   cs  ]
    //              [ -cs   -s^2  cs    s^2 ]
    
    const kFactor = (element.E * element.A) / L;
    
    const kLocal = [
      [ c*c,   c*s,  -c*c,  -c*s],
      [ c*s,   s*s,  -c*s,  -s*s],
      [-c*c,  -c*s,   c*c,   c*s],
      [-c*s,  -s*s,   c*s,   s*s]
    ];

    // Índices en la matriz global
    // Node 1: 2*idx1, 2*idx1+1
    // Node 2: 2*idx2, 2*idx2+1
    const dofIndices = [2*idx1, 2*idx1+1, 2*idx2, 2*idx2+1];

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const val = K.get([dofIndices[i], dofIndices[j]]) + kFactor * kLocal[i][j];
            K.set([dofIndices[i], dofIndices[j]], val);
        }
    }
  });

  // Ensamblaje de Vector de Fuerzas F
  loads.forEach(load => {
      const idx = nodeMap.get(load.nodeId);
      if (idx !== undefined) {
          F.set([2*idx], F.get([2*idx]) + load.fx);
          F.set([2*idx+1], F.get([2*idx+1]) + load.fy);
      }
  });

  // Aplicar condiciones de contorno
  // Identificar DOFs libres y restringidos
  const freeDofs = [];
  const restrainedDofs = [];

  nodes.forEach((node, index) => {
      // rx=1 significa restringido
      if (node.rx) restrainedDofs.push(2*index);
      else freeDofs.push(2*index);

      if (node.ry) restrainedDofs.push(2*index+1);
      else freeDofs.push(2*index+1);
  });

  // Si no hay DOFs libres, no se puede resolver (o es trivial)
  if (freeDofs.length === 0) {
      return { msg: "Estructura totalmente restringida" };
  }

  // Particionar K y F
  // Kff = submatriz de rigidez correspondiente a DOFs libres
  // Ff = subvector de fuerzas correspondientes a DOFs libres
  
  // Usaremos mathjs para submatrices
  const Kff = K.subset(math.index(freeDofs, freeDofs));
  const Ff = F.subset(math.index(freeDofs));

  // Resolver U = K^-1 * F
  let Uf;
  try {
      // Usar lusolve para mejor rendimiento y estabilidad que inv()
      Uf = math.lusolve(Kff, Ff);
  } catch (e) {
      console.error(e);
      return { error: "Estructura inestable o mecanismo (Matriz singular)" };
  }

  // Construir vector de desplazamientos global U
  const U = math.zeros(nDof);
  // Asegurarnos de que Uf sea aplanado correctamente si es matriz columna
  const UfFlat = math.flatten(Uf); 
  
  UfFlat.forEach((val, i) => {
      U.set([freeDofs[i]], val);
  });

  // Calcular Reacciones: R = K * U - F (F incluye cargas externas. Reacciones equilibran)
  // Reacciones R = K_restrained_all * U - F_restrained
  // Pero más simple: R_total = K * U.
  // R_vinculo = R_total - F_external
  
  const R_total = math.multiply(K, U);
  const Reactions = math.subtract(R_total, F);

  // Formatear resultados
  const displacementResults = {};
  const reactionResults = {};

  nodes.forEach((node, index) => {
      displacementResults[node.id] = {
          x: U.get([2*index]),
          y: U.get([2*index+1])
      };
      
      const rx = Reactions.get([2*index]);
      const ry = Reactions.get([2*index+1]);
      
      // Solo reportar reacciones si el nodo estaba restringido
      reactionResults[node.id] = {
          x: node.rx ? rx : 0,
          y: node.ry ? ry : 0
      };
  });

  const elementResults = elements.map(element => {
      const idx1 = nodeMap.get(element.n1);
      const idx2 = nodeMap.get(element.n2);
      
      const node1 = nodes[idx1];
      const node2 = nodes[idx2];
      
      const dx = node2.x - node1.x;
      const dy = node2.y - node1.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      const c = dx / L;
      const s = dy / L;

      const u1x = U.get([2*idx1]);
      const u1y = U.get([2*idx1+1]);
      const u2x = U.get([2*idx2]);
      const u2y = U.get([2*idx2+1]);

      // Alargamiento deltaL = (u2x - u1x)*c + (u2y - u1y)*s
      const deltaL = (u2x - u1x) * c + (u2y - u1y) * s;
      
      // Esfuerzo Axial N = (EA/L) * deltaL
      // Convencion: Positivo = Tracción (Alargamiento)
      // Negativo = Compresión
      const force = (element.E * element.A / L) * deltaL;

      return {
          id: element.id,
          force: force,
          stress: force / element.A // Tensión sigma
      };
  });

  return {
      displacements: displacementResults,
      reactions: reactionResults,
      elementResults: elementResults
  };
}
