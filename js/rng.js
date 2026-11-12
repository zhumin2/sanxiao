'use strict';
/* ================= 种子随机数 =================
 * 平时 rand() 透传 Math.random；每日挑战用日期种子初始化，
 * 使开局棋盘、AI 决策与事件随机全部确定，所有玩家面对同一个"今日局面"。 */

const RNG = {
  s: 0,
  active: false,
  setSeed(n){
    this.s = (n >>> 0) || 1;
    this.active = true;
  },
  clear(){ this.active = false; },
  rand(){
    let t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
};

/* 游戏逻辑统一入口：未激活种子时透传 Math.random */
function rand(){
  return RNG.active ? RNG.rand() : Math.random();
}
