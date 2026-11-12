'use strict';
/* ================= 本地档案（localStorage，无账号系统） =================
 * 记录昵称、各英雄战绩、征服/每日挑战/热座纪录、成就。
 * 全部数据仅存本机浏览器。 */

const totalWinsOf = (p)=>Object.values(p.heroes||{}).reduce((a,h)=>a+(h.wins||0),0);

const ACHIEVEMENTS = [
  { id:'first_win', icon:'🥇', name:'首胜',       desc:'赢得任意一场胜利',                 cond:p=>totalWinsOf(p)>=1 },
  { id:'wins10',    icon:'🎖️', name:'身经百战', desc:'生涯累计 10 场胜利',               cond:p=>totalWinsOf(p)>=10 },
  { id:'roster',    icon:'🎭', name:'群雄并起', desc:'12 名英雄均至少出战一次',          cond:p=>Object.keys(p.heroes||{}).filter(k=>p.heroes[k].games>0).length>=12 },
  { id:'conquest',  icon:'🏰', name:'峡谷征服者', desc:'通关征服模式',                   cond:p=>(p.conquestClears||0)>=1 },
  { id:'daily1',    icon:'📅', name:'每日一战', desc:'完成一次每日挑战',                 cond:p=>(p.dailyClears||0)>=1 },
  { id:'streak3',   icon:'🔥', name:'三日不辍', desc:'每日挑战连续 3 天完成',            cond:p=>(p.dailyStreak||0)>=3 },
  { id:'pvp1',      icon:'🤝', name:'棋逢对手', desc:'赢得一场双人热座',                 cond:p=>(p.pvpWins||0)>=1 },
  { id:'match4',    icon:'✨', name:'连击大师', desc:'累计触发 10 次额外回合',           cond:p=>(p.counters.extraTurns||0)>=10 },
  { id:'doom5',     icon:'☄️', name:'末日使者', desc:'累计 5 颗末日骷髅降临',            cond:p=>(p.counters.dooms||0)>=5 },
  { id:'boss1',     icon:'👁️', name:'主宰杀手', desc:'击败暗影主宰',                    cond:p=>(p.counters.bossKills||0)>=1 },
];

const Profile = {
  data:{
    name:'无名英雄',
    heroes:{},            // { heroId: {games, wins} }
    duelGames:0, duelWins:0,
    conquestBest:0,       // 最远到达的关卡（1-5，5=已通关）
    conquestClears:0,     // 征服通关次数
    dailyClears:0, dailyStreak:0, dailyLastDate:'',
    pvpWins:0,
    counters:{},          // extraTurns / dooms / bossKills ...
    achievements:{},      // { achId: true }
  },

  load(){
    try{
      const raw=localStorage.getItem('cgb_profile');
      if(raw){
        const saved=JSON.parse(raw);
        Object.assign(this.data, saved);
        this.data.heroes=saved.heroes||{};
        this.data.counters=saved.counters||{};
        this.data.achievements=saved.achievements||{};
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

  count(k){
    this.data.counters[k]=(this.data.counters[k]||0)+1;
    this.save();
  },

  /* 每日挑战胜利：更新连续天数（以本地日期计） */
  dailyWin(){
    const d=new Date();
    const today=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
    const y=new Date(d.getTime()-86400000);
    const yesterday=y.getFullYear()*10000+(y.getMonth()+1)*100+y.getDate();
    if(this.data.dailyLastDate===today) return;
    this.data.dailyStreak=(this.data.dailyLastDate===yesterday)?(this.data.dailyStreak||0)+1:1;
    this.data.dailyLastDate=today;
    this.data.dailyClears=(this.data.dailyClears||0)+1;
    this.save();
  },

  dailyText(){
    if(!this.data.dailyClears) return '📅 每日挑战：尚未完成';
    return `📅 每日挑战：连续 ${this.data.dailyStreak} 天 · 累计 ${this.data.dailyClears} 次`;
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
      if(won) this.data.pvpWins=(this.data.pvpWins||0)+1;
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
    } else if(!st.daily){
      this.data.duelGames=(this.data.duelGames||0)+1;
      if(won) this.data.duelWins=(this.data.duelWins||0)+1;
    }
    if(st.daily&&won) this.dailyWin();
    if(st.foeId==='zhuzai'&&won&&st.winner==='player') this.count('bossKills');
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

  /* 战斗结束时评估成就，返回新解锁列表 */
  checkAchievements(){
    const unlocked=[];
    for(const a of ACHIEVEMENTS){
      if(this.data.achievements[a.id]) continue;
      let ok=false;
      try{ ok=a.cond(this.data); }catch(e){}
      if(ok){ this.data.achievements[a.id]=true; unlocked.push(a); }
    }
    if(unlocked.length) this.save();
    return unlocked;
  },

  reset(){
    this.data={ name:this.data.name, heroes:{}, duelGames:0, duelWins:0,
      conquestBest:0, conquestClears:0, dailyClears:0, dailyStreak:0, dailyLastDate:'',
      pvpWins:0, counters:{}, achievements:{} };
    this.save();
  },
};
Profile.load();
