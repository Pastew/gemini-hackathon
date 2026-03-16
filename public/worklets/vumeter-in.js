/**
 * AudioWorklet VU-meter processor (input side — used by AudioRecorder).
 * Measures RMS volume of the microphone input and posts it to the main thread.
 */
class VolMeter extends AudioWorkletProcessor {
    constructor() {
        super();
        this.volume = 0;
        this.updateIntervalInMS = 25;
        this.nextUpdateFrame = this.updateIntervalInMS;
        this.port.onmessage = (event) => {
            if (event.data.updateIntervalInMS) {
                this.updateIntervalInMS = event.data.updateIntervalInMS;
            }
        };
    }

    get intervalInFrames() {
        return (this.updateIntervalInMS / 1000) * sampleRate;
    }

    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            const samples = input[0];
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
                sum += samples[i] * samples[i];
            }
            const rms = Math.sqrt(sum / samples.length);
            this.volume = Math.max(rms, this.volume * 0.7);
            this.nextUpdateFrame -= samples.length;
            if (this.nextUpdateFrame < 0) {
                this.nextUpdateFrame += this.intervalInFrames;
                this.port.postMessage({ volume: this.volume });
            }
        }
        return true;
    }
}

registerProcessor("vu-meter", VolMeter);
