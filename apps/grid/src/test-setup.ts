// jsdom has no ResizeObserver; Sakani's SegmentedControl measures its thumb with one.
class NoResize {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= NoResize
