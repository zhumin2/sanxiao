'use strict';
/* ================= 技能效果实现 =================
 * ctx = { caster(施法者), self(己方队伍数组), enemy(敌方队伍数组), extraTurn } */

/* 会改动棋盘、需要触发后续消解的技能 */
const BOARD_CHANGING_FX = new Set([
  'convertCol','convertRow','destroyRandom','makeSkulls','popSkulls','hexStrike','airSupport',
]);

const FX = {
  /* ---- 伤害 ---- */
  damageFront(ctx,v){ const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,v,{}); },
  pierceFront(ctx,v){ const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,v,{pierce:true}); },
  pierceLowest(ctx,v){
    const list=Battle.alive(ctx.enemy); if(!list.length) return;
    const t=list.slice().sort((a,b)=>a.hp-b.hp)[0];
    Battle.dealDamage(t,v,{pierce:true});
  },
  aoeDamage(ctx,v){ Battle.alive(ctx.enemy).forEach(h=>Battle.dealDamage(h,v,{})); },
  assassinate(ctx,v){
    const t=Battle.front(ctx.enemy); if(!t) return;
    const killed=Battle.dealDamage(t,v,{});
    if(killed){ ctx.extraTurn=true; UI.banner('击杀！获得额外回合'); }
  },
  berserkStrike(ctx,v,v2){
    if(v2) Battle.loseHp(ctx.caster,v2);
    const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,v,{});
  },
  lifestealFront(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(!t) return;
    Battle.dealDamage(t,v,{}); Battle.heal(ctx.caster,v2);
  },
  soulDevour(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(!t) return;
    Battle.dealDamage(t,v,{}); Battle.heal(ctx.caster,v2);
  },
  hexStrike(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,v,{});
    Battle.convertRandomGems(v2,'purple');
  },

  /* ---- 状态效果类（灼烧/冰冻/中毒/破甲） ---- */
  burnStrike(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(!t) return;
    Battle.dealDamage(t,v,{});
    Battle.applyStatus(t,'burn',v2||3);
  },
  freezeStrike(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(!t) return;
    Battle.dealDamage(t,v,{});
    Battle.applyStatus(t,'frozen',v2||1);
  },
  shieldFreeze(ctx,v,v2){
    Battle.addArmor(ctx.caster,v);
    const t=Battle.front(ctx.enemy); if(t) Battle.applyStatus(t,'frozen',v2||1);
  },
  poisonHit(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(t) Battle.applyStatus(t,'poison',v);
    if(v2) Battle.heal(ctx.caster,v2);
  },
  poisonBlast(ctx,v){
    const t=Battle.front(ctx.enemy); if(!t) return;
    const stacks=t.status?t.status.poison:0;
    const dmg=Math.max(v,stacks*6);
    if(t.status) t.status.poison=0;
    UI.log(`毒爆引爆 ${stacks} 层中毒！`,'lg-cast');
    Battle.dealDamage(t,dmg,{pierce:true});
  },
  shredStrike(ctx,v,v2){
    const t=Battle.front(ctx.enemy); if(!t) return;
    Battle.dealDamage(t,v,{});
    Battle.applyStatus(t,'shred',v2||2);
  },
  convertRandom(ctx,v,color){
    Battle.convertRandomGems(v,color);
  },

  /* ---- 治疗 / 护甲 / 增益 ---- */
  healAll(ctx,v){ Battle.alive(ctx.self).forEach(h=>Battle.heal(h,v)); },
  shieldAll(ctx,v){ Battle.alive(ctx.self).forEach(h=>Battle.addArmor(h,v)); },
  shieldHealAll(ctx,v,v2){ Battle.alive(ctx.self).forEach(h=>{ Battle.addArmor(h,v); Battle.heal(h,v2); }); },
  rage(ctx,v,v2){
    if(v2) Battle.loseHp(ctx.caster,v2);
    ctx.caster.atk+=v;
    UI.float(ctx.caster,`攻击+${v}`,'buff');
    UI.log(`${UI.hname(ctx.caster)} 攻击力永久 +${v}`,'lg-cast');
  },
  parasite(ctx,v,v2){
    Battle.stealManaFromTeam(ctx.enemy, ctx.caster, v);
    Battle.heal(ctx.caster,v2);
  },

  /* ---- 法力操作 ---- */
  aoeSteal(ctx,v,v2){
    Battle.alive(ctx.enemy).forEach(h=>Battle.dealDamage(h,v,{}));
    Battle.stealManaFromTeam(ctx.enemy, ctx.caster, v2);
  },
  drainAll(ctx,v){ Battle.stealManaFromTeam(ctx.enemy, ctx.caster, v); },
  drainFront(ctx,v){ const t=Battle.front(ctx.enemy); if(t) Battle.drainHero(t,v,ctx.caster); },
  manaBurnAll(ctx,v){ Battle.alive(ctx.enemy).forEach(h=>Battle.burnMana(h,v)); },
  aoeDrain(ctx,v,v2){
    Battle.alive(ctx.enemy).forEach(h=>Battle.dealDamage(h,v,{}));
    const t=Battle.front(ctx.enemy); if(t) Battle.burnMana(t,v2);
  },

  /* ---- 棋盘操作 ---- */
  convertCol(ctx,_v,color){ Battle.convertLine('col', color); },
  convertRow(ctx,_v,color){ Battle.convertLine('row', color); },
  destroyRandom(ctx,v,v2){
    const res=Battle.destroyRandomGems(v);
    if(res.skulls>0&&v2){ const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,res.skulls*v2,{}); }
  },
  makeSkulls(ctx,v){ Battle.makeSkullsOnBoard(v); },
  popSkulls(ctx,v){
    const res=Battle.popAllSkulls();
    if(res.count>0){ const t=Battle.front(ctx.enemy); if(t) Battle.dealDamage(t,res.count*v,{}); }
  },
  airSupport(ctx,v,v2){
    Battle.alive(ctx.enemy).forEach(h=>Battle.dealDamage(h,v,{}));
    Battle.makeSkullsOnBoard(v2);
  },
};

function castSkillFX(ctx, skill){
  FX[skill.fx](ctx, skill.v, skill.v2, skill.color);
}
