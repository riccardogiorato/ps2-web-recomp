const workletSource = `
class Output extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { buffer, base } = options.processorOptions;
    this.ring = new Uint32Array(buffer, base, 4);
    this.capacity = this.ring[2];
    this.samples = new Int16Array(buffer, base + 16, this.capacity * 2);
    this.left = 0;
    this.right = 0;
  }
  process(inputs, outputs) {
    const left = outputs[0][0], right = outputs[0][1];
    const write = Atomics.load(this.ring, 0), mask = this.capacity - 1;
    let read = Atomics.load(this.ring, 1);
    for (let i = 0; i < left.length; ++i) {
      if (read !== write) {
        const at = (read & mask) * 2;
        this.left = this.samples[at] / 32768;
        this.right = this.samples[at + 1] / 32768;
        read = (read + 1) >>> 0;
      } else {
        this.left *= 0.995;
        this.right *= 0.995;
      }
      left[i] = this.left;
      right[i] = this.right;
    }
    Atomics.store(this.ring, 1, read);
    Atomics.store(this.ring, 3, 1);
    return true;
  }
}
registerProcessor('ps2-output', Output);`;

export async function startAudio(Module) {
  const audio = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  const url = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
  try { await audio.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  const node = new AudioWorkletNode(audio, 'ps2-output', {
    outputChannelCount: [2],
    processorOptions: { buffer: Module.HEAPU8.buffer, base: Module._ps2web_audio_ring() },
  });
  node.connect(audio.destination);
  return { audio, node };
}
