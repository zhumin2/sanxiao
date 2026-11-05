'use strict';
/* ================= 音效系统（WebAudio 合成，无外部素材） =================
 * 首次发声时才创建 AudioContext（符合浏览器自动播放策略）。
 * Sound.enabled 持久化到 localStorage，战斗界面可切换。 */

const Sound = {
  ctx: null,
  enabled: (function(){ try { return localStorage.getItem('cgb_sound') !== 'off'; } catch(e){ return true; } })(),

  ensure(){
    if (!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  setEnabled(on){
    this.enabled = !!on;
    try { localStorage.setItem('cgb_sound', on ? 'on' : 'off'); } catch(e){}
  },

  /* 单音：freq 起始频率，slide 为滑音差值 */
  tone(freq, dur, type, vol, delay, slide){
    if (!this.enabled) return;
    const c = this.ensure(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },

  /* 噪声爆发（骷髅打击感） */
  noise(dur, vol, cutoff, delay){
    if (!this.enabled) return;
    const c = this.ensure(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 900;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(c.currentTime + (delay || 0));
  },

  play(name, o){
    if (!this.enabled) return;
    o = o || {};
    switch(name){
      case 'match': {                       // 消除：连锁越高音调越高
        const step = Math.min(o.cascade || 1, 6);
        this.tone(300 + step*70, 0.10, 'triangle', 0.10);
        this.tone(600 + step*70, 0.08, 'sine', 0.05, 0.02);
        break;
      }
      case 'skull':                         // 骷髅命中：噪声 + 低频坠落
        this.noise(0.16, 0.22, 800);
        this.tone(120, 0.22, 'square', 0.10, 0, -60);
        break;
      case 'cast':                          // 施法：上滑正弦
        this.tone(480, 0.20, 'sine', 0.12, 0, 420);
        this.tone(960, 0.12, 'sine', 0.06, 0.10);
        break;
      case 'extra':                         // 额外回合：双音上行
        this.tone(660, 0.09, 'sine', 0.10);
        this.tone(990, 0.12, 'sine', 0.10, 0.09);
        break;
      case 'doom':                          // 末日骷髅：低鸣
        this.tone(220, 0.30, 'sawtooth', 0.08, 0, -80);
        this.tone(110, 0.36, 'square', 0.06, 0.04);
        break;
      case 'rage':                          // 狂暴：下坠锯齿
        this.tone(200, 0.40, 'sawtooth', 0.12, 0, -120);
        this.noise(0.25, 0.12, 500, 0.05);
        break;
      case 'ui':
        this.tone(760, 0.05, 'sine', 0.05);
        break;
      case 'victory': {                     // 胜利琶音
        [523, 659, 784, 1047].forEach((f,i)=>this.tone(f, 0.16, 'triangle', 0.12, i*0.13));
        break;
      }
      case 'defeat': {                      // 失败下行
        [330, 262, 208, 165].forEach((f,i)=>this.tone(f, 0.22, 'triangle', 0.10, i*0.17));
        break;
      }
    }
  },
};
