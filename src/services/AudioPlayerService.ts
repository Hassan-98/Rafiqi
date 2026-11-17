/**
 * Generic single-track audio playback (for Asma audio, Hadith audio, etc.).
 * Only one track plays at a time — calling `play(url)` stops any current one.
 */
class AudioPlayerService {
  private el: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private listeners = new Set<(playing: boolean, url: string | null) => void>();

  private ensure(): HTMLAudioElement {
    if (!this.el) {
      this.el = document.createElement('audio');
      this.el.preload = 'auto';
      this.el.addEventListener('ended', () => this.emit(false));
      this.el.addEventListener('pause', () => this.emit(this.el?.paused === false));
      this.el.addEventListener('playing', () => this.emit(true));
      this.el.addEventListener('error', () => this.emit(false));
    }
    return this.el;
  }

  private emit(playing: boolean) {
    const url = playing ? this.currentUrl : null;
    this.listeners.forEach((l) => l(playing, url));
  }

  subscribe(cb: (playing: boolean, url: string | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async play(url: string): Promise<void> {
    const el = this.ensure();
    if (this.currentUrl === url && !el.paused) {
      // Toggle pause if same track
      el.pause();
      return;
    }
    this.currentUrl = url;
    el.src = url;
    try {
      await el.play();
    } catch {
      this.emit(false);
    }
  }

  stop(): void {
    if (this.el) {
      this.el.pause();
      try {
        this.el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    this.currentUrl = null;
    this.emit(false);
  }
}

export const audioPlayerService = new AudioPlayerService();
