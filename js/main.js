'use strict';
/* ================= 应用入口 ================= */

const App = {
  selection:[],   // 出战英雄 id（pvp 模式为 [玩家1, 玩家2]）
  detailId:null,
  mode:'duel',            // duel 单挑 / conquest 征服 / pvp 双人热座
  enemyTeam:'baiqi',
  aiLevel:'normal',
  lastMode:'duel', lastHeroDef:null,   // 结算界面“再战一局”用

  modeCap(){ return this.mode==='pvp'?2:1; },

  toggleHero(id){
    const i=this.selection.indexOf(id);
    if(i>=0) this.selection.splice(i,1);
    else if(this.selection.length<this.modeCap()) this.selection.push(id);
    this.detailId=id;
    UI.refreshSelect();
  },

  removeHero(i){
    this.selection.splice(i,1);
    UI.refreshSelect();
  },

  setMode(id){
    this.mode=id;
    this.selection=[];   // 切换模式清空已选
    UI.refreshSelect();
  },

  setEnemyTeam(id){
    this.enemyTeam=id;
    UI.refreshSelect();
  },

  setAiLevel(id){
    this.aiLevel=id;
    UI.refreshSelect();
  },

  showSelect(){
    UI.showScreen('select');
    UI.renderSelect();
  },

  startBattle(){
    const need=this.modeCap();
    if(this.selection.length!==need) return;
    const defs=this.selection.map(id=>getHeroDef(id));
    this.lastHeroDef=defs[0];
    if(this.mode==='conquest'){
      this.lastMode='conquest';
      Conquest.startRun(defs[0],this.aiLevel);
    } else if(this.mode==='pvp'){
      this.lastMode='pvp';
      UI.showScreen('battle');
      Battle.start([defs[0]],{name:'双人热座',heroes:[defs[1].id]},this.aiLevel,{pvp:true});
    } else {
      this.lastMode='duel';
      const team=ENEMY_TEAMS.find(t=>t.id===this.enemyTeam);
      UI.showScreen('battle');
      Battle.start([defs[0]],team,this.aiLevel);
    }
  },

  /* 结算界面“再战一局”：征服重开整趟，其余重打同一场 */
  restartLast(){
    UI.showScreen('battle');
    if(this.lastMode==='conquest'&&this.lastHeroDef){
      Conquest.startRun(this.lastHeroDef,this.aiLevel);
    } else {
      Battle.restart();
    }
  },
};

window.addEventListener('DOMContentLoaded',()=>{
  UI.init();
});
