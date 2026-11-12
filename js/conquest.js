'use strict';
/* ================= 征服模式：连胜关卡 + 局内商店 =================
 * 选 1 名英雄连续挑战 5 关，生命/护甲/攻击/法力全程延续。
 * 黄金宝石每消 1 颗 +1 金币，通关另有关币奖励；关卡间开商店购买强化。 */

const CONQUEST_STAGES = [
  { name:'第 1 关 · 峡谷伏击', foe:'lanling',  foeName:'兰陵王' },
  { name:'第 2 关 · 不朽壁垒', foe:'baiqi',    foeName:'白起' },
  { name:'第 3 关 · 虚灵试炼', foe:'zhongkui', foeName:'钟馗' },
  { name:'第 4 关 · 镜像对决', random:true },
  { name:'最终关 · 主宰巢穴',  foe:'zhuzai',   foeName:'暗影主宰' },
];
const CONQUEST_WIN_BONUS = [18, 18, 20, 24, 0];  // 各关通关金币奖励
const CONQUEST_START_GOLD = 15;
const CONQUEST_STAGE_HEAL = 10;                   // 通关后的固定回血

const SHOP_POOL = [
  { id:'heal25',   icon:'🧪', name:'治疗药剂', desc:'回复 25 点生命',           price:12, apply:h=>{ h.hp=Math.min(h.maxHp, h.hp+25); } },
  { id:'heal50',   icon:'⛲', name:'生命之泉', desc:'回复 50 点生命',           price:22, apply:h=>{ h.hp=Math.min(h.maxHp, h.hp+50); } },
  { id:'armor8',   icon:'🛡️', name:'铁壁符',   desc:'获得 8 点护甲',            price:14, apply:h=>{ h.armor+=8;  h._armorMax=Math.max(h._armorMax||10, h.armor); } },
  { id:'armor16',  icon:'🏰', name:'磐石壁垒', desc:'获得 16 点护甲',           price:26, apply:h=>{ h.armor+=16; h._armorMax=Math.max(h._armorMax||10, h.armor); } },
  { id:'atk1',     icon:'⚔️', name:'磨刀石',   desc:'攻击力永久 +1',            price:18, apply:h=>{ h.atk+=1; } },
  { id:'atk2',     icon:'🏅', name:'战神纹章', desc:'攻击力永久 +2',            price:34, apply:h=>{ h.atk+=2; } },
  { id:'mana6',    icon:'💧', name:'法力涌泉', desc:'每种法力 +6',              price:10, apply:h=>{ for(const c of COLOR_IDS) h.mana[c]=Math.min(h.manaCap, h.mana[c]+6); } },
  { id:'fullmana', icon:'🔮', name:'智慧甘露', desc:'全部法力充满',             price:20, apply:h=>{ for(const c of COLOR_IDS) h.mana[c]=h.manaCap; } },
  { id:'vitality', icon:'🍄', name:'巨人体质', desc:'生命上限 +15 并回复 15',   price:24, apply:h=>{ h.maxHp+=15; h.hp+=15; } },
];

const Conquest = {
  heroDef:null, hero:null,
  stageIdx:0, gold:0, wins:0, aiLevel:'normal',

  startRun(heroDef, aiLevel){
    this.heroDef=heroDef;
    this.hero=null;          // 首战由 Battle.start 创建并 attach
    this.stageIdx=0;
    this.gold=CONQUEST_START_GOLD;
    this.wins=0;
    this.aiLevel=aiLevel||'normal';
    this.enterStage();
  },

  restartRun(){
    if(this.heroDef) this.startRun(this.heroDef, this.aiLevel);
  },

  enterStage(){
    const stage=CONQUEST_STAGES[this.stageIdx];
    const enemyTeam=stage.random
      ? {name:stage.name, random:true}
      : {name:stage.name, heroes:[stage.foe]};
    UI.showScreen('battle');
    Battle.start([this.heroDef], enemyTeam, this.aiLevel, {conquest:true});
  },

  /* Battle.start 回调：首战接管英雄实例，此后每关延续同一实例 */
  attachHero(inst){
    if(this.hero){ return this.hero; }
    this.hero=inst;
    return inst;
  },

  addGold(n){
    this.gold+=n;
    UI.syncGold();
  },

  onStageWon(){
    const st=Battle.state;
    this.hero=st.teams.player[0];
    const bonus=CONQUEST_WIN_BONUS[this.stageIdx]||18;
    this.addGold(bonus);
    const healed=Math.min(CONQUEST_STAGE_HEAL, this.hero.maxHp-this.hero.hp);
    this.hero.hp+=healed;
    this.hero.status={burn:0,poison:0,frozen:0,shred:0};   // 关卡间清除异常状态
    UI.log(`通关奖励：+${bonus} 金币，生命 +${healed}`,'lg-heal');
    this.wins++;
    this.stageIdx++;
    if(this.stageIdx>=CONQUEST_STAGES.length){
      UI.showResult(true, `🏆 征服成功！通关全部 ${CONQUEST_STAGES.length} 关 · 剩余 ❤${this.hero.hp}/${this.hero.maxHp} · 剩余 💰${this.gold}`);
      return;
    }
    this.openShop();
  },

  onRunLost(){
    UI.showResult(false, `💀 征服止步于第 ${this.stageIdx+1} 关 · 共 ${this.wins} 胜`);
  },

  openShop(){
    const hero=this.hero;
    const stage=CONQUEST_STAGES[this.stageIdx];
    const nextLabel=stage.name+(stage.foeName?`（${stage.foeName}）`:'');
    /* 随机 4 件商品（洗牌取样） */
    const pool=SHOP_POOL.slice();
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    const offers=pool.slice(0,4);

    const scr=document.getElementById('screen-shop');
    scr.innerHTML=`
      <div class="shop-box">
        <h2 class="shop-title">🛒 征服商店</h2>
        <div class="shop-meta">
          <span>第 ${this.stageIdx}/${CONQUEST_STAGES.length} 关已通关</span>
          <span class="shop-gold">💰 ${this.gold}</span>
        </div>
        <div class="shop-hero">当前状态：❤ ${hero.hp}/${hero.maxHp} · 🛡 ${hero.armor} · ⚔ ${hero.atk}</div>
        <div class="shop-items"></div>
        <button id="btn-next-stage" class="btn big">继续挑战 · ${nextLabel}</button>
      </div>`;
    const items=scr.querySelector('.shop-items');
    offers.forEach(item=>{
      const card=document.createElement('div');
      card.className='shop-card';
      card.innerHTML=`
        <div class="sc-icon">${item.icon}</div>
        <div class="sc-name">${item.name}</div>
        <div class="sc-desc">${item.desc}</div>
        <div class="sc-price">💰 ${item.price}</div>`;
      const btn=document.createElement('button');
      btn.className='btn small sc-buy';
      btn.textContent='购 买';
      if(this.gold<item.price) btn.disabled=true;
      btn.addEventListener('click',()=>{
        if(card.classList.contains('sold')||this.gold<item.price) return;
        this.gold-=item.price;
        item.apply(hero);
        card.classList.add('sold');
        btn.disabled=true; btn.textContent='已购';
        Sound.play('ui');
        scr.querySelector('.shop-gold').textContent='💰 '+this.gold;
        scr.querySelector('.shop-hero').textContent=`当前状态：❤ ${hero.hp}/${hero.maxHp} · 🛡 ${hero.armor} · ⚔ ${hero.atk}`;
        UI.float(hero, item.name, 'heal');
      });
      card.appendChild(btn);
      items.appendChild(card);
    });
    scr.querySelector('#btn-next-stage').addEventListener('click',()=>{ Sound.play('ui'); this.enterStage(); });
    UI.showScreen('shop');
  },
};
