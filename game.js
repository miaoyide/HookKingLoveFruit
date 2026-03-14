const TIMELINE = [
  { type:'king',   start:0,     end:11.0  },
  { type:'rapper', start:11.1,  end:12.59 },
  { type:'fruit', start:12.6,  end:13.49, fruit:0 }, // 橘子
  { type:'fruit', start:13.5,  end:14.09, fruit:1 }, // 西瓜
  { type:'fruit', start:14.1,  end:14.74, fruit:2 }, // 荔枝
  { type:'fruit', start:14.75, end:15.39, fruit:3 }, // 蘋果
  { type:'rapper', start:16.2,  end:17.59 },
  { type:'fruit', start:17.6,  end:18.46, fruit:0 }, // 橘子
  { type:'fruit', start:18.47, end:19.19, fruit:1 }, // 西瓜
  { type:'fruit', start:19.2,  end:19.94, fruit:2 }, // 荔枝
  { type:'fruit', start:19.95, end:20.59, fruit:3 }, // 蘋果
  { type:'king',  start:20.6,  end:24.99 },
];
const FRUITS = [
  { label:'橘子', emoji:'🍊' },
  { label:'西瓜', emoji:'🍉' },
  { label:'荔枝', emoji:'🍈' },
  { label:'蘋果', emoji:'🍎' },
];
const RATES = [1, 1.25, 1.5];   // 3 關
const BPM   = 120;
const ROUND_DURATION = 24.99;
const MAX_ROUND = 3;

let score=0, round=1, startRound=1, rate=1.0, gameActive=false, paused=false;
let devMode=false;
let lastAppleTapped=false; // 第二次蘋果是否已按到
let seamlessTriggered=false; // 無縫換關是否已觸發
let lastPhaseIdx=-1, currentPhase=null, phaseTapped=false;
let fruitSeqIdx=0; // 第一關：下一個應出現的水果 index (0=橘子,1=西瓜,2=荔枝,3=蘋果)
let beatTimer=null, fruitTimer=null, pollTimer=null, timerRaf=null;
let kingImg=null;
let devBarDragging=false;

const bgm = document.getElementById('bgm');

// ── 工具 ──
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showGameScreen(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('game-screen').classList.add('active');
}
function resetAnim(el,anim){ el.style.animation='none'; el.offsetHeight; el.style.animation=anim; }

// ── 開發者模式：回首頁 ──
function devGoHome(){
  stopAll();
  showScreen('start-screen');
}

// ── 開發者模式 ──
function toggleDevMode(){
  devMode = !devMode;
  document.body.classList.toggle('dev-mode', devMode);
  const btn = document.getElementById('btn-devmode');
  btn.classList.toggle('active', devMode);
  btn.textContent = devMode ? '🛠 開發者模式（開啟中）' : '🛠 開發者模式';
  // 顯示/隱藏 pause modal 裡的選關
  const sel = document.getElementById('dev-round-select');
  if(sel) sel.style.display = devMode ? 'flex' : 'none';
}

// ── 選關 ──
function selectRound(r){
  stopAll();
  startRound=r; round=r; rate=RATES[r-1];
  lastAppleTapped=false;
  startCountdown(false);
}

// ── 暫停 ──
function togglePause(){
  if(!devMode) return; // 只有開發者模式可暫停
  if(!gameActive && !paused) return;
  if(paused){
    paused=false;
    document.getElementById('pause-overlay').classList.remove('active');
    bgm.play().catch(()=>{});
    startPoll();
    if(currentPhase && currentPhase.type==='king') enterKingPhase(true);
  } else {
    paused=true;
    bgm.pause();
    clearInterval(beatTimer); beatTimer=null;
    clearInterval(pollTimer); pollTimer=null;
    clearTimeout(fruitTimer); fruitTimer=null;
    document.getElementById('pause-overlay').classList.add('active');
  }
}
document.addEventListener('keydown', e=>{
  if(e.code==='Space'){ e.preventDefault(); togglePause(); }
});

// ── 倒數 ──
function startCountdown(isNewRound){
  stopAll();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const overlay=document.getElementById('countdown-overlay');
  overlay.classList.add('active');
  const numEl=document.getElementById('countdown-num');
  const speedLabels={1:'1x',1.25:'1.25x',1.5:'1.5x'};
  document.getElementById('countdown-msg').textContent = isNewRound
    ? '第 '+round+' 關 ── '+speedLabels[rate]
    : '第 '+round+' 關 ── '+speedLabels[rate];
  let c=3; numEl.textContent=c; resetAnim(numEl,'countPop .8s ease-out');
  const tick=setInterval(()=>{
    c--;
    if(c>0){ resetAnim(numEl,'countPop .8s ease-out'); numEl.textContent=c; }
    else{ clearInterval(tick); overlay.classList.remove('active'); startGame(); }
  },900);
}

// ── 開始遊戲 ──
function startGame(){
  if(round===startRound){ score=0; fruitSeqIdx=0; lastAppleTapped=false; }
  seamlessTriggered=false;
  document.getElementById('next-round-hint').classList.remove('active');
  document.getElementById('card-area').style.display='';
  gameActive=true; paused=false;
  lastPhaseIdx=-1; currentPhase=null; phaseTapped=false;
  updateHUD(); showGameScreen();
  document.getElementById('dev-bar-range').value=0;
  document.getElementById('dev-bar-fill').style.width='0%';
  document.getElementById('dev-time-label').textContent='0.00s / '+ROUND_DURATION+'s';

  bgm.playbackRate = rate;

  let pollStarted = false;
  function doStart(){
    if(pollStarted) return;
    pollStarted = true;
    bgm.play().catch(()=>{});
    startPoll();
  }
  // 等 seek 完成確保 currentTime 歸零
  bgm.addEventListener('seeked', doStart, {once:true});
  bgm.currentTime = 0;
  // 若 currentTime 已是 0 不會觸發 seeked，延遲一 tick 手動啟動
  setTimeout(()=>{ if(!pollStarted) doStart(); }, 50);
}

function stopAll(){
  gameActive=false; paused=false;
  clearInterval(beatTimer); beatTimer=null;
  clearTimeout(fruitTimer); fruitTimer=null;
  clearInterval(pollTimer); pollTimer=null;
  cancelAnimationFrame(timerRaf); timerRaf=null;
  bgm.pause(); bgm.currentTime=0;
  document.getElementById('pause-overlay').classList.remove('active');
}

// ── dev bar 更新（由 poll 驅動）──
function updateDevBar(){
  if(!devMode) return;
  const bgmT = Math.min(bgm.currentTime, ROUND_DURATION);
  // 真實秒數顯示（bgm = 實際播放秒數，rawT = bgm × rate 僅供參考）
  document.getElementById('dev-bgm-t').textContent = bgmT.toFixed(3);
  document.getElementById('dev-raw-t').textContent = (bgm.currentTime * rate).toFixed(3);
  document.getElementById('dev-rate').textContent  = rate;
  if(devBarDragging) return;
  const pos = bgmT / ROUND_DURATION;
  document.getElementById('dev-bar-range').value = Math.floor(bgmT*100);
  document.getElementById('dev-bar-fill').style.width = (pos*100)+'%';
  document.getElementById('dev-time-label').textContent = bgmT.toFixed(2)+'s / '+ROUND_DURATION+'s';
}

// ── 主輪詢 ──
function startPoll(){
  clearInterval(pollTimer);
  pollTimer = setInterval(()=>{
    if(!gameActive || paused) return;
    updateDevBar();
    const bgmT = bgm.currentTime; // 直接用 bgm 時間比對 TIMELINE

    // bgm 21 秒後，若蘋果已按到，顯示提示
    if(bgmT >= 21 && lastAppleTapped && !seamlessTriggered && round < MAX_ROUND){
      seamlessTriggered = true;
      document.getElementById('card-area').style.display='none';
      document.getElementById('next-round-hint').classList.add('active');
    }

    // bgm 24 秒：無縫切換到下一關
    if(bgmT >= 24 && seamlessTriggered && round < MAX_ROUND){
      const nextRound = round + 1;
      const nextRate  = RATES[nextRound - 1];
      // seek 回 0 並切換速度
      bgm.playbackRate = nextRate;
      bgm.currentTime  = 0;
      // 重置狀態
      round = nextRound;
      rate  = nextRate;
      fruitSeqIdx = 0;
      lastPhaseIdx = -1; currentPhase = null;
      phaseTapped = false; currentLayout = null;
      lastAppleTapped = false; seamlessTriggered = false;
      updateHUD();
      // 隱藏提示，恢復卡片區
      document.getElementById('next-round-hint').classList.remove('active');
      document.getElementById('card-area').style.display='';
    }

    if(bgmT >= ROUND_DURATION){
      clearInterval(pollTimer);
      endRound();
      return;
    }
    let idx=-1;
    for(let i=0;i<TIMELINE.length;i++){
      if(bgmT>=TIMELINE[i].start && bgmT<TIMELINE[i].end){ idx=i; break; }
    }
    if(idx===-1 || idx===lastPhaseIdx) return;

    // 離開上一個 fruit phase 時，檢查有沒有按到
    if(lastPhaseIdx !== -1 && TIMELINE[lastPhaseIdx].type === 'fruit'){
      if(currentLayout && currentLayout.hasAnswer && !phaseTapped){
        triggerGameOver('超時！沒有按到正確的水果');
        return;
      }
    }

    lastPhaseIdx=idx;
    const phase=TIMELINE[idx];
    currentPhase=phase;
    if(phase.type==='king' || phase.type==='rapper') enterCharPhase(phase.type, false);
    else enterFruitPhase(phase.fruit);
  },20);
}

// ── 角色 phase（king / rapper）──
function enterCharPhase(type, resuming){
  if(!resuming){ clearTimeout(fruitTimer); fruitTimer=null; phaseTapped=false; currentLayout=null; }
  clearInterval(beatTimer);
  renderCards(type, null);
  if(type==='king'){
    const ms=(60/BPM/rate)*1000;
    beatTimer=setInterval(()=>{
      if(!gameActive||paused){ clearInterval(beatTimer); return; }
      document.querySelectorAll('.game-card').forEach(card=>{
        card.style.setProperty('--beat-dur',(ms*0.85)+'ms');
        card.classList.remove('beat-anim'); card.offsetHeight; card.classList.add('beat-anim');
      });
    },ms);
  }
  // rapper：靜態，不啟動 beatTimer
}
// 舊名稱保留相容
function enterKingPhase(resuming){ enterCharPhase('king', resuming); }

// ── 水果 phase ──
let currentLayout = null; // poll 用來檢查是否超時

function enterFruitPhase(fruitIndex){
  clearInterval(beatTimer); beatTimer=null;
  clearTimeout(fruitTimer); fruitTimer=null;
  phaseTapped=false;

  const layout = buildLayout(fruitIndex);
  currentLayout = layout; // 存給 poll 檢查
  renderCards('fruit', layout);
}

// ── 產生關卡佈局 ──
function buildLayout(correctFruitIndex){
  const fruit = FRUITS[correctFruitIndex];
  // 第一關：照順序，一定有答案，只顯示一張（就是正確的那張）
  if(round===1){
    const seqFruit = FRUITS[fruitSeqIdx % FRUITS.length];
    fruitSeqIdx++; // 進入 phase 時就推進，不等玩家點擊
    return { cards:[{ fruit:seqFruit, isAnswer:true }], hasAnswer:true };
  }
  // 第二關：兩張，一定有正確答案
  if(round===2){
    const otherIdx = pickOther([correctFruitIndex],1);
    const cards = shuffle([
      {fruit:fruit, isAnswer:true},
      {fruit:FRUITS[otherIdx[0]], isAnswer:false}
    ]);
    return {cards, hasAnswer:true};
  }
  // 第三關：四張，一定有正確答案
  if(round===3){
    const others = pickOther([correctFruitIndex],3);
    const cards = shuffle([
      {fruit:fruit, isAnswer:true},
      ...others.map(i=>({fruit:FRUITS[i],isAnswer:false}))
    ]);
    return {cards, hasAnswer:true};
  }
  return {cards:[{fruit, isAnswer:true}], hasAnswer:true};
}

function pickOther(exclude, count){
  const pool=[0,1,2,3].filter(i=>!exclude.includes(i));
  const res=[];
  while(res.length<count){ res.push(pool[Math.floor(Math.random()*pool.length)]); }
  return res;
}
function shuffle(arr){ return [...arr].sort(()=>Math.random()-.5); }

// ── 渲染卡片 ──
function renderCards(type, layout){
  const area = document.getElementById('card-area');
  area.innerHTML='';

  if(type==='king'){
    const card=makeCard('king-mode','card-single',{charType:'king'},false);
    area.appendChild(card);
    return;
  }
  if(type==='rapper'){
    const card=makeCard('rapper-mode','card-single',{charType:'rapper'},false);
    area.appendChild(card);
    return;
  }

  const cards=layout.cards;
  if(cards.length===1){
    const card=makeCard('fruit-mode','card-single',cards[0],layout.hasAnswer);
    area.appendChild(card);
  } else if(cards.length===2){
    const row=document.createElement('div');
    row.className='card-row';
    cards.forEach(c=>row.appendChild(makeCard('fruit-mode','card-double',c,layout.hasAnswer)));
    area.appendChild(row);
  } else {
    const row1=document.createElement('div'); row1.className='card-row';
    const row2=document.createElement('div'); row2.className='card-row';
    cards.slice(0,2).forEach(c=>row1.appendChild(makeCard('fruit-mode','card-quad',c,layout.hasAnswer)));
    cards.slice(2,4).forEach(c=>row2.appendChild(makeCard('fruit-mode','card-quad',c,layout.hasAnswer)));
    area.appendChild(row1);
    area.appendChild(row2);
  }
}

function makeCard(modeClass, sizeClass, cardData, hasAnswer){
  const div=document.createElement('div');
  div.className='game-card '+modeClass+' '+sizeClass;
  if(modeClass==='king-mode'){
    const img=document.createElement('img');
    img.src=kingImg||'images/rapper-normal.jpg'; img.className='card-king-img';
    div.appendChild(img);
  } else if(modeClass==='rapper-mode'){
    const img=document.createElement('img');
    img.src='images/rapper-singing.jpg'; img.className='card-king-img';
    div.appendChild(img);
  } else {
    const span=document.createElement('span');
    span.className='card-emoji'; span.textContent=cardData.fruit.emoji;
    div.appendChild(span);
    div.addEventListener('click', ()=>onCardTap(div, cardData.isAnswer, hasAnswer));
    div.addEventListener('touchstart', (e)=>{ e.preventDefault(); onCardTap(div, cardData.isAnswer, hasAnswer); },{passive:false});
  }
  return div;
}

// ── 點擊卡片 ──
function onCardTap(cardEl, isAnswer, hasAnswer){
  if(!gameActive||paused||phaseTapped) return;
  if(!hasAnswer){
    // 沒有答案卻按了 → Game Over
    cardEl.classList.add('flash-bad');
    triggerGameOver('錯誤！沒有正確答案時不應該按');
    return;
  }
  if(isAnswer){
    phaseTapped=true;
    clearTimeout(fruitTimer);
    cardEl.classList.add('flash-good');
    score+=30; updateHUD();
    // 第二次蘋果（TIMELINE idx 9）按到 → 記錄
    if(lastPhaseIdx === 9) lastAppleTapped=true;
  } else {
    // 按了錯的
    cardEl.classList.add('flash-bad');
    triggerGameOver('按錯了！');
  }
}

// ── Game Over ──
function triggerGameOver(_reason){
  if(!gameActive) return;
  if(devMode) return; // 開發者模式：無敵，忽略所有死亡
  stopAll();
  showScreen('start-screen');
}

// ── 結束一輪 ──
function endRound(){
  if(!gameActive) return;
  clearInterval(beatTimer); beatTimer=null;
  clearTimeout(fruitTimer); fruitTimer=null;
  gameActive=false;
  bgm.pause(); bgm.currentTime=0;
  // 進度條鎖在終點
  document.getElementById('dev-bar-range').value = 2499;
  document.getElementById('dev-bar-fill').style.width = '100%';
  document.getElementById('dev-time-label').textContent = ROUND_DURATION+'s / '+ROUND_DURATION+'s';

  if(round >= MAX_ROUND){
    // 最後一關完成 → CLEAR
    document.getElementById('final-score').textContent=score;
    document.getElementById('final-rounds').textContent='恭喜完成全部 '+MAX_ROUND+' 關！';
    document.getElementById('fail-reason').textContent='';
    document.getElementById('result-icon').textContent='🏆';
    document.querySelector('#gameover-screen h2').textContent='CLEAR!';
    showScreen('gameover-screen');
  } else {
    // 無縫換關沒觸發（devMode 跳過蘋果）→ 傳統換關
    round++;
    rate = RATES[Math.min(round-1, RATES.length-1)];
    fruitSeqIdx = 0;
    lastPhaseIdx=-1; currentPhase=null; phaseTapped=false; currentLayout=null;
    lastAppleTapped=false; seamlessTriggered=false;
    updateHUD();
    startCountdown(true);
  }
}

// ── HUD ──
function updateHUD(){
  document.getElementById('score-display').textContent=score;
  document.getElementById('round-display').textContent='第 '+round+' 關';
  const labels={1:'1x',1.25:'1.25x',1.5:'1.5x'};
  document.getElementById('speed-badge').textContent=labels[rate]||rate+'x';
}

// ── dev bar ──
function initDevBar(){
  const range=document.getElementById('dev-bar-range');
  const fill =document.getElementById('dev-bar-fill');
  range.addEventListener('mousedown',  ()=>{ devBarDragging=true; });
  range.addEventListener('touchstart', ()=>{ devBarDragging=true; },{passive:true});
  range.addEventListener('input',()=>{
    const rawT=range.value/100;
    const pos=Math.min(rawT/ROUND_DURATION,1);
    fill.style.width=(pos*100)+'%';
    document.getElementById('dev-time-label').textContent=rawT.toFixed(2)+'s / '+ROUND_DURATION+'s';
  });
  function onRelease(){
    if(!devBarDragging) return;
    devBarDragging=false;
    if(!gameActive) return;
    const bgmT=range.value/100; // 直接是 bgm 時間
    bgm.currentTime=bgmT;
    lastPhaseIdx=-1;
    // 立刻觸發對應 phase
    let idx=-1;
    for(let i=0;i<TIMELINE.length;i++){
      if(bgmT>=TIMELINE[i].start && bgmT<TIMELINE[i].end){ idx=i; break; }
    }
    if(idx!==-1){
      lastPhaseIdx=idx;
      currentPhase=TIMELINE[idx];
      if(TIMELINE[idx].type==='king') enterKingPhase(false);
      else enterFruitPhase(TIMELINE[idx].fruit);
    }
  }
  range.addEventListener('mouseup',   onRelease);
  range.addEventListener('touchend',  onRelease);
  range.addEventListener('mouseleave',onRelease);
}
document.addEventListener('DOMContentLoaded', initDevBar);
