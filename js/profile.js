'use strict';
/* ================= 本地档案（localStorage，无账号系统） =================
 * 记录昵称、各英雄战绩、征服最佳纪录。全部数据仅存本机浏览器。 */

const Profile = {
  data:{
    name:'无名英雄',
    heroes:{},            // { heroId: {games, wins} }
    duelGames:0, duelWins:0,
    conquestBest:0,       // 最远到达的关卡（1-5，5=已通关）
    conquestClears:0,     // 通关次数
  },

  load(){
    try{
      const raw=localStorage.getItem('cgb_profile');
      if(raw){
        const saved=JSON.parse(raw);
        Object.assign(this.data, saved);
        this.data.heroes=saved.heroes||{};
      }
    }catch(e){}
    return this.data;
  },

  save(){
    try{ localStorage.setItem('cgb_profile', JSON.stringify(this.data)); }catch(e){}
  },

  setName(n){
    this.data.name=(n||'').trim().slice(0,12)||'无名英雄';
    this.save();
    return this.data.name;
  },

  /* 战斗结束（checkEnd）时记录一场 */
  record(st){
    if(!st||!st.over) return;
    const won=st.winner==='player';
    /* 热座：双方各记一场，胜者 +1 胜 */
    if(st.pvp){
      for(const [id,w] of [[st.heroId, st.winner==='player'],[st.foeId, st.winner==='enemy']]){
        if(!id) continue;
        if(!this.data.heroes[id]) this.data.heroes[id]={games:0,wins:0};
        this.data.heroes[id].games++;
        if(w) this.data.heroes[id].wins++;
      }
      this.save();
      return;
    }
    const hid=st.heroId||'unknown';
    if(!this.data.heroes[hid]) this.data.heroes[hid]={games:0,wins:0};
    this.data.heroes[hid].games++;
    if(won) this.data.heroes[hid].wins++;
    if(st.conquest&&typeof Conquest!=='undefined'){
      const reached=Math.min(CONQUEST_STAGES.length, Conquest.stageIdx+1);
      this.data.conquestBest=Math.max(this.data.conquestBest||0, reached);
      if(won&&reached>=CONQUEST_STAGES.length){
        this.data.conquestClears=(this.data.conquestClears||0)+1;
      }
    } else {
      this.data.duelGames=(this.data.duelGames||0)+1;
      if(won) this.data.duelWins=(this.data.duelWins||0)+1;
    }
    this.save();
  },

  heroRecord(id){
    const h=this.data.heroes[id];
    return h||{games:0,wins:0};
  },

  conquestText(){
    if(!this.data.conquestBest) return '🏰 征服纪录：尚未挑战';
    if(this.data.conquestBest>=CONQUEST_STAGES.length){
      return `🏰 征服纪录：通关 ×${this.data.conquestClears}`;
    }
    return `🏰 征服纪录：最佳第 ${this.data.conquestBest} 关`;
  },

  reset(){
    this.data={ name:this.data.name, heroes:{}, duelGames:0, duelWins:0, conquestBest:0, conquestClears:0 };
    this.save();
  },
};
Profile.load();
