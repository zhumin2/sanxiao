'use strict';
/* ================= 数据定义：宝石 / 英雄 / 技能 / 敌方队伍 ================= */

const ROWS = 8, COLS = 8;
const MANA_CAP = 16;          // 普通英雄单色法力上限
const BOSS_MANA_CAP = 22;     // Boss 法力上限

const GEMS = {
  red:    { id:'red',    name:'烈焰', icon:'🔥', hex:'#d92c3a' },
  blue:   { id:'blue',   name:'寒霜', icon:'💧', hex:'#2e6bd9' },
  green:  { id:'green',  name:'灵藤', icon:'🍃', hex:'#2e9c46' },
  yellow: { id:'yellow', name:'黄金', icon:'👑', hex:'#d99a2e' },
  purple: { id:'purple', name:'暗能', icon:'🔮', hex:'#8a3ed9' },
  skull:  { id:'skull',  name:'骷髅', icon:'💀', hex:'#6a6a78' },
};
const COLOR_IDS = ['red','blue','green','yellow','purple'];
const REFILL_WEIGHTS = { red:6, blue:6, green:6, yellow:6, purple:6, skull:4 };

/* ===== 我方可选英雄（8 名）=====
 * hp 生命 / armor 护甲 / atk 攻击(决定每颗骷髅的伤害) / colors 法力亲和色
 * 排位越靠前越先承受骷髅伤害，同色法力优先充给靠前的英雄 */
const HERO_ROSTER = [
  { id:'yase', name:'亚瑟', title:'圣骑之力', role:'坦克', emoji:'🛡️', bg:'#2e5fa3',
    hp:58, armor:24, atk:5, colors:['red','yellow'],
    skills:[
      { name:'誓约之盾',   cost:{yellow:6, red:4},   fx:'shieldAll', v:10, desc:'获得 10 点护甲' },
      { name:'回旋打击',   cost:{red:7, yellow:4},   fx:'aoeDamage', v:10, desc:'对敌方造成 10 点伤害' },
      { name:'圣剑裁决',   cost:{red:12, yellow:10}, fx:'pierceFront', v:32, desc:'对敌方造成 32 点真实伤害（无视护甲）' },
    ]},
  { id:'daji', name:'妲己', title:'魅力之狐', role:'法师', emoji:'🦊', bg:'#8e3fa8',
    hp:44, armor:10, atk:3, colors:['blue','purple'],
    skills:[
      { name:'灵魂冲击',   cost:{blue:6},            fx:'damageFront', v:16, desc:'对敌方造成 16 点伤害' },
      { name:'偶像魅力',   cost:{blue:5, purple:5},  fx:'convertCol', color:'blue', desc:'将随机一整列宝石变为寒霜' },
      { name:'女王崇拜',   cost:{blue:12, purple:10},fx:'aoeSteal', v:16, v2:4, desc:'对敌方 16 点伤害，并偷取其 4 点法力' },
    ]},
  { id:'luban', name:'鲁班七号', title:'机关造物', role:'射手', emoji:'🤖', bg:'#b8862d',
    hp:40, armor:12, atk:6, colors:['yellow','red'],
    skills:[
      { name:'河豚手雷',     cost:{yellow:5},          fx:'damageFront', v:12, desc:'对敌方造成 12 点伤害' },
      { name:'无敌鲨嘴炮',   cost:{yellow:8, red:6},   fx:'destroyRandom', v:7, v2:3, desc:'摧毁随机 7 颗宝石，每颗被摧毁的骷髅额外造成 3 点伤害' },
      { name:'空中支援',     cost:{yellow:16, red:8},  fx:'airSupport', v:14, v2:4, desc:'对敌方造成 14 点伤害，并使 4 颗宝石变为骷髅' },
    ]},
  { id:'caiwenji', name:'蔡文姬', title:'长歌行', role:'辅助', emoji:'🎶', bg:'#2f8f5b',
    hp:48, armor:14, atk:2, colors:['green','blue'],
    skills:[
      { name:'靡靡之音',   cost:{green:6},           fx:'healAll', v:12, desc:'回复 12 点生命' },
      { name:'胡笳乐章',   cost:{blue:6, green:6},   fx:'shieldHealAll', v:10, v2:6, desc:'获得 10 点护甲并回复 6 点生命' },
      { name:'长歌当哭',   cost:{blue:14, green:8},  fx:'healAll', v:20, desc:'回复 20 点生命' },
    ]},
  { id:'libai', name:'李白', title:'青莲剑仙', role:'刺客', emoji:'⚔️', bg:'#3a6ea8',
    hp:44, armor:8, atk:6, colors:['blue','purple'],
    skills:[
      { name:'将进酒',     cost:{blue:4},            fx:'assassinate', v:11, desc:'对敌方造成 11 点伤害，若击杀则获得额外回合' },
      { name:'神来之笔',   cost:{purple:8},          fx:'convertRow', color:'purple', desc:'将随机一整行宝石变为暗能' },
      { name:'青莲剑歌',   cost:{blue:12, purple:10},fx:'pierceLowest', v:26, desc:'对敌方造成 26 点真实伤害（无视护甲）' },
    ]},
  { id:'chengyaojin', name:'程咬金', title:'热烈之斧', role:'战士', emoji:'🪓', bg:'#a84e2e',
    hp:74, armor:18, atk:5, colors:['red','green'],
    skills:[
      { name:'激热回旋',   cost:{red:5},             fx:'berserkStrike', v:10, v2:4,  desc:'对敌方造成 10 点伤害，自身失去 4 点生命' },
      { name:'正义潜能',   cost:{green:10},          fx:'rage', v:4, v2:8, desc:'自身失去 8 点生命，攻击力永久 +4' },
      { name:'搏命三连',   cost:{red:14},            fx:'berserkStrike', v:34, v2:12, desc:'对敌方造成 34 点伤害，自身失去 12 点生命' },
    ]},
  { id:'diaochan', name:'貂蝉', title:'绝世舞姬', role:'法师', emoji:'🌸', bg:'#a83a6e',
    hp:44, armor:10, atk:3, colors:['purple','blue'],
    skills:[
      { name:'绽·风华',   cost:{purple:5},           fx:'drainAll', v:2, desc:'吸取敌人 2 点法力' },
      { name:'绝·倾城',   cost:{purple:8, blue:6},   fx:'makeSkulls', v:6, desc:'将随机 6 颗宝石变为骷髅' },
      { name:'花·绽放',   cost:{purple:14},          fx:'popSkulls', v:4, desc:'引爆棋盘上全部骷髅，每颗对敌方造成 4 点伤害' },
    ]},
  { id:'houyi', name:'后羿', title:'追日弓手', role:'射手', emoji:'🏹', bg:'#a8722e',
    hp:40, armor:10, atk:6, colors:['red','yellow'],
    skills:[
      { name:'惩戒射击',   cost:{red:5},             fx:'damageFront', v:13, desc:'对敌方造成 13 点伤害' },
      { name:'落日余晖',   cost:{yellow:8},          fx:'convertCol', color:'red', desc:'将随机一整列宝石变为烈焰' },
      { name:'灼日之矢',   cost:{red:12, yellow:10}, fx:'damageFront', v:30, desc:'对敌方造成 30 点伤害' },
    ]},
];

/* ===== 敌方英雄（AI 专用，单挑对手）===== */
const ENEMY_ROSTER = [
  { id:'baiqi', name:'白起', title:'不朽战魂', role:'坦克', emoji:'☠️', bg:'#5a2e3a', enemy:true,
    hp:64, armor:20, atk:4, colors:['red','purple'],
    skills:[
      { name:'死神之镰',   cost:{red:5},             fx:'lifestealFront', v:12, v2:8, desc:'对敌方造成 12 点伤害并回复自身 8 点生命' },
      { name:'傲慢嘲讽',   cost:{purple:8},          fx:'manaBurnAll', v:4, desc:'烧毁敌人每种法力各 4 点' },
      { name:'大杀四方',   cost:{red:12, purple:8},  fx:'aoeDamage', v:13, desc:'对敌方造成 13 点伤害' },
    ]},
  { id:'lanling', name:'兰陵王', title:'暗隐之刃', role:'刺客', emoji:'🗡️', bg:'#3a3a5a', enemy:true,
    hp:46, armor:8, atk:6, colors:['purple','blue'],
    skills:[
      { name:'秘技·分身',  cost:{blue:5},            fx:'assassinate', v:10, desc:'对敌方造成 10 点伤害，若击杀则获得额外回合' },
      { name:'秘技·极刃',  cost:{purple:6},          fx:'rage', v:3, v2:0, desc:'攻击力永久 +3' },
      { name:'暗影狩猎',   cost:{purple:12, blue:8}, fx:'pierceLowest', v:24, desc:'对敌方造成 24 点真实伤害（无视护甲）' },
    ]},
  { id:'zhongkui', name:'钟馗', title:'虚灵城判', role:'法师', emoji:'👻', bg:'#4a3a6a', enemy:true,
    hp:50, armor:12, atk:4, colors:['purple','yellow'],
    skills:[
      { name:'制裁仪式',   cost:{yellow:5},          fx:'drainFront', v:6, desc:'吸取敌人 6 点法力' },
      { name:'噬魂锁',     cost:{purple:8},          fx:'hexStrike', v:14, v2:4, desc:'对敌方造成 14 点伤害，并使 4 颗宝石变为暗能' },
      { name:'轮回吞噬',   cost:{purple:12, yellow:10}, fx:'soulDevour', v:26, v2:12, desc:'对敌方造成 26 点伤害，并回复自身 12 点生命' },
    ]},
  { id:'donghuang', name:'东皇太一', title:'堕神契约', role:'坦克', emoji:'🌑', bg:'#2e4a4a', enemy:true,
    hp:60, armor:16, atk:4, colors:['purple','green'],
    skills:[
      { name:'堕神契约',   cost:{green:6},           fx:'parasite', v:2, v2:8, desc:'吸取敌人 2 点法力，并回复自身 8 点生命' },
      { name:'蚀日',       cost:{purple:8},          fx:'convertRow', color:'purple', desc:'将随机一整行宝石变为暗能' },
      { name:'噬神之祭',   cost:{purple:12, green:10}, fx:'aoeDrain', v:12, v2:6, desc:'对敌方造成 12 点伤害，并烧毁其 6 点法力' },
    ]},
];

/* ===== Boss：暗影主宰（单人，五色亲和）===== */
const BOSS_HERO = {
  id:'zhuzai', name:'暗影主宰', title:'峡谷霸主', role:'BOSS', emoji:'👁️', bg:'#4a1a5a', enemy:true, boss:true,
  hp:160, armor:32, atk:7, colors:['red','blue','green','yellow','purple'], manaCap:BOSS_MANA_CAP,
  skills:[
    { name:'暗影冲击',   cost:{blue:8},                          fx:'damageFront', v:18, desc:'对敌方造成 18 点伤害' },
    { name:'生命汲取',   cost:{purple:10},                       fx:'lifestealFront', v:16, v2:14, desc:'对敌方造成 16 点伤害并回复自身 14 点生命' },
    { name:'影刃风暴',   cost:{red:12},                          fx:'aoeDamage', v:16, desc:'对敌方造成 16 点伤害' },
    { name:'湮灭之光',   cost:{purple:16, blue:14, red:14},      fx:'pierceFront', v:44, desc:'对敌方造成 44 点真实伤害（无视护甲）' },
  ],
};

/* ===== 对手（1v1 单挑）===== */
const ENEMY_TEAMS = [
  { id:'baiqi',    name:'单挑 · 白起',   desc:'不朽战魂：高血高甲的正面硬仗', heroes:['baiqi'] },
  { id:'lanling',  name:'单挑 · 兰陵王', desc:'暗隐之刃：高攻刺客，速战速决', heroes:['lanling'] },
  { id:'zhongkui', name:'单挑 · 钟馗',   desc:'虚灵城判：吸蓝吸血，消耗流',   heroes:['zhongkui'] },
  { id:'mirror',   name:'镜像试炼',      desc:'随机 1 名英雄的镜像对决',      random:true },
  { id:'boss',     name:'主宰巢穴',      desc:'挑战暗影主宰（高难度 Boss 战）', heroes:['zhuzai'] },
];

function getHeroDef(id){
  return HERO_ROSTER.find(h=>h.id===id) || ENEMY_ROSTER.find(h=>h.id===id) || (id==='zhuzai' ? BOSS_HERO : null);
}
