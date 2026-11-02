'use strict';
/* ================= UI 渲染与交互 ================= */

/* 动画节奏：受 Battle.speed 影响（速度系数越大动画越快） */
const sleep=(ms)=>new Promise(r=>setTimeout(r,
  (typeof Battle!=='undefined'&&Battle.speed&&Battle.speed>1)?Math.max(16,ms/Battle.speed):ms));
const CELL=56;

function costPips(cost){
  return Object.entries(cost).map(([c,n])=>`<i class="pip t-${c}" title="${GEMS[c].name}">${n}</i>`).join('');
}
function costText(cost){
  return Object.entries(cost).map(([c,n])=>`${GEMS[c].icon}${n}`).join(' ');
}

const UI = {
  gemEls:new Map(), heroCardEls:new Map(), skillBtns:[], selected:null, _bannerT:null,

  init(){
    document.getElementById('btn-start').addEventListener('click',()=>App.showSelect());
    document.getElementById('btn-again').addEventListener('click',()=>{
      UI.showScreen('battle'); Battle.restart();
    });
    document.getElementById('btn-reselect').addEventListener('click',()=>App.showSelect());
  },

  showScreen(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
    document.getElementById('screen-'+id).classList.remove('hidden');
  },
  hname(h){ return (h.side==='enemy'?'敌方 ':'')+h.def.name; },

  /* ================= 选人界面 ================= */
  renderSelect(){
    const scr=document.getElementById('screen-select');
    scr.innerHTML=`
      <div class="select-wrap">
        <div class="select-left">
          <h2>选择 4 名英雄出战（点击加入，顺序即站位）</h2>
          <div class="roster-grid" id="roster-grid"></div>
        </div>
        <div class="select-right">
          <div class="side-box" id="hero-detail"><div class="hint">点击左侧英雄查看详情</div></div>
          <div class="side-box"><h3>出战阵容</h3><div id="team-slots"></div></div>
          <div class="side-box"><h3>选择对手</h3><div id="enemy-options"></div></div>
          <button id="btn-battle" class="btn big">开 始 战 斗</button>
        </div>
      </div>`;
    const grid=scr.querySelector('#roster-grid');
    HERO_ROSTER.forEach(def=>{
      const card=document.createElement('div');
      card.className='hero-card'; card.dataset.id=def.id;
      card.innerHTML=`
        <div class="hc-portrait" style="background:${def.bg}">${def.emoji}</div>
        <div class="hc-name">${def.name}</div>
        <div class="hc-role">${def.title} · ${def.role}</div>
        <div class="hc-stats">❤${def.hp} 🛡${def.armor} ⚔${def.atk}</div>
        <div class="hc-colors">${def.colors.map(c=>`<i class="color-dot" style="background:${GEMS[c].hex}" title="${GEMS[c].name}"></i>`).join('')}</div>`;
      card.addEventListener('click',()=>App.toggleHero(def.id));
      grid.appendChild(card);
    });
    const eo=scr.querySelector('#enemy-options');
    ENEMY_TEAMS.forEach(t=>{
      const b=document.createElement('button');
      b.className='enemy-opt'; b.dataset.id=t.id;
      b.innerHTML=`${t.name}<div class="eo-desc">${t.desc}</div>`;
      b.addEventListener('click',()=>App.setEnemyTeam(t.id));
      eo.appendChild(b);
    });
    scr.querySelector('#btn-battle').addEventListener('click',()=>App.startBattle());
    this.refreshSelect();
  },

  refreshSelect(){
    const scr=document.getElementById('screen-select');
    if(!scr.innerHTML) return;
    scr.querySelectorAll('.hero-card').forEach(card=>{
      const idx=App.selection.indexOf(card.dataset.id);
      card.classList.toggle('selected',idx>=0);
      let badge=card.querySelector('.badge');
      if(idx>=0){
        if(!badge){ badge=document.createElement('div'); badge.className='badge'; card.appendChild(badge); }
        badge.textContent=idx+1;
      } else if(badge) badge.remove();
    });
    const det=scr.querySelector('#hero-detail');
    const def=App.detailId?getHeroDef(App.detailId):null;
    if(def){
      det.innerHTML=`
        <div class="hd-head">
          <div class="hd-portrait" style="background:${def.bg}">${def.emoji}</div>
          <div><div class="hd-name">${def.name}</div><div class="hd-title">${def.title} · ${def.role}</div></div>
        </div>
        <div class="hd-stats">❤ 生命 ${def.hp} ｜ 🛡 护甲 ${def.armor} ｜ ⚔ 攻击 ${def.atk}<br>
          法力亲和：${def.colors.map(c=>GEMS[c].name).join(' / ')}</div>
        ${def.skills.map(sk=>`<div class="hd-skill"><b>${sk.name}</b>　<span class="cost-line">${costText(sk.cost)}</span><br>${sk.desc}</div>`).join('')}`;
    }
    const slots=scr.querySelector('#team-slots');
    slots.innerHTML='';
    for(let i=0;i<4;i++){
      const id=App.selection[i];
      const d=document.createElement('div');
      d.className='tslot'+(id?' filled':'');
      if(id){
        const hd=getHeroDef(id);
        d.innerHTML=`<span class="ts-emoji">${hd.emoji}</span><span>${hd.name}</span><span class="ts-pos">${i===0?'前排':'第 '+(i+1)+' 位'}</span>`;
      } else d.innerHTML=`<span class="ts-emoji">＋</span><span>空位</span>`;
      d.addEventListener('click',()=>App.removeHero(i));
      slots.appendChild(d);
    }
    scr.querySelectorAll('.enemy-opt').forEach(b=>b.classList.toggle('on',b.dataset.id===App.enemyTeam));
    const btn=scr.querySelector('#btn-battle');
    if(btn) btn.disabled=App.selection.length!==4;
  },

  /* ================= 战斗界面 ================= */
  buildBattleScreen(st){
    this.gemEls.clear(); this.heroCardEls.clear(); this.skillBtns=[]; this.selected=null;
    const scr=document.getElementById('screen-battle');
    scr.innerHTML=`
      <div class="battle-wrap" id="battle-root" style="--boardw:${CELL*8+4}px">
        <div class="battle-top">
          <span class="vs">我方 vs ${st.enemyTeam.name}</span>
          <span class="turninfo" id="turn-info"></span>
          <button class="btn small" id="btn-concede">投 降</button>
        </div>
        <div class="battle-layout">
          <div class="team-panel" id="panel-player"></div>
          <div class="board-col">
            <div class="board-head" id="board-head"></div>
            <div class="board-wrap">
              <div id="board"></div>
              <div class="banner hidden" id="banner"></div>
            </div>
            <div class="log" id="log"></div>
          </div>
          <div class="team-panel enemy-side" id="panel-enemy"></div>
        </div>
      </div>`;
    document.getElementById('btn-concede').addEventListener('click',()=>{
      const st2=Battle.state;
      if(st2&&!st2.over){ st2.over=true; st2.winner='enemy'; UI.showResult(false); }
    });
    this.buildTeamPanel('player',st.teams.player);
    this.buildTeamPanel('enemy',st.teams.enemy);
    this.rebuildBoard();
  },

  buildTeamPanel(side,heroes){
    const panel=document.getElementById('panel-'+side);
    panel.innerHTML=`<div class="panel-title">${side==='player'?'⚔ 我方队伍':'☠ 敌方队伍'}</div>`;
    const rows=document.createElement('div');
    heroes.forEach(h=>{
      const row=document.createElement('div');
      row.className='hero-row';
      row.innerHTML=`
        <div class="hr-portrait" style="background:${h.def.bg}">${h.def.emoji}</div>
        <div class="hr-main">
          <div class="hr-name">${h.def.name}<span class="hr-role">${h.def.role}</span><span class="hr-atk">⚔${h.atk}</span></div>
          <div class="bar hp"><div class="bar-fill" style="width:100%"></div><span></span></div>
          <div class="bar armor"><div class="bar-fill" style="width:100%"></div><span></span></div>
          <div class="mana-bars">${h.def.colors.map(c=>`<div class="mana-bar mb-${c}"><div class="mb-fill" style="width:0%"></div><span>0</span></div>`).join('')}</div>
        </div>`;
      rows.appendChild(row);
      this.heroCardEls.set(h,row);
    });
    panel.appendChild(rows);
    const title=document.createElement('div');
    title.className='skills-title'; title.textContent='技 能';
    panel.appendChild(title);
    heroes.forEach(h=>{
      const tag=document.createElement('div');
      tag.className='skill-hero-tag'; tag.textContent=`— ${h.def.name} —`;
      panel.appendChild(tag);
      h.def.skills.forEach((sk,i)=>{
        const btn=document.createElement('div');
        btn.className='skill-btn';
        btn.innerHTML=`<span class="sk-name" title="${sk.desc}">${sk.name}</span><span class="sk-cost">${costPips(sk.cost)}</span>`;
        if(side==='player') btn.addEventListener('click',()=>Battle.doCast('player',h,i));
        panel.appendChild(btn);
        this.skillBtns.push({hero:h, idx:i, el:btn});
      });
    });
  },

  /* ---------- 英雄面板 ---------- */
  syncHero(h){
    const row=this.heroCardEls.get(h); if(!row) return;
    row.classList.toggle('dead',!h.alive);
    const bars=row.querySelectorAll('.bar');
    const hpBar=bars[0], arBar=bars[1];
    hpBar.querySelector('.bar-fill').style.width=(h.hp/h.maxHp*100)+'%';
    hpBar.querySelector('span').textContent=`❤ ${h.hp}/${h.maxHp}`;
    arBar.querySelector('.bar-fill').style.width=Math.min(100,h.armor/(h._armorMax||10)*100)+'%';
    arBar.querySelector('span').textContent=`🛡 ${h.armor}`;
    const mbars=row.querySelectorAll('.mana-bar');
    h.def.colors.forEach((c,i)=>{
      const m=mbars[i];
      m.querySelector('.mb-fill').style.width=(h.mana[c]/h.manaCap*100)+'%';
      m.querySelector('span').textContent=h.mana[c];
    });
    row.querySelector('.hr-atk').textContent='⚔'+h.atk;
  },

  syncAll(){
    const st=Battle.state; if(!st) return;
    for(const side of ['player','enemy']){
      for(const h of st.teams[side]) this.syncHero(h);
    }
    this.refreshSkills();
    this.syncHeader();
  },

  refreshSkills(){
    const st=Battle.state; if(!st) return;
    for(const {hero,idx,el} of this.skillBtns){
      const sk=hero.def.skills[idx];
      el.classList.toggle('ready',Battle.canCast(hero,sk)&&!st.over);
      el.classList.toggle('enemy-skill',hero.side==='enemy');
    }
  },

  syncHeader(){
    const st=Battle.state; if(!st) return;
    const txt=`回合 ${st.turnNo} · ${st.turn==='player'?'你的回合':'敌方回合'}`;
    const head=document.getElementById('board-head');
    const info=document.getElementById('turn-info');
    if(head){ head.textContent=txt; head.classList.toggle('enemy',st.turn==='enemy'); }
    if(info){ info.textContent=txt; info.className='turninfo '+(st.turn==='player'?'player':'enemy'); }
    const pp=document.getElementById('panel-player'), pe=document.getElementById('panel-enemy');
    if(pp) pp.classList.toggle('active',st.turn==='player'&&!st.over);
    if(pe) pe.classList.toggle('active',st.turn==='enemy'&&!st.over);
  },

  lockInput(b){
    const root=document.getElementById('battle-root');
    if(root) root.classList.toggle('locked',b);
  },

  /* ---------- 棋盘 ---------- */
  rebuildBoard(){
    const boardEl=document.getElementById('board');
    boardEl.innerHTML='';
    this.gemEls.clear();
    const st=Battle.state;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c]; g.r=r; g.c=c;
      this.createGemEl(g);
    }
  },

  createGemEl(g, fromRow){
    const el=document.createElement('div');
    el.dataset.gid=g.id;
    const startRow=(fromRow!==undefined&&fromRow!==null)?fromRow:g.r;
    el.style.left=(g.c*CELL)+'px';
    el.style.top=(startRow*CELL)+'px';
    el.innerHTML=`<div class="inner"><span>${GEMS[g.type].icon}</span></div>`;
    this.applyGemClass(g,el);
    el.addEventListener('click',()=>this.onGemClick(g));
    document.getElementById('board').appendChild(el);
    this.gemEls.set(g.id,el);
    if(startRow!==g.r){
      /* 双 rAF 触发过渡；setTimeout 作兜底（页面被遮挡时 rAF 可能不触发） */
      const settle=()=>{ el.style.top=(g.r*CELL)+'px'; };
      requestAnimationFrame(()=>requestAnimationFrame(settle));
      setTimeout(settle, 80);
    }
    return el;
  },

  applyGemClass(g,el){
    el.className=`gem t-${g.type}${g.doom?' doom':''}`;
    el.querySelector('.inner span').textContent=GEMS[g.type].icon;
  },

  updateGemEl(g){
    const el=this.gemEls.get(g.id);
    if(el) this.applyGemClass(g,el);
  },

  removeGemEl(g){
    const el=this.gemEls.get(g.id);
    if(el){ el.remove(); this.gemEls.delete(g.id); }
  },

  syncBoard(spawned=[]){
    const st=Battle.state;
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const g=st.board[r][c]; if(!g) continue;
      let el=this.gemEls.get(g.id);
      if(!el){
        if(spawned.includes(g)) this.createGemEl(g,g.spawnRow);
        else this.createGemEl(g);
      } else {
        el.style.left=(g.c*CELL)+'px';
        el.style.top=(g.r*CELL)+'px';
      }
    }
  },

  popGroups(groups){
    for(const grp of groups){
      for(const [r,c] of grp.cells){
        const g=Battle.state.board[r][c];
        const el=g&&this.gemEls.get(g.id);
        if(el) el.classList.add('pop');
      }
    }
  },

  onGemClick(g){
    const st=Battle.state;
    if(!st||st.busy||st.over||st.turn!=='player') return;
    if(!this.selected){ this.selected=g; this.paintSelection(); return; }
    if(this.selected===g){ this.selected=null; this.paintSelection(); return; }
    if(areAdjacent(this.selected,g)){
      const a=this.selected;
      this.selected=null; this.paintSelection();
      Battle.playerSwap(a,g);
    } else {
      this.selected=g; this.paintSelection();
    }
  },

  paintSelection(){
    for(const el of this.gemEls.values()) el.classList.remove('sel');
    if(this.selected){
      const el=this.gemEls.get(this.selected.id);
      if(el) el.classList.add('sel');
    }
  },
  clearSelection(){ this.selected=null; this.paintSelection(); },

  /* ---------- 提示 ---------- */
  banner(text){
    const b=document.getElementById('banner');
    if(!b) return;
    b.classList.remove('hidden');
    b.innerHTML=`<span>${text}</span>`;
    clearTimeout(this._bannerT);
    this._bannerT=setTimeout(()=>b.classList.add('hidden'),1250);
  },

  float(h,text,cls){
    const row=this.heroCardEls.get(h);
    if(!row) return;
    const span=document.createElement('span');
    span.className='float '+cls;
    span.textContent=text;
    row.appendChild(span);
    setTimeout(()=>span.remove(),1250);
  },

  log(text,cls=''){
    const el=document.getElementById('log');
    if(!el) return;
    const line=document.createElement('div');
    if(cls) line.className=cls;
    line.textContent=text;
    el.appendChild(line);
    while(el.childNodes.length>80) el.removeChild(el.firstChild);
    el.scrollTop=el.scrollHeight;
  },

  showResult(win){
    const t=document.getElementById('result-title');
    t.textContent=win?'胜 利 ！':'战 败 …';
    t.className=win?'win':'lose';
    document.getElementById('result-sub').textContent=win
      ?'你击败了对手，峡谷因你而颤抖！'
      :'胜败乃兵家常事，重新组队再战！';
    this.showScreen('result');
  },
};
