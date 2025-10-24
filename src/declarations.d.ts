// src/declarations.d.ts
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const content: any;
  export default content;
}

// TensorFlow.js declarations
declare namespace tf {
  export function loadGraphModel(modelUrl: string): Promise<any>;
  export function loadLayersModel(modelUrl: string): Promise<any>;
  export function tensor<T extends tf.Tensor>(data: T|number[]|number[][]|number[][][]|number[][][][], shape?: number[], dtype?: tf.DataType): T;
  export function dispose(tensor: tf.Tensor): void;
}

// Add other custom type declarations as needed