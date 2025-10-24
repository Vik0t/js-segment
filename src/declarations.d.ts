declare module 'onnxruntime-web' {
  export * from 'onnxruntime-common'
  // minimal types used in this demo
  export namespace Tensor { }
  export class Tensor<T = any> {
    data: any
    dims: number[]
    type: string
    constructor(type: string, data: T, dims: number[])
  }
  export interface InferenceSession {
    inputNames: any
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
  }
  export const InferenceSession: {
    create: (urlOrBuffer: string | ArrayBuffer, options?: any) => Promise<InferenceSession>
  }
}
