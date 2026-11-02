/* 棋盘逻辑冒烟测试（与 data.js / board.js 拼接后用 node 运行） */
let fails=0;
function assert(cond,msg){
  if(cond) console.log('ok  -',msg);
  else { console.error('FAIL -',msg); fails++; }
}

/* 1. 棋盘生成 */
for(let i=0;i<20;i++){
  const b=newBoard();
  if(b.length!==ROWS||b[0].length!==COLS){ assert(false,'board size'); break; }
  if(findGroups(b).length!==0){ assert(false,'init board no matches'); break; }
  if(!hasAnyMove(b)){ assert(false,'init board has move'); break; }
  if(i===19) assert(true,'board gen x20 valid (size/no-match/has-move)');
}

/* 无匹配底板：(r+c)%4 交错花纹，保证相邻宝石都不同色 */
const BASE4=['blue','purple','green','yellow'];
function patternBoard(){
  const g=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>makeGem('blue',0,0)));
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){ g[r][c].r=r; g[r][c].c=c; g[r][c].type=BASE4[(r+c)%4]; }
  return g;
}

/* 2. L 形合并：横 3 + 竖 3 共享一角 → 1 组 5 格 */
const g2=patternBoard();
g2[0][0].type='red'; g2[0][1].type='red'; g2[0][2].type='red';
g2[1][2].type='red'; g2[2][2].type='red';
const groups2=findGroups(g2);
assert(groups2.length===1&&groups2[0].cells.length===5&&groups2[0].type==='red','L-shape merged into 1 group of 5');

/* 3. 十字形：横竖交叉共享中心 → 1 组 */
const g3=patternBoard();
g3[3][2].type='red'; g3[3][3].type='red'; g3[3][4].type='red';
g3[2][3].type='red'; g3[4][3].type='red';
const groups3=findGroups(g3);
assert(groups3.length===1&&groups3[0].cells.length===5,'cross merged into 1 group of 5');

/* 4. 两条独立横排 → 2 组 */
const g4=patternBoard();
g4[0][0].type='red'; g4[0][1].type='red'; g4[0][2].type='red';
g4[6][3].type='green'; g4[6][4].type='green'; g4[6][5].type='green';
const groups4=findGroups(g4);
assert(groups4.length===2,'two independent runs = 2 groups');

/* 5. resolveSim：3 骷髅 → skullDmg = 3*perSkull */
const t5=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>'blue'));
t5[0][0]='skull'; t5[0][1]='skull'; t5[0][2]='skull';
const sim5=resolveSim(t5,5);
assert(sim5.skullDmg>=15,'resolveSim skull damage >= 15 (3 skulls * atk5)');

/* 6. resolveSim：4 连红 → 额外回合 + 法力4 */
const t6=Array.from({length:ROWS},()=>Array.from({length:COLS},(c,r)=>((r+c)%2===0)?'yellow':'purple'));
t6[0][0]='red'; t6[0][1]='red'; t6[0][2]='red'; t6[0][3]='red';
const sim6=resolveSim(t6,4);
assert(sim6.extraTurn===true,'resolveSim 4-match gives extra turn');
assert(sim6.mana.red>=4,'resolveSim 4-match gives >=4 red mana');

/* 7. 洗牌后合法 */
const g7=newBoard();
shuffleBoard(g7);
assert(findGroups(g7).length===0,'shuffle keeps no initial matches');
assert(hasAnyMove(g7),'shuffle keeps a move available');

/* 8. swapGems 维护 r/c */
const g8=newBoard();
const a=g8[0][0], b=g8[0][1];
swapGems(g8,a,b);
assert(g8[0][0]===b&&g8[0][1]===a&&a.c===1&&b.c===0,'swapGems maintains r/c');

/* 9. 数据完整性 */
assert(HERO_ROSTER.length===8,'8 playable heroes');
assert(ENEMY_ROSTER.length===4,'4 enemy heroes');
for(const h of [...HERO_ROSTER,...ENEMY_ROSTER,BOSS_HERO]){
  const ok=h.id&&h.name&&h.hp>0&&h.skills&&h.skills.length>=3
    &&h.skills.every(s=>s.name&&s.fx&&FX[s.fx]&&s.cost&&Object.keys(s.cost).length>0);
  if(!ok){ assert(false,'hero def complete: '+h.id); break; }
  if(h===BOSS_HERO) assert(true,'hero defs complete (incl boss)');
}
assert(getHeroDef('zhuzai')===BOSS_HERO,'getHeroDef finds boss');

console.log(fails===0?'\nALL PASSED':`\n${fails} FAILED`);
process.exitCode=fails===0?0:1;
