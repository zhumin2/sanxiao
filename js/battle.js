'use strict';
/* ================= 战斗系统 ================= */

const Battle = {
  state:null, lastSetup:null, speed:1,

  /* ---------- 开局 ---------- */
  start(playerDefs, enemyTeam, aiLevel, opts={}){
    const mk=(def,side,idx)=>({
      def, side, idx,
      hp:def.hp, maxHp:def.hp,
      armor:def.armor,
      atk:def.atk,
      mana:{red:0,blue:0,green:0,yellow:0,purple:0},
      manaCap:def.manaCap||MANA_CAP,
      alive:true,
      _armorMax:def.armor||10,
      status:{burn:0,poison:0,frozen:0,shred:0},
    });
    const players=playerDefs.map((d,i)=>mk(d,'player',i));
    const enemies=enemyTeam.random
      ? [HERO_ROSTER[Math.floor(rand()*HERO_ROSTER.length)]].map((d,i)=>mk(d,'enemy',i))
      : enemyTeam.heroes.map((id,i)=>mk(getHeroDef(id),'enemy',i));

    /* 每日挑战：先按日期种子初始化随机流，再生成棋盘，保证开局确定 */
    if(opts.daily&&opts.daily.seed){ RNG.setSeed(opts.daily.seed); } else { RNG.clear(); }

    this.state={
      board:newBoard(), enemyTeam,
      teams:{player:players, enemy:enemies},
      turn:'player', turnNo:1, busy:false, over:false, winner:null,
      aiLevel:aiLevel||'normal',
      bossRaged:false, rageTurns:0,
      conquest:!!opts.conquest,
      pvp:!!opts.pvp,
      daily:opts.daily||null,
      heroId:playerDefs[0]?playerDefs[0].id:null,
      foeId:enemyTeam.heroes?enemyTeam.heroes[0]:null,
    };
    this.lastSetup={playerDefs, enemyTeam, aiLevel, opts};
    /* 征服模式：延续（或首次接管）英雄实例，须在渲染面板前完成 */
    if(this.state.conquest&&typeof Conquest!=='undefined'){
      const carried=Conquest.attachHero(this.state.teams.player[0]);
      if(carried!==this.state.teams.player[0]) this.state.teams.player[0]=carried;
    }

    UI.buildBattleScreen(this.state);
    UI.log(`战斗开始：${UI.hname(this.state.teams.player[0])} vs ${this.state.pvp?UI.hname(this.state.teams.enemy[0]):enemyTeam.name}！`,'lg-sys');
    UI.log(`骷髅伤害由你方英雄的攻击力决定，只有亲和色的宝石会充能。`,'lg-sys');
    /* 每日挑战规则生效 */
    if(this.state.daily){
      const rule=DAILY_RULES.find(dr=>dr.id===this.state.daily.mod);
      if(rule) UI.log(`📅 每日挑战 · ${rule.name}：${rule.desc}`,'lg-sys');
      if(this.state.daily.mod==='atk_up'){
        const e0=this.state.teams.enemy[0];
        e0.atk+=2;
        UI.log(`${UI.hname(e0)} 攻击力 +2（强敌压境）`,'lg-sys');
      }
      if(this.state.daily.mod==='poison_start'){
        this.applyStatus(this.state.teams.player[0],'poison',2);
        this.applyStatus(this.state.teams.enemy[0],'poison',2);
      }
    }
    this.prepareTurn();
  },

  restart(){ const s=this.lastSetup; if(s) this.start(s.playerDefs, s.enemyTeam, s.aiLevel, s.opts); },

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
    /* 回合开始：结算该方的灼烧/中毒/冰冻/破甲 */
    if(this.tickStatuses(st.turn)) return;   // DoT 可能直接结束战斗
    st.busy=false; UI.lockInput(false); UI.syncAll();
    /* 热座模式：双方均为真人，不调度 AI；回合切换横幅在 endOfAction 中提示 */
    if(st.turn==='enemy'&&!st.pvp){ UI.lockInput(true); sleep(900).then(()=>AI.takeTurn()); }
  },

  /* 状态效果回合结算。返回 true 表示战斗已结束 */
  tickStatuses(side){
    const st=this.state;
    for(const h of this.teamArr(side)){
      if(!h.alive) continue;
      const s=h.status; if(!s) continue;
      if(s.poison>0){
        const dmg=s.poison*2;
        UI.log(`☠ ${UI.hname(h)} 中毒发作，失去 ${dmg} 点生命（${s.poison} 层）`,'lg-dmg');
        this.loseHp(h,dmg);
        s.poison=Math.max(0,s.poison-1);
      }
      if(!h.alive) continue;
      if(s.burn>0){
        UI.log(`🔥 ${UI.hname(h)} 灼烧发作，失去 6 点生命`,'lg-dmg');
        this.loseHp(h,6);
        s.burn=Math.max(0,s.burn-1);
      }
      if(!h.alive) continue;
      if(s.frozen>0){
        UI.log(`❄ ${UI.hname(h)} 被冰冻，本回合无法施放技能`,'lg-sys');
        s.frozen--;
      }
      if(s.shred>0){
        UI.log(`💥 ${UI.hname(h)} 护甲破损（吸收减半）`,'lg-sys');
        s.shred--;
      }
    }
    /* 每日挑战 · 灼烧日：当前回合方前排额外掉血 */
    if(st.daily&&st.daily.mod==='burn_all'){
      const f=this.front(this.teamArr(side));
      if(f&&f.alive){
        UI.log(`🔥 灼烧日：${UI.hname(f)} 受到 3 点真实伤害`,'lg-dmg');
        this.loseHp(f,3);
      }
    }
    UI.syncAll();
    if(this.checkEnd()) return true;
    return false;
  },

  /* 施加状态：poison 为叠层，其余为持续回合（重复施加取更大值） */
  applyStatus(target, kind, n){
    const st=this.state;
    if(!target||!target.alive||!st) return;
    if(!target.status) target.status={burn:0,poison:0,frozen:0,shred:0};
    const label={burn:'灼烧',frozen:'冰冻',shred:'破甲'}[kind];
    if(kind==='poison'){
      target.status.poison+=n;
      UI.float(target,`☠️+${n}层`,'buff');
      UI.log(`${UI.hname(target)} 中毒 +${n} 层（当前 ${target.status.poison} 层）`,'lg-sys');
    } else {
      target.status[kind]=Math.max(target.status[kind]||0, n);
      UI.float(target,`${{burn:'🔥',frozen:'❄️',shred:'💥'}[kind]}${n}`,'buff');
      UI.log(`${UI.hname(target)} 被施加${label} ${n} 回合`,'lg-sys');
    }
    UI.syncHero(target);
  },

  /* Boss 血量过半触发狂暴 */
  checkBossRage(target){
    const st=this.state;
    if(!st||st.bossRaged||!target||!target.alive||!target.def.boss) return;
    if(target.hp<=target.maxHp/2){
      st.bossRaged=true;
      target.atk+=3;
      UI.float(target,'狂暴！攻击+3','buff');
      UI.banner('⚠ 暗影主宰 进入狂暴！');
      UI.log('暗影主宰 血量过半，进入狂暴状态（攻击 +3，此后每 3 回合侵蚀棋盘）！','lg-sys');
      UI.syncHero(target);
      Sound.play('rage');
    }
  },

  async endOfAction(side, totals){
    const st=this.state;
    if(this.checkEnd()) return;
    const again=totals&&totals.extraTurn;
    if(again){ UI.banner('额外回合！'); Sound.play('extra'); await sleep(750); }
    else {
      st.turn=this.other(side); st.turnNo++;
      if(st.pvp){
        UI.banner(`请把设备交给 玩家${st.turn==='player'?1:2}`);
        Sound.play('ui');
        await sleep(600);
      }
    }
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
      UI.log(st.pvp?`玩家${st.winner==='player'?1:2} 的对手全灭！`:(st.winner==='player'?'敌方全灭——胜利！':'我方全灭——战败…'),'lg-sys');
      Sound.play(st.pvp?'extra':(st.winner==='player'?'victory':'defeat'));
      if(typeof Profile!=='undefined'){
        Profile.record(st);
        if(st.winner==='player'&&st.foeId==='zhuzai') Profile.count('bossKills');
        if(st.daily&&st.winner==='player') Profile.dailyWin();
        Profile.checkAchievements().forEach(function(a){
          UI.banner('🏆 成就解锁：'+a.name);
          UI.log('🏆 成就解锁：'+a.name+' — '+a.desc,'lg-heal');
        });
      }
      setTimeout(()=>{
        if(st.conquest&&typeof Conquest!=='undefined'){
          if(st.winner==='player') Conquest.onStageWon();
          else Conquest.onRunLost();
        } else if(st.pvp){
          UI.showResult(true, `🏆 玩家${st.winner==='player'?1:2} 获胜！`);
        } else if(st.daily){
          UI.showResult(st.winner==='player', st.winner==='player'
            ? `📅 每日挑战完成！连续 ${Profile.data.dailyStreak} 天 · 累计 ${Profile.data.dailyClears} 次`
            : '📅 每日挑战未完成，明天再来（棋盘每天刷新）');
        } else {
          UI.showResult(st.winner==='player');
        }
      }, 1100);
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
    if(hero.status&&hero.status.frozen>0) return false;   // 冰冻：无法施法
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
    UI.boardCast();
    Sound.play('cast');
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
      Sound.play('match', {cascade: totals.cascades});
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
        const idx=Math.floor(rand()*cands.length);
        const g=cands.splice(idx,1)[0];
        g.type='skull'; g.doom=true; UI.updateGemEl(g);
        UI.burst([[g.r,g.c]]);
      }
      UI.log('☠ 末日骷髅降临棋盘（双倍骷髅伤害）！','lg-sys');
      Sound.play('doom');
    }

    /* 骷髅伤害 */
    if(totals.skullDmg>0){
      if(st.daily&&st.daily.mod==='skull_fury') totals.skullDmg=Math.round(totals.skullDmg*1.5);   // 骷髅狂潮
      const t=this.front(this.teamArr(this.other(side)));
      if(t){
        UI.banner('💀 骷髅攻击！');
        UI.boardHit();
        Sound.play('skull');
        await sleep(500);
        this.dealDamage(t, totals.skullDmg, {});
        await sleep(320);
      }
    }
    /* 法力充能 */
    for(const c of COLOR_IDS){
      if(totals.mana[c]>0) this.gainColorMana(side, c, totals.mana[c]);
    }
    /* 征服模式：黄金宝石额外产出金币 */
    if(st.conquest&&totals.mana.yellow>0&&side==='player'){
      Conquest.addGold(totals.mana.yellow);
      UI.float(st.teams.player[0], `+${totals.mana.yellow}💰`, 'gold');
    }
    /* 成就计数器 */
    if(typeof Profile!=='undefined'){
      if(totals.extraTurn) Profile.count('extraTurns');
      for(let i=0;i<totals.doom;i++) Profile.count('dooms');
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
    const st=this.state;
    if(st&&st.daily.mod==='mana_tide') amount=Math.ceil(amount*1.5);   // 法力潮汐
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
    const effArmor=(target.status&&target.status.shred>0)?Math.floor(target.armor/2):target.armor;
    if(!opts.pierce&&effArmor>0){
      const abs=Math.min(effArmor,rem);
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
    this.checkBossRage(target);
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
    const idx=Math.floor(rand()*(kind==='row'?ROWS:COLS));
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
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
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
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
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
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
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
