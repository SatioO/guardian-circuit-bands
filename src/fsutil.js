import { writeFile, rename } from 'node:fs/promises';

export async function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}
