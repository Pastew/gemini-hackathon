/**
 * AudioWorklet processor for recording audio.
 * Converts Float32 input to Int16 PCM and posts buffers to the main thread.
 */
class AudioProcessingWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Int16Array(2048);
        this.bufferWriteIndex = 0;
    }

    process(inputs) {
        if (inputs[0].length) {
            this.processChunk(inputs[0][0]);
        }
        return true;
    }

    sendAndClearBuffer() {
        this.port.postMessage({
            event: "chunk",
            data: {
                int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
            },
        });
        this.bufferWriteIndex = 0;
    }

    processChunk(float32Array) {
        for (let i = 0; i < float32Array.length; i++) {
            const int16Value = float32Array[i] * 32768;
            this.buffer[this.bufferWriteIndex++] = int16Value;
            if (this.bufferWriteIndex >= this.buffer.length) {
                this.sendAndClearBuffer();
            }
        }
    }
}

registerProcessor("audio-recorder-worklet", AudioProcessingWorklet);
