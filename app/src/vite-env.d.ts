/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'rbush' {
  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export default class RBush<T = BBox> {
    constructor(maxEntries?: number);
    insert(item: T): RBush<T>;
    load(items: T[]): RBush<T>;
    remove(item: T, equals?: (a: T, b: T) => boolean): RBush<T>;
    clear(): RBush<T>;
    search(bbox: BBox): T[];
    all(): T[];
    collides(bbox: BBox): boolean;
  }
}

