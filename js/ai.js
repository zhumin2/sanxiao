'use strict';
/* ================= 敌方 AI =================
 * 每回合评估：施放技能 vs 所有可行交换（全 cascade 模拟），择优执行 */

const AI = {
  async takeTurn(){
    const st=Battle.state;
    if(!st||st.over||st.turn!=='enemy') return;
    st.busy=true; UI.lockInput(true); UI.syncAll();
    await sleep(650);
    try {
      const side='enemy';
      const team=Battle.teamArr(side);

      /* 1) 评估可施放技能 */
      let bestCast=null;
      for(const h of Battle.alive(team)){
        h.def.skills.forEach((sk,i)=>{
          if(!Battle.canCast(h,sk)) return;
          const s=this.skillScore(h,sk)*this.noise();
          if(!bestCast||s>bestCast.score) bestCast={hero:h, idx:i, score:s};
        });
      }

      /* 2) 评估全部走子 */
      const frontHero=Battle.front(team);
      const perSkull=frontHero?frontHero.atk:4;
      const moves=this.enumerateMoves(st.board, perSkull);
      const bestMove=moves[0]||null;

      if(bestCast&&(!bestMove||bestCast.score>bestMove.score*1.12+4)){
        await Battle.doCast(side, bestCast.hero, bestCast.idx, {ai:true});
        return;
      }
      if(!bestMove){ Battle.prepareTurn(); return; }

      const pick=this.weightedPick(moves.slice(0,3));
      if(!pick){ Battle.prepareTurn(); return; }
      const [[r1,c1],[r2,c2]]=pick.swap;
      await Battle.doSwap(side, st.board[r1][c1], st.board[r2][c2]);
    } catch(err){
      /* 兜底：任何异常都不允许卡死回合 */
      console.error('[AI]', err);
      UI.log('敌方行动出现异常，跳过本次行动','lg-sys');
      if(Battle.state&&!Battle.state.over&&Battle.state.turn==='enemy'){
        Battle.state.turn='player';
        Battle.state.turnNo++;
        Battle.state.busy=false;
        UI.syncAll();
        Battle.prepareTurn();
      }
    }
  },

  noise(){ return 0.88+Math.random()*0.24; },

  enumerateMoves(board, perSkull){
    const res=[];
    const trySw=(r1,c1,r2,c2)=>{
      const types=typesOf(board);
      const t=types[r1][c1];
      types[r1][c1]=types[r2][c2]; types[r2][c2]=t;
      if(!findGroups(types).length) return;
      const sim=resolveSim(types, perSkull);
      res.push({swap:[[r1,c1],[r2,c2]], score:this.moveScore(sim)});
    };
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        if(c<COLS-1) trySw(r,c,r,c+1);
        if(r<ROWS-1) trySw(r,c,r+1,c);
      }
    }
    res.sort((a,b)=>b.score-a.score);
    return res;
  },

  moveScore(sim){
    const st=Battle.state;
    let s=sim.skullDmg*1.15;
    const pFront=Battle.front(st.teams.player);
    if(pFront&&sim.skullDmg>=pFront.hp+pFront.armor) s+=55;  // 骷髅可击杀
    for(const c of COLOR_IDS){
      if(!sim.mana[c]) continue;
      const used=Battle.alive(st.teams.enemy).some(h=>h.def.colors.includes(c));
      s+=sim.mana[c]*(used?1.5:0.15);
    }
    if(sim.extraTurn) s+=42;
    s+=sim.dooms*8;
    s+=(sim.cascades-1)*6;
    return s;
  },

  skillScore(hero, sk){
    const st=Battle.state;
    const foes=Battle.alive(st.teams.player);
    const v=sk.v||0, v2=sk.v2||0;
    const totalHp=h=>h.hp+h.armor;
    switch(sk.fx){
      case 'damageFront':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.3+(totalHp(t)<=v?45:0); }
      case 'pierceFront':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.45+(t.hp<=v?50:0); }
      case 'pierceLowest':{ if(!foes.length)return 0; const t=[...foes].sort((a,b)=>a.hp-b.hp)[0]; return v*1.4+(t.hp<=v?50:0); }
      case 'damageFront2': return v*Math.min(2,foes.length)*1.2;
      case 'aoeDamage': return v*foes.length*1.2;
      case 'assassinate':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.3+(totalHp(t)<=v?55:0)+6; }
      case 'berserkStrike':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.3-(v2||0)*0.4+(totalHp(t)<=v?45:0); }
      case 'lifestealFront': case 'soulDevour':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.25+v2*0.8+(totalHp(t)<=v?45:0); }
      case 'hexStrike':{ const t=Battle.front(st.teams.player); if(!t)return 0; return v*1.25+4; }
      case 'healAll':{ const miss=Math.max(0,...Battle.alive(st.teams.enemy).map(h=>h.maxHp-h.hp)); return Math.min(v,miss); }
      case 'shieldAll': return v*Battle.alive(st.teams.enemy).length*0.55;
      case 'shieldHealAll':{ const miss=Math.max(0,...Battle.alive(st.teams.enemy).map(h=>h.maxHp-h.hp)); return v*0.55*Battle.alive(st.teams.enemy).length+Math.min(v2,miss)*0.9; }
      case 'reviveOrHeal':{
        const dead=st.teams.enemy.find(h=>!h.alive);
        if(dead) return 48;
        const miss=Math.max(0,...Battle.alive(st.teams.enemy).map(h=>h.maxHp-h.hp));
        return Math.min(v,miss);
      }
      case 'rage': return v*9-(v2||0)*0.5;
      case 'convertCol': case 'convertRow': return 15;
      case 'destroyRandom': return v*1.6;
      case 'makeSkulls': return 11;
      case 'popSkulls':{
        let cnt=0;
        for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
          const g=st.board[r][c];
          if(g&&g.type==='skull') cnt+=g.doom?2:1;
        }
        return cnt*v*1.2;
      }
      case 'airSupport': return v*foes.length*1.15+9;
      case 'aoeSteal': return v*foes.length*1.2+v2*1.6;
      case 'drainAll': return v*8*0.7;
      case 'drainFront': return v*5*0.8;
      case 'manaBurnAll': return v*COLOR_IDS.length*0.5;
      case 'parasite': return v*8*0.7+v2;
      case 'aoeDrain': return v*foes.length*1.2+v2*0.8;
      default: return v?v*1.1:8;
    }
  },

  weightedPick(list){
    if(!list.length) return null;
    if(list.length===1) return list[0];
    const w=[0.72,0.18,0.10];
    const x=Math.random(); let acc=0;
    for(let i=0;i<list.length&&i<3;i++){ acc+=w[i]; if(x<acc) return list[i]; }
    return list[0];
  },
};
