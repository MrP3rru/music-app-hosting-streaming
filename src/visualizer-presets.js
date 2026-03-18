// ─── Presety wizualizera AudioMotionAnalyzer ───────────────────────────────
// Żeby przywrócić preset: skopiuj obiekt `options` i `gradient` do App.jsx
// w miejscu inicjalizacji AudioMotionAnalyzer (useEffect z new AudioMotionAnalyzer)

export const VISUALIZER_PRESETS = {

  // Preset domyślny — wypełnione słupki FFT, gradient pomarańcz→krem
  filled_bars: {
    options: {
      mode: 10,
      channelLayout: 'single',
      frequencyScale: 'log',
      barSpace: 0.35,
      fftSize: 8192,
      smoothing: 0.75,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      overlay: true,
      bgAlpha: 0,
      connectSpeakers: false,
    },
    gradient: {
      colorStops: [
        { color: '#ff6b2b', pos: 0 },
        { color: '#ffac50', pos: 0.5 },
        { color: '#ffe8c0', pos: 1 },
      ],
    },
  },

}
