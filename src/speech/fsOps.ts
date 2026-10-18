import { File, Paths } from 'expo-file-system';
import type { FsOps } from './download';

export const modelsRoot = () => `${Paths.document.uri.replace(/\/$/, '')}/models`;

// native paths have no file:// scheme, that's what the sherpa-onnx native code opens
export const toNativePath = (uri: string) => uri.replace(/^file:\/\//, '');

export const expoFsOps: FsOps = {
  async sizeOf(path) {
    const f = new File(path);
    return f.exists ? f.size : null;
  },
  async download(url, dest) {
    await File.downloadFileAsync(url, new File(dest), { idempotent: true });
  },
  async remove(path) {
    const f = new File(path);
    if (f.exists) f.delete();
  },
  async ensureDirFor(path) {
    const parent = new File(path).parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
  },
};
