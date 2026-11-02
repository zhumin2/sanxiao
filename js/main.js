'use strict';
/* ================= 应用入口 ================= */

const App = {
  selection:[],   // 出战英雄 id，顺序 = 站位（前排在前）
  detailId:null,
  enemyTeam:'villains',

  toggleHero(id){
    const i=this.selection.indexOf(id);
    if(i>=0) this.selection.splice(i,1);
    else if(this.selection.length<4) this.selection.push(id);
    this.detailId=id;
    UI.refreshSelect();
  },

  removeHero(i){
    this.selection.splice(i,1);
    UI.refreshSelect();
  },

  setEnemyTeam(id){
    this.enemyTeam=id;
    UI.refreshSelect();
  },

  showSelect(){
    UI.showScreen('select');
    UI.renderSelect();
  },

  startBattle(){
    if(this.selection.length!==4) return;
    const defs=this.selection.map(id=>getHeroDef(id));
    const team=ENEMY_TEAMS.find(t=>t.id===this.enemyTeam);
    UI.showScreen('battle');
    Battle.start(defs,team);
  },
};

window.addEventListener('DOMContentLoaded',()=>{
  UI.init();
});
