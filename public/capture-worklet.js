// Runs on the audio thread. It hands what the microphone hears to the page in small blocks (about 40 ms each).
// Asking it to "flush" sends the part-filled block too and then says it has, so nothing at the end is lost.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'flush') {
        this.send();
        this.port.postMessage({ flushed: true });
      }
    };
  }

  send() {
    if (this.filled === 0) return;
    const copy = this.block.slice(0, this.filled);
    this.filled = 0;
    this.port.postMessage(copy, [copy.buffer]);
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.block[this.filled++] = channel[i];
      if (this.filled === this.block.length) this.send();
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
