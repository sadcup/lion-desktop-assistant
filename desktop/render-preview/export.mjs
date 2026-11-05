import {readFile, writeFile} from 'node:fs/promises';

const source = await readFile(new URL('../lion.js', import.meta.url), 'utf8');
const three = new URL('../node_modules/three/build/three.module.js', import.meta.url).href;
const model = source.slice(source.indexOf('const lion ='), source.indexOf('const ray ='));
const run = new Function('T', `
  const scene = new T.Scene();
  const groomColors = new Map();
  ${model.replace('    for (let segment =', `    if (!groomColors.has(parent)) groomColors.set(parent, []);
    groomColors.get(parent).push(rootColor);
    for (let segment =`)}
  lion.updateMatrixWorld(true);
  const meshes = [], hair = [];
  lion.traverse(object => {
    if (!object.isMesh) return;
    const vertices = [], position = object.geometry.attributes.position;
    const point = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      vertices.push(point.x, -point.z, point.y);
    }
    meshes.push({vertices, indices: Array.from(object.geometry.index.array),
      color: object.material.color.toArray(), roughness: object.material.roughness});
  });
  for (const [parent, {positions}] of coats) {
    const points = [], point = new T.Vector3();
    for (let i = 0; i < positions.length; i += 18) {
      for (const offset of [0, 3, 9, 15]) {
        point.fromArray(positions, i + offset).applyMatrix4(parent.matrixWorld);
        points.push(point.x, -point.z, point.y);
      }
    }
    hair.push({points, colors:groomColors.get(parent)});
  }
  return {meshes, hair};
`);
await writeFile(process.argv[2], JSON.stringify(run(await import(three))));
