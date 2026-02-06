// 音效系统 - 使用 Web Audio API 生成音效

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // 确保音频上下文已恢复（浏览器自动播放策略）
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    // 播放蜂鸣音（灯亮时）
    playBeep() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 800; // 800Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }

    // 播放灯灭音效（F1起步信号）
    playLightsOut() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 1200; // 1200Hz，更高的音调
        oscillator.type = 'square';

        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.15);
    }

    // 播放抢跑警告音
    playFalseStart() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 200; // 低音
        oscillator.type = 'sawtooth';

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    // 播放新纪录庆祝音效
    playNewRecord() {
        if (!this.enabled || !this.audioContext) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

        notes.forEach((freq, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            const startTime = this.audioContext.currentTime + (index * 0.15);
            gainNode.gain.setValueAtTime(0.2, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.2);
        });
    }

    // 播放成就解锁音效
    playAchievement() {
        if (!this.enabled || !this.audioContext) return;

        const notes = [783.99, 1046.50, 1318.51]; // G5, C6, E6

        notes.forEach((freq, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'triangle';

            const startTime = this.audioContext.currentTime + (index * 0.12);
            gainNode.gain.setValueAtTime(0.15, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.25);
        });
    }
}

// 创建全局音效管理器实例
const soundManager = new SoundManager();
