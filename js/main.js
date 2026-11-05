'use strict';
/* ================= 应用入口 ================= */

const App = {
  selection:[],   // 出战英雄 id
  detailId:null,
  mode:'duel',            // duel 单挑 / conquest 征服
  enemyTeam:'baiqi',
  aiLevel:'normal',
  lastMode:'duel', lastHeroDef:null,   // 结算界面“再战一局”用

  toggleHero(id){
    const i=this.selection.indexOf(id);
    if(i>=0) this.selection.splice(i,1);
    else if(this.selection.length<1) this.selection.push(id);
    this.detailId=id;
    UI.refreshSelect();
  },

  removeHero(i){
    this.selection.splice(i,1);
    UI.refreshSelect();
  },

  setMode(id){
    this.mode=id;
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
    if(this.selection.length!==1) return;
    const def=getHeroDef(this.selection[0]);
    this.lastHeroDef=def;
    if(this.mode==='conquest'){
      this.lastMode='conquest';
      Conquest.startRun(def,this.aiLevel);
    } else {
      this.lastMode='duel';
      const team=ENEMY_TEAMS.find(t=>t.id===this.enemyTeam);
      UI.showScreen('battle');
      Battle.start([def],team,this.aiLevel);
    }
  },

  /* 结算界面“再战一局”：征服重开整趟，单挑重打同一场 */
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
