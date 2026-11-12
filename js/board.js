'use strict';
/* ================= 棋盘核心逻辑（纯逻辑，无 DOM 依赖） =================
 * 棋盘 grid[r][c] 为宝石对象 {id,type,doom,r,c} 或纯类型字符串（模拟用） */

let __gemId = 1;

function randGemType(){
  const total = Object.values(REFILL_WEIGHTS).reduce((a,b)=>a+b,0);
  let x = rand()*total;
  for (const [k,w] of Object.entries(REFILL_WEIGHTS)){ x-=w; if (x<0) return k; }
  return 'red';
}
function makeGem(type, r, c){ return { id:__gemId++, type, doom:false, r, c }; }

/* 放置 type 于 (r,c) 时是否与左侧/上方形成 3 连（用于生成无初始匹配的棋盘） */
function pairMatchAt(grid, r, c, t){
  if (c>=2 && cellType(grid[r][c-1])===t && cellType(grid[r][c-2])===t) return true;
  if (r>=2 && cellType(grid[r-1][c])===t && cellType(grid[r-2][c])===t) return true;
  return false;
}

function cellType(g){ return typeof g==='string' ? g : g.type; }

function newBoard(){
  let grid=null;
  for (let attempt=0; attempt<60; attempt++){
    grid=[];
    for (let r=0;r<ROWS;r++){
      const row=[];
      for (let c=0;c<COLS;c++){
        let t, guard=0;
        do { t=randGemType(); guard++; } while (guard<24 && pairMatchAt(grid.concat([row]), r, c, t));
        row.push(makeGem(t,r,c));
      }
      grid.push(row);
    }
    if (hasAnyMove(grid)) return grid;
  }
  return grid; // 理论上极少走到
}

/* ---------- 匹配检测 ---------- */
/* 返回 [{type, cells:[[r,c],...]}]，L/T 形合并为一组 */
function findGroups(grid){
  const runs=[];
  for (let r=0;r<ROWS;r++){
    let c=0;
    while (c<COLS){
      const t=cellType(grid[r][c]); let e=c+1;
      while (e<COLS && cellType(grid[r][e])===t) e++;
      if (e-c>=3){ const cells=[]; for(let i=c;i<e;i++) cells.push([r,i]); runs.push({type:t, cells}); }
      c=e;
    }
  }
  for (let c=0;c<COLS;c++){
    let r=0;
    while (r<ROWS){
      const t=cellType(grid[r][c]); let e=r+1;
      while (e<ROWS && cellType(grid[e][c])===t) e++;
      if (e-r>=3){ const cells=[]; for(let i=r;i<e;i++) cells.push([i,c]); runs.push({type:t, cells}); }
      r=e;
    }
  }
  // 合并共享格子的 run
  const groups=[]; const owner=new Map();
  const key=(r,c)=>r*COLS+c;
  for (const run of runs){
    let target=null;
    for (const [r,c] of run.cells){ const g=owner.get(key(r,c)); if (g){ target=g; break; } }
    if (!target){ target={type:run.type, cells:new Set()}; groups.push(target); }
    for (const [r,c] of run.cells){
      const prev=owner.get(key(r,c));
      if (prev && prev!==target){
        for (const k of prev.cells){ target.cells.add(k); owner.set(k, target); }
        prev.cells.clear();
      }
      target.cells.add(key(r,c)); owner.set(key(r,c), target);
    }
  }
  return groups
    .filter(g=>g.cells.size>0)
    .map(g=>({ type:g.type, cells:[...g.cells].map(k=>[Math.floor(k/COLS), k%COLS]) }));
}

/* (r,c) 处交换后是否成 3 连（只检查穿过该点的横竖线） */
function matchAtCell(grid, r, c){
  const t=cellType(grid[r][c]); if (!t) return false;
  let n=1;
  for (let i=c-1;i>=0 && cellType(grid[r][i])===t;i--) n++;
  for (let i=c+1;i<COLS && cellType(grid[r][i])===t;i++) n++;
  if (n>=3) return true;
  n=1;
  for (let i=r-1;i>=0 && cellType(grid[i][c])===t;i--) n++;
  for (let i=r+1;i<ROWS && cellType(grid[i][c])===t;i++) n++;
  return n>=3;
}

function hasAnyMove(grid){
  const swap=(a,b)=>{ const t=grid[a[0]][a[1]]; grid[a[0]][a[1]]=grid[b[0]][b[1]]; grid[b[0]][b[1]]=t; };
  for (let r=0;r<ROWS;r++){
    for (let c=0;c<COLS;c++){
      if (c<COLS-1){
        swap([r,c],[r,c+1]);
        const ok=matchAtCell(grid,r,c)||matchAtCell(grid,r,c+1);
        swap([r,c],[r,c+1]);
        if (ok) return true;
      }
      if (r<ROWS-1){
        swap([r,c],[r+1,c]);
        const ok=matchAtCell(grid,r,c)||matchAtCell(grid,r+1,c);
        swap([r,c],[r+1,c]);
        if (ok) return true;
      }
    }
  }
  return false;
}

/* 洗牌：重排宝石类型，保证无初始匹配且有可行步 */
function shuffleBoard(grid){
  for (let attempt=0; attempt<80; attempt++){
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const g=grid[r][c];
        let t, guard=0;
        do { t=randGemType(); guard++; } while (guard<24 && pairMatchAt(grid, r, c, t));
        g.type=t; g.doom=false;
      }
    }
    if (hasAnyMove(grid)) return true;
  }
  return true;
}

/* ---------- 下落与补充（字符串棋盘用） ---------- */
function collapseTypes(g){
  for (let c=0;c<COLS;c++){
    let write=ROWS-1;
    for (let r=ROWS-1;r>=0;r--){
      if (g[r][c]){ g[write][c]=g[r][c]; write--; }
    }
    for (let r=write;r>=0;r--) g[r][c]=randGemType();
  }
}

/* ---------- 模拟结算（AI 评估用，纯类型棋盘） ---------- */
function resolveSim(types, perSkull){
  const g=types.map(row=>row.slice());
  let extraTurn=false, cascades=0, skullDmg=0, dooms=0;
  const mana={red:0,blue:0,green:0,yellow:0,purple:0};
  while (true){
    const groups=findGroups(g);
    if (!groups.length) break;
    cascades++;
    for (const grp of groups){
      const n=grp.cells.length;
      if (grp.type==='skull'){
        const mult = n>=5?3 : n>=4?2 : 1;
        skullDmg += n*perSkull*mult;
      } else {
        mana[grp.type]+=n;
        if (n>=4) extraTurn=true;
        if (n>=5) dooms++;
      }
      for (const [r,c] of grp.cells) g[r][c]=null;
    }
    collapseTypes(g);
  }
  return { mana, skullDmg, extraTurn, cascades, dooms };
}

function typesOf(grid){
  return grid.map(row=>row.map(g=>cellType(g)));
}

/* 交换棋盘上两个宝石（宝石对象，含 r/c 属性维护） */
function swapGems(grid, a, b){
  grid[a.r][a.c]=b; grid[b.r][b.c]=a;
  const tr=a.r, tc=a.c;
  a.r=b.r; a.c=b.c; b.r=tr; b.c=tc;
}
function areAdjacent(a, b){
  return Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;
}
