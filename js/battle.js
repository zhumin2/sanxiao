'use strict';
/* ================= 战斗系统 ================= */

const Battle = {
  state:null, lastSetup:null, speed:1,

  /* ---------- 开局 ---------- */
  start(playerDefs, enemyTeam){
    const mk=(def,side,idx)=>({
      def, side, idx,
      hp:def.hp, maxHp:def.hp,
      armor:def.armor,
      atk:def.atk,
      mana:{red:0,blue:0,green:0,yellow:0,purple:0},
      manaCap:def.manaCap||MANA_CAP,
      alive:true,
      _armorMax:def.armor||10,
    });
    const players=playerDefs.map((d,i)=>mk(d,'player',i));
    const enemies=enemyTeam.random
      ? [HERO_ROSTER[Math.floor(Math.random()*HERO_ROSTER.length)]].map((d,i)=>mk(d,'enemy',i))
      : enemyTeam.heroes.map((id,i)=>mk(getHeroDef(id),'enemy',i));

    this.state={
      board:newBoard(), enemyTeam,
      teams:{player:players, enemy:enemies},
      turn:'player', turnNo:1, busy:false, over:false, winner:null,
    };
    this.lastSetup={playerDefs, enemyTeam};

    UI.buildBattleScreen(this.state);
    UI.log(`战斗开始：${UI.hname(this.state.teams.player[0])} vs ${enemyTeam.name}！`,'lg-sys');
    UI.log(`骷髅伤害由你方英雄的攻击力决定，只有亲和色的宝石会充能。`,'lg-sys');
    this.prepareTurn();
  },

  restart(){ if(this.lastSetup) this.start(this.lastSetup.playerDefs, this.lastSetup.enemyTeam); },

  teamArr(side){ return this.state.teams[side]; },
  other(side){ return side==='player'?'enemy':'player'; },
  alive(arr){ return arr.filter(h=>h.alive); },
  front(arr){ return arr.find(h=>h.alive)||null; },

  /* ---------- 回合流转 ---------- */
  async prepareTurn(){
    const st=this.state; if(!st||st.over) return;
    if(!hasAnyMove(st.board)){
      UI.banner('无可用移动 · 重新洗牌！');
      UI.log('棋盘无可用移动，重新洗牌！','lg-sys');
      shuffleBoard(st.board); UI.rebuildBoard();
      await sleep(450);
    }
    st.busy=false; UI.lockInput(false); UI.syncAll();
    if(st.turn==='enemy'){ UI.lockInput(true); sleep(900).then(()=>AI.takeTurn()); }
  },

  async endOfAction(side, totals){
    const st=this.state;
    if(this.checkEnd()) return;
    const again=totals&&totals.extraTurn;
    if(again){ UI.banner('额外回合！'); await sleep(750); }
    else { st.turn=this.other(side); st.turnNo++; }
    UI.syncAll();
    this.prepareTurn();
  },

  checkEnd(){
    const st=this.state;
    const pAlive=this.alive(st.teams.player).length;
    const eAlive=this.alive(st.teams.enemy).length;
    if(pAlive===0||eAlive===0){
      st.over=true; st.winner=eAlive===0?'player':'enemy';
      st.busy=true; UI.lockInput(true); UI.syncAll();
      UI.log(st.winner==='player'?'敌方全灭——胜利！':'我方全灭——战败…','lg-sys');
      setTimeout(()=>UI.showResult(st.winner==='player'), 1100);
      return true;
    }
    return false;
  },

  /* ---------- 玩家 / AI 走子 ---------- */
  async playerSwap(g1,g2){
    if(this.state.busy||this.state.over||this.state.turn!=='player') return;
    await this.doSwap('player',g1,g2);
  },

  async doSwap(side,g1,g2){
    const st=this.state;
    st.busy=true; UI.lockInput(true); UI.clearSelection();
    swapGems(st.board,g1,g2); UI.syncBoard();
    await sleep(200);
    if(!findGroups(st.board).length){
      swapGems(st.board,g1,g2); UI.syncBoard();
      const bw=document.getElementById('board');
      if(bw){ bw.classList.remove('shake'); void bw.offsetWidth; bw.classList.add('shake'); }
      UI.log('无效移动','lg-sys');
      await sleep(320);
      this.prepareTurn();
      return;
    }
    const totals=await this.resolveBoard(side);
    await this.endOfAction(side, totals);
  },

  /* ---------- 施法 ---------- */
  canCast(hero,skill){
    if(!hero.alive) return false;
    return Object.entries(skill.cost).every(([c,n])=>hero.mana[c]>=n);
  },

  async doCast(side, hero, skillIdx, opts={}){
    const st=this.state;
    if(!st||st.over||st.turn!==side) return;
    if(st.busy&&!opts.ai) return;   // AI 在自身回合内 busy=true 调用，须放行
    const skill=hero.def.skills[skillIdx];
    if(!this.canCast(hero,skill)) return;

    st.busy=true; UI.lockInput(true); UI.clearSelection();
    for(const [c,n] of Object.entries(skill.cost)) hero.mana[c]-=n;
    UI.syncHero(hero);
    UI.log(`${UI.hname(hero)} 施放【${skill.name}】`,'lg-cast');
    UI.banner(skill.name);
    await sleep(800);

    const ctx={caster:hero, self:this.teamArr(side), enemy:this.teamArr(this.other(side)), extraTurn:false};
    castSkillFX(ctx, skill);
    await sleep(550);

    let totals={mana:{red:0,blue:0,green:0,yellow:0,purple:0}, skullDmg:0, extraTurn:ctx.extraTurn, doom:0, cascades:0};
    if(BOARD_CHANGING_FX.has(skill.fx)){
      const rt=await this.resolveBoard(side);
      rt.extraTurn=rt.extraTurn||ctx.extraTurn;
      totals=rt;
    } else {
      UI.syncAll();
    }
    await this.endOfAction(side, totals);
  },

  /* ---------- 棋盘消解（含动画节奏） ---------- */
  async resolveBoard(side){
    const st=this.state;
    const frontHero=this.front(this.teamArr(side));
    const perSkull=frontHero?frontHero.atk:3;
    const totals={mana:{red:0,blue:0,green:0,yellow:0,purple:0}, skullDmg:0, extraTurn:false, doom:0, cascades:0};

    await this.collapseAndSync();   // 技能摧毁宝石后可能留有空洞

    while(true){
      const groups=findGroups(st.board);
      if(!groups.length) break;
      totals.cascades++;
      UI.popGroups(groups);
      await sleep(210);
      for(const grp of groups){
        const n=grp.cells.length;
        if(grp.type==='skull'){
          const mult=n>=5?3 : n>=4?2 : 1;
          let cnt=0;
          for(const [r,c] of grp.cells){ const g=st.board[r][c]; if(g) cnt+=g.doom?2:1; }
          totals.skullDmg+=cnt*perSkull*mult;
        } else {
          totals.mana[grp.type]+=n;
          if(n>=4) totals.extraTurn=true;
          if(n>=5) totals.doom++;
        }
        for(const [r,c] of grp.cells){
          const g=st.board[r][c];
          if(g){ UI.removeGemEl(g); st.board[r][c]=null; }
        }
      }
      await this.collapseAndSync();
    }

    /* 5 消生成末日骷髅 */
    if(totals.doom>0){
      const cands=[];
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
        const g=st.board[r][c]; if(g&&!g.doom) cands.push(g);
      }
      for(let i=0;i<totals.doom&&cands.length;i++){
        const idx=Math.floor(Math.random()*cands.length);
        const g=cands.splice(idx,1)[0];
        g.type='skull'; g.doom=true; UI.updateGemEl(g);
      }
      UI.log('☠ 末日骷髅降临棋盘（双倍骷髅伤害）！','lg-sys');
    }

    /* 骷髅伤害 */
    if(totals.skullDmg>0){
      const t=this.front(this.teamArr(this.other(side)));
      if(t){
        UI.banner('💀 骷髅攻击！');
        await sleep(500);
        this.dealDamage(t, totals.skullDmg, {});
        await sleep(320);
      }
    }
    /* 法力充能 */
    for(const c of COLOR_IDS){
      if(totals.mana[c]>0) this.gainColorMana(side, c, totals.mana[c]);
    }
    UI.syncAll();
    return totals;
  },

  async collapseAndSync(){
    const st=this.state; const spawned=[];
    for(let c=0;c<COLS;c++){
      let write=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        const g=st.board[r][c];
        if(g){ if(write!==r){ st.board[write][c]=g; st.board[r][c]=null; } write--; }
      }
      let stack=0;
      for(let r=write;r>=0;r--){
        stack++;
        const g=makeGem(randGemType(),r,c);
        g.spawnRow=-stack;
        st.board[r][c]=g; spawned.push(g);
      }
    }
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c]; if(g){ g.r=r; g.c=c; }
    }
    UI.syncBoard(spawned);
    if(spawned.length) await sleep(250);
  },

  /* ---------- 数值操作 ---------- */
  gainColorMana(side,color,amount){
    let left=amount;
    for(const h of this.teamArr(side)){
      if(!h.alive||left<=0) continue;
      if(!h.def.colors.includes(color)) continue;
      const space=h.manaCap-h.mana[color];
      if(space<=0) continue;
      const take=Math.min(space,left);
      h.mana[color]+=take; left-=take;
      UI.float(h,`+${take}`,'mana'); UI.syncHero(h);
    }
    UI.log(`${GEMS[color].name} +${amount-left} 法力`,'lg-mana');
  },

  gainManaAny(hero, amount){
    let left=amount, guard=0;
    while(left>0&&guard<20){
      guard++; let progress=false;
      for(const c of hero.def.colors){
        const space=hero.manaCap-hero.mana[c];
        if(space>0){
          const take=Math.min(space,left);
          hero.mana[c]+=take; left-=take; progress=true;
          if(left<=0) break;
        }
      }
      if(!progress) break;
    }
    if(amount-left>0){ UI.float(hero,`+${amount-left}法力`,'mana'); UI.syncHero(hero); }
  },

  stealManaFromTeam(enemyArr, caster, perColor){
    let got=0;
    for(const h of this.alive(enemyArr)){
      for(const c of COLOR_IDS){
        const take=Math.min(perColor,h.mana[c]);
        if(take>0){ h.mana[c]-=take; got+=take; }
      }
      UI.syncHero(h);
    }
    if(got>0){ this.gainManaAny(caster,got); UI.log(`偷取了 ${got} 点法力`,'lg-mana'); }
    else UI.log('没有偷到法力…','lg-mana');
  },

  drainHero(target, perColor, caster){
    let got=0;
    for(const c of COLOR_IDS){
      const take=Math.min(perColor,target.mana[c]);
      target.mana[c]-=take; got+=take;
    }
    UI.syncHero(target);
    if(got>0){ this.gainManaAny(caster,got); UI.log(`吸取 ${UI.hname(target)} ${got} 点法力`,'lg-mana'); }
    else UI.log('没有吸取到法力…','lg-mana');
  },

  burnMana(h, perColor){
    let burned=0;
    for(const c of COLOR_IDS){
      const take=Math.min(perColor,h.mana[c]);
      h.mana[c]-=take; burned+=take;
    }
    if(burned>0){ UI.float(h,`-${burned}法力`,'mana'); UI.log(`${UI.hname(h)} 被烧毁 ${burned} 点法力`,'lg-mana'); }
    UI.syncHero(h);
  },

  dealDamage(target, amount, opts={}){
    if(!target||!target.alive) return false;
    let rem=amount, killed=false;
    if(!opts.pierce&&target.armor>0){
      const abs=Math.min(target.armor,rem);
      target.armor-=abs; rem-=abs;
      if(abs>0){
        UI.float(target,`-${abs}🛡`,'armor');
        UI.log(`${UI.hname(target)} 的护甲抵消 ${abs} 点伤害`,'lg-dmg');
      }
    }
    if(rem>0){
      target.hp-=rem;
      UI.float(target,`-${rem}`,'dmg');
      UI.log(`${UI.hname(target)} 受到 ${rem} 点伤害`,'lg-dmg');
      if(target.hp<=0){
        target.hp=0; target.alive=false; killed=true;
        UI.float(target,'阵亡!','death');
        UI.log(`${UI.hname(target)} 阵亡！`,'lg-sys');
      }
    }
    UI.syncHero(target);
    return killed;
  },

  heal(h,amount){
    if(!h||!h.alive) return;
    const real=Math.min(amount,h.maxHp-h.hp);
    h.hp+=real;
    UI.float(h,`+${real}`,'heal');
    UI.log(`${UI.hname(h)} 回复 ${real} 点生命`,'lg-heal');
    UI.syncHero(h);
  },
  addArmor(h,amount){
    if(!h||!h.alive) return;
    h.armor+=amount;
    h._armorMax=Math.max(h._armorMax||10,h.armor);
    UI.float(h,`+${amount}🛡`,'armor');
    UI.log(`${UI.hname(h)} 获得 ${amount} 点护甲`,'lg-heal');
    UI.syncHero(h);
  },
  loseHp(h,amount){
    if(!h||!h.alive) return;
    h.hp=Math.max(0,h.hp-amount);
    UI.float(h,`-${amount}`,'dmg');
    UI.log(`${UI.hname(h)} 失去 ${amount} 点生命`,'lg-dmg');
    if(h.hp<=0){
      h.alive=false;
      UI.float(h,'阵亡!','death');
      UI.log(`${UI.hname(h)} 阵亡！`,'lg-sys');
    }
    UI.syncHero(h);
  },
  revive(h){
    h.alive=true; h.hp=Math.floor(h.maxHp/2);
    UI.float(h,'复活!','heal');
    UI.log(`${UI.hname(h)} 被复活了！`,'lg-heal');
    UI.syncHero(h);
  },

  /* ---------- 棋盘变更（技能用） ---------- */
  convertLine(kind,color){
    const st=this.state;
    const idx=Math.floor(Math.random()*(kind==='row'?ROWS:COLS));
    let changed=0;
    for(let i=0;i<(kind==='row'?COLS:ROWS);i++){
      const r=kind==='row'?idx:i;
      const c=kind==='row'?i:idx;
      const g=st.board[r][c];
      if(g&&!g.doom&&g.type!==color){ g.type=color; changed++; UI.updateGemEl(g); }
    }
    UI.log(`棋盘${kind==='row'?`第 ${idx+1} 行`:`第 ${idx+1} 列`}变为${GEMS[color].name}`,'lg-sys');
    return changed;
  },

  convertRandomGems(n,color){
    const st=this.state; const cands=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c];
      if(g&&!g.doom&&g.type!==color) cands.push(g);
    }
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
    let changed=0;
    for(const g of cands.slice(0,n)){ g.type=color; changed++; UI.updateGemEl(g); }
    if(changed) UI.log(`${changed} 颗宝石变为${GEMS[color].name}`,'lg-sys');
    return changed;
  },

  destroyRandomGems(n){
    const st=this.state; const cands=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c];
      if(g&&!g.doom) cands.push(g);
    }
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
    let skulls=0;
    for(const g of cands.slice(0,n)){
      if(g.type==='skull') skulls++;
      UI.removeGemEl(g); st.board[g.r][g.c]=null;
    }
    UI.log(`摧毁了 ${Math.min(n,cands.length)} 颗宝石${skulls?`（含 ${skulls} 颗骷髅）`:''}`,'lg-sys');
    return {skulls};
  },

  makeSkullsOnBoard(n){
    const st=this.state; const cands=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c];
      if(g&&!g.doom&&g.type!=='skull') cands.push(g);
    }
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
    let changed=0;
    for(const g of cands.slice(0,n)){ g.type='skull'; changed++; UI.updateGemEl(g); }
    if(changed) UI.log(`${changed} 颗宝石变为骷髅！`,'lg-sys');
    return changed;
  },

  popAllSkulls(){
    const st=this.state; let count=0;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c];
      if(g&&g.type==='skull'){
        count+=g.doom?2:1;
        UI.removeGemEl(g); st.board[r][c]=null;
      }
    }
    UI.log('引爆了棋盘上的骷髅！','lg-sys');
    return {count};
  },
};
